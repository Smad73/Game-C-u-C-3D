// ConnectorBase — vòng đời kết nối dùng chung cho LiveConnector và MockConnector (ADR-0003, ADR-0012, luật NOVA livestream).
// - Một connector = tối đa MỘT kết nối: gọi connect() khi đang kết nối/đã kết nối trả về cùng promise (không tạo kết nối trùng).
// - Rớt mạng tạm thời → nối lại có giới hạn, giãn cách tăng dần (exponential backoff + jitter), quá số lần → FAILED.
// - streamEnd → ENDED: đóng, KHÔNG tự nối lại, KHÔNG poll; chỉ người vận hành gọi connect() lại.
// - Sau ENDED/STOPPED/FAILED: mọi sự kiện đến muộn từ thư viện bị bỏ (đếm), không đi vào đường ống.
import { EventEmitter } from 'node:events';
import { RAW_TYPES, SOURCE_REALM } from './events.js';

export const CONN_STATES = Object.freeze({
  IDLE: 'IDLE', CONNECTING: 'CONNECTING', CONNECTED: 'CONNECTED', RECONNECTING: 'RECONNECTING',
  ENDED: 'ENDED', STOPPED: 'STOPPED', FAILED: 'FAILED'
});
const S = CONN_STATES;
const ACTIVE = new Set([S.CONNECTING, S.CONNECTED, S.RECONNECTING]);

export const DEFAULT_RECONNECT = Object.freeze({ maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 30000, jitter: 0.2 });

/** Giãn cách lần thử thứ n (1-based): base·2^(n-1), trần maxDelayMs, ± jitter. Hàm thuần — test được. */
export function backoffDelay(n, { baseDelayMs, maxDelayMs, jitter }, rand = Math.random) {
  const d = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, n - 1));
  const j = d * jitter * (rand() * 2 - 1);
  return Math.max(0, Math.round(d + j));
}

export class ConnectorError extends Error {
  constructor(code, message, { transient = false } = {}) { super(message); this.name = 'ConnectorError'; this.code = code; this.transient = transient; }
}

export class ConnectorBase extends EventEmitter {
  /**
   * @param {{source:'tiktok'|'mock'|'loadgen', username?:string|null, reconnect?:object, logger?:object,
   *          setTimer?:Function, clearTimer?:Function, rand?:Function}} o
   */
  constructor({ source, username = null, reconnect = {}, logger = null, setTimer = setTimeout, clearTimer = clearTimeout, rand = Math.random }) {
    super();
    if (!SOURCE_REALM[source]) throw new Error(`nguồn connector không hợp lệ: ${source}`);
    this.source = source;
    this.realm = SOURCE_REALM[source]; // cố định theo loại connector (ADR-0021)
    this.username = username;
    this.reconnect = { ...DEFAULT_RECONNECT, ...reconnect };
    this.log = logger;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.rand = rand;
    this.state = S.IDLE;
    this.roomId = null;
    this.attempt = 0;
    this.connectPromise = null;
    this.retryTimer = null;
    this.stats = { emitted: 0, droppedNotConnected: 0, droppedInvalidType: 0, connects: 0, reconnects: 0, drops: 0, errors: 0 };
  }

  // ───── API công khai ─────
  /** Kết nối (idempotent khi đang hoạt động). Resolve {roomId} khi CONNECTED; reject khi FAILED/ENDED/STOPPED trong lúc chờ. */
  connect() {
    if (ACTIVE.has(this.state) && this.connectPromise) return this.connectPromise;
    this.attempt = 0;
    this.connectPromise = new Promise((resolve, reject) => { this.pending = { resolve, reject }; });
    this.connectPromise.catch(() => {});
    this.#attempt(S.CONNECTING);
    return this.connectPromise;
  }

