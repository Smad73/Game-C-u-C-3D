// Bậc quá tải L0–L4 + SAFE MODE (ADR-0019). Giới hạn ở đây là GIỚI HẠN VẬN HÀNH cấu hình được, KHÔNG phải luật chơi:
// chạm ngưỡng thì giảm chất lượng / gộp / làm chậm / tạm dừng mô phỏng — không bao giờ từ chối người tham gia hay xoá người chơi.
// Phase 1 chỉ có các đầu vào đo được ngay (event loop, heap, chỉ số ghi dữ liệu, đĩa, trạng thái lớp ghi); hàng đợi sự kiện và FPS của stage nối ở Phase sau.
import { EventEmitter } from 'node:events';

export const LEVELS = Object.freeze(['L0', 'L1', 'L2', 'L3', 'L4', 'SAFE_MODE']);
const rank = (l) => LEVELS.indexOf(l);

/**
 * Hàm thuần: tính bậc từ đầu vào. Trả về { level, reasons: [{level, code, detail}], alerts: [{code, level, message}], clear: [code] }.
 */
export function evaluateOverload(inputs, cfg, persistCfg) {
  const reasons = [];
  const alerts = [];
  const raise = (level, code, detail) => reasons.push({ level, code, detail });

  const { eventLoopP95Ms = 0, heapUsedMb = 0, persist = null, diskFreeBytes = null, persistState = 'READY', stageFps = null, ingest = null } = inputs;

  if (persistState === 'SAFE_MODE') raise('SAFE_MODE', 'SAFE_MODE', 'Lớp ghi dữ liệu ở SAFE MODE');
  if (persistState === 'DEGRADED') raise('L3', 'PERSIST_DEGRADED', 'Worker ghi dữ liệu đang khởi động lại');

  if (stageFps !== null && stageFps < 27) raise('L1', 'RENDER_FPS', `FPS stage ${stageFps} < 27`);

  if (eventLoopP95Ms >= cfg.eventLoopP95CritMs) { raise('L3', 'TICK_SLOW', `event loop p95 ${eventLoopP95Ms}ms ≥ ${cfg.eventLoopP95CritMs}ms`); alerts.push({ code: 'TICK_SLOW', level: 'critical' }); }
  else if (eventLoopP95Ms >= cfg.eventLoopP95WarnMs) { raise('L2', 'TICK_SLOW', `event loop p95 ${eventLoopP95Ms}ms ≥ ${cfg.eventLoopP95WarnMs}ms`); alerts.push({ code: 'TICK_SLOW', level: 'warn' }); }

  if (heapUsedMb >= cfg.heapUsedCritMb) raise('L4', 'HEAP', `heap ${heapUsedMb}MB ≥ ${cfg.heapUsedCritMb}MB`);
  else if (heapUsedMb >= cfg.heapUsedWarnMb) raise('L3', 'HEAP', `heap ${heapUsedMb}MB ≥ ${cfg.heapUsedWarnMb}MB`);

  if (persist) {
    const age = persist.oldestUnpersistedEventAgeMs;
    const ack = persist.oldestUnackedBatchAgeMs;
    if (persist.writeBufferOps >= persistCfg.writeBufferHardMax) raise('L4', 'WRITE_BUFFER', `bộ đệm ghi ${persist.writeBufferOps} ≥ ${persistCfg.writeBufferHardMax}`);
    else if (persist.writeBufferOps >= persistCfg.writeBufferSoftMax) raise('L3', 'WRITE_BUFFER', `bộ đệm ghi ${persist.writeBufferOps} ≥ ${persistCfg.writeBufferSoftMax}`);
    if (age >= persistCfg.oldestUnpersistedCritMs) { raise('L4', 'PERSIST_LAG', `sự kiện chưa ghi bền cũ nhất ${age}ms`); alerts.push({ code: 'PERSIST_LAG', level: 'critical' }); }
    else if (age >= persistCfg.oldestUnpersistedWarnMs) { raise('L3', 'PERSIST_LAG', `sự kiện chưa ghi bền cũ nhất ${age}ms`); alerts.push({ code: 'PERSIST_LAG', level: 'warn' }); }
    if (ack >= persistCfg.oldestUnackedBatchCritMs) { raise('L4', 'PERSIST_LAG', `batch chưa ACK cũ nhất ${ack}ms`); alerts.push({ code: 'PERSIST_LAG', level: 'critical' }); }
    else if (ack >= persistCfg.oldestUnackedBatchWarnMs) { raise('L3', 'PERSIST_LAG', `batch chưa ACK cũ nhất ${ack}ms`); alerts.push({ code: 'PERSIST_LAG', level: 'warn' }); }
  }

  if (diskFreeBytes !== null) {
    const d = cfg.disk;
    if (diskFreeBytes < d.safeFreeBytes) { raise('L4', 'DISK', `ổ đĩa còn ${diskFreeBytes}B < ${d.safeFreeBytes}B`); alerts.push({ code: 'DISK_CRITICAL', level: 'critical' }); }
    else if (diskFreeBytes < d.critFreeBytes) { raise('L3', 'DISK', `ổ đĩa còn ${diskFreeBytes}B < ${d.critFreeBytes}B`); alerts.push({ code: 'DISK_CRITICAL', level: 'warn' }); }
    else if (diskFreeBytes < d.warnFreeBytes) { raise('L2', 'DISK', `ổ đĩa còn ${diskFreeBytes}B < ${d.warnFreeBytes}B`); alerts.push({ code: 'DISK_LOW', level: 'warn' }); }
  }

  // Phase 2 — đầu vào Ingest (ADR-0019 bậc L2/L4): tốc độ sự kiện, độ đầy hàng đợi, quà chờ, INGEST_HALT.
  if (ingest) {
    const maxRate = cfg.ingestEventsPerSec ?? 2000;
    if (ingest.eventsPerSec > maxRate) raise('L2', 'INGEST_RATE', `${ingest.eventsPerSec} sự kiện/s > ${maxRate}`);
    const q = ingest.queue?.classes || {};
    let qHigh = false;
    for (const c of ['progress', 'state']) if (q[c] && q[c].max > 0 && q[c].depth > q[c].max * 0.5) { raise('L2', 'QUEUE_HIGH', `hàng đợi ${c} ${q[c].depth}/${q[c].max}`); qHigh = true; }
    if (q.critical && q.critical.depth > q.critical.max) { raise('L2', 'QUEUE_HIGH', `hàng đợi critical ${q.critical.depth} > ${q.critical.max}`); qHigh = true; }
    if (qHigh) alerts.push({ code: 'QUEUE_HIGH', level: 'warn' });
    const gp = ingest.giftPendingAgeMs ?? 0;
    if (gp >= persistCfg.oldestUnpersistedCritMs) raise('L4', 'GIFT_LAG', `quà chờ ghi/áp dụng cũ nhất ${gp}ms`);
    else if (gp >= persistCfg.oldestUnpersistedWarnMs) raise('L3', 'GIFT_LAG', `quà chờ ghi/áp dụng cũ nhất ${gp}ms`);
    if (ingest.halted) raise('L4', 'INGEST_HALTED', 'đã ngừng tiếp nhận sự kiện (thang lưu trữ S4)');
  }

  let level = 'L0';
  for (const r of reasons) if (rank(r.level) > rank(level)) level = r.level;

  // Mã cảnh báo do hàm này quản lý — các mã không còn lý do thì cần xoá.
  const owned = ['TICK_SLOW', 'PERSIST_LAG', 'DISK_LOW', 'DISK_CRITICAL', 'QUEUE_HIGH'];
  const active = new Set(alerts.map((a) => a.code));
  return { level, reasons, alerts, clear: owned.filter((c) => !active.has(c)) };
}

