// Luồng tắt an toàn (ADR-0012 §6, ARCHITECTURE §1.4). Các bước đăng ký theo thứ tự, mỗi bước có trần thời gian,
// cả luồng có trần tổng. Mã thoát: 0 = đã lưu an toàn; 3 = có bước lỗi/quá hạn/bị bỏ qua (chưa chắc đã lưu đủ); 1 = tắt do lỗi.
// Phase 1 chỉ có khung + các bước hạ tầng (ngừng nhận, ghi trạng thái, đóng Worker, đóng log); Phase sau đăng ký thêm bước.
import { terminationSignals } from './system/platform.js';

export const EXIT = Object.freeze({ OK: 0, ERROR: 1, NOT_FULLY_SAFE: 3, FORCED: 130 });

function withTimeout(promise, ms, name) {
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error(`quá hạn ${ms}ms`), { timedOut: true, step: name })), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class ShutdownManager {
  /** @param {{logger:object, deadlineMs?:number, stepTimeoutMs?:number, exit?:(code:number)=>void, now?:()=>number}} o */
  constructor({ logger, deadlineMs = 10000, stepTimeoutMs = 4000, exit = (c) => process.exit(c), now = () => Date.now() }) {
    this.log = logger;
    this.deadlineMs = deadlineMs;
    this.stepTimeoutMs = stepTimeoutMs;
    this.exit = exit;
    this.now = now;
    this.steps = [];
    this.promise = null;
    this.state = 'idle'; // idle | running | done
    this.signalCount = 0;
    this.report = null;
  }

  /** Đăng ký bước tắt. `order` nhỏ chạy trước (ngừng nhận → xả → lưu → đóng). */
  register(name, fn, { order = 100, timeoutMs } = {}) {
    this.steps.push({ name, fn, order, timeoutMs, idx: this.steps.length });
    this.steps.sort((a, b) => a.order - b.order || a.idx - b.idx);
  }

  /** Chạy luồng tắt (idempotent: gọi nhiều lần trả về cùng kết quả). */
  run(reason, { exitCode = EXIT.OK, doExit = true } = {}) {
    if (!this.promise) this.promise = this.#run(reason, exitCode, doExit);
    return this.promise;
  }

  async #run(reason, exitCode, doExit) {
    this.state = 'running';
    const t0 = this.now();
    this.log.info('Bắt đầu tắt an toàn', { reason, steps: this.steps.map((s) => s.name), deadlineMs: this.deadlineMs });
    const results = [];
    for (const s of this.steps) {
      const remaining = this.deadlineMs - (this.now() - t0);
      if (remaining <= 0) {
        results.push({ name: s.name, ok: false, skipped: true });
        this.log.error('Bỏ qua bước tắt vì đã hết thời hạn tổng', { step: s.name });
        continue;
      }
      const limit = Math.min(s.timeoutMs ?? this.stepTimeoutMs, remaining);
      const ts = this.now();
      try {
        await withTimeout(Promise.resolve().then(() => s.fn({ reason, remainingMs: remaining })), limit, s.name);
        results.push({ name: s.name, ok: true, ms: this.now() - ts });
        this.log.info('Bước tắt xong', { step: s.name, ms: this.now() - ts });
      } catch (e) {
        results.push({ name: s.name, ok: false, ms: this.now() - ts, timedOut: Boolean(e.timedOut), error: e.message });
        this.log.error('Bước tắt thất bại', { step: s.name, timedOut: Boolean(e.timedOut), error: e });
      }
    }
    const safe = results.every((r) => r.ok);
    this.report = { reason, safe, totalMs: this.now() - t0, steps: results };
    this.state = 'done';
    if (safe) this.log.info('Đã lưu an toàn', { totalMs: this.report.totalMs });
    else this.log.error('Tắt xong NHƯNG chưa chắc đã lưu đủ dữ liệu', { failed: results.filter((r) => !r.ok).map((r) => r.name) });
    if (doExit) {
      const code = safe ? exitCode : Math.max(exitCode, EXIT.NOT_FULLY_SAFE);
      // cho log kịp ghi ra rồi mới thoát
      setImmediate(() => this.exit(code));
    }
    return this.report;
  }

  /** Bắt tín hiệu tắt của OS. Lần 1: tắt an toàn. Lần 2: báo đang lưu. Lần 3: buộc thoát (mã 130). */
  installSignalHandlers({ proc = process, signals = terminationSignals() } = {}) {
    const handler = (sig) => {
      this.signalCount++;
      if (this.signalCount === 1) {
        this.log.info('Nhận tín hiệu tắt, đang lưu an toàn…', { signal: sig });
        this.run(`signal:${sig}`);
      } else if (this.signalCount === 2) {
        this.log.warn('Đang lưu dữ liệu, vui lòng chờ… (nhấn thêm một lần nữa để buộc thoát, có thể mất dữ liệu)');
      } else {
        this.log.error('Buộc thoát theo yêu cầu — có thể mất dữ liệu chưa ghi');
        this.exit(EXIT.FORCED);
      }
    };
    for (const sig of signals) {
      try { proc.on(sig, () => handler(sig)); } catch { /* tín hiệu không hỗ trợ trên OS này */ }
    }
    return signals;
  }

  /** Lỗi không bắt được: ghi log rồi tắt an toàn với mã 1. */
  installCrashHandlers({ proc = process } = {}) {
    const crash = (kind) => (err) => {
      this.log.error(`Lỗi không bắt được (${kind})`, { error: err });
      if (this.state === 'idle') this.run(kind, { exitCode: EXIT.ERROR });
    };
    proc.on('uncaughtException', crash('uncaughtException'));
    proc.on('unhandledRejection', crash('unhandledRejection'));
  }
}
