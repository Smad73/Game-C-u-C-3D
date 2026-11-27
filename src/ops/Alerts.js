// Danh sách cảnh báo đang hoạt động (ADR-0019). Mỗi mã có tối đa một cảnh báo; nâng/hạ mức hoặc xoá khi hết nguyên nhân.
import { EventEmitter } from 'node:events';

/** Mã cảnh báo và gợi ý xử lý bằng tiếng Việt (hiển thị trên Control). */
export const ALERT_CATALOG = Object.freeze({
  QUEUE_HIGH: 'Hàng đợi sự kiện đang đầy. Hệ thống sẽ gộp like/share và làm chậm xử lý; không cần thao tác nếu tự hết.',
  TICK_SLOW: 'Vòng lặp xử lý chậm bất thường. Đóng bớt ứng dụng nặng; nếu kéo dài hãy hạ preset đồ hoạ.',
  PERSIST_LAG: 'Ghi dữ liệu xuống đĩa đang bị trễ. Kiểm tra ổ đĩa còn trống và không bị phần mềm khác chiếm.',
  PERSIST_DEGRADED: 'Lớp ghi dữ liệu vừa dừng và đang khởi động lại. Dữ liệu chưa ghi được giữ trong bộ nhớ.',
  DISK_LOW: 'Ổ đĩa sắp hết dung lượng. Hãy giải phóng ổ đĩa trước buổi LIVE.',
  DISK_CRITICAL: 'Ổ đĩa gần đầy. Hệ thống đã giảm ghi nhật ký; giải phóng ổ đĩa ngay.',
  DB_ERROR: 'Cơ sở dữ liệu báo lỗi. Kiểm tra ổ đĩa; nếu lặp lại hãy khôi phục từ bản sao lưu.',
  SAFE_MODE: 'SAFE MODE: đã ngừng ghi tiến trình để bảo vệ dữ liệu. Khôi phục từ bản sao lưu hoặc xử lý sự cố ổ đĩa.',
  BATCH_REJECTED: 'Một lô ghi dữ liệu bị từ chối và đã được cách ly trong thư mục dữ liệu (rejected-batches).',
  GIFT_DEAD: 'Có quà không áp dụng được sau nhiều lần thử. Cần xử lý thủ công.',
  WEAK_GIFT_KEY: 'Có quà thiếu mã định danh chắc chắn; nguy cơ trùng/thiếu cao hơn bình thường.',
  GIFT_AT_RISK: 'Đang giữ quà chỉ trong bộ nhớ; sẽ MẤT nếu game tắt hoặc sập. Giải phóng ổ đĩa / khôi phục DB ngay.',
  INGEST_HALTED: 'Đã ngừng nhận sự kiện để bảo vệ hệ thống. Quà gửi lúc này không đến được game.'
});

const RANK = { info: 0, warn: 1, critical: 2 };

export class Alerts extends EventEmitter {
  constructor({ now = () => Date.now() } = {}) {
    super();
    this.now = now;
    this.map = new Map();
  }

  /** Tạo hoặc cập nhật cảnh báo. Phát 'raised' khi mới hoặc đổi mức. */
  raise(code, level = 'warn', message = null) {
    if (!(code in ALERT_CATALOG)) throw new Error(`Mã cảnh báo không có trong danh mục: ${code}`);
    if (!(level in RANK)) throw new Error(`Mức cảnh báo không hợp lệ: ${level}`);
    const old = this.map.get(code);
    const text = message || ALERT_CATALOG[code];
    if (old && old.level === level && old.message === text) return old;
    const a = { code, level, message: text, hint: ALERT_CATALOG[code], since: old ? old.since : this.now() };
    this.map.set(code, a);
    this.emit('raised', a);
    return a;
  }

  clear(code) {
    const old = this.map.get(code);
    if (!old) return false;
    this.map.delete(code);
    this.emit('cleared', old);
    return true;
  }

  has(code) { return this.map.has(code); }

  /** Nghiêm trọng nhất trước, rồi theo thời điểm bắt đầu. */
  list() {
    return [...this.map.values()].sort((a, b) => RANK[b.level] - RANK[a.level] || a.since - b.since);
  }

  worstLevel() {
    let w = null;
    for (const a of this.map.values()) if (w === null || RANK[a.level] > RANK[w]) w = a.level;
    return w;
  }
}
