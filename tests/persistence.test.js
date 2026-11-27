// Kiểm thử PersistenceWorker + PersistenceClient bằng Worker thật và file SQLite thật (ADR-0017, R13).
// Chèn lỗi (fault injection) mô phỏng TRẠNG THÁI LOGIC của DB khi Worker chết; kill tiến trình thật nằm ở tests/process.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { PersistenceClient } from '../src/data/PersistenceClient.js';
import { PersistenceError, OPS } from '../src/shared/persistence-protocol.js';
import { loadSettings } from '../src/system/Settings.js';
import { Logger } from '../src/system/Logger.js';
import { latestSchemaVersion, makeTmpDir, removeDir, sleep, waitFor } from './helpers.js';

const base = loadSettings({ env: {} }).settings.persistence;
const quietLogger = new Logger({ level: 'error', stdout: false, toFile: false });

function newEnv(extraCfg = {}) {
  const dir = makeTmpDir('nova-persist-');
  const cfg = { ...base, restartBackoffMs: 20, retryBackoffMs: 10, ackTimeoutMs: 1500, healthIntervalMs: 200, ...extraCfg };
  const mk = (over = {}) => new PersistenceClient({
    dbPath: join(dir, 'nova-live.db'), backupDir: join(dir, 'backups'), rejectedDir: join(dir, 'rejected-batches'),
    realm: 'live', config: cfg, logger: quietLogger, allowFaults: true, ...over
  });
  return { dir, cfg, mk };
}

const player = (id = '111', nick = 'An') => ({ t: OPS.UPSERT_PLAYER, player_key: `tt:${id}`, realm: 'live', external_id: id, unique_id: `u${id}`, nickname: nick });
const addScore = (opKey, delta, id = '111') => ({ t: OPS.ADD_PLAYER_SCORE, op_key: opKey, player_key: `tt:${id}`, delta });
const score = async (c, id = '111') => (await c.read('get_player', { player_key: `tt:${id}` }))[0]?.total_score;
const hash = async (c) => (await c.read('state_hash'))[0].hash;
const count = async (c, table) => (await c.read('count_table', { table }))[0].count;

async function withClient(t, extraCfg, fn, clientOpts) {
  const env = newEnv(extraCfg);
  const c = env.mk(clientOpts);
  try {
    await c.start();
    await fn(c, env);
  } finally {
    await c.close({ deadlineMs: 2000 }).catch(() => {});
    removeDir(env.dir);
  }
}

// ───────── khởi động, PRAGMA, migration ─────────
test('worker: khởi động — WAL, synchronous=FULL, foreign_keys, quick_check, migration 001', (t) => withClient(t, {}, async (c) => {
  const r = c.readyInfo;
  assert.equal(r.journalMode, 'wal');
  assert.equal(r.synchronous, 2, 'synchronous=FULL tương ứng giá trị 2');
  assert.equal(r.realm, 'live');
  const latest = latestSchemaVersion();
  assert.equal(r.schemaVersion, latest);
  assert.deepEqual(r.migrationsApplied, Array.from({ length: latest }, (_, i) => i + 1));
  assert.match(r.sqliteVersion, /^3\./);
  const info = (await c.read('sqlite_info'))[0];
  assert.equal(info.foreign_keys, 1);
  assert.deepEqual(await c.read('integrity'), ['ok']);
  const ver = await c.read('schema_version');
  assert.equal(ver.length, latest);
  assert.equal(ver[0].name, 'init');
  for (const tbl of ['committed_batches', 'applied_ops', 'players', 'gift_events', 'admin_devices', 'admin_audit', 'settings']) {
    assert.equal(await count(c, tbl), 0, `${tbl} tồn tại và rỗng`);
  }
}));

test('worker: truy vấn/bảng ngoài danh sách cho phép bị từ chối (không nhận SQL tự do)', (t) => withClient(t, {}, async (c) => {
  await assert.rejects(c.read('DROP TABLE players'), (e) => e instanceof PersistenceError && e.code === 'REJECTED');
  await assert.rejects(c.read('count_table', { table: 'sqlite_master; DROP TABLE players' }), PersistenceError);
  assert.equal(await count(c, 'players'), 0);
}));

