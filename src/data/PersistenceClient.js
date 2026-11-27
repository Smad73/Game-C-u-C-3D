// PersistenceClient — phía luồng chính của lớp ghi dữ liệu (ADR-0017, ADR-0019 backpressure, ADR-0022 chỉ số R14).
// Không bao giờ gọi node:sqlite trực tiếp: mọi thao tác DB đi qua PersistenceWorker bằng postMessage.
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import {
  BATCH_CLASSES, BATCH_STATES as S, FROM_WORKER as IN, NACK_CODES, OPS, PersistenceError, TO_WORKER as OUT
} from '../shared/persistence-protocol.js';

const WORKER_URL = new URL('./PersistenceWorker.js', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prio = (cls) => BATCH_CLASSES.indexOf(cls);

export class PersistenceClient extends EventEmitter {
  /**
   * @param {{dbPath:string, backupDir:string, rejectedDir:string, realm:'live'|'demo', config:object,
   *          logger:object, migrationsDir?:string, allowFaults?:boolean}} o
   */
  constructor({ dbPath, backupDir, rejectedDir, realm, config, logger, migrationsDir = null, allowFaults = false }) {
    super();
    this.opts = { dbPath, backupDir, rejectedDir, realm, migrationsDir, allowFaults };
    this.cfg = config;
    this.log = logger;
    this.state = 'STARTING'; // STARTING | READY | DEGRADED | SAFE_MODE | CLOSING | CLOSED
    this.entries = new Map(); // batchId → entry (chỉ các batch chưa chốt)
    this.queue = [];
    this.inFlight = 0;
    this.seq = 0;
    this.worker = null;
    this.epoch = 0;
    this.restarts = 0;
    this.totalRestarts = 0;
    this.restartTimer = null;
    this.readyInfo = null;
    this.fatalInfo = null;
    this.health = null;
    this.reads = new Map();
    this.startPromise = null;
    this.closedWaiter = null;
    this.lastSettingVersion = 0;
    this.dirtyProvider = () => ({ count: 0, oldestAgeMs: 0 });
    this.counters = { committed: 0, rejected: 0, retried: 0, recovered: 0, abandoned: 0 };
  }

  // ───────── vòng đời ─────────
  start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = new Promise((resolve, reject) => {
      this.startSettle = { resolve, reject };
      this.#spawn();
    });
    return this.startPromise;
  }

  #spawn() {
    const epoch = ++this.epoch;
    const w = new Worker(WORKER_URL, {
      workerData: {
        ...this.opts,
        busyTimeoutMs: this.cfg.busyTimeoutMs,
        healthIntervalMs: this.cfg.healthIntervalMs
      }
    });
    this.worker = w;
    w.on('message', (m) => { if (epoch === this.epoch) this.#onMessage(m); });
    w.on('error', (e) => { if (epoch === this.epoch) this.log.error('Worker ghi dữ liệu gặp lỗi', { error: e }); });
    w.on('exit', (code) => { if (epoch === this.epoch) this.#onExit(code); });
  }

  #setState(next, reason) {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.log.info('Trạng thái lớp ghi dữ liệu đổi', { from: prev, to: next, reason });
    this.emit('state', { state: next, prev, reason });
  }

  #alert(code, level, message) { this.emit('alert', { code, level, message }); }
  #clearAlert(code) { this.emit('alert-clear', { code }); }

  // ───────── nhận thông điệp từ Worker ─────────
  #onMessage(m) {
    switch (m.type) {
      case IN.READY: return this.#onReady(m);
      case IN.ACK: return this.#onAck(m);
      case IN.NACK: return this.#onNack(m);
      case IN.BATCH_STATUS: return this.#onBatchStatus(m);
      case IN.RESULT: return this.#onResult(m);
      case IN.HEALTH: this.health = m; return undefined;
      case IN.FATAL: return this.#onFatal(m);
      case IN.CLOSED: this.closedWaiter?.(m); return undefined;
      default: return undefined;
    }
  }

  #onReady(m) {
    const first = !this.readyInfo;
    this.readyInfo = m;
    this.restarts = 0;
    if (this.state !== 'CLOSING') this.#setState('READY', first ? 'khởi động' : 'Worker đã khởi động lại');
    this.#clearAlert('PERSIST_DEGRADED');
    if (first) {
      this.log.info('PersistenceWorker sẵn sàng', { sqlite: m.sqliteVersion, journal: m.journalMode, synchronous: m.synchronous, schema: m.schemaVersion, realm: m.realm, migrationsApplied: m.migrationsApplied });
      this.startSettle?.resolve(m);
      this.startSettle = null;
    } else {
      this.#reconcileUnknown();
    }
    this.#pump();
  }

  #onFatal(m) {
    this.fatalInfo = m;
    this.log.error('PersistenceWorker không khởi động được', { code: m.code, message: m.message });
    this.#alert(m.code === 'CORRUPT' ? 'SAFE_MODE' : 'DB_ERROR', 'critical', `Không mở được cơ sở dữ liệu: ${m.message}`);
    this.#setState('SAFE_MODE', `fatal ${m.code}`);
    if (this.startSettle) {
      this.startSettle.reject(new PersistenceError(m.code, m.message, { fatal: true }));
      this.startSettle = null;
    }
  }

  #onExit(code) {
    this.worker = null;
    for (const r of this.reads.values()) { clearTimeout(r.timer); r.reject(new PersistenceError('WORKER_EXIT', 'Worker đã dừng khi đang đọc')); }
    this.reads.clear();
    if (this.state === 'CLOSING' || this.state === 'CLOSED') { this.closedWaiter?.({ exited: true }); return; }
    if (this.fatalInfo) return; // đã báo fatal, không khởi động lại
    if (!this.readyInfo) {
      this.startSettle?.reject(new PersistenceError('WORKER_EXIT', `Worker dừng trước khi sẵn sàng (mã ${code})`));
      this.startSettle = null;
      this.#setState('SAFE_MODE', 'worker dừng khi khởi động');
      return;
    }
    // Worker chết bất ngờ: các batch đang bay chuyển UNKNOWN (không biết đã commit hay chưa) — ADR-0017 R13.
    this.log.warn('PersistenceWorker dừng bất ngờ', { code });
    for (const e of this.entries.values()) {
      if (e.state === S.SENT) { clearTimeout(e.timer); e.state = S.UNKNOWN; }
    }
    this.inFlight = 0;
    this.#setState('DEGRADED', `worker thoát mã ${code}`);
    this.#alert('PERSIST_DEGRADED', 'critical', 'Lớp ghi dữ liệu vừa dừng bất ngờ; đang khởi động lại.');
    this.restarts++;
    this.totalRestarts++;
    if (this.restarts > this.cfg.maxRestarts) {
      this.#setState('SAFE_MODE', 'vượt số lần khởi động lại Worker');
      this.#alert('SAFE_MODE', 'critical', 'Không khởi động lại được lớp ghi dữ liệu. Dữ liệu chưa ghi đang giữ trong bộ nhớ; hãy xử lý sự cố ổ đĩa/DB.');
      return;
    }
    const delay = Math.min(this.cfg.restartBackoffMs * 2 ** (this.restarts - 1), 10000);
    this.restartTimer = setTimeout(() => { this.restartTimer = null; if (this.state === 'DEGRADED') this.#spawn(); }, delay);
  }

  // ───────── commit / ack / nack ─────────
  /**
   * Ghi một batch. Promise resolve khi Worker ACK (hoặc nhận diện được batch đã commit trước đó).
   * `batchId` ổn định: gọi lại cùng batchId trả về cùng kết quả, không ghi hai lần.
   * @returns {Promise<{status:string, committedAtUtc:number, applied?:number, skipped?:number, recovered:boolean}>}
   */
  commit({ cls = 'progress', ops, batchId = randomUUID(), fault, kind } = {}) {
    const existing = this.entries.get(batchId);
    if (existing) return existing.promise;
    const reject = (code, message) => Promise.reject(new PersistenceError(code, message, { batchId }));
    if (!this.startPromise) return reject('NOT_STARTED', 'Lớp ghi dữ liệu chưa được start()');
    if (this.state === 'CLOSING' || this.state === 'CLOSED') return reject('CLOSED', 'Lớp ghi dữ liệu đã đóng');
    if (this.state === 'SAFE_MODE') return reject('SAFE_MODE', 'Lớp ghi dữ liệu đang ở SAFE MODE, không nhận ghi mới');
    if (!BATCH_CLASSES.includes(cls)) return reject('INVALID', `lớp batch không hợp lệ: ${cls}`);
    if (!Array.isArray(ops) || ops.length === 0) return reject('INVALID', 'ops phải là mảng không rỗng');
    if (cls !== 'critical' && this.#bufferOps() + ops.length > this.cfg.writeBufferHardMax) {
      this.emit('backpressure', { level: 'hard', bufferOps: this.#bufferOps() });
      return reject('BACKPRESSURE', 'Bộ đệm ghi đầy; từ chối batch không thuộc lớp critical');
    }
    const entry = { id: batchId, cls, ops, kind: kind || cls, fault, state: S.PENDING, seq: this.seq++, attempts: 0, createdAt: Date.now(), firstSentAt: null, sentAt: null, timer: null, retryTimer: null };
    entry.promise = new Promise((resolve, rej) => { entry.resolve = resolve; entry.reject = rej; });
    entry.promise.catch(() => {}); // tránh unhandledRejection nếu người gọi bỏ qua; người gọi await vẫn nhận lỗi bình thường
    this.entries.set(batchId, entry);
    this.#enqueue(entry);
    this.#checkBackpressure();
    this.#pump();
    return entry.promise;
  }

  #enqueue(e) {
    this.queue.push(e);
    this.queue.sort((a, b) => prio(a.cls) - prio(b.cls) || a.seq - b.seq);
  }

  #pump() {
    if (!this.worker || (this.state !== 'READY' && this.state !== 'CLOSING')) return;
    while (this.inFlight < this.cfg.maxInFlightBatches && this.queue.length) this.#send(this.queue.shift());
  }

  #send(e) {
    e.state = S.SENT;
    e.attempts++;
    e.sentAt = Date.now();
    e.firstSentAt ??= e.sentAt;
    this.inFlight++;
    try {
      this.worker.postMessage({ type: OUT.COMMIT, batchId: e.id, cls: e.cls, ops: e.ops, fault: e.fault });
    } catch (err) { // ví dụ ops chứa giá trị không sao chép được
      this.inFlight--;
      return this.#reject(e, new PersistenceError(NACK_CODES.REJECTED, `Không gửi được batch tới Worker: ${err.message}`, { batchId: e.id, retryable: false }));
    }
    e.fault = undefined; // chèn lỗi chỉ áp dụng lần gửi đầu
    e.timer = setTimeout(() => this.#onAckTimeout(e), this.cfg.ackTimeoutMs);
    return undefined;
  }

  #onAck(m) {
    const e = this.entries.get(m.batchId);
    if (!e || (e.state !== S.SENT && e.state !== S.UNKNOWN)) return;
    if (e.state === S.SENT) this.inFlight--;
    // results: kết quả từng op (vd. quà đã áp dụng bao nhiêu). Batch ALREADY_COMMITTED / nhận diện qua status → KHÔNG có results:
    // người gọi phải truy vấn DB theo khoá idempotency (ADR-0017 R13), không được đoán.
    this.#committed(e, { status: m.status, committedAtUtc: m.committedAtUtc, applied: m.applied, skipped: m.skipped, commitMs: m.commitMs, results: m.status === 'COMMITTED' ? (m.results || []) : null, recovered: false });
  }

  #committed(e, result) {
    clearTimeout(e.timer);
    e.state = S.COMMITTED;
    this.entries.delete(e.id);
    this.counters.committed++;
    if (result.recovered) this.counters.recovered++;
    e.resolve(result);
    this.emit('committed', { batchId: e.id, cls: e.cls, ...result });
    this.#checkBackpressure();
    this.#pump();
  }

  #onNack(m) {
    const e = m.batchId ? this.entries.get(m.batchId) : null;
    if (!e || (e.state !== S.SENT && e.state !== S.UNKNOWN)) return;
    if (e.state === S.SENT) this.inFlight--;
    clearTimeout(e.timer);
    if (m.code === NACK_CODES.CORRUPT) {
      this.#alert('SAFE_MODE', 'critical', 'Cơ sở dữ liệu báo hỏng (CORRUPT). Đã chuyển SAFE MODE.');
      this.#setState('SAFE_MODE', 'CORRUPT');
    }
    if (m.retryable && e.attempts <= this.cfg.maxRetryAttempts) {
      e.state = S.RETRYABLE;
      e.lastError = { code: m.code, message: m.message };
      this.counters.retried++;
      this.log.warn('Batch bị từ chối tạm thời, sẽ gửi lại cùng batch_id', { batchId: e.id, code: m.code, attempt: e.attempts });
      e.retryTimer = setTimeout(() => {
        e.retryTimer = null;
        if (this.entries.get(e.id) === e && e.state === S.RETRYABLE) { e.state = S.PENDING; this.#enqueue(e); this.#pump(); }
      }, this.cfg.retryBackoffMs * e.attempts);
      return;
    }
    const exhausted = m.retryable;
    if (exhausted) this.#alert('DB_ERROR', 'critical', `Ghi DB thất bại sau ${e.attempts} lần thử (${m.code}): ${m.message}`);
    this.#reject(e, new PersistenceError(m.code, m.message, { batchId: e.id, retryable: false, exhausted }));
  }

  #reject(e, err) {
    clearTimeout(e.timer);
    clearTimeout(e.retryTimer);
    e.state = S.REJECTED;
    this.entries.delete(e.id);
    this.counters.rejected++;
    this.#quarantine(e, err);
    this.#alert('BATCH_REJECTED', 'warn', `Một batch bị từ chối và đã cách ly (${err.code}): ${err.message}`);
    this.emit('batch-rejected', { batchId: e.id, cls: e.cls, code: err.code, message: err.message });
    e.reject(err);
    this.#checkBackpressure();
    this.#pump();
  }

  /** Batch bị REJECTED: lưu ra tệp cách ly để người vận hành/nhà phát triển xem lại (không ghi vào DB). */
  #quarantine(e, err) {
    try {
      mkdirSync(this.opts.rejectedDir, { recursive: true });
      writeFileSync(join(this.opts.rejectedDir, `${e.id}.json`), JSON.stringify({ batchId: e.id, cls: e.cls, code: err.code, message: err.message, rejectedAtUtc: Date.now(), ops: e.ops }, null, 2));
    } catch (ioErr) {
      this.log.warn('Không ghi được tệp cách ly batch bị từ chối', { error: ioErr });
    }
  }

  #onAckTimeout(e) {
    if (e.state !== S.SENT) return;
    e.state = S.UNKNOWN;
    this.inFlight--;
    this.log.warn('Hết thời gian chờ ACK; hỏi Worker batch đã commit chưa', { batchId: e.id });
    if (this.worker) this.worker.postMessage({ type: OUT.STATUS, batchId: e.id });
    this.#pump();
  }

  #reconcileUnknown() {
    for (const e of this.entries.values()) {
      if (e.state === S.UNKNOWN) this.worker.postMessage({ type: OUT.STATUS, batchId: e.id });
    }
  }

  /** R13: Worker trả lời batch có trong committed_batches hay không. */
  #onBatchStatus(m) {
    const e = this.entries.get(m.batchId);
    if (!e || e.state !== S.UNKNOWN) return;
    if (m.state === 'COMMITTED') {
      this.log.info('Nhận diện batch đã commit nhưng mất ACK (không gửi lại)', { batchId: e.id });
      return this.#committed(e, { status: 'COMMITTED', committedAtUtc: null, results: null, recovered: true });
    }
    e.state = S.PENDING; // chưa commit → gửi lại NGUYÊN batch với cùng batch_id
    this.#enqueue(e);
    return this.#pump();
  }

  // ───────── đọc & tiện ích ─────────
  read(query, params = {}, { timeoutMs = 10000 } = {}) {
    if (!this.worker || (this.state !== 'READY' && this.state !== 'CLOSING')) return Promise.reject(new PersistenceError('NOT_READY', `Lớp ghi dữ liệu chưa sẵn sàng (${this.state})`));
    const reqId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.reads.delete(reqId); reject(new PersistenceError('READ_TIMEOUT', `Hết thời gian chờ truy vấn ${query}`)); }, timeoutMs);
      this.reads.set(reqId, { resolve, reject, timer });
      this.worker.postMessage({ type: OUT.READ, reqId, query, params });
    });
  }

  #request(type, extra, timeoutMs = 30000) {
    if (!this.worker) return Promise.reject(new PersistenceError('NOT_READY', 'Worker không chạy'));
    const reqId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.reads.delete(reqId); reject(new PersistenceError('READ_TIMEOUT', `Hết thời gian chờ ${type}`)); }, timeoutMs);
      this.reads.set(reqId, { resolve, reject, timer });
      this.worker.postMessage({ type, reqId, ...extra });
    });
  }

  #onResult(m) {
    const r = this.reads.get(m.reqId);
    if (!r) return;
    clearTimeout(r.timer);
    this.reads.delete(m.reqId);
    if (m.ok) r.resolve(m.rows);
    else r.reject(new PersistenceError(m.code || 'READ_ERROR', m.message));
  }

  backup(name) { return this.#request(OUT.BACKUP, { name }).then((rows) => rows[0].path); }
  checkpoint(mode = 'PASSIVE') { return this.#request(OUT.CHECKPOINT, { mode }).then((rows) => rows[0]); }

  /** Tạo op cấu hình có `version` luôn tăng (bản cũ hơn bị Worker bỏ qua). */
  settingOp(key, value) {
    this.lastSettingVersion = Math.max(this.lastSettingVersion + 1, Date.now());
    return { t: OPS.UPSERT_SETTING, key, value: typeof value === 'string' ? value : JSON.stringify(value), version: this.lastSettingVersion };
  }

  /** Chỗ nối để các Phase sau khai báo "thay đổi trong RAM chưa được đưa vào hàng đợi ghi" (R14). */
  setDirtyProvider(fn) { this.dirtyProvider = fn; }

  // ───────── backpressure & chỉ số R14 ─────────
  #bufferOps() {
    let n = 0;
    for (const e of this.entries.values()) if (e.state === S.PENDING || e.state === S.RETRYABLE) n += e.ops.length;
    return n;
  }

  #checkBackpressure() {
    const n = this.#bufferOps();
    const level = n >= this.cfg.writeBufferHardMax ? 'hard' : n >= this.cfg.writeBufferSoftMax ? 'soft' : 'ok';
    if (level !== this.bufferLevel) {
      this.bufferLevel = level;
      this.emit('backpressure', { level, bufferOps: n });
    }
  }

  /**
   * Bộ chỉ số dữ liệu có nguy cơ mất (ADR-0017 R14). Đây là CẢNH BÁO vận hành, KHÔNG phải cam kết độ bền;
   * RPO thực tế chỉ công bố sau khi đo bằng kiểm thử crash (ADR-0022).
   */
  metrics() {
    const now = Date.now();
    let oldestCreated = null;
    let oldestSent = null;
    const byType = { giftReceived: 0, giftEffect: 0, catch: 0, progress: 0, state: 0, log: 0, critical: 0 };
    for (const e of this.entries.values()) {
      oldestCreated = oldestCreated === null ? e.createdAt : Math.min(oldestCreated, e.createdAt);
      if (e.firstSentAt !== null) oldestSent = oldestSent === null ? e.firstSentAt : Math.min(oldestSent, e.firstSentAt);
      byType[e.kind] = (byType[e.kind] || 0) + e.ops.length;
    }
    const dirty = this.dirtyProvider() || { count: 0, oldestAgeMs: 0 };
    return {
      state: this.state,
      oldestUnpersistedEventAgeMs: Math.max(oldestCreated === null ? 0 : now - oldestCreated, dirty.oldestAgeMs || 0),
      oldestUnackedBatchAgeMs: oldestSent === null ? 0 : now - oldestSent,
      unpersistedByType: byType,
      ramDirtyNotEnqueued: { count: dirty.count || 0, oldestAgeMs: dirty.oldestAgeMs || 0 },
      writeBufferOps: this.#bufferOps(),
      writeBufferLevel: this.bufferLevel || 'ok',
      inFlightBatches: this.inFlight,
      unresolvedBatches: this.entries.size,
      workerRestarts: this.totalRestarts,
      counters: { ...this.counters },
      worker: this.health ? { walBytes: this.health.walBytes, freeBytes: this.health.freeBytes, lastCommitMs: this.health.lastCommitMs, commits: this.health.commits, atUtc: this.health.atUtc } : null,
      schemaVersion: this.readyInfo?.schemaVersion ?? null,
      realm: this.opts.realm
    };
  }

  /**
   * CHỈ cho kiểm thử crash (CR8): mô phỏng tiến trình chết — dừng Worker ngay (worker.terminate), KHÔNG gửi nốt, KHÔNG checkpoint,
   * KHÔNG khởi động lại. Dữ liệu đã COMMIT nằm trong WAL và được SQLite phục hồi khi mở lại; batch chưa commit bị bỏ.
   */
  async kill() {
    this.state = 'CLOSED';
    clearTimeout(this.restartTimer);
    for (const e of this.entries.values()) { clearTimeout(e.timer); clearTimeout(e.retryTimer); }
    this.entries.clear();
    this.queue = [];
    for (const r of this.reads.values()) clearTimeout(r.timer);
    this.reads.clear();
    const w = this.worker;
    this.worker = null;
    if (w) await w.terminate();
  }

  // ───────── đóng ─────────
  /** Gửi nốt các batch còn lại, rồi dừng Worker (commit nốt + checkpoint WAL TRUNCATE + đóng DB). */
  async close({ deadlineMs = 10000 } = {}) {
    if (this.state === 'CLOSED') return { drained: true, abandoned: 0, checkpointed: false };
    this.#setState('CLOSING', 'đóng');
    clearTimeout(this.restartTimer);
    const t0 = Date.now();
    this.#pump();
    while (this.entries.size > 0 && this.worker && Date.now() - t0 < deadlineMs) {
      this.#pump();
      await sleep(10);
    }
    const abandoned = this.entries.size;
    if (abandoned > 0) {
      this.counters.abandoned += abandoned;
      this.log.warn('Đóng lớp ghi dữ liệu khi còn batch chưa ghi bền', { abandoned });
      for (const e of [...this.entries.values()]) {
        clearTimeout(e.timer);
        clearTimeout(e.retryTimer);
        this.entries.delete(e.id);
        e.reject(new PersistenceError('CLOSED', 'Đóng trước khi batch được ghi bền', { batchId: e.id }));
      }
    }
    let checkpointed = false;
    if (this.worker) {
      const w = this.worker;
      const closed = new Promise((done) => { this.closedWaiter = done; });
      w.postMessage({ type: OUT.SHUTDOWN });
      const res = await Promise.race([closed, sleep(5000).then(() => null)]);
      checkpointed = Boolean(res?.checkpointed);
      if (!res) await w.terminate();
    }
    for (const r of this.reads.values()) { clearTimeout(r.timer); r.reject(new PersistenceError('CLOSED', 'Đã đóng')); }
    this.reads.clear();
    this.state = 'CLOSED';
    return { drained: abandoned === 0, abandoned, checkpointed };
  }
}
