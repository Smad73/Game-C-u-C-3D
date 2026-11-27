// Kiểm thử lớp bảo mật (ADR-0020): giới hạn tần suất, Host/Origin/CSRF, ghép đôi, phiên, thu hồi, đăng nhập, audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { RateLimiter } from '../src/security/RateLimiter.js';
import { HostPolicy, hostGuard, originGuard, csrfGuard } from '../src/security/HostPolicy.js';
import { DeviceRegistry, deviceLabel } from '../src/security/DeviceRegistry.js';
import { AuthSessions, AuthError, readCookie } from '../src/security/AuthSessions.js';
import { Audit } from '../src/security/Audit.js';
import { loadSettings } from '../src/system/Settings.js';
import { Logger } from '../src/system/Logger.js';
import { makePersistence } from './helpers.js';

const secCfg = loadSettings({ env: {} }).settings.security;
const quiet = new Logger({ level: 'error', stdout: false, toFile: false });

// ───────── RateLimiter ─────────
test('ratelimiter: cửa sổ trượt, tách theo khoá, hết cửa sổ thì cho lại', () => {
  let t = 0;
  const rl = new RateLimiter({ max: 3, windowMs: 1000, now: () => t });
  assert.ok(rl.hit('a').allowed && rl.hit('a').allowed && rl.hit('a').allowed);
  const blocked = rl.hit('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 1000);
  assert.ok(rl.hit('b').allowed, 'khoá khác không bị ảnh hưởng');
  t = 1001;
  assert.ok(rl.hit('a').allowed, 'sau khi hết cửa sổ được dùng lại');
  rl.reset('a');
  assert.equal(rl.hit('a').remaining, 2);
});

// ───────── HostPolicy / guards ─────────
const mockRes = () => { const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const run = (mw, req) => { const res = mockRes(); let nexted = false; mw(req, res, () => { nexted = true; }); return { res, nexted }; };

test('host: chỉ loopback (và địa chỉ LAN đã chọn ở chế độ LAN) được phép; chống DNS rebinding', () => {
  const p = new HostPolicy({ mode: 'local' });
  assert.equal(p.hostAllowed('127.0.0.1:8787'), false, 'chưa có port thì chưa cho phép gì');
  p.setPort(8787);
  assert.ok(p.hostAllowed('127.0.0.1:8787') && p.hostAllowed('localhost:8787') && p.hostAllowed('LOCALHOST:8787'));
  assert.ok(!p.hostAllowed('evil.example.com:8787'), 'tên miền lạ trỏ về 127.0.0.1 (DNS rebinding) bị từ chối');
  assert.ok(!p.hostAllowed('192.168.1.9:8787'), 'chế độ local không cho địa chỉ LAN');
  assert.ok(!p.hostAllowed('127.0.0.1:9999') && !p.hostAllowed(undefined) && !p.hostAllowed(''));
  const lan = new HostPolicy({ mode: 'lan', lanHost: '192.168.1.9' });
  lan.setPort(8787);
  assert.ok(lan.hostAllowed('192.168.1.9:8787'));
  assert.ok(!lan.hostAllowed('192.168.1.10:8787'));
});

test('origin: đúng scheme + host được phép; `null`, origin lạ, scheme sai đều bị từ chối', () => {
  const p = new HostPolicy({ mode: 'local' });
  p.setPort(8787);
  assert.ok(p.originAllowed('http://127.0.0.1:8787') && p.originAllowed('http://localhost:8787'));
  for (const bad of ['null', 'http://evil.com', 'https://127.0.0.1:8787', 'http://127.0.0.1:8787.evil.com', 'http://127.0.0.1', '', undefined, 'http://127.0.0.1:8787/x']) {
    assert.equal(p.originAllowed(bad), false, `phải từ chối: ${bad}`);
  }
  const tls = new HostPolicy({ mode: 'local', tls: true });
  tls.setPort(8787);
  assert.ok(tls.originAllowed('https://127.0.0.1:8787') && !tls.originAllowed('http://127.0.0.1:8787'));
  assert.ok(HostPolicy.isLoopback('::ffff:127.0.0.1') && HostPolicy.isLoopback('::1') && !HostPolicy.isLoopback('192.168.1.2'));
});

test('guards: Host sai → 421; thay đổi dữ liệu thiếu/sai Origin → 403; thiếu/sai CSRF → 403; GET không cần', () => {
  const p = new HostPolicy({ mode: 'local' });
  p.setPort(1234);
  let r = run(hostGuard(p), { headers: { host: 'evil.com:1234' } });
  assert.equal(r.res.code, 421);
  assert.equal(r.res.body.code, 'HOST_INVALID');
  assert.ok(run(hostGuard(p), { headers: { host: '127.0.0.1:1234' } }).nexted);

  r = run(originGuard(p), { method: 'POST', headers: {} });
  assert.deepEqual([r.res.code, r.res.body.code], [403, 'ORIGIN_MISSING']);
  r = run(originGuard(p), { method: 'POST', headers: { origin: 'http://evil.com' } });
  assert.deepEqual([r.res.code, r.res.body.code], [403, 'ORIGIN_INVALID']);
  assert.ok(run(originGuard(p), { method: 'POST', headers: { origin: 'http://127.0.0.1:1234' } }).nexted);
  assert.ok(run(originGuard(p), { method: 'GET', headers: {} }).nexted, 'GET không bị ràng buộc Origin');

  const csrf = csrfGuard();
  r = run(csrf, { method: 'POST', headers: {}, session: { csrf: 'abc' } });
  assert.equal(r.res.body.code, 'CSRF_INVALID');
  r = run(csrf, { method: 'POST', headers: { 'x-nova-csrf': 'sai' }, session: { csrf: 'abc' } });
  assert.equal(r.res.code, 403);
  r = run(csrf, { method: 'DELETE', headers: { 'x-nova-csrf': 'abc' }, session: undefined });
  assert.equal(r.res.code, 403, 'không có phiên thì không thể qua CSRF');
  assert.ok(run(csrf, { method: 'POST', headers: { 'x-nova-csrf': 'abc' }, session: { csrf: 'abc' } }).nexted);
  assert.ok(run(csrf, { method: 'GET', headers: {}, session: { csrf: 'abc' } }).nexted);
});

test('cookie: đọc đúng tên, bỏ qua tên khác, an toàn với đầu vào rỗng', () => {
  assert.equal(readCookie('a=1; nova_sid=xyz; b=2', 'nova_sid'), 'xyz');
  assert.equal(readCookie('nova_sid_khac=1', 'nova_sid'), null);
  assert.equal(readCookie(undefined, 'nova_sid'), null);
  assert.equal(readCookie('rac', 'nova_sid'), null);
});

test('thiết bị: nhãn thân thiện từ User-Agent', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17) AppleWebKit Safari/604'), 'iPhone/iPad · Safari');
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537'), 'Windows · Chrome');
  assert.equal(deviceLabel(''), 'Thiết bị');
});

