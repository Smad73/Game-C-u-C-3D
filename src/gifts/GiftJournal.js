// GiftJournal — nhận quà, ghi bền, áp dụng hiệu ứng đúng một lần, công bố SAU khi commit (ADR-0018 quy trình 0.0.9, R09).
//
//  1 receive(ev): chuẩn hoá xong (Normalizer) → dedupe RAM → gom ≤ groupCommitMs → batch `critical`: GIFT_RECEIVE (INSERT OR IGNORE)
//  2 chờ ACK RECEIVED (trùng → dừng; REJECTED → dừng)
//  3 tính hiệu ứng: tất định trong Worker từ dòng journal đã lưu (không đọc RAM gameplay) — xem PersistenceWorker.giftApply
//  4 batch `critical`: GIFT_APPLY = hiệu ứng (sổ cái + tổng người chơi qua op_key) + APPLIED trong CÙNG transaction
//  5 CHỈ SAU ACK: publish → consumer (WorldCore ở Phase 3; Phase 2: GiftTotalsView) → rồi mới FX
//  Hiệu ứng đang chờ nằm trong pending (chỉ để đo), VÔ HÌNH với gameplay.
//
// Thang lưu trữ khi DB không ghi được (ADR-0019 R11): S1 DB → S2 file khẩn cấp (fsync theo nhóm) → S3 RAM có trần → S4 ngừng tiếp nhận ở 90%.
// KHÔNG tuyên bố exactly-once; bảo đảm G1–G3 của ADR-0018 và chỉ những gì test đã chứng minh (xem TEST_REPORT).
import { EventEmitter } from 'node:events';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { OPS } from '../shared/persistence-protocol.js';

export const DEFAULT_JOURNAL = Object.freeze({
  groupCommitMs: 50,
  maxBatchGifts: 800,
  maxGiftAttempts: 5,
  retryFailedMs: 2000,
  dedupeLruSize: 50000,
  publishedLruSize: 200000,
  emergency: { ramGiftsMax: 20000, haltRatio: 0.9, fsyncGroupMs: 50, s3RetryMs: 2000 }
});

/** Lỗi lưu trữ KHÔNG do dữ liệu (DB/Worker không ghi được) → đi thang khẩn cấp thay vì bỏ quà. */
const STORAGE_DOWN = new Set(['SAFE_MODE', 'CLOSED', 'NOT_STARTED', 'NOT_READY', 'FULL', 'IOERR', 'BUSY', 'CORRUPT', 'BACKPRESSURE']);

const safeJson = (s) => { try { return JSON.parse(s || '[]') || []; } catch { return []; } };

class Lru {
  constructor(max) { this.max = max; this.m = new Map(); }
  has(k) { return this.m.has(k); }
  add(k) { if (this.m.has(k)) this.m.delete(k); this.m.set(k, 1); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value); }
  get size() { return this.m.size; }
}

