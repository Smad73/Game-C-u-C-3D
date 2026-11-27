// IngestPipeline — Connector → Normalizer → Dedupe → (quà: GiftJournal | còn lại: RateLimit → PriorityEventQueue) → EventBus (ADR-0006).
// Không chứa logic gameplay. Tầng sau (Phase 3: GameCore/WorldCore) đăng ký onEvent() để nhận sự kiện thường theo ngân sách,
// và GiftJournal.onCommittedGift() để nhận hiệu ứng quà ĐÃ COMMIT.
// Luật NOVA livestream: streamEnd → ngắt, không tự nối lại/poll; INGEST_HALT (S4) → ngắt, chỉ người vận hành nối lại.
import { EventEmitter } from 'node:events';
import { NormalizeError, normalize } from './Normalizer.js';
import { PriorityEventQueue } from './PriorityEventQueue.js';

class Lru {
  constructor(max) { this.max = max; this.m = new Map(); }
  seen(k) { if (this.m.has(k)) return true; this.m.set(k, 1); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value); return false; }
}

export const DEFAULT_PIPELINE = Object.freeze({ drainPerTick: 2000, tickMs: 50, commentsPerUserPerSec: 5, commentBurst: 10, dedupeLruSize: 100000 });

export class IngestPipeline extends EventEmitter {
  /**
   * @param {{connector:import('./ConnectorBase.js').ConnectorBase, journal:import('../gifts/GiftJournal.js').GiftJournal,
   *          sessions:import('./LiveSessionManager.js').LiveSessionManager, logger:object, config?:object, queueConfig?:object,
   *          isProtect?:()=>boolean}} o
   */
  constructor({ connector, journal, sessions, logger, config = {}, queueConfig = {} }) {
    super();
    this.conn = connector;
    this.journal = journal;
    this.sessions = sessions;
    this.log = logger;
    this.cfg = { ...DEFAULT_PIPELINE, ...config };
    this.queue = new PriorityEventQueue(queueConfig);
    this.dedupe = new Lru(this.cfg.dedupeLruSize);
    this.buckets = new Map();
    this.subs = [];
    this.halted = false;
    this.c = { raw: 0, invalid: {}, duplicates: 0, rateLimited: 0, byType: {}, giftsFromConnector: 0, giftStatus: {} };
    this.rate = { windowStart: Date.now(), count: 0, perSec: 0 };
    this.timer = null;

    this.onRaw = (raw, meta) => this.handleRaw(raw, meta);
    this.onConnected = ({ roomId }) => this.sessions?.onConnected({ roomId }).catch((e) => this.log?.error?.('Không cập nhật được buổi LIVE khi kết nối', { error: e?.message }));
    this.onState = (s) => {
      this.emit('connector-state', s);
      if (s.state === 'ENDED' && s.reason === 'STREAM_END') this.sessions?.onStreamEnd().catch(() => {});
    };
    this.onHalt = (h) => {
      this.halted = true;
      this.log?.error?.('INGEST_HALT: ngắt nguồn sự kiện (không tự nối lại)', h);
      this.conn.disconnect('INGEST_HALT').catch(() => {});
      this.emit('halted', h);
    };
    this.onResume = () => { this.halted = false; this.emit('resumable'); };
  }

