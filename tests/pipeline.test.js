// Phase 2 — Module 07 (hàng đợi/backpressure), thang lưu trữ S1–S4 (CR10), LiveSessionManager, đường ống đầy đủ, ráp vào app (DEMO).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GiftJournal } from '../src/gifts/GiftJournal.js';
import { GiftTotalsView } from '../src/gifts/GiftTotalsView.js';
import { IngestPipeline } from '../src/ingest/IngestPipeline.js';
import { LiveConnector, mapLibraryEvent } from '../src/ingest/LiveConnector.js';
import { LiveSessionManager } from '../src/ingest/LiveSessionManager.js';
import { MockConnector } from '../src/ingest/MockConnector.js';
import { normalize } from '../src/ingest/Normalizer.js';
import { PriorityEventQueue } from '../src/ingest/PriorityEventQueue.js';
import { evaluateOverload } from '../src/ops/OverloadController.js';
import { loadSettings } from '../src/system/Settings.js';
import { Logger } from '../src/system/Logger.js';
import { makePersistence, makeTmpDir, removeDir, sleep, waitFor } from './helpers.js';

const quiet = new Logger({ level: 'error', stdout: false, toFile: false });
const fast = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 40, jitter: 0 };
let n = 0;
const ev = (type, o = {}) => normalize({ type, msgId: `q${++n}`, user: { userId: o.user ?? '1' }, comment: 'hi', likeCount: o.likes ?? 1, ...o.raw }, { receivedAt: Date.now(), source: 'mock', realm: 'demo' });
const giftEv = (msgId, userId = '1') => normalize({ type: 'gift', msgId, user: { userId }, giftId: 1, giftType: 2, diamondCount: 1, repeatCount: 1 }, { receivedAt: Date.now(), source: 'mock', realm: 'demo' });

// ───────── Module 07: hàng đợi ─────────
test('hàng đợi: ưu tiên critical → progress → state; like gộp theo người chơi (đếm), không mất số like', () => {
  const q = new PriorityEventQueue();
  q.push(ev('like', { likes: 3 }));
  q.push(ev('like', { likes: 4 }));
  q.push(ev('chat'));
  q.push(normalize({ type: 'streamEnd' }, { receivedAt: Date.now(), source: 'mock', realm: 'demo' }));
  const out = q.drain(10);
  assert.deepEqual(out.map((e) => e.event_type), ['stream_end', 'comment', 'like']);
  assert.equal(out[2].payload.count, 7, 'gộp like cộng dồn số like');
  assert.equal(q.metrics().counters.coalesced, 1);
});

test('hàng đợi đầy: progress bỏ MỚI NHẤT, state bỏ CŨ NHẤT — đều đếm; critical không bao giờ bỏ', () => {
  const q = new PriorityEventQueue({ progressMax: 3, stateMax: 2, criticalSoftMax: 1 });
  const r = [1, 2, 3, 4, 5].map((i) => q.push(ev('chat', { user: String(i) })));
  assert.deepEqual(r, ['queued', 'queued', 'queued', 'dropped', 'dropped']);
  for (const u of ['a', 'b', 'c']) q.push(ev('follow', { user: u }));
  for (let i = 0; i < 5; i++) q.push(normalize({ type: 'streamEnd' }, { receivedAt: Date.now(), source: 'mock', realm: 'demo' }));
  const m = q.metrics();
  assert.equal(m.counters.dropped.progress, 2);
  assert.equal(m.counters.dropped.state, 1);
  assert.equal(m.counters.dropped.critical, 0);
  assert.equal(m.classes.critical.depth, 5, 'critical vượt softMax vẫn giữ (chỉ cảnh báo)');
  assert.deepEqual(q.drain(100).filter((e) => e.event_type === 'follow').map((e) => e.user.userId), ['b', 'c']);
});

