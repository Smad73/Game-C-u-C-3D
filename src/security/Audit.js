// Nhật ký thao tác Admin (ADR-0020). Ghi qua PersistenceWorker; KHÔNG ghi token/mật khẩu/mã ghép đôi.
import { randomUUID } from 'node:crypto';
import { OPS } from '../shared/persistence-protocol.js';

export class Audit {
  constructor({ persistence, logger, now = () => Date.now() }) {
    this.persistence = persistence;
    this.log = logger;
    this.now = now;
  }

  /** Ghi một dòng audit. Không ném lỗi: lỗi ghi chỉ được log (thao tác chính không bị chặn bởi audit lỗi). */
  record({ deviceId = null, ip = null, action, detail = null, result = 'ok' }) {
    const row = { t: OPS.AUDIT_INSERT, audit_id: randomUUID(), at_utc: this.now(), device_id: deviceId, ip, action, detail: detail ? String(detail).slice(0, 1000) : null, result };
    return this.persistence.commit({ cls: 'state', ops: [row] })
      .then(() => true)
      .catch((e) => { this.log.warn('Không ghi được audit', { action, error: e }); return false; });
  }
}
