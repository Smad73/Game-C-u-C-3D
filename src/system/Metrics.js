// Số đo vận hành: bộ đếm, giá trị tức thời, độ trễ event loop (cửa sổ 1 giây), bộ nhớ.
// Số đo về độ bền dữ liệu (R14) do PersistenceClient cung cấp, gộp ở /api/metrics.
import { monitorEventLoopDelay } from 'node:perf_hooks';

const toMs = (ns) => Math.round((ns / 1e6) * 100) / 100;
const toMb = (b) => Math.round((b / 1048576) * 10) / 10;

export class Metrics {
  constructor({ now = () => Date.now(), sampleEveryMs = 1000 } = {}) {
    this.now = now;
    this.startedAt = now();
    this.counters = new Map();
    this.gauges = new Map();
    this.hist = monitorEventLoopDelay({ resolution: 10 });
    this.hist.enable();
    this.window = { p50Ms: 0, p95Ms: 0, maxMs: 0, meanMs: 0, sampledAtMs: this.startedAt };
    this.timer = setInterval(() => this.sample(), sampleEveryMs);
    this.timer.unref();
  }

  inc(name, n = 1) { this.counters.set(name, (this.counters.get(name) || 0) + n); }
  set(name, value) { this.gauges.set(name, value); }

  /** Đọc rồi xoá cửa sổ độ trễ event loop (gọi mỗi giây). */
  sample() {
    const h = this.hist;
    if (h.count > 0) {
      this.window = {
        p50Ms: toMs(h.percentile(50)),
        p95Ms: toMs(h.percentile(95)),
        maxMs: toMs(h.max),
        meanMs: toMs(h.mean),
        sampledAtMs: this.now()
      };
    }
    h.reset();
    return this.window;
  }

  eventLoopWindow() { return this.window; }

  snapshot() {
    const m = process.memoryUsage();
    return {
      uptimeSec: Math.round((this.now() - this.startedAt) / 1000),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      process: { rssMb: toMb(m.rss), heapUsedMb: toMb(m.heapUsed), heapTotalMb: toMb(m.heapTotal), pid: process.pid },
      eventLoop: this.window
    };
  }

  close() {
    clearInterval(this.timer);
    this.hist.disable();
  }
}
