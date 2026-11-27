// EventDirector — hàng đợi sự kiện thế giới: Boss định kỳ, Boss/sự kiện do quà, sự kiện do Admin, thời tiết tự động.
// Quy tắc: Boss chiếm "kênh lớn" (tối đa maxConcurrentBoss), sự kiện nhỏ mỗi loại một cái, còn lại xếp hàng — không xung đột.
// Mọi chuyển trạng thái ghi bền qua op EVENT_UPSERT (chỉ tiến, không lùi); sự kiện từ quà đã có dòng QUEUED trong DB từ lúc quà APPLIED.
import { randomUUID } from 'node:crypto';
import { WORLD_EVENT_KINDS } from './catalog.js';
import { GAME_OPS } from '../data/gameOps.js';

const MINOR_EFFECT = {
  RARE_SURGE: { luck: 60 },
  TREASURE: { treasure: 0.25 },
  GOLDEN_HOUR: { scoreMult: 2 },
  RAIN: { biteSpeed: 1.5 },
  STORM: { weightBias: 0.5, tension: 1.25 },
  NIGHT: { luck: 40 }
};
const AUTO_POOL = ['RAIN', 'TREASURE', 'GOLDEN_HOUR', 'STORM', 'NIGHT', 'RARE_SURGE'];

export class EventDirector {
  /**
   * @param {{world:object, config:()=>object, logger:object, now?:()=>number, rand?:()=>number}} o
   *   world: { queueOp(op), activeCount(), emit(type, data), sessionId(), rewardBoss(event, contribs, killed) }
   */
  constructor({ world, config, logger, now = () => Date.now(), rand = Math.random }) {
    this.world = world;
    this.cfg = config;
    this.log = logger;
    this.now = now;
    this.rand = rand;
    this.queue = [];      // sự kiện chờ (QUEUED)
    this.active = new Map(); // event_id → ev (WARNING | ACTIVE)
    this.nextBossAt = null;
    this.nextAutoAt = null;
    this.history = [];
  }

