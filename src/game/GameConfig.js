// Cấu hình gameplay chỉnh được khi đang chạy (Control) — lưu bền trong bảng settings qua PersistenceWorker (có version, không ghi đè bản mới hơn).
//  - 'game.config': nhịp Boss, AFK, ngân sách hiển thị, âm lượng, sự kiện tự động…
//  - 'gift.rules' : Gift Mapping (quà → nhiều hành động, bật/tắt, hiện banner). Không hardcode: mặc định chỉ là điểm khởi đầu.
import { EventEmitter } from 'node:events';
import { DEFAULT_GIFT_RULES, GIFT_ACTIONS, WORLD_EVENT_KINDS } from './catalog.js';

/**
 * Bố cục màn hình phát (Control → Cài đặt → Bố cục): mỗi bảng dịch (dx, dy theo pixel khung 1080×1920), co giãn, độ mờ, bật/tắt,
 * và tự ẩn khi camera cận cảnh/dưới nước (hideOnClose) để không che người chơi. 0/1 = giữ nguyên vị trí gốc trong stage.css.
 */
export const LAYOUT_PANELS = Object.freeze({ top: 'Thanh tiêu đề', eventbar: 'Thanh sự kiện / Boss', feed: 'Bảng Diễn biến', lb: 'Bảng TOP', banner: 'Banner quà / thành tích', ticker: 'Dòng hướng dẫn lệnh', yt: 'Khung YouTube' });
const DEFAULT_LAYOUT = Object.freeze(Object.fromEntries(Object.keys(LAYOUT_PANELS).map((k) => [k, Object.freeze({ show: true, dx: 0, dy: 0, scale: 1, opacity: 1, hideOnClose: k === 'feed' || k === 'lb' })])));
/** Nhạc nền: synth = nhạc tổng hợp có sẵn; files = danh sách tệp trong public/stage/assets/music; youtube = khung YouTube nhúng; off = tắt. */
export const MUSIC_MODES = Object.freeze(['synth', 'files', 'youtube', 'off']);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
/** Lấy mã video YouTube (11 ký tự) từ link hoặc mã; không hợp lệ → ''. */
export function youtubeId(input) {
  const s = String(input ?? '').trim();
  if (YT_ID.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ?? '');
    return YT_ID.test(id) ? id : '';
  } catch { return ''; }
}

export const DEFAULT_GAME_CONFIG = Object.freeze({
  bossIntervalMin: 30,      // Boss định kỳ (0 = tắt)
  bossWarnSec: 60,          // cảnh báo trước khi Boss xuất hiện
  bossDurationSec: 180,
  maxConcurrentBoss: 1,     // không chồng chéo ngoài cấu hình
  bossHpPerPlayer: 120,     // HP Boss tự điều chỉnh theo số người ACTIVE
  autoEventEveryMin: 7,     // sự kiện thời tiết/kho báu tự động (0 = tắt)
  afkMinutes: 5,
  coldMinutes: 30,          // AFK quá lâu → hồ sơ về DB (không xoá người chơi)
  detailedSlots: 16,        // ngân sách hiển thị chi tiết trên stage (KHÔNG phải giới hạn người chơi)
  lbRotateSec: 12,
  lbPageSec: 4,
  volumes: { master: 0.8, music: 0.35, sfx: 0.8, ambient: 0.5 },
  showGuides: false,
  worldName: 'Hồ NOVA',
  likeBuffEvery: 50,
  layout: DEFAULT_LAYOUT,
  music: Object.freeze({ mode: 'synth', youtube: '', shuffle: false })
});

const clampNum = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);