test('quá tải: tốc độ sự kiện/ hàng đợi > 50% → L2 + QUEUE_HIGH; quà chờ lâu → L3/L4; INGEST_HALT → L4; hết lý do → xoá cảnh báo', () => {
  const { settings } = loadSettings({ env: {} });
  const base = { persist: null, persistState: 'READY' };
  const q = (d) => ({ classes: { progress: { depth: d, max: 100 }, state: { depth: 0, max: 100 }, critical: { depth: 0, max: 10 } } });
  const ev1 = evaluateOverload({ ...base, ingest: { eventsPerSec: 5000, queue: q(10), giftPendingAgeMs: 0, halted: false } }, settings.overload, settings.persistence);
  assert.equal(ev1.level, 'L2');
  const ev2 = evaluateOverload({ ...base, ingest: { eventsPerSec: 10, queue: q(60), giftPendingAgeMs: 0, halted: false } }, settings.overload, settings.persistence);
  assert.equal(ev2.level, 'L2');
  assert.ok(ev2.alerts.some((a) => a.code === 'QUEUE_HIGH'));
  assert.equal(evaluateOverload({ ...base, ingest: { eventsPerSec: 0, queue: q(0), giftPendingAgeMs: 3000, halted: false } }, settings.overload, settings.persistence).level, 'L3');
  assert.equal(evaluateOverload({ ...base, ingest: { eventsPerSec: 0, queue: q(0), giftPendingAgeMs: 20000, halted: false } }, settings.overload, settings.persistence).level, 'L4');
  assert.equal(evaluateOverload({ ...base, ingest: { eventsPerSec: 0, queue: q(0), giftPendingAgeMs: 0, halted: true } }, settings.overload, settings.persistence).level, 'L4');
  const ok = evaluateOverload({ ...base, ingest: { eventsPerSec: 0, queue: q(0), giftPendingAgeMs: 0, halted: false } }, settings.overload, settings.persistence);
  assert.equal(ok.level, 'L0');
  assert.ok(ok.clear.includes('QUEUE_HIGH'));
});

// ───────── CR10: thang lưu trữ S1 → S2 → S3 → S4 ─────────
async function journalOn(t, { s2Fail = () => false, emergency = {} } = {}) {
  const env = await makePersistence({}, { realm: 'demo' });
  const j = new GiftJournal({ persistence: env.client, realm: 'demo', logger: quiet, emergencyDir: join(env.dir, 'emergency'), faults: { s2Fail }, config: { groupCommitMs: 5, emergency: { fsyncGroupMs: 5, s3RetryMs: 30, ...emergency } } });
  await j.start();
  t.after(async () => { await j.close().catch(() => {}); await env.stop(); });
  return { env, j };
}

test('CR10a: S1 (DB) thất bại → quà vào S2 tệp khẩn cấp (fsync); khởi động lại → nhập journal đúng một lần, áp dụng', async (t) => {
  const env = await makePersistence({}, { realm: 'demo' });
  t.after(() => env.stop());
  const dir = join(env.dir, 'emergency');
  const j = new GiftJournal({ persistence: env.client, realm: 'demo', logger: quiet, emergencyDir: dir, config: { groupCommitMs: 5, emergency: { fsyncGroupMs: 5 } } });
  await j.start();
  await env.client.close(); // DB "chết": client CLOSED (tương đương lưu trữ S1 không dùng được)
  const res = await Promise.all(['E1', 'E2', 'E3'].map((k) => j.receive(giftEv(k, String(k.length + 1)))));
  assert.deepEqual(res.map((r) => r.status), ['EMERGENCY_S2', 'EMERGENCY_S2', 'EMERGENCY_S2'], 'không nhận rồi đánh rơi: mọi quà nằm ở S2');
  await j.close();
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  assert.equal(files.length, 1);
  // "khởi động lại": DB mới mở trên cùng thư mục dữ liệu, journal nhập tệp khẩn cấp trước khi nhận quà mới
  const { PersistenceClient } = await import('../src/data/PersistenceClient.js');
  const c2 = new PersistenceClient({ dbPath: join(env.dir, 'nova-demo.db'), backupDir: join(env.dir, 'b'), rejectedDir: join(env.dir, 'r'), realm: 'demo', config: env.cfg, logger: quiet });
  await c2.start();
  const view = new GiftTotalsView();
  await view.rebuild(c2);
  const j2 = new GiftJournal({ persistence: c2, realm: 'demo', logger: quiet, emergencyDir: dir, config: { groupCommitMs: 5 } });
  j2.onCommittedGift(view.apply);
  await j2.start();
  await waitFor(async () => (await c2.read('gift_invariants'))[0].pending === 0, { what: 'replay xong' });
  const inv = (await c2.read('gift_invariants'))[0];
  assert.equal(inv.appliedQty, 3);
  assert.ok(readdirSync(dir).some((f) => f.endsWith('.jsonl.imported')), 'tệp đã nhập được đổi tên (không xoá) để đối soát');
  // nhập lại lần nữa không nhân đôi (INSERT OR IGNORE theo gift_key)
  await j2.close();
  const j3 = new GiftJournal({ persistence: c2, realm: 'demo', logger: quiet, emergencyDir: dir, config: { groupCommitMs: 5 } });
  await j3.start();
  await j3.close();
  assert.equal((await c2.read('gift_invariants'))[0].appliedQty, 3);
  assert.deepEqual(view.toRows(), await c2.read('gift_totals'));
  await c2.close();
});

