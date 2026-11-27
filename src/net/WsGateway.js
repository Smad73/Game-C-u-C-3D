// Cổng WebSocket /ws (ADR-0020). Kiểm tra Host + Origin + phiên NGAY khi nâng cấp kết nối.
//  - role=admin: bắt buộc Origin cùng origin + cookie phiên hợp lệ (chống Cross-Site WebSocket Hijacking).
//  - role=stage: chỉ đọc; cùng máy được vào không cần khoá; từ LAN cần viewKey. Origin lạ luôn bị từ chối.
// Phase 1: thông điệp hello/ping-pong/status/báo cáo của stage. Dữ liệu game (snapshot/delta) thuộc Phase sau.
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { readCookie } from '../security/AuthSessions.js';
import { HostPolicy } from '../security/HostPolicy.js';

const SESSION_COOKIE = 'nova_sid';

const num = (v, min, max) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);
const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : null);

/** Làm sạch báo cáo từ stage (không tin dữ liệu từ client: ép kiểu, giới hạn độ dài/khoảng giá trị). */
export function sanitizeStageReport(r) {
  const o = r && typeof r === 'object' ? r : {};
  return {
    webgl2: o.webgl2 === true,
    renderer: str(o.renderer),
    vendor: str(o.vendor),
    maxTextureSize: num(o.maxTextureSize, 0, 1e6),
    fps: num(o.fps, 0, 1000),
    canvas: { w: num(o.canvas?.w, 0, 1e5), h: num(o.canvas?.h, 0, 1e5) },
    viewport: { w: num(o.viewport?.w, 0, 1e5), h: num(o.viewport?.h, 0, 1e5) },
    devicePixelRatio: num(o.devicePixelRatio, 0, 16),
    audio: { ok: o.audio?.ok === true, state: str(o.audio?.state, 30) },
    ws: { rttMs: num(o.ws?.rttMs, 0, 1e7) },
    three: { ok: o.three?.ok === true, revision: str(o.three?.revision, 20) },
    font: { vietnameseOk: o.font?.vietnameseOk === true },
    userAgent: str(o.userAgent, 300)
  };
}

function deny(socket, status, text) {
  try {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } finally {
    socket.destroy();
  }
}

