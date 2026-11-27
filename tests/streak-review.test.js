// P2 REVIEW — ma trận Gift Streak (groupId × repeatEnd), hai streak độc lập, trùng & sai thứ tự. Worker + SQLite thật.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { GiftJournal } from '../src/gifts/GiftJournal.js';
import { GiftTotalsView } from '../src/gifts/GiftTotalsView.js';
import { normalize } from '../src/ingest/Normalizer.js';
import { Logger } from '../src/system/Logger.js';
import { makePersistence, waitFor } from './helpers.js';

const quiet = new Logger({ level: 'error', stdout: false, toFile: false });
let n = 0;
const T0 = Date.now() - 60000;
/** Sự kiện streak (giftType 1). msgId mặc định duy nhất cho mỗi sự kiện (TikTok gửi mỗi mốc là một message). */
const s = ({ user = '1', gid, c, end = false, msgId, t }) => normalize(
  { type: 'gift', msgId: msgId ?? `x${++n}`, createTime: t ?? T0 + n, user: { userId: user }, giftId: 5655, giftType: 1, diamondCount: 1, groupId: gid, repeatCount: c, repeatEnd: end },
  { receivedAt: Date.now(), source: 'mock', realm: 'demo', roomId: 'r' });

async function run(t, events) {
  const env = await makePersistence({}, { realm: 'demo' });
  const view = new GiftTotalsView();
  const j = new GiftJournal({ persistence: env.client, realm: 'demo', logger: quiet, emergencyDir: join(env.dir, 'e'), config: { groupCommitMs: 5 } });
  j.onCommittedGift(view.apply);
  await j.start();
  t.after(async () => { await j.close(); await env.stop(); });
  const out = [];
  for (const e of events) out.push((await j.receive(e)).status);
  await waitFor(() => j.metrics().pending === 0 && j.inflight.size === 0, { what: 'xử lý xong' });
  const inv = (await env.client.read('gift_invariants'))[0];
  assert.equal(inv.ledgerDupSources, 0, 'I1');
  assert.equal(inv.pending, 0, 'I2');
  assert.equal(inv.ledgerQty, inv.appliedQty, 'I3');
  assert.deepEqual(view.toRows(), await env.client.read('gift_totals'), 'I9');
  return { out, qty: (u = '1') => view.get(`demo:${u}`).qty, client: env.client };
}

test('A — có groupId + repeatEnd: 1..5 rồi repeatEnd(5) → 5 (repeatEnd cùng mốc là trùng)', async (t) => {
  const r = await run(t, [1, 2, 3, 4, 5].map((c) => s({ gid: 'G', c })).concat(s({ gid: 'G', c: 5, end: true })));
  assert.equal(r.qty(), 5);
  assert.equal(r.out.at(-1), 'DUPLICATE');
});

test('B — có groupId, THIẾU repeatEnd: 1..4 → 4 (phần đã đến được tính, không chờ repeatEnd)', async (t) => {
  const r = await run(t, [1, 2, 3, 4].map((c) => s({ gid: 'G', c })));
  assert.equal(r.qty(), 4);
});

test('C — THIẾU groupId, có repeatEnd: mốc giữa chừng REJECTED, repeatEnd(6) → 6', async (t) => {
  const r = await run(t, [1, 2, 3].map((c) => s({ c })).concat(s({ c: 6, end: true })));
  assert.deepEqual(r.out, ['REJECTED', 'REJECTED', 'REJECTED', 'RECEIVED']);
  assert.equal(r.qty(), 6);
});

test('D — THIẾU cả groupId lẫn repeatEnd: KHÔNG tính (0) — giới hạn đã biết, mọi sự kiện được journal REJECTED để đối soát', async (t) => {
  const r = await run(t, [1, 2, 3].map((c) => s({ c })));
  assert.equal(r.qty(), 0);
  const st = Object.fromEntries((await r.client.read('gift_status_counts')).map((x) => [x.status, x.n]));
  assert.deepEqual(st, { REJECTED: 3 });
});

test('E1 — hai streak cùng user, cùng giftId, KHÁC groupId (chồng lấn thời gian): tính riêng 3 + 4 = 7, không gộp', async (t) => {
  const r = await run(t, [s({ gid: 'G1', c: 1 }), s({ gid: 'G2', c: 1 }), s({ gid: 'G1', c: 3 }), s({ gid: 'G2', c: 4 }), s({ gid: 'G1', c: 2 })]);
  assert.equal(r.qty(), 7);
});

test('E2 — hai lần gửi KHÔNG có groupId (mỗi lần có repeatEnd, msgId khác): 3 + 3 = 6, không coi lần 2 là trùng', async (t) => {
  const r = await run(t, [s({ c: 3, end: true, t: T0 + 1000 }), s({ c: 3, end: true, t: T0 + 5000 })]);
  assert.equal(r.qty(), 6);
});

test('E3 — người khác, cùng groupId: không gộp (khoá có player_key)', async (t) => {
  const r = await run(t, [s({ user: '1', gid: 'G', c: 2 }), s({ user: '2', gid: 'G', c: 5 })]);
  assert.deepEqual([r.qty('1'), r.qty('2')], [2, 5]);
});

test('F — trùng + sai thứ tự (10,3,10,1,7,3,10 end): đúng 10, không cộng trùng', async (t) => {
  const r = await run(t, [10, 3, 10, 1, 7, 3].map((c) => s({ gid: 'G', c })).concat(s({ gid: 'G', c: 10, end: true })));
  assert.equal(r.qty(), 10);
  assert.equal(r.out.filter((x) => x === 'DUPLICATE').length, 3);
});

test('F2 — repeatEnd không groupId bị gửi lại CÙNG msgId → trùng (M/H dedupe), không cộng lần hai', async (t) => {
  const r = await run(t, [s({ c: 4, end: true, msgId: 'E1', t: T0 + 9 }), s({ c: 4, end: true, msgId: 'E1', t: T0 + 9 })]);
  assert.equal(r.qty(), 4);
  assert.equal(r.out[1], 'DUPLICATE');
});