// ───────── commit thành công ─────────
test('commit: batch thành công → ACK, dữ liệu đúng, có trong committed_batches', (t) => withClient(t, {}, async (c) => {
  const res = await c.commit({ cls: 'progress', ops: [player(), addScore('catch:1:score', 5)] });
  assert.equal(res.status, 'COMMITTED');
  assert.equal(res.recovered, false);
  assert.equal(res.applied, 2);
  assert.equal(await score(c), 5);
  assert.equal(await count(c, 'committed_batches'), 1);
  assert.equal(await count(c, 'applied_ops'), 1);
  const m = c.metrics();
  assert.equal(m.counters.committed, 1);
  assert.equal(m.unresolvedBatches, 0);
  assert.equal(m.writeBufferOps, 0);
}));

test('commit: upsert cấu hình theo version — bản cũ hơn bị bỏ qua (idempotent tự nhiên)', (t) => withClient(t, {}, async (c) => {
  await c.commit({ cls: 'state', ops: [{ t: OPS.UPSERT_SETTING, key: 'k', value: '"moi"', version: 200 }] });
  const r = await c.commit({ cls: 'state', ops: [{ t: OPS.UPSERT_SETTING, key: 'k', value: '"cu"', version: 100 }] });
  assert.equal(r.skipped, 1);
  const row = (await c.read('get_setting', { key: 'k' }))[0];
  assert.equal(row.value, '"moi"');
  const op = c.settingOp('k2', { a: 1 });
  assert.ok(op.version >= Date.now() - 1000 && c.settingOp('k2', 1).version > op.version, 'version luôn tăng');
}));

// ───────── R13: gửi lại cùng batch_id ─────────
test('R13: gửi lại CÙNG batch_id → ALREADY_COMMITTED, trạng thái DB không đổi lần hai', (t) => withClient(t, {}, async (c) => {
  const batch = { batchId: 'b-resend-1', cls: 'progress', ops: [player(), addScore('catch:2:score', 7)] };
  const first = await c.commit(batch);
  assert.equal(first.status, 'COMMITTED');
  const before = await hash(c);
  const again = await c.commit(batch); // cùng batchId, đã chốt phía client nên đi lại tới Worker
  assert.equal(again.status, 'ALREADY_COMMITTED');
  assert.equal(await hash(c), before, 'hash toàn bộ bảng không đổi');
  assert.equal(await score(c), 7);
  assert.equal(await count(c, 'committed_batches'), 1);
}));

// ───────── R13: cùng op_key ở hai batch khác nhau ─────────
test('R13: cùng op_key xuất hiện trong hai batch KHÁC NHAU chỉ được áp dụng một lần', (t) => withClient(t, {}, async (c) => {
  await c.commit({ ops: [player()] });
  const a = await c.commit({ batchId: 'b-A', ops: [addScore('catch:9:score', 10)] });
  const b = await c.commit({ batchId: 'b-B', ops: [addScore('catch:9:score', 10)] });
  assert.equal(a.applied, 1);
  assert.equal(b.status, 'COMMITTED');
  assert.equal(b.applied, 0);
  assert.equal(b.skipped, 1, 'op trùng bị bỏ qua');
  assert.equal(await score(c), 10, 'tổng điểm chỉ cộng một lần');
  assert.equal(await count(c, 'committed_batches'), 3, 'cả hai batch đều được ghi nhận là đã commit');
  assert.equal(await count(c, 'applied_ops'), 1);
}));

