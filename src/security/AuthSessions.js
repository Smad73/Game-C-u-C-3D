// Ghép đôi, phiên, đăng nhập mật khẩu, thu hồi (ADR-0020, R12). Phiên chỉ ở RAM; thiết bị được lưu bền.
// QUAN TRỌNG: mã ghép đôi và mật khẩu chỉ là cách XÁC THỰC. Chúng KHÔNG chống nghe lén trên HTTP thuần (xem ADR-0020/0023).
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { RateLimiter } from './RateLimiter.js';

export class AuthError extends Error {
  constructor(code, message, status = 401, extra = {}) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

const sha = (s) => createHash('sha256').update(String(s)).digest();
const eq = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const token = (bytes) => randomBytes(bytes).toString('base64url');

const PAIR_MESSAGES = {
  PAIR_INVALID: 'Mã ghép đôi không đúng.',
  PAIR_EXPIRED: 'Mã ghép đôi đã hết hạn. Hãy tạo mã mới.',
  PAIR_USED: 'Mã ghép đôi đã được dùng. Mỗi mã chỉ dùng một lần.',
  PAIR_CANCELLED: 'Mã ghép đôi đã bị huỷ. Hãy tạo mã mới.'
};

export class AuthSessions {
  /**
   * @param {{config:object, devices:import('./DeviceRegistry.js').DeviceRegistry, adminPassword?:string|null,
   *          now?:()=>number, onRevoke?:(deviceId:string)=>void, logger:object}} o
   */
  constructor({ config, devices, adminPassword = null, now = () => Date.now(), onRevoke = () => {}, logger }) {
    this.cfg = config;
    this.devices = devices;
    this.now = now;
    this.onRevoke = onRevoke;
    this.log = logger;
    this.pair = null; // { hash, expiresAt }
    this.history = []; // các mã đã dùng/hết hạn/bị huỷ gần đây: { hash, state }
    this.sessions = new Map(); // sha256(token) hex → session
    this.pairLimiter = new RateLimiter({ max: 10, windowMs: 60000, now });
    this.loginLimiter = new RateLimiter({ max: config.loginMaxPerMinute, windowMs: 60000, now });
    this.failStreak = new Map(); // ip → { n, lockedUntil }
    if (adminPassword) {
      this.salt = randomBytes(16);
      this.passwordHash = scryptSync(adminPassword, this.salt, 64); // chỉ giữ hash trong RAM
    } else {
      this.salt = null;
      this.passwordHash = null;
    }
  }

  get passwordConfigured() { return this.passwordHash !== null; }

  // ───────── mã ghép đôi ─────────
  /** Tạo mã mới (128 bit, hết hạn theo cấu hình, dùng một lần). Mã cũ bị huỷ — chỉ một mã hiệu lực tại một thời điểm. */
  createPairCode() {
    if (this.pair) this.#archive(this.pair.hash, 'CANCELLED');
    const code = token(16);
    this.pair = { hash: sha(code), expiresAt: this.now() + this.cfg.pairCodeTtlMs };
    return { code, expiresAtUtc: this.pair.expiresAt, ttlMs: this.cfg.pairCodeTtlMs };
  }

  cancelPairCode() {
    if (!this.pair) return false;
    this.#archive(this.pair.hash, 'CANCELLED');
    this.pair = null;
    return true;
  }

  pairCodeStatus() {
    if (this.pair && this.now() > this.pair.expiresAt) { this.#archive(this.pair.hash, 'EXPIRED'); this.pair = null; }
    return { active: this.pair !== null, expiresAtUtc: this.pair ? this.pair.expiresAt : null };
  }

  #archive(hash, state) {
    this.history.push({ hash, state });
    if (this.history.length > 20) this.history.shift();
  }

