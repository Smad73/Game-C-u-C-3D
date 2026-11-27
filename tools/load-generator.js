#!/usr/bin/env node
// LoadGenerator (Phase 2, Module 09) — đo đường ống Ingest + GiftJournal + PersistenceWorker dưới tải, CHỈ realm DEMO (nova-demo.db).
// Dùng cùng đường ống với TikTok thật (MockConnector nguồn 'loadgen' → IngestPipeline → GiftJournal → Worker).
// KHÔNG đặt giới hạn số người chơi: `--viewers` chỉ là số người giả của kịch bản đo.
//
//   node tools/load-generator.js --comments 1000 --gifts 200 --duration 60 [--viewers 1000] [--likes 300] [--follows 5] [--shares 5]
//        [--duplicate 0.02] [--disconnect-every 0] [--burst-every 0 --burst-x 5] [--dir <thư-mục>] [--out report.json]
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { PersistenceClient } from '../src/data/PersistenceClient.js';
import { GiftJournal } from '../src/gifts/GiftJournal.js';
import { GiftTotalsView } from '../src/gifts/GiftTotalsView.js';
import { IngestPipeline } from '../src/ingest/IngestPipeline.js';
import { LiveSessionManager } from '../src/ingest/LiveSessionManager.js';
import { MockConnector } from '../src/ingest/MockConnector.js';
import { loadSettings } from '../src/system/Settings.js';
import { Logger } from '../src/system/Logger.js';

export function parseArgs(argv) {
  const o = { comments: 1000, gifts: 200, likes: 300, follows: 5, shares: 5, joins: 20, viewers: 1000, duration: 30, duplicate: 0.02, invalid: 0.001,
    disconnectEvery: 0, burstEvery: 0, burstX: 5, seed: 7, dir: null, out: null, quiet: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (k === 'quiet') { o.quiet = true; continue; }
    const v = argv[++i];
    o[k] = ['dir', 'out'].includes(k) ? v : Number(v);
  }
  return o;
}

const q = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fileSize = (p) => { try { return statSync(p).size; } catch { return 0; } };

/** Dựng đường ống đầy đủ trên một thư mục dữ liệu. Dùng chung cho load test và crash suite. */
export async function buildStack({ dir, scenario, logger, journalCfg = {}, persistCfg = {}, allowFaults = false, faults = null, source = 'loadgen' }) {
  const { settings } = loadSettings({ env: {} });
  mkdirSync(dir, { recursive: true });
  const client = new PersistenceClient({ dbPath: join(dir, 'nova-demo.db'), backupDir: join(dir, 'backups'), rejectedDir: join(dir, 'rejected'), realm: 'demo', config: { ...settings.persistence, ...persistCfg }, logger, allowFaults });
  await client.start();
  const view = new GiftTotalsView();
  await view.rebuild(client);
  const journal = new GiftJournal({ persistence: client, realm: 'demo', logger, emergencyDir: join(dir, 'emergency-demo'), faults, config: { ...settings.ingest.journal, ...journalCfg } });
  journal.onCommittedGift(view.apply);
  const restoreT0 = performance.now();
  const restore = await journal.start();
  const restoreMs = Math.round(performance.now() - restoreT0);
  client.setDirtyProvider(() => journal.unpersisted());
  const sessions = new LiveSessionManager({ persistence: client, logger, source });
  await sessions.init();
  const connector = new MockConnector({ source, scenario, reconnect: { maxAttempts: 50, baseDelayMs: 100, maxDelayMs: 1000, jitter: 0.1 }, logger });
  const pipeline = new IngestPipeline({ connector, journal, sessions, logger, config: settings.ingest.pipeline, queueConfig: settings.ingest.queue });
  pipeline.start();
  return { client, view, journal, sessions, connector, pipeline, restore, restoreMs, settings };
}