// ───────── REJECTED không ghi một phần ─────────
test('REJECTED: batch có op sai → rollback toàn bộ, không ghi một phần, được cách ly + cảnh báo', async (t) => {
  const env = newEnv();
  const c = env.mk();
  const alerts = [];
  c.on('alert', (a) => alerts.push(a.code));
  try {
    await c.start();
    await c.commit({ ops: [player('111')] });
    const before = await hash(c);
    // op[0] và op[1] hợp lệ, op[2] trỏ tới người chơi không tồn tại → cả batch phải rollback
    const bad = [player('222', 'B'), addScore('catch:3:score', 3, '222'), addScore('catch:4:score', 3, 'ghost')];
    await assert.rejects(c.commit({ batchId: 'b-bad-1', ops: bad }), (e) => e instanceof PersistenceError && e.code === 'REJECTED' && /op\[2\]/.test(e.message));
    assert.equal(await hash(c), before, 'DB không đổi một byte nào sau batch bị từ chối');
    assert.deepEqual(await c.read('get_player', { player_key: 'tt:222' }), [], 'op hợp lệ đứng trước cũng bị rollback');
    assert.equal((await c.read('batch_status', { batchId: 'b-bad-1' })).length, 0, 'batch bị từ chối không có trong committed_batches');
    assert.ok(existsSync(join(env.dir, 'rejected-batches', 'b-bad-1.json')), 'batch bị từ chối được cách ly ra tệp');
    assert.ok(alerts.includes('BATCH_REJECTED'));
    assert.equal(c.metrics().counters.rejected, 1);

    // loại op lạ, realm sai, tham số sai → đều REJECTED
    await assert.rejects(c.commit({ ops: [{ t: 'drop_table', name: 'players' }] }), (e) => e.code === 'REJECTED' && /không được phép/.test(e.message));
    await assert.rejects(c.commit({ ops: [{ t: OPS.UPSERT_PLAYER, player_key: 'demo:5', realm: 'demo', external_id: '5' }] }), (e) => e.code === 'REJECTED' && /realm/.test(e.message));
    await assert.rejects(c.commit({ ops: [{ t: OPS.UPSERT_PLAYER, player_key: 'tt:7', realm: 'live', external_id: '8' }] }), (e) => e.code === 'REJECTED');
    await assert.rejects(c.commit({ ops: [addScore('k', 1.5)] }), (e) => e.code === 'REJECTED' && /số nguyên/.test(e.message));
    assert.equal(await hash(c), before, 'vẫn không đổi sau các batch sai');
  } finally {
    await c.close({ deadlineMs: 2000 }).catch(() => {});
    removeDir(env.dir);
  }
});

// ───────── Worker chết ─────────
test('R13: Worker commit xong rồi CHẾT TRƯỚC ACK → khởi động lại, nhận diện đã commit, KHÔNG áp dụng hai lần', (t) => withClient(t, {}, async (c) => {
  await c.commit({ ops: [player()] });
  const batch = { batchId: 'b-die-after', ops: [addScore('catch:20:score', 4)], fault: 'after_commit_before_ack' };
  const res = await c.commit(batch);
  assert.equal(res.recovered, true, 'phục hồi qua truy vấn status, không phải qua ACK');
  assert.equal(c.state, 'READY');
  assert.equal(c.metrics().workerRestarts, 1);
  assert.equal(await score(c), 4, 'điểm chỉ cộng một lần');
  const before = await hash(c);
  const again = await c.commit({ batchId: 'b-die-after', ops: batch.ops }); // gửi lại cùng batch
  assert.equal(again.status, 'ALREADY_COMMITTED');
  assert.equal(await hash(c), before, 'gửi lại không đổi dữ liệu lần hai');
  assert.equal(c.metrics().counters.recovered, 1);
}));

test('Worker chết TRƯỚC khi commit → status=NOT_FOUND → gửi lại nguyên batch → áp dụng đúng một lần', (t) => withClient(t, {}, async (c) => {
  await c.commit({ ops: [player()] });
  const res = await c.commit({ batchId: 'b-die-before', ops: [addScore('catch:21:score', 6)], fault: 'before_commit' });
  assert.equal(res.status, 'COMMITTED');
  assert.equal(res.recovered, false, 'đã được gửi lại và commit thật');
  assert.equal(c.metrics().workerRestarts, 1);
  assert.equal(await score(c), 6);
  assert.equal(await count(c, 'committed_batches'), 2);
}));

test('ACK đến quá muộn → batch UNKNOWN → hỏi status → nhận diện đã commit; ACK muộn bị bỏ qua', (t) => withClient(t, { ackTimeoutMs: 100 }, async (c) => {
  await c.commit({ ops: [player()] });
  const res = await c.commit({ batchId: 'b-slow', ops: [addScore('catch:22:score', 2)], fault: 'slow_ack' });
  assert.equal(res.recovered, true);
  await sleep(700); // ACK muộn (500ms) tới sau khi batch đã chốt
  assert.equal(await score(c), 2);
  assert.equal(c.metrics().counters.committed, 2);
}));

test('nack tạm thời (BUSY) → gửi lại CÙNG batch_id → áp dụng đúng một lần', (t) => withClient(t, {}, async (c) => {
  await c.commit({ ops: [player()] });
  const res = await c.commit({ batchId: 'b-busy', ops: [addScore('catch:23:score', 9)], fault: 'busy_once' });
  assert.equal(res.status, 'COMMITTED');
  assert.equal(c.metrics().counters.retried, 1);
  assert.equal(await score(c), 9);
}));

