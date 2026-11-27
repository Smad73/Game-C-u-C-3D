// Danh mục gameplay (dữ liệu thuần, không I/O): loài cá, độ hiếm, trang bị, thành tích, sự kiện, lệnh comment, luật quà mặc định.
// Dùng chung cho luồng chính (WorldCore), PersistenceWorker (tính lại tất định) và gửi cho stage/control qua API.
// Số liệu là đề xuất ban đầu (ARCHITECTURE Phụ lục D) — đã chạy mô phỏng cân bằng ở tests/balance.test.js.

/** Bậc hiếm. weight = trọng số xuất hiện gốc; mult = hệ số điểm/XP. */
export const RARITIES = Object.freeze([
  { id: 'common', tier: 1, name: 'Thường', color: '#cfd8e3', weight: 600, mult: 1 },
  { id: 'uncommon', tier: 2, name: 'Khá', color: '#6fe07a', weight: 250, mult: 1.6 },
  { id: 'rare', tier: 3, name: 'Hiếm', color: '#4aa8ff', weight: 100, mult: 2.8 },
  { id: 'epic', tier: 4, name: 'Sử thi', color: '#b56cff', weight: 35, mult: 5 },
  { id: 'legendary', tier: 5, name: 'Huyền thoại', color: '#ffb02e', weight: 12, mult: 9 },
  { id: 'mythic', tier: 6, name: 'Thần thoại', color: '#ff4d6d', weight: 3, mult: 16 }
]);
export const RARITY_BY_TIER = Object.freeze(Object.fromEntries(RARITIES.map((r) => [r.tier, r])));

/**
 * Loài cá. w = [min, max] gam; pts = điểm gốc; str = sức kéo (0.5..3); tag: 'boss' | 'treasure' | 'event' (không ra ngẫu nhiên thường).
 * shape: kiểu dáng hiển thị trên stage (fish | eel | ray | shark | whale | koi | chest).
 */
