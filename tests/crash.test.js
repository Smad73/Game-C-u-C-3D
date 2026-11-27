// Phase 2 — Module 08: CR8 — chèn lỗi tại TỪNG ranh giới GB0–GB7 của luồng quà (ADR-0018; GB8 ở gift-journal.test.js).
// Mỗi ca: gửi 1 quà → "tiến trình chết" đúng tại ranh giới (journal.crash() + PersistenceClient.kill(): không flush, không tự khởi động lại)
// → "khởi động lại" (client + journal mới trên CÙNG file DB) → dựng RAM từ DB → replay → kiểm I1, I2, I3, I9 + kết quả mong đợi của bảng GB.
// LOẠI KIỂM THỬ: fault injection MÔ PHỎNG ranh giới logic, Worker bị terminate thật (worker_threads). Kill TIẾN TRÌNH thật (SIGKILL) ở CR1
// (tools/crash-suite.js). Mất điện thật (CR7) KHÔNG kiểm được.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { PersistenceClient } from '../src/data/PersistenceClient.js';
import { GiftJournal } from '../src/gifts/GiftJournal.js';
import { GiftTotalsView } from '../src/gifts/GiftTotalsView.js';
import { normalize } from '../src/ingest/Normalizer.js';
import { Logger } from '../src/system/Logger.js';
import { makePersistence, sleep, waitFor } from './helpers.js';

const quiet = new Logger({ level: 'error', stdout: false, toFile: false });
const gift = (msgId) => normalize({ type: 'gift', msgId, createTime: Date.now(), user: { userId: '42', nickname: 'Cá' }, giftId: 5655, giftType: 2, diamondCount: 3, repeatCount: 2 },
  { receivedAt: Date.now(), source: 'mock', realm: 'demo', roomId: 'r' });

/**
 * @param {{point?:string, workerStage?:'receive'|'apply', workerFault?:string}} at — nơi "chết"
 */
async function crashAt(at) {
  const env = await makePersistence({ restartBackoffMs: 60000 }, { realm: 'demo' }); // không cho Worker tự khởi động lại trước khi "tiến trình chết"
  const dbPath = join(env.dir, 'nova-demo.db');
  let crashed = false;
  let j;
  const die = () => { if (!crashed) { crashed = true; j.crash(); } };
  const faults = {
    point: (name) => { if (name === at.point) die(); },
    workerFault: (stage) => {
      if (stage !== at.workerStage || crashed) return undefined;
      setTimeout(die, 0); // tiến trình chết cùng lúc Worker chết giữa batch (không còn ai hỏi lại status)
      return at.workerFault;
    }
  };
  const view1 = new GiftTotalsView();
  j = new GiftJournal({ persistence: env.client, realm: 'demo', logger: quiet, emergencyDir: join(env.dir, 'e'), faults, config: { groupCommitMs: 5 } });
  j.onCommittedGift(view1.apply);
  await j.start();
  const published1 = [];
  j.on('committed-gift', (m) => published1.push(m));
  const r = j.receive(gift('GBX'));
  await waitFor(() => crashed, { what: `crash tại ${JSON.stringify(at)}`, timeoutMs: 5000 });
  if (at.workerFault) await waitFor(() => env.client.state === 'DEGRADED', { what: 'Worker đã chết' });
  await sleep(30);
  await env.client.kill();

  // ── khởi động lại ──
  const c2 = new PersistenceClient({ dbPath, backupDir: join(env.dir, 'b'), rejectedDir: join(env.dir, 'r'), realm: 'demo', config: env.cfg, logger: quiet });
  await c2.start();
  const view2 = new GiftTotalsView();
  await view2.rebuild(c2); // RAM dựng từ DB TRƯỚC
  const fromDbBeforeReplay = view2.get('demo:42');
  const j2 = new GiftJournal({ persistence: c2, realm: 'demo', logger: quiet, emergencyDir: join(env.dir, 'e'), config: { groupCommitMs: 5 } });
  j2.onCommittedGift(view2.apply);
  const published2 = [];
  j2.on('committed-gift', (m) => published2.push(m));
  const restore = await j2.start();
  await waitFor(async () => (await c2.read('gift_invariants'))[0].pending === 0, { what: 'replay xong' });
  await waitFor(() => j2.inflight.size === 0, { what: 'journal rảnh' });
  const inv = (await c2.read('gift_invariants'))[0];
  const totals = await c2.read('gift_totals');
  const row = (await c2.read('gift_rows', { keys: ['M:GBX'] }))[0] ?? null;
  // Bất biến chung
  assert.equal(inv.ledgerDupSources, 0, 'I1');
  assert.equal(inv.pending, 0, 'I2');
  assert.equal(inv.ledgerQty, inv.appliedQty, 'I3');
  assert.equal(inv.playerCoins, inv.ledgerCoins, 'I3');
  assert.deepEqual(view2.toRows(), totals, 'I9: RAM sau khởi động = trạng thái dựng từ DB');
  await j2.close();
  await c2.close();
  await env.stop();
  void r;
  return { inv, row, published1, published2, fromDbBeforeReplay, restore };
}