export class OverloadController extends EventEmitter {
  /**
   * @param {{config:object, persistConfig:object, alerts:import('./Alerts.js').Alerts, logger:object, getInputs:()=>object}} o
   */
  constructor({ config, persistConfig, alerts, logger, getInputs }) {
    super();
    this.cfg = config;
    this.persistCfg = persistConfig;
    this.alerts = alerts;
    this.log = logger;
    this.getInputs = getInputs;
    this.level = 'L0';
    this.reasons = [];
    this.okTicks = 0;
    this.timer = null;
  }

  /** Tạm dừng mô phỏng để bảo vệ dữ liệu (Phase sau dùng cờ này để đóng băng scheduler). */
  get pausedProtect() { return this.level === 'L4' || this.level === 'SAFE_MODE'; }

  evaluateNow() {
    const res = evaluateOverload(this.getInputs(), this.cfg, this.persistCfg);
    for (const a of res.alerts) this.alerts.raise(a.code, a.level);
    for (const c of res.clear) this.alerts.clear(c);
    this.reasons = res.reasons;

    const cur = rank(this.level);
    const next = rank(res.level);
    if (next > cur) {
      this.#change(res.level, res.reasons);
      this.okTicks = 0;
    } else if (next < cur) {
      // Trễ (hysteresis): chỉ hạ bậc sau N lần đánh giá liên tiếp đều thấp hơn.
      this.okTicks++;
      if (this.okTicks >= this.cfg.recoverAfterOkTicks) { this.#change(res.level, res.reasons); this.okTicks = 0; }
    } else {
      this.okTicks = 0;
    }
    return { level: this.level, reasons: this.reasons };
  }

  #change(level, reasons) {
    const prev = this.level;
    this.level = level;
    this.log.warn('Bậc quá tải đổi', { from: prev, to: level, reasons: reasons.map((r) => `${r.code}: ${r.detail}`) });
    this.emit('level', { level, prev, reasons });
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { try { this.evaluateNow(); } catch (e) { this.log.error('Lỗi khi đánh giá quá tải', { error: e }); } }, this.cfg.evaluateIntervalMs);
    this.timer.unref();
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  snapshot() { return { level: this.level, pausedProtect: this.pausedProtect, reasons: this.reasons }; }
}