export function sanitizeGameConfig(input, base = DEFAULT_GAME_CONFIG) {
  const o = input && typeof input === 'object' ? input : {};
  const b = { ...DEFAULT_GAME_CONFIG, ...base };
  const vol = { ...DEFAULT_GAME_CONFIG.volumes, ...b.volumes, ...(o.volumes && typeof o.volumes === 'object' ? o.volumes : {}) };
  return {
    bossIntervalMin: clampNum(o.bossIntervalMin ?? b.bossIntervalMin, 0, 600, 30),
    bossWarnSec: clampNum(o.bossWarnSec ?? b.bossWarnSec, 5, 600, 60),
    bossDurationSec: clampNum(o.bossDurationSec ?? b.bossDurationSec, 30, 1800, 180),
    maxConcurrentBoss: Math.round(clampNum(o.maxConcurrentBoss ?? b.maxConcurrentBoss, 1, 5, 1)),
    bossHpPerPlayer: clampNum(o.bossHpPerPlayer ?? b.bossHpPerPlayer, 10, 100000, 120),
    autoEventEveryMin: clampNum(o.autoEventEveryMin ?? b.autoEventEveryMin, 0, 600, 7),
    afkMinutes: clampNum(o.afkMinutes ?? b.afkMinutes, 1, 240, 5),
    coldMinutes: clampNum(o.coldMinutes ?? b.coldMinutes, 5, 1440, 30),
    detailedSlots: Math.round(clampNum(o.detailedSlots ?? b.detailedSlots, 4, 40, 16)),
    lbRotateSec: clampNum(o.lbRotateSec ?? b.lbRotateSec, 4, 120, 12),
    lbPageSec: clampNum(o.lbPageSec ?? b.lbPageSec, 2, 60, 4),
    volumes: Object.fromEntries(Object.entries(vol).filter(([k]) => k in DEFAULT_GAME_CONFIG.volumes).map(([k, v]) => [k, clampNum(v, 0, 1, 0.5)])),
    showGuides: Boolean(o.showGuides ?? b.showGuides),
    worldName: String(o.worldName ?? b.worldName).slice(0, 40) || 'Hồ NOVA',
    likeBuffEvery: Math.round(clampNum(o.likeBuffEvery ?? b.likeBuffEvery, 5, 100000, 50)),
    layout: sanitizeLayout(o.layout, b.layout),
    music: sanitizeMusic(o.music, b.music)
  };
}

function sanitizeLayout(input, base) {
  const o = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const k of Object.keys(LAYOUT_PANELS)) {
    const p = o[k] && typeof o[k] === 'object' ? o[k] : {};
    const d = { ...DEFAULT_LAYOUT[k], ...(base?.[k] || {}) };
    out[k] = {
      show: Boolean(p.show ?? d.show),
      dx: Math.round(clampNum(p.dx ?? d.dx, -1080, 1080, 0)),
      dy: Math.round(clampNum(p.dy ?? d.dy, -1920, 1920, 0)),
      scale: Math.round(clampNum(p.scale ?? d.scale, 0.3, 2, 1) * 100) / 100,
      opacity: Math.round(clampNum(p.opacity ?? d.opacity, 0, 1, 1) * 100) / 100,
      hideOnClose: Boolean(p.hideOnClose ?? d.hideOnClose)
    };
  }
  return out;
}

function sanitizeMusic(input, base) {
  const o = input && typeof input === 'object' ? input : {};
  const d = { mode: 'synth', youtube: '', shuffle: false, ...(base || {}) };
  const mode = MUSIC_MODES.includes(o.mode) ? o.mode : (MUSIC_MODES.includes(d.mode) ? d.mode : 'synth');
  return { mode, youtube: o.youtube !== undefined ? youtubeId(o.youtube) : youtubeId(d.youtube), shuffle: Boolean(o.shuffle ?? d.shuffle) };
}

const EVENT_KINDS = Object.keys(WORLD_EVENT_KINDS).filter((k) => k !== 'BOSS');

/** Kiểm & làm sạch một hành động quà. Trả null nếu không hợp lệ. */
function cleanAction(a) {
  if (!a || typeof a !== 'object' || !GIFT_ACTIONS[a.type]) return null;
  const i = (v, lo, hi, d) => Math.round(clampNum(v, lo, hi, d));
  switch (a.type) {
    case 'cast': return { type: 'cast' };
    case 'xp': return { type: 'xp', amount: i(a.amount, 0, 1000000, 10) };
    case 'coins': return { type: 'coins', amount: i(a.amount, 0, 1000000, 10) };
    case 'score': return { type: 'score', amount: i(a.amount, 0, 1000000, 10) };
    case 'luck': case 'power': case 'help_all': return { type: a.type, pct: i(a.pct, 1, 500, 20), minutes: i(a.minutes, 1, 240, 1) };
    case 'rare_next': return { type: 'rare_next', minTier: i(a.minTier, 2, 6, 3), count: i(a.count, 1, 20, 1) };
    case 'boss': return { type: 'boss', level: i(a.level, 1, 10, 1) };
    case 'event': return EVENT_KINDS.includes(a.kind) ? { type: 'event', kind: a.kind } : null;
    default: return null;
  }
}

