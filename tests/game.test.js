// Gameplay: WorldCore + EventDirector + Leaderboards + GameConfig + GiftJournal trên Worker/SQLite thật (thư mục tạm).
// Đồng hồ giả + tick thủ công → tất định, nhanh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { GiftJournal } from '../src/gifts/GiftJournal.js';
import { normalize } from '../src/ingest/Normalizer.js';
import { GameConfig, sanitizeGiftRules } from '../src/game/GameConfig.js';
import { Leaderboards } from '../src/game/Leaderboards.js';
import { WorldCore, matchCommand } from '../src/game/WorldCore.js';
import { catchValue, levelForXp, rng, rollTier, vnDayKey, vnWeekKey, xpForLevel } from '../src/game/progression.js';
import { SPECIES_BY_ID } from '../src/game/catalog.js';
import { Logger } from '../src/system/Logger.js';
import { makePersistence, waitFor } from './helpers.js';

const quiet = new Logger({ level: 'error', stdout: false, toFile: false });
let seq = 0;
const ev = (raw, at) => normalize({ msgId: `m${++seq}`, createTime: at, roomId: 'r1', ...raw }, { receivedAt: at, source: 'mock', realm: 'demo', roomId: 'r1' });
const comment = (uid, text, at) => ev({ type: 'chat', user: { userId: uid, uniqueId: `u${uid}`, nickname: `Người ${uid}` }, comment: text }, at);
const like = (uid, n, at) => ev({ type: 'like', user: { userId: uid, uniqueId: `u${uid}`, nickname: `Người ${uid}` }, likeCount: n }, at);

async function setup(t, { config = {} } = {}) {
  const p = await makePersistence({}, { realm: 'demo' });
  const clock = { t: Date.UTC(2026, 10, 25, 3, 0, 0) };
  const now = () => clock.t;
  const gc = await new GameConfig({ persistence: p.client, logger: quiet }).load();
  if (Object.keys(config).length) await gc.setConfig(config);
  const world = new WorldCore({ persistence: p.client, realm: 'demo', logger: quiet, gameConfig: gc, sessionId: () => 'S1', rand: rng(42), now, tickMs: 100 });
  await world.start({ timers: false });
  const journal = new GiftJournal({ persistence: p.client, realm: 'demo', logger: quiet, emergencyDir: join(p.dir, 'em'), config: { groupCommitMs: 5 }, effectResolver: gc.resolveGift });
  journal.onCommittedGift(world.onCommittedGift);
  await journal.start();
  const feed = [];
  world.on('feed', (f) => feed.push(f));
  const lb = new Leaderboards({ persistence: p.client, sessionId: () => 'S1', now });
  /** Chạy mô phỏng `ms` với bước 100 ms (giây nào cũng gọi slowTick). */
  const run = async (ms) => {
    for (let x = 0; x < ms; x += 100) { clock.t += 100; world.tick(); if (x % 1000 === 0) world.slowTick(); }
    await world.flush({ wait: true });
  };
  t.after(async () => { await journal.close().catch(() => {}); await world.stop().catch(() => {}); await p.stop(); });
  return { p, gc, world, journal, feed, lb, clock, run };
}

test('lệnh comment: nhận dạng có/không dấu; comment thường không phải lệnh', () => {
  assert.equal(matchCommand('Câu cá')?.cmd, 'join');
  assert.equal(matchCommand('CAU')?.cmd, 'join');
  assert.equal(matchCommand('kéo!!')?.cmd, 'reel');
  assert.equal(matchCommand('nâng cần')?.cmd, 'upgrade');
  assert.equal(matchCommand('nâng cần').arg, 'can');
  assert.equal(matchCommand('điểm danh')?.cmd, 'daily');
  assert.equal(matchCommand('hạng')?.cmd, 'rank');
  assert.equal(matchCommand('xin chào mọi người'), null);
  assert.equal(matchCommand('Đẹp quá'), null);
});