test('CR10b: S1 + S2 thất bại → S3 (RAM) + cảnh báo GIFT_AT_RISK; S3 đạt 90% → INGEST_HALT trước khi tràn; không nhận rồi đánh rơi', async (t) => {
  const { env, j } = await journalOn(t, { s2Fail: () => true, emergency: { ramGiftsMax: 10, haltRatio: 0.9 } });
  const alerts = [];
  j.on('alert', (a) => alerts.push(a.code));
  let halted = 0;
  j.on('halt', () => halted++);
  await env.client.close();
  const out = [];
  for (let i = 0; i < 9; i++) out.push((await j.receive(giftEv(`R${i}`))).status);
  assert.ok(out.every((s) => s === 'EMERGENCY_S3'), out.join(','));
  assert.equal(halted, 1, 'INGEST_HALT ở mốc 9/10 (90%)');
  assert.ok(alerts.includes('GIFT_AT_RISK'));
  assert.ok(alerts.includes('INGEST_HALTED'));
  assert.equal(j.metrics().counters.lost, 0, 'chưa mất quà nào');
});

test('CR10c: S3 → S2 khi tệp ghi được lại (bền), cho phép kết nối lại nhưng KHÔNG tự nối', async (t) => {
  let failing = true;
  const { env, j } = await journalOn(t, { s2Fail: () => failing, emergency: { ramGiftsMax: 10 } });
  let resumed = 0;
  j.on('resume', () => resumed++);
  await env.client.close();
  for (let i = 0; i < 9; i++) await j.receive(giftEv(`T${i}`));
  assert.equal(j.halted, true);
  failing = false;
  await waitFor(() => j.metrics().s3RamGifts === 0, { what: 'S3 xả sang S2' });
  assert.equal(resumed, 1);
  assert.equal(j.halted, false);
  const files = readdirSync(join(env.dir, 'emergency')).filter((f) => f.endsWith('.jsonl'));
  assert.ok(files.length >= 1, 'quà đã nằm trong tệp khẩn cấp (bền)');
});

test('pipeline: S4 INGEST_HALT ngắt connector và chặn kết nối lại cho tới khi lưu trữ khôi phục', async (t) => {
  const { env, j } = await journalOn(t, { s2Fail: () => true, emergency: { ramGiftsMax: 4 } });
  const conn = new MockConnector({ reconnect: fast });
  const p = new IngestPipeline({ connector: conn, journal: j, sessions: null, logger: quiet });
  p.start();
  t.after(() => p.stop());
  await p.connect();
  await env.client.close();
  for (let i = 0; i < 5; i++) { conn.inject({ type: 'gift', msgId: `H${i}`, user: { userId: '1' }, giftId: 1, giftType: 2, repeatCount: 1 }); await sleep(15); }
  await waitFor(() => conn.state === 'STOPPED', { what: 'connector bị ngắt' });
  await sleep(80);
  assert.equal(conn.state, 'STOPPED', 'không tự nối lại');
  await assert.rejects(p.connect(), (e) => e.code === 'INGEST_HALTED');
});

