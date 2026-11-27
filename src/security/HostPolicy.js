// Kiểm tra Host / Origin / CSRF (ADR-0020). Chống: trang web độc hại trên máy phát gửi request tới 127.0.0.1 (CSRF)
// và DNS rebinding (tên miền lạ trỏ về 127.0.0.1 → header Host sai → 421).
import { timingSafeEqual } from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class HostPolicy {
  /** @param {{mode:'local'|'lan', lanHost?:string|null, tls?:boolean}} o */
  constructor({ mode = 'local', lanHost = null, tls = false } = {}) {
    this.mode = mode;
    this.lanHost = lanHost;
    this.tls = tls;
    this.port = null;
  }

  setPort(port) { this.port = port; }

  /** Danh sách Host được phép: loopback luôn có; địa chỉ LAN chỉ có ở chế độ LAN. */
  allowedHosts() {
    if (this.port === null) return new Set();
    const p = this.port;
    const hosts = [`127.0.0.1:${p}`, `localhost:${p}`, `[::1]:${p}`];
    if (this.mode === 'lan' && this.lanHost) hosts.push(`${this.lanHost}:${p}`);
    return new Set(hosts);
  }

  hostAllowed(hostHeader) {
    if (typeof hostHeader !== 'string') return false;
    return this.allowedHosts().has(hostHeader.toLowerCase());
  }

  get scheme() { return this.tls ? 'https' : 'http'; }

  /** Origin hợp lệ = đúng scheme + một Host được phép (không cho `null`, không cho origin lạ). */
  originAllowed(origin) {
    if (typeof origin !== 'string') return false;
    const prefix = `${this.scheme}://`;
    if (!origin.toLowerCase().startsWith(prefix)) return false;
    return this.allowedHosts().has(origin.slice(prefix.length).toLowerCase());
  }

  /** Địa chỉ nguồn là loopback (cùng máy). */
  static isLoopback(addr) {
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  }
}

const reply = (res, status, code, message) => res.status(status).json({ ok: false, code, message });

/** 421 nếu Host không nằm trong danh sách (chống DNS rebinding). */
export function hostGuard(policy) {
  return (req, res, next) => {
    if (!policy.hostAllowed(req.headers.host)) return reply(res, 421, 'HOST_INVALID', 'Địa chỉ truy cập (Host) không hợp lệ.');
    return next();
  };
}

/** Request thay đổi trạng thái bắt buộc có Origin cùng origin (không CORS). */
export function originGuard(policy) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return reply(res, 403, 'ORIGIN_MISSING', 'Thiếu header Origin cho thao tác thay đổi dữ liệu.');
    if (!policy.originAllowed(origin)) return reply(res, 403, 'ORIGIN_INVALID', 'Origin không được phép.');
    return next();
  };
}

/** Header X-Nova-CSRF phải khớp token CSRF của phiên. Chỉ gắn vào route đã xác thực. */
export function csrfGuard() {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const given = req.headers['x-nova-csrf'];
    const expected = req.session?.csrf;
    if (typeof given !== 'string' || !expected) return reply(res, 403, 'CSRF_INVALID', 'Thiếu hoặc sai mã CSRF.');
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return reply(res, 403, 'CSRF_INVALID', 'Thiếu hoặc sai mã CSRF.');
    return next();
  };
}
