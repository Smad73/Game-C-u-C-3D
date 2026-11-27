// Khu câu (ADR-0026): ZoneDirector thuần + WorldCore (lệnh "khu", quà cắt camera tới khu người tặng, khung theo khu).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ZoneDirector } from '../src/game/ZoneDirector.js';
import { GiftJournal } from '../src/gifts/GiftJournal.js';
import { normalize } from '../src/ingest/Normalizer.js';
import { GameConfig, sanitizeGiftRules } from '../src/game/GameConfig.js';
import { WorldCore, matchCommand } from '../src/game/WorldCore.js';
import { rng } from '../src/game/progression.js';
import { Logger } from '../src/system/Logger.js';
import { makePersistence, waitFor } from './helpers.js';

const Z = ['cau', 'ben', 'sau', 'dao'];

// ───────── ZoneDirector (thuần) ─────────
test('director: quà từ khu khác → cắt ngay; cùng khu → chỉ gia hạn giữ', () => {
  const d = new ZoneDirector({ zones: Z, minDwellMs: 4000, giftHoldMs: 10000 });
  assert.deepEqual(d.gift('ben', { prio: 1, by: 'a' }, 1000), { zone: 'ben', reason: 'gift', by: 'a' });
  assert.equal(d.zone, 'ben');
  assert.equal(d.gift('ben', { prio: 5, by: 'b' }, 2000), null);
  assert.equal(d.holdUntil, 12000);
});

test('director: quà trong lúc chưa đủ thời gian giữ tối thiểu → xếp hàng, ưu tiên quà lớn, gộp cùng khu', () => {
  const d = new ZoneDirector({ zones: Z, minDwellMs: 4000 });
  d.gift('ben', { prio: 1, by: 'a' }, 0);
  assert.equal(d.gift('sau', { prio: 1, by: 'b' }, 1000), null);
  assert.equal(d.gift('dao', { prio: 99, by: 'c' }, 1500), null);
  assert.equal(d.gift('sau', { prio: 50, by: 'd' }, 2000), null); // gộp với 'sau', nâng ưu tiên
  assert.deepEqual(d.queue.map((q) => q.zone), ['dao', 'sau']);
  assert.equal(d.tick(3000, {}), null, 'chưa đủ 4 s');
  assert.deepEqual(d.tick(4000, {}), { zone: 'dao', reason: 'gift', by: 'c' });
  assert.deepEqual(d.tick(8000, {}), { zone: 'sau', reason: 'gift', by: 'd' });
});

test('director: hàng đợi có trần — bỏ quà giá trị thấp nhất', () => {
  const d = new ZoneDirector({ zones: ['a', 'b', 'c', 'd', 'e'], minDwellMs: 10000, queueMax: 2 });
  d.gift('b', { prio: 1 }, 0);
  d.gift('c', { prio: 1 }, 1); d.gift('d', { prio: 5 }, 2); d.gift('e', { prio: 3 }, 3);
  assert.deepEqual(d.queue.map((q) => q.zone), ['d', 'e']);
});

test('director: hết giữ, khu hiện tại vắng → tự sang khu đông nhất; còn người thì ở lại; khu lạ bị bỏ qua', () => {
  const d = new ZoneDirector({ zones: Z, minDwellMs: 1000, giftHoldMs: 5000 });
  assert.equal(d.tick(0, { cau: 2, sau: 5 }), null, 'khu hiện tại còn người');
  assert.deepEqual(d.tick(100, { sau: 5, dao: 1 }), { zone: 'sau', reason: 'auto', by: null });
  d.gift('dao', { by: 'x' }, 2000);
  assert.equal(d.tick(3000, { sau: 9 }), null, 'đang giữ sau quà');
  assert.deepEqual(d.tick(7000, { sau: 9 }), { zone: 'sau', reason: 'auto', by: null });
  assert.equal(d.gift('khong-co', {}, 9000), null);
});

// ───────── WorldCore ─────────
const quiet = new Logger({ level: 'error', stdout: false, toFile: false });
let seq = 0;
const ev = (raw, at) => normalize({ msgId: `z${++seq}`, createTime: at, roomId: 'r1', ...raw }, { receivedAt: at, source: 'mock', realm: 'demo', roomId: 'r1' });
const user = (uid) => ({ userId: uid, uniqueId: `u${uid}`, nickname: `Người ${uid}` });
const comment = (uid, text, at) => ev({ type: 'chat', user: user(uid), comment: text }, at);

