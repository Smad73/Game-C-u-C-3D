// API gameplay + WS stage trên server THẬT (createApp, cổng ngẫu nhiên, SQLite + Worker thật, Mock ở realm demo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import { makeTmpDir, removeDir, waitFor } from './helpers.js';

async function withApp(t, over, fn) {
  const dir = makeTmpDir('nova-ghttp-');
  const app = await createApp({ stdout: false, adminPassword: null, env: {}, exit: () => {}, settingsOverrides: { server: { port: 0 }, dataDir: dir, logging: { toFile: false, level: 'debug' }, ...over } });
  try { await fn(app, dir); } finally { await app.stop('test-cleanup').catch(() => {}); removeDir(dir); }
}
function request(app, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const h = { Host: `127.0.0.1:${app.port}`, ...headers };
    if (data !== undefined) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ host: '127.0.0.1', port: app.port, method, path, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch { /* */ } resolve({ status: res.statusCode, text, json, headers: res.headers }); });
    });
    r.on('error', reject);
    r.end(data);
  });
}
const origin = (app) => `http://127.0.0.1:${app.port}`;
async function pair(app) {
  const { code } = app.createPairing();
  const r = await request(app, { method: 'POST', path: '/api/admin/pair', headers: { Origin: origin(app) }, body: { code } });
  return { cookie: r.headers['set-cookie'][0].split(';')[0], csrf: r.json.csrf };
}
const call = (app, s, method, path, body) => request(app, { method, path, body, headers: { Cookie: s.cookie, ...(method !== 'GET' ? { Origin: origin(app), 'X-Nova-CSRF': s.csrf } : {}) } });
const DEMO = { ingest: { mode: 'demo', autoConnect: true, mock: { commentsPerSec: 0, giftsPerSec: 0, likesPerSec: 0, joinsPerSec: 0 } } };