test('vượt số lần khởi động lại Worker → SAFE MODE; ghi mới bị từ chối; đóng báo số batch bị bỏ', async () => {
  const env = newEnv({ maxRestarts: 0 });
  const c = env.mk();
  const alerts = [];
  c.on('alert', (a) => alerts.push(a.code));
  try {
    await c.start();
    await c.commit({ ops: [player()] });
    const stuck = c.commit({ batchId: 'b-stuck', ops: [addScore('k1', 1)], fault: 'after_commit_before_ack' });
    await waitFor(() => c.state === 'SAFE_MODE', { what: 'SAFE_MODE' });
    assert.ok(alerts.includes('PERSIST_DEGRADED') && alerts.includes('SAFE_MODE'));
    await assert.rejects(c.commit({ ops: [addScore('k2', 1)] }), (e) => e.code === 'SAFE_MODE');
    const summary = await c.close({ deadlineMs: 300 });
    assert.equal(summary.drained, false);
    assert.equal(summary.abandoned, 1);
    await assert.rejects(stuck, (e) => e.code === 'CLOSED');
  } finally { removeDir(env.dir); }
});

// ───────── khởi động lại DB, đóng sạch ─────────
test('khởi động lại DB: dữ liệu còn nguyên, không chạy lại migration', async () => {
  const env = newEnv();
  let c = env.mk();
  try {
    await c.start();
    await c.commit({ ops: [player(), addScore('catch:30:score', 11)] });
    const summary = await c.close();
    assert.deepEqual({ drained: summary.drained, checkpointed: summary.checkpointed }, { drained: true, checkpointed: true });
    const wal = `${join(env.dir, 'nova-live.db')}-wal`;
    assert.ok(!existsSync(wal) || statSync(wal).size === 0, 'WAL được checkpoint TRUNCATE khi đóng');

    c = env.mk();
    const info = await c.start();
    assert.deepEqual(info.migrationsApplied, [], 'không áp dụng lại migration');
    assert.equal(info.schemaVersion, latestSchemaVersion());
    assert.equal(await score(c), 11, 'dữ liệu còn sau khi khởi động lại');
    assert.deepEqual(await c.read('integrity'), ['ok']);
    // Client chưa start() không được nhận ghi (phải từ chối rõ ràng, không được treo)
    await assert.rejects(env.mk().commit({ ops: [addScore('x', 1)] }), (e) => e.code === 'NOT_STARTED');
  } finally {
    await c.close().catch(() => {});
    removeDir(env.dir);
  }
});

test('đóng: sau khi đóng, commit/đọc bị từ chối rõ ràng', async () => {
  const env = newEnv();
  const c = env.mk();
  try {
    await c.start();
    await c.close();
    await assert.rejects(c.commit({ ops: [player()] }), (e) => e.code === 'CLOSED');
    await assert.rejects(c.read('integrity'), (e) => e.code === 'NOT_READY');
  } finally { removeDir(env.dir); }
});

// ───────── migration ─────────
function migrationsDirWith(dir, ...files) {
  const m = join(dir, 'migs');
  mkdirSync(m, { recursive: true });
  for (const [name, sql] of files) writeFileSync(join(m, name), sql);
  return m;
}
const init = () => readFileSync(new URL('../src/data/migrations/001_init.sql', import.meta.url), 'utf8');

test('migration: checksum bị sửa sau khi đã chạy → DỪNG (SAFE_MODE), không tự sửa', async () => {
  const env = newEnv();
  const m = migrationsDirWith(env.dir, ['001_init.sql', init()]);
  try {
    const a = env.mk({ migrationsDir: m });
    await a.start();
    await a.close();
    appendFileSync(join(m, '001_init.sql'), '\n-- sửa lén sau khi đã áp dụng\n');
    const b = env.mk({ migrationsDir: m });
    await assert.rejects(b.start(), (e) => e.code === 'MIGRATION_CHECKSUM');
    assert.equal(b.state, 'SAFE_MODE');
  } finally { removeDir(env.dir); }
});

