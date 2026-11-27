// Kiểm thử tích hợp HTTP + WebSocket + bảo mật trên server THẬT (createApp, cổng ngẫu nhiên, SQLite thật, Worker thật).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import { SettingsError } from '../src/system/Settings.js';
import { latestSchemaVersion, makeTmpDir, removeDir, sleep, waitFor } from './helpers.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120 Safari/537';

async function withApp(t, over, fn) {
  const dir = makeTmpDir('nova-http-');
  const { adminPassword, wsIsSelf, ...settingsOver } = over || {};
  const app = await createApp({
    stdout: false, adminPassword: adminPassword ?? null, wsIsSelf, env: {}, exit: () => {}, // KHÔNG để test thoát tiến trình thật
    ...{},
    settingsOverrides: { server: { port: 0 }, dataDir: dir, logging: { toFile: false }, ...settingsOver }
  });
  try {
    await fn(app, dir);
  } finally {
    await app.stop('test-cleanup').catch(() => {});
    removeDir(dir);
  }
}

function request(app, { method = 'GET', path = '/', headers = {}, body, host } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
    const h = { Host: host ?? `127.0.0.1:${app.port}`, ...headers };
    if (data !== undefined) { h['Content-Type'] ??= 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ host: '127.0.0.1', port: app.port, method, path, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* không phải JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    r.on('error', reject);
    r.end(data);
  });
}

const originOf = (app) => `http://127.0.0.1:${app.port}`;

/** Ghép đôi một thiết bị mới qua HTTP thật. */
async function pairDevice(app, ua = UA) {
  const { code } = app.createPairing();
  const r = await request(app, { method: 'POST', path: '/api/admin/pair', headers: { Origin: originOf(app), 'User-Agent': ua }, body: { code } });
  assert.equal(r.status, 200, `ghép đôi phải thành công: ${r.text}`);
  return { cookie: r.headers['set-cookie'][0].split(';')[0], csrf: r.json.csrf, deviceId: r.json.deviceId, setCookie: r.headers['set-cookie'][0] };
}

/** Gọi API với phiên (tự gắn Cookie, Origin, CSRF). */
function call(app, s, method, path, body, extra = {}) {
  const headers = { Cookie: s.cookie, ...extra };
  if (method !== 'GET') { headers.Origin = originOf(app); headers['X-Nova-CSRF'] = s.csrf; }
  return request(app, { method, path, headers, body });
}

function wsOpen(app, { path = '/ws?role=stage', headers = {}, host } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}${path}`, { headers: { Host: host ?? `127.0.0.1:${app.port}`, ...headers } });
    ws.messages = [];
    ws.on('message', (d) => ws.messages.push(JSON.parse(d.toString())));
    ws.on('open', () => fin({ ws }));
    ws.on('unexpected-response', (_req, res) => { res.resume(); fin({ status: res.statusCode }); });
    ws.on('error', (e) => fin({ error: e }));
  });
}
const adminHeaders = (app, s) => ({ Origin: originOf(app), Cookie: s.cookie });
const closed = (ws) => new Promise((r) => ws.once('close', (code) => r(code)));
const waitMsg = (ws, type, ms = 3000) => waitFor(() => ws.messages.find((m) => m.type === type), { timeoutMs: ms, what: `thông điệp ${type}` });

// ───────── trang tĩnh & header ─────────
test('công khai: health/state, trang stage + control + Three.js tự host, header bảo mật', (t) => withApp(t, {}, async (app) => {
  const h = await request(app, { path: '/api/health' });
  assert.equal(h.status, 200);
  assert.equal(h.json.ok, true);
  assert.equal(h.json.persist, 'READY');
  assert.equal(h.json.mode, 'local');
  assert.equal(h.headers['x-content-type-options'], 'nosniff');
  assert.equal(h.headers['referrer-policy'], 'no-referrer');
  assert.equal(h.headers['cache-control'], 'no-store');
  assert.ok(!('x-powered-by' in h.headers));
  assert.equal((await request(app, { path: '/api/state' })).json.ok, true);

  const stage = await request(app, { path: '/stage/' });
  assert.equal(stage.status, 200);
  assert.match(stage.text, /1080/);
  assert.match(stage.headers['content-security-policy'], /frame-ancestors 'self'/);
  assert.match(stage.headers['content-security-policy'], /script-src 'self'/);
  assert.match(stage.headers['content-security-policy'], new RegExp(`ws://127\\.0\\.0\\.1:${app.port}`));
  assert.ok(!stage.headers['content-security-policy'].includes('['), 'CSP không được chứa nguồn IPv6 dạng [::1] (trình duyệt coi là không hợp lệ)');
  const control = await request(app, { path: '/control/' });
  assert.equal(control.status, 200);
  assert.match(control.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.ok(!/ on\w+=/.test(control.text) && !/<script>[^<]/.test(control.text), 'không có script/handler nội tuyến (CSP)');

  const three = await request(app, { path: '/vendor/three/three.module.js' });
  assert.equal(three.status, 200);
  assert.match(three.headers['content-type'], /javascript/);
  assert.equal((await request(app, { path: '/' })).status, 302);
  assert.equal((await request(app, { path: '/api/khong-co' })).json.code, 'NOT_FOUND');
}));

