// WorldCore — thế giới câu cá có thẩm quyền trên server (ARCHITECTURE §1.1–1.2). Client chỉ vẽ.
//  - Mỗi cần thủ: CAST → WAIT → BITE → FIGHT → RESULT → CAST… (tự động khi ACTIVE). AFK sau N phút không có tương tác hợp lệ.
//  - Không giới hạn số cần thủ: mọi người đều được mô phỏng; stage chỉ vẽ chi tiết "ngân sách hiển thị" (Spotlight).
//  - Tiến trình do mô phỏng sinh ra (cú câu, XP) theo mô hình RAM-trước + write-behind (C2, ADR-0018 "Phạm vi"): op có khoá
//    idempotency, gom mỗi 500 ms vào batch `progress`. BXH chỉ đọc điểm ĐÃ COMMIT (Leaderboards đọc DB).
//  - Hiệu ứng QUÀ chỉ vào RAM SAU khi Worker ack (onCommittedGift) — không bao giờ trước.
import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { ACHIEVEMENTS, COMMANDS, DIFFICULTY, EQUIP_MAX_LEVEL, EQUIP_SLOTS, FISHDEX_TOTAL, RARITY_BY_TIER, SPECIES_BY_ID, ZONES, ZONE_BY_ID } from './catalog.js';
import { catchValue, equipStats, foldText, levelForXp, rollSpecies, rollTier, rollWeight, upgradeCost, vnDayKey } from './progression.js';
import { EventDirector } from './EventDirector.js';
import { ZoneDirector } from './ZoneDirector.js';
import { GAME_OPS } from '../data/gameOps.js';

const PH = Object.freeze({ IDLE: 0, CAST: 1, WAIT: 2, BITE: 3, FIGHT: 4, RESULT: 5 });
const PH_NAME = ['idle', 'cast', 'wait', 'bite', 'fight', 'result'];
const hash32 = (s) => createHash('sha1').update(String(s)).digest().readUInt32BE(0);
const CMD = Object.fromEntries(Object.entries(COMMANDS).map(([k, v]) => [k, v.map(foldText)]));

function matchCommand(text) {
  const f = foldText(text);
  if (!f) return null;
  for (const k of ['upgrade', 'zone']) for (const w of CMD[k]) if (f === w || f.startsWith(`${w} `)) return { cmd: k, arg: f.slice(w.length).trim() };
  for (const [k, words] of Object.entries(CMD)) if (k !== 'upgrade' && k !== 'zone' && words.some((w) => f === w || f.startsWith(`${w} `) || f.endsWith(` ${w}`))) return { cmd: k, arg: '' };
  return null;
}

/** Tìm khu theo chữ người chơi gõ (đã bỏ dấu): số thứ tự hoặc tên/từ khoá. null nếu không khớp. */
function findZone(arg) {
  const f = foldText(arg || '');
  if (!f) return null;
  return ZONES.find((z) => z.words.some((w) => f === w || f.startsWith(`${w} `))) ?? null;
}

