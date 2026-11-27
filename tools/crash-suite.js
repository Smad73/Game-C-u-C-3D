#!/usr/bin/env node
// Bộ kiểm thử crash dưới tải (Phase 2): CR1 (SIGKILL tiến trình thật), CR2 (giết Worker thật — worker.terminate — giữa batch critical &
// progress), CR8-tải (chèn lỗi ranh giới GB ngẫu nhiên khi đang tải). Không thuộc `npm test` (chạy lâu). Chỉ realm DEMO, thư mục tạm.
//   node tools/crash-suite.js [--kills 50] [--cr2 10] [--cr8 10] [--out report.json]
// Mỗi kết quả là SỐ ĐO thực tế; không suy ra "không mất dữ liệu". Windows (taskkill /F): chưa chạy (Windows Validation).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { OPS } from '../src/shared/persistence-protocol.js';
import { Logger } from '../src/system/Logger.js';
import { buildStack } from './load-generator.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const KILLS = Number(args.kills ?? 50); const CR2N = Number(args.cr2 ?? 10); const CR8N = Number(args.cr8 ?? 10);
const quiet = new Logger({ level: 'error', stdout: false, toFile: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rnd = (a, b) => a + Math.random() * (b - a);
const say = (s) => process.stdout.write(s + '\n');

async function checkInvariants(client, view) {
  const inv = (await client.read('gift_invariants'))[0];
  const totals = await client.read('gift_totals');
  return {
    I1: inv.ledgerDupSources === 0 && inv.totalsOps === inv.ledgerRows && inv.ledgerWithoutApplied === 0,
    I2: inv.pending === 0,
    I3: inv.ledgerQty === inv.appliedQty && inv.ledgerCoins === inv.appliedCoins && inv.playerQty === inv.ledgerQty && inv.playerCoins === inv.ledgerCoins,
    I9: view ? JSON.stringify(view.toRows()) === JSON.stringify(totals) : null,
    raw: inv
  };
}

/** Khởi động lại (không tải) trên thư mục dữ liệu: dựng RAM từ DB → nhập khẩn cấp → replay. Trả bất biến + RTO. */
async function recoverAndCheck(dir) {
  const t0 = performance.now();
  const s = await buildStack({ dir, logger: quiet, scenario: {} });
  const rtoMs = Math.round(performance.now() - t0);
  for (let i = 0; i < 200 && ((await s.client.read('gift_invariants'))[0].pending > 0 || s.journal.inflight.size); i++) await sleep(25);
  const inv = await checkInvariants(s.client, s.view);
  const keys = new Map((await s.client.read('gift_keys_since', { sinceUtc: 0 })).map((r) => [r.gift_key, r.status]));
  await s.pipeline.stop(); await s.journal.close(); await s.client.close();
  return { inv, rtoMs, restoreMs: s.restoreMs, replayed: s.restore.replayed, keys };
}

function readEmitted(dir) {
  const p = join(dir, 'emitted.log');
  if (!existsSync(p)) return new Map();
  const m = new Map();
  for (const line of readFileSync(p, 'utf8').split('\n')) { if (!line) continue; const [k, ts] = line.split('\t'); if (!m.has(k)) m.set(k, Number(ts)); }
  return m;
}

// ───────── CR1: SIGKILL tiến trình thật khi tải 1.000 comment/s + 200 quà/s ─────────
async function cr1() {
  const dir = mkdtempSync(join(tmpdir(), 'nova-cr1-'));
  const cycles = [];
  let accounted = new Set();
  for (let k = 0; k < KILLS; k++) {
    const child = spawn(process.execPath, [join(here, 'crash-child.js'), dir, String(k + 1), '1000', '200'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let ready = null; let err = '';
    child.stdout.on('data', (d) => { const m = /READY (\{.*\})/.exec(String(d)); if (m) ready = JSON.parse(m[1]); });
    child.stderr.on('data', (d) => { err += d; });
    for (let i = 0; i < 400 && !ready && child.exitCode === null; i++) await sleep(25);
    if (!ready) { say(`CR1 #${k + 1}: tiến trình con không sẵn sàng: ${err.slice(0, 300)}`); child.kill('SIGKILL'); cycles.push({ k, error: 'NOT_READY' }); continue; }
    await sleep(rnd(800, 3000));
    let status = null; try { status = JSON.parse(readFileSync(join(dir, 'status.json'), 'utf8')); } catch { /* chưa có */ }
    const killAt = Date.now();
    child.kill('SIGKILL');
    await new Promise((r) => child.once('exit', r));
    const rec = await recoverAndCheck(dir);
    const emitted = readEmitted(dir);
    const lost = []; let weakOrRejected = 0;
    for (const [key, ts] of emitted) {
      if (accounted.has(key)) continue;
      if (!rec.keys.has(key)) lost.push(killAt - ts); else weakOrRejected += rec.keys.get(key) === 'REJECTED' ? 1 : 0;
    }
    accounted = new Set(emitted.keys());
    const cyc = { k: k + 1, childRestoreMs: ready.restoreMs, childReplayedAtStart: ready.replayed, recoveryRtoMs: rec.rtoMs, replayedAfterKill: rec.replayed,
      lostGifts: lost.length, lostAgeMsMax: lost.length ? Math.max(...lost) : 0, alarmAtKill: status?.unpersisted ?? null, I1: rec.inv.I1, I2: rec.inv.I2, I3: rec.inv.I3, I9: rec.inv.I9 };
    cycles.push(cyc);
    say(`CR1 #${cyc.k}: mất=${cyc.lostGifts} (≤${cyc.lostAgeMsMax}ms trước kill; cảnh báo lúc kill=${JSON.stringify(cyc.alarmAtKill)}) replay=${cyc.replayedAfterKill} RTO=${cyc.recoveryRtoMs}ms I1=${cyc.I1} I2=${cyc.I2} I3=${cyc.I3} I9=${cyc.I9}`);
  }
  const ok = cycles.filter((c) => !c.error);
  const losts = ok.map((c) => c.lostGifts); const ages = ok.map((c) => c.lostAgeMsMax); const rtos = ok.map((c) => c.recoveryRtoMs);
  return { dir, kills: cycles.length, errors: cycles.filter((c) => c.error).length, allI1: ok.every((c) => c.I1), allI2: ok.every((c) => c.I2), allI3: ok.every((c) => c.I3), allI9: ok.every((c) => c.I9),
    lostGiftsPerKill: { p50: q(losts, 0.5), p95: q(losts, 0.95), max: q(losts, 1), total: losts.reduce((a, b) => a + b, 0) },
    lostAgeMs: { p50: q(ages, 0.5), p95: q(ages, 0.95), max: q(ages, 1) }, rtoMs: { p50: q(rtos, 0.5), p95: q(rtos, 0.95), max: q(rtos, 1) },
    alarmVsActual: ok.map((c) => ({ alarm: c.alarmAtKill?.count ?? null, actual: c.lostGifts })), cycles };
}

// ───────── CR2: giết Worker thật (terminate) giữa batch critical & progress, tiến trình còn sống ─────────
async function cr2() {
  const dir = mkdtempSync(join(tmpdir(), 'nova-cr2-'));
  const s = await buildStack({ dir, logger: quiet, scenario: { users: 1000, commentsPerSec: 1000, giftsPerSec: 200, likesPerSec: 200, seed: 99, streakStepMs: 150 }, persistCfg: { restartBackoffMs: 50 } });
  const emitted = new Set();
  const { normalize } = await import('../src/ingest/Normalizer.js');
  s.connector.prependListener('raw', (raw, meta) => { if (raw.type === 'gift') { try { emitted.add(normalize(raw, meta).payload.gift_key); } catch { /* lỗi */ } } });
  // người chơi cho batch progress
  await s.client.commit({ cls: 'progress', ops: Array.from({ length: 10 }, (_, i) => ({ t: OPS.UPSERT_PLAYER, player_key: `demo:p${i}`, realm: 'demo', external_id: `p${i}` })) });
  let expected = 0; let seq = 0; const progress = [];
  const pt = setInterval(() => {
    const ops = Array.from({ length: 20 }, () => { const d = 1 + (seq % 7); expected += d; return { t: OPS.ADD_PLAYER_SCORE, player_key: `demo:p${seq % 10}`, delta: d, op_key: `cr2:score:${seq++}` }; });
    progress.push(s.client.commit({ cls: 'progress', ops }));
  }, 50);
  await s.pipeline.connect();
  let kills = 0;
  for (let i = 0; i < CR2N; i++) {
    await sleep(rnd(300, 900));
    if (s.client.worker) { await s.client.worker.terminate(); kills++; }
  }
  await sleep(1500);
  clearInterval(pt);
  await s.pipeline.stop();
  await Promise.allSettled(progress);
  await s.journal.close({ deadlineMs: 20000 });
  for (let i = 0; i < 200 && s.client.state !== 'READY'; i++) await sleep(25);
  await s.journal.recover?.().catch(() => {});
  const score = (await Promise.all(Array.from({ length: 10 }, (_, i) => s.client.read('get_player', { player_key: `demo:p${i}` })))).reduce((a, r) => a + r[0].total_score, 0);
  const inv = await checkInvariants(s.client, s.view);
  const keys = new Set((await s.client.read('gift_keys_since', { sinceUtc: 0 })).map((r) => r.gift_key));
  const missing = [...emitted].filter((k) => !keys.has(k)).length;
  const m = s.client.metrics();
  await s.client.close();
  return { dir, workerKills: kills, workerRestarts: m.workerRestarts, recoveredBatches: m.counters.recovered, progressExpected: expected, progressActual: score, progressExact: expected === score,
    giftsEmitted: emitted.size, giftsMissingInDb: missing, I1: inv.I1, I2: inv.I2, I3: inv.I3, I9: inv.I9 };
}

// ───────── CR8 dưới tải: ranh giới GB ngẫu nhiên khi 200 quà/s ─────────
async function cr8() {
  const kinds = [{ point: 'GB0' }, { point: 'GB3' }, { point: 'GB6' }, { point: 'GB7' }, { workerStage: 'receive', workerFault: 'before_commit' },
    { workerStage: 'receive', workerFault: 'after_commit_before_ack' }, { workerStage: 'apply', workerFault: 'before_commit' }, { workerStage: 'apply', workerFault: 'after_commit_before_ack' }];
  const out = [];
  for (let i = 0; i < CR8N; i++) {
    const dir = mkdtempSync(join(tmpdir(), 'nova-cr8-'));
    const at = kinds[i % kinds.length];
    let armed = false; let crashed = false; let s;
    const die = () => { if (!crashed) { crashed = true; s.journal.crash(); s.connector.disconnect('CRASH').catch(() => {}); } };
    const faults = {
      point: (name) => { if (armed && name === at.point) die(); },
      workerFault: (stage) => { if (!armed || crashed || stage !== at.workerStage) return undefined; setTimeout(die, 0); return at.workerFault; }
    };
    s = await buildStack({ dir, logger: quiet, allowFaults: true, faults, persistCfg: { restartBackoffMs: 60000 }, scenario: { users: 500, commentsPerSec: 300, giftsPerSec: 200, seed: 1000 + i, streakStepMs: 100 } });
    await s.pipeline.connect();
    await sleep(rnd(500, 1500));
    armed = true;
    for (let w = 0; w < 200 && !crashed; w++) await sleep(10);
    await sleep(30);
    await s.client.kill();
    const rec = await recoverAndCheck(dir);
    out.push({ i: i + 1, at, crashed, replayed: rec.replayed, I1: rec.inv.I1, I2: rec.inv.I2, I3: rec.inv.I3, I9: rec.inv.I9 });
    say(`CR8 #${i + 1} ${JSON.stringify(at)} crashed=${crashed} replay=${rec.replayed} I1=${rec.inv.I1} I2=${rec.inv.I2} I3=${rec.inv.I3} I9=${rec.inv.I9}`);
  }
  return { runs: out.length, allPass: out.every((r) => r.crashed && r.I1 && r.I2 && r.I3 && r.I9), runsDetail: out };
}

const report = { tool: 'tools/crash-suite.js', at: new Date().toISOString(), node: process.version, platform: `${process.platform}/${process.arch}`,
  kinds: { CR1: 'SIGKILL tiến trình thật (macOS)', CR2: 'worker_threads terminate thật, tiến trình sống', CR8: 'chèn lỗi ranh giới (mô phỏng logic) + terminate Worker' } };
if (CR8N) report.CR8 = await cr8();
if (CR2N) { report.CR2 = await cr2(); say(`CR2: ${JSON.stringify(report.CR2)}`); }
if (KILLS) report.CR1 = await cr1();
if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2));
say(`\nTỔNG KẾT: CR8 allPass=${report.CR8?.allPass} · CR2 progressExact=${report.CR2?.progressExact} missing=${report.CR2?.giftsMissingInDb} I1=${report.CR2?.I1} · CR1 kills=${report.CR1?.kills} I1=${report.CR1?.allI1} I2=${report.CR1?.allI2} I3=${report.CR1?.allI3} I9=${report.CR1?.allI9} lostTotal=${report.CR1?.lostGiftsPerKill.total}`);
process.exit(0);
