// Phase 2 — Module 01 (ConnectorBase/vòng đời), 02 (MockConnector), 03 (Normalizer). Không cần mạng, không cần thư viện TikTok.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectorBase, ConnectorError, backoffDelay } from '../src/ingest/ConnectorBase.js';
import { MockConnector, seededRandom } from '../src/ingest/MockConnector.js';
import { NormalizeError, cleanText, giftKeyFor, normalize } from '../src/ingest/Normalizer.js';
import { sleep, waitFor } from './helpers.js';

const fastRetry = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: 0 };
const meta = (o = {}) => ({ receivedAt: Date.now(), source: 'mock', realm: 'demo', roomId: 'r1', ...o });

// ───────── Module 01: vòng đời kết nối ─────────
class FlakyConnector extends ConnectorBase {
  constructor(o) { super({ source: 'tiktok', reconnect: fastRetry, ...o }); this.opens = 0; this.failFirst = o.failFirst ?? 0; this.hard = o.hard; }
  async _open() {
    this.opens++;
    await sleep(5);
    if (this.hard) throw new ConnectorError('NOT_LIVE', 'phòng không phát', { transient: false });
    if (this.opens <= this.failFirst) throw new ConnectorError('NETWORK', 'mạng', { transient: true });
    return { roomId: 'room-777' };
  }
}

test('backoff: tăng theo cấp số nhân, có trần, jitter trong biên', () => {
  const c = { baseDelayMs: 1000, maxDelayMs: 30000, jitter: 0 };
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, c)), [1000, 2000, 4000, 8000, 16000, 30000]);
  const j = { ...c, jitter: 0.2 };
  for (let i = 0; i < 200; i++) { const d = backoffDelay(3, j); assert.ok(d >= 3200 && d <= 4800, `${d}`); }
});

test('connector: connect() gọi nhiều lần KHÔNG tạo kết nối trùng; thành công trả roomId', async () => {
  const c = new FlakyConnector({});
  const [a, b, d] = await Promise.all([c.connect(), c.connect(), c.connect()]);
  assert.equal(c.opens, 1, 'chỉ mở một kết nối');
  assert.deepEqual([a.roomId, b.roomId, d.roomId], ['room-777', 'room-777', 'room-777']);
  assert.equal(c.state, 'CONNECTED');
  await c.disconnect();
  assert.equal(c.state, 'STOPPED');
});

test('connector: lỗi tạm thời → nối lại có giới hạn với backoff; quá số lần → FAILED', async () => {
  const ok = new FlakyConnector({ failFirst: 2 });
  const retries = [];
  ok.on('retry', (r) => retries.push(r.attempt));
  await ok.connect();
  assert.deepEqual(retries, [1, 2]);
  assert.equal(ok.state, 'CONNECTED');
  const bad = new FlakyConnector({ failFirst: 99 });
  await assert.rejects(bad.connect(), (e) => e instanceof ConnectorError);
  assert.equal(bad.state, 'FAILED');
  assert.equal(bad.opens, fastRetry.maxAttempts + 1, 'đúng 1 lần đầu + maxAttempts lần nối lại, không poll thêm');
  await sleep(100);
  assert.equal(bad.opens, fastRetry.maxAttempts + 1, 'không thử tiếp sau FAILED');
});

test('connector: phòng không phát (lỗi không tạm thời) → ENDED ngay, không thử lại', async () => {
  const c = new FlakyConnector({ hard: true });
  await assert.rejects(c.connect());
  assert.equal(c.state, 'ENDED');
  await sleep(50);
  assert.equal(c.opens, 1);
});

test('mock: rớt mạng khi đang LIVE → RECONNECTING → nối lại cùng roomId; sự kiện trong lúc mất kết nối bị bỏ (đếm)', async () => {
  const m = new MockConnector({ reconnect: fastRetry, scenario: { disconnectForMs: 25 } });
  const states = [];
  m.on('state', (s) => states.push(s.state));
  await m.connect();
  m.simulateDrop(25);
  assert.equal(m.state, 'RECONNECTING');
  assert.equal(m.inject({ type: 'chat', msgId: '1', user: { userId: '1' }, comment: 'x' }), false, 'không chuyển tiếp khi chưa kết nối');
  await waitFor(() => m.state === 'CONNECTED', { what: 'nối lại' });
  assert.equal(m.roomId, 'mock-room-1');
  assert.ok(states.includes('RECONNECTING'));
  assert.equal(m.stats.reconnects, 1);
  assert.equal(m.stats.droppedNotConnected, 1);
  await m.disconnect();
});