  // ───────── khôi phục ─────────
  /** Nạp sự kiện còn mở từ DB. ACTIVE/WARNING của lần chạy trước được tiếp tục (thời gian còn lại đặt lại ngắn), QUEUED giữ hàng. */
  restore(rows) {
    const t = this.now();
    for (const r of rows) {
      let params = {};
      try { params = JSON.parse(r.params || '{}'); } catch { params = {}; }
      const ev = this.#make({ id: r.event_id, kind: r.kind, source: r.source, summoner: r.summoner_key, level: r.level, params, persisted: true });
      if (r.status === 'QUEUED') { this.queue.push(ev); continue; }
      ev.hpMax = r.hp_max; ev.hp = r.hp_left ?? r.hp_max;
      ev.status = 'ACTIVE';
      ev.startedAt = r.started_at_utc ?? t;
      ev.endsAt = t + Math.min(60000, this.#durationMs(ev));
      this.active.set(ev.id, ev);
      this.log?.info?.('Tiếp tục sự kiện từ lần chạy trước', { id: ev.id, kind: ev.kind });
    }
    this.#scheduleBoss(t);
    this.#scheduleAuto(t);
  }

  // ───────── tạo sự kiện ─────────
  #make({ id, kind, source, summoner = null, level = 1, params = {}, persisted = false }) {
    return { id: id || `ev-${randomUUID()}`, kind, source, summoner, level: Math.max(1, Math.min(10, level | 0 || 1)), params, persisted, status: 'QUEUED',
      queuedAt: this.now(), hp: null, hpMax: null, damage: new Map(), startedAt: null, endsAt: null, warnUntil: null };
  }
  /** Sự kiện do Admin hoặc lịch — ghi QUEUED rồi xếp hàng. */
  enqueue({ kind, source = 'ADMIN', level = 1, summoner = null, params = {} }) {
    if (!WORLD_EVENT_KINDS[kind] && kind !== 'BLESSING') throw Object.assign(new Error(`Loại sự kiện không hợp lệ: ${kind}`), { code: 'BAD_EVENT' });
    const ev = this.#make({ kind, source, level, summoner, params });
    this.world.queueOp({ t: GAME_OPS.EVENT_UPSERT, event_id: ev.id, kind, source, summoner_key: summoner, level: ev.level, status: 'QUEUED', queued_at_utc: ev.queuedAt, params, live_session_id: this.world.sessionId() });
    ev.persisted = true;
    this.queue.push(ev);
    this.world.emit('event_queued', this.#pub(ev));
    return ev;
  }
  /**
   * Sự kiện đã ghi bền trong DB cùng transaction với quà (công bố SAU ack).
   * Chống dồn hàng: sự kiện nhỏ cùng loại đang chạy/đang chờ → GỘP (gia hạn, có trần); Boss do quà khi đã có Boss quà đang chờ →
   * gộp thành một Boss (cấp = max + 1, tối đa 10). Dòng sự kiện bị gộp được đánh dấu DONE/MERGED (không mất dấu, không chạy trùng).
   */
  enqueueCommitted({ eventId, kind, level, params, summoner }) {
    if (this.active.has(eventId) || this.queue.some((e) => e.id === eventId)) return null;
    const merged = (target, note) => {
      this.world.queueOp({ t: GAME_OPS.EVENT_UPSERT, event_id: eventId, kind, source: 'GIFT', status: 'DONE', ended_at_utc: this.now(), result: `MERGED:${target.id}`.slice(0, 40) });
      this.world.emit('event_merged', { into: this.#pub(target), note, summoner });
      return target;
    };
    if (kind === 'BOSS') {
      const q = this.queue.find((e) => e.kind === 'BOSS' && e.source === 'GIFT');
      if (q) { q.level = Math.min(10, Math.max(q.level, level || 1) + 1); return merged(q, 'boss_level_up'); }
    } else {
      const base = this.#durationMs({ kind, params });
      const act = [...this.active.values()].find((e) => e.kind === kind && e.status === 'ACTIVE');
      if (act) {
        const cap = act.startedAt + 3 * this.#durationMs(act);
        act.endsAt = Math.min(cap, act.endsAt + base * 0.5);
        if (kind === 'BLESSING') act.params = { ...act.params, pct: Math.min(200, Math.max(act.params?.pct | 0, params?.pct | 0)) };
        return merged(act, 'extended');
      }
      const q = this.queue.find((e) => e.kind === kind);
      if (q) return merged(q, 'queued_merge');
    }
    const ev = this.#make({ id: eventId, kind, source: 'GIFT', level, params, summoner, persisted: true });
    this.queue.push(ev);
    this.world.emit('event_queued', this.#pub(ev));
    return ev;
  }
  cancel(id) {
    const i = this.queue.findIndex((e) => e.id === id);
    const ev = i >= 0 ? this.queue.splice(i, 1)[0] : this.active.get(id);
    if (!ev) return false;
    this.active.delete(id);
    this.#finish(ev, 'CANCELLED', 'admin');
    return true;
  }

  // ───────── vòng lặp (gọi mỗi tick của WorldCore) ─────────
  tick() {
    const t = this.now();
    const c = this.cfg();
    if (this.nextBossAt && t >= this.nextBossAt) {
      this.nextBossAt = null;
      const active = this.world.activeCount();
      if (active > 0 && !this.queue.some((e) => e.kind === 'BOSS' && e.source === 'SCHEDULE')) {
        this.enqueue({ kind: 'BOSS', source: 'SCHEDULE', level: Math.min(10, 1 + Math.floor(Math.log2(1 + active / 5))) });
      } else this.#scheduleBoss(t);
    }
    if (this.nextAutoAt && t >= this.nextAutoAt) {
      this.nextAutoAt = null;
      if (this.world.activeCount() > 0) {
        const kind = AUTO_POOL[Math.floor(this.rand() * AUTO_POOL.length)];
        if (![...this.active.values()].some((e) => e.kind === kind) && !this.queue.some((e) => e.kind === kind)) this.enqueue({ kind, source: 'AUTO' });
      }
      this.#scheduleAuto(t);
    }
    // bắt đầu sự kiện trong hàng nếu kênh trống (FIFO theo loại)
    const bosses = () => [...this.active.values()].filter((e) => e.kind === 'BOSS').length;
    for (let i = 0; i < this.queue.length; i++) {
      const ev = this.queue[i];
      const busy = ev.kind === 'BOSS' ? bosses() >= c.maxConcurrentBoss : [...this.active.values()].some((e) => e.kind === ev.kind);
      if (busy) continue;
      this.queue.splice(i--, 1);
      this.#begin(ev, t, c);
    }
    for (const ev of this.active.values()) {
      if (ev.status === 'WARNING' && t >= ev.warnUntil) this.#activate(ev, t, c);
      else if (ev.status === 'ACTIVE' && t >= ev.endsAt) this.#end(ev, ev.kind === 'BOSS' ? 'FAILED' : 'DONE', ev.kind === 'BOSS' ? 'escaped' : 'ok');
    }
  }

  #durationMs(ev) {
    const c = this.cfg();
    if (!ev) return 90000;
    if (ev.kind === 'BOSS') return c.bossDurationSec * 1000;
    if (ev.kind === 'BLESSING') return Math.max(1, ev.params?.minutes | 0 || 1) * 60000;
    return (WORLD_EVENT_KINDS[ev.kind]?.durationSec ?? 90) * 1000;
  }

  #begin(ev, t, c) {
    this.active.set(ev.id, ev);
    if (ev.kind === 'BOSS') {
      ev.status = 'WARNING';
      ev.warnUntil = t + (ev.source === 'GIFT' ? Math.min(c.bossWarnSec, 15) : c.bossWarnSec) * 1000;
      this.world.queueOp({ t: GAME_OPS.EVENT_UPSERT, event_id: ev.id, kind: ev.kind, source: ev.source, status: 'WARNING', warned_at_utc: t, queued_at_utc: ev.queuedAt, level: ev.level });
      this.world.emit('boss_warning', { ...this.#pub(ev), startsAtUtc: ev.warnUntil });
    } else this.#activate(ev, t, c);
  }

  #activate(ev, t, c) {
    ev.status = 'ACTIVE';
    ev.startedAt = t;
    ev.endsAt = t + this.#durationMs(ev);
    const op = { t: GAME_OPS.EVENT_UPSERT, event_id: ev.id, kind: ev.kind, source: ev.source, status: 'ACTIVE', started_at_utc: t, queued_at_utc: ev.queuedAt, level: ev.level, live_session_id: this.world.sessionId() };
    if (ev.kind === 'BOSS') {
      const active = Math.max(1, this.world.activeCount());
      ev.hpMax = Math.round(c.bossHpPerPlayer * Math.pow(active, 0.85) * (1 + 0.35 * (ev.level - 1)) + 300);
      ev.hp = ev.hpMax;
      Object.assign(op, { hp_max: ev.hpMax, hp_left: ev.hp, active_players: active });
    }
    this.world.queueOp(op);
    this.world.emit(ev.kind === 'BOSS' ? 'boss_start' : 'event_start', this.#pub(ev));
  }

  /** Người chơi gây sát thương lên Boss (từ cú câu thành công khi Boss đang hoạt động). */
  damageBoss(playerKey, amount) {
    const ev = this.boss();
    if (!ev || ev.status !== 'ACTIVE' || ev.hp <= 0) return null;
    const d = Math.max(1, Math.round(amount));
    ev.hp = Math.max(0, ev.hp - d);
    ev.damage.set(playerKey, (ev.damage.get(playerKey) || 0) + d);
    ev.pending ??= new Map();
    ev.pending.set(playerKey, (ev.pending.get(playerKey) || 0) + d);
    ev.dirty = true;
    if (ev.hp <= 0) this.#end(ev, 'DONE', 'killed');
    return { eventId: ev.id, damage: d, hp: ev.hp, hpMax: ev.hpMax };
  }

  /** Ghi gộp sát thương định kỳ (WorldCore gọi khi flush). */
  flushDamage() {
    for (const ev of this.active.values()) if (ev.dirty && ev.kind === 'BOSS') this.#flushEv(ev, true);
  }
  #flushEv(ev, withHp) {
    ev.dirty = false;
    this.dmgSeq = (this.dmgSeq || 0) + 1;
    for (const [k, v] of ev.pending ?? []) this.world.queueOp({ t: GAME_OPS.EVENT_DAMAGE, event_id: ev.id, player_key: k, damage: v, op_key: `dmg:${ev.id}:${k}:${this.dmgSeq}` });
    ev.pending = new Map();
    if (withHp) this.world.queueOp({ t: GAME_OPS.EVENT_UPSERT, event_id: ev.id, kind: ev.kind, source: ev.source, status: 'ACTIVE', hp_left: ev.hp });
  }

  #end(ev, status, result) {
    this.active.delete(ev.id);
    this.#finish(ev, status, result);
  }

  #finish(ev, status, result) {
    const t = this.now();
    if (ev.kind === 'BOSS') this.#flushEv(ev, false);
    this.world.queueOp({ t: GAME_OPS.EVENT_UPSERT, event_id: ev.id, kind: ev.kind, source: ev.source, status, ended_at_utc: t, result, hp_left: ev.hp ?? undefined, queued_at_utc: ev.queuedAt });
    if (ev.kind === 'BOSS') {
      if (status !== 'CANCELLED') this.world.rewardBoss(ev, [...ev.damage.entries()].sort((a, b) => b[1] - a[1]), result === 'killed');
      if (ev.source === 'SCHEDULE' || !this.nextBossAt) this.#scheduleBoss(t);
    }
    this.history.unshift({ id: ev.id, kind: ev.kind, status, result, at: t });
    this.history.length = Math.min(this.history.length, 30);
    this.world.emit(ev.kind === 'BOSS' ? 'boss_end' : 'event_end', { ...this.#pub(ev), status, result });
  }

  #scheduleBoss(t) { const m = this.cfg().bossIntervalMin; this.nextBossAt = m > 0 ? t + m * 60000 : null; }
  #scheduleAuto(t) { const m = this.cfg().autoEventEveryMin; this.nextAutoAt = m > 0 ? t + m * 60000 * (0.75 + this.rand() * 0.5) : null; }
  reschedule() { const t = this.now(); this.#scheduleBoss(t); this.#scheduleAuto(t); }

  boss() { for (const e of this.active.values()) if (e.kind === 'BOSS') return e; return null; }

  /** Hệ số gameplay tổng hợp từ các sự kiện đang ACTIVE. */
  modifiers() {
    const m = { luck: 0, treasure: 0, scoreMult: 1, biteSpeed: 1, weightBias: 0, tension: 1, weather: 'clear', bossActive: false };
    for (const e of this.active.values()) {
      if (e.status !== 'ACTIVE') continue;
      if (e.kind === 'BOSS') { m.bossActive = true; continue; }
      if (e.kind === 'BLESSING') { m.luck += e.params?.pct | 0; continue; }
      const x = MINOR_EFFECT[e.kind] || {};
      m.luck += x.luck || 0;
      m.treasure = Math.max(m.treasure, x.treasure || 0);
      m.scoreMult *= x.scoreMult || 1;
      m.biteSpeed *= x.biteSpeed || 1;
      m.weightBias += x.weightBias || 0;
      m.tension *= x.tension || 1;
      if (WORLD_EVENT_KINDS[e.kind]?.weather) m.weather = WORLD_EVENT_KINDS[e.kind].weather;
    }
    return m;
  }

  #pub(ev) {
    return { id: ev.id, kind: ev.kind, name: ev.kind === 'BLESSING' ? 'Phước lành của hồ' : WORLD_EVENT_KINDS[ev.kind]?.name, source: ev.source, level: ev.level,
      status: ev.status, hp: ev.hp, hpMax: ev.hpMax, endsAtUtc: ev.endsAt, warnUntilUtc: ev.warnUntil, summoner: ev.summoner, params: ev.params };
  }
  snapshot() {
    return { active: [...this.active.values()].map((e) => this.#pub(e)), queued: this.queue.map((e) => this.#pub(e)), nextBossAtUtc: this.nextBossAt, nextAutoAtUtc: this.nextAutoAt, history: this.history.slice(0, 10) };
  }
}