export const SPECIES = Object.freeze([
  { id: 1, name: 'Cá Rô', tier: 1, w: [80, 400], pts: 10, str: 0.6, color: '#8a9a5b', shape: 'fish' },
  { id: 2, name: 'Cá Diếc', tier: 1, w: [100, 600], pts: 10, str: 0.6, color: '#b8a27a', shape: 'fish' },
  { id: 3, name: 'Cá Mè', tier: 1, w: [300, 2500], pts: 12, str: 0.8, color: '#9fb3c8', shape: 'fish' },
  { id: 4, name: 'Cá Trê', tier: 1, w: [300, 2000], pts: 12, str: 0.9, color: '#5a5048', shape: 'eel' },
  { id: 5, name: 'Cá Bống', tier: 1, w: [30, 200], pts: 8, str: 0.5, color: '#a08c6c', shape: 'fish' },
  { id: 6, name: 'Cá Chép', tier: 2, w: [800, 6000], pts: 20, str: 1.1, color: '#d08a3c', shape: 'fish' },
  { id: 7, name: 'Cá Lóc', tier: 2, w: [600, 4000], pts: 20, str: 1.2, color: '#4f5a3c', shape: 'eel' },
  { id: 8, name: 'Cá Rô Phi', tier: 2, w: [300, 1800], pts: 18, str: 0.9, color: '#7f8f9c', shape: 'fish' },
  { id: 9, name: 'Lươn Đồng', tier: 2, w: [150, 900], pts: 18, str: 1.0, color: '#6b5a2a', shape: 'eel' },
  { id: 10, name: 'Cá Basa', tier: 3, w: [1500, 9000], pts: 35, str: 1.4, color: '#c9cfd6', shape: 'fish' },
  { id: 11, name: 'Cá Tầm', tier: 3, w: [3000, 25000], pts: 40, str: 1.6, color: '#6d7d8c', shape: 'shark' },
  { id: 12, name: 'Cá Koi Vàng', tier: 3, w: [1000, 7000], pts: 38, str: 1.2, color: '#ffcc33', shape: 'koi' },
  { id: 13, name: 'Cá Đuối Sông', tier: 3, w: [2000, 15000], pts: 40, str: 1.5, color: '#7a6a5a', shape: 'ray' },
  { id: 14, name: 'Cá Hô', tier: 4, w: [10000, 80000], pts: 70, str: 2.0, color: '#8fa0a8', shape: 'fish' },
  { id: 15, name: 'Cá Anh Vũ', tier: 4, w: [2000, 12000], pts: 65, str: 1.7, color: '#e05a5a', shape: 'fish' },
  { id: 16, name: 'Cá Rồng Bạc', tier: 4, w: [1000, 6000], pts: 68, str: 1.6, color: '#e6eef5', shape: 'eel' },
  { id: 17, name: 'Cá Mập Nước Ngọt', tier: 4, w: [8000, 60000], pts: 72, str: 2.1, color: '#5d6d7d', shape: 'shark' },
  { id: 18, name: 'Cá Sấu Hỏa Tiễn', tier: 5, w: [20000, 120000], pts: 120, str: 2.4, color: '#4a6a3a', shape: 'shark' },
  { id: 19, name: 'Cá Rồng Huyết Long', tier: 5, w: [2000, 9000], pts: 125, str: 2.2, color: '#d8203a', shape: 'eel' },
  { id: 20, name: 'Cá Koi Ngọc Bích', tier: 5, w: [3000, 15000], pts: 118, str: 2.1, color: '#2ad4a8', shape: 'koi' },
  { id: 21, name: 'Thủy Quái Hồ Gươm', tier: 6, w: [80000, 400000], pts: 220, str: 2.8, color: '#3a5a4a', shape: 'whale' },
  { id: 22, name: 'Cá Chép Hóa Rồng', tier: 6, w: [20000, 90000], pts: 230, str: 2.9, color: '#ffd700', shape: 'koi' },
  { id: 23, name: 'Cá Voi Ánh Trăng', tier: 6, w: [200000, 900000], pts: 240, str: 3.0, color: '#b8d8ff', shape: 'whale' },
  // Đặc biệt — chỉ xuất hiện qua sự kiện
  { id: 90, name: 'Rương Kho Báu', tier: 4, w: [5000, 20000], pts: 50, str: 1.0, color: '#c8902a', shape: 'chest', tag: 'treasure' },
  { id: 91, name: 'Boss Hắc Long Ngư', tier: 6, w: [500000, 2000000], pts: 400, str: 3.0, color: '#1a1a2a', shape: 'whale', tag: 'boss' },
  { id: 92, name: 'Boss Kim Long Ngư', tier: 6, w: [800000, 3000000], pts: 600, str: 3.0, color: '#ffcf3a', shape: 'whale', tag: 'boss' }
]);
export const SPECIES_BY_ID = Object.freeze(Object.fromEntries(SPECIES.map((s) => [s.id, s])));
export const WILD_SPECIES = Object.freeze(SPECIES.filter((s) => !s.tag));
export const FISHDEX_TOTAL = WILD_SPECIES.length;

/** Trang bị: 4 ô, cấp 1..maxLevel. Hiệu ứng thực tế lên gameplay (xem progression.equipStats). */
export const EQUIP_SLOTS = Object.freeze([
  { id: 'rod', name: 'Cần câu', cmd: ['can', 'cần'], effect: 'Lực kéo +8%/cấp', costBase: 120 },
  { id: 'line', name: 'Dây câu', cmd: ['day', 'dây'], effect: 'Sức chịu căng +10%/cấp', costBase: 100 },
  { id: 'bobber', name: 'Phao', cmd: ['phao'], effect: 'Cá cắn nhanh hơn 6%/cấp', costBase: 80 },
  { id: 'bait', name: 'Mồi', cmd: ['moi', 'mồi'], effect: 'May mắn +4/cấp', costBase: 150 }
]);
export const EQUIP_MAX_LEVEL = 10;
export const EQUIP_TIER_NAMES = Object.freeze(['Tre', 'Gỗ', 'Sắt', 'Đồng', 'Bạc', 'Vàng', 'Bạch kim', 'Kim cương', 'Huyền bí', 'Thần thoại']);