test('mock: streamEnd → ENDED, không nối lại, sự kiện đến sau bị bỏ; connect() lại chỉ khi người vận hành gọi', async () => {
  const m = new MockConnector({ reconnect: fastRetry });
  const raws = [];
  m.on('raw', (r) => raws.push(r.type));
  await m.connect();
  m.inject({ type: 'chat', msgId: '1', user: { userId: '1' }, comment: 'a' });
  m.simulateStreamEnd();
  assert.equal(m.state, 'ENDED');
  assert.equal(m.inject({ type: 'chat', msgId: '2', user: { userId: '1' }, comment: 'b' }), false);
  await sleep(60);
  assert.equal(m.state, 'ENDED', 'không tự nối lại sau streamEnd');
  assert.deepEqual(raws, ['chat', 'streamEnd']);
  await m.connect();
  assert.equal(m.state, 'CONNECTED');
  await m.disconnect();
});

test('mock: realm luôn là demo; nguồn tiktok không dùng được cho Mock', () => {
  assert.equal(new MockConnector().realm, 'demo');
  assert.equal(new MockConnector({ source: 'loadgen' }).realm, 'demo');
  assert.throws(() => new MockConnector({ source: 'tiktok' }));
});

test('mock: kịch bản theo tốc độ sinh comment/gift/like/follow/share/join + streak, tất định theo seed', async () => {
  const run = async () => {
    const m = new MockConnector({ scenario: { seed: 42, commentsPerSec: 200, giftsPerSec: 40, likesPerSec: 100, followsPerSec: 20, sharesPerSec: 20, joinsPerSec: 20, streakStepMs: 5 } });
    const n = {};
    m.on('raw', (r) => { n[r.type] = (n[r.type] || 0) + 1; });
    await m.connect();
    await sleep(520);
    await m.disconnect();
    return n;
  };
  const a = await run();
  for (const k of ['chat', 'gift', 'like', 'follow', 'share', 'member']) assert.ok(a[k] > 0, `có sự kiện ${k}`);
  assert.ok(a.chat >= 80 && a.chat <= 120, `≈100 comment trong 0,5 s (thực tế ${a.chat})`);
  assert.equal(seededRandom(5)(), seededRandom(5)());
});

test('mock: streak 1..N kèm repeatEnd; có thể thiếu repeatEnd / thiếu groupId theo cấu hình', async () => {
  const m = new MockConnector({ scenario: { streakStepMs: 2, missingRepeatEndRate: 0 } });
  const gifts = [];
  m.on('raw', (r) => r.type === 'gift' && gifts.push(r));
  await m.connect();
  m.gift({ userId: '9', giftIndex: 0, count: 5, streak: true });
  await waitFor(() => gifts.length === 6, { what: '5 bước + repeatEnd' });
  assert.deepEqual(gifts.map((g) => g.repeatCount), [1, 2, 3, 4, 5, 5]);
  assert.deepEqual(gifts.map((g) => g.repeatEnd), [false, false, false, false, false, true]);
  assert.equal(new Set(gifts.map((g) => g.groupId)).size, 1);
  await m.disconnect();
});

// ───────── Module 03: Normalizer ─────────
test('normalize: schema thống nhất, 3 mốc thời gian tách biệt, player_key theo realm của connector', () => {
  const now = Date.now();
  const ev = normalize({ type: 'chat', msgId: '7123', createTime: String(now - 1500), user: { userId: '6812345678901234567', uniqueId: 'abc', nickname: 'Anh Cá' }, comment: 'thả câu' }, meta({ receivedAt: now }));
  for (const k of ['schema_version', 'event_id', 'event_type', 'realm', 'room_id', 'player_key', 'source', 'source_event_id', 'received_at', 'occurred_at', 'processed_at', 'payload']) assert.ok(k in ev, k);
  assert.equal(ev.event_type, 'comment');
  assert.equal(ev.player_key, 'demo:6812345678901234567', 'ID dài giữ dạng chuỗi, không mất chính xác');
  assert.equal(ev.occurred_at, now - 1500);
  assert.equal(ev.received_at, now);
  assert.equal(ev.processed_at, null);
  assert.equal(normalize({ type: 'chat', user: { userId: '1' }, comment: 'x' }, meta({ realm: 'live', source: 'tiktok' })).player_key, 'tt:1');
});

