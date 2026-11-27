// PriorityEventQueue — hàng đợi có trần theo lớp (ADR-0006, ADR-0019). Giới hạn ở đây là GIỚI HẠN VẬN HÀNH, không phải luật chơi.
// Quà KHÔNG đi qua hàng đợi này để vào gameplay: hiệu ứng quà chỉ đến gameplay qua GiftJournal (sau commit). Hàng đợi chỉ mang
// sự kiện thường (comment/join/like/follow/share) và sự kiện hệ thống (stream_end).
//
// Chính sách khi đầy (đếm hết, không âm thầm):
//   critical — không bao giờ bỏ; vượt softMax → cảnh báo QUEUE_HIGH.
//   progress — (comment/join) vượt max → bỏ sự kiện MỚI NHẤT, đếm `dropped.progress` (comment có thể gửi lại; ADR-0019 bảng R05).
//   state    — like/follow/share: gộp theo (người chơi, loại) khi đã có trong hàng đợi; vượt max → bỏ CŨ NHẤT, đếm.
//   log      — vượt max → bỏ cũ nhất trước tiên.
import { EVENT_CLASS } from './events.js';

export const DEFAULT_QUEUE = Object.freeze({ criticalSoftMax: 5000, progressMax: 20000, stateMax: 50000, logMax: 10000 });
const CLASSES = ['critical', 'progress', 'state', 'log'];

export class PriorityEventQueue {
  constructor(cfg = {}) {
    this.cfg = { ...DEFAULT_QUEUE, ...cfg };
    this.q = Object.fromEntries(CLASSES.map((c) => [c, []]));
    this.head = Object.fromEntries(CLASSES.map((c) => [c, 0])); // chỉ số đầu (tránh shift O(n))
    this.coalesceIdx = new Map(); // `${type}:${player}` → ev (lớp state)
    this.c = { pushed: 0, coalesced: 0, dropped: { critical: 0, progress: 0, state: 0, log: 0 }, drained: 0 };
  }

  size(cls) { return this.q[cls].length - this.head[cls]; }
  get total() { return CLASSES.reduce((n, c) => n + this.size(c), 0); }

  /** @returns {'queued'|'coalesced'|'dropped'} */
  push(ev) {
    const cls = EVENT_CLASS[ev.event_type] ?? 'log';
    this.c.pushed++;
    if (cls === 'state' && ev.player_key) {
      const k = `${ev.event_type}:${ev.player_key}`;
      const prev = this.coalesceIdx.get(k);
      if (prev) { prev.coalesced = (prev.coalesced || 1) + 1; if (ev.event_type === 'like') prev.payload.count += ev.payload.count; this.c.coalesced++; return 'coalesced'; }
      this.coalesceIdx.set(k, ev);
    }
    const max = cls === 'critical' ? Infinity : this.cfg[`${cls}Max`];
    if (this.size(cls) >= max) {
      this.c.dropped[cls]++;
      if (cls === 'progress') return 'dropped'; // bỏ MỚI NHẤT (đã đếm)
      this.#unindex(this.#shift(cls)); // state/log: bỏ cũ nhất
    }
    ev.queued_at = Date.now();
    this.q[cls].push(ev);
    return 'queued';
  }

  /** Lấy tối đa n sự kiện theo thứ tự ưu tiên (critical → progress → state → log). */
  drain(n) {
    const out = [];
    for (const c of CLASSES) {
      while (out.length < n && this.size(c) > 0) { const ev = this.#shift(c); this.#unindex(ev); out.push(ev); }
      if (out.length >= n) break;
    }
    this.c.drained += out.length;
    return out;
  }

  #shift(c) {
    const ev = this.q[c][this.head[c]];
    this.q[c][this.head[c]] = undefined;
    this.head[c]++;
    if (this.head[c] > 4096 && this.head[c] * 2 > this.q[c].length) { this.q[c] = this.q[c].slice(this.head[c]); this.head[c] = 0; }
    return ev;
  }

  #unindex(ev) {
    if (ev && ev.player_key && EVENT_CLASS[ev.event_type] === 'state') {
      const k = `${ev.event_type}:${ev.player_key}`;
      if (this.coalesceIdx.get(k) === ev) this.coalesceIdx.delete(k);
    }
  }

  metrics() {
    const now = Date.now();
    const per = {};
    for (const c of CLASSES) {
      const first = this.size(c) ? this.q[c][this.head[c]] : null;
      per[c] = { depth: this.size(c), max: c === 'critical' ? this.cfg.criticalSoftMax : this.cfg[`${c}Max`], oldestAgeMs: first ? now - first.queued_at : 0 };
    }
    return { total: this.total, classes: per, counters: { ...this.c, dropped: { ...this.c.dropped } } };
  }
}