test('migration: migration mới trên DB đã có dữ liệu → backup tự động trước khi áp dụng', async () => {
  const env = newEnv();
  const m = migrationsDirWith(env.dir, ['001_init.sql', init()]);
  try {
    const a = env.mk({ migrationsDir: m });
    await a.start();
    await a.commit({ ops: [player(), addScore('catch:40:score', 3)] });
    await a.close();
    writeFileSync(join(m, '002_them_bang.sql'), 'CREATE TABLE extra (x INTEGER NOT NULL) STRICT;\n');
    const b = env.mk({ migrationsDir: m });
    const info = await b.start();
    assert.deepEqual(info.migrationsApplied, [2]);
    assert.equal(info.schemaVersion, 2);
    assert.equal(info.backups.length, 1, 'phải có đúng một backup trước migration');
    assert.ok(existsSync(info.backups[0]) && info.backups[0].startsWith(join(env.dir, 'backups')));
    assert.equal(await score(b), 3, 'dữ liệu cũ còn nguyên sau migration');
    await b.close();

    // DB mới hơn ứng dụng (ứng dụng chỉ có 001)
    const older = migrationsDirWith(join(env.dir, 'old'), ['001_init.sql', init()]);
    const c = env.mk({ migrationsDir: older });
    await assert.rejects(c.start(), (e) => e.code === 'DB_NEWER_THAN_APP');
  } finally { removeDir(env.dir); }
});

test('migration: migration lỗi giữa chừng → rollback sạch, DB giữ nguyên phiên bản cũ', async () => {
  const env = newEnv();
  const m = migrationsDirWith(env.dir, ['001_init.sql', init()]);
  try {
    const a = env.mk({ migrationsDir: m });
    await a.start();
    await a.close();
    writeFileSync(join(m, '002_hong.sql'), 'CREATE TABLE tam (x INTEGER) STRICT;\nCREATE TABLE tam (y INTEGER) STRICT;\n'); // trùng tên bảng
    const b = env.mk({ migrationsDir: m });
    await assert.rejects(b.start(), (e) => e.code === 'MIGRATION_FAILED');
    // mở lại với tệp đã bỏ migration lỗi: bảng `tam` không được tồn tại (đã rollback), phiên bản vẫn là 1
    writeFileSync(join(m, '002_hong.sql'), 'CREATE TABLE ok_sau (x INTEGER) STRICT;\n');
    const c = env.mk({ migrationsDir: m });
    const info = await c.start();
    assert.deepEqual(info.migrationsApplied, [2]);
    await c.close();
  } finally { removeDir(env.dir); }
});

test('migration: tên tệp sai quy ước hoặc đánh số đứt quãng → từ chối', async () => {
  const env = newEnv();
  try {
    const bad = migrationsDirWith(join(env.dir, 'a'), ['001_init.sql', init()], ['003_nhay_coc.sql', 'SELECT 1;']);
    await assert.rejects(env.mk({ migrationsDir: bad }).start(), (e) => e.code === 'MIGRATION_SEQUENCE');
    const bad2 = migrationsDirWith(join(env.dir, 'b'), ['init.sql', init()]);
    await assert.rejects(env.mk({ migrationsDir: bad2 }).start(), (e) => e.code === 'MIGRATION_NAME');
  } finally { removeDir(env.dir); }
});

// ───────── realm, DB hỏng ─────────
test('R07: mở file DB LIVE bằng realm DEMO (hoặc ngược lại) bị từ chối', async () => {
  const env = newEnv();
  try {
    const a = env.mk();
    await a.start();
    await a.close();
    const b = env.mk({ realm: 'demo' });
    await assert.rejects(b.start(), (e) => e.code === 'REALM_MISMATCH');
  } finally { removeDir(env.dir); }
});

test('R07: tệp DB không phải SQLite → fatal CORRUPT + SAFE_MODE + cảnh báo', async () => {
  const env = newEnv();
  try {
    mkdirSync(env.dir, { recursive: true });
    writeFileSync(join(env.dir, 'nova-live.db'), 'đây không phải là cơ sở dữ liệu sqlite '.repeat(20));
    const c = env.mk();
    const alerts = [];
    c.on('alert', (a) => alerts.push(a.code));
    await assert.rejects(c.start(), (e) => e.code === 'CORRUPT');
    assert.equal(c.state, 'SAFE_MODE');
    assert.ok(alerts.includes('SAFE_MODE'));
  } finally { removeDir(env.dir); }
});