// ───────── AuthSessions (đồng hồ giả, Persistence thật) ─────────
async function authEnv({ password = null, cfgOver = {} } = {}) {
  const p = await makePersistence();
  let t = 5_000_000;
  const now = () => t;
  const devices = new DeviceRegistry({ persistence: p.client, logger: quiet, now });
  await devices.load();
  const revoked = [];
  const auth = new AuthSessions({ config: { ...secCfg, ...cfgOver }, devices, adminPassword: password, now, onRevoke: (id) => revoked.push(id), logger: quiet });
  return { p, devices, auth, revoked, advance: (ms) => { t += ms; }, now };
}
const err = (code) => (e) => e instanceof AuthError && e.code === code;

test('ghép đôi: mã dùng được đúng MỘT lần; lần hai báo "đã dùng"', async () => {
  const e = await authEnv();
  try {
    const { code, ttlMs } = e.auth.createPairCode();
    assert.equal(ttlMs, secCfg.pairCodeTtlMs);
    assert.ok(code.length >= 22, 'mã 128 bit base64url ≥ 22 ký tự');
    const s = await e.auth.redeemPairCode(code, { ip: '127.0.0.1', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/1 Safari/1' });
    assert.ok(s.token && s.csrf && s.deviceId);
    const sess = e.auth.authenticate(s.token);
    assert.equal(sess.deviceId, s.deviceId);
    assert.equal(sess.csrf, s.csrf);
    await assert.rejects(e.auth.redeemPairCode(code, { ip: '127.0.0.1' }), err('PAIR_USED'));
    const rows = await e.devices.list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Mac · Chrome');
    assert.equal(rows[0].revoked_at_utc, null);
  } finally { await e.p.stop(); }
});

test('ghép đôi: mã HẾT HẠN theo cấu hình bị từ chối (không dùng được kể cả đúng mã)', async () => {
  const e = await authEnv();
  try {
    const { code } = e.auth.createPairCode();
    e.advance(secCfg.pairCodeTtlMs - 1);
    assert.equal(e.auth.pairCodeStatus().active, true);
    e.advance(2);
    await assert.rejects(e.auth.redeemPairCode(code), err('PAIR_EXPIRED'));
    assert.equal(e.auth.pairCodeStatus().active, false);
    await assert.rejects(e.auth.redeemPairCode(code), err('PAIR_EXPIRED'), 'vẫn báo hết hạn ở lần sau');
    assert.equal(e.auth.sessionCount(), 0, 'không phiên nào được tạo');
  } finally { await e.p.stop(); }
});

test('ghép đôi: mã bị HUỶ (thu hồi) hoặc bị thay bằng mã mới không dùng được; chỉ một mã hiệu lực', async () => {
  const e = await authEnv();
  try {
    const a = e.auth.createPairCode();
    assert.equal(e.auth.cancelPairCode(), true);
    assert.equal(e.auth.cancelPairCode(), false);
    await assert.rejects(e.auth.redeemPairCode(a.code), err('PAIR_CANCELLED'));

    const b = e.auth.createPairCode();
    const c = e.auth.createPairCode(); // tạo mã mới huỷ mã cũ
    assert.notEqual(b.code, c.code);
    await assert.rejects(e.auth.redeemPairCode(b.code), err('PAIR_CANCELLED'));
    const ok = await e.auth.redeemPairCode(c.code);
    assert.ok(ok.token);
  } finally { await e.p.stop(); }
});

test('ghép đôi: mã sai/rác/quá dài bị từ chối; thử quá nhiều lần bị giới hạn tần suất', async () => {
  const e = await authEnv();
  try {
    e.auth.createPairCode();
    await assert.rejects(e.auth.redeemPairCode('khong-phai-ma'), err('PAIR_INVALID'));
    await assert.rejects(e.auth.redeemPairCode(''), err('PAIR_INVALID'));
    await assert.rejects(e.auth.redeemPairCode('x'.repeat(5000)), err('PAIR_INVALID'));
    await assert.rejects(e.auth.redeemPairCode(undefined), err('PAIR_INVALID'));
    // giới hạn ghép đôi: 10 lần/phút/IP → 10 lần sai đầu vẫn được xử lý, lần thứ 11 bị chặn
    for (let i = 0; i < 10; i++) await assert.rejects(e.auth.redeemPairCode(`sai-${i}`, { ip: '9.9.9.9' }), err('PAIR_INVALID'));
    await assert.rejects(e.auth.redeemPairCode('sai-nua', { ip: '9.9.9.9' }), err('RATE_LIMITED'));
    await assert.rejects(e.auth.redeemPairCode('sai-nua', { ip: '8.8.8.8' }), err('PAIR_INVALID'), 'IP khác không bị ảnh hưởng');
    assert.equal(e.auth.sessionCount(), 0);
  } finally { await e.p.stop(); }
});

test('phiên: hết hạn khi không hoạt động; token lạ/rỗng không xác thực được', async () => {
  const e = await authEnv();
  try {
    const { token } = await e.auth.redeemPairCode(e.auth.createPairCode().code);
    e.advance(secCfg.sessionIdleMs - 1000);
    assert.ok(e.auth.authenticate(token), 'còn hạn');
    e.advance(secCfg.sessionIdleMs - 1000); // vừa được gia hạn bởi lần trước
    assert.ok(e.auth.authenticate(token), 'hoạt động thì được gia hạn');
    e.advance(secCfg.sessionIdleMs + 1);
    assert.equal(e.auth.authenticate(token), null, 'quá thời gian nhàn rỗi thì hết hạn');
    for (const bad of [null, undefined, '', 'x', 'a'.repeat(500)]) assert.equal(e.auth.authenticate(bad), null);
  } finally { await e.p.stop(); }
});

test('thu hồi thiết bị: phiên vô hiệu NGAY, WS của thiết bị bị ngắt (callback), thiết bị khác không ảnh hưởng, bền qua khởi động lại', async () => {
  const e = await authEnv();
  try {
    const a = await e.auth.redeemPairCode(e.auth.createPairCode().code);
    const b = await e.auth.redeemPairCode(e.auth.createPairCode().code);
    assert.ok(e.auth.authenticate(a.token) && e.auth.authenticate(b.token));
    await e.auth.revokeDevice(a.deviceId);
    assert.equal(e.auth.authenticate(a.token), null, 'phiên của thiết bị bị thu hồi vô hiệu ngay');
    assert.ok(e.auth.authenticate(b.token), 'thiết bị khác vẫn dùng được');
    assert.deepEqual(e.revoked, [a.deviceId], 'onRevoke được gọi để ngắt WebSocket của thiết bị');
    const rows = await e.devices.list();
    assert.ok(rows.find((r) => r.device_id === a.deviceId).revoked_at_utc > 0, 'trạng thái thu hồi đã ghi DB');
    assert.equal(rows.find((r) => r.device_id === b.deviceId).revoked_at_utc, null);

    // "khởi động lại": sổ thiết bị mới nạp từ DB vẫn nhớ thiết bị đã thu hồi
    const reg2 = new DeviceRegistry({ persistence: e.p.client, logger: quiet });
    await reg2.load();
    assert.ok(reg2.isRevoked(a.deviceId) && !reg2.isRevoked(b.deviceId));
    // thiết bị đã thu hồi không "sống lại" bằng cách ghép đôi lại với cùng device_id (Worker bỏ qua upsert)
    await e.p.client.commit({ cls: 'state', ops: [{ t: 'device_upsert', device_id: a.deviceId, name: 'x', paired_at_utc: 1, last_seen_utc: 1 }] });
    assert.ok((await e.devices.list()).find((r) => r.device_id === a.deviceId).revoked_at_utc > 0);
  } finally { await e.p.stop(); }
});

test('thu hồi tất cả: mọi phiên + mã ghép đôi đang hiệu lực + mọi thiết bị bị vô hiệu', async () => {
  const e = await authEnv();
  try {
    const a = await e.auth.redeemPairCode(e.auth.createPairCode().code);
    const b = await e.auth.redeemPairCode(e.auth.createPairCode().code);
    const pending = e.auth.createPairCode();
    await e.auth.revokeAll();
    assert.equal(e.auth.authenticate(a.token), null);
    assert.equal(e.auth.authenticate(b.token), null);
    assert.equal(e.auth.sessionCount(), 0);
    await assert.rejects(e.auth.redeemPairCode(pending.code), err('PAIR_CANCELLED'));
    assert.deepEqual(e.revoked, ['*']);
    const rows = await e.devices.list();
    assert.ok(rows.length === 2 && rows.every((r) => r.revoked_at_utc > 0));
    // ghép đôi mới sau khi thu hồi tất cả vẫn được (thiết bị MỚI)
    const c = await e.auth.redeemPairCode(e.auth.createPairCode().code);
    assert.ok(e.auth.authenticate(c.token));
    assert.ok(![a.deviceId, b.deviceId].includes(c.deviceId));
  } finally { await e.p.stop(); }
});

test('đăng nhập mật khẩu: chưa đặt → từ chối; sai/đúng; mật khẩu không nằm trong đối tượng', async () => {
  const none = await authEnv();
  try { await assert.rejects(none.auth.login('x'), err('PASSWORD_NOT_SET')); } finally { await none.p.stop(); }

  const secret = 'mat-khau-rat-bi-mat-12345';
  const e = await authEnv({ password: secret });
  try {
    assert.equal(e.auth.passwordConfigured, true);
    await assert.rejects(e.auth.login('sai-mat-khau', { ip: '1.1.1.1' }), err('LOGIN_FAILED'));
    await assert.rejects(e.auth.login('', { ip: '1.1.1.1' }), err('LOGIN_FAILED'));
    await assert.rejects(e.auth.login('x'.repeat(1000), { ip: '1.1.1.1' }), err('LOGIN_FAILED'));
    const s = await e.auth.login(secret, { ip: '1.1.1.1', userAgent: 'Mozilla/5.0 (iPhone) Safari/604' });
    assert.equal(s.method, 'password');
    assert.ok(e.auth.authenticate(s.token));
    assert.ok(!inspect(e.auth, { depth: 6 }).includes(secret), 'mật khẩu thô không được nằm trong bộ nhớ của AuthSessions');
  } finally { await e.p.stop(); }
});

test('đăng nhập: giới hạn 5 lần/phút/IP rồi khoá tăng dần; IP khác không bị ảnh hưởng; khoá cả khi nhập đúng', async () => {
  const secret = 'mat-khau-dai-du-123';
  const e = await authEnv({ password: secret });
  try {
    for (let i = 0; i < secCfg.loginMaxPerMinute; i++) await assert.rejects(e.auth.login('sai', { ip: '2.2.2.2' }), err('LOGIN_FAILED'));
    await assert.rejects(e.auth.login(secret, { ip: '2.2.2.2' }), err('RATE_LIMITED'), 'lần thứ 6 trong phút bị chặn dù đúng mật khẩu');
    assert.ok((await e.auth.login(secret, { ip: '3.3.3.3' })).token, 'IP khác không bị ảnh hưởng');

    // sai liên tục qua nhiều phút → khoá tăng dần
    for (let burst = 0; burst < 2; burst++) {
      e.advance(61000);
      for (let i = 0; i < 4; i++) await e.auth.login('sai', { ip: '4.4.4.4' }).catch(() => {});
    }
    e.advance(61000);
    await e.auth.login('sai', { ip: '4.4.4.4' }).catch(() => {}); // đủ 9 lần sai liên tiếp
    await assert.rejects(e.auth.login(secret, { ip: '4.4.4.4' }), err('LOCKED'), 'đang bị khoá thì mật khẩu đúng cũng bị từ chối');
  } finally { await e.p.stop(); }
});

test('xác thực lại (reauth) cho thao tác nguy hiểm: hết cửa sổ thì cần lại; mật khẩu hoặc mã ghép đôi mới', async () => {
  const secret = 'mat-khau-dai-du-123';
  const e = await authEnv({ password: secret });
  try {
    const s = await e.auth.login(secret, { ip: '5.5.5.5' });
    let sess = e.auth.authenticate(s.token);
    assert.equal(e.auth.recentlyAuthenticated(sess), true, 'vừa đăng nhập thì tính là vừa xác thực');
    e.advance(secCfg.reauthWindowMs + 1);
    sess = e.auth.authenticate(s.token);
    assert.equal(e.auth.recentlyAuthenticated(sess), false);
    await assert.rejects(e.auth.reauth(sess, { password: 'sai', ip: '5.5.5.5' }), err('LOGIN_FAILED'));
    assert.equal(e.auth.recentlyAuthenticated(e.auth.authenticate(s.token)), false);
    await e.auth.reauth(sess, { password: secret, ip: '5.5.5.5' });
    assert.equal(e.auth.recentlyAuthenticated(e.auth.authenticate(s.token)), true);

    e.advance(secCfg.reauthWindowMs + 1);
    sess = e.auth.authenticate(s.token);
    const fresh = e.auth.createPairCode();
    await e.auth.reauth(sess, { pairCode: fresh.code, ip: '5.5.5.5' });
    assert.equal(e.auth.recentlyAuthenticated(e.auth.authenticate(s.token)), true);
    await assert.rejects(e.auth.reauth(sess, { pairCode: fresh.code, ip: '5.5.5.5' }), err('PAIR_USED'));
    await assert.rejects(e.auth.reauth(sess, {}), err('REAUTH_INPUT'));
  } finally { await e.p.stop(); }
});

test('audit: ghi dòng audit bền, không chứa bí mật; lỗi ghi không ném', async () => {
  const p = await makePersistence();
  try {
    const audit = new Audit({ persistence: p.client, logger: quiet });
    assert.equal(await audit.record({ deviceId: 'd1', ip: '127.0.0.1', action: 'revoke_device', detail: 'thu hồi d2', result: 'ok' }), true);
    assert.equal((await p.client.read('count_table', { table: 'admin_audit' }))[0].count, 1);
    await p.client.close();
    assert.equal(await audit.record({ action: 'sau_khi_dong' }), false, 'persistence đã đóng → trả false, không ném');
  } finally { await p.stop(); }
});
