// Benchmark gameplay THẬT (Worker + SQLite thật trong thư mục tạm): N cần thủ cùng câu, quà, Boss; đo tick, event loop, ghi DB, BXH.
// Dùng: node tools/game-bench.js --players 10000 --seconds 120 --gifts 50 [--out docs/evidence/game-bench-10000.json]
// Không tuyên bố đạt tải nếu chưa chạy: kết quả ghi ra JSON để dẫn chứng trong TEST_REPORT.
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { PersistenceClient } from '../src/data/PersistenceClient.js';
import { GiftJournal } from '../src/gifts/GiftJournal.js';
import { GameConfig } from '../src/game/GameConfig.js';
import { Leaderboards } from '../src/game/Leaderboards.js';
import { WorldCore } from '../src/game/WorldCore.js';
import { normalize } from '../src/ingest/Normalizer.js';
import { loadSettings } from '../src/system/Settings.js';
import { Logger } from '../src/system/Logger.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('players', 10000));
const SEC = Number(arg('seconds', 60));
const GPS = Number(arg('gifts', 20));
const OUT = arg('out', null);

const dir = mkdtempSync(join(tmpdir(), 'nova-bench-'));
const logger = new Logger({ level: 'warn', stdout: true, toFile: false });
const settings = loadSettings({ env: {} }).settings;
const p = new PersistenceClient({ dbPath: join(dir, 'nova-demo.db'), backupDir: join(dir, 'b'), rejectedDir: join(dir, 'r'), realm: 'demo', config: settings.persistence, logger: logger.child('persist') });
await p.start();
const gc = await new GameConfig({ persistence: p, logger }).load();
await gc.setConfig({ bossIntervalMin: 1, bossWarnSec: 10, autoEventEveryMin: 1 });
const world = new WorldCore({ persistence: p, realm: 'demo', logger: logger.child('world'), gameConfig: gc, sessionId: () => 'bench' });
const journal = new GiftJournal({ persistence: p, realm: 'demo', logger: logger.child('gifts'), emergencyDir: join(dir, 'em'), effectResolver: gc.resolveGift });
journal.onCommittedGift(world.onCommittedGift);
await world.start();
await journal.start();
const lb = new Leaderboards({ persistence: p, sessionId: () => 'bench', logger });
const lbTimes = [];
const feedCounts = {};
world.on('feed', (f) => { feedCounts[f.type] = (feedCounts[f.type] || 0) + 1; });

const elu = monitorEventLoopDelay({ resolution: 10 });
let seq = 0;
const ev = (raw) => normalize({ msgId: `b${++seq}`, createTime: Date.now(), roomId: 'bench', ...raw }, { receivedAt: Date.now(), source: 'loadgen', realm: 'demo', roomId: 'bench' });
const user = (i) => ({ userId: String(i), uniqueId: `u${i}`, nickname: `Cần thủ ${i}` });

console.log(`Bench: ${N} cần thủ, ${SEC}s, ${GPS} quà/s — DB tạm ${dir}`);
const t0 = Date.now();
for (let i = 0; i < N; i += 1000) {
  world.onEvents(Array.from({ length: Math.min(1000, N - i) }, (_, k) => ev({ type: 'chat', user: user(i + k), comment: 'câu' })));
  await new Promise((r) => setTimeout(r, 20));
}
while (world.counts().active < N && Date.now() - t0 < 120000) await new Promise((r) => setTimeout(r, 100));
const joinMs = Date.now() - t0;
console.log(`Đã vào: ${world.counts().active} ACTIVE sau ${joinMs} ms`);
world.tickStats.length = 0; world.c.tickMsMax = 0;
elu.enable();
const GIFTS = [[5655, 1], [5269, 1], [5487, 5], [8913, 15], [6427, 99], [6064, 1]];
const giftTimer = GPS > 0 ? setInterval(() => {
  for (let k = 0; k < GPS / 10; k++) {
    const [giftId, d] = GIFTS[Math.floor(Math.random() * GIFTS.length)];
    journal.receive(ev({ type: 'gift', user: user(Math.floor(Math.random() * N)), giftId, giftName: 'g', diamondCount: d, giftType: 2, repeatCount: 1, repeatEnd: true }));
  }
}, 100) : null;
const keepAlive = setInterval(() => { const ks = []; for (let k = 0; k < Math.max(1, N / 200); k++) ks.push(ev({ type: 'chat', user: user(Math.floor(Math.random() * N)), comment: 'kéo' })); world.onEvents(ks); }, 1000);
const lbTimer = setInterval(async () => { const a = Date.now(); await lb.refresh(); lbTimes.push(Date.now() - a); }, 3000);
const samples = [];
const sampler = setInterval(() => {
  const pm = p.metrics();
  samples.push({ t: Date.now() - t0, heapMb: Math.round(process.memoryUsage().heapUsed / 1048576), rssMb: Math.round(process.memoryUsage().rss / 1048576),
    unackedMs: pm.oldestUnackedBatchAgeMs, writeOps: pm.writeBufferOps, active: world.counts().active, fpm: world.catchTimes.length });
}, 5000);
const tStart = Date.now();
const frameSizes = [];
const frameTimer = setInterval(() => frameSizes.push(JSON.stringify(world.frame()).length), 1000);
await new Promise((r) => setTimeout(r, SEC * 1000));
clearInterval(giftTimer); clearInterval(keepAlive); clearInterval(lbTimer); clearInterval(sampler); clearInterval(frameTimer);
elu.disable();
const wm = world.metrics();
await journal.close();
await world.stop();
const inv = (await p.read('score_invariants'))[0];
const ginv = (await p.read('gift_invariants'))[0];
const stats = (await p.read('game_stats', { dayStartUtc: 0 }))[0];
await p.close({ deadlineMs: 10000 });
const dbBytes = statSync(join(dir, 'nova-demo.db')).size;
const q = (arr, x) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(x * s.length))] : null; };
const res = {
  date: new Date().toISOString(), node: process.version, platform: `${process.platform}/${process.arch}`,
  players: N, seconds: SEC, giftsPerSec: GPS, joinMs,
  tickMs: wm.tickMs, eventLoopDelayMs: { p50: Math.round(elu.percentile(50) / 1e4) / 100, p95: Math.round(elu.percentile(95) / 1e4) / 100, p99: Math.round(elu.percentile(99) / 1e4) / 100, max: Math.round(elu.max / 1e4) / 100 },
  catchesPerMin: Math.round(stats.catches / ((Date.now() - tStart) / 60000)), catches: stats.catches, giftsApplied: stats.gifts, bosses: stats.bosses,
  leaderboardRefreshMs: { p50: q(lbTimes, 0.5), p95: q(lbTimes, 0.95), max: Math.max(0, ...lbTimes) },
  stageFrameBytes: { p50: q(frameSizes, 0.5), max: Math.max(0, ...frameSizes) },
  invariants: { ledgerEqLbAll: inv.ledger === inv.lbAll, ledgerEqPlayers: inv.ledger === inv.players, catchesEq: inv.catches === inv.catchesTotal, giftDup: ginv.ledgerDupSources, giftPending: ginv.pending },
  feed: feedCounts, worldCounters: wm.counters, samples, dbMb: Math.round(dbBytes / 1048576 * 10) / 10
};
console.log(JSON.stringify(res, null, 2));
if (OUT) writeFileSync(OUT, `${JSON.stringify(res, null, 2)}\n`);
rmSync(dir, { recursive: true, force: true });
await logger.close();