export class WsGateway {
  /**
   * @param {{server:import('node:http').Server, policy:HostPolicy, auth:object, config:object, viewKey:string, logger:object,
   *          metrics:object, getStatus:()=>object, version:string, mode:string, now?:()=>number}} o
   */
  constructor({ server, policy, auth, config, viewKey, logger, metrics, getStatus, version, mode, now = () => Date.now(), isSelf = null, onStageHello = null }) {
    this.onStageHello = onStageHello; // gửi dữ liệu khởi tạo game (danh mục, BXH, sự kiện) cho stage mới
    this.isSelfOverride = isSelf; // chỉ để test mô phỏng kết nối từ máy khác trong LAN
    this.server = server;
    this.policy = policy;
    this.auth = auth;
    this.cfg = config;
    this.viewKey = viewKey;
    this.log = logger;
    this.metrics = metrics;
    this.getStatus = getStatus;
    this.version = version;
    this.mode = mode;
    this.now = now;
    this.clients = new Set();
    this.lastStageReport = null;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: config.wsMaxMessageBytes });
    this.onUpgrade = (req, socket, head) => this.#upgrade(req, socket, head);
    server.on('upgrade', this.onUpgrade);
    this.statusTimer = setInterval(() => this.#pushStatus(), 2000);
    this.statusTimer.unref();
    this.sweepTimer = setInterval(() => this.#sweep(), 5000);
    this.sweepTimer.unref();
  }

  #isSelf(req) {
    if (this.isSelfOverride) return this.isSelfOverride(req);
    const r = req.socket.remoteAddress;
    return HostPolicy.isLoopback(r) || (r && r === req.socket.localAddress);
  }

  #viewKeyOk(k) {
    if (typeof k !== 'string' || !this.viewKey) return false;
    const a = Buffer.from(k);
    const b = Buffer.from(this.viewKey);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  #upgrade(req, socket, head) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return deny(socket, 400, 'Bad Request'); }
    if (url.pathname !== '/ws') return deny(socket, 404, 'Not Found');
    if (!this.policy.hostAllowed(req.headers.host)) return deny(socket, 421, 'Misdirected Request');

    const role = url.searchParams.get('role');
    const origin = req.headers.origin;
    let session = null;

    if (role === 'admin') {
      if (!origin || !this.policy.originAllowed(origin)) return deny(socket, 403, 'Forbidden');
      session = this.auth.authenticate(readCookie(req.headers.cookie, SESSION_COOKIE));
      if (!session) return deny(socket, 401, 'Unauthorized');
    } else if (role === 'stage') {
      // Browser Source của OBS/LIVE Studio có thể gửi Origin rỗng hoặc "null"; mọi origin lạ khác bị từ chối.
      const originOk = origin === undefined || origin === 'null' || this.policy.originAllowed(origin);
      if (!originOk) return deny(socket, 403, 'Forbidden');
      if (!this.#isSelf(req) && !this.#viewKeyOk(url.searchParams.get('k'))) return deny(socket, 401, 'Unauthorized');
    } else {
      return deny(socket, 400, 'Bad Request');
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => this.#connected(ws, role, session));
    return undefined;
  }

  #connected(ws, role, session) {
    const c = { ws, role, deviceId: session?.deviceId ?? null, sessionKey: session?.key ?? null, alive: true, windowStart: this.now(), msgs: 0 };
    this.clients.add(c);
    this.metrics.set('ws.clients', this.clients.size);
    this.metrics.inc('ws.connections');
    ws.on('pong', () => { c.alive = true; });
    ws.on('close', () => { this.clients.delete(c); this.metrics.set('ws.clients', this.clients.size); });
    ws.on('error', (e) => this.log.debug('Lỗi WebSocket client', { error: e }));
    ws.on('message', (data, isBinary) => this.#message(c, data, isBinary));
    this.#send(c, { type: 'hello', role, serverTimeUtc: this.now(), version: this.version, mode: this.mode });
    if (role === 'admin') this.#send(c, { type: 'status', ...this.getStatus() });
    if (role === 'stage' && this.onStageHello) { try { for (const m of this.onStageHello()) this.#send(c, m); } catch (e) { this.log.warn('Không gửi được dữ liệu khởi tạo stage', { error: e?.message }); } }
  }

  #message(c, data, isBinary) {
    const t = this.now();
    if (t - c.windowStart >= 1000) { c.windowStart = t; c.msgs = 0; }
    if (++c.msgs > this.cfg.wsMaxMessagesPerSec) return c.ws.close(1008, 'too many messages');
    if (isBinary) return c.ws.close(1003, 'binary not supported');
    let m;
    try { m = JSON.parse(data.toString('utf8')); } catch { return c.ws.close(1003, 'invalid json'); }
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return c.ws.close(1003, 'invalid message');
    if (m.type === 'ping') return this.#send(c, { type: 'pong', t: num(m.t, 0, Number.MAX_SAFE_INTEGER), serverTimeUtc: t });
    if (m.type === 'metrics' && c.role === 'stage') {
      this.lastStageReport = { ...sanitizeStageReport(m.report), receivedAtUtc: t };
      this.metrics.inc('ws.stageReports');
      return this.broadcastAdmin({ type: 'stage_report', report: this.lastStageReport });
    }
    return undefined; // loại thông điệp khác: bỏ qua (client không thể ra lệnh qua WS ở Phase 1)
  }

  #send(c, obj) {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
  }

  /** Phát cho mọi stage. Client chậm (bộ đệm > 2 MB) bị bỏ qua khung "droppable" — backpressure, không chặn server. */
  broadcastStage(obj, { droppable = false } = {}) {
    let s = null;
    for (const c of this.clients) {
      if (c.role !== 'stage' || c.ws.readyState !== 1) continue;
      if (droppable && c.ws.bufferedAmount > 2 * 1024 * 1024) { this.metrics.inc('ws.stageDropped'); continue; }
      s ??= JSON.stringify(obj);
      c.ws.send(s);
    }
  }
  hasStage() { for (const c of this.clients) if (c.role === 'stage') return true; return false; }

  broadcastAdmin(obj) {
    const s = JSON.stringify(obj);
    for (const c of this.clients) if (c.role === 'admin' && c.ws.readyState === 1) c.ws.send(s);
  }

  #pushStatus() {
    try { this.broadcastAdmin({ type: 'status', ...this.getStatus() }); } catch (e) { this.log.warn('Không đẩy được status', { error: e }); }
  }

  /** Ngắt WS admin của một thiết bị ('*' = tất cả) — gọi khi thu hồi (R12). */
  closeForDevice(deviceId) {
    let n = 0;
    for (const c of this.clients) {
      if (c.role === 'admin' && (deviceId === '*' || c.deviceId === deviceId)) { c.ws.close(4401, 'revoked'); n++; }
    }
    return n;
  }

  /** Định kỳ: đóng WS admin có phiên không còn hiệu lực (hết hạn/thu hồi); kiểm tra kết nối còn sống. */
  #sweep() {
    for (const c of this.clients) {
      if (c.role === 'admin' && !this.auth.sessionAlive(c.sessionKey)) { c.ws.close(4401, 'session ended'); continue; }
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* socket đang đóng */ }
    }
  }

  stats() {
    let admin = 0;
    let stage = 0;
    for (const c of this.clients) c.role === 'admin' ? admin++ : stage++;
    return { admin, stage };
  }

  async close() {
    clearInterval(this.statusTimer);
    clearInterval(this.sweepTimer);
    this.server.off('upgrade', this.onUpgrade);
    for (const c of this.clients) c.ws.close(1001, 'server closing');
    await new Promise((done) => this.wss.close(() => done()));
  }
}