test('đường dẫn thoát thư mục public và tệp ẩn không đọc được', (t) => withApp(t, {}, async (app) => {
  for (const p of ['/stage/%2e%2e/%2e%2e/package.json', '/stage/..%2f..%2fpackage.json', '/vendor/../../package.json', '/stage/.env', '/control/.git/config', '/%2e%2e/package.json']) {
    const r = await request(app, { path: p });
    assert.ok([400, 403, 404].includes(r.status) && !r.text.includes('nova-fishing-live-3d'), `${p} → ${r.status}`);
  }
}));

// ───────── Host / Origin / CSRF ─────────
test('Host lạ (DNS rebinding) bị 421 ở mọi đường dẫn; localhost hợp lệ', (t) => withApp(t, {}, async (app) => {
  for (const p of ['/api/health', '/stage/', '/control/', '/']) {
    const r = await request(app, { path: p, host: `evil.example.com:${app.port}` });
    assert.equal(r.status, 421, p);
  }
  assert.equal((await request(app, { path: '/api/health', host: `localhost:${app.port}` })).status, 200);
  assert.equal((await request(app, { path: '/api/health', host: `127.0.0.1:${app.port + 1}` })).status, 421);
}));

test('thay đổi dữ liệu: thiếu Origin / Origin lạ / "null" đều bị chặn TRƯỚC khi chạm logic', (t) => withApp(t, {}, async (app) => {
  const { code } = app.createPairing();
  const base = { method: 'POST', path: '/api/admin/pair', body: { code } };
  assert.equal((await request(app, { ...base })).json.code, 'ORIGIN_MISSING');
  assert.equal((await request(app, { ...base, headers: { Origin: 'http://evil.com' } })).json.code, 'ORIGIN_INVALID');
  assert.equal((await request(app, { ...base, headers: { Origin: 'null' } })).json.code, 'ORIGIN_INVALID');
  assert.equal((await request(app, { ...base, headers: { Origin: `http://127.0.0.1:${app.port}.evil.com` } })).json.code, 'ORIGIN_INVALID');
  // mã chưa bị tiêu hao bởi các lần bị chặn
  assert.equal((await request(app, { ...base, headers: { Origin: originOf(app) } })).status, 200);
  const evil = await request(app, { method: 'DELETE', path: '/api/admin/pair-code', headers: { Origin: 'http://evil.com' } });
  assert.equal(evil.status, 403);
}));

