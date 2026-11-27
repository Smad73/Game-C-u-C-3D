// Op & truy vấn gameplay chạy TRONG PersistenceWorker (một transaction mỗi batch, ADR-0017).
// Mọi phép cộng có khoá idempotency: applied_ops (op_key) hoặc UNIQUE (source_key, effect_seq). Gửi lại batch → không cộng lần hai.
import { ACHIEVEMENT_BY_ID, EQUIP_MAX_LEVEL, EQUIP_SLOTS, SPECIES_BY_ID, WORLD_EVENT_KINDS } from '../game/catalog.js';
import { levelForXp, minuteOf, periodKeys, upgradeCost, vnDayKey } from '../game/progression.js';

export const GAME_OPS = Object.freeze({
  CATCH_RECORD: 'catch_record',
  ACH_UNLOCK: 'ach_unlock',
  EQUIP_UPGRADE: 'equip_upgrade',
  DAILY_CLAIM: 'daily_claim',
  EVENT_UPSERT: 'event_upsert',
  EVENT_DAMAGE: 'event_damage',
  BOSS_REWARD: 'boss_reward',
  PLAYER_SEEN: 'player_seen',
  SCORE_ADJUST: 'score_adjust',
  RETENTION: 'retention',
  BUFF_CONSUME: 'buff_consume',
  REWARD: 'reward'
});

const EVENT_STATUS_ORDER = { QUEUED: 0, WARNING: 1, ACTIVE: 2, DONE: 3, FAILED: 3, CANCELLED: 3 };
const BUFF_MAX_USES = 20;

