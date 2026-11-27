// PersistenceWorker — luồng DUY NHẤT sở hữu kết nối ghi SQLite (ADR-0017). Chạy trong worker_threads.
// Mọi thao tác DB của ứng dụng đi qua đây. Mỗi batch là một transaction BEGIN IMMEDIATE…COMMIT: tất cả hoặc không.
// Idempotency hai lớp (R13) nằm TRONG transaction: committed_batches (batch) + applied_ops (op).
import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, statSync, statfsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { runMigrations, MigrationError } from './migrate.js';
import { createGameOps } from './gameOps.js';
import { BATCH_CLASSES, FROM_WORKER as OUT, LIMITS, NACK_CODES, OPS, TO_WORKER as IN } from '../shared/persistence-protocol.js';

if (!parentPort) throw new Error('PersistenceWorker phải chạy trong worker_threads.');

const here = dirname(fileURLToPath(import.meta.url));
const cfg = {
  dbPath: workerData.dbPath,
  backupDir: workerData.backupDir,
  realm: workerData.realm,
  migrationsDir: workerData.migrationsDir || join(here, 'migrations'),
  busyTimeoutMs: workerData.busyTimeoutMs ?? 5000,
  healthIntervalMs: workerData.healthIntervalMs ?? 5000,
  // Chèn lỗi chỉ hoạt động khi test bật cờ này (ADR-0018 CR8/CR9). Mặc định TẮT.
  allowFaults: workerData.allowFaults === true
};

class OpError extends Error {
  constructor(code, message) { super(message); this.name = 'OpError'; this.code = code; }
}

const post = (m) => parentPort.postMessage(m);
const nowMs = () => Date.now();

let db = null;
let healthTimer = null;
let lastCommitMs = 0;
let commits = 0;
const seenFaults = new Set();
const stmtCache = new Map();

function prep(sql) {
  let s = stmtCache.get(sql);
  if (!s) { s = db.prepare(sql); stmtCache.set(sql, s); }
  return s;
}

// ───────── Phân loại lỗi (mã chính SQLite = errcode & 0xff, đã kiểm bằng thực nghiệm) ─────────
function classify(e) {
  if (e instanceof OpError) return { code: NACK_CODES.REJECTED, retryable: false, message: e.message };
  const primary = Number.isInteger(e?.errcode) ? e.errcode & 0xff : null;
  switch (primary) {
    case 5: case 6: return { code: NACK_CODES.BUSY, retryable: true, message: e.message };
    case 10: return { code: NACK_CODES.IOERR, retryable: true, message: e.message };
    case 13: return { code: NACK_CODES.FULL, retryable: true, message: e.message };
    case 11: case 26: return { code: NACK_CODES.CORRUPT, retryable: false, message: e.message };
    case 19: return { code: NACK_CODES.REJECTED, retryable: false, message: e.message };
    default: return { code: NACK_CODES.INTERNAL, retryable: false, message: e?.message || String(e) };
  }
}

// ───────── Kiểm tra tham số của op ─────────
function str(op, k, { max = 256, optional = false } = {}) {
  const v = op[k];
  if (v === undefined || v === null) { if (optional) return null; throw new OpError('OP_INVALID', `thiếu trường ${k}`); }
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new OpError('OP_INVALID', `${k} phải là chuỗi 1..${max} ký tự`);
  return v;
}
function int(op, k, { min = -2147483648, max = 2147483647 } = {}) {
  const v = op[k];
  if (!Number.isSafeInteger(v) || v < min || v > max) throw new OpError('OP_INVALID', `${k} phải là số nguyên trong [${min}, ${max}]`);
  return v;
}

const game = createGameOps({ prep, str, int, OpError, realm: cfg.realm });