// ───────── LiveSessionManager ─────────
test('buổi LIVE: room_id mới → buổi mới; rớt mạng/khởi động lại cùng room_id → TIẾP TỤC; room khác → đóng INFERRED; streamEnd → ENDED', async (t) => {
  const env = await makePersistence({}, { realm: 'demo' });
  t.after(() => env.stop());
  const mk = () => new LiveSessionManager({ persistence: env.client, logger: quiet, source: 'mock', username: 'kenh_test' });
  let s = mk();
  await s.init();
  assert.equal((await s.onConnected({ roomId: 'R1' })).action, 'new');
  const id1 = s.currentId;
  assert.equal((await s.onConnected({ roomId: 'R1' })).action, 'continue', 'nối lại cùng room');
  // "khởi động lại server"
  s = mk();
  const rec = await s.init();
  assert.equal(rec.session_id, id1);
  assert.equal((await env.client.read('live_session_latest'))[0].status, 'RECOVERING');
  assert.equal((await s.onConnected({ roomId: 'R1' })).action, 'continue');
  assert.equal(s.currentId, id1, 'không tạo buổi mới khi restart cùng room_id');
  assert.equal((await s.onConnected({ roomId: 'R2' })).action, 'new');
  const rows = await env.client.read('list_live_sessions');
  assert.deepEqual(rows.map((r) => [r.room_id, r.status, r.end_reason]), [['R1', 'ENDED', 'INFERRED'], ['R2', 'ACTIVE', null]]);
  await s.onStreamEnd();
  assert.equal(s.currentId, null);
  assert.equal((await env.client.read('live_session_by_room', { room_id: 'R2' }))[0].end_reason, 'STREAM_END');
  assert.equal((await s.onConnected({ roomId: 'R2' })).action, 'none', 'room đã ENDED không tự mở lại');
});

// ───────── LiveConnector (thư viện giả — thư viện thật CHƯA cài) ─────────
test('LiveConnector: chưa cài thư viện → lỗi LIBRARY_NOT_INSTALLED rõ ràng, FAILED, không thử lại vô ích', async () => {
  const c = new LiveConnector({ username: 'kenh_test', reconnect: fast, libraryLoader: () => Promise.reject(Object.assign(new Error('Cannot find package'), { code: 'ERR_MODULE_NOT_FOUND' })) });
  await assert.rejects(c.connect(), (e) => e.code === 'LIBRARY_NOT_INSTALLED');
  assert.equal(c.state, 'FAILED');
});

test('LiveConnector với thư viện giả: ánh xạ sự kiện → RawEvent, disconnected → nối lại, streamEnd → ENDED, offline → không poll', async () => {
  const { EventEmitter } = await import('node:events');
  let instances = 0; let offline = false;
  class FakeConn extends EventEmitter {
    constructor(u) { super(); this.u = u; instances++; }
    async connect() { if (offline) throw new Error('User is offline'); return { roomId: '7300000000000000001' }; }
    async disconnect() {}
  }
  const c = new LiveConnector({ username: 'kenh_test', reconnect: fast, libraryLoader: async () => ({ TikTokLiveConnection: FakeConn }) });
  const raws = [];
  c.on('raw', (r, m) => raws.push({ r, m }));
  assert.deepEqual(await c.connect(), { roomId: '7300000000000000001' });
  c.conn.emit('gift', { common: { msgId: '123', createTime: '1700000000000' }, user: { userId: '99', uniqueId: 'abc', nickname: 'Bé' }, giftId: 5655, repeatCount: 3, repeatEnd: false, groupId: '555', giftDetails: { giftName: 'Rose', diamondCount: 1, giftType: 1 } });
  assert.equal(raws[0].r.type, 'gift');
  assert.equal(raws[0].r.msgId, '123');
  assert.equal(raws[0].r.giftType, 1);
  assert.equal(raws[0].r.repeatCount, 3);
  assert.equal(raws[0].m.realm, 'live');
  c.conn.emit('disconnected');
  await waitFor(() => c.state === 'CONNECTED' && instances === 2, { what: 'nối lại sau disconnected' });
  c.conn.emit('streamEnd', {});
  assert.equal(c.state, 'ENDED');
  offline = true;
  await assert.rejects(c.connect(), (e) => e.code === 'NOT_LIVE');
  assert.equal(c.state, 'ENDED', 'phòng không phát: dừng, không poll');
  const v1 = mapLibraryEvent('gift', { msgId: '1', userId: '2', uniqueId: 'x', giftId: 3, repeatCount: 1, repeatEnd: true, diamondCount: 5, giftType: 2 });
  assert.deepEqual([v1.msgId, v1.user.userId, v1.giftId, v1.diamondCount], ['1', '2', 3, 5], 'dạng phẳng 1.x cũng ánh xạ được');
});

