// LiveConnector — adapter DUY NHẤT chạm thư viện TikTok (ADR-0003). Chỉ: kết nối, ánh xạ sự kiện thư viện → RawEvent, báo vòng đời.
// Dedupe/journal/hàng đợi nằm ở tầng sau (IngestPipeline, GiftJournal) — đổi thư viện không phải sửa game.
//
// Thư viện được kiến trúc ghim: tiktok-live-connector@2.5.0 (KHÔNG chính thức, có thể hỏng khi TikTok đổi giao thức).
// TRẠNG THÁI 2026-11-25: CHƯA CÀI. Lý do (P0, chờ người dùng quyết định): giấy phép AGPL-3.0-only (+ tiktok-live-proto AGPL)
// mâu thuẫn với kế hoạch bán sản phẩm; bản 2.x dùng dịch vụ ký bên thứ ba Euler Stream (tiktok-live-api-sdk) — gửi dữ liệu ra ngoài.
// Vì vậy thư viện được nạp TRỄ (dynamic import) và qua `libraryLoader` để test được bằng thư viện giả.
// Ánh xạ trường dưới đây viết phòng thủ cho cả dạng phẳng (1.x) lẫn dạng lồng protobuf (2.x) — CHƯA KIỂM CHỨNG trên LIVE thật (Module 10).
import { ConnectorBase, ConnectorError } from './ConnectorBase.js';

export const LIBRARY = Object.freeze({ name: 'tiktok-live-connector', version: '2.5.0', license: 'AGPL-3.0-only', status: 'INSTALLED_UNVERIFIED' });

/**
 * Nhà cung cấp kết nối. A17 (người dùng chốt 2026-11-25, ADR-0025): mặc định tiktok-live-connector@2.5.0 (đã cài, ghim chính xác) như các game trước.
 * @tiktool/live giữ làm phương án dự phòng (CHƯA cài). Tra npm registry 2026-11-25:
 *  - tiktok-live-connector@2.5.0: AGPL-3.0-only (+ tiktok-live-proto AGPL); 2.x ký qua dịch vụ Euler Stream.
 *  - @tiktool/live@2.20.0: MIT, phụ thuộc duy nhất `ws` (MIT); BẮT BUỘC API key trả phí/dùng thử của tik.tools (dịch vụ ký bên thứ ba).
 * Khoá API là BÍ MẬT: chỉ đọc từ biến môi trường NOVA_TIKTOOL_API_KEY, không ghi vào mã/cấu hình/log.
 * Ánh xạ sự kiện của cả hai CHƯA KIỂM CHỨNG trên LIVE thật (Module 10).
 */
export const PROVIDERS = Object.freeze({
  'tiktok-live-connector': { pkg: 'tiktok-live-connector', version: '2.5.0', license: 'AGPL-3.0-only', needsKey: false, note: 'AGPL — người dùng chấp nhận (A17/ADR-0025), như các game trước' },
  tiktool: { pkg: '@tiktool/live', version: '2.20.0', license: 'MIT', needsKey: true, keyEnv: 'NOVA_TIKTOOL_API_KEY', note: 'MIT, cần API key tik.tools (dịch vụ trả phí, có dùng thử 7 ngày)' }
});

/** Ánh xạ sự kiện @tiktool/live → RawEvent (theo README 2.20.0; CHƯA KIỂM CHỨNG trên LIVE thật). */
export function mapTiktoolEvent(type, d) {
  if (type === 'control') return d?.action === 3 || d?.action === 'end' ? { type: 'streamEnd', createTime: Date.now() } : null;
  if (type === 'social') {
    const a = String(d?.action ?? '').toLowerCase();
    const t = a === '1' || a.includes('follow') ? 'follow' : a === '3' || a.includes('share') ? 'share' : null;
    return t ? mapLibraryEvent(t, d) : null;
  }
  if (type === 'gift') {
    const r = mapLibraryEvent('gift', d);
    if (r && r.repeatEnd === undefined && d?.combo === false) r.repeatEnd = true;
    return r;
  }
  return ['chat', 'like', 'member'].includes(type) ? mapLibraryEvent(type, d) : null;
}
const TIKTOOL_EVENTS = ['chat', 'gift', 'like', 'member', 'social', 'control'];