test('GB0: chết sau khi connector phát, trước khi gửi RECEIVED → không có dòng, quà mất (G3), không hiệu ứng', async () => {
  const x = await crashAt({ point: 'GB0' });
  assert.equal(x.row, null);
  assert.equal(x.inv.ledgerRows, 0);
});

test('GB1: batch RECEIVED đang ghi, chưa COMMIT (Worker chết trước COMMIT) → không có dòng (rollback), như GB0', async () => {
  const x = await crashAt({ workerStage: 'receive', workerFault: 'before_commit' });
  assert.equal(x.row, null);
  assert.equal(x.inv.ledgerRows, 0);
});

test('GB2: RECEIVED đã commit, chết trước ACK → khởi động lại replay → áp dụng ĐÚNG 1 lần', async () => {
  const x = await crashAt({ workerStage: 'receive', workerFault: 'after_commit_before_ack' });
  assert.equal(x.row.status, 'APPLIED');
  assert.equal(x.inv.appliedQty, 2);
  assert.equal(x.restore.replayed, 1);
  assert.equal(x.published2.length, 1);
});

test('GB3: sau ACK RECEIVED, chết trong lúc tính hiệu ứng → replay → áp dụng đúng 1 lần', async () => {
  const x = await crashAt({ point: 'GB3' });
  assert.equal(x.row.status, 'APPLIED');
  assert.equal(x.inv.appliedQty, 2);
  assert.equal(x.published2.length, 1);
});

test('GB4: batch hiệu ứng đã gửi, chưa commit → DB chỉ có RECEIVED, không hiệu ứng → replay → áp dụng đúng 1 lần', async () => {
  const x = await crashAt({ workerStage: 'apply', workerFault: 'before_commit' });
  assert.deepEqual(x.fromDbBeforeReplay, { coins: 0, qty: 0 }, 'trước replay: không có hiệu ứng (không áp dụng một nửa)');
  assert.equal(x.row.status, 'APPLIED');
  assert.equal(x.inv.appliedQty, 2);
  assert.equal(x.published2.length, 1);
});

test('GB5: batch hiệu ứng ĐÃ commit, chết trước ACK → APPLIED + hiệu ứng có sẵn; KHÔNG replay, không trùng', async () => {
  const x = await crashAt({ workerStage: 'apply', workerFault: 'after_commit_before_ack' });
  assert.equal(x.row.status, 'APPLIED');
  assert.deepEqual(x.fromDbBeforeReplay, { coins: 6, qty: 2 }, 'RAM dựng từ DB đã có hiệu ứng');
  assert.equal(x.restore.replayed, 0);
  assert.equal(x.published2.length, 0, 'không công bố lại');
  assert.equal(x.published1.length, 0, 'tiến trình cũ chưa kịp công bố');
  assert.equal(x.inv.appliedQty, 2);
});

test('GB6: đã nhận ACK, chết TRƯỚC publishCommittedGift → khởi động lại: RAM từ DB có hiệu ứng, không replay, FX không hiện (chấp nhận)', async () => {
  const x = await crashAt({ point: 'GB6' });
  assert.equal(x.published1.length, 0);
  assert.equal(x.published2.length, 0);
  assert.deepEqual(x.fromDbBeforeReplay, { coins: 6, qty: 2 });
  assert.equal(x.inv.appliedQty, 2);
});

test('GB7: đã công bố RAM, chết trước/giữa FX → như GB6: không trùng', async () => {
  const x = await crashAt({ point: 'GB7' });
  assert.equal(x.published1.length, 1);
  assert.equal(x.published2.length, 0);
  assert.deepEqual(x.fromDbBeforeReplay, { coins: 6, qty: 2 });
  assert.equal(x.inv.appliedQty, 2);
});