  async redeemPairCode(code, { ip = 'unknown', userAgent = '' } = {}) {
    if (!this.pairLimiter.hit(ip).allowed) throw new AuthError('RATE_LIMITED', 'Thử quá nhiều lần. Hãy đợi một phút.', 429);
    if (typeof code !== 'string' || code.length === 0 || code.length > 100) throw new AuthError('PAIR_INVALID', PAIR_MESSAGES.PAIR_INVALID);
    const h = sha(code);
    if (this.pair && eq(h, this.pair.hash)) {
      if (this.now() > this.pair.expiresAt) {
        this.#archive(this.pair.hash, 'EXPIRED');
        this.pair = null;
        throw new AuthError('PAIR_EXPIRED', PAIR_MESSAGES.PAIR_EXPIRED);
      }
      this.#archive(this.pair.hash, 'USED'); // dùng một lần: vô hiệu ngay khi đổi
      this.pair = null;
      return this.#openSession({ ip, userAgent, method: 'pair' });
    }
    const past = this.history.find((x) => eq(h, x.hash));
    if (past) throw new AuthError(`PAIR_${past.state}`, PAIR_MESSAGES[`PAIR_${past.state}`]);
    throw new AuthError('PAIR_INVALID', PAIR_MESSAGES.PAIR_INVALID);
  }

  // ───────── đăng nhập mật khẩu ─────────
  async login(password, { ip = 'unknown', userAgent = '' } = {}) {
    if (!this.passwordConfigured) throw new AuthError('PASSWORD_NOT_SET', 'Chưa đặt mật khẩu Admin; hãy dùng mã ghép đôi.', 400);
    const st = this.failStreak.get(ip);
    if (st && st.lockedUntil > this.now()) throw new AuthError('LOCKED', 'Tạm khoá do nhập sai nhiều lần.', 429, { retryAfterMs: st.lockedUntil - this.now() });
    const rl = this.loginLimiter.hit(ip);
    if (!rl.allowed) throw new AuthError('RATE_LIMITED', 'Thử quá nhiều lần. Hãy đợi một phút.', 429, { retryAfterMs: rl.retryAfterMs });
    if (!this.#passwordOk(password)) {
      const n = (st?.n || 0) + 1;
      // khoá tăng dần: từ lần sai thứ 8 trở đi, 30s × 2^(n-8), tối đa 15 phút
      const lockedUntil = n >= 8 ? this.now() + Math.min(30000 * 2 ** (n - 8), 900000) : 0;
      this.failStreak.set(ip, { n, lockedUntil });
      throw new AuthError('LOGIN_FAILED', 'Sai mật khẩu.');
    }
    this.failStreak.delete(ip);
    this.loginLimiter.reset(ip);
    return this.#openSession({ ip, userAgent, method: 'password' });
  }

  #passwordOk(password) {
    if (typeof password !== 'string' || password.length === 0 || password.length > 256) return false;
    return eq(scryptSync(password, this.salt, 64), this.passwordHash);
  }

  /**
   * Máy đang chạy game vào thẳng, KHÔNG cần mã ghép đôi (người dùng yêu cầu 2026-11-25, ADR-0027).
   * Lớp HTTP chỉ được gọi hàm này khi kết nối là loopback (cùng máy) — thiết bị khác vẫn phải ghép đôi/mật khẩu.
   */
  async localLogin({ ip = 'loopback', userAgent = '' } = {}) {
    return this.#openSession({ ip, userAgent, method: 'local' });
  }