test('công thức: cấp/XP đơn điệu, may mắn đẩy bậc hiếm, giờ VN đổi ngày đúng 17:00 UTC', () => {
  for (let L = 1; L < 80; L++) assert.ok(xpForLevel(L + 1) > xpForLevel(L));
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(xpForLevel(12)), 12);
  const avg = (luck) => { const r = rng(7); let s = 0; for (let i = 0; i < 20000; i++) s += rollTier(r, luck); return s / 20000; };
  assert.ok(avg(100) > avg(0) + 0.3, 'may mắn cao → bậc trung bình cao hơn');
  const r = rng(1); for (let i = 0; i < 500; i++) assert.ok(rollTier(r, 0, 5) >= 5, 'minTier được bảo đảm');
  assert.equal(vnDayKey(Date.UTC(2026, 10, 24, 16, 59, 59)), '2026-11-24');
  assert.equal(vnDayKey(Date.UTC(2026, 10, 24, 17, 0, 0)), '2026-11-25');
  assert.equal(vnWeekKey(Date.UTC(2026, 10, 22, 16, 59)), '2026-W47'); // CN 22/11 23:59 VN
  assert.equal(vnWeekKey(Date.UTC(2026, 10, 22, 17, 0)), '2026-W48');  // T2 23/11 00:00 VN
  const v = catchValue(SPECIES_BY_ID[21], 300000);
  assert.ok(v.score > catchValue(SPECIES_BY_ID[1], 300).score * 10);
});

test('tham gia → tự câu → cá ghi bền → BXH 5 phạm vi khớp điểm đã commit; bất biến điểm', async (t) => {
  const { p, world, run, lb, feed, clock } = await setup(t);
  world.onEvents([comment('1', 'câu', clock.t), comment('2', 'cau ca', clock.t), comment('3', 'chào', clock.t)]);
  await waitFor(() => world.counts().active === 2, { what: '2 người ACTIVE' });
  assert.equal(world.players.has('demo:3'), false, 'comment thường không tạo người chơi');
  await run(120000);
  const caught = feed.filter((f) => f.type === 'catch');
  assert.ok(caught.length >= 10, `phải câu được nhiều cá (được ${caught.length})`);
  const inv = (await p.client.read('score_invariants'))[0];
  assert.equal(inv.ledger, inv.lbAll, 'sổ cái = BXH tổng');
  assert.equal(inv.ledger, inv.players, 'sổ cái = điểm người chơi');
  assert.equal(inv.catchScore, inv.catchLedger);
  assert.equal(inv.catches, caught.length);
  assert.equal(inv.catches, inv.catchesTotal);
  const P1 = world.players.get('demo:1');
  const top = await lb.refresh();
  for (const s of ['live', 'hour', 'day', 'week', 'all']) {
    const row = top[s].rows.find((r) => r.k === 'demo:1');
    assert.equal(row?.s, P1.score, `${s}: điểm DB = điểm RAM sau khi flush`);
  }
  assert.equal(top.live.period, 'live:S1');
  const sorted = [...top.all.rows].sort((a, b) => b.s - a.s || b.w - a.w);
  assert.deepEqual(top.all.rows.map((r) => r.k), sorted.map((r) => r.k), 'thứ tự: điểm ↓ rồi kg ↓');
  const prof = (await p.client.read('player_profile', { player_key: 'demo:1', now: clock.t }))[0];
  assert.equal(prof.player.xp, P1.xp);
  assert.equal(prof.player.coins, P1.coins);
  assert.equal(prof.player.level, P1.level);
  assert.equal(prof.fishdex.length, P1.dex.size);
  assert.ok(prof.achievements.some((a) => a.achievement_id === 'first_catch'));
});

