// Công thức tiến trình & thời gian Việt Nam — hàm thuần, tất định (dùng ở WorldCore, PersistenceWorker và test).
import { EQUIP_MAX_LEVEL, EQUIP_SLOTS, RARITIES, RARITY_BY_TIER, SPECIES_BY_ID, WILD_SPECIES } from './catalog.js';

// ───────── cấp độ ─────────
/** XP cần để đạt cấp L (tích luỹ). Cấp 1 = 0. Tăng dần ~ L^1.8. */
export const xpForLevel = (L) => (L <= 1 ? 0 : Math.floor(60 * Math.pow(L - 1, 1.8)));
export function levelForXp(xp) {
  let L = 1;
  while (L < 999 && xpForLevel(L + 1) <= xp) L++;
  return L;
}

// ───────── trang bị ─────────
export const upgradeCost = (slotId, toLevel) => {
  const s = EQUIP_SLOTS.find((x) => x.id === slotId);
  if (!s || toLevel < 2 || toLevel > EQUIP_MAX_LEVEL) return null;
  return Math.round(s.costBase * Math.pow(toLevel - 1, 2.1));
};
/** Chỉ số thực tế từ cấp trang bị. */
export function equipStats(eq = {}) {
  const lv = (k) => Math.min(EQUIP_MAX_LEVEL, Math.max(1, eq[k] | 0 || 1));
  return {
    reel: 1 + 0.08 * (lv('rod') - 1),        // tốc độ kéo
    lineMax: 1 + 0.1 * (lv('line') - 1),      // ngưỡng đứt dây
    biteSpeed: 1 + 0.06 * (lv('bobber') - 1), // chia thời gian chờ
    luck: 4 * (lv('bait') - 1)                // điểm may mắn
  };
}

// ───────── RNG tất định ─────────
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────── tung cá ─────────
/**
 * Chọn bậc hiếm theo may mắn (luck: 0..~200). May mắn dịch trọng số về bậc cao: w_t × (1 + luck/100)^(t-1).
 * minTier: bảo đảm tối thiểu (quà "cá hiếm ở lượt sau").
 */
export function rollTier(rand, luck = 0, minTier = 1) {
  const k = 1 + Math.max(0, luck) / 100;
  const ws = RARITIES.map((r) => (r.tier < minTier ? 0 : r.weight * Math.pow(k, r.tier - 1)));
  const total = ws.reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return RARITIES[i].tier; }
  return RARITIES.at(-1).tier;
}
export function rollSpecies(rand, tier) {
  const pool = WILD_SPECIES.filter((s) => s.tier === tier);
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
/** Trọng lượng (gam, nguyên) — phân phối lệch về nhỏ; bão (storm) đẩy lên. */
export function rollWeight(rand, species, bias = 0) {
  const [lo, hi] = species.w;
  const u = Math.min(1, Math.pow(rand(), 1.8 - Math.min(0.9, bias)));
  return Math.max(1, Math.round(lo + (hi - lo) * u));
}
export function catchValue(species, weightG, { scoreMult = 1 } = {}) {
  const r = RARITY_BY_TIER[species.tier];
  const kg = weightG / 1000;
  const score = Math.max(1, Math.round((species.pts + Math.sqrt(kg) * 6) * r.mult * scoreMult));
  const xp = Math.max(1, Math.round((8 + species.pts * 0.6) * Math.sqrt(r.mult)));
  const coins = Math.max(1, Math.round(species.pts * 0.5 * r.mult));
  return { score, xp, coins };
}
export const speciesOf = (id) => SPECIES_BY_ID[id] ?? null;

// ───────── chữ & lệnh ─────────
/** Bỏ dấu tiếng Việt + chữ thường + gộp khoảng trắng (khớp lệnh comment). */
export function foldText(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

// ───────── thời gian Việt Nam (UTC+7, không có giờ mùa hè) — lưu UTC, quy đổi khi tính kỳ ─────────
export const VN_OFFSET_MS = 7 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, '0');
export function vnDayKey(utcMs) {
  const d = new Date(utcMs + VN_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** Tuần ISO (thứ Hai–Chủ nhật) theo giờ VN: 'YYYY-Www'. */
export function vnWeekKey(utcMs) {
  const d = new Date(utcMs + VN_OFFSET_MS);
  const day = (d.getUTCDay() + 6) % 7; // 0 = thứ Hai
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = 1 + Math.floor((thursday.getTime() - yearStart) / (7 * 86400000));
  return `${thursday.getUTCFullYear()}-W${pad(week)}`;
}
export const periodKeys = (atUtc, liveSessionId) => ({
  live: `live:${liveSessionId || 'none'}`, day: `day:${vnDayKey(atUtc)}`, week: `week:${vnWeekKey(atUtc)}`, all: 'all'
});
export const minuteOf = (utcMs) => Math.floor(utcMs / 60000);