export function sanitizeGiftRules(input) {
  const o = input && typeof input === 'object' ? input : {};
  const rule = (r) => ({
    giftId: Number.isSafeInteger(Number(r.giftId)) && Number(r.giftId) > 0 ? Number(r.giftId) : null,
    label: String(r.label ?? '').slice(0, 40),
    show: r.show !== false,
    enabled: r.enabled !== false,
    actions: (Array.isArray(r.actions) ? r.actions : []).slice(0, 8).map(cleanAction).filter(Boolean)
  });
  const seen = new Set();
  const rules = (Array.isArray(o.rules) ? o.rules : []).slice(0, 500).map(rule).filter((r) => r.giftId && !seen.has(r.giftId) && seen.add(r.giftId));
  const def = o.default && typeof o.default === 'object' ? rule({ ...o.default, giftId: 1 }) : rule({ ...DEFAULT_GIFT_RULES.default, giftId: 1 });
  delete def.giftId; delete def.label;
  const it = o.interactions && typeof o.interactions === 'object' ? o.interactions : DEFAULT_GIFT_RULES.interactions;
  return {
    version: 1,
    coinFactor: clampNum(o.coinFactor, 0, 1000, DEFAULT_GIFT_RULES.coinFactor),
    xpFactor: clampNum(o.xpFactor, 0, 1000, DEFAULT_GIFT_RULES.xpFactor),
    maxBuffMinutes: Math.round(clampNum(o.maxBuffMinutes, 1, 240, DEFAULT_GIFT_RULES.maxBuffMinutes)),
    rules,
    default: def,
    interactions: {
      like: { luckPct: clampNum(it.like?.luckPct, 0, 100, 2), minutes: clampNum(it.like?.minutes, 0, 60, 1), everyLikes: Math.round(clampNum(it.like?.everyLikes, 1, 100000, 50)) },
      follow: { coins: Math.round(clampNum(it.follow?.coins, 0, 100000, 30)) },
      share: { coins: Math.round(clampNum(it.share?.coins, 0, 100000, 20)), xp: Math.round(clampNum(it.share?.xp, 0, 100000, 20)) },
      join: { greet: it.join?.greet !== false }
    }
  };
}

export class GameConfig extends EventEmitter {
  constructor({ persistence, logger }) {
    super();
    this.p = persistence;
    this.log = logger;
    this.config = sanitizeGameConfig({});
    this.rules = sanitizeGiftRules(DEFAULT_GIFT_RULES);
    this.versions = { config: 0, rules: 0 };
  }

  async load() {
    for (const [key, field, fn] of [['game.config', 'config', sanitizeGameConfig], ['gift.rules', 'rules', sanitizeGiftRules]]) {
      const row = (await this.p.read('get_setting', { key }))[0];
      if (!row) continue;
      try { this[field] = fn(JSON.parse(row.value)); this.versions[field] = row.version; } catch (e) { this.log?.warn?.(`Cấu hình ${key} hỏng — dùng mặc định`, { error: e.message }); }
    }
    return this;
  }

  async #save(key, field, value) {
    const version = Math.max(Date.now(), this.versions[field] + 1);
    await this.p.commit({ cls: 'state', ops: [{ t: 'upsert_setting', key, value: JSON.stringify(value), version }] });
    this[field] = value;
    this.versions[field] = version;
    this.emit('changed', { field, value });
    return value;
  }
  setConfig(input) {
    const cur = this.config;
    const inLayout = input?.layout && typeof input.layout === 'object' ? input.layout : {};
    // gộp sâu: gửi một bảng/một mục nhạc không làm mất cài đặt của các bảng khác
    const layout = Object.fromEntries(Object.keys(LAYOUT_PANELS).map((k) => [k, { ...(cur.layout?.[k] || {}), ...(inLayout[k] && typeof inLayout[k] === 'object' ? inLayout[k] : {}) }]));
    return this.#save('game.config', 'config', sanitizeGameConfig({ ...cur, ...(input || {}), volumes: { ...cur.volumes, ...(input?.volumes || {}) }, layout, music: { ...(cur.music || {}), ...(input?.music && typeof input.music === 'object' ? input.music : {}) } }));
  }
  setRules(input) { return this.#save('gift.rules', 'rules', sanitizeGiftRules(input)); }
  resetRules() { return this.#save('gift.rules', 'rules', sanitizeGiftRules(DEFAULT_GIFT_RULES)); }

  ruleFor(giftId) { return this.rules.rules.find((r) => r.giftId === giftId) ?? { ...this.rules.default, giftId, label: null, isDefault: true }; }

  /** effectResolver cho GiftJournal: CHỐT hành động tại lúc nhận (đổi luật sau đó không ảnh hưởng quà đã nhận/replay). */
  resolveGift = (ev) => {
    const g = ev.payload;
    const r = this.ruleFor(g.giftId);
    const diamond = Number.isSafeInteger(g.diamondCount) ? g.diamondCount : 0;
    return {
      actions: r.enabled ? r.actions : [],
      // Thưởng gốc theo giá trị quà, tăng theo √kim cương (quà rất đắt không làm vỡ cân bằng cấp độ).
      baseCoins: Math.round(Math.sqrt(diamond) * this.rules.coinFactor),
      baseXp: Math.round(Math.sqrt(Math.max(1, diamond)) * this.rules.xpFactor),
      show: r.show,
      maxBuffMinutes: this.rules.maxBuffMinutes
    };
  };
}