test('API gameplay: cần phiên; danh mục công khai; cấu hình & Gift Mapping lưu bền, được làm sạch, có CSRF', (t) => withApp(t, DEMO, async (app) => {
  const cat = await request(app, { path: '/api/catalog' });
  assert.equal(cat.status, 200);
  assert.ok(cat.json.catalog.species.length >= 20 && cat.json.catalog.rarities.length === 6);
  for (const p of ['/api/game', '/api/gift-rules', '/api/leaderboard?scope=all', '/api/players', '/api/logs', '/api/tiktok/status']) assert.equal((await request(app, { path: p })).status, 401, p);
  const s = await pair(app);
  const noCsrf = await request(app, { method: 'PUT', path: '/api/game/config', headers: { Cookie: s.cookie, Origin: origin(app) }, body: { config: { afkMinutes: 9 } } });
  assert.equal(noCsrf.status, 403, 'thiếu CSRF bị chặn');
  const c = await call(app, s, 'PUT', '/api/game/config', { config: { afkMinutes: 9, detailedSlots: 999, volumes: { music: 5 } } });
  assert.equal(c.status, 200);
  assert.equal(c.json.config.afkMinutes, 9);
  assert.equal(c.json.config.detailedSlots, 40, 'giá trị ngoài khoảng bị kẹp');
  assert.equal(c.json.config.volumes.music, 1);
  const r = await call(app, s, 'PUT', '/api/gift-rules', { rules: { coinFactor: 3, rules: [{ giftId: 42, label: 'X', actions: [{ type: 'xp', amount: 5 }, { type: 'hack', amount: 1 }, { type: 'event', kind: 'BOSS' }] }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.rules.rules[0].actions, [{ type: 'xp', amount: 5 }], 'hành động lạ/không hợp lệ bị loại');
  assert.equal(app.gameConfig.rules.coinFactor, 3);
  const row = (await app.persistence.read('get_setting', { key: 'gift.rules' }))[0];
  assert.ok(row && JSON.parse(row.value).rules[0].giftId === 42, 'lưu bền trong DB');
}));

test('Demo: bơm comment/quà qua Control → người chơi vào câu, quà áp dụng; BXH, hồ sơ, sự kiện, sao lưu, nhật ký không lộ bí mật', (t) => withApp(t, DEMO, async (app) => {
  const s = await pair(app);
  await waitFor(() => app.ingest.conn.state === 'CONNECTED', { what: 'Mock kết nối' });
  assert.equal((await call(app, s, 'POST', '/api/demo/bulk-join', { count: 30, from: 1 })).json.ok, true);
  await waitFor(() => app.world.counts().active >= 30, { timeoutMs: 8000, what: '30 người vào câu' });
  const g = await call(app, s, 'POST', '/api/demo/gift', { user: 1, giftId: 5655, count: 3, diamond: 1 });
  assert.equal(g.json.ok, true);
  await waitFor(async () => (await app.persistence.read('gift_status_counts')).some((x) => x.status === 'APPLIED'), { timeoutMs: 8000, what: 'quà APPLIED' });
  await waitFor(() => app.world.c.catches > 0, { timeoutMs: 30000, what: 'có cá được câu' });
  await app.world.flush({ wait: true });
  await app.leaderboards.refresh();
  const lb = await call(app, s, 'GET', '/api/leaderboard?scope=all&limit=10');
  assert.equal(lb.status, 200);
  assert.ok(lb.json.rows.length >= 1);
  const key = lb.json.rows[0].player_key;
  const prof = await call(app, s, 'GET', `/api/players/${encodeURIComponent(key)}`);
  assert.equal(prof.status, 200);
  assert.ok(prof.json.profile.player.total_score > 0);
  assert.equal(typeof prof.json.ranks.all, 'number');
  const ev = await call(app, s, 'POST', '/api/events/trigger', { kind: 'RAIN' });
  assert.equal(ev.json.ok, true);
  assert.equal((await call(app, s, 'POST', '/api/events/trigger', { kind: 'NOPE' })).status, 400);
  const bk = await call(app, s, 'POST', '/api/db/backup', {});
  assert.equal(bk.json.ok, true);
  assert.ok((await call(app, s, 'GET', '/api/db/backups')).json.backups.some((b) => b.name === bk.json.name));
  const restoreNoConfirm = await call(app, s, 'POST', '/api/db/restore', { name: bk.json.name });
  assert.equal(restoreNoConfirm.status, 403, 'khôi phục là thao tác nguy hiểm');
  const logs = await call(app, s, 'GET', '/api/logs?level=debug');
  assert.ok(logs.json.logs.length > 0);
  assert.ok(!/pair=|csrf"?:\s*"[A-Za-z0-9]/.test(JSON.stringify(logs.json.logs)), 'nhật ký không chứa mã ghép đôi/CSRF');
}));

test('Chế độ chạy: lưu run-mode.json (không chứa bí mật); demo API bị từ chối ở realm LIVE', (t) => withApp(t, {}, async (app, dir) => {
  const s = await pair(app);
  assert.equal((await call(app, s, 'POST', '/api/demo/comment', { text: 'câu' })).status, 409, 'không phải demo → từ chối');
  assert.equal((await call(app, s, 'PUT', '/api/run-mode', { mode: 'live', username: 'bad name!' })).status, 400);
  const r = await call(app, s, 'PUT', '/api/run-mode', { mode: 'live', username: '@kenh_test', provider: 'tiktool', apiKey: 'SHOULD-NOT-BE-SAVED' });
  assert.equal(r.status, 200);
  const f = join(dir, 'run-mode.json');
  assert.ok(existsSync(f));
  const saved = JSON.parse(readFileSync(f, 'utf8'));
  assert.equal(saved.username, 'kenh_test');
  assert.equal(saved.provider, 'tiktool');
  assert.ok(!JSON.stringify(saved).includes('SHOULD-NOT-BE-SAVED'), 'không lưu khoá API');
  const st = await call(app, s, 'GET', '/api/tiktok/status');
  assert.equal(st.json.verifiedOnRealLive, false);
  assert.equal(st.json.providers.tiktool.license, 'MIT');
  assert.ok(!('apiKey' in st.json.providers.tiktool), 'không trả khoá API');
}));

test('WS stage: nhận init (danh mục, cấu hình, BXH) rồi khung 10 Hz chỉ gồm người trong ngân sách hiển thị', (t) => withApp(t, DEMO, async (app) => {
  const s = await pair(app);
  await call(app, s, 'PUT', '/api/game/config', { config: { detailedSlots: 6 } });
  await waitFor(() => app.ingest.conn.state === 'CONNECTED', { what: 'Mock kết nối' });
  await call(app, s, 'POST', '/api/demo/bulk-join', { count: 25, from: 100 });
  await waitFor(() => app.world.counts().active >= 25, { timeoutMs: 8000 });
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws?role=stage`, { headers: { Host: `127.0.0.1:${app.port}` } });
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  await waitFor(() => msgs.filter((m) => m.type === 'frame').length >= 15, { timeoutMs: 8000, what: '15 khung' });
  ws.close();
  const init = msgs.find((m) => m.type === 'init');
  assert.ok(init.catalog.species.length > 0 && init.config.detailedSlots === 6);
  const frames = msgs.filter((m) => m.type === 'frame');
  const last = frames.at(-1);
  assert.ok(last.anglers.length <= 6, 'chỉ vẽ chi tiết trong ngân sách');
  assert.ok(last.counts.active >= 25, 'nhưng mọi người vẫn được mô phỏng và đếm');
  const span = frames.at(-1).t - frames[frames.length - 11].t;
  assert.ok(span >= 700 && span <= 1600, `~10 Hz (10 khung trong ${span} ms)`);
}));
