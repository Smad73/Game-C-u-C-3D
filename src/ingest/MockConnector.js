// MockConnector — phát RawEvent giả lập qua CÙNG giao diện ConnectorBase với LiveConnector (không có đường xử lý riêng).
// Realm luôn là 'demo' (ADR-0021): mọi dữ liệu của Mock/LoadGenerator chỉ vào nova-demo.db.
// Hai cách dùng: (1) kịch bản tự chạy theo tốc độ cấu hình (timer 50 ms); (2) test tất định: inject()/simulateDrop()/…
import { ConnectorBase, ConnectorError } from './ConnectorBase.js';

/** PRNG tất định (mulberry32) để test/tải lặp lại được. */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GIFTS = Object.freeze([
  { giftId: 5655, giftName: 'Rose', diamondCount: 1, giftType: 1 },
  { giftId: 5269, giftName: 'TikTok', diamondCount: 1, giftType: 1 },
  { giftId: 6064, giftName: 'GG', diamondCount: 1, giftType: 1 },
  { giftId: 5487, giftName: 'Finger Heart', diamondCount: 5, giftType: 1 },
  { giftId: 7934, giftName: 'Heart Me', diamondCount: 1, giftType: 1 },
  { giftId: 6427, giftName: 'Hat and Mustache', diamondCount: 99, giftType: 2 },
  { giftId: 5760, giftName: 'Weights', diamondCount: 1, giftType: 1 },
  { giftId: 8913, giftName: 'Rosa Nebula', diamondCount: 15, giftType: 2 },
  { giftId: 6369, giftName: 'Lion', diamondCount: 29999, giftType: 2 }
]);
const COMMENTS = ['câu', 'cau', 'thả câu đi!', 'Cá to quá 🐟', 'xin chào mọi người', 'boss', 'nhanh lên', '!fish', 'ạ', 'Đẹp quá'];

export const DEFAULT_MOCK = Object.freeze({
  users: 200,
  commentsPerSec: 0, giftsPerSec: 0, likesPerSec: 0, followsPerSec: 0, sharesPerSec: 0, joinsPerSec: 0,
  invalidRate: 0,        // tỉ lệ sự kiện thiếu dữ liệu / sai kiểu
  duplicateRate: 0,      // tỉ lệ phát lại một sự kiện đã phát (cùng msgId)
  lateRate: 0,           // tỉ lệ phát lại muộn (sau lateDelayMs) một sự kiện cũ
  lateDelayMs: 2000,
  streakProbability: 0.6, // xác suất một quà loại streak (giftType 1) đi theo chuỗi repeatCount 1..N
  streakMaxCount: 10,
  streakStepMs: 120,
  missingRepeatEndRate: 0, // tỉ lệ streak KHÔNG có sự kiện repeatEnd (mô phỏng thiếu)
  missingGroupIdRate: 0,   // tỉ lệ quà streak không có groupId
  missingMsgIdRate: 0,
  disconnectEveryMs: 0,  // >0: tự rớt mạng định kỳ
  disconnectForMs: 1500, // thời gian "mất mạng" (lần nối lại trong khoảng này sẽ thất bại)
  connectDelayMs: 5,
  failConnects: 0,       // số lần mở kết nối đầu tiên thất bại tạm thời
  roomId: null,          // null → 'mock-room-<seed>'
  realisticGifts: false, // true: quà rẻ nhiều hơn quà đắt (chế độ Demo của game)
  seed: 1,
  tickMs: 50
});