/** Áp dụng một op trong transaction đang mở. Trả 'applied' | 'skipped'. */
function applyOp(op, batchId, ctx) {
  if (!op || typeof op !== 'object') throw new OpError('OP_INVALID', 'op không phải đối tượng');
  switch (op.t) {
    case OPS.UPSERT_SETTING: {
      const r = prep(`INSERT INTO settings (key, value, version, updated_at_utc) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, version = excluded.version, updated_at_utc = excluded.updated_at_utc
        WHERE excluded.version > settings.version`)
        .run(str(op, 'key', { max: 128 }), str(op, 'value', { max: 65536 }), int(op, 'version', { min: 0, max: Number.MAX_SAFE_INTEGER }), ctx.now);
      return r.changes > 0 ? 'applied' : 'skipped'; // bản cũ hơn → bỏ qua, idempotent
    }
    case OPS.UPSERT_PLAYER: {
      const realm = str(op, 'realm', { max: 8 });
      if (realm !== cfg.realm) throw new OpError('REALM_MISMATCH', `player realm "${realm}" khác realm của DB đang mở "${cfg.realm}"`);
      const externalId = str(op, 'external_id', { max: 64 });
      const key = str(op, 'player_key', { max: 80 });
      const expected = `${realm === 'live' ? 'tt' : 'demo'}:${externalId}`;
      if (key !== expected) throw new OpError('OP_INVALID', `player_key phải là ${expected}`);
      prep(`INSERT INTO players (player_key, realm, external_id, unique_id, nickname, first_seen_utc, last_seen_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_key) DO UPDATE SET unique_id = COALESCE(excluded.unique_id, players.unique_id),
          nickname = COALESCE(excluded.nickname, players.nickname), last_seen_utc = excluded.last_seen_utc`)
        .run(key, realm, externalId, str(op, 'unique_id', { max: 64, optional: true }), str(op, 'nickname', { max: 128, optional: true }), ctx.now, ctx.now);
      return 'applied';
    }
    case OPS.ADD_PLAYER_SCORE: {
      const opKey = str(op, 'op_key', { max: 160 });
      const delta = int(op, 'delta', { min: -1000000000, max: 1000000000 });
      // Lớp op (R13): chỉ cộng khi chèn được op_key lần đầu.
      const ins = prep('INSERT OR IGNORE INTO applied_ops (op_key, batch_id, at_utc) VALUES (?, ?, ?)').run(opKey, batchId, ctx.now);
      if (ins.changes === 0) return 'skipped';
      const up = prep('UPDATE players SET total_score = total_score + ? WHERE player_key = ?').run(delta, str(op, 'player_key', { max: 80 }));
      if (up.changes === 0) throw new OpError('PLAYER_NOT_FOUND', `không có người chơi ${op.player_key} (rollback cả batch)`);
      return 'applied';
    }
    case OPS.DEVICE_UPSERT: {
      const r = prep(`INSERT INTO admin_devices (device_id, name, user_agent, paired_at_utc, last_seen_utc) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET last_seen_utc = excluded.last_seen_utc, name = excluded.name
        WHERE admin_devices.revoked_at_utc IS NULL`) // thiết bị đã thu hồi không được "sống lại"
        .run(str(op, 'device_id', { max: 64 }), str(op, 'name', { max: 80 }), str(op, 'user_agent', { max: 300, optional: true }), int(op, 'paired_at_utc', { min: 0, max: Number.MAX_SAFE_INTEGER }), int(op, 'last_seen_utc', { min: 0, max: Number.MAX_SAFE_INTEGER }));
      return r.changes > 0 ? 'applied' : 'skipped';
    }
    case OPS.DEVICE_REVOKE: {
      const r = prep('UPDATE admin_devices SET revoked_at_utc = ? WHERE device_id = ? AND revoked_at_utc IS NULL')
        .run(int(op, 'at_utc', { min: 0, max: Number.MAX_SAFE_INTEGER }), str(op, 'device_id', { max: 64 }));
      return r.changes > 0 ? 'applied' : 'skipped';
    }
    case OPS.DEVICE_REVOKE_ALL: {
      const r = prep('UPDATE admin_devices SET revoked_at_utc = ? WHERE revoked_at_utc IS NULL').run(int(op, 'at_utc', { min: 0, max: Number.MAX_SAFE_INTEGER }));
      return r.changes > 0 ? 'applied' : 'skipped';
    }
    case OPS.AUDIT_INSERT: {
      const r = prep('INSERT OR IGNORE INTO admin_audit (audit_id, at_utc, device_id, ip, action, detail, result) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(str(op, 'audit_id', { max: 64 }), int(op, 'at_utc', { min: 0, max: Number.MAX_SAFE_INTEGER }), str(op, 'device_id', { max: 64, optional: true }), str(op, 'ip', { max: 64, optional: true }), str(op, 'action', { max: 80 }), str(op, 'detail', { max: 1000, optional: true }), str(op, 'result', { max: 40 }));
      return r.changes > 0 ? 'applied' : 'skipped';
    }
    case OPS.GIFT_RECEIVE: return giftReceive(op, ctx);
    case OPS.GIFT_APPLY: return giftApply(op, batchId, ctx);
    case OPS.GIFT_MARK: return giftMark(op, ctx);
    case OPS.SESSION_OPEN: {
      const status = str(op, 'status', { max: 12 });
      if (status !== 'ACTIVE' && status !== 'RECOVERING') throw new OpError('OP_INVALID', 'status phiên mở phải là ACTIVE|RECOVERING');
      const r = prep(`INSERT OR IGNORE INTO live_sessions (session_id, username, room_id, source, status, started_at_utc, last_event_at_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(str(op, 'session_id', { max: 64 }), str(op, 'username', { max: 64, optional: true }), str(op, 'room_id', { max: 64, optional: true }),
        str(op, 'source', { max: 16 }), status, int(op, 'started_at_utc', { min: 0, max: Number.MAX_SAFE_INTEGER }), int(op, 'started_at_utc', { min: 0, max: Number.MAX_SAFE_INTEGER }));
      ctx.results.push({ t: op.t, session_id: op.session_id, inserted: r.changes > 0 });
      return r.changes > 0 ? 'applied' : 'skipped';
    }
    case OPS.SESSION_UPDATE: {
      const status = str(op, 'status', { max: 12 });
      if (!['ACTIVE', 'RECOVERING', 'ENDED'].includes(status)) throw new OpError('OP_INVALID', 'status phiên không hợp lệ');
      const endReason = str(op, 'end_reason', { max: 16, optional: true });
      // Phiên đã ENDED không được "sống lại" (idempotent, không ghi đè trạng thái kết thúc).
      const r = prep(`UPDATE live_sessions SET status = ?, ended_at_utc = COALESCE(?, ended_at_utc), end_reason = COALESCE(?, end_reason),
        last_event_at_utc = MAX(COALESCE(last_event_at_utc, 0), COALESCE(?, 0)) WHERE session_id = ? AND status <> 'ENDED'`)
        .run(status, op.ended_at_utc ?? null, endReason, op.last_event_at_utc ?? null, str(op, 'session_id', { max: 64 }));
      return r.changes > 0 ? 'applied' : 'skipped';
    }
    default: {
      const r = game.apply(op, batchId, ctx);
      if (r !== undefined) return r;
      throw new OpError('OP_UNKNOWN', `loại op không được phép: ${String(op.t).slice(0, 40)}`);
    }
  }
}

// ───────── GiftJournal (ADR-0018) — chạy TRONG transaction của batch ─────────
const optInt = (op, k, o) => (op[k] === undefined || op[k] === null ? null : int(op, k, o));
const BIG = { min: 0, max: Number.MAX_SAFE_INTEGER };

function checkRealmKey(playerKey) {
  if (playerKey === null) return;
  const want = cfg.realm === 'live' ? 'tt:' : 'demo:';
  if (!playerKey.startsWith(want)) throw new OpError('REALM_MISMATCH', `player_key "${playerKey.slice(0, 20)}" không thuộc realm "${cfg.realm}" của DB đang mở`);
}

function giftReceive(op, ctx) {
  const giftKey = str(op, 'gift_key', { max: 200 });
  const playerKey = str(op, 'player_key', { max: 80, optional: true });
  checkRealmKey(playerKey);
  const mode = str(op, 'key_mode', { max: 1 });
  if (!['M', 'S', 'H'].includes(mode)) throw new OpError('OP_INVALID', 'key_mode phải là M|S|H');
  const status = str(op, 'status', { max: 10 });
  if (status !== 'RECEIVED' && status !== 'REJECTED') throw new OpError('OP_INVALID', 'status nhận quà phải là RECEIVED|REJECTED');
  const quality = str(op, 'key_quality', { max: 6 });
  if (quality !== 'STRONG' && quality !== 'WEAK') throw new OpError('OP_INVALID', 'key_quality phải là STRONG|WEAK');
  if (mode === 'S' && !op.streak_key) throw new OpError('OP_INVALID', 'quà streak (S) phải có streak_key');
  const r = prep(`INSERT OR IGNORE INTO gift_events (gift_key, player_key, gift_id, repeat_count, quantity, coin_value, effect_params, status,
      received_at_utc, key_quality, source, source_event_id, key_mode, streak_key, repeat_end, gift_name, live_session_id, room_id, occurred_at_utc, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    giftKey, playerKey, optInt(op, 'gift_id', BIG), optInt(op, 'repeat_count', { min: 0, max: 1000000 }), int(op, 'quantity', { min: 0, max: 1000000 }),
    optInt(op, 'coin_value', { min: 0, max: 100000000 }), str(op, 'effect_params', { max: 4096 }), status, int(op, 'received_at_utc', BIG), quality,
    str(op, 'source', { max: 16 }), str(op, 'source_event_id', { max: 128, optional: true }), mode, str(op, 'streak_key', { max: 200, optional: true }),
    op.repeat_end ? 1 : 0, str(op, 'gift_name', { max: 128, optional: true }), str(op, 'live_session_id', { max: 64, optional: true }),
    str(op, 'room_id', { max: 64, optional: true }), optInt(op, 'occurred_at_utc', BIG), str(op, 'reason', { max: 64, optional: true }));
  let existing = null;
  if (r.changes === 0) existing = prep('SELECT status FROM gift_events WHERE gift_key = ?').get(giftKey)?.status ?? null;
  ctx.results.push({ t: op.t, gift_key: giftKey, inserted: r.changes > 0, status: r.changes > 0 ? status : existing });
  return r.changes > 0 ? 'applied' : 'skipped';
}

/** Áp dụng hiệu ứng (kế toán quà) + APPLIED trong cùng transaction. Mọi tham số đọc từ dòng journal đã lưu → replay tất định. */
function giftApply(op, batchId, ctx) {
  const giftKey = str(op, 'gift_key', { max: 200 });
  const g = prep(`SELECT gift_key, player_key, gift_id, repeat_count, quantity, coin_value, status, key_mode, streak_key, repeat_end, live_session_id, effect_params, gift_name
    FROM gift_events WHERE gift_key = ?`).get(giftKey);
  let effects = [];
  const out = (outcome, qty = 0, coins = 0) => {
    ctx.results.push({ t: op.t, gift_key: giftKey, outcome, qty, coins, player_key: g?.player_key ?? null, gift_id: g?.gift_id ?? null, gift_name: g?.gift_name ?? null, live_session_id: g?.live_session_id ?? null, effects });
    return outcome === 'APPLIED' ? 'applied' : 'skipped';
  };
  if (!g) return out('NOT_FOUND');
  if (g.status === 'APPLIED') return out('ALREADY'); // lớp nghiệp vụ: không áp dụng hai lần
  if (g.status !== 'RECEIVED' && g.status !== 'FAILED') return out('NOT_APPLICABLE');
  if (!g.player_key) throw new OpError('NO_PLAYER', `quà ${giftKey.slice(0, 40)} không có player_key`);
  let qty = g.quantity;
  if (g.key_mode === 'S') {
    // Streak: chỉ cộng phần tăng so với mốc lớn nhất đã áp dụng (ADR-0018). Sự kiện đến muộn/sai thứ tự → delta 0.
    const cur = prep('SELECT max_count FROM gift_streaks WHERE streak_key = ?').get(g.streak_key);
    const prevMax = cur ? cur.max_count : 0;
    qty = Math.max(0, (g.repeat_count ?? 0) - prevMax);
    prep(`INSERT INTO gift_streaks (streak_key, player_key, gift_id, max_count, ended, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(streak_key) DO UPDATE SET max_count = MAX(gift_streaks.max_count, excluded.max_count),
        ended = MAX(gift_streaks.ended, excluded.ended), updated_at_utc = excluded.updated_at_utc`)
      .run(g.streak_key, g.player_key, g.gift_id, Math.max(prevMax, g.repeat_count ?? 0), g.repeat_end ? 1 : 0, ctx.now);
  }
  const coins = qty * (g.coin_value ?? 0);
  if (qty > 0) {
    const led = prep(`INSERT OR IGNORE INTO gift_ledger (source_key, effect_seq, player_key, gift_id, quantity, coins, live_session_id, at_utc)
      VALUES (?, 0, ?, ?, ?, ?, ?, ?)`).run(giftKey, g.player_key, g.gift_id, qty, coins, g.live_session_id, ctx.now);
    // Lớp op (R13): tổng người chơi chỉ cộng khi chèn được op_key lần đầu.
    const ins = prep('INSERT OR IGNORE INTO applied_ops (op_key, batch_id, at_utc) VALUES (?, ?, ?)').run(`gift:${giftKey}:totals`, batchId, ctx.now);
    if (led.changes === 1 && ins.changes === 1) {
      const up = prep('UPDATE players SET gift_coins_total = gift_coins_total + ?, gift_count_total = gift_count_total + ? WHERE player_key = ?').run(coins, qty, g.player_key);
      if (up.changes === 0) throw new OpError('PLAYER_NOT_FOUND', `không có người chơi ${g.player_key}`);
    } else if (led.changes !== ins.changes) {
      throw new OpError('GIFT_INCONSISTENT', `sổ cái và applied_ops lệch cho ${giftKey.slice(0, 40)} (rollback)`);
    }
  }
  // Hiệu ứng gameplay (XP, xu, buff, sự kiện, điểm) — CÙNG transaction với APPLIED; tham số từ effect_params đã chốt lúc nhận.
  if (qty > 0) {
    let params = null;
    try { params = JSON.parse(g.effect_params); } catch { params = null; }
    effects = game.giftEffects(g, params, qty, batchId, ctx);
  }
  prep("UPDATE gift_events SET status = 'APPLIED', applied_at_utc = ?, applied_qty = ?, applied_coins = ?, applied_effects = ?, last_error = NULL WHERE gift_key = ?")
    .run(ctx.now, qty, coins, JSON.stringify(effects), giftKey);
  return out('APPLIED', qty, coins);
}

function giftMark(op, ctx) {
  const giftKey = str(op, 'gift_key', { max: 200 });
  const status = str(op, 'status', { max: 10 });
  if (!['FAILED', 'DEAD', 'REJECTED'].includes(status)) throw new OpError('OP_INVALID', 'status đánh dấu phải là FAILED|DEAD|REJECTED');
  const r = prep(`UPDATE gift_events SET status = ?, attempts = attempts + ?, reason = COALESCE(?, reason), last_error = ?
    WHERE gift_key = ? AND status IN ('RECEIVED', 'FAILED')`)
    .run(status, status === 'FAILED' ? 1 : 0, str(op, 'reason', { max: 64, optional: true }), str(op, 'error', { max: 500, optional: true }), giftKey);
  const row = prep('SELECT status, attempts FROM gift_events WHERE gift_key = ?').get(giftKey);
  ctx.results.push({ t: op.t, gift_key: giftKey, changed: r.changes > 0, status: row?.status ?? null, attempts: row?.attempts ?? 0 });
  return r.changes > 0 ? 'applied' : 'skipped';
}

function validateBatch(m) {
  if (typeof m.batchId !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(m.batchId)) return `batchId không hợp lệ (1..${LIMITS.MAX_BATCH_ID_LEN} ký tự [A-Za-z0-9_.:-])`;
  if (!BATCH_CLASSES.includes(m.cls)) return `lớp batch không hợp lệ: ${String(m.cls).slice(0, 20)}`;
  if (!Array.isArray(m.ops) || m.ops.length === 0 || m.ops.length > LIMITS.MAX_OPS_PER_BATCH) return `ops phải là mảng 1..${LIMITS.MAX_OPS_PER_BATCH} phần tử`;
  return null;
}

// Mô phỏng Worker chết đột ngột (chỉ khi test bật allowFaults). Đóng DB rồi dừng luồng Worker:
// phản ánh đúng TRẠNG THÁI LOGIC của DB tại thời điểm đó; kill tiến trình thật được kiểm ở tests/process.test.js.
function die(why) {
  try { db?.close(); } catch { /* bỏ qua */ }
  process.exit(86 + (why === 'after_commit_before_ack' ? 1 : 0));
}

// ───────── Commit ─────────
function onCommit(m) {
  const invalid = validateBatch(m);
  if (invalid) return post({ type: OUT.NACK, batchId: m.batchId ?? null, code: NACK_CODES.REJECTED, retryable: false, message: invalid });

  if (cfg.allowFaults && (m.fault === 'busy_once' || m.fault === 'ioerr_once') && !seenFaults.has(`${m.fault}:${m.batchId}`)) {
    seenFaults.add(`${m.fault}:${m.batchId}`);
    return post({ type: OUT.NACK, batchId: m.batchId, code: m.fault === 'busy_once' ? NACK_CODES.BUSY : NACK_CODES.IOERR, retryable: true, message: `chèn lỗi thử nghiệm ${m.fault}` });
  }

  if (cfg.allowFaults && m.fault === 'reject') { // dữ liệu bị từ chối một cách tất định (test nhánh FAILED → DEAD)
    return post({ type: OUT.NACK, batchId: m.batchId, code: NACK_CODES.REJECTED, retryable: false, message: 'chèn lỗi thử nghiệm: op bị từ chối' });
  }

  const t0 = performance.now();
  let applied = 0;
  let skipped = 0;
  try {
    db.exec('BEGIN IMMEDIATE');
    // Lớp batch: kiểm TRONG transaction, nên hai lần gửi liên tiếp không thể cùng thành công.
    const dup = prep('SELECT committed_at_utc FROM committed_batches WHERE batch_id = ?').get(m.batchId);
    if (dup) {
      db.exec('ROLLBACK');
      return post({ type: OUT.ACK, batchId: m.batchId, status: 'ALREADY_COMMITTED', committedAtUtc: dup.committed_at_utc, applied: 0, skipped: m.ops.length });
    }
    const ctx = { now: nowMs(), results: [] };
    m.ops.forEach((op, i) => {
      try {
        applyOp(op, m.batchId, ctx) === 'applied' ? applied++ : skipped++;
      } catch (e) {
        e.opIndex = i;
        throw e;
      }
    });
    const checksum = createHash('sha256').update(JSON.stringify(m.ops)).digest('hex');
    prep('INSERT INTO committed_batches (batch_id, committed_at_utc, op_count, checksum) VALUES (?, ?, ?, ?)').run(m.batchId, ctx.now, m.ops.length, checksum);
    if (cfg.allowFaults && m.fault === 'before_commit') die('before_commit');
    db.exec('COMMIT');
    lastCommitMs = Math.round((performance.now() - t0) * 100) / 100;
    commits++;
    if (cfg.allowFaults && m.fault === 'after_commit_before_ack') die('after_commit_before_ack');
    if (cfg.allowFaults && m.fault === 'slow_ack') { // đã commit, nhưng ACK đến rất muộn (test nhánh UNKNOWN do hết thời gian chờ)
      const late = { type: OUT.ACK, batchId: m.batchId, status: 'COMMITTED', committedAtUtc: ctx.now, applied, skipped, commitMs: lastCommitMs, results: ctx.results };
      setTimeout(() => { if (db) post(late); }, 500);
      return undefined;
    }
    return post({ type: OUT.ACK, batchId: m.batchId, status: 'COMMITTED', committedAtUtc: ctx.now, applied, skipped, commitMs: lastCommitMs, results: ctx.results });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* chưa có transaction mở */ }
    const c = classify(e);
    return post({ type: OUT.NACK, batchId: m.batchId, code: c.code, retryable: c.retryable, message: e.opIndex !== undefined ? `op[${e.opIndex}]: ${c.message}` : c.message });
  }
}

// ───────── Đọc (truy vấn có tên, không nhận SQL tự do) ─────────
const HASH_TABLES = ['settings', 'players', 'applied_ops', 'committed_batches', 'gift_events', 'gift_streaks', 'gift_ledger', 'live_sessions', 'admin_devices', 'admin_audit',
  'player_equipment', 'fishdex', 'player_achievements', 'catches', 'score_ledger', 'leaderboard_scores', 'player_buffs', 'world_events', 'world_event_contrib', 'player_daily'];
const COUNT_TABLES = new Set([...HASH_TABLES, 'schema_migrations']);

const QUERIES = {
  ...game.queries,
  schema_version: () => prep('SELECT version, name, checksum FROM schema_migrations ORDER BY version').all(),
  sqlite_info: () => [{
    sqlite_version: prep('SELECT sqlite_version() AS v').get().v,
    journal_mode: prep('PRAGMA journal_mode').get().journal_mode,
    synchronous: prep('PRAGMA synchronous').get().synchronous,
    foreign_keys: prep('PRAGMA foreign_keys').get().foreign_keys,
    realm: prep("SELECT value FROM db_meta WHERE key = 'realm'").get()?.value
  }],
  integrity: () => prep('PRAGMA quick_check').all().map((r) => r.quick_check),
  get_player: (p) => prep('SELECT * FROM players WHERE player_key = ?').all(String(p.player_key)),
  get_setting: (p) => prep('SELECT key, value, version FROM settings WHERE key = ?').all(String(p.key)),
  list_devices: () => prep('SELECT device_id, name, user_agent, paired_at_utc, last_seen_utc, revoked_at_utc FROM admin_devices ORDER BY paired_at_utc, device_id').all(),
  batch_status: (p) => prep('SELECT batch_id, committed_at_utc, op_count FROM committed_batches WHERE batch_id = ?').all(String(p.batchId)),
  // ── Phase 2: GiftJournal & buổi LIVE ──
  gift_pending: (p) => prep(`SELECT gift_key, status, attempts, received_at_utc FROM gift_events WHERE status IN ('RECEIVED', 'FAILED')
    ORDER BY received_at_utc, gift_event_id LIMIT ?`).all(Math.min(Math.max(Number(p.limit) | 0, 1), 5000)),
  gift_rows: (p) => {
    const keys = Array.isArray(p.keys) ? p.keys.slice(0, 500).map(String) : [];
    if (!keys.length) return [];
    return prep(`SELECT gift_key, player_key, gift_id, gift_name, status, applied_qty, applied_coins, applied_effects, attempts, key_mode, key_quality, live_session_id, reason
      FROM gift_events WHERE gift_key IN (${keys.map(() => '?').join(',')})`).all(...keys);
  },
  gift_keys_since: (p) => prep('SELECT gift_key, status, received_at_utc FROM gift_events WHERE received_at_utc >= ? ORDER BY received_at_utc LIMIT 500000').all(Number(p.sinceUtc) || 0),
  gift_status_counts: () => prep('SELECT status, COUNT(*) AS n FROM gift_events GROUP BY status ORDER BY status').all(),
  gift_totals: () => prep('SELECT player_key, gift_coins_total, gift_count_total FROM players WHERE gift_count_total > 0 OR gift_coins_total > 0 ORDER BY player_key').all(),
  // Bất biến ADR-0018/0022: I1 (không áp dụng hai lần), I2 (không treo), I3 (điểm từ quà khớp).
  gift_invariants: () => [{
    ledgerDupSources: prep('SELECT COUNT(*) AS c FROM (SELECT source_key FROM gift_ledger GROUP BY source_key HAVING COUNT(*) > 1)').get().c,
    ledgerRows: prep('SELECT COUNT(*) AS c FROM gift_ledger').get().c,
    ledgerQty: prep('SELECT COALESCE(SUM(quantity), 0) AS c FROM gift_ledger').get().c,
    ledgerCoins: prep('SELECT COALESCE(SUM(coins), 0) AS c FROM gift_ledger').get().c,
    appliedWithQty: prep("SELECT COUNT(*) AS c FROM gift_events WHERE status = 'APPLIED' AND applied_qty > 0").get().c,
    appliedQty: prep("SELECT COALESCE(SUM(applied_qty), 0) AS c FROM gift_events WHERE status = 'APPLIED'").get().c,
    appliedCoins: prep("SELECT COALESCE(SUM(applied_coins), 0) AS c FROM gift_events WHERE status = 'APPLIED'").get().c,
    playerQty: prep('SELECT COALESCE(SUM(gift_count_total), 0) AS c FROM players').get().c,
    playerCoins: prep('SELECT COALESCE(SUM(gift_coins_total), 0) AS c FROM players').get().c,
    totalsOps: prep("SELECT COUNT(*) AS c FROM applied_ops WHERE op_key LIKE 'gift:%:totals'").get().c,
    ledgerWithoutApplied: prep("SELECT COUNT(*) AS c FROM gift_ledger l JOIN gift_events g ON g.gift_key = l.source_key WHERE g.status <> 'APPLIED'").get().c,
    pending: prep("SELECT COUNT(*) AS c FROM gift_events WHERE status IN ('RECEIVED', 'FAILED')").get().c
  }],
  live_session_latest: () => prep(`SELECT * FROM live_sessions WHERE status IN ('ACTIVE', 'RECOVERING') ORDER BY started_at_utc DESC LIMIT 1`).all(),
  live_session_by_room: (p) => prep('SELECT * FROM live_sessions WHERE room_id = ?').all(String(p.room_id)),
  list_live_sessions: () => prep('SELECT * FROM live_sessions ORDER BY started_at_utc, session_id').all(),
  count_table: (p) => {
    if (!COUNT_TABLES.has(p.table)) throw new OpError('OP_INVALID', 'bảng không được phép');
    return [{ count: db.prepare(`SELECT COUNT(*) AS c FROM ${p.table}`).get().c }];
  },
  state_hash: () => {
    const h = createHash('sha256');
    for (const t of HASH_TABLES) h.update(`${t}:${JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all())};`);
    return [{ hash: h.digest('hex') }];
  }
};

function onRead(m) {
  try {
    const q = QUERIES[m.query];
    if (!q) throw new OpError('OP_UNKNOWN', `truy vấn không được phép: ${String(m.query).slice(0, 40)}`);
    post({ type: OUT.RESULT, reqId: m.reqId, ok: true, rows: q(m.params || {}) });
  } catch (e) {
    post({ type: OUT.RESULT, reqId: m.reqId, ok: false, code: classify(e).code, message: e.message });
  }
}

function onBackup(m) {
  try {
    if (typeof m.name !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(m.name)) throw new OpError('OP_INVALID', 'tên backup không hợp lệ');
    mkdirSync(cfg.backupDir, { recursive: true });
    const path = join(cfg.backupDir, `${m.name}.db`);
    db.prepare('VACUUM INTO ?').run(path); // lỗi nếu tệp đã tồn tại → không ghi đè backup cũ
    post({ type: OUT.RESULT, reqId: m.reqId, ok: true, rows: [{ path }] });
  } catch (e) {
    post({ type: OUT.RESULT, reqId: m.reqId, ok: false, code: classify(e).code, message: e.message });
  }
}

function onCheckpoint(m) {
  try {
    const mode = m.mode === 'TRUNCATE' ? 'TRUNCATE' : 'PASSIVE';
    const r = db.prepare(`PRAGMA wal_checkpoint(${mode})`).get();
    post({ type: OUT.RESULT, reqId: m.reqId, ok: true, rows: [r] });
  } catch (e) {
    post({ type: OUT.RESULT, reqId: m.reqId, ok: false, code: classify(e).code, message: e.message });
  }
}

function sendHealth() {
  let walBytes = 0;
  try { walBytes = statSync(`${cfg.dbPath}-wal`).size; } catch { /* chưa có WAL */ }
  let freeBytes = null;
  try { const s = statfsSync(dirname(cfg.dbPath)); freeBytes = Number(s.bavail) * Number(s.bsize); } catch { /* không đo được */ }
  post({ type: OUT.HEALTH, atUtc: nowMs(), walBytes, freeBytes, lastCommitMs, commits });
}

function onShutdown() {
  clearInterval(healthTimer);
  let checkpointed = false;
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); checkpointed = true; } catch { /* vẫn đóng */ }
  try { db.close(); } catch { /* đã đóng */ }
  db = null;
  post({ type: OUT.CLOSED, checkpointed });
  parentPort.close();
}

// ───────── Khởi động ─────────
function start() {
  mkdirSync(dirname(cfg.dbPath), { recursive: true });
  db = new DatabaseSync(cfg.dbPath);
  const jm = db.prepare('PRAGMA journal_mode=WAL').get().journal_mode;
  if (jm !== 'wal') throw new MigrationError('WAL_UNAVAILABLE', `Không bật được chế độ WAL (journal_mode=${jm}). Ổ đĩa/hệ thống tệp có thể không hỗ trợ.`);
  db.exec(`PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=${Number(cfg.busyTimeoutMs) | 0}`);

  const qc = db.prepare('PRAGMA quick_check').all().map((r) => r.quick_check);
  if (qc.length !== 1 || qc[0] !== 'ok') throw new MigrationError('CORRUPT', `quick_check thất bại: ${qc.slice(0, 3).join('; ')}`);

  const mig = runMigrations(db, { dir: cfg.migrationsDir, backupDir: cfg.backupDir });

  // R07: realm của file DB phải khớp realm được yêu cầu.
  const row = db.prepare("SELECT value FROM db_meta WHERE key = 'realm'").get();
  if (!row) db.prepare("INSERT INTO db_meta (key, value) VALUES ('realm', ?)").run(cfg.realm);
  else if (row.value !== cfg.realm) throw new MigrationError('REALM_MISMATCH', `File DB thuộc realm "${row.value}" nhưng được mở với realm "${cfg.realm}".`);

  healthTimer = setInterval(sendHealth, cfg.healthIntervalMs);
  healthTimer.unref();
  const info = QUERIES.sqlite_info()[0];
  post({ type: OUT.READY, nodeVersion: process.version, sqliteVersion: info.sqlite_version, journalMode: info.journal_mode, synchronous: info.synchronous, realm: cfg.realm, schemaVersion: mig.currentVersion, migrationsApplied: mig.applied, backups: mig.backups });
  sendHealth();
}

try {
  start();
} catch (e) {
  post({ type: OUT.FATAL, code: e instanceof MigrationError ? e.code : classify(e).code, message: e.message });
  try { db?.close(); } catch { /* bỏ qua */ }
  parentPort.close();
}

parentPort.on('message', (m) => {
  if (!db) return;
  switch (m?.type) {
    case IN.COMMIT: return onCommit(m);
    case IN.READ: return onRead(m);
    case IN.STATUS: return post({ type: OUT.BATCH_STATUS, batchId: m.batchId, state: prep('SELECT 1 FROM committed_batches WHERE batch_id = ?').get(String(m.batchId)) ? 'COMMITTED' : 'NOT_FOUND' });
    case IN.BACKUP: return onBackup(m);
    case IN.CHECKPOINT: return onCheckpoint(m);
    case IN.SHUTDOWN: return onShutdown();
    default: return undefined;
  }
});