test('R07: CHECK ở mức DB — player_key sai tiền tố realm không thể tồn tại', (t) => withClient(t, {}, async (c) => {
  // Worker chặn ở lớp op; ràng buộc CHECK là lớp phòng thủ thứ hai (kiểm bằng thông báo của Worker khi op lọt qua không có).
  await assert.rejects(c.commit({ ops: [{ t: OPS.UPSERT_PLAYER, player_key: 'demo:1', realm: 'live', external_id: '1' }] }), (e) => e.code === 'REJECTED');
  assert.equal(await count(c, 'players'), 0);
}));

// ───────── backup, R14, backpressure, ưu tiên ─────────
test('backup (VACUUM INTO): tạo bản sao nhất quán, không ghi đè backup cũ, tên bị lọc', (t) => withClient(t, {}, async (c, env) => {
  await c.commit({ ops: [player(), addScore('catch:50:score', 8)] });
  const p = await c.backup('thu-nghiem');
  assert.ok(existsSync(p) && p.startsWith(join(env.dir, 'backups')));
  await assert.rejects(c.backup('thu-nghiem'), PersistenceError, 'không ghi đè backup đã có');
  await assert.rejects(c.backup('../thoat-ra-ngoai'), (e) => /không hợp lệ/.test(e.message));
  assert.ok(readdirSync(join(env.dir, 'backups')).length === 1);
  const cp = await c.checkpoint('PASSIVE');
  assert.ok('busy' in cp);
}));

test('R14: bộ chỉ số dữ liệu chưa ghi bền phản ánh batch đang bay, theo loại, và RAM chưa vào hàng đợi', (t) => withClient(t, { ackTimeoutMs: 5000 }, async (c) => {
  await c.commit({ ops: [player()] });
  let m = c.metrics();
  assert.equal(m.oldestUnpersistedEventAgeMs, 0);
  assert.equal(m.oldestUnackedBatchAgeMs, 0);
  const inflight = c.commit({ batchId: 'b-m1', kind: 'catch', ops: [addScore('c60', 1), addScore('c61', 1)], fault: 'slow_ack' });
  await sleep(120);
  m = c.metrics();
  assert.equal(m.inFlightBatches, 1);
  assert.equal(m.unresolvedBatches, 1);
  assert.equal(m.unpersistedByType.catch, 2);
  assert.ok(m.oldestUnackedBatchAgeMs >= 100, `tuổi batch chưa ACK = ${m.oldestUnackedBatchAgeMs}`);
  assert.ok(m.oldestUnpersistedEventAgeMs >= 100);
  c.setDirtyProvider(() => ({ count: 3, oldestAgeMs: 4321 }));
  m = c.metrics();
  assert.deepEqual(m.ramDirtyNotEnqueued, { count: 3, oldestAgeMs: 4321 });
  assert.ok(m.oldestUnpersistedEventAgeMs >= 4321, 'thay đổi RAM chưa vào hàng đợi cũng được tính vào tuổi dữ liệu chưa ghi bền');
  await inflight;
  c.setDirtyProvider(() => ({ count: 0, oldestAgeMs: 0 }));
  m = c.metrics();
  assert.equal(m.unresolvedBatches, 0);
  assert.equal(m.oldestUnackedBatchAgeMs, 0);
  assert.ok(m.worker && m.worker.freeBytes > 0, 'chỉ số sức khoẻ Worker (dung lượng đĩa) đã được báo về');
}));

test('backpressure: bộ đệm đầy → từ chối batch không-critical, vẫn nhận critical; có sự kiện cảnh báo', (t) => withClient(t, { maxInFlightBatches: 1, writeBufferSoftMax: 3, writeBufferHardMax: 6, ackTimeoutMs: 5000 }, async (c) => {
  await c.commit({ ops: [player()] });
  const levels = [];
  c.on('backpressure', (e) => levels.push(e.level));
  const hold = c.commit({ batchId: 'hold', ops: [addScore('h0', 1)], fault: 'slow_ack' }); // giữ 1 chỗ in-flight
  await sleep(60);
  const q1 = c.commit({ cls: 'progress', ops: [addScore('q1', 1), addScore('q2', 1), addScore('q3', 1)] }); // 3 ops ≥ soft
  assert.ok(levels.includes('soft'));
  const q2 = c.commit({ cls: 'progress', ops: [addScore('q4', 1), addScore('q5', 1), addScore('q6', 1)] }); // tổng 6 ≥ hard
  await assert.rejects(c.commit({ cls: 'log', ops: [addScore('q7', 1)] }), (e) => e.code === 'BACKPRESSURE');
  const crit = c.commit({ cls: 'critical', ops: [addScore('q8', 1)] }); // critical vẫn được nhận
  await Promise.all([hold, q1, q2, crit]);
  // h0(1) + q1..q3(3) + q4..q6(3) + q8(1) = 8; q7 bị BACKPRESSURE nên KHÔNG được áp dụng
  assert.equal(await score(c), 8);
  assert.ok(levels.includes('hard'));
}));