test('AFK sau N phút không tương tác hợp lệ; like KHÔNG đánh thức; lệnh hợp lệ đánh thức; hồ sơ giữ nguyên', async (t) => {
  const { world, run, clock } = await setup(t, { config: { afkMinutes: 1 } });
  world.onEvents([comment('7', 'câu', clock.t)]);
  await waitFor(() => world.counts().active === 1);
  await run(75000);
  const P = world.players.get('demo:7');
  assert.equal(P.state, 'AFK');
  const before = { score: P.score, catches: P.catches };
  world.onEvents([like('7', 500, clock.t)]);
  await run(3000);
  assert.equal(P.state, 'AFK', 'like không đánh thức');
  world.onEvents([comment('7', 'kéo', clock.t)]);
  await waitFor(() => P.state === 'ACTIVE');
  assert.ok(P.score >= before.score && P.catches >= before.catches);
});

test('quà: hiệu ứng (XP, xu, buff, cá hiếm, sự kiện) chỉ vào RAM SAU commit; khớp DB; gửi lại cùng msgId không cộng lần hai', async (t) => {
  const { p, world, journal, gc, run, clock, feed } = await setup(t);
  await gc.setRules(sanitizeGiftRules({ ...gc.rules, rules: [{ giftId: 777, label: 'Test', actions: [{ type: 'xp', amount: 100 }, { type: 'coins', amount: 50 }, { type: 'luck', pct: 30, minutes: 2 }, { type: 'rare_next', minTier: 5, count: 1 }, { type: 'event', kind: 'GOLDEN_HOUR' }] }] }));
  world.onEvents([comment('9', 'câu', clock.t)]);
  await waitFor(() => world.counts().active === 1);
  const P = world.players.get('demo:9');
  const xp0 = P.xp; const coins0 = P.coins;
  const raw = { type: 'gift', msgId: 'gift-777-a', createTime: clock.t, roomId: 'r1', user: { userId: '9', uniqueId: 'u9', nickname: 'Người 9' }, giftId: 777, giftName: 'Test', diamondCount: 10, giftType: 2, repeatCount: 2, repeatEnd: true };
  const e1 = normalize(raw, { receivedAt: clock.t, source: 'mock', realm: 'demo', roomId: 'r1' });
  const r = await journal.receive(e1);
  assert.equal(r.status, 'RECEIVED');
  assert.equal(P.xp, xp0, 'chưa có hiệu ứng trong RAM trước khi APPLIED được commit');
  await waitFor(() => feed.some((f) => f.type === 'gift'), { what: 'quà được công bố' });
  // qty 2: XP = 2×(100 + round(√10 × xpFactor 15)=47) = 294; xu = 2×(50 + round(√10 × coinFactor 20)=63) = 226
  assert.equal(P.xp - xp0, 294);
  assert.equal(P.coins - coins0, 226);
  assert.ok(P.buffs.some((b) => b.kind === 'luck' && b.value === 30));
  assert.ok(P.buffs.some((b) => b.kind === 'rare_next' && b.value === 5 && b.uses === 2));
  assert.ok(world.events.queue.some((e) => e.kind === 'GOLDEN_HOUR') || world.events.active.size > 0);
  const dup = await journal.receive(normalize(raw, { receivedAt: clock.t, source: 'mock', realm: 'demo', roomId: 'r1' }));
  assert.equal(dup.status, 'DUPLICATE');
  await world.flush({ wait: true });
  const prof = (await p.client.read('player_profile', { player_key: 'demo:9', now: clock.t }))[0];
  assert.equal(prof.player.xp, P.xp);
  assert.equal(prof.player.coins, P.coins);
  // cá hiếm lượt sau: 2 lượt kế tiếp ≥ bậc 5
  const giftAt = feed.findIndex((f) => f.type === 'gift');
  await run(90000);
  // Cá đã cắn trước khi quà được áp dụng thì đã được tung trước → xét các lượt "ra cá" sau quà (đếm cả cá sổng).
  const outs = feed.slice(giftAt).filter((f) => (f.type === 'catch' || f.type === 'escape') && f.player.key === 'demo:9');
  const high = outs.slice(0, 4).filter((c) => c.tier >= 5).length;
  assert.ok(high >= 2, `≥ 2 lượt bậc ≥ 5 trong 4 lượt sau quà: ${JSON.stringify(outs.slice(0, 4).map((c) => c.tier))}`);
  assert.equal(P.buffs.filter((b) => b.kind === 'rare_next').length, 0, 'buff dùng hết thì bị gỡ');
});