export async function runLoad(o) {
  const logger = new Logger({ level: o.quiet ? 'error' : 'warn', stdout: !o.quiet, toFile: false });
  const dir = o.dir || join(tmpdir(), `nova-load-${Date.now()}`);
  const scenario = {
    users: o.viewers, commentsPerSec: o.comments, giftsPerSec: o.gifts, likesPerSec: o.likes, followsPerSec: o.follows, sharesPerSec: o.shares,
    joinsPerSec: o.joins, duplicateRate: o.duplicate, invalidRate: o.invalid, disconnectEveryMs: o.disconnectEvery * 1000, seed: o.seed, streakStepMs: 150
  };
  const s = await buildStack({ dir, scenario, logger });
  const delivered = { n: 0, lat: [] };
  s.pipeline.onEvent((batch) => {
    const now = Date.now();
    delivered.n += batch.length;
    for (const e of batch) if (delivered.lat.length < 200000) delivered.lat.push(now - e.received_at);
  });
  let emitted = 0;
  s.connector.on('raw', () => { emitted++; });
  const samples = [];
  const cpu0 = process.cpuUsage();
  const t0 = Date.now();
  await s.pipeline.connect();
  const base = { ...s.connector.sc };
  let lastCpu = process.cpuUsage(); let lastT = performance.now();
  const timer = setInterval(() => {
    const el = (Date.now() - t0) / 1000;
    if (o.burstEvery > 0) { // bùng nổ sự kiện: nhân tốc độ trong 1 giây mỗi `burstEvery` giây
      const burst = Math.floor(el) % o.burstEvery === o.burstEvery - 1;
      for (const k of ['commentsPerSec', 'giftsPerSec', 'likesPerSec']) s.connector.sc[k] = base[k] * (burst ? o.burstX : 1);
    }
    const c = process.cpuUsage(lastCpu); const now = performance.now();
    const cpuPct = Math.round(((c.user + c.system) / 1000) / (now - lastT) * 100);
    lastCpu = process.cpuUsage(); lastT = now;
    const pm = s.pipeline.metrics(); const jm = s.journal.metrics(); const per = s.client.metrics(); const mem = process.memoryUsage();
    samples.push({ t: Math.round(el), eventsPerSec: pm.eventsPerSec, queueDepth: pm.queue.total, giftPending: jm.pending, giftP95: jm.latencyMs.p95,
      writeBuffer: per.writeBufferOps, inFlight: per.inFlightBatches, workerCommitMs: per.worker?.lastCommitMs ?? null, rssMb: Math.round(mem.rss / 1048576),
      heapMb: Math.round(mem.heapUsed / 1048576), cpuPct, dbBytes: fileSize(join(dir, 'nova-demo.db')) + fileSize(join(dir, 'nova-demo.db-wal')) });
    if (!o.quiet) process.stdout.write(`\r${Math.round(el)}s ev/s=${pm.eventsPerSec} queue=${pm.queue.total} quà chờ=${jm.pending} quà p95=${jm.latencyMs.p95}ms rss=${Math.round(mem.rss / 1048576)}MB cpu=${cpuPct}%   `);
  }, 1000);
  await new Promise((r) => setTimeout(r, o.duration * 1000));
  clearInterval(timer);
  await s.pipeline.stop();
  await s.journal.close({ deadlineMs: 15000 });
  const elapsed = (Date.now() - t0) / 1000;
  const cpu = process.cpuUsage(cpu0);
  const inv = (await s.client.read('gift_invariants'))[0];
  const status = Object.fromEntries((await s.client.read('gift_status_counts')).map((r) => [r.status, r.n]));
  const pm = s.pipeline.metrics(); const jm = s.journal.metrics(); const per = s.client.metrics();
  await s.client.close();
  const report = {
    tool: 'tools/load-generator.js', at: new Date().toISOString(), node: process.version, platform: `${process.platform}/${process.arch}`, config: o, dataDir: dir,
    durationSec: Math.round(elapsed * 10) / 10,
    throughput: { connectorEmitted: emitted, connectorPerSec: Math.round(emitted / elapsed), deliveredNonGift: delivered.n, nonGiftLatencyMs: { p50: q(delivered.lat, 0.5), p95: q(delivered.lat, 0.95), max: q(delivered.lat, 1) } },
    gifts: {
      fromConnector: pm.counters.giftsFromConnector, journalResults: pm.counters.giftStatus, dbStatus: status,
      publishLatencyMs: jm.latencyMs, counters: jm.counters,
      invariants: { I1_noDoubleApply: inv.ledgerDupSources === 0 && inv.totalsOps === inv.ledgerRows, I2_noPending: inv.pending === 0, I3_ledgerMatches: inv.ledgerQty === inv.appliedQty && inv.playerCoins === inv.ledgerCoins, raw: inv }
    },
    pipeline: { invalid: pm.counters.invalid, duplicates: pm.counters.duplicates, rateLimited: pm.counters.rateLimited, queue: pm.queue.counters },
    persistence: { counters: per.counters, workerRestarts: per.workerRestarts },
    resources: { cpuSecTotal: Math.round((cpu.user + cpu.system) / 1e4) / 100, rssMaxMb: Math.max(...samples.map((x) => x.rssMb)), heapMaxMb: Math.max(...samples.map((x) => x.heapMb)),
      dbBytesEnd: samples.at(-1)?.dbBytes ?? 0, queueDepthMax: Math.max(...samples.map((x) => x.queueDepth)), giftPendingMax: Math.max(...samples.map((x) => x.giftPending)), workerCommitMsMax: Math.max(...samples.map((x) => x.workerCommitMs ?? 0)) },
    samples
  };
  if (o.out) writeFileSync(o.out, JSON.stringify(report, null, 2));
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = parseArgs(process.argv);
  runLoad(o).then((r) => {
    process.stdout.write('\n');
    console.log(JSON.stringify({ durationSec: r.durationSec, throughput: r.throughput, gifts: { fromConnector: r.gifts.fromConnector, journalResults: r.gifts.journalResults, dbStatus: r.gifts.dbStatus, publishLatencyMs: r.gifts.publishLatencyMs, invariants: { I1: r.gifts.invariants.I1_noDoubleApply, I2: r.gifts.invariants.I2_noPending, I3: r.gifts.invariants.I3_ledgerMatches } }, resources: r.resources, persistence: r.persistence }, null, 2));
    process.exit(r.gifts.invariants.I1_noDoubleApply && r.gifts.invariants.I2_noPending && r.gifts.invariants.I3_ledgerMatches ? 0 : 1);
  }).catch((e) => { console.error(e); process.exit(2); });
}
