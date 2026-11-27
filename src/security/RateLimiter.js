// Giới hạn tần suất cửa sổ trượt theo khoá (IP). Trong bộ nhớ; tự dọn khoá cũ.
export class RateLimiter {
  constructor({ max, windowMs = 60000, now = () => Date.now() }) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.hits = new Map();
    this.lastSweep = now();
  }

  /** Ghi nhận một lần gọi. Trả { allowed, remaining, retryAfterMs }. */
  hit(key) {
    const t = this.now();
    this.#sweep(t);
    const arr = (this.hits.get(key) || []).filter((x) => t - x < this.windowMs);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return { allowed: false, remaining: 0, retryAfterMs: this.windowMs - (t - arr[0]) };
    }
    arr.push(t);
    this.hits.set(key, arr);
    return { allowed: true, remaining: this.max - arr.length, retryAfterMs: 0 };
  }

  reset(key) { this.hits.delete(key); }

  #sweep(t) {
    if (t - this.lastSweep < this.windowMs) return;
    this.lastSweep = t;
    for (const [k, arr] of this.hits) {
      if (arr.length === 0 || t - arr[arr.length - 1] >= this.windowMs) this.hits.delete(k);
    }
  }
}
