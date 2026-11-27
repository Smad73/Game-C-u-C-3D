// Phase 2 — Module 04 (LIVE/DEMO), 05 (GiftJournal), 06 (PersistenceWorker integration): Worker + SQLite thật trong thư mục tạm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { GiftJournal } from '../src/gifts/GiftJournal.js';
import { GiftTotalsView } from '../src/gifts/GiftTotalsView.js';
import { normalize } from '../src/ingest/Normalizer.js';
import { Logger } from '../src/system/Logger.js';
import { makePersistence, waitFor } from './helpers.js';

const quiet = new Logger({ level: 'error', stdout: false, toFile: false });
let seq = 0;

/** RawEvent quà. giftType 1 = loại streak. */
function giftRaw({ userId = '1', giftId = 5655, giftType = 2, groupId, repeatCount = 1, repeatEnd = true, msgId, diamond = 1, nickname } = {}) {
  return { type: 'gift', msgId: msgId === undefined ? `m${++seq}` : msgId, createTime: Date.now(), user: userId === null ? {} : { userId, uniqueId: `u${userId}`, nickname: nickname ?? `N${userId}` },
    giftId, giftName: 'Rose', diamondCount: diamond, giftType, groupId, repeatCount, repeatEnd };
}
const ev = (raw, realm = 'demo') => normalize(raw, { receivedAt: Date.now(), source: realm === 'live' ? 'tiktok' : 'mock', realm, roomId: 'room-1' });

async function setup(t, { realm = 'demo', journal = {}, faults = null, persist = {}, env = null } = {}) {
  const p = env ?? await makePersistence(persist, { realm });
  const view = new GiftTotalsView();
  await view.rebuild(p.client);
  const j = new GiftJournal({ persistence: p.client, realm, logger: quiet, emergencyDir: join(p.dir, 'emergency'), faults, config: { groupCommitMs: 5, retryFailedMs: 100, ...journal } });
  j.onCommittedGift(view.apply);
  await j.start();
  t.after(async () => { await j.close().catch(() => {}); if (!env) await p.stop(); });
  return { p, j, view };
}

/** Kiểm I1/I2/I3 + I9 (RAM = DB). */
async function invariants(client, view, { pendingOk = false } = {}) {
  const inv = (await client.read('gift_invariants'))[0];
  assert.equal(inv.ledgerDupSources, 0, 'I1: không gift_key nào có hiệu ứng > 1 lần');
  assert.equal(inv.ledgerWithoutApplied, 0, 'hiệu ứng chỉ tồn tại khi journal APPLIED (cùng transaction)');
  assert.equal(inv.ledgerQty, inv.appliedQty, 'I3: sổ cái khớp journal (số lượng)');
  assert.equal(inv.ledgerCoins, inv.appliedCoins, 'I3: sổ cái khớp journal (xu)');
  assert.equal(inv.playerQty, inv.ledgerQty, 'I3: tổng người chơi khớp sổ cái');
  assert.equal(inv.playerCoins, inv.ledgerCoins);
  assert.equal(inv.totalsOps, inv.ledgerRows, 'mỗi dòng sổ cái đúng một op_key cộng tổng');
  if (!pendingOk) assert.equal(inv.pending, 0, 'I2: không còn quà RECEIVED/FAILED treo');
  if (view) assert.deepEqual(view.toRows(), await client.read('gift_totals'), 'I9: RAM (chỉ từ hiệu ứng đã commit) = DB');
  return inv;
}
const settle = (j) => waitFor(() => j.metrics().pending === 0 && j.inflight.size === 0, { what: 'journal xử lý xong', timeoutMs: 10000 });

