// Normalizer — RawEvent (từ mọi connector) → NovaEvent (schema nội bộ v1). Hàm thuần, không I/O, không đụng gameplay.
// Dữ liệu TikTok KHÔNG đáng tin: chỉ giữ chuỗi đã làm sạch (NFC, bỏ ký tự điều khiển, giới hạn độ dài), không bao giờ coi là HTML/JS.
//
// NovaEvent: { schema_version, event_id, event_type, realm, room_id, player_key, source, source_event_id, id_quality,
//              received_at, occurred_at, processed_at (gán khi xử lý), user, payload, flags[] }
// Ba mốc thời gian tách biệt: occurred_at (TikTok cung cấp, có thể null/bất thường) · received_at (NOVA nhận từ connector)
//                              · processed_at (NOVA xử lý — đường ống gán).
import { createHash, randomUUID } from 'node:crypto';
import { EVENT_TYPES as T, SCHEMA_VERSION, playerKeyFor, rawToEventType } from './events.js';

export const NORMALIZE_LIMITS = Object.freeze({
  maxRawBytes: 16 * 1024, comment: 500, nickname: 128, uniqueId: 64, userId: 32, giftName: 128, msgId: 128, groupId: 64, roomId: 64,
  maxRepeatCount: 100000, maxDiamond: 100000000, maxLikeCount: 100000,
  futureSkewMs: 5 * 60 * 1000, pastSkewMs: 24 * 60 * 60 * 1000
});
const L = NORMALIZE_LIMITS;

export class NormalizeError extends Error {
  constructor(code, message) { super(message); this.name = 'NormalizeError'; this.code = code; }
}
const bad = (code, msg) => { throw new NormalizeError(code, msg); };

// Bỏ ký tự điều khiển C0/C1, ký tự định hướng (bidi override) và ký tự vô hình hay bị lạm dụng; giữ emoji và tiếng Việt.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

/** Làm sạch chuỗi văn bản người dùng. Trả null nếu rỗng sau làm sạch. */
export function cleanText(v, max) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') v = String(v);
  let s = v.normalize('NFC').replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length > max) s = Array.from(s).slice(0, max).join(''); // không cắt giữa cặp surrogate
  return s;
}

/** ID dạng số/chữ an toàn (TikTok dùng chuỗi số rất dài, vượt Number.MAX_SAFE_INTEGER → luôn giữ dạng chuỗi). */
function cleanId(v, max) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') { if (!Number.isSafeInteger(v) || v < 0) return null; v = String(v); }
  if (typeof v === 'bigint') v = v.toString();
  if (typeof v !== 'string') return null;
  v = v.trim();
  return /^[A-Za-z0-9_.:-]{1,}$/.test(v) && v.length <= max ? v : null;
}

function cleanInt(v, { min = 0, max }) {
  if (typeof v === 'string' && /^\d{1,15}$/.test(v)) v = Number(v);
  return Number.isSafeInteger(v) && v >= min && v <= max ? v : null;
}

/** Thời điểm TikTok cung cấp (ms hoặc giây). Bất thường (quá xa tương lai/quá khứ) → null + cờ. */
function occurredAt(v, receivedAt, flags) {
  if (v === undefined || v === null || v === '') return null;
  let n = typeof v === 'string' && /^\d{9,15}$/.test(v) ? Number(v) : v;
  if (!Number.isSafeInteger(n) || n <= 0) { flags.push('TS_INVALID'); return null; }
  if (n < 1e11) n *= 1000; // giây → ms
  if (n > receivedAt + L.futureSkewMs || n < receivedAt - L.pastSkewMs) { flags.push('TS_ANOMALY'); return null; }
  return n;
}

export const shortHash = (...parts) => createHash('sha256').update(parts.map((p) => String(p ?? '')).join('\u241f')).digest('hex').slice(0, 24);

/**
 * Khoá idempotency của quà (ADR-0018). Trả { gift_key, key_mode, key_quality, streak_key, applicable, reason }.
 *  - Quà streak (giftType 1) có groupId: S:<player>:<giftId>:<groupId>:<repeatCount> — STRONG; áp dụng phần tăng.
 *  - Quà streak thiếu groupId: không thể phân biệt các streak khác nhau → CHỈ tính ở sự kiện repeatEnd (quantity = repeatCount),
 *    khoá H: (WEAK); sự kiện giữa chừng được journal là REJECTED (STREAK_NO_GROUP_INTERMEDIATE) để không cộng chồng 1+2+3…
 *  - Quà thường có msgId: M:<msgId> — STRONG. Thiếu msgId: H:hash(player, giftId, repeatCount, createTime) — WEAK.
 */
export function giftKeyFor({ playerKey, userId, giftId, giftType, groupId, repeatCount, repeatEnd, msgId, createTime }) {
  const who = playerKey ?? `anon:${userId ?? ''}`;
  if (giftType === 1) {
    if (groupId) {
      const streakKey = `${who}:${giftId}:${groupId}`;
      return { gift_key: `S:${streakKey}:${repeatCount}`, key_mode: 'S', key_quality: 'STRONG', streak_key: streakKey, applicable: true, reason: null };
    }
    const k = `H:${shortHash(who, giftId, repeatCount, createTime, repeatEnd ? 'end' : 'mid', msgId)}`;
    return repeatEnd
      ? { gift_key: k, key_mode: 'H', key_quality: 'WEAK', streak_key: null, applicable: true, reason: 'STREAK_NO_GROUP_END_ONLY' }
      : { gift_key: k, key_mode: 'H', key_quality: 'WEAK', streak_key: null, applicable: false, reason: 'STREAK_NO_GROUP_INTERMEDIATE' };
  }
  if (msgId) return { gift_key: `M:${msgId}`, key_mode: 'M', key_quality: 'STRONG', streak_key: null, applicable: true, reason: null };
  return { gift_key: `H:${shortHash(who, giftId, repeatCount, createTime)}`, key_mode: 'H', key_quality: 'WEAK', streak_key: null, applicable: true, reason: 'NO_MSG_ID' };
}

