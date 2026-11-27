// Danh mục gửi cho stage/control (chỉ dữ liệu hiển thị, không có gì nhạy cảm).
import { ACHIEVEMENTS, COMMANDS, EQUIP_MAX_LEVEL, EQUIP_SLOTS, EQUIP_TIER_NAMES, FISHDEX_TOTAL, GIFT_ACTIONS, RARITIES, SPECIES, WORLD_EVENT_KINDS } from './catalog.js';
import { upgradeCost, xpForLevel } from './progression.js';

export const CATALOG_PUBLIC = Object.freeze({
  rarities: RARITIES,
  species: SPECIES.map((s) => ({ id: s.id, name: s.name, tier: s.tier, color: s.color, shape: s.shape, w: s.w, tag: s.tag ?? null })),
  fishdexTotal: FISHDEX_TOTAL,
  equipSlots: EQUIP_SLOTS.map((s) => ({ id: s.id, name: s.name, effect: s.effect, costs: Array.from({ length: EQUIP_MAX_LEVEL - 1 }, (_, i) => upgradeCost(s.id, i + 2)) })),
  equipTierNames: EQUIP_TIER_NAMES,
  equipMaxLevel: EQUIP_MAX_LEVEL,
  achievements: ACHIEVEMENTS,
  eventKinds: Object.fromEntries(Object.entries(WORLD_EVENT_KINDS).map(([k, v]) => [k, { name: v.name, major: v.major, durationSec: v.durationSec, weather: v.weather ?? null }])),
  commands: COMMANDS,
  giftActions: GIFT_ACTIONS,
  levelXp: Array.from({ length: 101 }, (_, i) => xpForLevel(i))
});
