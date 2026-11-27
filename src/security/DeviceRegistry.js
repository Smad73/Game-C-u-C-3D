// Sổ thiết bị đã ghép đôi (ADR-0020). Lưu bền qua PersistenceWorker; bộ nhớ chỉ giữ tập "đã thu hồi" để chặn nhanh.
import { randomUUID } from 'node:crypto';
import { OPS } from '../shared/persistence-protocol.js';

/** Nhãn thân thiện từ User-Agent (chỉ để người vận hành nhận ra thiết bị; không dùng để phân quyền). */
export function deviceLabel(userAgent = '') {
  const ua = String(userAgent);
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Thiết bị';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${os} · ${br}` : os;
}

export class DeviceRegistry {
  constructor({ persistence, logger, now = () => Date.now() }) {
    this.persistence = persistence;
    this.log = logger;
    this.now = now;
    this.revoked = new Set();
    this.known = new Set();
  }

  /** Nạp sổ thiết bị từ DB khi khởi động (thiết bị đã thu hồi vẫn bị chặn sau khi khởi động lại). */
  async load() {
    const rows = await this.persistence.read('list_devices');
    this.revoked = new Set(rows.filter((r) => r.revoked_at_utc !== null).map((r) => r.device_id));
    this.known = new Set(rows.map((r) => r.device_id));
    return rows.length;
  }

  async register({ userAgent } = {}) {
    const id = randomUUID();
    const t = this.now();
    await this.persistence.commit({ cls: 'state', ops: [{ t: OPS.DEVICE_UPSERT, device_id: id, name: deviceLabel(userAgent), user_agent: userAgent ? String(userAgent).slice(0, 300) : null, paired_at_utc: t, last_seen_utc: t }] });
    this.known.add(id);
    return id;
  }

  /** Cập nhật last_seen (gọi có tiết chế; lỗi ghi không làm hỏng request). */
  touch(deviceId) {
    this.persistence.commit({ cls: 'state', ops: [{ t: OPS.DEVICE_UPSERT, device_id: deviceId, name: 'cập nhật', paired_at_utc: this.now(), last_seen_utc: this.now() }] })
      .catch((e) => this.log.warn('Không cập nhật được last_seen của thiết bị', { error: e }));
  }

  isRevoked(deviceId) { return this.revoked.has(deviceId); }

  async revoke(deviceId) {
    this.revoked.add(deviceId); // chặn ngay trong RAM, không đợi ghi DB
    await this.persistence.commit({ cls: 'state', ops: [{ t: OPS.DEVICE_REVOKE, device_id: deviceId, at_utc: this.now() }] });
  }

  async revokeAll() {
    for (const id of this.known) this.revoked.add(id);
    await this.persistence.commit({ cls: 'state', ops: [{ t: OPS.DEVICE_REVOKE_ALL, at_utc: this.now() }] });
  }

  list() { return this.persistence.read('list_devices'); }
}