  /** Người vận hành ngắt: STOPPED, huỷ nối lại. */
  async disconnect(reason = 'MANUAL') {
    this.#cancelRetry();
    if (this.state === S.STOPPED || this.state === S.IDLE) { this.#set(S.STOPPED, reason); return; }
    const wasActive = ACTIVE.has(this.state);
    this.#set(S.STOPPED, reason);
    this.#settle(new ConnectorError('STOPPED', `đã ngắt (${reason})`));
    if (wasActive) await this.#safeClose();
  }

  snapshot() {
    return { source: this.source, realm: this.realm, username: this.username, state: this.state, roomId: this.roomId, attempt: this.attempt, maxAttempts: this.reconnect.maxAttempts, stats: { ...this.stats } };
  }

  // ───── Cho lớp con ─────
  /** Lớp con mở kết nối thật; trả {roomId}. Ném ConnectorError(transient=true) nếu lỗi tạm thời. */
  async _open() { throw new Error('chưa cài đặt _open'); }
  /** Lớp con đóng kết nối. Phải an toàn khi gọi nhiều lần. */
  async _close() {}

  /** Lớp con gọi khi có sự kiện từ nguồn. Chỉ chuyển tiếp khi CONNECTED. */
  _emitRaw(raw) {
    if (this.state !== S.CONNECTED) { this.stats.droppedNotConnected++; return false; }
    if (!raw || typeof raw !== 'object' || !RAW_TYPES.includes(raw.type)) { this.stats.droppedInvalidType++; this.emit('raw-invalid', raw); return false; }
    this.stats.emitted++;
    this.emit('raw', raw, { receivedAt: Date.now(), source: this.source, realm: this.realm, roomId: this.roomId });
    if (raw.type === 'streamEnd') this._streamEnded('STREAM_END');
    return true;
  }

  /** Lớp con gọi khi kết nối rớt ngoài ý muốn (mạng). */
  _dropped(err) {
    if (this.state !== S.CONNECTED) return;
    this.stats.drops++;
    this.log?.warn?.('Mất kết nối nguồn sự kiện; sẽ nối lại có giới hạn', { source: this.source, error: err?.message });
    this.#safeClose();
    this.attempt = 0;
    this.#scheduleRetry(err);
  }

  /** LIVE kết thúc thật: ENDED — đóng, không nối lại, không poll. */
  _streamEnded(reason = 'STREAM_END') {
    if (!ACTIVE.has(this.state)) return;
    this.#cancelRetry();
    this.#set(S.ENDED, reason);
    this.#settle(new ConnectorError('ENDED', 'LIVE đã kết thúc'));
    this.#safeClose();
  }

  _error(err) { this.stats.errors++; this.emit('connector-error', { code: err?.code || 'ERROR', message: err?.message || String(err) }); }

  // ───── nội bộ ─────
  async #attempt(stateDuring) {
    this.#set(stateDuring, stateDuring === S.CONNECTING ? 'kết nối' : `nối lại lần ${this.attempt}`);
    const my = this.state;
    try {
      const info = await this._open();
      if (this.state !== my) { await this.#safeClose(); return; } // đã bị ngắt/ended trong lúc mở
      this.roomId = info?.roomId ?? null;
      this.stats.connects++;
      if (stateDuring === S.RECONNECTING) this.stats.reconnects++;
      this.attempt = 0;
      this.#set(S.CONNECTED, 'đã kết nối');
      this.emit('connected', { roomId: this.roomId, reconnect: stateDuring === S.RECONNECTING });
      this.pending?.resolve({ roomId: this.roomId });
      this.pending = null;
    } catch (e) {
      if (this.state !== my) return;
      this._error(e);
      if (e?.code === 'LIVE_ENDED' || e?.code === 'NOT_LIVE') { // phòng không phát: không poll
        this.#set(S.ENDED, e.code);
        this.#settle(new ConnectorError(e.code, e.message));
        return;
      }
      if (e?.transient === false) { this.#fail(e); return; }
      this.#scheduleRetry(e);
    }
  }

  #scheduleRetry(err) {
    this.attempt++;
    if (this.attempt > this.reconnect.maxAttempts) { this.#fail(err || new ConnectorError('RETRY_EXHAUSTED', 'hết số lần nối lại')); return; }
    const delay = backoffDelay(this.attempt, this.reconnect, this.rand);
    this.#set(S.RECONNECTING, `chờ ${delay}ms trước lần thử ${this.attempt}/${this.reconnect.maxAttempts}`);
    this.emit('retry', { attempt: this.attempt, delayMs: delay });
    this.retryTimer = this.setTimer(() => { this.retryTimer = null; if (this.state === S.RECONNECTING) this.#attempt(S.RECONNECTING); }, delay);
  }

  #fail(err) {
    this.#cancelRetry();
    this.#set(S.FAILED, err?.message || 'thất bại');
    this.#settle(new ConnectorError(err?.code || 'FAILED', err?.message || 'kết nối thất bại'));
  }

  #settle(err) { this.pending?.reject(err); this.pending = null; }
  #cancelRetry() { if (this.retryTimer) { this.clearTimer(this.retryTimer); this.retryTimer = null; } }
  async #safeClose() { try { await this._close(); } catch (e) { this.log?.warn?.('Lỗi khi đóng connector (bỏ qua)', { error: e?.message }); } }

  #set(next, reason) {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.emit('state', { state: next, prev, reason, roomId: this.roomId, attempt: this.attempt });
  }
}