test('normalize: thiếu trường / sai kiểu / loại lạ / payload quá lớn → lỗi có mã', () => {
  const code = (raw, m = meta()) => { try { normalize(raw, m); return 'OK'; } catch (e) { assert.ok(e instanceof NormalizeError); return e.code; } };
  assert.equal(code(null), 'INVALID_PAYLOAD');
  assert.equal(code({ type: 'poll' }), 'UNKNOWN_EVENT');
  assert.equal(code({ type: 'chat', user: { userId: '1' } }), 'INVALID_PAYLOAD');
  assert.equal(code({ type: 'chat', comment: 'x' }), 'INVALID_USER');
  assert.equal(code({ type: 'gift', user: { userId: '1' }, giftId: 'abc' }), 'INVALID_GIFT');
  assert.equal(code({ type: 'gift', user: { userId: '1' }, giftId: 5, repeatCount: -1 }), 'INVALID_GIFT');
  assert.equal(code({ type: 'like', user: { userId: '1' }, likeCount: -3 }), 'INVALID_PAYLOAD');
  assert.equal(code({ type: 'chat', user: { userId: '1' }, comment: 'x'.repeat(20000) }), 'PAYLOAD_TOO_LARGE');
  assert.equal(code({ type: 'chat', user: { userId: '1' }, comment: 'x' }, { receivedAt: 1, source: 'mock' }), 'NO_REALM');
  assert.equal(code({ type: 'like', user: { userId: { $gt: 1 } }, likeCount: 1 }), 'INVALID_USER', 'userId kiểu lạ không được chấp nhận');
});

test('normalize: timestamp bất thường → occurred_at null + cờ; giây được đổi sang ms', () => {
  const now = Date.now();
  const f = (ct) => normalize({ type: 'chat', user: { userId: '1' }, comment: 'x', createTime: ct }, meta({ receivedAt: now }));
  assert.equal(f(now + 3600000).occurred_at, null);
  assert.ok(f(now + 3600000).flags.includes('TS_ANOMALY'));
  assert.ok(f('hôm qua').flags.length === 0 || f('hôm qua').occurred_at === null);
  assert.equal(f(Math.floor((now - 2000) / 1000)).occurred_at, Math.floor((now - 2000) / 1000) * 1000);
});

test('normalize: Unicode tiếng Việt NFC, bỏ ký tự điều khiển/bidi, nội dung HTML chỉ là chuỗi', () => {
  assert.equal(cleanText('Ca\u0300 to\u200b qua\u0301\u202e!', 50), 'C\u00e0 to qu\u00e1!', 'a/á tổ hợp → NFC; bỏ zero-width & bidi override');
  assert.equal(cleanText('Thủy', 50), 'Thủy'.normalize('NFC'));
  assert.equal(cleanText('  a \n\t b  ', 50), 'a b');
  assert.equal(cleanText('🐟🐟🐟', 2), '🐟🐟', 'không cắt giữa cặp surrogate');
  const ev = normalize({ type: 'chat', user: { userId: '1', nickname: '<img src=x onerror=alert(1)>' }, comment: '<script>alert(1)</script>' }, meta());
  assert.equal(ev.payload.text, '<script>alert(1)</script>', 'giữ nguyên dạng chuỗi; việc escape thuộc tầng hiển thị');
  assert.equal(typeof ev.user.nickname, 'string');
});

test('gift_key theo ADR-0018: M:msgId, S:streak có groupId, H dự phòng WEAK; streak thiếu groupId chỉ tính ở repeatEnd', () => {
  const base = { playerKey: 'tt:1', userId: '1', giftId: 5655, repeatCount: 3, createTime: 111 };
  assert.deepEqual(giftKeyFor({ ...base, giftType: 2, msgId: '99' }).gift_key, 'M:99');
  const s = giftKeyFor({ ...base, giftType: 1, groupId: 'g7', msgId: '99' });
  assert.equal(s.gift_key, 'S:tt:1:5655:g7:3');
  assert.equal(s.streak_key, 'tt:1:5655:g7');
  assert.equal(s.key_quality, 'STRONG');
  const h = giftKeyFor({ ...base, giftType: 2 });
  assert.equal(h.key_mode, 'H');
  assert.equal(h.key_quality, 'WEAK');
  assert.equal(giftKeyFor({ ...base, giftType: 1, repeatEnd: false }).applicable, false);
  assert.equal(giftKeyFor({ ...base, giftType: 1, repeatEnd: true }).applicable, true);
  const ev = normalize({ type: 'gift', msgId: '5', user: {}, giftId: 1, giftType: 2 }, meta());
  assert.equal(ev.payload.applicable, false);
  assert.equal(ev.payload.reason, 'NO_USER_ID', 'thiếu userId: vẫn journal (REJECTED), không tạo hồ sơ');
});
