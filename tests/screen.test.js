// Màn hình phát (ADR-0028): bố cục bảng + nhạc nền — làm sạch cấu hình, gộp sâu, API nhạc, CSP khung YouTube chỉ trên stage.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { sanitizeGameConfig, youtubeId, LAYOUT_PANELS } from '../src/game/GameConfig.js';
import { makeTmpDir, removeDir } from './helpers.js';

test('youtubeId: nhận link/mã hợp lệ; từ chối link lạ, javascript:, mã sai độ dài', () => {
  for (const ok of ['dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3', 'https://youtu.be/dQw4w9WgXcQ?si=x', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ']) assert.equal(youtubeId(ok), 'dQw4w9WgXcQ', ok);
  for (const bad of ['', 'javascript:alert(1)', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXc', 'https://youtu.be/<script>', '"><img>']) assert.equal(youtubeId(bad), '', bad);
});

test('bố cục + nhạc: giá trị bị kẹp trong giới hạn; thiếu → mặc định (Diễn biến/TOP tự ẩn khi cận cảnh)', () => {
  const c = sanitizeGameConfig({ layout: { feed: { dx: 99999, dy: -99999, scale: 9, opacity: -1 }, lb: { show: false }, khongco: { show: false } }, music: { mode: 'hack', youtube: 'x', shuffle: 1 } });
  assert.deepEqual(Object.keys(c.layout), Object.keys(LAYOUT_PANELS));
  assert.deepEqual(c.layout.feed, { show: true, dx: 1080, dy: -1920, scale: 2, opacity: 0, hideOnClose: true });
  assert.equal(c.layout.lb.show, false);
  assert.equal(c.layout.banner.hideOnClose, false);
  assert.deepEqual(c.music, { mode: 'synth', youtube: '', shuffle: true });
});

// ───────── HTTP thật ─────────
function req(port, { method = 'GET', path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const h = { Host: `127.0.0.1:${port}`, ...headers };
    if (data !== undefined) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ host: '127.0.0.1', port, method, path, headers: h, agent: false }, (res) => {
      const ch = []; res.on('data', (c) => ch.push(c));
      res.on('end', () => { const text = Buffer.concat(ch).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch { /* */ } resolve({ status: res.statusCode, headers: res.headers, json }); });
    });
    r.on('error', reject); r.end(data);
  });
}

test('HTTP: gộp sâu bố cục (đổi một bảng không mất bảng khác); API nhạc; CSP khung YouTube chỉ ở stage', async (t) => {
  const dir = makeTmpDir('nova-screen-');
  const app = await createApp({ stdout: false, env: {}, exit: () => {}, settingsOverrides: { server: { port: 0 }, dataDir: dir, logging: { toFile: false } } });
  t.after(async () => { await app.stop('test-cleanup').catch(() => {}); removeDir(dir); });
  const port = app.port; const Origin = `http://127.0.0.1:${port}`;
  const login = await req(port, { method: 'POST', path: '/api/admin/local', headers: { Origin }, body: {} });
  const H = { Origin, Cookie: login.headers['set-cookie'][0].split(';')[0], 'X-Nova-CSRF': login.json.csrf };

  let r = await req(port, { method: 'PUT', path: '/api/game/config', headers: H, body: { config: { layout: { feed: { dx: -50, scale: 0.7 } } } } });
  assert.equal(r.status, 200);
  r = await req(port, { method: 'PUT', path: '/api/game/config', headers: H, body: { config: { layout: { lb: { show: false } }, music: { youtube: 'https://youtu.be/dQw4w9WgXcQ' } } } });
  assert.equal(r.json.config.layout.feed.dx, -50, 'đổi bảng TOP không làm mất chỉnh của bảng Diễn biến');
  assert.equal(r.json.config.layout.feed.scale, 0.7);
  assert.equal(r.json.config.layout.lb.show, false);
  assert.equal(r.json.config.music.youtube, 'dQw4w9WgXcQ');
  assert.equal(r.json.config.music.mode, 'synth', 'đổi link không tự đổi chế độ');

  const tracks = await req(port, { path: '/api/music/tracks' });
  assert.equal(tracks.status, 200);
  assert.ok(Array.isArray(tracks.json.tracks));
  assert.ok(tracks.json.tracks.every((x) => /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i.test(x) && !x.includes('/')), 'chỉ tệp nhạc, không có DOC-TRUOC.txt');
  assert.equal((await req(port, { method: 'POST', path: '/api/music/cmd', headers: { Origin }, body: { cmd: 'play' } })).status, 401, 'lệnh nhạc cần phiên Admin');
  assert.equal((await req(port, { method: 'POST', path: '/api/music/cmd', headers: H, body: { cmd: 'rm -rf' } })).status, 400);
  assert.equal((await req(port, { method: 'POST', path: '/api/music/cmd', headers: H, body: { cmd: 'next' } })).status, 200);

  const stage = await req(port, { path: '/stage/' });
  assert.match(stage.headers['content-security-policy'], /frame-src 'self' https:\/\/www\.youtube-nocookie\.com/);
  assert.doesNotMatch(stage.headers['content-security-policy'], /youtube\.com[^-]|script-src[^;]*youtube/, 'không mở script/khung youtube.com thường');
  const control = await req(port, { path: '/control/' });
  assert.doesNotMatch(control.headers['content-security-policy'], /youtube/, 'trang Control không được nhúng YouTube');
});