const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
const str = (v) => (v === undefined || v === null ? undefined : typeof v === 'object' && typeof v.toString === 'function' && !Array.isArray(v) ? String(v) : String(v));

/** Ánh xạ dữ liệu sự kiện của thư viện → RawEvent. Hàm thuần (test bằng fixture). Trả null nếu không dùng được. */
export function mapLibraryEvent(type, d) {
  if (!d || typeof d !== 'object') return type === 'streamEnd' ? { type: 'streamEnd', createTime: Date.now() } : null;
  const common = d.common || d.baseMessage || {};
  const u = d.user || d.userDetails || {};
  const user = {
    userId: str(pick(u.userId, u.id, d.userId)),
    uniqueId: pick(u.uniqueId, u.displayId, d.uniqueId),
    nickname: pick(u.nickname, d.nickname)
  };
  const base = { msgId: str(pick(d.msgId, common.msgId)), createTime: pick(d.createTime, common.createTime, common.clientSendTime), roomId: str(pick(d.roomId, common.roomId)), user };
  switch (type) {
    case 'chat': return { type: 'chat', ...base, comment: pick(d.comment, d.content) };
    case 'gift': {
      const gd = d.giftDetails || d.gift || {};
      return {
        type: 'gift', ...base,
        giftId: pick(d.giftId, gd.id, gd.giftId), giftName: pick(d.giftName, gd.giftName, gd.name), diamondCount: pick(d.diamondCount, gd.diamondCount),
        giftType: pick(d.giftType, gd.giftType, gd.type), repeatCount: pick(d.repeatCount, d.comboCount), repeatEnd: pick(d.repeatEnd, d.isComboEnd),
        groupId: str(pick(d.groupId, d.sendGiftReqStartMs))
      };
    }
    case 'like': return { type: 'like', ...base, likeCount: pick(d.likeCount, d.count), totalLikeCount: pick(d.totalLikeCount, d.total) };
    case 'follow': return { type: 'follow', ...base };
    case 'share': return { type: 'share', ...base };
    case 'member': return { type: 'member', ...base };
    case 'streamEnd': return { type: 'streamEnd', createTime: Date.now() };
    default: return null;
  }
}

const EVENTS = ['chat', 'gift', 'like', 'follow', 'share', 'member', 'streamEnd'];

export class LiveConnector extends ConnectorBase {
  /** @param {{username:string, libraryLoader?:()=>Promise<object>, connectionOptions?:object}} o */
  constructor({ username, provider = 'tiktok-live-connector', apiKey = null, libraryLoader = null, connectionOptions = {}, ...base }) {
    super({ source: 'tiktok', username, ...base });
    if (!username || !/^[A-Za-z0-9._]{2,24}$/.test(username)) throw new Error('username TikTok không hợp lệ');
    if (!PROVIDERS[provider]) throw new Error(`nhà cung cấp kết nối không hợp lệ: ${provider}`);
    this.provider = provider;
    this.apiKey = apiKey; // không log, không trả qua API
    this.libraryLoader = libraryLoader ?? (() => import(PROVIDERS[provider].pkg));
    this.connectionOptions = connectionOptions;
    this.conn = null;
  }