export function createGameOps({ prep, str, int, OpError, realm }) {
  const BIG = { min: 0, max: Number.MAX_SAFE_INTEGER };
  const optStr = (op, k, max = 128) => str(op, k, { max, optional: true });
  const once = (opKey, batchId, now) => prep('INSERT OR IGNORE INTO applied_ops (op_key, batch_id, at_utc) VALUES (?, ?, ?)').run(opKey, batchId, now).changes === 1;

  function checkKey(key) {
    const want = realm === 'live' ? 'tt:' : 'demo:';
    if (!key.startsWith(want)) throw new OpError('REALM_MISMATCH', `player_key "${key.slice(0, 20)}" không thuộc realm "${realm}"`);
  }
  /** Bảo đảm có dòng người chơi (catch có thể đến trước mọi op khác của người đó). */
  function ensurePlayer(op, now) {
    const key = str(op, 'player_key', { max: 80 });
    checkKey(key);
    const ext = key.slice(key.indexOf(':') + 1);
    prep(`INSERT INTO players (player_key, realm, external_id, unique_id, nickname, first_seen_utc, last_seen_utc) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_key) DO UPDATE SET nickname = COALESCE(excluded.nickname, players.nickname), unique_id = COALESCE(excluded.unique_id, players.unique_id),
        last_seen_utc = MAX(players.last_seen_utc, excluded.last_seen_utc)`)
      .run(key, realm, ext, optStr(op, 'unique_id', 64), optStr(op, 'nickname', 128), now, now);
    return key;
  }
  function addXpCoins(key, xp, coins) {
    if (!xp && !coins) return null;
    prep('UPDATE players SET xp = MAX(0, xp + ?), coins = MAX(0, coins + ?) WHERE player_key = ?').run(xp, coins, key);
    const row = prep('SELECT xp, level FROM players WHERE player_key = ?').get(key);
    if (!row) throw new OpError('PLAYER_NOT_FOUND', `không có người chơi ${key}`);
    const lv = levelForXp(row.xp);
    if (lv !== row.level) prep('UPDATE players SET level = ? WHERE player_key = ?').run(lv, key);
    return { xp: row.xp, level: lv };
  }
  /** Ghi sổ cái + cộng BXH 4 kỳ trong cùng transaction. Trả false nếu (source_key, seq) đã có (idempotent). */
  function ledger(key, score, weightG, source, sourceKey, seq, atUtc, sessionId) {
    const r = prep(`INSERT OR IGNORE INTO score_ledger (player_key, score, weight_g, source, source_key, effect_seq, at_utc, minute_utc, live_session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(key, score, weightG, source, sourceKey, seq, atUtc, minuteOf(atUtc), sessionId);
    if (r.changes === 0) return false;
    const pk = periodKeys(atUtc, sessionId);
    for (const scope of ['live', 'day', 'week', 'all']) {
      prep(`INSERT INTO leaderboard_scores (scope, period_key, player_key, score, weight_g, reached_at_utc) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope, period_key, player_key) DO UPDATE SET score = score + excluded.score, weight_g = weight_g + excluded.weight_g,
          reached_at_utc = CASE WHEN excluded.score > 0 THEN excluded.reached_at_utc ELSE reached_at_utc END`)
        .run(scope, pk[scope], key, score, weightG, atUtc);
    }
    prep('UPDATE players SET total_score = total_score + ?, total_weight_g = total_weight_g + ? WHERE player_key = ?').run(score, weightG, key);
    return true;
  }

  function eventUpsert(op, ctx) {
    const id = str(op, 'event_id', { max: 80 });
    const kind = str(op, 'kind', { max: 24 });
    if (!WORLD_EVENT_KINDS[kind] && kind !== 'BLESSING') throw new OpError('OP_INVALID', `loại sự kiện không hợp lệ: ${kind}`);
    const status = str(op, 'status', { max: 10 });
    if (!(status in EVENT_STATUS_ORDER)) throw new OpError('OP_INVALID', 'status sự kiện không hợp lệ');
    const cur = prep('SELECT status FROM world_events WHERE event_id = ?').get(id);
    if (!cur) {
      prep(`INSERT INTO world_events (event_id, kind, source, source_key, summoner_key, level, status, hp_max, hp_left, active_players, queued_at_utc,
          warned_at_utc, started_at_utc, ended_at_utc, result, params, live_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, kind, str(op, 'source', { max: 10 }), optStr(op, 'source_key', 220), optStr(op, 'summoner_key', 80), op.level ?? 1, status,
          op.hp_max ?? null, op.hp_left ?? null, op.active_players ?? null, op.queued_at_utc ?? ctx.now, op.warned_at_utc ?? null, op.started_at_utc ?? null,
          op.ended_at_utc ?? null, optStr(op, 'result', 40), JSON.stringify(op.params ?? {}).slice(0, 2000), optStr(op, 'live_session_id', 64));
      return 'applied';
    }
    // Trạng thái chỉ tiến, không lùi (DONE không "sống lại"). hp_left chỉ giảm.
    if (EVENT_STATUS_ORDER[status] < EVENT_STATUS_ORDER[cur.status]) return 'skipped';
    prep(`UPDATE world_events SET status = ?, hp_max = COALESCE(?, hp_max), hp_left = CASE WHEN ? IS NULL THEN hp_left ELSE MIN(COALESCE(hp_left, ?), ?) END,
        active_players = COALESCE(?, active_players), warned_at_utc = COALESCE(warned_at_utc, ?), started_at_utc = COALESCE(started_at_utc, ?),
        ended_at_utc = COALESCE(ended_at_utc, ?), result = COALESCE(?, result), live_session_id = COALESCE(live_session_id, ?) WHERE event_id = ?`)
      .run(status, op.hp_max ?? null, op.hp_left ?? null, op.hp_left ?? null, op.hp_left ?? null, op.active_players ?? null, op.warned_at_utc ?? null,
        op.started_at_utc ?? null, op.ended_at_utc ?? null, optStr(op, 'result', 40), optStr(op, 'live_session_id', 64), id);
    return 'applied';
  }

  /**
   * Hiệu ứng gameplay của quà — chạy trong CÙNG transaction với APPLIED (ADR-0018 bước 4).
   * Tham số lấy từ effect_params đã CHỐT lúc nhận (received_at, actions) → replay tất định.
   * Trả danh sách hiệu ứng đã áp dụng (để công bố RAM SAU ack).
   */
  function giftEffects(g, params, qty, batchId, ctx) {
    const effects = [];
    if (!params || params.v !== 2 || !g.player_key || qty <= 0) return effects;
    const key = g.player_key;
    const at = Number.isSafeInteger(params.received_at_utc) ? params.received_at_utc : ctx.now;
    const maxMin = Math.max(1, params.maxBuffMinutes | 0 || 60);
    const xpBase = Math.max(0, (params.baseXp | 0) * qty);
    const coinBase = Math.max(0, (params.baseCoins | 0) * qty);
    let xp = xpBase; let coins = coinBase;
    (params.actions || []).forEach((a, i) => {
      const seq = i + 1;
      switch (a?.type) {
        case 'xp': xp += Math.max(0, a.amount | 0) * qty; break;
        case 'coins': coins += Math.max(0, a.amount | 0) * qty; break;
        case 'luck': case 'power': {
          const minutes = Math.min(maxMin, Math.max(1, a.minutes | 0) * qty);
          const exp = at + minutes * 60000;
          const v = Math.min(500, Math.max(1, a.pct | 0));
          const r = prep(`INSERT OR IGNORE INTO player_buffs (source_key, effect_seq, player_key, kind, value, uses, expires_at_utc, created_at_utc)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`).run(g.gift_key, seq, key, a.type, v, exp, ctx.now);
          if (r.changes) effects.push({ type: a.type, value: v, expiresAtUtc: exp });
          break;
        }
        case 'rare_next': {
          const uses = Math.min(BUFF_MAX_USES, Math.max(1, a.count | 0 || 1) * qty);
          const tier = Math.min(6, Math.max(2, a.minTier | 0 || 3));
          const r = prep(`INSERT OR IGNORE INTO player_buffs (source_key, effect_seq, player_key, kind, value, uses, expires_at_utc, created_at_utc)
            VALUES (?, ?, ?, 'rare_next', ?, ?, NULL, ?)`).run(g.gift_key, seq, key, tier, uses, ctx.now);
          if (r.changes) effects.push({ type: 'rare_next', value: tier, uses });
          break;
        }
        case 'boss': case 'event': case 'help_all': {
          const kind = a.type === 'boss' ? 'BOSS' : a.type === 'help_all' ? 'BLESSING' : String(a.kind || '');
          if (kind !== 'BLESSING' && !WORLD_EVENT_KINDS[kind]) break;
          const id = `ev-${g.gift_key.slice(0, 60)}-${seq}`.replace(/[^A-Za-z0-9_.:-]/g, '_');
          const p = a.type === 'help_all' ? { pct: Math.min(200, Math.max(1, a.pct | 0)), minutes: Math.min(maxMin, Math.max(1, a.minutes | 0) * qty) } : {};
          const r = prep(`INSERT OR IGNORE INTO world_events (event_id, kind, source, source_key, summoner_key, level, status, queued_at_utc, params, live_session_id)
            VALUES (?, ?, 'GIFT', ?, ?, ?, 'QUEUED', ?, ?, ?)`).run(id, kind, `${g.gift_key}:${seq}`, key, Math.min(10, Math.max(1, a.level | 0 || 1)), at, JSON.stringify(p), g.live_session_id);
          if (r.changes) effects.push({ type: 'world_event', eventId: id, kind, level: Math.min(10, Math.max(1, a.level | 0 || 1)), params: p });
          break;
        }
        case 'score': {
          const s = Math.max(0, a.amount | 0) * qty;
          if (s > 0 && ledger(key, s, 0, 'GIFT', g.gift_key, seq, at, g.live_session_id)) effects.push({ type: 'score', amount: s });
          break;
        }
        case 'cast': effects.push({ type: 'cast' }); break;
        default: break;
      }
    });
    if ((xp || coins) && once(`gift:${g.gift_key}:xpcoins`, batchId, ctx.now)) {
      const r = addXpCoins(key, xp, coins);
      effects.push({ type: 'xpcoins', xp, coins, level: r?.level ?? null });
    }
    return effects;
  }

  function apply(op, batchId, ctx) {
    switch (op.t) {
      case GAME_OPS.PLAYER_SEEN: {
        ensurePlayer(op, ctx.now);
        if (Number.isSafeInteger(op.appearance)) prep('UPDATE players SET appearance = ? WHERE player_key = ? AND appearance = 0').run(op.appearance, op.player_key);
        return 'applied';
      }
      case GAME_OPS.CATCH_RECORD: {
        const id = str(op, 'catch_id', { max: 64 });
        const key = ensurePlayer(op, ctx.now);
        const sp = SPECIES_BY_ID[int(op, 'species_id', { min: 1, max: 1000 })];
        if (!sp) throw new OpError('OP_INVALID', 'loài cá không tồn tại');
        const weight = int(op, 'weight_g', { min: 1, max: 100000000 });
        const score = int(op, 'score', { min: 0, max: 10000000 });
        const xp = int(op, 'xp', { min: 0, max: 10000000 });
        const coins = int(op, 'coins', { min: 0, max: 10000000 });
        const at = int(op, 'at_utc', BIG);
        const sess = optStr(op, 'live_session_id', 64);
        const r = prep(`INSERT OR IGNORE INTO catches (catch_id, player_key, species_id, tier, weight_g, score, xp, coins, live_session_id, world_event_id, at_utc)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, key, sp.id, sp.tier, weight, score, xp, coins, sess, optStr(op, 'world_event_id', 80), at);
        if (r.changes === 0) return 'skipped'; // lượt câu đã ghi (batch gửi lại) — không cộng lần hai
        ledger(key, score, weight, 'CATCH', `catch:${id}`, 0, at, sess);
        addXpCoins(key, xp, coins);
        prep('UPDATE players SET catches_total = catches_total + 1, best_tier = MAX(best_tier, ?) WHERE player_key = ?').run(sp.tier, key);
        if (!sp.tag) {
          prep(`INSERT INTO fishdex (player_key, species_id, count, best_weight_g, first_at_utc) VALUES (?, ?, 1, ?, ?)
            ON CONFLICT(player_key, species_id) DO UPDATE SET count = count + 1, best_weight_g = MAX(best_weight_g, excluded.best_weight_g)`)
            .run(key, sp.id, weight, at);
        }
        return 'applied';
      }
      case GAME_OPS.ACH_UNLOCK: {
        const key = ensurePlayer(op, ctx.now);
        const a = ACHIEVEMENT_BY_ID[str(op, 'achievement_id', { max: 40 })];
        if (!a) throw new OpError('OP_INVALID', 'thành tích không tồn tại');
        const r = prep('INSERT OR IGNORE INTO player_achievements (player_key, achievement_id, at_utc) VALUES (?, ?, ?)').run(key, a.id, int(op, 'at_utc', BIG));
        if (r.changes === 0) return 'skipped';
        addXpCoins(key, 0, a.reward);
        ctx.results.push({ t: op.t, player_key: key, achievement_id: a.id, unlocked: true, reward: a.reward });
        return 'applied';
      }
      case GAME_OPS.EQUIP_UPGRADE: {
        const key = ensurePlayer(op, ctx.now);
        const slot = str(op, 'slot', { max: 10 });
        if (!EQUIP_SLOTS.some((s) => s.id === slot)) throw new OpError('OP_INVALID', 'ô trang bị không hợp lệ');
        const to = int(op, 'to_level', { min: 2, max: EQUIP_MAX_LEVEL });
        const cost = upgradeCost(slot, to);
        const out = (ok, reason) => { ctx.results.push({ t: op.t, player_key: key, slot, to_level: to, ok, reason, cost }); return ok ? 'applied' : 'skipped'; };
        const cur = prep('SELECT level FROM player_equipment WHERE player_key = ? AND slot = ?').get(key, slot)?.level ?? 1;
        if (cur >= to) return out(true, 'ALREADY');
        if (cur !== to - 1) return out(false, 'LEVEL_MISMATCH');
        const coins = prep('SELECT coins FROM players WHERE player_key = ?').get(key).coins;
        if (coins < cost) return out(false, 'NOT_ENOUGH_COINS');
        if (!once(`upg:${key}:${slot}:${to}`, batchId, ctx.now)) return out(true, 'ALREADY');
        prep('UPDATE players SET coins = coins - ? WHERE player_key = ?').run(cost, key);
        prep(`INSERT INTO player_equipment (player_key, slot, level, updated_at_utc) VALUES (?, ?, ?, ?)
          ON CONFLICT(player_key, slot) DO UPDATE SET level = excluded.level, updated_at_utc = excluded.updated_at_utc`).run(key, slot, to, ctx.now);
        return out(true, null);
      }
      case GAME_OPS.DAILY_CLAIM: {
        const key = ensurePlayer(op, ctx.now);
        const at = int(op, 'at_utc', BIG);
        const day = vnDayKey(at);
        const prevDay = vnDayKey(at - 86400000);
        const p = prep('SELECT daily_streak, last_daily FROM players WHERE player_key = ?').get(key);
        if (p.last_daily === day) { ctx.results.push({ t: op.t, player_key: key, ok: false, reason: 'ALREADY_TODAY', day }); return 'skipped'; }
        const streak = p.last_daily === prevDay ? p.daily_streak + 1 : 1;
        const coins = 50 + 15 * Math.min(streak, 10);
        const xp = 40 + 10 * Math.min(streak, 10);
        const r = prep('INSERT OR IGNORE INTO player_daily (player_key, day_key, coins, xp, streak, at_utc) VALUES (?, ?, ?, ?, ?, ?)').run(key, day, coins, xp, streak, at);
        if (r.changes === 0) { ctx.results.push({ t: op.t, player_key: key, ok: false, reason: 'ALREADY_TODAY', day }); return 'skipped'; }
        prep('UPDATE players SET daily_streak = ?, last_daily = ? WHERE player_key = ?').run(streak, day, key);
        const lv = addXpCoins(key, xp, coins);
        ctx.results.push({ t: op.t, player_key: key, ok: true, day, streak, coins, xp, level: lv?.level });
        return 'applied';
      }
      case GAME_OPS.EVENT_UPSERT: return eventUpsert(op, ctx);
      case GAME_OPS.EVENT_DAMAGE: {
        const id = str(op, 'event_id', { max: 80 });
        const key = ensurePlayer(op, ctx.now);
        const dmg = int(op, 'damage', { min: 0, max: 1000000000 });
        if (!prep('SELECT 1 FROM world_events WHERE event_id = ?').get(id)) return 'skipped'; // sự kiện chưa/không được ghi: bỏ qua, không làm hỏng cả batch
        if (!once(str(op, 'op_key', { max: 200 }), batchId, ctx.now)) return 'skipped';
        prep(`INSERT INTO world_event_contrib (event_id, player_key, damage) VALUES (?, ?, ?)
          ON CONFLICT(event_id, player_key) DO UPDATE SET damage = damage + excluded.damage`).run(id, key, dmg);
        return 'applied';
      }
      case GAME_OPS.BOSS_REWARD: {
        const id = str(op, 'event_id', { max: 80 });
        const key = ensurePlayer(op, ctx.now);
        if (!once(`bossrw:${id}:${key}`, batchId, ctx.now)) return 'skipped';
        const score = int(op, 'score', { min: 0, max: 100000000 });
        const at = int(op, 'at_utc', BIG);
        addXpCoins(key, int(op, 'xp', { min: 0, max: 100000000 }), int(op, 'coins', { min: 0, max: 100000000 }));
        if (score > 0) ledger(key, score, 0, 'BOSS', `boss:${id}:${key}`, 0, at, optStr(op, 'live_session_id', 64));
        prep('UPDATE players SET boss_kills = boss_kills + ? WHERE player_key = ?').run(op.kill ? 1 : 0, key);
        prep(`INSERT INTO world_event_contrib (event_id, player_key, damage, rewarded) VALUES (?, ?, 0, 1)
          ON CONFLICT(event_id, player_key) DO UPDATE SET rewarded = 1`).run(id, key);
        return 'applied';
      }
      case GAME_OPS.SCORE_ADJUST: {
        const key = ensurePlayer(op, ctx.now);
        const delta = int(op, 'score', { min: -100000000, max: 100000000 });
        const ok = ledger(key, delta, 0, 'ADJUST', str(op, 'source_key', { max: 120 }), 0, int(op, 'at_utc', BIG), optStr(op, 'live_session_id', 64));
        return ok ? 'applied' : 'skipped';
      }
      case GAME_OPS.RETENTION: {
        // P1: dọn khoá idempotency/batch cũ hơn N ngày (ARCHITECTURE §4: "dọn sau 7 ngày"). Không đụng dữ liệu người chơi.
        const before = int(op, 'before_utc', BIG);
        const a = prep('DELETE FROM applied_ops WHERE at_utc < ?').run(before).changes;
        const b = prep('DELETE FROM committed_batches WHERE committed_at_utc < ?').run(before).changes;
        const c = prep("DELETE FROM player_buffs WHERE (expires_at_utc IS NOT NULL AND expires_at_utc < ?) OR (uses IS NOT NULL AND uses <= 0)").run(before).changes;
        ctx.results.push({ t: op.t, appliedOps: a, batches: b, buffs: c });
        return 'applied';
      }
      case GAME_OPS.REWARD: {
        // Thưởng tương tác (follow/share…) — một lần theo op_key do tầng trên đặt (vd follow:<player>:<buổi LIVE>).
        const key = ensurePlayer(op, ctx.now);
        const ok = once(str(op, 'op_key', { max: 200 }), batchId, ctx.now);
        if (ok) addXpCoins(key, int(op, 'xp', { min: 0, max: 1000000 }), int(op, 'coins', { min: 0, max: 1000000 }));
        ctx.results.push({ t: op.t, player_key: key, ok, op_key: op.op_key });
        return ok ? 'applied' : 'skipped';
      }
      case GAME_OPS.BUFF_CONSUME: return consumeRareNext(op, batchId, ctx);
      default: return undefined;
    }
  }

  /** Lượt dùng buff "cá hiếm lượt sau" (gọi trong CATCH_RECORD batch qua op riêng là không cần: dùng op_key). */
  function consumeRareNext(op, batchId, ctx) {
    const key = str(op, 'player_key', { max: 80 });
    if (!once(str(op, 'op_key', { max: 200 }), batchId, ctx.now)) return 'skipped';
    const b = prep("SELECT source_key, effect_seq FROM player_buffs WHERE player_key = ? AND kind = 'rare_next' AND uses > 0 ORDER BY value DESC, created_at_utc LIMIT 1").get(key);
    if (b) prep('UPDATE player_buffs SET uses = uses - 1 WHERE source_key = ? AND effect_seq = ?').run(b.source_key, b.effect_seq);
    return 'applied';
  }

  // ───────── truy vấn ─────────
  const lbOrder = 'ORDER BY score DESC, weight_g DESC, reached_at_utc ASC, player_key ASC';
  const lim = (v, d = 10, max = 200) => Math.min(max, Math.max(1, Number(v) | 0 || d));
  const off = (v) => Math.max(0, Number(v) | 0);
  const queries = {
    player_profile: (p) => {
      const key = String(p.player_key);
      const pl = prep('SELECT * FROM players WHERE player_key = ?').get(key);
      if (!pl) return [];
      return [{
        player: pl,
        equipment: prep('SELECT slot, level FROM player_equipment WHERE player_key = ?').all(key),
        fishdex: prep('SELECT species_id, count, best_weight_g, first_at_utc FROM fishdex WHERE player_key = ? ORDER BY species_id').all(key),
        achievements: prep('SELECT achievement_id, at_utc FROM player_achievements WHERE player_key = ? ORDER BY at_utc').all(key),
        buffs: prep(`SELECT kind, value, uses, expires_at_utc FROM player_buffs WHERE player_key = ? AND
          ((expires_at_utc IS NOT NULL AND expires_at_utc > ?) OR (uses IS NOT NULL AND uses > 0))`).all(key, Number(p.now) || 0),
        recent: prep('SELECT species_id, tier, weight_g, score, at_utc FROM catches WHERE player_key = ? ORDER BY at_utc DESC LIMIT 10').all(key)
      }];
    },
    players_search: (p) => {
      const q = `%${String(p.q ?? '').replace(/[%_]/g, '')}%`;
      return prep(`SELECT player_key, nickname, unique_id, level, xp, coins, total_score, total_weight_g, catches_total, last_seen_utc FROM players
        WHERE nickname LIKE ? OR unique_id LIKE ? OR player_key LIKE ? ORDER BY last_seen_utc DESC LIMIT ? OFFSET ?`).all(q, q, q, lim(p.limit, 50), off(p.offset));
    },
    players_count: () => [{ n: prep('SELECT COUNT(*) AS n FROM players').get().n }],
    leaderboard: (p) => {
      const scope = String(p.scope);
      if (!['live', 'day', 'week', 'all'].includes(scope)) throw new OpError('OP_INVALID', 'scope không hợp lệ');
      const rows = prep(`SELECT l.player_key, l.score, l.weight_g, l.reached_at_utc, pl.nickname, pl.unique_id, pl.level FROM leaderboard_scores l
        JOIN players pl ON pl.player_key = l.player_key WHERE l.scope = ? AND l.period_key = ? ${lbOrder.replace(/(score|weight_g|reached_at_utc|player_key)/g, 'l.$1')} LIMIT ? OFFSET ?`)
        .all(scope, String(p.period), lim(p.limit), off(p.offset));
      const total = prep('SELECT COUNT(*) AS n FROM leaderboard_scores WHERE scope = ? AND period_key = ?').get(scope, String(p.period)).n;
      return [{ rows, total }];
    },
    /** TOP 60 phút: cửa sổ trượt tính trực tiếp từ sổ cái (ADR-0010). reached = thời điểm cộng điểm cuối trong cửa sổ. */
    leaderboard_hour: (p) => {
      const since = Number(p.sinceUtc) || 0;
      const rows = prep(`SELECT s.player_key, SUM(s.score) AS score, SUM(s.weight_g) AS weight_g, MAX(s.at_utc) AS reached_at_utc, pl.nickname, pl.unique_id, pl.level
        FROM score_ledger s JOIN players pl ON pl.player_key = s.player_key WHERE s.at_utc >= ? GROUP BY s.player_key
        ORDER BY score DESC, weight_g DESC, reached_at_utc ASC, s.player_key ASC LIMIT ? OFFSET ?`).all(since, lim(p.limit), off(p.offset));
      const total = prep('SELECT COUNT(DISTINCT player_key) AS n FROM score_ledger WHERE at_utc >= ?').get(since).n;
      return [{ rows, total }];
    },
    player_rank: (p) => {
      const scope = String(p.scope);
      const key = String(p.player_key);
      if (scope === 'hour') {
        const me = prep('SELECT SUM(score) AS score, SUM(weight_g) AS w FROM score_ledger WHERE player_key = ? AND at_utc >= ?').get(key, Number(p.sinceUtc) || 0);
        if (!me?.score) return [{ rank: null }];
        const ahead = prep(`SELECT COUNT(*) AS n FROM (SELECT player_key, SUM(score) AS s, SUM(weight_g) AS w FROM score_ledger WHERE at_utc >= ? GROUP BY player_key)
          WHERE s > ? OR (s = ? AND w > ?)`).get(Number(p.sinceUtc) || 0, me.score, me.score, me.w).n;
        return [{ rank: ahead + 1, score: me.score }];
      }
      const me = prep('SELECT score, weight_g, reached_at_utc FROM leaderboard_scores WHERE scope = ? AND period_key = ? AND player_key = ?').get(scope, String(p.period), key);
      if (!me) return [{ rank: null }];
      const ahead = prep(`SELECT COUNT(*) AS n FROM leaderboard_scores WHERE scope = ? AND period_key = ? AND (score > ? OR (score = ? AND (weight_g > ? OR (weight_g = ? AND reached_at_utc < ?))))`)
        .get(scope, String(p.period), me.score, me.score, me.weight_g, me.weight_g, me.reached_at_utc).n;
      return [{ rank: ahead + 1, score: me.score }];
    },
    lb_periods: (p) => prep('SELECT DISTINCT period_key FROM leaderboard_scores WHERE scope = ? ORDER BY period_key DESC LIMIT 60').all(String(p.scope)),
    events_open: () => prep("SELECT * FROM world_events WHERE status IN ('QUEUED', 'WARNING', 'ACTIVE') ORDER BY queued_at_utc, event_id").all(),
    events_recent: (p) => prep('SELECT * FROM world_events ORDER BY queued_at_utc DESC LIMIT ?').all(lim(p.limit, 30)),
    event_contrib: (p) => prep('SELECT player_key, damage, rewarded FROM world_event_contrib WHERE event_id = ? ORDER BY damage DESC').all(String(p.event_id)),
    buffs_active: (p) => prep(`SELECT player_key, kind, value, uses, expires_at_utc, source_key, effect_seq FROM player_buffs WHERE
      (expires_at_utc IS NOT NULL AND expires_at_utc > ?) OR (uses IS NOT NULL AND uses > 0)`).all(Number(p.now) || 0),
    recent_catches: (p) => prep(`SELECT c.*, pl.nickname FROM catches c JOIN players pl ON pl.player_key = c.player_key WHERE c.tier >= ? ORDER BY c.at_utc DESC LIMIT ?`)
      .all(Number(p.minTier) || 1, lim(p.limit, 20)),
    game_stats: (p) => [{
      players: prep('SELECT COUNT(*) AS n FROM players').get().n,
      catches: prep('SELECT COUNT(*) AS n FROM catches').get().n,
      catchesToday: prep('SELECT COUNT(*) AS n FROM catches WHERE at_utc >= ?').get(Number(p.dayStartUtc) || 0).n,
      bosses: prep("SELECT COUNT(*) AS n FROM world_events WHERE kind = 'BOSS' AND status = 'DONE'").get().n,
      gifts: prep("SELECT COUNT(*) AS n FROM gift_events WHERE status = 'APPLIED'").get().n
    }],
    // Bất biến điểm: tổng sổ cái = tổng BXH 'all' = tổng điểm người chơi (kiểm trong test & crash suite).
    score_invariants: () => [{
      ledger: prep('SELECT COALESCE(SUM(score), 0) AS s FROM score_ledger').get().s,
      lbAll: prep("SELECT COALESCE(SUM(score), 0) AS s FROM leaderboard_scores WHERE scope = 'all'").get().s,
      players: prep('SELECT COALESCE(SUM(total_score), 0) AS s FROM players').get().s,
      catchScore: prep('SELECT COALESCE(SUM(score), 0) AS s FROM catches').get().s,
      catchLedger: prep("SELECT COALESCE(SUM(score), 0) AS s FROM score_ledger WHERE source = 'CATCH'").get().s,
      catches: prep('SELECT COUNT(*) AS n FROM catches').get().n,
      catchesTotal: prep('SELECT COALESCE(SUM(catches_total), 0) AS n FROM players').get().n
    }]
  };
  return { apply, giftEffects, consumeRareNext, queries };
}