// ───────── luồng chuẩn ─────────
test('quà thường: RECEIVED → APPLIED; công bố RAM SAU commit; trùng msgId không áp dụng lần hai (LRU và DB)', async (t) => {
  const { p, j, view } = await setup(t);
  const published = [];
  j.on('committed-gift', (m) => published.push(m));
  const r1 = await j.receive(ev(giftRaw({ msgId: 'A1', diamond: 5, repeatCount: 3 })));
  assert.equal(r1.status, 'RECEIVED');
  await settle(j);
  assert.equal(published.length, 1);
  assert.equal(published[0].qty, 3);
  assert.equal(published[0].coins, 15);
  assert.deepEqual(view.get('demo:1'), { coins: 15, qty: 3 });
  assert.equal((await j.receive(ev(giftRaw({ msgId: 'A1', diamond: 5, repeatCount: 3 })))).status, 'DUPLICATE');
  // Journal mới (LRU rỗng) → DB UNIQUE vẫn chặn
  const j2 = new GiftJournal({ persistence: p.client, realm: 'demo', logger: quiet, emergencyDir: join(p.dir, 'emergency'), config: { groupCommitMs: 5 } });
  await j2.start();
  assert.equal((await j2.receive(ev(giftRaw({ msgId: 'A1', diamond: 5, repeatCount: 3 })))).status, 'DUPLICATE');
  await j2.close();
  await invariants(p.client, view);
  const rows = await p.client.read('gift_rows', { keys: ['M:A1'] });
  assert.equal(rows[0].status, 'APPLIED');
  assert.equal(rows[0].key_quality, 'STRONG');
});

test('không cập nhật RAM trước commit: consumer chỉ nhận sau ACK của batch hiệu ứng', async (t) => {
  const { p, j, view } = await setup(t, { journal: { groupCommitMs: 30 } });
  const order = [];
  p.client.on('committed', (b) => order.push(`commit:${b.cls}`));
  j.on('committed-gift', () => order.push('publish'));
  await j.receive(ev(giftRaw({ msgId: 'B1' })));
  assert.deepEqual(view.get('demo:1'), { coins: 0, qty: 0 }, 'sau RECEIVED, trước APPLIED: RAM chưa có gì');
  await settle(j);
  assert.deepEqual(order, ['commit:critical', 'commit:critical', 'publish'], 'RECEIVED commit → APPLY commit → publish');
});

// ───────── streak ─────────
test('streak có groupId: mốc 1,2,5,10 chỉ cộng phần tăng = 10; trùng không cộng; repeatEnd cùng mốc là trùng', async (t) => {
  const { p, j, view } = await setup(t);
  const s = (n, end = false) => j.receive(ev(giftRaw({ userId: '2', giftType: 1, groupId: 'G1', repeatCount: n, repeatEnd: end, diamond: 2 })));
  for (const n of [1, 2, 5, 10]) assert.equal((await s(n)).status, 'RECEIVED');
  assert.equal((await s(2)).status, 'DUPLICATE');
  assert.equal((await s(5)).status, 'DUPLICATE');
  assert.equal((await s(10, true)).status, 'DUPLICATE', 'sự kiện repeatEnd cùng mốc 10 → cùng gift_key');
  await settle(j);
  assert.deepEqual(view.get('demo:2'), { coins: 20, qty: 10 });
  await invariants(p.client, view);
});

test('streak đến sai thứ tự (5,2,10,1) và nhiều sự kiện trùng: tổng vẫn = mốc lớn nhất', async (t) => {
  const { p, j, view } = await setup(t);
  const s = (n) => j.receive(ev(giftRaw({ userId: '3', giftType: 1, groupId: 'G2', repeatCount: n, repeatEnd: false })));
  await Promise.all([5, 2, 10, 1, 10, 5, 2].map(s));
  await settle(j);
  assert.deepEqual(view.get('demo:3'), { coins: 10, qty: 10 });
  const inv = await invariants(p.client, view);
  assert.equal(inv.ledgerQty, 10);
});

test('hai streak khác groupId của cùng người/quà được tính riêng; streak thiếu repeatEnd vẫn giữ phần đã cộng', async (t) => {
  const { p, j, view } = await setup(t);
  for (const n of [1, 2, 3]) await j.receive(ev(giftRaw({ userId: '4', giftType: 1, groupId: 'GA', repeatCount: n, repeatEnd: n === 3 })));
  for (const n of [1, 2]) await j.receive(ev(giftRaw({ userId: '4', giftType: 1, groupId: 'GB', repeatCount: n, repeatEnd: false })));
  await settle(j);
  assert.deepEqual(view.get('demo:4'), { coins: 5, qty: 5 });
  await invariants(p.client, view);
});