test('CSRF: phiên hợp lệ nhưng thiếu/sai X-Nova-CSRF vẫn bị 403; đúng thì qua', (t) => withApp(t, {}, async (app) => {
  const s = await pairDevice(app);
  const noToken = await request(app, { method: 'POST', path: '/api/admin/pair-code', headers: { Cookie: s.cookie, Origin: originOf(app) }, body: {} });
  assert.deepEqual([noToken.status, noToken.json.code], [403, 'CSRF_INVALID']);
  const wrong = await request(app, { method: 'POST', path: '/api/admin/pair-code', headers: { Cookie: s.cookie, Origin: originOf(app), 'X-Nova-CSRF': 'sai-token' }, body: {} });
  assert.equal(wrong.json.code, 'CSRF_INVALID');
  const ok = await call(app, s, 'POST', '/api/admin/pair-code', {});
  assert.equal(ok.status, 200);
  assert.ok(ok.json.code && ok.json.expiresAtUtc > Date.now());
}));

// ───────── xác thực ─────────
test('chưa xác thực: mọi API admin → 401; cookie giả → 401', (t) => withApp(t, {}, async (app) => {
  for (const [m, p] of [['GET', '/api/metrics'], ['GET', '/api/admin/session'], ['GET', '/api/admin/devices'], ['GET', '/api/admin/view-key']]) {
    assert.equal((await request(app, { method: m, path: p })).status, 401, p);
  }
  const post = await request(app, { method: 'POST', path: '/api/world/stop', headers: { Origin: originOf(app) }, body: { confirm: 'XAC NHAN' } });
  assert.equal(post.status, 401);
  const fake = await request(app, { path: '/api/metrics', headers: { Cookie: 'nova_sid=gia-mao' } });
  assert.equal(fake.status, 401);
}));