export class WorldCore extends EventEmitter {
  /**
   * @param {{persistence:object, realm:'live'|'demo', logger:object, gameConfig:object, sessionId?:()=>string|null,
   *          rand?:()=>number, now?:()=>number, tickMs?:number, flushMs?:number}} o
   */
  constructor({ persistence, realm, logger, gameConfig, sessionId = () => null, rand = Math.random, now = () => Date.now(), tickMs = 100, flushMs = 500 }) {
    super();
    this.setMaxListeners(50);
    this.p = persistence;
    this.realm = realm;
    this.log = logger;
    this.gc = gameConfig;
    this.sessionId = sessionId;
    this.rand = rand;
    this.now = now;
    this.tickMs = tickMs;
    this.flushMs = flushMs;
    this.players = new Map();
    this.ops = [];
    this.state = 'STOPPED'; // STOPPED | RESTORING | RUNNING | PAUSED
    // Ô hiển thị theo khu (ADR-0026): mỗi khu có ngân sách detailedSlots riêng; stage chỉ vẽ khu đang lên hình.
    this.zoneSlots = Object.fromEntries(ZONES.map((z) => [z.id, []]));
    this.director = new ZoneDirector({ zones: ZONES.map((z) => z.id) });
    this.c = { catches: 0, escapes: 0, bossHits: 0, joins: 0, commands: 0, giftsApplied: 0, flushes: 0, flushErrors: 0, opsQueued: 0, loads: 0, evicted: 0, tickMsMax: 0 };
    this.tickStats = [];
    this.catchTimes = [];
    this.events = new EventDirector({ world: this.#worldApi(), config: () => this.gc.config, logger: logger?.child?.('events') ?? logger, now, rand });
  }

  #worldApi() {
    return {
      queueOp: (op) => this.queueOp(op),
      activeCount: () => this.counts().active,
      emit: (type, data) => this.#feed(type, data),
      sessionId: () => this.sessionId(),
      rewardBoss: (ev, contribs, killed) => this.#rewardBoss(ev, contribs, killed)
    };
  }

  // ───────── vòng đời ─────────
  async start({ timers = true } = {}) {
    this.state = 'RESTORING';
    this.events.restore(await this.p.read('events_open'));
    this.state = 'RUNNING';
    if (!timers) return; // test: gọi tick()/slowTick()/flush() thủ công với đồng hồ giả
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.timer.unref?.();
    this.flushTimer = setInterval(() => this.flush(), this.flushMs);
    this.flushTimer.unref?.();
    this.slowTimer = setInterval(() => this.#slowTick(), 1000);
    this.slowTimer.unref?.();
    this.log?.info?.('Thế giới câu cá đang chạy', { realm: this.realm });
  }
  pause() { if (this.state === 'RUNNING') { this.state = 'PAUSED'; this.#feed('world', { state: 'PAUSED' }); } }
  resume() { if (this.state === 'PAUSED') { this.state = 'RUNNING'; this.#feed('world', { state: 'RUNNING' }); } }
  async stop() {
    clearInterval(this.timer); clearInterval(this.flushTimer); clearInterval(this.slowTimer);
    this.state = 'STOPPED';
    await this.flush({ wait: true });
  }

  // ───────── ghi write-behind ─────────
  queueOp(op) { this.ops.push(op); this.c.opsQueued++; }
  async flush({ wait = false } = {}) {
    this.events.flushDamage();
    if (!this.ops.length) return;
    const ops = this.ops.splice(0, 4000);
    this.c.flushes++;
    const p = this.p.commit({ cls: 'progress', kind: 'gameProgress', ops }).catch((e) => {
      this.c.flushErrors++;
      this.log?.error?.('Không ghi được tiến trình game (sẽ không mất dữ liệu đã ghi trước đó)', { code: e.code, message: e.message, ops: ops.length });
    });
    if (wait) { await p; if (this.ops.length) await this.flush({ wait }); }
    return p;
  }
  /** Ghi ngay và đợi ack (cho thao tác cần kết quả: nâng cấp, điểm danh). */
  async commitNow(ops) {
    await this.flush({ wait: true });
    return this.p.commit({ cls: 'progress', kind: 'gameAction', ops });
  }

  // ───────── người chơi ─────────
  #newPlayer(key, user) {
    return {
      key, name: user?.nickname || user?.uniqueId || key.slice(key.indexOf(':') + 1), uid: user?.uniqueId ?? null, userId: user?.userId ?? null,
      level: 1, xp: 0, coins: 0, score: 0, weightG: 0, catches: 0, bestTier: 0, bossKills: 0, dailyStreak: 0, lastDaily: null,
      equip: { rod: 1, line: 1, bobber: 1, bait: 1 }, dex: new Map(), ach: new Set(), buffs: [],
      appearance: hash32(key) % 100000, state: 'LOADING', phase: PH.IDLE, phaseAt: 0, until: 0, f: null,
      lastValidAt: this.now(), joinedAt: this.now(), zone: null, interest: 0, assistUntil: 0, likeAcc: 0, waiters: [], reload: false, loadedAt: 0
    };
  }

  #fromProfile(P, prof) {
    const pl = prof.player;
    Object.assign(P, {
      name: pl.nickname || P.name, uid: pl.unique_id ?? P.uid, level: pl.level, xp: pl.xp, coins: pl.coins, score: pl.total_score, weightG: pl.total_weight_g,
      catches: pl.catches_total, bestTier: pl.best_tier, bossKills: pl.boss_kills, dailyStreak: pl.daily_streak, lastDaily: pl.last_daily, appearance: pl.appearance || P.appearance
    });
    for (const e of prof.equipment) P.equip[e.slot] = e.level;
    P.dex = new Map(prof.fishdex.map((d) => [d.species_id, { count: d.count, best: d.best_weight_g }]));
    P.ach = new Set(prof.achievements.map((a) => a.achievement_id));
    P.buffs = prof.buffs.map((b) => ({ kind: b.kind, value: b.value, uses: b.uses, exp: b.expires_at_utc }));
  }

  /** Nạp hoặc tạo hồ sơ (COLD → nóng). Sự kiện của người đó chờ đến khi nạp xong (ARCHITECTURE §1.2). */
  ensurePlayer(key, user) {
    let P = this.players.get(key);
    if (P) {
      if (user?.nickname && user.nickname !== P.name) P.name = user.nickname;
      return P.state === 'LOADING' ? new Promise((r) => P.waiters.push(r)) : Promise.resolve(P);
    }
    P = this.#newPlayer(key, user);
    this.players.set(key, P);
    this.c.loads++;
    const load = async () => {
      for (let i = 0; i < 2; i++) {
        P.reload = false;
        const prof = (await this.p.read('player_profile', { player_key: key, now: this.now() }))[0];
        if (prof) this.#fromProfile(P, prof);
        else if (i === 0) this.queueOp({ t: GAME_OPS.PLAYER_SEEN, player_key: key, nickname: user?.nickname ?? null, unique_id: user?.uniqueId ?? null, appearance: P.appearance });
        if (!P.reload) break; // quà đã commit trong lúc đang nạp → đọc lại để lấy giá trị DB mới nhất (không cộng RAM hai lần)
      }
    };
    return load().catch((e) => this.log?.warn?.('Không nạp được hồ sơ — dùng hồ sơ mới trong RAM', { key, error: e?.message })).then(() => {
      P.state = 'AFK';
      P.loadedAt = this.now();
      const w = P.waiters.splice(0);
      for (const r of w) r(P);
      return P;
    });
  }

  /** Tương tác hợp lệ (lệnh comment / quà) → đánh thức, bắt đầu câu. Like KHÔNG gọi hàm này. */
  #wake(P) {
    P.lastValidAt = this.now();
    if (P.state !== 'ACTIVE') {
      const wasNew = P.catches === 0;
      P.state = 'ACTIVE';
      P.phase = PH.IDLE; P.until = 0;
      if (!P.zone) P.zone = this.#quietZone();
      P.interest = Math.max(P.interest, 40);
      this.c.joins++;
      this.#feed('join', { player: this.#pubPlayer(P), returning: !wasNew });
    }
  }

  // ───────── sự kiện từ TikTok/Mock (IngestPipeline.onEvent) ─────────
  onEvents = (batch) => {
    for (const ev of batch) {
      try { this.#onEvent(ev); } catch (e) { this.log?.warn?.('Xử lý sự kiện lỗi', { type: ev?.event_type, error: e?.message }); }
    }
  };

  #onEvent(ev) {
    if (this.state !== 'RUNNING' && this.state !== 'PAUSED') return;
    const key = ev.player_key;
    switch (ev.event_type) {
      case 'comment': {
        const m = matchCommand(ev.payload.text);
        if (!m) { const P = this.players.get(key); if (P && P.state === 'ACTIVE') this.#feed('chat', { name: P.name, text: ev.payload.text.slice(0, 60), level: P.level }); return; }
        this.c.commands++;
        this.ensurePlayer(key, ev.user).then((P) => this.#command(P, m)).catch(() => {});
        return;
      }
      case 'like': {
        const P = this.players.get(key);
        if (!P || P.state === 'LOADING') return; // like không tạo/đánh thức người chơi (chống spam)
        P.likeAcc += ev.payload.count;
        const it = this.gc.rules.interactions.like;
        if (P.likeAcc >= it.everyLikes && it.luckPct > 0) {
          P.likeAcc = 0;
          P.buffs.push({ kind: 'luck', value: it.luckPct, uses: null, exp: this.now() + it.minutes * 60000, ram: true });
        }
        return;
      }
      case 'follow': case 'share': {
        const it = this.gc.rules.interactions[ev.event_type];
        const opKey = ev.event_type === 'follow' ? `follow:${key}:${this.sessionId() ?? 'none'}` : `share:${key}:${Math.floor(this.now() / 600000)}`;
        this.ensurePlayer(key, ev.user).then((P) => {
          this.commitNow([{ t: GAME_OPS.REWARD, player_key: key, nickname: P.name, op_key: opKey, xp: it.xp ?? 0, coins: it.coins ?? 0 }]).then((r) => {
            const res = r.results?.find((x) => x.t === GAME_OPS.REWARD);
            if (res?.ok) { this.#addXpCoins(P, it.xp ?? 0, it.coins ?? 0); this.#feed(ev.event_type, { player: this.#pubPlayer(P), coins: it.coins ?? 0 }); }
          }).catch(() => {});
        }).catch(() => {});
        return;
      }
      case 'join': {
        const P = this.players.get(key);
        if (P && P.state !== 'LOADING' && this.gc.rules.interactions.join.greet && P.level >= 3) this.#feed('welcome', { player: this.#pubPlayer(P) });
        return;
      }
      case 'stream_end': this.#feed('live', { state: 'ENDED' }); return;
      default: return;
    }
  }

  async #command(P, { cmd, arg }) {
    switch (cmd) {
      case 'join': this.#wake(P); break;
      case 'reel':
        this.#wake(P);
        if (P.phase === PH.FIGHT) { P.assistUntil = this.now() + 1500; P.interest = Math.max(P.interest, 30); }
        break;
      case 'boss': this.#wake(P); break;
      case 'zone': {
        this.#wake(P);
        const idx = ZONES.findIndex((z) => z.id === P.zone);
        const Z = arg ? findZone(arg) : ZONES[(idx + 1) % ZONES.length];
        if (!Z) { this.#feed('notice', { player: this.#pubPlayer(P), text: `gõ: khu 1-${ZONES.length} hoặc khu ${ZONES.map((z) => z.words[2]).join('/')}` }); break; }
        if (Z.id !== P.zone) { P.zone = Z.id; P.interest = Math.max(P.interest, 40); this.#feed('zone_move', { player: this.#pubPlayer(P), zone: Z.id, name: Z.name }); }
        break;
      }
      case 'bag': this.#wake(P); this.#feed('card', { kind: 'bag', player: this.#pubPlayer(P), card: this.profileCard(P) }); break;
      case 'rank': {
        this.#wake(P);
        this.emit('rank-request', P); // Leaderboards trả lời bằng sự kiện 'card'
        break;
      }
      case 'daily': {
        this.#wake(P);
        try {
          const r = await this.commitNow([{ t: GAME_OPS.DAILY_CLAIM, player_key: P.key, nickname: P.name, at_utc: this.now() }]);
          const res = r.results?.find((x) => x.t === GAME_OPS.DAILY_CLAIM);
          if (res?.ok) {
            P.dailyStreak = res.streak; P.lastDaily = res.day;
            this.#addXpCoins(P, res.xp, res.coins);
            this.#feed('daily', { player: this.#pubPlayer(P), streak: res.streak, coins: res.coins, xp: res.xp });
            this.#checkAch(P);
          } else this.#feed('notice', { player: this.#pubPlayer(P), text: 'đã điểm danh hôm nay rồi' });
        } catch (e) { this.log?.warn?.('Điểm danh lỗi', { error: e?.message }); }
        break;
      }
      case 'upgrade': {
        this.#wake(P);
        const slot = EQUIP_SLOTS.find((s) => s.cmd.some((c) => arg.startsWith(foldText(c))));
        if (!slot) { this.#feed('notice', { player: this.#pubPlayer(P), text: 'gõ: nâng cần / nâng dây / nâng phao / nâng mồi' }); break; }
        await this.upgrade(P, slot.id);
        break;
      }
      default: break;
    }
  }

  async upgrade(P, slotId) {
    const to = (P.equip[slotId] || 1) + 1;
    if (to > EQUIP_MAX_LEVEL) { this.#feed('notice', { player: this.#pubPlayer(P), text: 'trang bị đã tối đa' }); return { ok: false, reason: 'MAX' }; }
    const cost = upgradeCost(slotId, to);
    if (P.coins < cost) { this.#feed('notice', { player: this.#pubPlayer(P), text: `cần ${cost} xu để nâng` }); return { ok: false, reason: 'NOT_ENOUGH_COINS', cost }; }
    const r = await this.commitNow([{ t: GAME_OPS.EQUIP_UPGRADE, player_key: P.key, nickname: P.name, slot: slotId, to_level: to }]);
    const res = r.results?.find((x) => x.t === GAME_OPS.EQUIP_UPGRADE);
    if (res?.ok && res.reason !== 'ALREADY') {
      P.coins -= res.cost;
      P.equip[slotId] = to;
      this.#feed('upgrade', { player: this.#pubPlayer(P), slot: slotId, level: to, cost: res.cost });
    } else if (res?.ok) P.equip[slotId] = Math.max(P.equip[slotId], to);
    else this.#feed('notice', { player: this.#pubPlayer(P), text: res?.reason === 'NOT_ENOUGH_COINS' ? `cần ${cost} xu để nâng` : 'chưa nâng được, thử lại' });
    return res ?? { ok: false };
  }

  // ───────── quà ĐÃ COMMIT (GiftJournal.onCommittedGift) ─────────
  onCommittedGift = (msg) => {
    if (!msg.player_key) return;
    this.c.giftsApplied++;
    const show = this.gc.ruleFor(msg.gift_id)?.show !== false;
    const existing = this.players.get(msg.player_key);
    const loading = existing?.state === 'LOADING';
    if (loading) existing.reload = true; // DB đã có hiệu ứng; hồ sơ đang nạp sẽ đọc lại — KHÔNG cộng delta vào RAM
    this.ensurePlayer(msg.player_key, null).then((P) => {
      if (!loading && existing) this.#applyGiftEffects(P, msg.effects, true);
      else this.#applyGiftEffects(P, msg.effects, false); // hồ sơ vừa nạp từ DB đã gồm hiệu ứng → chỉ áp phần RAM-only (cast, sự kiện)
      this.#wake(P);
      P.interest = Math.max(P.interest, 100);
      const cut = this.director.gift(P.zone, { prio: msg.coins ?? 0, by: P.key }, this.now());
      if (cut) this.#zoneChanged(cut);
      if (show) this.#feed('gift', { player: this.#pubPlayer(P), giftId: msg.gift_id, giftName: msg.gift_name, qty: msg.qty, coins: msg.coins, effects: (msg.effects || []).map((e) => e.type) });
    }).catch(() => {});
  };

  #applyGiftEffects(P, effects = [], deltas) {
    for (const e of effects) {
      switch (e.type) {
        case 'xpcoins': if (deltas) this.#addXpCoins(P, e.xp, e.coins); break;
        case 'luck': case 'power': if (deltas) P.buffs.push({ kind: e.type, value: e.value, uses: null, exp: e.expiresAtUtc }); break;
        case 'rare_next': if (deltas) P.buffs.push({ kind: 'rare_next', value: e.value, uses: e.uses, exp: null }); break;
        case 'score': if (deltas) P.score += e.amount; break;
        case 'world_event': this.events.enqueueCommitted({ eventId: e.eventId, kind: e.kind, level: e.level, params: e.params, summoner: P.key }); break;
        case 'cast':
          if (P.phase === PH.IDLE || P.phase === PH.WAIT || P.phase === PH.RESULT) { P.phase = PH.CAST; P.phaseAt = this.now(); P.until = this.now() + 500; P.fastBite = true; }
          break;
        default: break;
      }
    }
    if (deltas) this.#checkAch(P);
  }

  #addXpCoins(P, xp, coins) {
    P.xp += xp; P.coins = Math.max(0, P.coins + coins);
    const lv = levelForXp(P.xp);
    if (lv > P.level) { P.level = lv; P.interest = Math.max(P.interest, 50); this.#feed('levelup', { player: this.#pubPlayer(P), level: lv }); }
    else P.level = lv;
  }

  // ───────── mô phỏng ─────────
  #buff(P, kind) {
    const t = this.now();
    let v = 0;
    for (const b of P.buffs) if (b.kind === kind && (b.exp === null || b.exp > t) && (b.uses === null || b.uses > 0)) v = kind === 'rare_next' ? Math.max(v, b.value) : v + b.value;
    return v;
  }

  tick() {
    if (this.state !== 'RUNNING') return;
    const t0 = performance.now();
    const t = this.now();
    this.events.tick();
    const mods = this.events.modifiers();
    const afkMs = this.gc.config.afkMinutes * 60000;
    for (const P of this.players.values()) {
      if (P.state !== 'ACTIVE') continue;
      if (P.phase === PH.FIGHT) this.#fightStep(P, t, mods);
      if (t < P.until) continue;
      switch (P.phase) {
        case PH.IDLE: case PH.RESULT:
          if (t - P.lastValidAt > afkMs) { P.state = 'AFK'; P.phase = PH.IDLE; P.afkAt = t; this.#feed('afk', { player: this.#pubPlayer(P) }); break; }
          P.phase = PH.CAST; P.phaseAt = t; P.until = t + DIFFICULTY.castMs; P.f = null;
          break;
        case PH.CAST: {
          P.phase = PH.WAIT; P.phaseAt = t;
          const st = equipStats(P.equip);
          const span = DIFFICULTY.waitMaxMs - DIFFICULTY.waitMinMs;
          const wait = (DIFFICULTY.waitMinMs + this.rand() * span) / (st.biteSpeed * mods.biteSpeed) * (P.fastBite ? 0.35 : 1);
          P.fastBite = false;
          P.until = t + wait;
          break;
        }
        case PH.WAIT: this.#bite(P, t, mods); break;
        case PH.BITE: P.phase = PH.FIGHT; P.phaseAt = t; P.until = Number.POSITIVE_INFINITY; break;
        default: break;
      }
    }
    const ms = performance.now() - t0;
    this.tickStats.push(ms);
    if (this.tickStats.length > 600) this.tickStats.splice(0, 100);
    if (ms > this.c.tickMsMax) this.c.tickMsMax = Math.round(ms * 100) / 100;
  }

  #bite(P, t, mods) {
    const st = equipStats(P.equip);
    const boss = mods.bossActive ? this.events.boss() : null;
    let f;
    if (boss && boss.status === 'ACTIVE' && this.rand() < 0.6) {
      f = { boss: boss.id, species: SPECIES_BY_ID[boss.level >= 5 ? 92 : 91], str: 1.6, weight: 0 };
    } else if (mods.treasure && this.rand() < mods.treasure) {
      const sp = SPECIES_BY_ID[90];
      f = { species: sp, str: sp.str, weight: rollWeight(this.rand, sp) };
    } else {
      const minTier = this.#buff(P, 'rare_next') || 1;
      const luck = st.luck + this.#buff(P, 'luck') + mods.luck;
      const tier = rollTier(this.rand, luck, minTier);
      const sp = rollSpecies(this.rand, tier);
      f = { species: sp, str: sp.str, weight: rollWeight(this.rand, sp, mods.weightBias), usedRare: minTier > 1 };
    }
    f.tension = 0.2; f.progress = 0; f.phase = this.rand() * 6;
    P.f = f;
    P.phase = PH.BITE; P.phaseAt = t; P.until = t + DIFFICULTY.biteMs;
    if (f.species.tier >= 4 || f.boss) P.interest = Math.max(P.interest, 60);
  }

  /** Kéo cá: lực cá dao động vs lực kéo (cần + buff + "kéo" của người xem). Căng vượt ngưỡng dây quá lâu → đứt (sổng). */
  #fightStep(P, t, mods) {
    const f = P.f;
    if (!f) { P.phase = PH.RESULT; P.until = t; return; }
    const dt = this.tickMs / 1000;
    const st = equipStats(P.equip);
    const elapsed = (t - P.phaseAt) / 1000;
    const pull = f.str * (0.55 + 0.45 * Math.abs(Math.sin(elapsed * 1.7 + f.phase)) + (this.rand() < 0.05 ? 0.5 : 0));
    const reel = st.reel * (1 + this.#buff(P, 'power') / 100) * (P.assistUntil > t ? 1.4 : 1);
    const target = Math.min(1.5, (pull * mods.tension) / (2.6 * st.lineMax * (P.assistUntil > t ? 1.15 : 1)));
    f.tension += (target - f.tension) * Math.min(1, dt * 3);
    f.progress += dt * Math.max(0.03, 0.3 * reel - 0.08 * pull);
    // Nguy cơ đứt dây tăng theo bình phương phần căng vượt 0.6 (đã cân bằng: tests/game.test.js "cân bằng").
    const hazard = f.tension > 0.6 ? 2.5 * (f.tension - 0.6) ** 2 : 0;
    if (elapsed > 1 && this.rand() < hazard * dt) return this.#resolve(P, t, false, mods);
    if (f.progress >= 1 && elapsed * 1000 >= DIFFICULTY.fightMinMs) return this.#resolve(P, t, true, mods);
    if (elapsed > 30) return this.#resolve(P, t, f.progress > 0.6, mods);
  }

  #resolve(P, t, ok, mods) {
    const f = P.f;
    P.phase = PH.RESULT; P.phaseAt = t; P.until = t + DIFFICULTY.showResultMs;
    if (f.usedRare) this.#consumeRare(P);
    if (!ok) {
      this.c.escapes++;
      f.result = 'escaped';
      this.#feed('escape', { player: this.#pubPlayer(P), speciesId: f.boss ? null : f.species.id, tier: f.boss ? null : f.species.tier, boss: Boolean(f.boss) });
      return;
    }
    if (f.boss) {
      const st = equipStats(P.equip);
      const dmg = 10 * st.reel * (1 + this.#buff(P, 'power') / 100) * (1 + P.level / 20) * (0.8 + this.rand() * 0.4);
      const hit = this.events.damageBoss(P.key, dmg);
      f.result = 'boss';
      this.c.bossHits++;
      if (hit) this.#feed('boss_hit', { player: this.#pubPlayer(P), damage: hit.damage, hp: hit.hp, hpMax: hit.hpMax });
      return;
    }
    const sp = f.species;
    const v = catchValue(sp, f.weight, { scoreMult: mods.scoreMult });
    const id = randomUUID();
    this.queueOp({ t: GAME_OPS.CATCH_RECORD, catch_id: id, player_key: P.key, nickname: P.name, species_id: sp.id, weight_g: f.weight, score: v.score, xp: v.xp, coins: v.coins,
      at_utc: t, live_session_id: this.sessionId(), world_event_id: null });
    this.c.catches++;
    this.catchTimes.push(t);
    P.catches++; P.score += v.score; P.weightG += f.weight; P.bestTier = Math.max(P.bestTier, sp.tier);
    if (!sp.tag) { const d = P.dex.get(sp.id) || { count: 0, best: 0 }; const isNew = d.count === 0; d.count++; d.best = Math.max(d.best, f.weight); P.dex.set(sp.id, d); f.newDex = isNew; }
    f.result = 'caught';
    this.#addXpCoins(P, v.xp, v.coins);
    if (sp.tier >= 3) P.interest = Math.max(P.interest, 30 + sp.tier * 10);
    this.#feed('catch', { player: this.#pubPlayer(P), speciesId: sp.id, tier: sp.tier, weightG: f.weight, score: v.score, coins: v.coins, xp: v.xp, newDex: Boolean(f.newDex) });
    this.#checkAch(P);
  }

  #consumeRare(P) {
    const b = P.buffs.filter((x) => x.kind === 'rare_next' && x.uses > 0).sort((a, c) => c.value - a.value)[0];
    if (!b) return;
    b.uses--;
    if (!b.ram) this.queueOp({ t: GAME_OPS.BUFF_CONSUME, player_key: P.key, op_key: `rare:${P.key}:${randomUUID()}` });
  }

  #checkAch(P) {
    const val = { catches: P.catches, species: P.dex.size, rarity: P.bestTier, level: P.level, boss: P.bossKills, weight_kg: P.weightG / 1000, daily_streak: P.dailyStreak };
    for (const a of ACHIEVEMENTS) {
      if (P.ach.has(a.id)) continue;
      if ((a.kind === 'rarity' ? val.rarity >= a.need : val[a.kind] >= a.need)) {
        P.ach.add(a.id);
        P.coins += a.reward;
        this.queueOp({ t: GAME_OPS.ACH_UNLOCK, player_key: P.key, nickname: P.name, achievement_id: a.id, at_utc: this.now() });
        P.interest = Math.max(P.interest, 45);
        this.#feed('achievement', { player: this.#pubPlayer(P), id: a.id, name: a.name, reward: a.reward });
      }
    }
  }

  #rewardBoss(ev, contribs, killed) {
    const total = contribs.reduce((s, [, d]) => s + d, 0) || 1;
    const pool = 400 * ev.level + 40 * contribs.length;
    const t = this.now();
    contribs.forEach(([key, dmg], i) => {
      const share = dmg / total;
      const coins = killed ? Math.round(30 + pool * share) : Math.round(10 + pool * share * 0.2);
      const xp = killed ? Math.round(50 + 6 * pool * share) : Math.round(15 + pool * share);
      const score = killed ? Math.round(40 * ev.level + 1500 * share * ev.level) : 0;
      this.queueOp({ t: GAME_OPS.BOSS_REWARD, event_id: ev.id, player_key: key, coins, xp, score, kill: killed && i === 0, at_utc: t, live_session_id: this.sessionId() });
      const P = this.players.get(key);
      if (P && P.state !== 'LOADING') {
        this.#addXpCoins(P, xp, coins);
        P.score += score;
        if (killed && i === 0) { P.bossKills++; this.#checkAch(P); }
      }
    });
    const mvp = contribs[0] ? this.players.get(contribs[0][0]) : null;
    this.#feed('boss_reward', { killed, mvp: mvp ? this.#pubPlayer(mvp) : null, players: contribs.length, top: contribs.slice(0, 5).map(([k, d]) => ({ name: this.players.get(k)?.name ?? k, damage: d })) });
  }

  // ───────── mỗi giây: AFK→COLD, Spotlight ─────────
  slowTick() { this.#slowTick(); }
  #slowTick() {
    if (this.state === 'STOPPED') return;
    const t = this.now();
    const coldMs = this.gc.config.coldMinutes * 60000;
    for (const P of this.players.values()) {
      P.interest *= 0.93;
      if (P.buffs.length) P.buffs = P.buffs.filter((b) => (b.exp === null || b.exp > t) && (b.uses === null || b.uses > 0));
      // COLD: AFK lâu → bỏ khỏi RAM (không xoá người chơi; mọi thay đổi đã nằm trong hàng ghi trước đó).
      if (P.state === 'AFK' && t - P.lastValidAt > coldMs && !this.#inSlot(P.key)) { this.players.delete(P.key); this.c.evicted++; }
    }
    this.catchTimes = this.catchTimes.filter((x) => t - x < 60000);
    this.#spotlight(t);
    const cut = this.director.tick(t, this.#activeByZone());
    if (cut) this.#zoneChanged(cut);
  }

  // ───────── khu (ADR-0026) ─────────
  /** Khu đang lên hình: ô hiển thị của khu đó (stage chỉ vẽ khu này). */
  get slots() { return this.zoneSlots[this.director.zone]; }
  #inSlot(key) { return Object.values(this.zoneSlots).some((arr) => arr.includes(key)); }
  #activeByZone() {
    const n = {};
    for (const P of this.players.values()) if (P.state === 'ACTIVE' && P.zone) n[P.zone] = (n[P.zone] || 0) + 1;
    return n;
  }
  /** Khu vắng nhất (người mới vào được chia đều; hoà → khu đứng trước). */
  #quietZone() {
    const n = this.#activeByZone();
    let best = ZONES[0].id;
    for (const z of ZONES) if ((n[z.id] || 0) < (n[best] || 0)) best = z.id;
    return best;
  }
  #zoneChanged({ zone, reason, by }) {
    const P = by ? this.players.get(by) : null;
    this.#feed('zone', { zone, name: ZONE_BY_ID[zone]?.name ?? zone, reason, player: P ? this.#pubPlayer(P) : null });
  }

  #spotlight(t) {
    for (const z of ZONES) this.#spotlightZone(z.id, t);
  }

  #spotlightZone(zone, t) {
    const slots = this.zoneSlots[zone];
    const n = this.gc.config.detailedSlots;
    while (slots.length < n) slots.push(null);
    slots.length = n;
    for (let i = 0; i < n; i++) {
      const k = slots[i];
      const P = k && this.players.get(k);
      if (!P || P.zone !== zone || (P.state !== 'ACTIVE' && t - (P.afkAt || 0) > 20000)) slots[i] = null;
    }
    const inSlot = new Set(slots.filter(Boolean));
    const cands = [];
    for (const P of this.players.values()) if (P.state === 'ACTIVE' && P.zone === zone && !inSlot.has(P.key)) cands.push(P);
    cands.sort((a, b) => b.interest - a.interest || b.lastValidAt - a.lastValidAt);
    for (const P of cands) {
      let i = slots.indexOf(null);
      if (i < 0) {
        // thay người kém thú vị nhất (không đang kéo cá, đã lên hình ≥ 8 s)
        let worst = -1; let ws = Infinity;
        slots.forEach((k, j) => { const Q = this.players.get(k); if (Q && Q.phase !== PH.FIGHT && t - (Q.slotAt || 0) > 8000 && Q.interest < ws) { ws = Q.interest; worst = j; } });
        if (worst < 0 || P.interest < ws + 15) break;
        i = worst;
      }
      slots[i] = P.key;
      P.slotAt = t;
    }
  }

  // ───────── công bố cho stage/control ─────────
  #feed(type, data) { this.emit('feed', { type, at: this.now(), ...data }); }
  #pubPlayer(P) { return { key: P.key, name: P.name, level: P.level, app: P.appearance }; }

  counts() {
    let active = 0; let afk = 0; let loading = 0;
    for (const P of this.players.values()) { if (P.state === 'ACTIVE') active++; else if (P.state === 'AFK') afk++; else loading++; }
    return { active, afk, loading, hot: this.players.size };
  }

  /** Khung trạng thái cho stage (10 Hz): chỉ người trong ngân sách hiển thị + số tổng. */
  frame() {
    const t = this.now();
    const anglers = [];
    this.slots.forEach((k, i) => {
      const P = k && this.players.get(k);
      if (!P) return;
      const f = P.f;
      const a = { s: i, k: P.key, n: P.name, l: P.level, ph: P.state === 'ACTIVE' ? PH_NAME[P.phase] : 'afk', pt: t - P.phaseAt, app: P.appearance, rod: P.equip.rod };
      if (f && (P.phase === PH.FIGHT || P.phase === PH.BITE)) { a.te = Math.round(f.tension * 100) / 100; a.pr = Math.round(Math.min(1, f.progress) * 100) / 100; a.bs = Boolean(f.boss); a.big = f.boss ? 3 : Math.min(3, f.species.str); if (!f.boss && f.species?.id) a.fs = f.species.id; }
      if (f && P.phase === PH.RESULT) { a.res = f.result; if (f.result === 'caught') { a.sp = f.species.id; a.w = f.weight; } }
      if (this.#buff(P, 'luck') > 0) a.lk = 1;
      if (this.#buff(P, 'power') > 0) a.pw = 1;
      if (P.assistUntil > t) a.as = 1;
      anglers.push(a);
    });
    const mods = this.events.modifiers();
    const zone = this.director.zone;
    return { type: 'frame', t, anglers, zone, zoneName: ZONE_BY_ID[zone]?.name ?? zone, counts: this.counts(), weather: mods.weather, fpm: this.catchTimes.length, world: this.state };
  }

  profileCard(P) {
    const best = [...P.dex.entries()].map(([id, d]) => ({ id, ...d, tier: SPECIES_BY_ID[id]?.tier ?? 0 })).sort((a, b) => b.tier - a.tier || b.best - a.best)[0];
    return { level: P.level, coins: P.coins, catches: P.catches, dex: P.dex.size, dexTotal: FISHDEX_TOTAL, equip: { ...P.equip }, best: best ? { speciesId: best.id, weightG: best.best, tier: best.tier } : null, ach: P.ach.size };
  }

  /** Chi tiết người chơi đang nóng (Control). */
  playerInfo(key) {
    const P = this.players.get(key);
    if (!P) return null;
    return { key: P.key, name: P.name, state: P.state, phase: PH_NAME[P.phase], level: P.level, xp: P.xp, coins: P.coins, score: P.score, weightG: P.weightG, catches: P.catches,
      equip: { ...P.equip }, buffs: P.buffs.map((b) => ({ kind: b.kind, value: b.value, uses: b.uses, exp: b.exp })), dex: P.dex.size, ach: [...P.ach], zone: P.zone, inSlot: this.#inSlot(P.key) };
  }

  /** Admin: đánh thức / cho AFK / đưa lên hình. */
  adminPlayer(key, action) {
    const P = this.players.get(key);
    if (!P || P.state === 'LOADING') return false;
    if (action === 'wake') this.#wake(P);
    else if (action === 'afk') { P.state = 'AFK'; P.phase = PH.IDLE; P.afkAt = this.now(); }
    else if (action === 'spotlight') { this.#wake(P); P.interest = 500; }
    else return false;
    return true;
  }

  /** Demo: thêm nhiều người chơi ảo ngay (đi qua đúng đường lệnh 'câu'). */
  metrics() {
    const s = [...this.tickStats].sort((a, b) => a - b);
    const q = (p) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 100) / 100 : null);
    return { state: this.state, counts: this.counts(), counters: { ...this.c }, tickMs: { p50: q(0.5), p95: q(0.95), max: this.c.tickMsMax }, opsPending: this.ops.length,
      catchesPerMin: this.catchTimes.length, events: this.events.snapshot(), slots: Object.values(this.zoneSlots).reduce((n, a) => n + a.filter(Boolean).length, 0), zone: this.director.snapshot() };
  }
}

export { matchCommand, PH_NAME, RARITY_BY_TIER, vnDayKey };