/** Thành tích: kind = catches | species | rarity | level | boss | weight_kg | daily_streak. reward = xu. */
export const ACHIEVEMENTS = Object.freeze([
  { id: 'first_catch', name: 'Mẻ cá đầu tiên', kind: 'catches', need: 1, reward: 20 },
  { id: 'catch_50', name: 'Cần thủ chăm chỉ', kind: 'catches', need: 50, reward: 150 },
  { id: 'catch_500', name: 'Cần thủ lão luyện', kind: 'catches', need: 500, reward: 1000 },
  { id: 'catch_5000', name: 'Huyền thoại bờ hồ', kind: 'catches', need: 5000, reward: 8000 },
  { id: 'dex_5', name: 'Nhà sưu tầm', kind: 'species', need: 5, reward: 100 },
  { id: 'dex_12', name: 'Nhà sinh vật học', kind: 'species', need: 12, reward: 500 },
  { id: 'dex_all', name: 'Bách khoa thủy sản', kind: 'species', need: FISHDEX_TOTAL, reward: 5000 },
  { id: 'rare_1', name: 'Mắt tinh', kind: 'rarity', need: 3, reward: 80 },
  { id: 'epic_1', name: 'Săn cá sử thi', kind: 'rarity', need: 4, reward: 250 },
  { id: 'legend_1', name: 'Truyền kỳ', kind: 'rarity', need: 5, reward: 800 },
  { id: 'mythic_1', name: 'Thần câu', kind: 'rarity', need: 6, reward: 3000 },
  { id: 'level_10', name: 'Cấp 10', kind: 'level', need: 10, reward: 200 },
  { id: 'level_25', name: 'Cấp 25', kind: 'level', need: 25, reward: 800 },
  { id: 'level_50', name: 'Cấp 50', kind: 'level', need: 50, reward: 3000 },
  { id: 'boss_1', name: 'Diệt Boss', kind: 'boss', need: 1, reward: 300 },
  { id: 'boss_10', name: 'Thợ săn Boss', kind: 'boss', need: 10, reward: 2000 },
  { id: 'weight_100', name: 'Tạ cá 100 kg', kind: 'weight_kg', need: 100, reward: 200 },
  { id: 'weight_1000', name: 'Tấn cá', kind: 'weight_kg', need: 1000, reward: 1500 },
  { id: 'daily_7', name: 'Chuyên cần 7 ngày', kind: 'daily_streak', need: 7, reward: 700 }
]);
export const ACHIEVEMENT_BY_ID = Object.freeze(Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a])));

/** Sự kiện thế giới. major = chiếm "kênh lớn" (không chồng nhau ngoài cấu hình). */
export const WORLD_EVENT_KINDS = Object.freeze({
  BOSS: { name: 'Boss xuất hiện', major: true, durationSec: 180 },
  RARE_SURGE: { name: 'Cá hiếm trồi lên', major: false, durationSec: 90 },
  TREASURE: { name: 'Săn kho báu', major: false, durationSec: 90 },
  GOLDEN_HOUR: { name: 'Giờ vàng ×2 điểm', major: false, durationSec: 120 },
  RAIN: { name: 'Mưa rào — cá cắn nhanh', major: false, durationSec: 150, weather: 'rain' },
  STORM: { name: 'Bão — cá to, dễ đứt dây', major: false, durationSec: 120, weather: 'storm' },
  NIGHT: { name: 'Đêm trăng — cá hiếm thức giấc', major: false, durationSec: 180, weather: 'night' }
});

/**
 * Lệnh comment (đã bỏ dấu, chữ thường). Lệnh hợp lệ = tương tác hợp lệ (đánh thức AFK — ARCHITECTURE §1.2).
 * Comment thường không phải lệnh: không đánh thức.
 */
export const COMMANDS = Object.freeze({
  join: ['cau', 'cau ca', '!fish', 'fish', 'tham gia', 'join'],
  reel: ['keo', 'kéo', 'giat', 'pull', 'reel', 'keo di'],
  rank: ['hang', 'top', 'rank', 'xep hang'],
  bag: ['tui', 'so tay', 'fishdex', 'bag', 'ho so'],
  daily: ['diem danh', 'qua ngay', 'daily', 'nhan qua'],
  upgrade: ['nang', 'upgrade', 'nang cap'],
  boss: ['boss', 'danh boss', 'danh'],
  zone: ['khu', 'doi khu', 'sang khu', 'zone']
});

/**
 * Các khu câu trên bản đồ (ADR-0026). Người chơi tự đổi khu bằng chat "khu <số|tên>" ("đổi khu" = sang khu kế tiếp).
 * Quà → camera cắt tới khu của người tặng (ZoneDirector). `words`: từ khoá đã bỏ dấu, khớp đúng hoặc tiền tố.
 */
