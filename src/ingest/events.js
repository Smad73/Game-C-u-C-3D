// Hợp đồng sự kiện của tầng Ingest (ADR-0003, ADR-0006). Dùng chung cho LiveConnector, MockConnector, LoadGenerator.
//
// 1) RawEvent — thứ MỌI connector phát ra (cùng một giao diện nội bộ; Mock không có đường xử lý riêng):
//    { type, msgId?, createTime?, roomId?, user?:{userId, uniqueId, nickname}, comment?, giftId?, giftName?, diamondCount?,
//      giftType?, repeatCount?, repeatEnd?, groupId?, likeCount?, totalLikeCount? }
//    LiveConnector chịu trách nhiệm ánh xạ dữ liệu của thư viện TikTok → RawEvent (xem LiveConnector.mapLibraryEvent).
// 2) NovaEvent — schema nội bộ sau Normalizer (schema_version 1), xem Normalizer.js.

export const SCHEMA_VERSION = 1;

/** Loại RawEvent mà connector được phép phát. */
export const RAW_TYPES = Object.freeze(['chat', 'gift', 'like', 'follow', 'share', 'member', 'streamEnd']);

/** Loại NovaEvent nội bộ. */
export const EVENT_TYPES = Object.freeze({
  COMMENT: 'comment',
  GIFT: 'gift',
  LIKE: 'like',
  FOLLOW: 'follow',
  SHARE: 'share',
  JOIN: 'join',
  STREAM_END: 'stream_end'
});

const RAW_TO_EVENT = Object.freeze({ chat: 'comment', gift: 'gift', like: 'like', follow: 'follow', share: 'share', member: 'join', streamEnd: 'stream_end' });
export const rawToEventType = (t) => RAW_TO_EVENT[t] ?? null;

/**
 * Lớp ưu tiên trong PriorityEventQueue (ADR-0019 bảng lớp; tên theo Phase 2 prompt).
 * critical: quà, kết thúc LIVE — không bao giờ bị chủ động bỏ (quà còn được journal bền ở DB trước khi vào hàng đợi).
 * progress: comment/lệnh, tham gia. state: like/follow/share (gộp được). log: thống kê.
 */
export const EVENT_CLASS = Object.freeze({ gift: 'critical', stream_end: 'critical', comment: 'progress', join: 'progress', like: 'state', follow: 'state', share: 'state' });

/** Nguồn → realm (ADR-0021 mục 2: realm do LOẠI connector quyết định, không do nội dung sự kiện). */
export const SOURCE_REALM = Object.freeze({ tiktok: 'live', mock: 'demo', loadgen: 'demo' });

export const playerKeyFor = (realm, userId) => (realm === 'live' ? `tt:${userId}` : `demo:${userId}`);