  async _open() {
    let lib;
    const P = PROVIDERS[this.provider];
    try { lib = await this.libraryLoader(); } catch (e) {
      throw new ConnectorError('LIBRARY_NOT_INSTALLED', `Chưa cài thư viện ${P.pkg}@${P.version} (chạy "npm ci" để cài lại). ${e?.code || ''}`.trim(), { transient: false });
    }
    if (this.provider === 'tiktool') return this.#openTiktool(lib);
    const Cls = lib.TikTokLiveConnection || lib.WebcastPushConnection || lib.default?.TikTokLiveConnection;
    if (!Cls) throw new ConnectorError('LIBRARY_API', 'Thư viện không có lớp kết nối mong đợi (API đã đổi?)', { transient: false });
    const conn = new Cls(this.username, { processInitialData: false, enableExtendedGiftInfo: true, ...this.connectionOptions });
    this.conn = conn;
    for (const t of EVENTS) {
      conn.on(t, (d) => {
        if (this.conn !== conn) return;
        const raw = mapLibraryEvent(t, d);
        if (raw) this._emitRaw(raw);
      });
    }
    conn.on('disconnected', () => { if (this.conn === conn) this._dropped(new Error('thư viện báo mất kết nối')); });
    conn.on('error', (e) => { if (this.conn === conn) this._error(e); });
    let state;
    try {
      state = await conn.connect();
    } catch (e) {
      this.conn = null;
      const msg = String(e?.message || e);
      if (/offline|not live|isn'?t online|LIVE has ended|user_not_found/i.test(msg)) throw new ConnectorError('NOT_LIVE', `Tài khoản không đang phát LIVE: ${msg.slice(0, 160)}`, { transient: false });
      throw new ConnectorError('CONNECT_FAILED', msg.slice(0, 200), { transient: true });
    }
    return { roomId: str(pick(state?.roomId, conn.roomId, state?.roomInfo?.id)) ?? null };
  }

  async #openTiktool(lib) {
    if (!this.apiKey) throw new ConnectorError('API_KEY_MISSING', 'Thiếu API key tik.tools: đặt biến môi trường NOVA_TIKTOOL_API_KEY rồi khởi động lại.', { transient: false });
    const Cls = lib.TikTokLive || lib.default?.TikTokLive;
    if (!Cls) throw new ConnectorError('LIBRARY_API', 'Thư viện @tiktool/live không có lớp TikTokLive (API đã đổi?)', { transient: false });
    // Tự nối lại của thư viện TẮT: chỉ ConnectorBase quyết định nối lại (luật NOVA: LIVE kết thúc → không nối lại/poll).
    const conn = new Cls({ uniqueId: this.username, apiKey: this.apiKey, autoReconnect: false, ...this.connectionOptions });
    this.conn = conn;
    for (const t of TIKTOOL_EVENTS) {
      conn.on(t, (d) => {
        if (this.conn !== conn) return;
        const raw = mapTiktoolEvent(t, d);
        if (raw) this._emitRaw(raw);
      });
    }
    conn.on('disconnected', () => { if (this.conn === conn) this._dropped(new Error('thư viện báo mất kết nối')); });
    conn.on('error', (e) => { if (this.conn === conn) this._error(e); });
    try {
      await conn.connect();
    } catch (e) {
      this.conn = null;
      const msg = String(e?.message || e).replace(this.apiKey, '***');
      if (/offline|not live|ended|not found/i.test(msg)) throw new ConnectorError('NOT_LIVE', `Tài khoản không đang phát LIVE: ${msg.slice(0, 160)}`, { transient: false });
      if (/401|403|api ?key|rate/i.test(msg)) throw new ConnectorError('PROVIDER_AUTH', `Dịch vụ tik.tools từ chối (khoá/giới hạn gói): ${msg.slice(0, 160)}`, { transient: false });
      throw new ConnectorError('CONNECT_FAILED', msg.slice(0, 200), { transient: true });
    }
    return { roomId: conn.roomId ? String(conn.roomId) : null };
  }

  async _close() {
    const c = this.conn;
    this.conn = null;
    if (c) { try { c.removeAllListeners?.(); await c.disconnect?.(); } catch { /* bỏ qua */ } }
  }
}