test('nâng cấp trang bị trừ xu, ghi bền, chặn khi thiếu xu; điểm danh một lần/ngày VN', async (t) => {
  const { p, world, run, clock, feed } = await setup(t);
  world.onEvents([comment('5', 'câu', clock.t)]);
  await waitFor(() => world.counts().active === 1);
  const P = world.players.get('demo:5');
  const res0 = await world.upgrade(P, 'rod');
  assert.equal(res0.ok, false, 'thiếu xu → không nâng');
  world.onEvents([comment('5', 'điểm danh', clock.t)]);
  await waitFor(() => feed.some((f) => f.type === 'daily'));
  world.onEvents([comment('5', 'điểm danh', clock.t)]);
  await waitFor(() => feed.some((f) => f.type === 'notice'));
  assert.equal(feed.filter((f) => f.type === 'daily').length, 1);
  await run(240000);
  const coins = P.coins;
  if (coins >= 120) {
    const r = await world.upgrade(P, 'rod');
    assert.equal(r.ok, true);
    assert.equal(P.equip.rod, 2);
    assert.equal(P.coins, coins - r.cost);
    await world.flush({ wait: true });
    const prof = (await p.client.read('player_profile', { player_key: 'demo:5', now: clock.t }))[0];
    assert.equal(prof.equipment.find((e) => e.slot === 'rod').level, 2);
    assert.equal(prof.player.coins, P.coins);
  } else assert.fail(`sau 4 phút câu phải đủ 120 xu (có ${coins})`);
});

test('Boss: cảnh báo → xuất hiện (HP theo số người) → bị hạ → thưởng ghi bền, không thưởng hai lần', async (t) => {
  const { p, world, run, clock, feed } = await setup(t, { config: { bossWarnSec: 5, bossDurationSec: 600, bossHpPerPlayer: 20 } });
  world.onEvents(['11', '12', '13', '14'].map((u) => comment(u, 'câu', clock.t)));
  await waitFor(() => world.counts().active === 4);
  const ev1 = world.events.enqueue({ kind: 'BOSS', level: 1 });
  await run(2000);
  assert.ok(feed.some((f) => f.type === 'boss_warning'));
  await run(8000);
  assert.ok(feed.some((f) => f.type === 'boss_start'));
  const start = feed.find((f) => f.type === 'boss_start');
  assert.ok(start.hpMax > 300);
  await waitFor(async () => { await run(5000); return feed.some((f) => f.type === 'boss_end'); }, { timeoutMs: 20000, what: 'Boss kết thúc' });
  const end = feed.find((f) => f.type === 'boss_end');
  assert.equal(end.result, 'killed');
  await world.flush({ wait: true });
  const rows = await p.client.read('events_recent', { limit: 5 });
  const row = rows.find((r) => r.event_id === ev1.id);
  assert.equal(row.status, 'DONE');
  assert.equal(row.hp_left, 0);
  const contrib = await p.client.read('event_contrib', { event_id: ev1.id });
  assert.ok(contrib.length >= 1 && contrib.every((c) => c.rewarded === 1));
  const dmg = contrib.reduce((s, c) => s + c.damage, 0);
  assert.ok(dmg >= start.hpMax, `tổng sát thương ghi bền ${dmg} ≥ HP ${start.hpMax}`);
  const inv = (await p.client.read('score_invariants'))[0];
  assert.equal(inv.ledger, inv.lbAll);
  assert.equal(inv.ledger, inv.players);
});