export class MockConnector extends ConnectorBase {
  constructor({ scenario = {}, source = 'mock', ...base } = {}) {
    if (source !== 'mock' && source !== 'loadgen') throw new Error('MockConnector chỉ có nguồn mock|loadgen (realm demo)');
    const sc = { ...DEFAULT_MOCK, ...scenario };
    super({ source, ...base, rand: base.rand ?? seededRandom(sc.seed + 7) });
    this.sc = sc;
    this.rnd = seededRandom(sc.seed);
    this.seq = 0;
    this.failLeft = sc.failConnects;
    this.offlineUntil = 0;
    this.tickTimer = null;
    this.acc = {};
    this.history = [];       // các raw đã phát gần đây (để phát lại trùng/muộn)
    this.timers = new Set();
    this.emittedLog = null;  // nếu là mảng: ghi mọi raw đã phát (test harness / đối soát RPO)
    this.lastDropAt = 0;
  }

  // ───── ConnectorBase ─────
  async _open() {
    await new Promise((r) => this.#later(r, this.sc.connectDelayMs));
    if (Date.now() < this.offlineUntil) throw new ConnectorError('NETWORK', 'mất mạng (giả lập)', { transient: true });
    if (this.failLeft > 0) { this.failLeft--; throw new ConnectorError('NETWORK', 'kết nối thất bại tạm thời (giả lập)', { transient: true }); }
    this.#startTicking();
    return { roomId: this.sc.roomId ?? `mock-room-${this.sc.seed}` };
  }

  async _close() {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  // ───── API test tất định ─────
  /** Phát một RawEvent tuỳ ý (dùng cho test). Trả true nếu được chuyển tiếp. */
  inject(raw) { return this.#out(raw); }
  simulateDrop(forMs = this.sc.disconnectForMs) { this.offlineUntil = Date.now() + forMs; this._dropped(new Error('rớt mạng (giả lập)')); }
  simulateStreamEnd() { return this.#out({ type: 'streamEnd', createTime: Date.now() }); }
  simulateError(message = 'lỗi connector (giả lập)') { this._error(new ConnectorError('MOCK_ERROR', message)); }

  /** Sinh một quà; với quà streak sinh cả chuỗi repeatCount 1..n (bất đồng bộ theo streakStepMs). */
  gift({ userId, giftIndex, count, streak, withEnd = true, groupId } = {}) {
    const user = this.#user(userId);
    const g = GIFTS[giftIndex ?? (this.sc.realisticGifts ? this.#weightedGift() : Math.floor(this.rnd() * GIFTS.length))];
    const isStreak = streak ?? (g.giftType === 1 && this.rnd() < this.sc.streakProbability);
    if (!isStreak) {
      return this.#out(this.#giftRaw(user, g, { repeatCount: count ?? 1, repeatEnd: true, groupId: g.giftType === 1 ? this.#groupId() : undefined }));
    }
    const n = count ?? 1 + Math.floor(this.rnd() * this.sc.streakMaxCount);
    const gid = groupId ?? (this.rnd() < this.sc.missingGroupIdRate ? undefined : this.#groupId());
    const end = withEnd && !(this.rnd() < this.sc.missingRepeatEndRate);
    for (let i = 1; i <= n; i++) {
      const raw = this.#giftRaw(user, g, { repeatCount: i, repeatEnd: false, groupId: gid });
      if (i === 1) this.#out(raw); else this.#later(() => this.#out(raw), (i - 1) * this.sc.streakStepMs);
    }
    if (end) this.#later(() => this.#out(this.#giftRaw(user, g, { repeatCount: n, repeatEnd: true, groupId: gid })), n * this.sc.streakStepMs);
    return true;
  }

  // ───── sinh sự kiện theo tốc độ ─────
  #startTicking() {
    if (this.tickTimer) return;
    const dt = this.sc.tickMs / 1000;
    this.tickTimer = setInterval(() => {
      if (this.state !== 'CONNECTED') return;
      if (this.sc.disconnectEveryMs > 0 && Date.now() - (this.lastDropAt || this.startedAt) >= this.sc.disconnectEveryMs) {
        this.lastDropAt = Date.now();
        this.simulateDrop();
        return;
      }
      for (const [k, rate] of [['comment', this.sc.commentsPerSec], ['gift', this.sc.giftsPerSec], ['like', this.sc.likesPerSec],
        ['follow', this.sc.followsPerSec], ['share', this.sc.sharesPerSec], ['join', this.sc.joinsPerSec]]) {
        if (!rate) continue;
        this.acc[k] = (this.acc[k] || 0) + rate * dt;
        while (this.acc[k] >= 1) { this.acc[k]--; this.#one(k); }
      }
    }, this.sc.tickMs);
    this.startedAt = Date.now();
    this.tickTimer.unref?.();
  }

  /** Demo: quà rẻ xuất hiện nhiều hơn quà đắt (trọng số 1/√kim cương) — giống buổi LIVE thật hơn. */
  #weightedGift() {
    const w = GIFTS.map((x) => 1 / Math.sqrt(1 + x.diamondCount) ** 1.6);
    let r = this.rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return 0;
  }

  #one(kind) {
    if (this.sc.invalidRate && this.rnd() < this.sc.invalidRate) { this.#out(this.#invalid()); return; }
    if (this.sc.duplicateRate && this.history.length && this.rnd() < this.sc.duplicateRate) { this.#out(this.history[Math.floor(this.rnd() * this.history.length)]); return; }
    if (this.sc.lateRate && this.history.length && this.rnd() < this.sc.lateRate) {
      const old = this.history[Math.floor(this.rnd() * this.history.length)];
      this.#later(() => this.#out(old), this.sc.lateDelayMs);
    }
    const u = this.#user();
    switch (kind) {
      case 'comment': this.#out(this.#base('chat', u, { comment: COMMENTS[Math.floor(this.rnd() * COMMENTS.length)] })); break;
      case 'gift': this.gift({ userId: u.userId }); break;
      case 'like': this.#out(this.#base('like', u, { likeCount: 1 + Math.floor(this.rnd() * 15) })); break;
      case 'follow': this.#out(this.#base('follow', u)); break;
      case 'share': this.#out(this.#base('share', u)); break;
      default: this.#out(this.#base('member', u));
    }
  }

  #out(raw) {
    if (this.emittedLog && this.state === 'CONNECTED') this.emittedLog.push(raw);
    const ok = this._emitRaw(raw);
    if (ok && raw.type !== 'streamEnd') {
      this.history.push(raw);
      if (this.history.length > 200) this.history.shift();
    }
    return ok;
  }

  #later(fn, ms) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
    return t;
  }

  #user(id) {
    const n = id ?? String(1 + Math.floor(this.rnd() * this.sc.users));
    return { userId: String(n), uniqueId: `nguoi_xem_${n}`, nickname: `Người xem ${n}` };
  }

  #groupId() { return String(Date.now()) + String(Math.floor(this.rnd() * 1e6)).padStart(6, '0'); }
  #msgId() { return this.sc.missingMsgIdRate && this.rnd() < this.sc.missingMsgIdRate ? undefined : `${this.sc.seed}${String(++this.seq).padStart(12, '0')}`; }

  #base(type, user, extra = {}) { return { type, msgId: this.#msgId(), createTime: Date.now(), roomId: this.roomId, user, ...extra }; }
  #giftRaw(user, g, { repeatCount, repeatEnd, groupId }) {
    return this.#base('gift', user, { giftId: g.giftId, giftName: g.giftName, diamondCount: g.diamondCount, giftType: g.giftType, repeatCount, repeatEnd, groupId });
  }

  #invalid() {
    const variants = [
      { type: 'gift', msgId: `bad${++this.seq}`, createTime: Date.now(), user: { userId: '' }, giftId: 'không-phải-số' },
      { type: 'chat', msgId: `bad${++this.seq}` },
      { type: 'gift', createTime: 'hôm qua', user: null },
      { type: 'like', user: { userId: 42 }, likeCount: -3 }
    ];
    return variants[Math.floor(this.rnd() * variants.length)];
  }
}