test('streak THIẾU groupId: sự kiện giữa chừng journal là REJECTED, chỉ repeatEnd được tính (không cộng chồng 1+2+3)', async (t) => {
  const { p, j, view } = await setup(t);
  const out = [];
  for (const n of [1, 2, 3]) out.push((await j.receive(ev(giftRaw({ userId: '5', giftType: 1, repeatCount: n, repeatEnd: false })))).status);
  out.push((await j.receive(ev(giftRaw({ userId: '5', giftType: 1, repeatCount: 3, repeatEnd: true })))).status);
  assert.deepEqual(out, ['REJECTED', 'REJECTED', 'REJECTED', 'RECEIVED']);
  await settle(j);
  assert.deepEqual(view.get('demo:5'), { coins: 3, qty: 3 });
  const counts = Object.fromEntries((await p.client.read('gift_status_counts')).map((r) => [r.status, r.n]));
  assert.deepEqual(counts, { APPLIED: 1, REJECTED: 3 });
  await invariants(p.client, view);
});

test('restart giữa streak: mốc đã áp dụng lưu trong DB, phần còn lại chỉ cộng phần tăng', async (t) => {
  const env = await makePersistence({}, { realm: 'demo' });
  t.after(() => env.stop());
  const s = (j, n) => j.receive(ev(giftRaw({ userId: '6', giftType: 1, groupId: 'GR', repeatCount: n, repeatEnd: n === 10 })));
  {
    const view = new GiftTotalsView();
    const j = new GiftJournal({ persistence: env.client, realm: 'demo', logger: quiet, emergencyDir: join(env.dir, 'e'), config: { groupCommitMs: 5 } });
    j.onCommittedGift(view.apply);
    await j.start();
    for (const n of [1, 2, 3, 4, 5]) await s(j, n);
    await settle(j);
    await j.close();
  }
  const view = new GiftTotalsView();
  await view.rebuild(env.client); // khởi động lại: RAM dựng từ DB trước
  const j = new GiftJournal({ persistence: env.client, realm: 'demo', logger: quiet, emergencyDir: join(env.dir, 'e'), config: { groupCommitMs: 5 } });
  j.onCommittedGift(view.apply);
  await j.start();
  for (const n of [4, 5, 6, 8, 10]) await s(j, n); // 4,5 là trùng (đã có trong DB)
  await settle(j);
  await j.close();
  assert.deepEqual(view.get('demo:6'), { coins: 10, qty: 10 });
  await invariants(env.client, view);
});

// ───────── người dùng / realm ─────────
test('quà thiếu userId: journal REJECTED (NO_USER_ID), không tạo hồ sơ, không hiệu ứng', async (t) => {
  const { p, j, view } = await setup(t);
  assert.equal((await j.receive(ev(giftRaw({ userId: null, msgId: 'NU1' })))).status, 'REJECTED');
  const row = (await p.client.read('gift_rows', { keys: ['M:NU1'] }))[0];
  assert.equal(row.reason, 'NO_USER_ID');
  assert.equal(row.player_key, null);
  assert.equal((await p.client.read('count_table', { table: 'players' }))[0].count, 0);
  await invariants(p.client, view);
});

test('LIVE/DEMO (ADR-0021): sự kiện DEMO KHÔNG ghi được vào nova-live.db (Worker từ chối REALM_MISMATCH); DB live không đổi', async (t) => {
  const live = await makePersistence({}, { realm: 'live' });
  t.after(() => live.stop());
  const before = (await live.client.read('state_hash'))[0].hash;
  // Cố tình nối journal vào DB LIVE nhưng đưa sự kiện realm demo (lỗi lập trình giả định) → lớp phòng thủ thứ hai ở Worker.
  const j = new GiftJournal({ persistence: live.client, realm: 'live', logger: quiet, emergencyDir: join(live.dir, 'e'), config: { groupCommitMs: 5 } });
  await j.start();
  const r = await j.receive(ev(giftRaw({ msgId: 'X1' }), 'demo'));
  assert.equal(r.status, 'INVALID');
  await j.close();
  assert.equal((await live.client.read('state_hash'))[0].hash, before, 'nova-live.db không bị chạm');
  // và ngược lại: DB demo từ chối player_key tt:
  const demo = await makePersistence({}, { realm: 'demo' });
  t.after(() => demo.stop());
  const jd = new GiftJournal({ persistence: demo.client, realm: 'demo', logger: quiet, emergencyDir: join(demo.dir, 'e'), config: { groupCommitMs: 5 } });
  await jd.start();
  assert.equal((await jd.receive(ev(giftRaw({ msgId: 'X2' }), 'live'))).status, 'INVALID');
  await jd.close();
  assert.equal((await demo.client.read('count_table', { table: 'gift_events' }))[0].count, 0);
});