async function setup(t) {
  const p = await makePersistence({}, { realm: 'demo' });
  const clock = { t: Date.UTC(2026, 10, 25, 3, 0, 0) };
  const now = () => clock.t;
  const gc = await new GameConfig({ persistence: p.client, logger: quiet }).load();
  const world = new WorldCore({ persistence: p.client, realm: 'demo', logger: quiet, gameConfig: gc, sessionId: () => 'S1', rand: rng(7), now, tickMs: 100 });
  await world.start({ timers: false });
  const journal = new GiftJournal({ persistence: p.client, realm: 'demo', logger: quiet, emergencyDir: join(p.dir, 'em'), config: { groupCommitMs: 5 }, effectResolver: gc.resolveGift });
  journal.onCommittedGift(world.onCommittedGift);
  await journal.start();
  const feed = [];
  world.on('feed', (f) => feed.push(f));
  const run = async (ms) => { for (let x = 0; x < ms; x += 100) { clock.t += 100; world.tick(); if (x % 1000 === 0) world.slowTick(); } await world.flush({ wait: true }); };
  t.after(async () => { await journal.close().catch(() => {}); await world.stop().catch(() => {}); await p.stop(); });
  return { gc, world, journal, feed, clock, run };
}

test('lệnh khu: nhận dạng không nhầm với "câu"; số/tên/đổi khu kế tiếp', () => {
  assert.deepEqual(matchCommand('khu cầu'), { cmd: 'zone', arg: 'cau' });
  assert.deepEqual(matchCommand('Khu 3'), { cmd: 'zone', arg: '3' });
  assert.deepEqual(matchCommand('đổi khu'), { cmd: 'zone', arg: '' });
  assert.equal(matchCommand('câu')?.cmd, 'join');
});

test('người mới được chia đều khu; tự đổi khu bằng chat; khu sai → nhắc cú pháp', async (t) => {
  const { world, feed, clock, run } = await setup(t);
  world.onEvents([comment('1', 'câu', clock.t), comment('2', 'câu', clock.t)]);
  await waitFor(() => world.counts().active === 2);
  const P1 = world.players.get('demo:1'); const P2 = world.players.get('demo:2');
  assert.notEqual(P1.zone, P2.zone, 'hai người đầu ở hai khu khác nhau');
  world.onEvents([comment('1', 'khu 3', clock.t)]);
  await waitFor(() => P1.zone === 'sau');
  assert.ok(feed.some((f) => f.type === 'zone_move' && f.zone === 'sau' && f.name === 'Hồ Sâu'));
  world.onEvents([comment('1', 'đổi khu', clock.t)]);
  await waitFor(() => P1.zone === 'dao');
  world.onEvents([comment('1', 'khu xyz', clock.t)]);
  await waitFor(() => feed.some((f) => f.type === 'notice' && /khu 1-4/.test(f.text)));
  assert.equal(P1.zone, 'dao');
  await run(1500);
  assert.equal(world.slots.includes('demo:1'), world.director.zone === 'dao', 'ô hiển thị chỉ chứa người của khu đang lên hình');
});

test('quà: camera cắt tới khu của người tặng; khung gửi đúng khu và chỉ người của khu đó', async (t) => {
  const { gc, world, journal, feed, clock, run } = await setup(t);
  await gc.setRules(sanitizeGiftRules({ ...gc.rules, rules: [{ giftId: 5, label: 'Hoa', actions: [{ type: 'xp', amount: 1 }] }] }));
  world.onEvents([comment('1', 'câu', clock.t), comment('2', 'câu', clock.t)]);
  await waitFor(() => world.counts().active === 2);
  world.onEvents([comment('2', 'khu đảo', clock.t)]);
  await waitFor(() => world.players.get('demo:2').zone === 'dao');
  await run(1500);
  assert.notEqual(world.director.zone, 'dao');
  const raw = { type: 'gift', msgId: 'zg-1', createTime: clock.t, roomId: 'r1', user: user('2'), giftId: 5, giftName: 'Hoa', diamondCount: 1, giftType: 2, repeatCount: 1, repeatEnd: true };
  await journal.receive(normalize(raw, { receivedAt: clock.t, source: 'mock', realm: 'demo', roomId: 'r1' }));
  await waitFor(() => feed.some((f) => f.type === 'zone' && f.zone === 'dao'), { what: 'cắt sang khu người tặng' });
  const z = feed.find((f) => f.type === 'zone' && f.zone === 'dao');
  assert.equal(z.reason, 'gift');
  assert.equal(z.player.key, 'demo:2');
  assert.equal(z.name, 'Đảo Ngọc');
  await run(1500);
  const f = world.frame();
  assert.equal(f.zone, 'dao');
  assert.equal(f.zoneName, 'Đảo Ngọc');
  assert.deepEqual(f.anglers.map((a) => a.k), ['demo:2']);
});
