// ZoneDirector — chọn KHU đang lên hình (ADR-0026). Thuần logic, không I/O, đồng hồ truyền vào → test tất định.
//  - Quà: cắt ngay tới khu của người tặng (nếu khu hiện tại đã lên hình ≥ minDwellMs), nếu chưa đủ thì xếp hàng.
//    Hàng đợi ưu tiên theo giá trị quà (kim cương), gộp cùng khu, có trần độ dài → không giật camera, không hàng vô hạn.
//  - Sau khi cắt vì quà: giữ khu ít nhất giftHoldMs trước khi được tự chuyển (quà mới vẫn cắt được sau minDwellMs).
//  - Tự chuyển: khi hết giữ, hàng rỗng và khu hiện tại không còn ai đang câu → sang khu đông nhất.

export class ZoneDirector {
  /**
   * @param {{zones:string[], minDwellMs?:number, giftHoldMs?:number, queueMax?:number}} o
   */
  constructor({ zones, minDwellMs = 4000, giftHoldMs = 12000, queueMax = 6 }) {
    if (!zones?.length) throw new Error('ZoneDirector cần ít nhất một khu');
    this.zones = [...zones];
    this.minDwellMs = minDwellMs;
    this.giftHoldMs = giftHoldMs;
    this.queueMax = queueMax;
    this.zone = this.zones[0];
    this.since = -Infinity; // lần cắt gần nhất (−∞: được cắt ngay từ đầu)
    this.holdUntil = 0;
    this.queue = []; // [{zone, prio, by, at}]
  }

  /**
   * Có quà từ người đang ở `zone`. Trả về {zone, reason:'gift', by} nếu cắt ngay, ngược lại null.
   * @param {string} zone
   * @param {{prio?:number, by?:string|null}} info  prio = giá trị quà (kim cương); by = khoá người tặng
   * @param {number} now
   */
  gift(zone, { prio = 0, by = null } = {}, now) {
    if (!this.zones.includes(zone)) return null;
    if (zone === this.zone) { this.holdUntil = Math.max(this.holdUntil, now + this.giftHoldMs); return null; }
    if (now - this.since >= this.minDwellMs) return this.#cut(zone, 'gift', by, now);
    const same = this.queue.find((q) => q.zone === zone);
    if (same) { if (prio > same.prio) { same.prio = prio; same.by = by; } return null; }
    this.queue.push({ zone, prio, by, at: now });
    this.queue.sort((a, b) => b.prio - a.prio || a.at - b.at);
    if (this.queue.length > this.queueMax) this.queue.length = this.queueMax; // bỏ quà giá trị thấp nhất
    return null;
  }

  /**
   * Gọi định kỳ (mỗi giây). `active` = số người đang câu theo khu {zoneId: n}. Trả về thay đổi hoặc null.
   */
  tick(now, active = {}) {
    if (this.queue.length && now - this.since >= this.minDwellMs) {
      const q = this.queue.shift();
      if (q.zone !== this.zone) return this.#cut(q.zone, 'gift', q.by, now);
    }
    if (!this.queue.length && now >= this.holdUntil && !(active[this.zone] > 0)) {
      let best = null;
      for (const z of this.zones) if ((active[z] || 0) > (active[best] || 0)) best = z;
      if (best && best !== this.zone && now - this.since >= this.minDwellMs) return this.#cut(best, 'auto', null, now);
    }
    return null;
  }

  /** Trạng thái để công bố/ghi log. */
  snapshot() { return { zone: this.zone, since: this.since, holdUntil: this.holdUntil, queued: this.queue.map((q) => q.zone) }; }

  #cut(zone, reason, by, now) {
    this.zone = zone;
    this.since = now;
    this.holdUntil = reason === 'gift' ? now + this.giftHoldMs : 0;
    this.queue = this.queue.filter((q) => q.zone !== zone);
    return { zone, reason, by };
  }
}
