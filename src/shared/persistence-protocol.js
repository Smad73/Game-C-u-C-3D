// Giao thức giữa luồng chính (PersistenceClient) và PersistenceWorker — ADR-0017.
// Dùng chung cho cả hai phía; không phụ thuộc Node hay trình duyệt.

/** Luồng chính → Worker */
export const TO_WORKER = Object.freeze({
  COMMIT: 'commit',
  READ: 'read',
  STATUS: 'status', // R13: hỏi batch đã commit chưa
  CHECKPOINT: 'checkpoint',
  BACKUP: 'backup',
  SHUTDOWN: 'shutdown'
});

/** Worker → luồng chính */
export const FROM_WORKER = Object.freeze({
  READY: 'ready',
  ACK: 'ack',
  NACK: 'nack',
  RESULT: 'result',
  BATCH_STATUS: 'batchStatus',
  HEALTH: 'health',
  FATAL: 'fatal',
  CLOSED: 'closed'
});

/** Lớp batch (ADR-0017 mục 4). Thứ tự = ưu tiên gửi. */
export const BATCH_CLASSES = Object.freeze(['critical', 'progress', 'state', 'log']);

/** Loại thao tác (op) được phép. Op là khai báo, không phải SQL tự do. */
export const OPS = Object.freeze({
  UPSERT_SETTING: 'upsert_setting',
  UPSERT_PLAYER: 'upsert_player',
  ADD_PLAYER_SCORE: 'add_player_score',
  DEVICE_UPSERT: 'device_upsert',
  DEVICE_REVOKE: 'device_revoke',
  DEVICE_REVOKE_ALL: 'device_revoke_all',
  AUDIT_INSERT: 'audit_insert',
  // Phase 2 — GiftJournal (ADR-0018) & buổi LIVE (ARCHITECTURE §1.3)
  GIFT_RECEIVE: 'gift_receive', // INSERT OR IGNORE gift_events (RECEIVED/REJECTED); trùng → ghi nhận "đã có"
  GIFT_APPLY: 'gift_apply',     // hiệu ứng + APPLIED trong CÙNG transaction; tính từ dòng journal đã lưu (tất định)
  GIFT_MARK: 'gift_mark',       // FAILED (attempts++) / DEAD / REJECTED — chỉ từ RECEIVED|FAILED
  SESSION_OPEN: 'session_open',
  SESSION_UPDATE: 'session_update'
});

/** Mã khoá quà (ADR-0018): M = msgId · S = streak có groupId (cộng phần tăng) · H = khoá dự phòng (WEAK). */
export const GIFT_KEY_MODES = Object.freeze(['M', 'S', 'H']);

/** Mã lỗi nack. `retryable` quyết định gửi lại nguyên batch hay cách ly. */
export const NACK_CODES = Object.freeze({
  BUSY: 'BUSY',
  IOERR: 'IOERR',
  FULL: 'FULL',
  CORRUPT: 'CORRUPT',
  REJECTED: 'REJECTED',
  INTERNAL: 'INTERNAL'
});

/** Trạng thái batch phía client (ADR-0017 R13). */
export const BATCH_STATES = Object.freeze({
  PENDING: 'PENDING',
  SENT: 'SENT',
  COMMITTED: 'COMMITTED',
  REJECTED: 'REJECTED',
  RETRYABLE: 'RETRYABLE',
  UNKNOWN: 'UNKNOWN'
});

/** Giới hạn bảo vệ kích thước. */
export const LIMITS = Object.freeze({ MAX_OPS_PER_BATCH: 5000, MAX_BATCH_ID_LEN: 64 });

export class PersistenceError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
    Object.assign(this, extra);
  }
}