test('một quà lỗi trong nhóm không kéo các quà khác: batch bị từ chối được tách từng quà', async (t) => {
  const { p, j, view } = await setup(t, { journal: { groupCommitMs: 40 } });
  const good = [1, 2, 3].map((i) => j.receive(ev(giftRaw({ userId: String(10 + i), msgId: `OK${i}` }))));
  const badEv = ev(giftRaw({ userId: '99', msgId: 'BAD' }));
  badEv.payload.key_mode = 'Z'; // dữ liệu sai lọt qua (giả lập lỗi lập trình) → Worker từ chối op
  const bad = j.receive(badEv);
  const res = await Promise.all([...good, bad]);
  assert.deepEqual(res.map((r) => r.status), ['RECEIVED', 'RECEIVED', 'RECEIVED', 'INVALID']);
  await settle(j);
  await invariants(p.client, view);
  assert.equal(view.toRows().length, 3);
});

// ───────── Worker / batch idempotency ─────────
test('GB8/CR9: batch hiệu ứng commit xong, Worker chết trước ACK (tiến trình còn sống) → nhận diện qua status, đọc DB, công bố đúng 1 lần', async (t) => {
  let once = true;
  const faults = { workerFault: (stage) => (stage === 'apply' && once ? ((once = false), 'after_commit_before_ack') : undefined) };
  const { p, j, view } = await setup(t, { faults });
  let pubs = 0;
  j.on('committed-gift', () => pubs++);
  await j.receive(ev(giftRaw({ msgId: 'W1', diamond: 7 })));
  await waitFor(() => pubs === 1, { what: 'công bố sau khi Worker khởi động lại', timeoutMs: 8000 });
  await settle(j);
  assert.equal(pubs, 1);
  assert.equal(p.client.metrics().counters.recovered, 1, 'batch được nhận diện ALREADY qua status, không gửi lại mù');
  assert.deepEqual(view.get('demo:1'), { coins: 7, qty: 1 });
  await invariants(p.client, view);
});

test('W1 với batch RECEIVED: commit xong, chết trước ACK → nhận diện qua DB, tiếp tục áp dụng đúng một lần', async (t) => {
  let once = true;
  const faults = { workerFault: (stage) => (stage === 'receive' && once ? ((once = false), 'after_commit_before_ack') : undefined) };
  const { p, j, view } = await setup(t, { faults });
  const r = await j.receive(ev(giftRaw({ msgId: 'W2' })));
  assert.equal(r.status, 'RECEIVED');
  await settle(j);
  assert.deepEqual(view.get('demo:1'), { coins: 1, qty: 1 });
  await invariants(p.client, view);
});

test('nack tạm thời (BUSY) khi ghi RECEIVED: gửi lại cùng batch_id, áp dụng một lần', async (t) => {
  let once = true;
  const faults = { workerFault: (stage) => (stage === 'receive' && once ? ((once = false), 'busy_once') : undefined) };
  const { p, j, view } = await setup(t, { faults });
  assert.equal((await j.receive(ev(giftRaw({ msgId: 'BZ' })))).status, 'RECEIVED');
  await settle(j);
  assert.ok(p.client.metrics().counters.retried >= 1);
  await invariants(p.client, view);
});

test('áp dụng bị từ chối lặp lại → FAILED (attempts++) → DEAD + cảnh báo GIFT_DEAD; không treo (I2), không hiệu ứng', async (t) => {
  const faults = { workerFault: (stage) => (stage === 'apply' ? 'reject' : undefined) };
  const { p, j, view } = await setup(t, { faults, journal: { maxGiftAttempts: 3, retryFailedMs: 50 } });
  const alerts = [];
  j.on('alert', (a) => alerts.push(a.code));
  assert.equal((await j.receive(ev(giftRaw({ msgId: 'D1' })))).status, 'RECEIVED');
  await waitFor(async () => (await p.client.read('gift_rows', { keys: ['M:D1'] }))[0].status === 'DEAD', { what: 'quà thành DEAD', timeoutMs: 8000 });
  const row = (await p.client.read('gift_rows', { keys: ['M:D1'] }))[0];
  assert.equal(row.attempts, 2, '2 lần FAILED rồi DEAD ở lần thứ 3');
  assert.ok(alerts.includes('GIFT_DEAD'));
  assert.equal(view.toRows().length, 0, 'không công bố gì');
  await invariants(p.client, view);
});