test('ghép đôi qua HTTP: cookie HttpOnly+SameSite=Strict, /metrics có bộ chỉ số R14 và cảnh báo', (t) => withApp(t, {}, async (app) => {
  const s = await pairDevice(app);
  assert.match(s.setCookie, /HttpOnly/);
  assert.match(s.setCookie, /SameSite=Strict/);
  assert.match(s.setCookie, /Path=\//);
  assert.ok(!/Secure/.test(s.setCookie), 'HTTP localhost chưa có Secure (ADR-0023: Secure khi HTTPS)');
  const me = await call(app, s, 'GET', '/api/admin/session');
  assert.equal(me.json.csrf, s.csrf);
  const m = await call(app, s, 'GET', '/api/metrics');
  assert.equal(m.status, 200);
  for (const k of ['oldestUnpersistedEventAgeMs', 'oldestUnackedBatchAgeMs', 'unpersistedByType', 'ramDirtyNotEnqueued', 'writeBufferOps', 'inFlightBatches']) assert.ok(k in m.json.persist, `thiếu chỉ số R14: ${k}`);
  assert.ok(Array.isArray(m.json.alerts));
  assert.equal(m.json.overload.level, 'L0');
  assert.equal(m.json.persist.schemaVersion, latestSchemaVersion());
  const vk = await call(app, s, 'GET', '/api/admin/view-key');
  assert.equal(vk.json.viewKey, app.viewKey);
}));

test('mã ghép đôi: đã dùng / hết hạn / đã huỷ bị từ chối qua HTTP với mã lỗi riêng', async (t) => {
  await withApp(t, { security: { pairCodeTtlMs: 1000 } }, async (app) => {
    const post = (code) => request(app, { method: 'POST', path: '/api/admin/pair', headers: { Origin: originOf(app) }, body: { code } });
    const a = app.createPairing().code;
    assert.equal((await post(a)).status, 200);
    const used = await post(a);
    assert.deepEqual([used.status, used.json.code], [401, 'PAIR_USED']);

    const b = app.createPairing().code;
    await sleep(1150);
    const expired = await post(b);
    assert.deepEqual([expired.status, expired.json.code], [401, 'PAIR_EXPIRED']);

    const s = await pairDevice(app);
    const c = (await call(app, s, 'POST', '/api/admin/pair-code', {})).json.code;
    assert.equal((await call(app, s, 'DELETE', '/api/admin/pair-code')).json.cancelled, true);
    const cancelled = await post(c);
    assert.deepEqual([cancelled.status, cancelled.json.code], [401, 'PAIR_CANCELLED']);
    assert.equal((await post('mã-rác')).json.code, 'PAIR_INVALID');
  });
});

test('thu hồi thiết bị qua HTTP + WS: phiên và kết nối WS của thiết bị bị thu hồi chết NGAY, thiết bị khác không ảnh hưởng', (t) => withApp(t, {}, async (app) => {
  const a = await pairDevice(app, 'Mozilla/5.0 (iPhone) Safari/604');
  const b = await pairDevice(app);
  const wa = await wsOpen(app, { path: '/ws?role=admin', headers: adminHeaders(app, a) });
  const wb = await wsOpen(app, { path: '/ws?role=admin', headers: adminHeaders(app, b) });
  assert.ok(wa.ws && wb.ws, 'cả hai WS admin kết nối được');
  await waitMsg(wa.ws, 'hello');
  const closeA = closed(wa.ws);

  const rv = await call(app, b, 'POST', `/api/admin/devices/${a.deviceId}/revoke`, {});
  assert.equal(rv.status, 200);
  assert.equal(await closeA, 4401, 'WS của thiết bị bị thu hồi bị ngắt với mã 4401');
  assert.equal((await call(app, a, 'GET', '/api/metrics')).status, 401, 'phiên bị thu hồi dùng không được nữa');
  assert.equal((await call(app, b, 'GET', '/api/metrics')).status, 200, 'thiết bị khác vẫn dùng được');
  assert.equal(wb.ws.readyState, WebSocket.OPEN);

  const list = (await call(app, b, 'GET', '/api/admin/devices')).json;
  const rowA = list.devices.find((d) => d.device_id === a.deviceId);
  assert.ok(rowA.revoked_at_utc > 0 && rowA.name.includes('iPhone'));
  assert.equal(list.currentDeviceId, b.deviceId);
  wb.ws.close();
}));

// ───────── WebSocket ─────────
test('WS admin: không phiên / Origin lạ / thiếu Origin / Host lạ / role sai / path sai đều bị từ chối; hợp lệ nhận hello + status', (t) => withApp(t, {}, async (app) => {
  const s = await pairDevice(app);
  assert.equal((await wsOpen(app, { path: '/ws?role=admin', headers: { Origin: originOf(app) } })).status, 401, 'không có phiên');
  assert.equal((await wsOpen(app, { path: '/ws?role=admin', headers: { Origin: originOf(app), Cookie: 'nova_sid=gia' } })).status, 401, 'phiên giả');
  assert.equal((await wsOpen(app, { path: '/ws?role=admin', headers: { Cookie: s.cookie } })).status, 403, 'thiếu Origin (chống Cross-Site WebSocket Hijacking)');
  assert.equal((await wsOpen(app, { path: '/ws?role=admin', headers: { Cookie: s.cookie, Origin: 'http://evil.com' } })).status, 403, 'Origin lạ dù có cookie hợp lệ');
  assert.equal((await wsOpen(app, { path: '/ws?role=admin', headers: adminHeaders(app, s), host: `evil.com:${app.port}` })).status, 421, 'Host lạ');
  assert.equal((await wsOpen(app, { path: '/ws?role=root', headers: adminHeaders(app, s) })).status, 400, 'role không có');
  assert.equal((await wsOpen(app, { path: '/khong-phai-ws?role=admin', headers: adminHeaders(app, s) })).status, 404);
  const ok = await wsOpen(app, { path: '/ws?role=admin', headers: adminHeaders(app, s) });
  assert.ok(ok.ws);
  const hello = await waitMsg(ok.ws, 'hello');
  assert.equal(hello.role, 'admin');
  const st = await waitMsg(ok.ws, 'status');
  assert.ok(Array.isArray(st.alerts) && st.overload.level === 'L0');
  ok.ws.close();
}));

test('WS stage (cùng máy): vào được không cần phiên; Origin rỗng/"null"/cùng origin OK, origin lạ bị chặn; báo cáo được làm sạch và chuyển tới admin', (t) => withApp(t, {}, async (app) => {
  const s = await pairDevice(app);
  const admin = await wsOpen(app, { path: '/ws?role=admin', headers: adminHeaders(app, s) });
  await waitMsg(admin.ws, 'hello');

  const none = await wsOpen(app, { path: '/ws?role=stage' });
  const nul = await wsOpen(app, { path: '/ws?role=stage', headers: { Origin: 'null' } });
  const same = await wsOpen(app, { path: '/ws?role=stage', headers: { Origin: originOf(app) } });
  assert.ok(none.ws && nul.ws && same.ws, 'OBS có thể gửi Origin rỗng hoặc null');
  assert.equal((await wsOpen(app, { path: '/ws?role=stage', headers: { Origin: 'http://evil.com' } })).status, 403);
  nul.ws.close(); same.ws.close();

  const ws = none.ws;
  assert.equal((await waitMsg(ws, 'hello')).role, 'stage');
  ws.send(JSON.stringify({ type: 'ping', t: 12345 }));
  assert.equal((await waitMsg(ws, 'pong')).t, 12345);
  ws.send(JSON.stringify({ type: 'metrics', report: { webgl2: true, renderer: 'x'.repeat(5000), fps: 'nhanh', canvas: { w: 1080, h: 1920 }, audio: { ok: true, state: 'running' }, three: { ok: true, revision: '187' }, userAgent: 'UA', ws: { rttMs: -5 }, evil: '<script>' } }));
  const rep = (await waitMsg(admin.ws, 'stage_report')).report;
  assert.equal(rep.webgl2, true);
  assert.equal(rep.renderer.length, 200, 'chuỗi dài bị cắt');
  assert.equal(rep.fps, null, 'giá trị không phải số bị loại');
  assert.equal(rep.ws.rttMs, 0, 'số ngoài khoảng bị kẹp');
  assert.ok(!('evil' in rep), 'trường lạ bị loại');
  assert.equal(rep.canvas.w, 1080);
  const m = await call(app, s, 'GET', '/api/metrics');
  assert.equal(m.json.stage.audio.state, 'running');
  assert.equal(m.json.ws.stage, 1);
  ws.close(); admin.ws.close();
}));

test('WS stage từ máy KHÁC trong LAN (mô phỏng) bắt buộc khoá xem; khoá sai bị từ chối', async (t) => {
  await withApp(t, { wsIsSelf: () => false }, async (app) => {
    assert.equal((await wsOpen(app, { path: '/ws?role=stage' })).status, 401);
    assert.equal((await wsOpen(app, { path: '/ws?role=stage&k=sai-khoa' })).status, 401);
    assert.equal((await wsOpen(app, { path: `/ws?role=stage&k=${app.viewKey.slice(0, -1)}` })).status, 401);
    const ok = await wsOpen(app, { path: `/ws?role=stage&k=${encodeURIComponent(app.viewKey)}` });
    assert.ok(ok.ws, 'đúng khoá thì vào được');
    ok.ws.close();
  });
});

test('WS giới hạn: tin quá lớn, nhị phân, JSON hỏng, spam đều bị đóng', (t) => withApp(t, {}, async (app) => {
  const big = await wsOpen(app);
  const cBig = closed(big.ws);
  big.ws.send(JSON.stringify({ type: 'ping', pad: 'x'.repeat(20000) }));
  assert.equal(await cBig, 1009, 'vượt 16KB → 1009');

  const bin = await wsOpen(app);
  const cBin = closed(bin.ws);
  bin.ws.send(Buffer.from([1, 2, 3]));
  assert.equal(await cBin, 1003);

  const bad = await wsOpen(app);
  const cBad = closed(bad.ws);
  bad.ws.send('{khong phai json');
  assert.equal(await cBad, 1003);

  const spam = await wsOpen(app);
  const cSpam = closed(spam.ws);
  for (let i = 0; i < 40; i++) spam.ws.send(JSON.stringify({ type: 'ping', t: i }));
  assert.equal(await cSpam, 1008, 'quá 20 tin/giây → 1008');
}));

// ───────── giới hạn REST, body, đăng nhập ─────────
test('giới hạn tần suất REST theo IP; JSON hỏng → 400; body quá lớn → 413', async (t) => {
  await withApp(t, { security: { restMaxPerMinute: 8 } }, async (app) => {
    const origin = { Origin: originOf(app) };
    assert.equal((await request(app, { method: 'POST', path: '/api/admin/login', headers: origin, body: '{hong' })).json.code, 'BODY_INVALID');
    assert.equal((await request(app, { method: 'POST', path: '/api/admin/login', headers: origin, body: { password: 'x'.repeat(20000) } })).json.code, 'BODY_TOO_LARGE');
    let limited = null;
    for (let i = 0; i < 12 && !limited; i++) {
      const r = await request(app, { path: '/api/health' });
      if (r.status === 429) limited = r;
    }
    assert.ok(limited, 'phải bị 429 sau khi vượt ngưỡng');
    assert.equal(limited.json.code, 'RATE_LIMITED');
    assert.ok(limited.json.retryAfterMs > 0);
  });
});

test('đăng nhập mật khẩu qua HTTP: sai → 401; đúng → cookie; 5 lần/phút rồi 429; chế độ local không cần mật khẩu', async (t) => {
  await withApp(t, { adminPassword: 'mat-khau-dai-de-doan-123' }, async (app) => {
    const post = (password) => request(app, { method: 'POST', path: '/api/admin/login', headers: { Origin: originOf(app), 'User-Agent': UA }, body: { password } });
    assert.equal((await request(app, { path: '/api/health' })).json.passwordLogin, true);
    const bad = await post('sai');
    assert.deepEqual([bad.status, bad.json.code], [401, 'LOGIN_FAILED']);
    const ok = await post('mat-khau-dai-de-doan-123');
    assert.equal(ok.status, 200);
    assert.ok(ok.headers['set-cookie'][0].startsWith('nova_sid='));
    const cookie = ok.headers['set-cookie'][0].split(';')[0];
    assert.equal((await request(app, { path: '/api/admin/session', headers: { Cookie: cookie } })).status, 200);
    // đăng nhập thành công đặt lại bộ đếm → 5 lần SAI liên tiếp được xử lý, lần thứ 6 bị chặn (kể cả khi nhập đúng)
    for (let i = 0; i < 5; i++) assert.equal((await post('sai')).json.code, 'LOGIN_FAILED');
    const limited = await post('mat-khau-dai-de-doan-123');
    assert.deepEqual([limited.status, limited.json.code], [429, 'RATE_LIMITED']);
    assert.ok(limited.headers['retry-after']);
  });
  await withApp(t, {}, async (app) => {
    const r = await request(app, { method: 'POST', path: '/api/admin/login', headers: { Origin: originOf(app) }, body: { password: 'x' } });
    assert.equal(r.json.code, 'PASSWORD_NOT_SET');
  });
});

test('chế độ LAN: không khởi động nếu chưa có mật khẩu Admin đủ dài', async () => {
  const dir = makeTmpDir('nova-lan-');
  try {
    const mk = (adminPassword) => createApp({ stdout: false, env: {}, adminPassword, settingsOverrides: { server: { port: 0, mode: 'lan', lanHost: '127.0.0.1' }, dataDir: dir, logging: { toFile: false } } });
    await assert.rejects(mk(null), (e) => e instanceof SettingsError && /bắt buộc/.test(e.message));
    await assert.rejects(mk('ngan'), (e) => e instanceof SettingsError && /quá ngắn/.test(e.message));
    const app = await mk('mat-khau-lan-du-dai-1');
    try {
      assert.equal(app.bindHost, '127.0.0.1', 'bind địa chỉ đã chọn, không phải 0.0.0.0');
      const r = await request(app, { path: '/api/health' });
      assert.equal(r.json.mode, 'lan');
      assert.equal(r.json.https, false);
    } finally { await app.stop('lan-test').catch(() => {}); }
  } finally { removeDir(dir); }
});

// ───────── thao tác nguy hiểm + audit ─────────
test('thao tác nguy hiểm: thiếu "XAC NHAN" → 403; phiên cũ → cần xác thực lại; đều được ghi audit', async (t) => {
  await withApp(t, { adminPassword: 'mat-khau-dai-de-doan-123', security: { reauthWindowMs: 1000 } }, async (app) => {
    const s = await pairDevice(app);
    const noConfirm = await call(app, s, 'POST', '/api/admin/revoke-all', {});
    assert.deepEqual([noConfirm.status, noConfirm.json.code], [403, 'CONFIRM_REQUIRED']);
    const wrongConfirm = await call(app, s, 'POST', '/api/admin/revoke-all', { confirm: 'xac nhan' });
    assert.equal(wrongConfirm.json.code, 'CONFIRM_REQUIRED', 'phân biệt hoa/thường, gõ tay đúng chuỗi');

    await sleep(1150); // hết cửa sổ xác thực lại
    const stale = await call(app, s, 'POST', '/api/admin/revoke-all', { confirm: 'XAC NHAN' });
    assert.deepEqual([stale.status, stale.json.code], [403, 'REAUTH_REQUIRED']);
    const mint = await call(app, s, 'POST', '/api/admin/pair-code', {});
    assert.equal(mint.json.code, 'REAUTH_REQUIRED', 'phiên cũ không tự tạo được mã ghép đôi để "xác thực lại" cho chính nó');

    const badPw = await call(app, s, 'POST', '/api/admin/reauth', { password: 'sai' });
    assert.equal(badPw.status, 401);
    assert.equal((await call(app, s, 'POST', '/api/admin/reauth', { password: 'mat-khau-dai-de-doan-123' })).status, 200);
    const other = await pairDevice(app);
    const done = await call(app, s, 'POST', '/api/admin/revoke-all', { confirm: 'XAC NHAN' });
    assert.equal(done.status, 200);
    assert.equal((await call(app, s, 'GET', '/api/metrics')).status, 401, 'phiên đang thao tác cũng bị thu hồi');
    assert.equal((await call(app, other, 'GET', '/api/metrics')).status, 401, 'mọi thiết bị khác cũng bị thu hồi');

    const rows = await app.persistence.read('count_table', { table: 'admin_audit' });
    assert.ok(rows[0].count >= 5, `audit đã ghi các lần từ chối + thành công (${rows[0].count})`);
    const devs = await app.devices.list();
    assert.ok(devs.every((d) => d.revoked_at_utc > 0));
    // sau khi thu hồi tất cả vẫn ghép đôi lại được (thiết bị mới)
    const again = await pairDevice(app);
    assert.equal((await call(app, again, 'GET', '/api/metrics')).status, 200);
  });
});

test('Thoát an toàn qua API: 202 → các bước tắt chạy hết → ghi STOPPED → khởi động lại KHÔNG báo tắt đột ngột', async (t) => {
  const dir = makeTmpDir('nova-stop-');
  try {
    const exits = [];
    const mk = () => createApp({ stdout: false, env: {}, exit: (c) => exits.push(c), settingsOverrides: { server: { port: 0 }, dataDir: dir, logging: { toFile: false } } });
    const app = await mk();
    assert.equal(app.previousRunUnclean, false);
    const s = await pairDevice(app);
    const r = await call(app, s, 'POST', '/api/world/stop', { confirm: 'XAC NHAN' });
    assert.equal(r.status, 202);
    const report = await waitFor(() => app.shutdown.report, { what: 'báo cáo tắt' });
    assert.equal(report.safe, true, JSON.stringify(report.steps));
    await waitFor(() => exits.length > 0, { what: 'lệnh thoát tiến trình' });
    assert.deepEqual(exits, [0], 'thoát với mã 0 = đã lưu an toàn');
    assert.deepEqual(report.steps.map((x) => x.ok), report.steps.map(() => true));
    assert.equal(app.persistence.state, 'CLOSED');
    await assert.rejects(request(app, { path: '/api/health' }), /ECONNREFUSED|socket hang up|ECONNRESET/, 'server đã đóng cổng');

    const app2 = await mk();
    try {
      assert.equal(app2.previousRunUnclean, false, 'lần trước đã tắt an toàn');
      const st = (await app2.persistence.read('get_setting', { key: 'run.state' }))[0];
      assert.equal(JSON.parse(st.value).state, 'RUNNING');
    } finally { await app2.stop('t'); }
  } finally { removeDir(dir); }
});

// ───────── ADR-0027: máy chạy game vào thẳng, không cần mã ghép đôi ─────────
async function localLogin(app) {
  const r = await request(app, { method: 'POST', path: '/api/admin/local', headers: { Origin: originOf(app), 'User-Agent': UA }, body: {} });
  return { r, s: r.status === 200 ? { cookie: r.headers['set-cookie'][0].split(';')[0], csrf: r.json.csrf, deviceId: r.json.deviceId } : null };
}

test('vào thẳng trên máy chạy game: không cần mã; phiên dùng được; có ghi audit; vẫn phải đúng Origin', (t) => withApp(t, {}, async (app) => {
  const { r, s } = await localLogin(app);
  assert.equal(r.status, 200, r.text);
  assert.match(r.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
  assert.equal((await call(app, s, 'GET', '/api/metrics')).status, 200);
  const noOrigin = await request(app, { method: 'POST', path: '/api/admin/local', body: {} });
  assert.equal(noOrigin.status, 403, 'thiếu Origin (trang lạ gọi chéo) bị chặn trước khi tạo phiên');
  const evil = await request(app, { method: 'POST', path: '/api/admin/local', headers: { Origin: 'http://evil.example' }, body: {} });
  assert.equal(evil.status, 403);
  const rows = await app.persistence.read('count_table', { table: 'admin_audit' });
  assert.ok(rows[0].count >= 1);
}));

test('máy khác trong LAN (mô phỏng): không vào thẳng được (403 NOT_LOCAL), vẫn phải ghép đôi; local reauth bị bỏ qua', async (t) => {
  await withApp(t, { wsIsSelf: () => false, security: { reauthWindowMs: 1000 } }, async (app) => {
    const { r } = await localLogin(app);
    assert.deepEqual([r.status, r.json.code], [403, 'NOT_LOCAL']);
    const s = await pairDevice(app);
    await sleep(1150);
    const re = await call(app, s, 'POST', '/api/admin/reauth', { local: true });
    assert.equal(re.status, 400, 'máy khác gửi local:true không được tính là xác thực lại');
  });
});

test('cùng máy: phiên cũ xác thực lại cục bộ không cần mã rồi làm được thao tác nguy hiểm', async (t) => {
  await withApp(t, { security: { reauthWindowMs: 1000 } }, async (app) => {
    const { s } = await localLogin(app);
    await sleep(1150);
    const stale = await call(app, s, 'POST', '/api/admin/pair-code', {});
    assert.equal(stale.json.code, 'REAUTH_REQUIRED');
    assert.equal((await call(app, s, 'POST', '/api/admin/reauth', { local: true })).status, 200);
    assert.equal((await call(app, s, 'POST', '/api/admin/pair-code', {})).status, 200);
  });
});