  // ───────── vòng đời ─────────
  start() {
    this.conn.on('raw', this.onRaw);
    this.conn.on('connected', this.onConnected);
    this.conn.on('state', this.onState);
    this.journal.on('halt', this.onHalt);
    this.journal.on('resume', this.onResume);
    this.timer = setInterval(() => this.#tick(), this.cfg.tickMs);
    this.timer.unref?.();
  }

  async stop() {
    clearInterval(this.timer); this.timer = null;
    await this.conn.disconnect('SHUTDOWN').catch(() => {});
    this.conn.off('raw', this.onRaw); this.conn.off('connected', this.onConnected); this.conn.off('state', this.onState);
    this.journal.off('halt', this.onHalt); this.journal.off('resume', this.onResume);
    this.#tick(); // giao nốt sự kiện đã xếp hàng
  }

  /** Người vận hành bấm "Kết nối". Bị chặn khi đang INGEST_HALT (lưu trữ chưa khôi phục). */
  connect() {
    if (this.halted) return Promise.reject(Object.assign(new Error('Đang INGEST_HALT: lưu trữ quà chưa khôi phục — chưa thể kết nối lại.'), { code: 'INGEST_HALTED' }));
    return this.conn.connect();
  }
  disconnect(reason = 'MANUAL') { return this.conn.disconnect(reason); }

  /** Tầng sau đăng ký nhận sự kiện thường (không phải quà). */
  onEvent(fn) { this.subs.push(fn); }

  // ───────── xử lý ─────────
  handleRaw(raw, meta) {
    this.c.raw++;
    this.#countRate();
    let ev;
    try {
      ev = normalize(raw, meta);
    } catch (e) {
      const code = e instanceof NormalizeError ? e.code : 'NORMALIZE_ERROR';
      this.c.invalid[code] = (this.c.invalid[code] || 0) + 1;
      return { status: 'INVALID', code };
    }
    ev.processed_at = Date.now();
    this.c.byType[ev.event_type] = (this.c.byType[ev.event_type] || 0) + 1;
    this.sessions?.touch(ev.received_at);

    if (ev.event_type === 'gift') {
      this.c.giftsFromConnector++;
      ev.live_session_id = this.sessions?.currentId ?? null;
      const p = this.journal.receive(ev).then((r) => { this.c.giftStatus[r.status] = (this.c.giftStatus[r.status] || 0) + 1; return r; });
      p.catch((e) => this.log?.error?.('Lỗi không mong đợi khi nhận quà', { error: e?.message }));
      return { status: 'GIFT', promise: p };
    }
    if (ev.source_event_id && this.dedupe.seen(`${ev.event_type}:${ev.source_event_id}`)) { this.c.duplicates++; return { status: 'DUPLICATE' }; }
    if (ev.event_type === 'comment' && !this.#allowComment(ev.player_key, ev.received_at)) { this.c.rateLimited++; return { status: 'RATE_LIMITED' }; }
    return { status: this.queue.push(ev).toUpperCase() };
  }

  #allowComment(key, now) {
    let b = this.buckets.get(key);
    if (!b) { b = { tokens: this.cfg.commentBurst, at: now }; this.buckets.set(key, b); if (this.buckets.size > 200000) this.buckets.delete(this.buckets.keys().next().value); }
    b.tokens = Math.min(this.cfg.commentBurst, b.tokens + ((now - b.at) / 1000) * this.cfg.commentsPerUserPerSec);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  #countRate() {
    const now = Date.now();
    if (now - this.rate.windowStart >= 1000) { this.rate.perSec = Math.round(this.rate.count * 1000 / (now - this.rate.windowStart)); this.rate.count = 0; this.rate.windowStart = now; }
    this.rate.count++;
  }

  #tick() {
    const batch = this.queue.drain(this.cfg.drainPerTick);
    if (!batch.length) return;
    for (const fn of this.subs) {
      try { fn(batch); } catch (e) { this.log?.error?.('Bộ xử lý sự kiện ném lỗi (bỏ qua lô này cho bộ xử lý đó)', { error: e?.message }); }
    }
  }

  metrics() {
    const now = Date.now();
    const perSec = now - this.rate.windowStart > 1500 ? 0 : this.rate.perSec;
    return {
      halted: this.halted, eventsPerSec: perSec, connector: this.conn.snapshot(), session: this.sessions?.snapshot() ?? null,
      counters: { ...this.c, invalid: { ...this.c.invalid }, byType: { ...this.c.byType }, giftStatus: { ...this.c.giftStatus } },
      queue: this.queue.metrics(), gifts: this.journal.metrics()
    };
  }
}