export const ZONES = Object.freeze([
  { id: 'cau', name: 'Cầu Chính', words: ['1', 'cau chinh', 'cau'] },
  { id: 'ben', name: 'Bến Đá', words: ['2', 'ben da', 'ben', 'da'] },
  { id: 'sau', name: 'Hồ Sâu', words: ['3', 'ho sau', 'sau', 'be'] },
  { id: 'dao', name: 'Đảo Ngọc', words: ['4', 'dao ngoc', 'dao', 'ngoc'] }
]);
export const ZONE_BY_ID = Object.freeze(Object.fromEntries(ZONES.map((z) => [z.id, z])));

/** Loại hành động quà gán được (Gift Mapping). Mỗi hành động nhân theo số lượng quà đã áp dụng (qty). */
export const GIFT_ACTIONS = Object.freeze({
  cast: { name: 'Ném cần ngay (đánh thức + quăng)', params: {} },
  xp: { name: 'Cộng XP', params: { amount: 'int' } },
  coins: { name: 'Cộng xu', params: { amount: 'int' } },
  luck: { name: 'Tăng may mắn (phút)', params: { pct: 'int', minutes: 'int' } },
  power: { name: 'Tăng lực kéo (phút)', params: { pct: 'int', minutes: 'int' } },
  rare_next: { name: 'Cá hiếm ở lượt sau', params: { minTier: 'int', count: 'int' } },
  boss: { name: 'Triệu hồi Boss', params: { level: 'int' } },
  event: { name: 'Kích hoạt sự kiện', params: { kind: 'enum:RARE_SURGE|TREASURE|GOLDEN_HOUR|RAIN|STORM|NIGHT' } },
  help_all: { name: 'Buff may mắn cho cả hồ (phút)', params: { pct: 'int', minutes: 'int' } },
  score: { name: 'Cộng điểm BXH', params: { amount: 'int' } }
});

/**
 * Luật quà mặc định (sửa được ở Control; lưu trong DB settings 'gift.rules'). Khớp theo giftId; `default` cho quà chưa gán.
 * Mỗi quà gán được NHIỀU hành động; `show` bật/tắt banner. coinFactor: xu = diamond × coinFactor (tối thiểu cho mọi quà).
 */
export const DEFAULT_GIFT_RULES = Object.freeze({
  version: 1,
  coinFactor: 20, // xu gốc = √kim cương × coinFactor
  xpFactor: 15,   // XP gốc = √kim cương × xpFactor
  maxBuffMinutes: 60,
  rules: [
    { giftId: 5655, label: 'Rose', show: true, enabled: true, actions: [{ type: 'cast' }, { type: 'luck', pct: 10, minutes: 1 }] },
    { giftId: 5269, label: 'TikTok', show: true, enabled: true, actions: [{ type: 'cast' }, { type: 'xp', amount: 30 }] },
    { giftId: 5487, label: 'Finger Heart', show: true, enabled: true, actions: [{ type: 'power', pct: 30, minutes: 2 }, { type: 'xp', amount: 50 }] },
    { giftId: 7934, label: 'Heart Me', show: true, enabled: true, actions: [{ type: 'cast' }, { type: 'coins', amount: 20 }] },
    { giftId: 5760, label: 'Weights', show: true, enabled: true, actions: [{ type: 'power', pct: 50, minutes: 1 }] },
    { giftId: 6064, label: 'GG', show: true, enabled: true, actions: [{ type: 'rare_next', minTier: 3, count: 1 }] },
    { giftId: 8913, label: 'Rosa Nebula', show: true, enabled: true, actions: [{ type: 'event', kind: 'RARE_SURGE' }, { type: 'rare_next', minTier: 4, count: 1 }] },
    { giftId: 6427, label: 'Hat and Mustache', show: true, enabled: true, actions: [{ type: 'event', kind: 'TREASURE' }, { type: 'help_all', pct: 20, minutes: 2 }] },
    { giftId: 6369, label: 'Lion', show: true, enabled: true, actions: [{ type: 'boss', level: 3 }, { type: 'rare_next', minTier: 6, count: 1 }] }
  ],
  default: { show: true, enabled: true, actions: [{ type: 'cast' }] },
  interactions: {
    like: { luckPct: 2, minutes: 1, everyLikes: 50 },
    follow: { coins: 30 },
    share: { coins: 20, xp: 20 },
    join: { greet: true }
  }
});

export const DIFFICULTY = Object.freeze({
  castMs: 1400,
  waitMinMs: 3500,
  waitMaxMs: 11000,
  biteMs: 900,
  fightMinMs: 2500,
  showResultMs: 2200,
  afkMs: 5 * 60 * 1000
});
