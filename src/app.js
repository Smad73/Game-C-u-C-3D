// Ráp toàn bộ Phase 1: cấu hình → log → Persistence (Worker) → bảo mật → quá tải → HTTP + WebSocket → các bước tắt an toàn.
// createApp() KHÔNG tự thoát tiến trình: server.js (launcher) và test điều khiển vòng đời. Gameplay: WorldCore + EventDirector + Leaderboards.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { PersistenceClient } from './data/PersistenceClient.js';
import { GiftJournal } from './gifts/GiftJournal.js';
import { GiftTotalsView } from './gifts/GiftTotalsView.js';
import { CATALOG_PUBLIC } from './game/publicCatalog.js';
import { GameConfig } from './game/GameConfig.js';
import { Leaderboards } from './game/Leaderboards.js';
import { WorldCore } from './game/WorldCore.js';
import { GAME_OPS } from './data/gameOps.js';
import { IngestPipeline } from './ingest/IngestPipeline.js';
import { LiveConnector } from './ingest/LiveConnector.js';
import { LiveSessionManager } from './ingest/LiveSessionManager.js';
import { MockConnector } from './ingest/MockConnector.js';
import { WsGateway } from './net/WsGateway.js';
import { buildHttpApp } from './http.js';
import { Alerts } from './ops/Alerts.js';
import { OverloadController } from './ops/OverloadController.js';
import { Audit } from './security/Audit.js';
import { AuthSessions } from './security/AuthSessions.js';
import { DeviceRegistry } from './security/DeviceRegistry.js';
import { HostPolicy } from './security/HostPolicy.js';
import { ShutdownManager } from './shutdown.js';
import { Logger } from './system/Logger.js';
import { Metrics } from './system/Metrics.js';
import { SettingsError, assertSecurityPreconditions, loadSettings, readAdminPassword, readProviderApiKey } from './system/Settings.js';
import { detectLanAddress, freeDiskBytes, isSupportedPlatform, platformId, projectRoot, resolveDataDir } from './system/platform.js';
import { appVersion } from './system/version.js';
import { prepareVrmDir } from './assets/prepareVrm.js';

/**
 * @param {{root?:string, env?:object, settingsOverrides?:object, adminPassword?:string|null, viewKey?:string,
 *          exit?:(code:number)=>void, stdout?:boolean, writeStdout?:(s:string)=>void, allowFaults?:boolean,
 *          wsIsSelf?:(req:object)=>boolean, journalFaults?:object, mockScenario?:object}} opts   (allowFaults, wsIsSelf, journalFaults: chỉ dùng trong test)
 */