  // ───────── phiên ─────────
  async #openSession({ ip, userAgent, method }) {
    const deviceId = await this.devices.register({ userAgent });
    const tok = token(32);
    const t = this.now();
    const s = { deviceId, csrf: token(16), createdAt: t, lastSeenAt: t, reauthAt: t, ip, method, deviceTouchedAt: t };
    this.sessions.set(sha(tok).toString('hex'), s);
    return { token: tok, csrf: s.csrf, deviceId, method };
  }

  /** Trả phiên hợp lệ hoặc null. Phiên hết hạn nhàn rỗi hoặc thuộc thiết bị đã thu hồi sẽ bị xoá. */
  authenticate(tok) {
    if (typeof tok !== 'string' || tok.length === 0 || tok.length > 200) return null;
    const key = sha(tok).toString('hex');
    const s = this.sessions.get(key);
    if (!s) return null;
    const t = this.now();
    if (t - s.lastSeenAt > this.cfg.sessionIdleMs || this.devices.isRevoked(s.deviceId)) { this.sessions.delete(key); return null; }
    s.lastSeenAt = t;
    if (t - s.deviceTouchedAt > 60000) { s.deviceTouchedAt = t; this.devices.touch(s.deviceId); }
    return { ...s, key };
  }

  /** Phiên còn hiệu lực không (không gia hạn). Dùng để dọn kết nối WebSocket có phiên đã chết. */
  sessionAlive(key) {
    const s = key ? this.sessions.get(key) : null;
    if (!s) return false;
    if (this.now() - s.lastSeenAt > this.cfg.sessionIdleMs || this.devices.isRevoked(s.deviceId)) { this.sessions.delete(key); return false; }
    return true;
  }

  /** Xác thực lại gần đây (cho thao tác nguy hiểm). Ghép đôi/đăng nhập vừa xong cũng tính. */
  recentlyAuthenticated(session) {
    return this.now() - session.reauthAt <= this.cfg.reauthWindowMs;
  }

  /** Xác thực lại bằng mật khẩu (nếu có) hoặc bằng mã ghép đôi mới. */
  async reauth(session, { password, pairCode, local = false, ip = 'unknown' } = {}) {
    const live = this.sessions.get(session.key);
    if (!live) throw new AuthError('UNAUTHENTICATED', 'Phiên không còn hiệu lực.');
    if (local === true) {
      // cùng máy (lớp HTTP đã kiểm loopback) → xác thực lại không cần mã
    } else if (password !== undefined) {
      if (!this.passwordConfigured) throw new AuthError('PASSWORD_NOT_SET', 'Chưa đặt mật khẩu Admin; hãy dùng mã ghép đôi mới.', 400);
      const rl = this.loginLimiter.hit(`reauth:${ip}`);
      if (!rl.allowed) throw new AuthError('RATE_LIMITED', 'Thử quá nhiều lần. Hãy đợi một phút.', 429);
      if (!this.#passwordOk(password)) throw new AuthError('LOGIN_FAILED', 'Sai mật khẩu.');
    } else if (pairCode !== undefined) {
      // chỉ kiểm mã & vô hiệu hoá, không mở phiên mới
      await this.#consumePairCodeOnly(pairCode, ip);
    } else {
      throw new AuthError('REAUTH_INPUT', 'Cần mật khẩu hoặc mã ghép đôi mới.', 400);
    }
    live.reauthAt = this.now();
    return true;
  }

  async #consumePairCodeOnly(code, ip) {
    if (!this.pairLimiter.hit(ip).allowed) throw new AuthError('RATE_LIMITED', 'Thử quá nhiều lần. Hãy đợi một phút.', 429);
    if (typeof code !== 'string' || code.length > 100) throw new AuthError('PAIR_INVALID', PAIR_MESSAGES.PAIR_INVALID);
    const h = sha(code);
    if (this.pair && eq(h, this.pair.hash)) {
      if (this.now() > this.pair.expiresAt) { this.#archive(this.pair.hash, 'EXPIRED'); this.pair = null; throw new AuthError('PAIR_EXPIRED', PAIR_MESSAGES.PAIR_EXPIRED); }
      this.#archive(this.pair.hash, 'USED');
      this.pair = null;
      return;
    }
    const past = this.history.find((x) => eq(h, x.hash));
    throw new AuthError(past ? `PAIR_${past.state}` : 'PAIR_INVALID', past ? PAIR_MESSAGES[`PAIR_${past.state}`] : PAIR_MESSAGES.PAIR_INVALID);
  }

  logout(session) { this.sessions.delete(session.key); }

  // ───────── thu hồi (R12) ─────────
  /** Thu hồi một thiết bị: mọi phiên của nó vô hiệu NGAY và kết nối WS của nó bị ngắt. */
  async revokeDevice(deviceId) {
    for (const [k, s] of this.sessions) if (s.deviceId === deviceId) this.sessions.delete(k);
    await this.devices.revoke(deviceId);
    this.onRevoke(deviceId);
  }

  /**
   * Thu hồi tất cả: mọi phiên (kể cả phiên đang thao tác) + mọi thiết bị + mã ghép đôi đang hiệu lực.
   * Muốn tiếp tục dùng phải ghép đôi lại. (ADR-0020 coi việc "giữ lại phiên hiện tại" là tuỳ chọn; chưa làm ở Phase 1.)
   */
  async revokeAll() {
    this.cancelPairCode();
    this.sessions.clear();
    await this.devices.revokeAll();
    this.onRevoke('*');
  }

  sessionCount() { return this.sessions.size; }
  newId() { return randomUUID(); }
}

/** Đọc cookie `name` từ header Cookie (không cần thư viện). */
export function readCookie(header, name) {
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