/**
 * @param {object} raw RawEvent
 * @param {{receivedAt:number, source:string, realm:'live'|'demo', roomId?:string|null}} meta (realm do connector quyết định)
 * @returns NovaEvent — ném NormalizeError nếu không dùng được.
 */
export function normalize(raw, meta) {
  if (!meta || (meta.realm !== 'live' && meta.realm !== 'demo')) bad('NO_REALM', 'thiếu realm (do connector cung cấp)');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad('INVALID_PAYLOAD', 'sự kiện không phải đối tượng');
  let size;
  try { size = Buffer.byteLength(JSON.stringify(raw)); } catch { bad('INVALID_PAYLOAD', 'sự kiện không tuần tự hoá được'); }
  if (size > L.maxRawBytes) bad('PAYLOAD_TOO_LARGE', `sự kiện ${size} byte > ${L.maxRawBytes}`);
  const type = rawToEventType(raw.type);
  if (!type) bad('UNKNOWN_EVENT', `loại sự kiện không hỗ trợ: ${String(raw.type).slice(0, 30)}`);

  const flags = [];
  const receivedAt = Number.isSafeInteger(meta.receivedAt) ? meta.receivedAt : Date.now();
  const msgId = cleanId(raw.msgId, L.msgId);
  const ev = {
    schema_version: SCHEMA_VERSION,
    event_id: randomUUID(),
    event_type: type,
    realm: meta.realm,
    room_id: cleanId(raw.roomId ?? meta.roomId, L.roomId),
    player_key: null,
    source: meta.source,
    source_event_id: msgId,
    id_quality: msgId ? 'STRONG' : 'NONE',
    received_at: receivedAt,
    occurred_at: occurredAt(raw.createTime, receivedAt, flags),
    processed_at: null,
    user: null,
    payload: {},
    flags
  };

  if (type === T.STREAM_END) return ev;

  // Người dùng: userId là khoá ổn định (ADR-0021); uniqueId/nickname chỉ để hiển thị.
  const u = raw.user && typeof raw.user === 'object' ? raw.user : null;
  const userId = cleanId(u?.userId, L.userId);
  if (u && u.userId !== undefined && u.userId !== null && !userId) flags.push('INVALID_USER_ID');
  ev.user = userId ? { userId, uniqueId: cleanText(u.uniqueId, L.uniqueId), nickname: cleanText(u.nickname, L.nickname) } : null;
  ev.player_key = userId ? playerKeyFor(meta.realm, userId) : null;

  switch (type) {
    case T.COMMENT: {
      const text = cleanText(raw.comment, L.comment);
      if (!text) bad('INVALID_PAYLOAD', 'comment rỗng');
      if (!ev.player_key) bad('INVALID_USER', 'comment không có userId');
      ev.payload = { text };
      break;
    }
    case T.LIKE: {
      if (!ev.player_key) bad('INVALID_USER', 'like không có userId');
      const n = cleanInt(raw.likeCount ?? 1, { min: 1, max: L.maxLikeCount });
      if (n === null) bad('INVALID_PAYLOAD', 'likeCount không hợp lệ');
      ev.payload = { count: n, total: cleanInt(raw.totalLikeCount, { max: Number.MAX_SAFE_INTEGER }) };
      break;
    }
    case T.FOLLOW: case T.SHARE: case T.JOIN:
      if (!ev.player_key) bad('INVALID_USER', `${type} không có userId`);
      break;
    case T.GIFT: {
      const giftId = cleanInt(raw.giftId, { min: 1, max: Number.MAX_SAFE_INTEGER });
      if (giftId === null) bad('INVALID_GIFT', 'giftId không hợp lệ');
      const repeatCount = cleanInt(raw.repeatCount ?? 1, { min: 1, max: L.maxRepeatCount });
      if (repeatCount === null) bad('INVALID_GIFT', 'repeatCount không hợp lệ');
      const diamond = cleanInt(raw.diamondCount, { max: L.maxDiamond });
      if (raw.diamondCount !== undefined && diamond === null) flags.push('INVALID_DIAMOND');
      const giftType = cleanInt(raw.giftType, { max: 100 });
      const groupId = cleanId(raw.groupId, L.groupId);
      const repeatEnd = raw.repeatEnd === true || raw.repeatEnd === 1;
      const key = giftKeyFor({ playerKey: ev.player_key, userId, giftId, giftType, groupId, repeatCount, repeatEnd, msgId, createTime: raw.createTime });
      if (key.key_quality === 'WEAK') flags.push('WEAK_GIFT_KEY');
      ev.payload = {
        giftId, giftName: cleanText(raw.giftName, L.giftName), diamondCount: diamond, giftType, groupId, repeatCount, repeatEnd,
        // Quà thường/H-end: số lượng = repeatCount. Quà streak (S): Worker chỉ cộng phần tăng so với mốc đã áp dụng.
        quantity: repeatCount,
        ...key
      };
      if (!ev.player_key) { ev.payload.applicable = false; ev.payload.reason = 'NO_USER_ID'; } // ADR-0021 mục 5: vẫn journal, REJECTED
      break;
    }
    default: break;
  }
  return ev;
}