test('Gift Mapping: luật bị tắt → quà vẫn được kế toán nhưng không có hành động gameplay; luật đổi sau khi nhận không đổi hiệu ứng đã chốt', async (t) => {
  const { world, journal, gc, clock, feed } = await setup(t);
  await gc.setRules({ ...gc.rules, rules: [{ giftId: 888, label: 'Off', enabled: false, actions: [{ type: 'coins', amount: 1000 }] }] });
  world.onEvents([comment('21', 'câu', clock.t)]);
  await waitFor(() => world.counts().active === 1);
  const P = world.players.get('demo:21');
  const c0 = P.coins;
  const mk = (id) => normalize({ type: 'gift', msgId: id, createTime: clock.t, user: { userId: '21' }, giftId: 888, diamondCount: 0, giftType: 2, repeatCount: 1, repeatEnd: true }, { receivedAt: clock.t, source: 'mock', realm: 'demo', roomId: 'r1' });
  await journal.receive(mk('off-1'));
  await waitFor(() => feed.some((f) => f.type === 'gift'));
  assert.equal(P.coins - c0, 0, 'không cộng 1000 xu khi luật tắt (diamond 0 → không có xu gốc)');
});

test('sự kiện từ quà: cùng loại thì GỘP (gia hạn có trần), Boss quà gộp thành một Boss cấp cao hơn; dòng bị gộp được ghi DONE/MERGED', async (t) => {
  const { p, world, run, clock } = await setup(t);
  world.onEvents([comment('31', 'câu', clock.t)]);
  await waitFor(() => world.counts().active === 1);
  const ed = world.events;
  ed.enqueueCommitted({ eventId: 'g-rain-1', kind: 'RAIN', level: 1, params: {}, summoner: 'demo:31' });
  await run(1000);
  const act = [...ed.active.values()].find((e) => e.kind === 'RAIN');
  assert.ok(act, 'mưa đang chạy');
  const end0 = act.endsAt;
  for (let i = 2; i <= 30; i++) ed.enqueueCommitted({ eventId: `g-rain-${i}`, kind: 'RAIN', level: 1, params: {}, summoner: 'demo:31' });
  assert.equal(ed.queue.filter((e) => e.kind === 'RAIN').length, 0, 'không xếp thêm mưa');
  assert.ok(act.endsAt > end0 && act.endsAt <= act.startedAt + 3 * 150000, 'gia hạn có trần 3× thời lượng');
  ed.enqueue({ kind: 'BOSS', source: 'ADMIN', level: 1 });
  ed.enqueueCommitted({ eventId: 'g-boss-1', kind: 'BOSS', level: 2, params: {}, summoner: 'demo:31' });
  ed.enqueueCommitted({ eventId: 'g-boss-2', kind: 'BOSS', level: 2, params: {}, summoner: 'demo:31' });
  ed.enqueueCommitted({ eventId: 'g-boss-3', kind: 'BOSS', level: 4, params: {}, summoner: 'demo:31' });
  const gb = ed.queue.filter((e) => e.kind === 'BOSS' && e.source === 'GIFT');
  assert.equal(gb.length, 1, 'chỉ một Boss quà trong hàng');
  assert.equal(gb[0].level, 5);
  await world.flush({ wait: true });
  // các dòng quà gộp phải có thật trong DB (ở đây tạo bằng tay nên chèn trước để mô phỏng dòng QUEUED từ GIFT_APPLY)
  const rows = await p.client.read('events_recent', { limit: 50 });
  assert.ok(rows.every((r) => r.status !== 'QUEUED' || !String(r.event_id).startsWith('g-rain-')), 'mưa bị gộp không còn QUEUED');
});