export async function createApp(opts = {}) {
  const root = opts.root ?? projectRoot();
  const env = opts.env ?? process.env;
  const { settings, sources } = loadSettings({ root, env, overrides: opts.settingsOverrides ?? {} });
  const adminPassword = opts.adminPassword !== undefined ? opts.adminPassword : readAdminPassword(env);
  assertSecurityPreconditions(settings, adminPassword);
  const version = appVersion();
  const mode = settings.server.mode;
  // ADR-0021: realm do NGUỒN quyết định — chế độ demo (Mock/LoadGenerator) chỉ mở nova-demo.db, không bao giờ nova-live.db.
  const ingestMode = settings.ingest.mode;
  const realm = ingestMode === 'demo' ? 'demo' : 'live';
  if (ingestMode === 'live' && !settings.ingest.live.username) throw new SettingsError(['Chế độ ingest "live" cần ingest.live.username (hoặc NOVA_TIKTOK_USERNAME).']);

  let lanHost = null;
  if (mode === 'lan') {
    lanHost = settings.server.lanHost || detectLanAddress();
    if (!lanHost) throw new SettingsError(['Không tìm thấy địa chỉ mạng LAN. Hãy kết nối Wi-Fi/Ethernet hoặc đặt NOVA_LAN_HOST.']);
  }
  const bindHost = mode === 'lan' ? lanHost : '127.0.0.1';

  const dataDir = resolveDataDir({ root, override: settings.dataDir });
  const logger = new Logger({ level: settings.logging.level, dir: join(dataDir, 'logs'), toFile: settings.logging.toFile, retainDays: settings.logging.retainDays, stdout: opts.stdout !== false, writeStdout: opts.writeStdout });
  const log = logger.child('app');
  // Nhân vật VRoid: tách texture + ghi danh sách model (thả .vrm mới vào public/stage/assets/vrm là có). Lỗi không chặn khởi động.
  try {
    const vr = prepareVrmDir(join(root, 'public', 'stage', 'assets', 'vrm'));
    for (const sk of vr.skipped) log.warn('Bỏ qua model nhân vật', sk);
    if (Object.keys(vr.extracted).length) log.info('Đã chuẩn bị model nhân vật mới', { extracted: vr.extracted });
  } catch (e) { log.warn('Không chuẩn bị được model nhân vật', { error: e?.message }); }
  log.info('Khởi động NOVA FISHING LIVE 3D', { version, node: process.version, platform: settings.platform?.id ?? platformId(), mode, config: sources });
  if (!isSupportedPlatform()) log.warn('Hệ điều hành này nằm ngoài phạm vi V1 (chỉ macOS và Windows được hỗ trợ).');

  const metrics = new Metrics();
  const alerts = new Alerts();
  alerts.on('raised', (a) => log.warn(`Cảnh báo ${a.code}`, { level: a.level, message: a.message }));
  alerts.on('cleared', (a) => log.info(`Hết cảnh báo ${a.code}`));
  const shutdown = new ShutdownManager({ logger: log, deadlineMs: settings.shutdown.deadlineMs, stepTimeoutMs: settings.shutdown.stepTimeoutMs, exit: opts.exit });

  // ───────── lớp ghi dữ liệu (mọi thao tác DB đi qua Worker) ─────────
  const persistence = new PersistenceClient({
    dbPath: join(dataDir, `nova-${realm}.db`), backupDir: join(dataDir, 'backups'), rejectedDir: join(dataDir, 'rejected-batches'),
    realm, config: settings.persistence, logger: logger.child('persist'), allowFaults: opts.allowFaults === true
  });
  persistence.on('alert', (a) => alerts.raise(a.code, a.level, a.message));
  persistence.on('alert-clear', (a) => alerts.clear(a.code));
  try {
    await persistence.start();
  } catch (e) {
    log.error('Không khởi động được lớp ghi dữ liệu', { code: e.code, message: e.message });
    metrics.close();
    await logger.close();
    throw e;
  }

  // Phát hiện lần chạy trước tắt đột ngột (chưa kịp ghi STOPPED).
  const prev = (await persistence.read('get_setting', { key: 'run.state' }))[0];
  let previousRunUnclean = false;
  if (prev) {
    try { previousRunUnclean = JSON.parse(prev.value).state === 'RUNNING'; } catch { /* giá trị lạ: coi như sạch */ }
  }
  if (previousRunUnclean) log.warn('Lần chạy trước KHÔNG được tắt an toàn (tiến trình bị dừng đột ngột). Dữ liệu đã ghi bền vẫn nguyên vẹn.');
  await persistence.commit({ cls: 'state', ops: [persistence.settingOp('run.state', { state: 'RUNNING', pid: process.pid, startedAtUtc: Date.now(), version })] });
  const flags = { previousRunUnclean };

  // ───────── bảo mật ─────────
  const policy = new HostPolicy({ mode, lanHost });
  const devices = new DeviceRegistry({ persistence, logger: logger.child('devices') });
  await devices.load();
  const audit = new Audit({ persistence, logger: logger.child('audit') });
  let gateway = null;
  const auth = new AuthSessions({ config: settings.security, devices, adminPassword, logger: logger.child('auth'), onRevoke: (id) => gateway?.closeForDevice(id) });
  const viewKey = opts.viewKey ?? randomBytes(16).toString('base64url');

  // ───────── Phase 2: GiftJournal + Ingest (ADR-0006, 0018, 0019, 0021) ─────────
  // Thứ tự phục hồi (ADR-0018): dựng RAM từ DB TRƯỚC → nhập tệp khẩn cấp → replay RECEIVED/FAILED → mới nhận sự kiện mới.
  const giftView = new GiftTotalsView();
  await giftView.rebuild(persistence);
  // Gameplay: cấu hình chỉnh được (Gift Mapping, nhịp Boss…) nạp từ DB TRƯỚC khi nhận quà — hành động quà được CHỐT lúc nhận.
  const gameConfig = await new GameConfig({ persistence, logger: logger.child('game-config') }).load();
  const journal = new GiftJournal({
    persistence, realm, logger: logger.child('gifts'), config: settings.ingest.journal,
    emergencyDir: join(dataDir, `emergency-${realm}`), faults: opts.allowFaults === true ? (opts.journalFaults ?? null) : null,
    effectResolver: gameConfig.resolveGift
  });
  journal.onCommittedGift(giftView.apply);
  let ingest = null;
  const g = settings.game;
  const world = new WorldCore({ persistence, realm, logger: logger.child('world'), gameConfig, sessionId: () => ingest?.sessions?.currentId ?? null, tickMs: g.tickMs, flushMs: g.flushMs });
  journal.onCommittedGift(world.onCommittedGift); // hiệu ứng quà vào thế giới CHỈ sau ack commit
  await world.start();
  const leaderboards = new Leaderboards({ persistence, sessionId: () => ingest?.sessions?.currentId ?? null, logger: logger.child('leaderboard'), refreshMs: g.leaderboardRefreshMs });
  journal.on('alert', (a) => alerts.raise(a.code, a.level, a.message));
  journal.on('alert-clear', (a) => alerts.clear(a.code));
  const restore = await journal.start();
  if (restore.replayed) log.info('Đã replay quà chưa hoàn tất từ lần chạy trước', restore);
  persistence.setDirtyProvider(() => journal.unpersisted());
  if (ingestMode !== 'off') {
    const reconnect = settings.ingest.reconnect;
    const connector = ingestMode === 'demo'
      ? new MockConnector({ scenario: { ...settings.ingest.mock, ...(opts.mockScenario || {}) }, reconnect, logger: logger.child('mock') })
      : new LiveConnector({ username: settings.ingest.live.username, provider: settings.ingest.live.provider, apiKey: readProviderApiKey(env), reconnect, logger: logger.child('tiktok') });
    const sessions = new LiveSessionManager({ persistence, logger: logger.child('live-session'), source: connector.source, username: settings.ingest.live.username });
    await sessions.init();
    ingest = new IngestPipeline({ connector, journal, sessions, logger: logger.child('ingest'), config: settings.ingest.pipeline, queueConfig: settings.ingest.queue });
    ingest.on('halted', () => alerts.raise('INGEST_HALTED', 'critical', 'Đã ngừng nhận sự kiện để bảo vệ quà (thang lưu trữ S4).'));
    ingest.onEvent(world.onEvents);
    ingest.start();
    log.info('Ingest sẵn sàng', { mode: ingestMode, realm, source: connector.source });
    if (settings.ingest.autoConnect) ingest.connect().catch((e) => log.warn('Kết nối nguồn sự kiện thất bại', { code: e.code, message: e.message }));
  }

  // ───────── quá tải ─────────
  const overload = new OverloadController({
    config: settings.overload, persistConfig: settings.persistence, alerts, logger: logger.child('overload'),
    getInputs: () => ({
      eventLoopP95Ms: metrics.eventLoopWindow().p95Ms,
      heapUsedMb: metrics.snapshot().process.heapUsedMb,
      persist: persistence.metrics(),
      persistState: persistence.state,
      diskFreeBytes: persistence.health?.freeBytes ?? freeDiskBytes(dataDir),
      stageFps: gateway?.lastStageReport?.fps ?? null,
      ingest: {
        eventsPerSec: ingest ? ingest.metrics().eventsPerSec : 0,
        queue: ingest ? ingest.queue.metrics() : null,
        giftPendingAgeMs: journal.metrics().oldestPendingAgeMs,
        halted: journal.halted || Boolean(ingest?.halted)
      }
    })
  });
  overload.start();

  // ───────── HTTP + WebSocket ─────────
  const app = buildHttpApp({ settings, policy, auth, audit, persistence, alerts, overload, metrics, shutdown, log, gateway: () => gateway, root, version, viewKey, flags, ingest, journal, giftView, isLocalRequest: opts.wsIsSelf ?? null,
    world, leaderboards, gameConfig, logger, realm, dataDir });
  const server = http.createServer(app);
  gateway = new WsGateway({
    server, policy, auth, config: settings.security, viewKey, logger: logger.child('ws'), metrics, version, mode, isSelf: opts.wsIsSelf ?? null,
    getStatus: () => ({ serverTimeUtc: Date.now(), alerts: alerts.list(), overload: overload.snapshot(), persistState: persistence.state, stage: gateway?.lastStageReport ?? null, wsClients: gateway?.stats(),
      world: { state: world.state, counts: world.counts(), catchesPerMin: world.catchTimes.length }, realm, ingestMode, connector: ingest ? ingest.conn.snapshot() : null, session: ingest?.sessions?.snapshot() ?? null }),
    onStageHello: () => [
      { type: 'init', realm, version, catalog: CATALOG_PUBLIC, config: gameConfig.config, events: world.events.snapshot(), top: leaderboards.snapshot(), serverTimeUtc: Date.now() },
      world.frame()
    ]
  });

  // ───────── Stage: khung trạng thái 10 Hz + nguồn sự kiện gộp mỗi 100 ms + BXH khi đổi ─────────
  const feedBuf = [];
  world.on('feed', (f) => { feedBuf.push(f); if (feedBuf.length > 400) feedBuf.splice(0, feedBuf.length - 400); });
  world.on('rank-request', (P) => {
    Promise.all(['live', 'all'].map((s) => leaderboards.rank(s, P.key))).then(([lv, all]) => {
      feedBuf.push({ type: 'card', at: Date.now(), kind: 'rank', player: { key: P.key, name: P.name, level: P.level, app: P.appearance }, live: lv, all, card: world.profileCard(P) });
    }).catch(() => {});
  });
  const stageTimer = setInterval(() => {
    if (!gateway.hasStage()) { feedBuf.length = 0; return; }
    gateway.broadcastStage(world.frame(), { droppable: true });
    if (feedBuf.length) gateway.broadcastStage({ type: 'feed', items: feedBuf.splice(0) });
  }, g.stageFrameMs);
  stageTimer.unref();
  const eventsTimer = setInterval(() => gateway.broadcastStage({ type: 'events', ...world.events.snapshot() }), 1000);
  eventsTimer.unref();
  leaderboards.onUpdate((top) => gateway.broadcastStage({ type: 'top', top, labels: leaderboards.labels() }));
  leaderboards.start();
  gameConfig.on('changed', ({ field, value }) => { if (field === 'config') { gateway.broadcastStage({ type: 'config', config: value }); world.events.reschedule(); } });
  // P1: dọn khoá idempotency/batch cũ (giữ ${retentionDays} ngày) — chạy 1 lần sau khởi động 1 phút rồi mỗi 6 giờ.
  const retention = () => persistence.commit({ cls: 'log', ops: [{ t: GAME_OPS.RETENTION, before_utc: Date.now() - g.retentionDays * 86400000 }] })
    .then((r) => log.info('Đã dọn dữ liệu idempotency cũ', r.results?.[0] ?? {})).catch((e) => log.warn('Dọn dữ liệu cũ thất bại (sẽ thử lại)', { code: e.code }));
  const retentionStart = setTimeout(retention, 60000); retentionStart.unref();
  const retentionTimer = setInterval(retention, 6 * 3600000); retentionTimer.unref();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(settings.server.port, bindHost, () => { server.off('error', reject); resolve(); });
    });
  } catch (e) {
    await gateway.close();
    overload.stop();
    await persistence.close({ deadlineMs: 2000 }).catch(() => {});
    metrics.close();
    await logger.close();
    if (e.code === 'EADDRINUSE') throw new SettingsError([`Cổng ${settings.server.port} đang được chương trình khác dùng. Đóng chương trình đó hoặc đặt NOVA_PORT khác.`]);
    throw e;
  }
  const port = server.address().port;
  policy.setPort(port);
  const baseUrl = `http://${bindHost}:${port}`;
  log.info('Server đang chạy', { baseUrl, bind: bindHost, mode });

  // ───────── các bước tắt an toàn (order nhỏ chạy trước) ─────────
  const closeHttp = () => new Promise((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 500).unref();
  });
  // Ngừng nhận sự kiện MỚI trước tiên (connector ngắt, không tự nối lại, không poll — ADR-0012).
  shutdown.register('ngừng nhận sự kiện', async () => { if (ingest) await ingest.stop(); }, { order: 5 });
  shutdown.register('ngừng nhận kết nối', async () => {
    overload.stop(); clearInterval(stageTimer); clearInterval(eventsTimer); clearTimeout(retentionStart); clearInterval(retentionTimer); leaderboards.stop();
    await gateway.close(); await closeHttp();
  }, { order: 10 });
  // Lưu thế giới: dừng mô phỏng, ghi nốt tiến trình (cú câu, thành tích, sự kiện) và chờ ack TRƯỚC khi đóng lớp ghi.
  shutdown.register('lưu thế giới câu cá', async () => { await world.stop(); }, { order: 25 });
  shutdown.register('ghi nốt quà đang xử lý', async ({ remainingMs }) => {
    const r = await journal.close({ deadlineMs: Math.max(500, Math.min(5000, remainingMs - 2000)) });
    if (r?.unfinished) throw new Error(`còn ${r.unfinished} quà chưa xử lý xong (đã RECEIVED sẽ replay ở lần chạy sau)`);
    if (r?.s3) throw new Error(`còn ${r.s3} quà chỉ trong bộ nhớ (S3) — SẼ MẤT`);
  }, { order: 30 });
  shutdown.register('ghi trạng thái dừng', async ({ reason }) => {
    await persistence.commit({ cls: 'state', ops: [persistence.settingOp('run.state', { state: 'STOPPED', stoppedAtUtc: Date.now(), reason })] });
  }, { order: 40 });
  shutdown.register('đóng lớp ghi dữ liệu', async ({ remainingMs }) => {
    const r = await persistence.close({ deadlineMs: Math.max(500, remainingMs - 1000) });
    if (!r.drained) throw new Error(`còn ${r.abandoned} batch chưa ghi bền`);
    if (!r.checkpointed) throw new Error('chưa checkpoint được WAL');
  }, { order: 50, timeoutMs: settings.shutdown.deadlineMs });
  shutdown.register('đóng số đo', () => metrics.close(), { order: 80 });
  shutdown.register('đóng nhật ký', () => logger.close(), { order: 99 });

  return {
    settings, port, baseUrl, bindHost, viewKey, dataDir, previousRunUnclean, version,
    server, gateway, auth, devices, audit, persistence, alerts, overload, metrics, shutdown, logger, policy, realm, journal, giftView, ingest, world, leaderboards, gameConfig,
    createPairing: () => auth.createPairCode(),
    controlUrl: (code) => `${baseUrl}/control/#pair=${encodeURIComponent(code)}`,
    stageUrl: () => `${baseUrl}/stage/`,
    /** Tắt an toàn nhưng KHÔNG thoát tiến trình (dùng cho test). */
    stop: (reason = 'stop') => shutdown.run(reason, { doExit: false })
  };
}
