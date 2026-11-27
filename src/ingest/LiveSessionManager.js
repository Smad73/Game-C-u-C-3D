// LiveSessionManager — buổi LIVE định danh theo SỰ KIỆN THẬT (ARCHITECTURE §1.3, ADR-0012), không theo giờ hay lần kết nối.
//  - Kết nối thành công với room_id chưa từng gắn buổi nào → buổi mới (đóng buổi cũ đang dở bằng INFERRED).
//  - Mất kết nối tạm thời / connector hoặc server khởi động lại, cùng room_id → TIẾP TỤC buổi đó.
//  - streamEnd → ENDED (STREAM_END); người vận hành → ENDED (MANUAL).
//  - Khởi động: buổi ACTIVE gần nhất chuyển RECOVERING cho tới khi biết room_id thật; không poll.
// Mọi ghi đi qua PersistenceWorker (batch `state`). Hành vi room_id của TikTok thật CHƯA kiểm chứng (Module 10).
import { randomUUID } from 'node:crypto';
import { OPS } from '../shared/persistence-protocol.js';

export class LiveSessionManager {
  constructor({ persistence, logger, source, username = null, touchEveryMs = 5000 }) {
    this.p = persistence;
    this.log = logger;
    this.source = source;
    this.username = username;
    this.current = null; // { session_id, room_id, status, last_event_at_utc }
    this.touchEveryMs = touchEveryMs;
    this.lastTouch = 0;
    this.lastEventAt = null;
  }

  get currentId() { return this.current && this.current.status !== 'ENDED' ? this.current.session_id : null; }

  async init() {
    const row = (await this.p.read('live_session_latest'))[0];
    if (row) {
      this.current = { ...row };
      if (row.status === 'ACTIVE') await this.#update({ status: 'RECOVERING' });
      this.log?.info?.('Có buổi LIVE chưa kết thúc từ lần chạy trước → RECOVERING (chờ kết nối để biết room_id)', { session: row.session_id, room: row.room_id });
    }
    return this.current;
  }

  /** Connector báo đã kết nối với roomId. Trả {action:'continue'|'new'|'none', session_id}. */
  async onConnected({ roomId }) {
    if (!roomId) {
      this.log?.warn?.('Kết nối không có room_id đáng tin — không tự tạo buổi LIVE mới (cần người vận hành bấm "Bắt đầu buổi LIVE mới")');
      return { action: 'none', session_id: this.currentId };
    }
    if (this.current && this.current.status !== 'ENDED' && this.current.room_id === roomId) {
      if (this.current.status !== 'ACTIVE') await this.#update({ status: 'ACTIVE' });
      return { action: 'continue', session_id: this.current.session_id };
    }
    const existing = (await this.p.read('live_session_by_room', { room_id: roomId }))[0];
    if (existing && existing.status === 'ENDED') {
      this.log?.warn?.('room_id này thuộc một buổi LIVE đã kết thúc — không mở lại tự động', { room: roomId });
      this.current = null;
      return { action: 'none', session_id: null };
    }
    if (this.current && this.current.status !== 'ENDED') {
      await this.#update({ status: 'ENDED', ended_at_utc: this.current.last_event_at_utc ?? this.lastEventAt ?? Date.now(), end_reason: 'INFERRED' });
    }
    const s = { session_id: existing?.session_id ?? randomUUID(), room_id: roomId, status: 'ACTIVE', started_at_utc: Date.now(), last_event_at_utc: null };
    if (!existing) await this.p.commit({ cls: 'state', ops: [{ t: OPS.SESSION_OPEN, session_id: s.session_id, username: this.username, room_id: roomId, source: this.source, status: 'ACTIVE', started_at_utc: s.started_at_utc }] });
    this.current = s;
    if (existing) await this.#update({ status: 'ACTIVE' });
    this.log?.info?.('Buổi LIVE mới (room_id mới)', { session: s.session_id, room: roomId });
    return { action: 'new', session_id: s.session_id };
  }

  async onStreamEnd() { return this.end('STREAM_END'); }

  async end(reason = 'MANUAL') {
    if (!this.current || this.current.status === 'ENDED') return false;
    await this.#update({ status: 'ENDED', ended_at_utc: Date.now(), end_reason: reason });
    return true;
  }

  /** Ghi nhận thời điểm sự kiện cuối (giãn cách, batch `state`) — dùng làm ended_at khi phải suy ra INFERRED. */
  touch(at = Date.now()) {
    this.lastEventAt = at;
    if (!this.current || this.current.status === 'ENDED' || at - this.lastTouch < this.touchEveryMs) return;
    this.lastTouch = at;
    this.current.last_event_at_utc = at;
    this.p.commit({ cls: 'state', ops: [{ t: OPS.SESSION_UPDATE, session_id: this.current.session_id, status: this.current.status, last_event_at_utc: at }] }).catch(() => {});
  }

  async #update(fields) {
    const c = this.current;
    Object.assign(c, fields);
    await this.p.commit({ cls: 'state', ops: [{ t: OPS.SESSION_UPDATE, session_id: c.session_id, status: c.status, ended_at_utc: fields.ended_at_utc ?? null, end_reason: fields.end_reason ?? null, last_event_at_utc: c.last_event_at_utc ?? null }] });
  }

  snapshot() { return this.current ? { ...this.current } : null; }
}