// ───────── đường ống + app (DEMO) ─────────
test('pipeline: Mock → Normalizer → dedupe/rate-limit → hàng đợi → bộ xử lý; quà qua journal, công bố sau commit; đếm nhận vs RECEIVED', async (t) => {
  const env = await makePersistence({}, { realm: 'demo' });
  t.after(() => env.stop());
  const view = new GiftTotalsView();
  const j = new GiftJournal({ persistence: env.client, realm: 'demo', logger: quiet, emergencyDir: join(env.dir, 'e'), config: { groupCommitMs: 5 } });
  j.onCommittedGift(view.apply);
  await j.start();
  const sessions = new LiveSessionManager({ persistence: env.client, logger: quiet, source: 'mock' });
  await sessions.init();
  const conn = new MockConnector({ reconnect: fast, scenario: { seed: 3, streakStepMs: 2 } });
  const p = new IngestPipeline({ connector: conn, journal: j, sessions, logger: quiet, config: { tickMs: 10, commentsPerUserPerSec: 2, commentBurst: 2 } });
  const got = [];
  p.onEvent((batch) => got.push(...batch));
  p.start();
  t.after(async () => { await p.stop(); await j.close(); });
  await p.connect();
  await waitFor(() => sessions.currentId, { what: 'buổi LIVE mới' });
  conn.inject({ type: 'chat', msgId: 'C1', user: { userId: '1' }, comment: 'câu cá' });
  conn.inject({ type: 'chat', msgId: 'C1', user: { userId: '1' }, comment: 'câu cá' }); // trùng msgId
  for (let i = 2; i < 6; i++) conn.inject({ type: 'chat', msgId: `C${i}`, user: { userId: '1' }, comment: 'spam' }); // vượt rate
  conn.inject({ type: 'chat' }); // thiếu dữ liệu
  conn.inject({ type: 'gift', msgId: 'G1', user: { userId: '8' }, giftId: 1, giftType: 2, diamondCount: 10, repeatCount: 2 });
  conn.gift({ userId: '9', giftIndex: 0, count: 4, streak: true });
  await waitFor(() => view.get('demo:9').qty === 4 && view.get('demo:8').qty === 2, { what: 'quà được công bố', timeoutMs: 5000 });
  await waitFor(() => got.length >= 2, { what: 'bộ xử lý nhận sự kiện' });
  const m = p.metrics();
  assert.equal(m.counters.duplicates, 1);
  assert.ok(m.counters.rateLimited >= 2);
  assert.equal(m.counters.invalid.INVALID_PAYLOAD, 1);
  assert.equal(m.counters.giftsFromConnector, 6, '1 quà thường + 4 bước streak + 1 repeatEnd');
  assert.equal((m.counters.giftStatus.RECEIVED || 0) + (m.counters.giftStatus.DUPLICATE || 0), 6, 'mọi quà từ connector đều có kết quả journal');
  assert.ok(got.every((e) => e.event_type !== 'gift'), 'quà không vào gameplay qua hàng đợi thô');
  const rows = await env.client.read('gift_rows', { keys: ['M:G1'] });
  assert.equal(rows[0].live_session_id, sessions.currentId, 'quà gắn với buổi LIVE hiện tại');
});

test('app DEMO: chỉ mở nova-demo.db, KHÔNG tạo/chạm nova-live.db; /api/ingest và kết nối Mock hoạt động', async (t) => {
  const { createApp } = await import('../src/app.js');
  const dir = makeTmpDir('nova-app-demo-');
  const app = await createApp({ env: {}, stdout: false, settingsOverrides: { server: { port: 0 }, dataDir: dir, logging: { toFile: false }, ingest: { mode: 'demo', autoConnect: true, mock: { giftsPerSec: 20, commentsPerSec: 20, streakStepMs: 5 } } }, adminPassword: null });
  t.after(async () => { await app.stop('test'); removeDir(dir); });
  assert.equal(app.realm, 'demo');
  await waitFor(() => app.ingest.metrics().connector.state === 'CONNECTED', { what: 'Mock kết nối' });
  await waitFor(() => app.journal.metrics().counters.published > 3, { what: 'có quà được công bố', timeoutMs: 8000 });
  assert.ok(existsSync(join(dir, 'nova-demo.db')));
  assert.ok(!existsSync(join(dir, 'nova-live.db')), 'chế độ DEMO không tạo/chạm DB LIVE');
  const info = (await app.persistence.read('sqlite_info'))[0];
  assert.equal(info.realm, 'demo');
});