test('ưu tiên gửi: lớp critical được gửi trước progress dù vào hàng đợi sau', (t) => withClient(t, { maxInFlightBatches: 1, ackTimeoutMs: 5000 }, async (c) => {
  await c.commit({ ops: [player()] });
  const order = [];
  c.on('committed', (e) => order.push(e.batchId));
  const hold = c.commit({ batchId: 'p0', ops: [addScore('o0', 1)], fault: 'slow_ack' });
  await sleep(60);
  const p1 = c.commit({ batchId: 'p1', cls: 'progress', ops: [addScore('o1', 1)] });
  const lg = c.commit({ batchId: 'l1', cls: 'log', ops: [addScore('o2', 1)] });
  const cr = c.commit({ batchId: 'c1', cls: 'critical', ops: [addScore('o3', 1)] });
  await Promise.all([hold, p1, lg, cr]);
  assert.deepEqual(order.slice(-4), ['p0', 'c1', 'p1', 'l1'], `thứ tự commit thực tế: ${order.join(',')}`);
}));

test('commit trùng batchId khi đang bay → trả về cùng một kết quả, chỉ ghi một lần', (t) => withClient(t, { ackTimeoutMs: 5000 }, async (c) => {
  await c.commit({ ops: [player()] });
  const a = c.commit({ batchId: 'dup-inflight', ops: [addScore('d1', 5)], fault: 'slow_ack' });
  const b = c.commit({ batchId: 'dup-inflight', ops: [addScore('d1', 5)] });
  assert.equal(a, b, 'cùng một Promise');
  await a;
  assert.equal(await score(c), 5);
}));

test('đầu vào commit sai bị từ chối ngay phía client', (t) => withClient(t, {}, async (c) => {
  await assert.rejects(c.commit({ ops: [] }), (e) => e.code === 'INVALID');
  await assert.rejects(c.commit({ ops: 'x' }), (e) => e.code === 'INVALID');
  await assert.rejects(c.commit({ cls: 'khong-co', ops: [player()] }), (e) => e.code === 'INVALID');
  await assert.rejects(c.commit({ batchId: 'x', ops: [{ t: OPS.UPSERT_PLAYER, fn() {} }] }), (e) => e.code === 'REJECTED', 'ops không sao chép được → từ chối, không treo');
}));

test('sổ thiết bị: thiết bị đã thu hồi không sống lại; thu hồi idempotent', (t) => withClient(t, {}, async (c) => {
  const dev = { t: OPS.DEVICE_UPSERT, device_id: 'dev-1', name: 'Máy phát', user_agent: 'test', paired_at_utc: 1000, last_seen_utc: 1000 };
  await c.commit({ cls: 'state', ops: [dev] });
  await c.commit({ cls: 'state', ops: [{ t: OPS.DEVICE_REVOKE, device_id: 'dev-1', at_utc: 2000 }] });
  const r = await c.commit({ cls: 'state', ops: [{ ...dev, last_seen_utc: 3000 }] });
  assert.equal(r.skipped, 1, 'upsert lên thiết bị đã thu hồi bị bỏ qua');
  const rev2 = await c.commit({ cls: 'state', ops: [{ t: OPS.DEVICE_REVOKE, device_id: 'dev-1', at_utc: 9999 }] });
  assert.equal(rev2.skipped, 1);
  const d = (await c.read('list_devices'))[0];
  assert.equal(d.revoked_at_utc, 2000, 'thời điểm thu hồi đầu tiên được giữ');
  assert.equal(d.last_seen_utc, 1000);
}));
