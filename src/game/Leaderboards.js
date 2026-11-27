// Leaderboards — 5 phạm vi: TOP LIVE (theo buổi LIVE) · TOP 60 phút (cửa sổ trượt) · TOP ngày · TOP tuần (giờ VN) · TOP tổng.
// Chỉ đọc điểm ĐÃ COMMIT từ DB qua Worker (ADR-0010). Xếp: điểm ↓, tổng kg ↓, thời điểm đạt ↑.
import { periodKeys, vnDayKey, vnWeekKey } from './progression.js';

export const SCOPES = Object.freeze(['live', 'hour', 'day', 'week', 'all']);
export const SCOPE_NAMES = Object.freeze({ live: 'TOP LIVE', hour: 'TOP 60 phút', day: 'TOP ngày', week: 'TOP tuần', all: 'TOP tổng' });

export class Leaderboards {
  constructor({ persistence, sessionId = () => null, logger, now = () => Date.now(), refreshMs = 3000, topN = 100 }) {
    this.p = persistence;
    this.sessionId = sessionId;
    this.log = logger;
    this.now = now;
    this.refreshMs = refreshMs;
    this.topN = topN;
    this.cache = {};
    this.listeners = [];
  }

  period(scope, at = this.now()) {
    if (scope === 'hour') return 'hour';
    return periodKeys(at, this.sessionId())[scope];
  }
  labels(at = this.now()) { return { day: vnDayKey(at), week: vnWeekKey(at), live: this.sessionId() }; }

  async query(scope, { period, offset = 0, limit = 10 } = {}) {
    if (!SCOPES.includes(scope)) throw Object.assign(new Error('scope không hợp lệ'), { code: 'BAD_SCOPE' });
    if (scope === 'hour') {
      const [r] = await this.p.read('leaderboard_hour', { sinceUtc: this.now() - 3600000, offset, limit });
      return { scope, period: 'hour', ...r, offset };
    }
    const pk = period || this.period(scope);
    const [r] = await this.p.read('leaderboard', { scope, period: pk, offset, limit });
    return { scope, period: pk, ...r, offset };
  }

  async rank(scope, playerKey) {
    const [r] = await this.p.read('player_rank', { scope, player_key: playerKey, period: this.period(scope), sinceUtc: this.now() - 3600000 });
    return r;
  }

  start() {
    const run = () => this.refresh().catch((e) => this.log?.warn?.('Không làm mới được BXH', { error: e?.message }));
    run();
    this.timer = setInterval(run, this.refreshMs);
    this.timer.unref?.();
  }
  stop() { clearInterval(this.timer); }
  onUpdate(fn) { this.listeners.push(fn); }

  async refresh() {
    const out = {};
    for (const s of SCOPES) {
      const r = await this.query(s, { limit: this.topN });
      out[s] = { period: r.period, total: r.total, rows: r.rows.map((x, i) => ({ r: i + 1, k: x.player_key, n: x.nickname || x.unique_id || x.player_key, l: x.level, s: x.score, w: x.weight_g })) };
    }
    this.cache = out;
    for (const fn of this.listeners) fn(out);
    return out;
  }
  snapshot() { return this.cache; }
}