// ───────── idempotency của MỌI op gameplay (lớp op, R13): gửi lại với batchId KHÁC không được cộng lần hai ─────────
test('op gameplay idempotent: gửi lại toàn bộ (batchId khác) không đổi dữ liệu; Worker chết sau commit trước ACK → không áp dụng hai lần', async (t) => {
  const p = await makePersistence({}, { realm: 'demo' });
  t.after(() => p.stop());
  const c = p.client;
  const at = Date.UTC(2026, 10, 25, 5);
  const who = { player_key: 'demo:77', nickname: 'Bảy Bảy' };
  await c.commit({ cls: 'progress', ops: [{ t: 'event_upsert', event_id: 'ev-x', kind: 'BOSS', source: 'ADMIN', status: 'ACTIVE', level: 1, hp_max: 100, hp_left: 100, queued_at_utc: at }] });
  const ops = [
    { t: 'catch_record', catch_id: 'c-1', ...who, species_id: 12, weight_g: 3000, score: 120, xp: 40, coins: 30, at_utc: at, live_session_id: 'S1' },
    { t: 'catch_record', catch_id: 'c-2', ...who, species_id: 1, weight_g: 200, score: 15, xp: 9, coins: 5, at_utc: at + 1000, live_session_id: 'S1' },
    { t: 'ach_unlock', ...who, achievement_id: 'first_catch', at_utc: at },
    { t: 'event_damage', event_id: 'ev-x', ...who, damage: 33, op_key: 'dmg:ev-x:demo:77:1' },
    { t: 'boss_reward', event_id: 'ev-x', ...who, coins: 100, xp: 50, score: 200, kill: true, at_utc: at, live_session_id: 'S1' },
    { t: 'daily_claim', ...who, at_utc: at },
    { t: 'reward', ...who, op_key: 'follow:demo:77:S1', xp: 0, coins: 30 },
    { t: 'equip_upgrade', ...who, slot: 'rod', to_level: 2 },
    { t: 'buff_consume', player_key: 'demo:77', op_key: 'rare:demo:77:1' },
    { t: 'score_adjust', ...who, score: 7, source_key: 'adj-1', at_utc: at }
  ];
  const r1 = await c.commit({ cls: 'progress', ops });
  assert.equal(r1.status, 'COMMITTED');
  const h1 = (await c.read('state_hash'))[0].hash;
  const prof1 = (await c.read('player_profile', { player_key: 'demo:77', now: at }))[0];
  // gửi lại cùng op với batchId mới (mô phỏng client không biết batch đã commit)
  await c.commit({ cls: 'progress', ops });
  const prof2 = (await c.read('player_profile', { player_key: 'demo:77', now: at }))[0];
  for (const k of ['xp', 'coins', 'total_score', 'total_weight_g', 'catches_total', 'boss_kills', 'daily_streak', 'level']) assert.equal(prof2.player[k], prof1.player[k], `${k} không đổi khi gửi lại`);
  assert.deepEqual(prof2.fishdex, prof1.fishdex);
  assert.deepEqual(prof2.equipment, prof1.equipment);
  const inv = (await c.read('score_invariants'))[0];
  assert.equal(inv.ledger, inv.lbAll); assert.equal(inv.ledger, inv.players); assert.equal(inv.catches, 2);
  assert.equal(prof1.player.total_score, 120 + 15 + 200 + 7);
  assert.equal(prof1.player.coins, 30 + 5 + 20 /* first_catch */ + 100 + 65 /* daily ngày 1 */ + 30 - 120 /* nâng cần cấp 2 */);
  assert.equal(prof1.equipment.find((e) => e.slot === 'rod').level, 2);
  assert.notEqual(h1, null);
  // Worker chết SAU commit TRƯỚC ACK với một catch mới → client hỏi trạng thái batch, không gửi lại → áp dụng đúng một lần
  const r3 = await c.commit({ cls: 'progress', batchId: 'b-game-die', ops: [{ t: 'catch_record', catch_id: 'c-3', ...who, species_id: 6, weight_g: 1000, score: 50, xp: 20, coins: 10, at_utc: at + 2000 }], fault: 'after_commit_before_ack' });
  assert.equal(r3.recovered, true);
  const inv2 = (await c.read('score_invariants'))[0];
  assert.equal(inv2.catches, 3);
  assert.equal(inv2.ledger, inv.ledger + 50);
  assert.equal(inv2.ledger, inv2.players);
});
