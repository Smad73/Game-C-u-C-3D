// Express: API + trang tĩnh (ADR-0020). Thứ tự middleware là một phần của thiết kế bảo mật:
// Host (421) → header bảo mật → giới hạn tần suất → JSON body → Origin (thay đổi dữ liệu) → phiên → route; route admin thêm CSRF.
import { join } from 'node:path';
import express from 'express';
import { HostPolicy, csrfGuard, hostGuard, originGuard } from './security/HostPolicy.js';
import { AuthError, readCookie } from './security/AuthSessions.js';
import { RateLimiter } from './security/RateLimiter.js';
import { mountGameRoutes } from './gameRoutes.js';

const SESSION_COOKIE = 'nova_sid';
const CONFIRM_PHRASE = 'XAC NHAN';

const fail = (res, status, code, message, extra = {}) => res.status(status).json({ ok: false, code, message, ...extra });

export function buildHttpApp(deps) {
  const { settings, policy, auth, audit, persistence, alerts, overload, metrics, shutdown, log, gateway, root, version, tls = false, viewKey, flags, ingest = null, journal = null, giftView = null,
    world = null, leaderboards = null, gameConfig = null, logger = null, realm = 'live', dataDir = null } = deps;
  const sec = settings.security;
  // Kết nối từ chính máy chạy game (loopback). deps.isLocalRequest chỉ dùng trong test để mô phỏng máy khác trong LAN.
  const isLocal = deps.isLocalRequest ?? ((req) => HostPolicy.isLoopback(req.socket.remoteAddress));
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  // Nguồn IPv6 dạng [::1] không hợp lệ trong CSP (trình duyệt bỏ qua và báo lỗi) → bỏ; 'self' đã bao phủ cùng origin.
  const wsOrigins = () => [...policy.allowedHosts()].filter((h) => !h.startsWith('[')).map((h) => `${tls ? 'wss' : 'ws'}://${h}`).join(' ');
  // frameSrc: chỉ stage được nhúng khung YouTube (youtube-nocookie.com) cho nhạc nền (ADR-0028); trang khác giữ mặc định 'self'.
  const baseCsp = (frameAncestors, frameSrc = "'self'") => [
    "default-src 'self'", `frame-src ${frameSrc}`, "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "media-src 'self' blob:",
    `connect-src 'self' ${wsOrigins()}`, "base-uri 'none'", "form-action 'self'", "object-src 'none'", `frame-ancestors ${frameAncestors}`
  ].join('; ');

  // 1) Host
  app.use(hostGuard(policy));

  // 2) Header bảo mật (stage cho phép nhúng cùng origin để Control xem trước ở Phase sau)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', req.path.startsWith('/stage') ? baseCsp("'self'", "'self' https://www.youtube-nocookie.com") : baseCsp("'none'"));
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // 3) Thống kê + giới hạn tần suất REST theo IP
  const restLimiter = new RateLimiter({ max: sec.restMaxPerMinute, windowMs: 60000 });
  app.use('/api/', (req, res, next) => {
    metrics.inc('http.api.requests');
    const r = restLimiter.hit(req.socket.remoteAddress || 'unknown');
    if (!r.allowed) return fail(res, 429, 'RATE_LIMITED', 'Quá nhiều yêu cầu. Hãy thử lại sau.', { retryAfterMs: r.retryAfterMs });
    return next();
  });

  // 4) JSON (giới hạn kích thước) → 5) Origin cho thao tác thay đổi dữ liệu → 6) phiên
  app.use(express.json({ limit: sec.jsonBodyLimitBytes, strict: true }));
  app.use(originGuard(policy));
  app.use((req, _res, next) => {
    req.session = auth.authenticate(readCookie(req.headers.cookie, SESSION_COOKIE));
    next();
  });

  const clientIp = (req) => req.socket.remoteAddress || 'unknown';
  const setCookie = (res, tok) => {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sec.sessionIdleMs / 1000)}${tls ? '; Secure' : ''}`);
  };
  const requireAdmin = (req, res, next) => (req.session ? next() : fail(res, 401, 'UNAUTHENTICATED', 'Chưa đăng nhập hoặc phiên đã hết hạn. Hãy ghép đôi lại.'));
  const admin = [requireAdmin, csrfGuard()];
  /** Thao tác nguy hiểm: chuỗi xác nhận gõ tay + xác thực lại gần đây + audit (ADR-0020 mục 7). */
  const dangerous = (action) => async (req, res, next) => {
    const who = { deviceId: req.session.deviceId, ip: clientIp(req), action };
    if (req.body?.confirm !== CONFIRM_PHRASE) {
      await audit.record({ ...who, result: 'rejected:confirm' });
      return fail(res, 403, 'CONFIRM_REQUIRED', `Thao tác nguy hiểm: cần gõ "${CONFIRM_PHRASE}" để xác nhận.`);
    }
    if (!auth.recentlyAuthenticated(req.session)) {
      await audit.record({ ...who, result: 'rejected:reauth' });
      return fail(res, 403, 'REAUTH_REQUIRED', 'Cần xác thực lại (mật khẩu hoặc mã ghép đôi mới) trong 5 phút gần đây.');
    }
    req.audit = who;
    return next();
  };
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // ───────── công khai (chỉ đọc) ─────────
  app.get('/api/health', (_req, res) => res.json({
    ok: true, version, uptimeSec: metrics.snapshot().uptimeSec, mode: settings.server.mode, platform: settings.platform?.id ?? 'unknown',
    persist: persistence.state, passwordLogin: auth.passwordConfigured, https: tls
  }));
  app.get('/api/state', (_req, res) => res.json({ ok: true, version, overloadLevel: overload.level, stageClients: gateway().stats().stage }));

  // ───────── xác thực ─────────
  app.post('/api/admin/pair', wrap(async (req, res) => {
    const s = await auth.redeemPairCode(req.body?.code, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
    setCookie(res, s.token);
    await audit.record({ deviceId: s.deviceId, ip: clientIp(req), action: 'pair', result: 'ok' });
    res.json({ ok: true, csrf: s.csrf, deviceId: s.deviceId });
  }));
  // Máy chạy game vào thẳng không cần mã ghép đôi (ADR-0027). Host/Origin đã được hostGuard + originGuard kiểm ở trên.
  app.post('/api/admin/local', wrap(async (req, res) => {
    if (!isLocal(req)) {
      await audit.record({ ip: clientIp(req), action: 'local_login', result: 'rejected:not_local' });
      return fail(res, 403, 'NOT_LOCAL', 'Chỉ máy đang chạy game mới vào thẳng được. Điện thoại/máy khác cần mã ghép đôi.');
    }
    const s = await auth.localLogin({ ip: clientIp(req), userAgent: req.headers['user-agent'] });
    setCookie(res, s.token);
    await audit.record({ deviceId: s.deviceId, ip: clientIp(req), action: 'local_login', result: 'ok' });
    res.json({ ok: true, csrf: s.csrf, deviceId: s.deviceId });
  }));
  app.post('/api/admin/login', wrap(async (req, res) => {
    const s = await auth.login(req.body?.password, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
    setCookie(res, s.token);
    await audit.record({ deviceId: s.deviceId, ip: clientIp(req), action: 'login', result: 'ok' });
    res.json({ ok: true, csrf: s.csrf, deviceId: s.deviceId });
  }));
  app.get('/api/admin/session', requireAdmin, (req, res) => res.json({
    ok: true, csrf: req.session.csrf, deviceId: req.session.deviceId, recentlyAuthenticated: auth.recentlyAuthenticated(req.session),
    mode: settings.server.mode, https: tls, passwordLogin: auth.passwordConfigured
  }));
  app.post('/api/admin/logout', ...admin, (req, res) => { auth.logout(req.session); res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); res.json({ ok: true }); });
  app.post('/api/admin/reauth', ...admin, wrap(async (req, res) => {
    await auth.reauth(req.session, { password: req.body?.password, pairCode: req.body?.pairCode, local: req.body?.local === true && isLocal(req), ip: clientIp(req) });
    await audit.record({ deviceId: req.session.deviceId, ip: clientIp(req), action: 'reauth', result: 'ok' });
    res.json({ ok: true });
  }));

  // ───────── ghép đôi thêm thiết bị / sổ thiết bị / thu hồi ─────────
  app.post('/api/admin/pair-code', ...admin, wrap(async (req, res) => {
    // Tạo mã cho thiết bị khác cần vừa xác thực gần đây; nếu không, một phiên cũ có thể tự tạo mã để "xác thực lại" cho chính nó.
    if (!auth.recentlyAuthenticated(req.session)) return fail(res, 403, 'REAUTH_REQUIRED', 'Cần xác thực lại (mật khẩu, hoặc mã ghép đôi lấy từ cửa sổ khởi chạy: gõ p rồi Enter).');
    const c = auth.createPairCode();
    await audit.record({ deviceId: req.session.deviceId, ip: clientIp(req), action: 'pair_code_create', result: 'ok' });
    res.json({ ok: true, code: c.code, expiresAtUtc: c.expiresAtUtc, ttlMs: c.ttlMs });
  }));
  app.delete('/api/admin/pair-code', ...admin, wrap(async (req, res) => {
    const cancelled = auth.cancelPairCode();
    await audit.record({ deviceId: req.session.deviceId, ip: clientIp(req), action: 'pair_code_cancel', result: cancelled ? 'ok' : 'none' });
    res.json({ ok: true, cancelled });
  }));
  app.get('/api/admin/devices', requireAdmin, wrap(async (req, res) => {
    const rows = await auth.devices.list();
    res.json({ ok: true, currentDeviceId: req.session.deviceId, devices: rows });
  }));
  app.post('/api/admin/devices/:id/revoke', ...admin, wrap(async (req, res) => {
    await auth.revokeDevice(String(req.params.id).slice(0, 64));
    await audit.record({ deviceId: req.session.deviceId, ip: clientIp(req), action: 'device_revoke', detail: String(req.params.id).slice(0, 64), result: 'ok' });
    res.json({ ok: true });
  }));
  app.post('/api/admin/revoke-all', ...admin, dangerous('revoke_all'), wrap(async (req, res) => {
    await audit.record({ ...req.audit, result: 'ok' });
    await auth.revokeAll();
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.json({ ok: true });
  }));
  app.get('/api/admin/view-key', requireAdmin, (_req, res) => res.json({ ok: true, viewKey }));

  // ───────── vận hành ─────────
  app.get('/api/metrics', requireAdmin, (_req, res) => res.json({
    ok: true, version, ...metrics.snapshot(), persist: persistence.metrics(), overload: overload.snapshot(), alerts: alerts.list(),
    ws: gateway().stats(), stage: gateway().lastStageReport, previousRunUnclean: flags.previousRunUnclean, sessions: auth.sessionCount(),
    ingest: ingest ? ingest.metrics() : { mode: 'off', gifts: journal ? journal.metrics() : null }
  }));

  // ───────── Phase 2: Ingest (nguồn sự kiện TikTok / Mock) ─────────
  app.get('/api/ingest', requireAdmin, (_req, res) => res.json({ ok: true, mode: settings.ingest.mode, realm: persistence.opts?.realm, ingest: ingest ? ingest.metrics() : null, topGifts: giftView ? giftView.top(10) : [] }));
  app.post('/api/ingest/connect', ...admin, wrap(async (req, res) => {
    if (!ingest) return fail(res, 409, 'INGEST_OFF', 'Ingest đang tắt (ingest.mode = off).');
    try {
      const r = await ingest.connect();
      await audit.record({ deviceId: req.session.deviceId, ip: clientIp(req), action: 'ingest_connect', detail: r?.roomId ?? null, result: 'ok' });
      return res.json({ ok: true, roomId: r?.roomId ?? null });
    } catch (e) {
      await audit.record({ deviceId: req.session.deviceId, ip: clientIp(req), action: 'ingest_connect', detail: String(e.code || ''), result: 'error' });
      return fail(res, 409, e.code || 'CONNECT_FAILED', e.message);
    }
  }));
  app.post('/api/ingest/disconnect', ...admin, wrap(async (req, res) => {
    if (!ingest) return fail(res, 409, 'INGEST_OFF', 'Ingest đang tắt.');
    await ingest.disconnect('MANUAL');
    await audit.record({ deviceId: req.session.deviceId, ip: clientIp(req), action: 'ingest_disconnect', result: 'ok' });
    return res.json({ ok: true });
  }));
  app.post('/api/ingest/end-live', ...admin, dangerous('end_live'), wrap(async (req, res) => {
    if (!ingest) return fail(res, 409, 'INGEST_OFF', 'Ingest đang tắt.');
    await ingest.disconnect('MANUAL_END');
    const ended = await ingest.sessions.end('MANUAL');
    await audit.record({ ...req.audit, result: ended ? 'ok' : 'noop' });
    return res.json({ ok: true, ended });
  }));
  app.post('/api/world/stop', ...admin, dangerous('safe_exit'), wrap(async (req, res) => {
    await audit.record({ ...req.audit, result: 'ok' });
    res.status(202).json({ ok: true, message: 'Đang lưu an toàn rồi thoát. Đóng trang này.' });
    setImmediate(() => shutdown.run('api:safe-exit', { exitCode: 0 }));
  }));

  // ───────── Gameplay (Control) ─────────
  if (world) mountGameRoutes(app, { admin, requireAdmin, dangerous, wrap, fail, audit, clientIp, world, leaderboards, gameConfig, persistence, ingest, logger, realm, settings, dataDir, shutdown, root, gateway });

  app.use('/api/', (_req, res) => fail(res, 404, 'NOT_FOUND', 'Không có API này.'));

  // ───────── trang tĩnh (không có dữ liệu nhạy cảm) ─────────
  const pub = (sub) => express.static(join(root, 'public', sub), { dotfiles: 'ignore', etag: false, maxAge: 0, index: 'index.html', fallthrough: true });
  app.use('/stage', pub('stage'));
  app.use('/control', pub('control'));
  app.use('/vendor', pub('vendor'));
  app.get('/', (_req, res) => res.redirect(302, '/control/'));

  // ───────── lỗi ─────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof AuthError) {
      if (err.retryAfterMs) res.setHeader('Retry-After', String(Math.ceil(err.retryAfterMs / 1000)));
      return fail(res, err.status, err.code, err.message, err.retryAfterMs ? { retryAfterMs: err.retryAfterMs } : {});
    }
    if (err.type === 'entity.too.large') return fail(res, 413, 'BODY_TOO_LARGE', 'Nội dung gửi lên quá lớn.');
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'BODY_INVALID', 'Nội dung gửi lên không phải JSON hợp lệ.');
    log.error('Lỗi xử lý HTTP', { error: err });
    return fail(res, 500, 'INTERNAL', 'Lỗi nội bộ.');
  });

  return app;
}