export class GiftJournal extends EventEmitter {
  /**
   * @param {{persistence:object, realm:'live'|'demo', logger:object, config?:object, emergencyDir:string,
   *          faults?:{point?:(name:string, ctx:object)=>void, workerFault?:(stage:'receive'|'apply')=>string|undefined}}} o
   *   faults: CHỈ dùng trong test (CR8/CR9) — mặc định không có.
   */
  constructor({ persistence, realm, logger, config = {}, emergencyDir, faults = null, effectResolver = null }) {
    super();
    // Gift Mapping: (ev) → { actions, baseCoins, baseXp, show, maxBuffMinutes } — CHỐT lúc nhận, lưu trong effect_params (ADR-0018 bước 1).
    this.effectResolver = effectResolver;
    this.p = persistence;
    this.realm = realm;
    this.log = logger;
    this.cfg = { ...DEFAULT_JOURNAL, ...config, emergency: { ...DEFAULT_JOURNAL.emergency, ...(config.emergency || {}) } };
    this.emergencyDir = emergencyDir;
    this.faults = faults;
    this.state = 'IDLE'; // IDLE | RESTORING | RUNNING | CLOSING | CLOSED | CRASHED(test)
    this.recvBuf = []; this.recvTimer = null;
    this.applyBuf = []; this.applyTimer = null;
    this.pending = new Map(); // gift_key → {stage, since} — PendingGiftEffects (chỉ đo, không cho gameplay)
    this.inflight = new Set();
    this.seen = new Lru(this.cfg.dedupeLruSize);
    this.published = new Lru(this.cfg.publishedLruSize);
    this.consumers = [];
    this.s2 = { fd: null, path: null, queue: [], timer: null, failed: false };
    this.s3 = []; // bộ đệm RAM khẩn cấp (KHÔNG bền)
    this.halted = false;
    this.retryTimer = null;
    this.recovering = null;
    this.c = { received: 0, duplicates: 0, rejectedAtReceive: 0, invalid: 0, applied: 0, appliedZero: 0, published: 0, failed: 0, dead: 0, s2: 0, s3: 0, lost: 0, replayed: 0, imported: 0, weakKeys: 0 };
    this.latency = []; // độ trễ nhận → công bố (ms), cửa sổ gần nhất
    this.onPersistState = ({ state }) => { if (state === 'READY' && (this.state === 'RUNNING' || this.state === 'RESTORING')) this.#resume(); };
    this.p.on?.('state', this.onPersistState);
  }

  /** Đăng ký consumer nhận hiệu ứng ĐÃ COMMIT (WorldCore ở Phase 3). */
  onCommittedGift(fn) { this.consumers.push(fn); }

  // ───────── vòng đời ─────────
  /** Phục hồi trước khi nhận quà mới (ADR-0018 "Phục hồi khi khởi động"): nhập file khẩn cấp → replay RECEIVED/FAILED. */
  async start() {
    this.state = 'RESTORING';
    const t0 = Date.now();
    await this.#importEmergencyFiles();
    const replayed = await this.recover();
    this.state = 'RUNNING';
    this.retryTimer = setInterval(() => { if (this.state === 'RUNNING' && !this.recovering) this.recover().catch(() => {}); }, this.cfg.retryFailedMs);
    this.retryTimer.unref?.();
    const ms = Date.now() - t0;
    this.log?.info?.('GiftJournal sẵn sàng', { replayed, restoreMs: ms });
    return { replayed, restoreMs: ms };
  }

  /** Replay mọi quà RECEIVED/FAILED trong DB (bước 3–5). Trả số quà đã đưa đi áp dụng. */
  recover() {
    if (this.recovering) return this.recovering;
    this.recovering = (async () => {
      let total = 0;
      for (let guard = 0; guard < 1000; guard++) {
        if (this.p.state !== 'READY') break;
        const rows = await this.p.read('gift_pending', { limit: 1000 });
        const todo = rows.filter((r) => !this.inflight.has(r.gift_key));
        if (!todo.length) break;
        total += todo.length;
        this.c.replayed += todo.length;
        await Promise.all(todo.map((r) => this.#applyOne(r.gift_key, { since: r.received_at_utc, attempts: r.attempts })));
        if (rows.length < 1000) break;
      }
      return total;
    })().finally(() => { this.recovering = null; });
    return this.recovering;
  }

  async close({ deadlineMs = 5000 } = {}) {
    if (this.state === 'CLOSED') return;
    this.state = 'CLOSING';
    clearInterval(this.retryTimer);
    clearInterval(this.s3Timer);
    this.p.off?.('state', this.onPersistState);
    const t0 = Date.now();
    this.#flushReceive();
    this.#flushApply();
    while ((this.inflight.size || this.recvBuf.length || this.applyBuf.length) && Date.now() - t0 < deadlineMs) {
      this.#flushReceive(); this.#flushApply();
      await new Promise((r) => setTimeout(r, 10));
    }
    this.#flushS2Sync();
    if (this.s2.fd !== null) { try { closeSync(this.s2.fd); } catch { /* bỏ qua */ } this.s2.fd = null; }
    this.state = 'CLOSED';
    return { unfinished: this.inflight.size, s3: this.s3.length };
  }

  /** CHỈ cho test: mô phỏng tiến trình chết tại một ranh giới — ngừng mọi xử lý, không flush, không publish. */
  crash() {
    this.state = 'CRASHED';
    clearTimeout(this.recvTimer); clearTimeout(this.applyTimer); clearInterval(this.retryTimer); clearTimeout(this.s2.timer); clearInterval(this.s3Timer);
    this.p.off?.('state', this.onPersistState);
  }
  #alive() { return this.state === 'RUNNING' || this.state === 'RESTORING' || this.state === 'CLOSING'; }
  #point(name, ctx) { if (this.faults?.point) this.faults.point(name, ctx); return this.#alive(); }

  // ───────── bước 1–2: nhận & ghi RECEIVED ─────────
  /**
   * @param {object} ev NovaEvent loại gift (đã chuẩn hoá). ev.live_session_id (tuỳ chọn) do pipeline gán.
   * @returns {Promise<{status:string, gift_key:string}>} RECEIVED | DUPLICATE | REJECTED | EMERGENCY_S2 | EMERGENCY_S3 | HALTED | LOST | INVALID
   */
  receive(ev) {
    const g = ev.payload;
    const key = g.gift_key;
    if (this.state !== 'RUNNING' && this.state !== 'RESTORING') return Promise.resolve({ status: 'HALTED', gift_key: key });
    if (this.seen.has(key)) { this.c.duplicates++; return Promise.resolve({ status: 'DUPLICATE', gift_key: key }); }
    this.seen.add(key);
    if (g.key_quality === 'WEAK') this.c.weakKeys++;
    const rec = this.#receiveRecord(ev);
    if (!this.#point('GB0', { gift_key: key })) return Promise.resolve({ status: 'LOST', gift_key: key }); // chết trước khi gửi RECEIVED
    return new Promise((resolve) => {
      const item = { rec, since: ev.received_at, resolve };
      this.pending.set(key, { stage: 'RECEIVING', since: ev.received_at });
      if (this.halted || this.p.state === 'SAFE_MODE' || this.p.state === 'CLOSED') return this.#emergency([item]);
      this.recvBuf.push(item);
      if (this.recvBuf.length >= this.cfg.maxBatchGifts) this.#flushReceive();
      else if (!this.recvTimer) this.recvTimer = setTimeout(() => this.#flushReceive(), this.cfg.groupCommitMs);
      return undefined;
    });
  }

  #receiveRecord(ev) {
    const g = ev.payload;
    const coin = Number.isSafeInteger(g.diamondCount) ? g.diamondCount : null;
    return {
      player: ev.player_key ? { t: OPS.UPSERT_PLAYER, player_key: ev.player_key, realm: ev.realm, external_id: ev.user.userId, unique_id: ev.user.uniqueId, nickname: ev.user.nickname } : null,
      op: {
        t: OPS.GIFT_RECEIVE, gift_key: g.gift_key, player_key: ev.player_key, key_mode: g.key_mode, key_quality: g.key_quality, streak_key: g.streak_key,
        status: g.applicable ? 'RECEIVED' : 'REJECTED', reason: g.reason, gift_id: g.giftId, gift_name: g.giftName, repeat_count: g.repeatCount,
        repeat_end: g.repeatEnd, quantity: g.quantity, coin_value: coin, source: ev.source, source_event_id: ev.source_event_id,
        // Mọi tham số phụ thuộc thời gian được CHỐT tại đây (ADR-0018 bước 1) → replay muộn vẫn tất định.
        effect_params: JSON.stringify(this.#effectParams(ev, coin)),
        received_at_utc: ev.received_at, occurred_at_utc: ev.occurred_at, live_session_id: ev.live_session_id ?? null, room_id: ev.room_id
      }
    };
  }

  #effectParams(ev, coin) {
    const g = ev.payload;
    const base = { v: 1, received_at_utc: ev.received_at, quantity: g.quantity, coin_value: coin, mode: g.key_mode };
    if (!this.effectResolver) return base;
    let extra = null;
    try { extra = this.effectResolver(ev); } catch (e) { this.log?.warn?.('Không tính được hành động quà (dùng kế toán quà thuần)', { error: e?.message }); }
    if (!extra) return base;
    const out = { ...base, v: 2, ...extra };
    // effect_params tối đa 4096 byte (Worker kiểm): cắt bớt hành động nếu quá dài thay vì làm hỏng quà.
    while (JSON.stringify(out).length > 4000 && out.actions?.length) out.actions = out.actions.slice(0, -1);
    return out;
  }

  #flushReceive() {
    clearTimeout(this.recvTimer); this.recvTimer = null;
    if (!this.recvBuf.length || !this.#alive()) return;
    const items = this.recvBuf.splice(0, this.cfg.maxBatchGifts);
    this.#commitReceive(items);
    if (this.recvBuf.length) this.recvTimer = setTimeout(() => this.#flushReceive(), 0);
  }

  async #commitReceive(items) {
    const players = new Map();
    for (const it of items) if (it.rec.player) players.set(it.rec.player.player_key, it.rec.player);
    const ops = [...players.values(), ...items.map((it) => it.rec.op)];
    for (const it of items) this.inflight.add(it.rec.op.gift_key);
    let res;
    try {
      res = await this.p.commit({ cls: 'critical', kind: 'giftReceived', ops, fault: this.faults?.workerFault?.('receive') });
    } catch (e) {
      for (const it of items) this.inflight.delete(it.rec.op.gift_key);
      if (!this.#alive()) return;
      if (e.code === 'REJECTED' || e.code === 'INVALID') {
        if (items.length > 1) { for (const it of items) this.#commitReceive([it]); return; } // tách để một quà lỗi không kéo cả nhóm
        this.c.invalid++;
        this.pending.delete(items[0].rec.op.gift_key);
        this.log?.warn?.('Quà không ghi được vào journal (dữ liệu bị từ chối)', { gift_key: items[0].rec.op.gift_key, code: e.code, message: e.message });
        this.emit('gift-invalid', { gift_key: items[0].rec.op.gift_key, message: e.message });
        return items[0].resolve({ status: 'INVALID', gift_key: items[0].rec.op.gift_key });
      }
      if (STORAGE_DOWN.has(e.code) || e.exhausted) return this.#emergency(items);
      this.log?.error?.('Lỗi ghi RECEIVED không phân loại được — chuyển đường khẩn cấp', { code: e.code, message: e.message });
      return this.#emergency(items);
    }
    if (!this.#alive()) return;
    // results null = batch được nhận diện đã commit (mất ACK) → hỏi DB theo khoá, không đoán (ADR-0017 R13).
    const byKey = new Map();
    if (res.results) {
      for (const r of res.results) if (r.t === OPS.GIFT_RECEIVE) byKey.set(r.gift_key, r);
    } else {
      for (const row of await this.p.read('gift_rows', { keys: items.map((i) => i.rec.op.gift_key) })) byKey.set(row.gift_key, { inserted: true, status: row.status, recovered: true });
    }
    for (const it of items) {
      const key = it.rec.op.gift_key;
      const r = byKey.get(key);
      this.inflight.delete(key);
      if (!r) { this.c.lost++; this.pending.delete(key); it.resolve({ status: 'LOST', gift_key: key }); continue; }
      if (!r.inserted) { this.c.duplicates++; this.pending.delete(key); it.resolve({ status: 'DUPLICATE', gift_key: key }); continue; }
      if (r.status === 'REJECTED') { this.c.rejectedAtReceive++; this.pending.delete(key); it.resolve({ status: 'REJECTED', gift_key: key }); continue; }
      this.c.received++;
      it.resolve({ status: 'RECEIVED', gift_key: key });
      if (!this.#point('GB3', { gift_key: key })) return; // chết sau ACK RECEIVED, trước khi tính hiệu ứng
      if (r.status === 'APPLIED') continue; // (khôi phục) đã áp dụng ở lần trước
      this.#applyOne(key, { since: it.since });
    }
  }

  // ───────── bước 3–5: áp dụng & công bố ─────────
  #applyOne(giftKey, { since = Date.now(), attempts = 0 } = {}) {
    if (this.inflight.has(giftKey)) return Promise.resolve();
    this.inflight.add(giftKey);
    this.pending.set(giftKey, { stage: 'APPLYING', since });
    return new Promise((resolve) => {
      this.applyBuf.push({ gift_key: giftKey, since, attempts, resolve });
      if (this.applyBuf.length >= this.cfg.maxBatchGifts) this.#flushApply();
      else if (!this.applyTimer) this.applyTimer = setTimeout(() => this.#flushApply(), this.cfg.groupCommitMs);
    });
  }

  #flushApply() {
    clearTimeout(this.applyTimer); this.applyTimer = null;
    if (!this.applyBuf.length || !this.#alive()) return;
    const items = this.applyBuf.splice(0, this.cfg.maxBatchGifts);
    this.#commitApply(items);
    if (this.applyBuf.length) this.applyTimer = setTimeout(() => this.#flushApply(), 0);
  }

  async #commitApply(items) {
    const done = (it) => { this.inflight.delete(it.gift_key); it.resolve(); };
    let res;
    try {
      res = await this.p.commit({ cls: 'critical', kind: 'giftEffect', ops: items.map((it) => ({ t: OPS.GIFT_APPLY, gift_key: it.gift_key })), fault: this.faults?.workerFault?.('apply') });
    } catch (e) {
      if (!this.#alive()) return;
      if (e.code === 'REJECTED' && items.length > 1) { for (const it of items) { this.inflight.delete(it.gift_key); } for (const it of items) this.#applyOne(it.gift_key, it).then(it.resolve); return; }
      if (e.code === 'REJECTED') return this.#markFailed(items[0], e).finally(() => done(items[0]));
      // Lưu trữ không sẵn sàng: quà vẫn RECEIVED trong DB → replay khi Worker sẵn sàng lại (G2). Không công bố gì.
      this.log?.warn?.('Chưa áp dụng được hiệu ứng quà (sẽ replay khi lưu trữ sẵn sàng)', { count: items.length, code: e.code });
      for (const it of items) { this.pending.set(it.gift_key, { stage: 'WAIT_REPLAY', since: it.since }); done(it); }
      return;
    }
    if (!this.#alive()) return;
    let results = res.results?.filter((r) => r.t === OPS.GIFT_APPLY);
    if (!results) { // batch đã commit nhưng mất ACK (GB8) → đọc kết quả THẬT từ DB theo gift_key
      const rows = await this.p.read('gift_rows', { keys: items.map((i) => i.gift_key) });
      results = rows.map((r) => ({ gift_key: r.gift_key, outcome: r.status === 'APPLIED' ? 'APPLIED' : r.status, qty: r.applied_qty ?? 0, coins: r.applied_coins ?? 0, player_key: r.player_key, gift_id: r.gift_id, gift_name: r.gift_name, live_session_id: r.live_session_id, effects: safeJson(r.applied_effects), recovered: true }));
    }
    const sinceOf = new Map(items.map((i) => [i.gift_key, i.since]));
    for (const r of results) {
      if (r.outcome === 'APPLIED') {
        this.c.applied++;
        if (!r.qty) this.c.appliedZero++;
        if (!this.#point('GB6', { gift_key: r.gift_key })) return; // ACK xong, chết trước publish
        this.#publish(r, sinceOf.get(r.gift_key));
        if (!this.#point('GB7', { gift_key: r.gift_key })) return; // đã công bố, chết trước/giữa FX
      }
      this.pending.delete(r.gift_key);
    }
    for (const it of items) done(it);
  }

  async #markFailed(it, err) {
    const dead = it.attempts + 1 >= this.cfg.maxGiftAttempts;
    try {
      await this.p.commit({ cls: 'critical', kind: 'giftEffect', ops: [{ t: OPS.GIFT_MARK, gift_key: it.gift_key, status: dead ? 'DEAD' : 'FAILED', reason: 'APPLY_ERROR', error: String(err.message).slice(0, 500) }] });
    } catch (e) {
      this.log?.error?.('Không đánh dấu được quà lỗi', { gift_key: it.gift_key, code: e.code });
      return;
    }
    this.pending.delete(it.gift_key);
    if (dead) {
      this.c.dead++;
      this.emit('alert', { code: 'GIFT_DEAD', level: 'critical', message: `Một quà không áp dụng được sau ${this.cfg.maxGiftAttempts} lần (DEAD) — cần xử lý tay. ${String(err.message).slice(0, 120)}` });
    } else this.c.failed++;
  }

  #publish(r, since) {
    if (this.published.has(r.gift_key)) return; // công bố RAM đúng một lần trong tiến trình
    this.published.add(r.gift_key);
    if (!r.qty) return; // streak đến muộn / không tăng: không có hiệu ứng để công bố
    this.c.published++;
    if (Number.isFinite(since)) { this.latency.push(Date.now() - since); if (this.latency.length > 5000) this.latency.splice(0, 1000); }
    const msg = { gift_key: r.gift_key, player_key: r.player_key, gift_id: r.gift_id, gift_name: r.gift_name ?? null, qty: r.qty, coins: r.coins, live_session_id: r.live_session_id ?? null, effects: r.effects ?? [] };
    for (const fn of this.consumers) {
      try { fn(msg); } catch (e) { this.log?.error?.('Consumer quà đã commit ném lỗi (bỏ qua, không ảnh hưởng DB)', { error: e?.message }); }
    }
    this.emit('committed-gift', msg);
  }

  // ───────── thang lưu trữ khẩn cấp S2 → S3 → S4 (ADR-0019 R11) ─────────
  #emergency(items) {
    if (!this.s2.failed) {
      try {
        if (this.faults?.s2Fail?.()) throw new Error('chèn lỗi thử nghiệm: tệp khẩn cấp không ghi được');
        if (this.s2.fd === null) {
          mkdirSync(this.emergencyDir, { recursive: true });
          this.s2.path = join(this.emergencyDir, `emergency-gifts-${Date.now()}.jsonl`);
          this.s2.fd = openSync(this.s2.path, 'a');
          this.emit('alert', { code: 'SAFE_MODE', level: 'critical', message: 'Không ghi được DB: quà đang được lưu vào tệp khẩn cấp (sẽ nhập lại khi DB hoạt động).' });
        }
        for (const it of items) this.s2.queue.push(it);
        if (!this.s2.timer) this.s2.timer = setTimeout(() => this.#flushS2(), this.cfg.emergency.fsyncGroupMs);
        return;
      } catch (e) {
        this.#s2Failed(e);
      }
    }
    this.#toS3(items);
  }

  #flushS2() {
    this.s2.timer = null;
    const batch = this.s2.queue.splice(0);
    if (!batch.length) return;
    try {
      if (this.faults?.s2Fail?.()) throw new Error('chèn lỗi thử nghiệm: fsync tệp khẩn cấp thất bại');
      writeSync(this.s2.fd, batch.map((it) => JSON.stringify({ v: 1, player: it.rec.player, op: it.rec.op })).join('\n') + '\n');
      fsyncSync(this.s2.fd); // bền chỉ khi fsync thành công
      for (const it of batch) {
        this.c.s2++;
        this.inflight.delete(it.rec.op.gift_key);
        this.pending.set(it.rec.op.gift_key, { stage: 'S2_FILE', since: it.since });
        it.resolve({ status: 'EMERGENCY_S2', gift_key: it.rec.op.gift_key });
      }
    } catch (e) {
      this.#s2Failed(e);
      this.#toS3(batch);
    }
  }
  #flushS2Sync() { if (this.s2.queue.length && this.s2.fd !== null) this.#flushS2(); }

  #s2Failed(e) {
    if (this.s2.failed) return;
    this.s2.failed = true;
    this.log?.error?.('Tệp quà khẩn cấp không ghi được — quà chỉ còn trong bộ nhớ', { error: e?.message });
  }

  #toS3(items) {
    const max = this.cfg.emergency.ramGiftsMax;
    for (const it of items) {
      const key = it.rec.op.gift_key;
      this.inflight.delete(key);
      if (this.s3.length >= max) { // không bao giờ nên xảy ra: S4 ngắt ở 90%
        this.c.lost++;
        this.pending.delete(key);
        this.log?.error?.('MẤT QUÀ: bộ đệm RAM khẩn cấp đầy', { gift_key: key });
        it.resolve({ status: 'LOST', gift_key: key });
        continue;
      }
      this.s3.push(it.rec);
      this.c.s3++;
      this.pending.set(key, { stage: 'S3_RAM', since: it.since });
      it.resolve({ status: 'EMERGENCY_S3', gift_key: key });
    }
    this.emit('alert', { code: 'GIFT_AT_RISK', level: 'critical', message: `Đang giữ ${this.s3.length} quà CHỈ trong bộ nhớ — sẽ MẤT nếu game tắt hoặc sập. Giải phóng ổ đĩa / khôi phục DB ngay.` });
    if (!this.s3Timer) this.s3Timer = setInterval(() => this.#retryS3ToS2(), this.cfg.emergency.s3RetryMs ?? 2000);
    if (!this.halted && this.s3.length >= Math.floor(max * this.cfg.emergency.haltRatio)) {
      this.halted = true;
      this.emit('alert', { code: 'INGEST_HALTED', level: 'critical', message: 'Đã NGỪNG nhận sự kiện (bộ đệm quà khẩn cấp đạt 90%). Quà gửi sau thời điểm này không đến được game. Khôi phục lưu trữ rồi bấm Kết nối lại.' });
      this.emit('halt', { reason: 'S3_90', s3: this.s3.length, max });
    }
  }

  /** S3 (RAM) → S2 (tệp, fsync) ngay khi tệp ghi được lại — không phụ thuộc DB. */
  #retryS3ToS2() {
    if (!this.s3.length) { clearInterval(this.s3Timer); this.s3Timer = null; return; }
    if (!this.#alive()) return;
    let fd = null;
    try {
      if (this.faults?.s2Fail?.()) throw new Error('chèn lỗi thử nghiệm: tệp khẩn cấp vẫn không ghi được');
      mkdirSync(this.emergencyDir, { recursive: true });
      const path = join(this.emergencyDir, `emergency-gifts-${Date.now()}.jsonl`);
      fd = openSync(path, 'a');
      const recs = this.s3.slice();
      writeSync(fd, recs.map((r) => JSON.stringify({ v: 1, player: r.player, op: r.op })).join('\n') + '\n');
      fsyncSync(fd);
      closeSync(fd); fd = null;
      this.s3.splice(0, recs.length);
      for (const r of recs) this.pending.set(r.op.gift_key, { stage: 'S2_FILE', since: this.pending.get(r.op.gift_key)?.since ?? Date.now() });
      this.s2.failed = false;
      this.log?.warn?.('Đã chuyển quà từ bộ nhớ sang tệp khẩn cấp (bền)', { gifts: recs.length, file: path });
      this.emit('alert-clear', { code: 'GIFT_AT_RISK' });
      if (this.halted) { this.halted = false; this.emit('resume'); } // cho phép người vận hành bấm Kết nối lại (KHÔNG tự nối)
      clearInterval(this.s3Timer); this.s3Timer = null;
    } catch (e) {
      if (fd !== null) { try { closeSync(fd); } catch { /* bỏ qua */ } }
    }
  }

  /** Lưu trữ sẵn sàng lại: xả S3 → journal, nhập tệp S2, rồi replay. Không tự nối lại TikTok (người vận hành bấm Kết nối). */
  async #resume() {
    if (this.resuming) return;
    this.resuming = true;
    try {
      this.#flushS2Sync();
      if (this.s3.length) {
        const recs = this.s3.splice(0);
        await this.#importRecords(recs);
        if (!this.s3.length) this.emit('alert-clear', { code: 'GIFT_AT_RISK' });
      }
      if (this.s2.fd !== null) { try { closeSync(this.s2.fd); } catch { /* bỏ qua */ } this.s2.fd = null; this.s2.failed = false; }
      await this.#importEmergencyFiles();
      if (this.halted && !this.s3.length) { this.halted = false; this.emit('alert-clear', { code: 'INGEST_HALTED' }); this.emit('resume'); }
      this.emit('alert-clear', { code: 'SAFE_MODE' });
      await this.recover();
    } catch (e) {
      this.log?.warn?.('Chưa xả được quà khẩn cấp', { error: e?.message });
    } finally { this.resuming = false; }
  }

  async #importRecords(recs) {
    for (let i = 0; i < recs.length; i += this.cfg.maxBatchGifts) {
      const chunk = recs.slice(i, i + this.cfg.maxBatchGifts);
      const players = new Map();
      for (const r of chunk) if (r.player) players.set(r.player.player_key, r.player);
      try {
        await this.p.commit({ cls: 'critical', kind: 'giftReceived', ops: [...players.values(), ...chunk.map((r) => r.op)] });
        this.c.imported += chunk.length;
        for (const r of chunk) this.pending.delete(r.op.gift_key);
      } catch (e) {
        this.s3.unshift(...recs.slice(i)); // giữ lại để lần sau
        throw e;
      }
    }
  }

  async #importEmergencyFiles() {
    if (!this.emergencyDir || !existsSync(this.emergencyDir)) return;
    const files = readdirSync(this.emergencyDir).filter((f) => /^emergency-gifts-\d+\.jsonl$/.test(f)).sort();
    for (const f of files) {
      const path = join(this.emergencyDir, f);
      if (path === this.s2.path && this.s2.fd !== null) continue; // tệp đang ghi
      const recs = [];
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { const j = JSON.parse(line); if (j?.op?.t === OPS.GIFT_RECEIVE) recs.push({ player: j.player ?? null, op: j.op }); } catch { /* dòng cuối ghi dở khi chết → bỏ, đã cảnh báo trong log */ }
      }
      await this.#importRecords(recs); // INSERT OR IGNORE theo gift_key → idempotent
      renameSync(path, `${path}.imported`); // không xoá: giữ để đối soát
      this.log?.info?.('Đã nhập tệp quà khẩn cấp vào journal', { file: f, gifts: recs.length });
    }
  }

  // ───────── số đo ─────────
  metrics() {
    let oldest = null;
    const byStage = {};
    for (const v of this.pending.values()) { byStage[v.stage] = (byStage[v.stage] || 0) + 1; if (oldest === null || v.since < oldest) oldest = v.since; }
    const lat = [...this.latency].sort((a, b) => a - b);
    const q = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : null);
    return {
      state: this.state, halted: this.halted, pending: this.pending.size, pendingByStage: byStage,
      oldestPendingAgeMs: oldest === null ? 0 : Date.now() - oldest, s3RamGifts: this.s3.length, s2File: this.s2.path,
      counters: { ...this.c }, latencyMs: { p50: q(0.5), p95: q(0.95), max: lat.at(-1) ?? null, n: lat.length }
    };
  }

  /** Cho PersistenceClient.setDirtyProvider (R14): quà đã nhận nhưng CHƯA ghi bền RECEIVED. */
  unpersisted() {
    let n = 0; let oldest = null;
    for (const v of this.pending.values()) if (v.stage === 'RECEIVING' || v.stage === 'S3_RAM') { n++; if (oldest === null || v.since < oldest) oldest = v.since; }
    return { count: n, oldestAgeMs: oldest === null ? 0 : Date.now() - oldest };
  }
}
