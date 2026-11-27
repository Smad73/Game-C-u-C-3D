// Kiểm thử mức TIẾN TRÌNH THẬT: chạy `node server.js` như người dùng chạy, gửi tín hiệu thật (SIGINT, SIGKILL).
// Chỉ chạy trên macOS ở Phase 1 (tín hiệu Windows khác — thuộc Windows Validation, xem PLATFORM_COMPATIBILITY_MATRIX).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { projectRoot } from '../src/system/platform.js';
import { makeTmpDir, removeDir, waitFor } from './helpers.js';

const SERVER = join(projectRoot(), 'server.js');

function launch(dir, extraEnv = {}) {
  const env = { ...process.env, NOVA_NO_BROWSER: '1', NOVA_PORT: '0', NOVA_DATA_DIR: dir, NOVA_LOG_LEVEL: 'info', ...extraEnv };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const child = spawn(process.execPath, [SERVER], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const proc = { child, out: '', err: '', exit: null };
  child.stdout.on('data', (d) => { proc.out += d; });
  child.stderr.on('data', (d) => { proc.err += d; });
  proc.exited = new Promise((res) => child.on('exit', (code, signal) => { proc.exit = { code, signal }; res(proc.exit); }));
  return proc;
}

const portOf = (p) => Number(/Trang điều khiển\s*:\s*http:\/\/127\.0\.0\.1:(\d+)\//.exec(p.out)?.[1]);
const pairUrlOf = (p) => /(http:\/\/127\.0\.0\.1:\d+\/control\/#pair=[\w-]+)/.exec(p.out)?.[1];
const all = (p) => p.out + p.err;

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(t) }));
    }).on('error', reject);
  });
}
function post(port, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Origin: `http://127.0.0.1:${port}`, ...headers } }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(t) }));
    });
    r.on('error', reject);
    r.end(data);
  });
}

async function started(p) {
  await waitFor(() => portOf(p) || p.exit, { timeoutMs: 15000, what: 'server khởi động' });
  assert.ok(!p.exit, `server thoát sớm: ${all(p)}`);
  await waitFor(() => pairUrlOf(p), { timeoutMs: 5000, what: 'URL ghép đôi' });
  return portOf(p);
}

test('tiến trình thật: khởi động → health OK → SIGINT → tắt an toàn mã 0 → lần sau KHÔNG báo tắt đột ngột', async () => {
  const dir = makeTmpDir('nova-proc-');
  try {
    const a = launch(dir);
    const port = await started(a);
    const h = await get(port, '/api/health');
    assert.equal(h.json.ok, true);
    assert.equal(h.json.persist, 'READY');
    assert.ok(!/KHÔNG được tắt an toàn/.test(all(a)), 'lần chạy đầu không có cảnh báo tắt đột ngột');

    const t0 = Date.now();
    a.child.kill('SIGINT');
    const ex = await a.exited;
    assert.deepEqual(ex, { code: 0, signal: null }, `thoát mã 0 (đã lưu an toàn). Log:\n${all(a)}`);
    assert.ok(Date.now() - t0 < 5000, `tắt trong ${Date.now() - t0}ms`);
    assert.match(all(a), /Nhận tín hiệu tắt/);
    assert.match(all(a), /Đã lưu an toàn/);
    for (const step of ['ngừng nhận kết nối', 'ghi trạng thái dừng', 'đóng lớp ghi dữ liệu', 'đóng nhật ký']) assert.match(all(a), new RegExp(`Bước tắt xong.*${step}`), `bước: ${step}`);

    const b = launch(dir);
    const port2 = await started(b);
    assert.ok(!/KHÔNG được tắt an toàn/.test(all(b)), 'tắt an toàn rồi thì lần sau không báo đột ngột');
    assert.equal((await get(port2, '/api/health')).json.persist, 'READY');
    b.child.kill('SIGINT');
    assert.equal((await b.exited).code, 0);
  } finally { removeDir(dir); }
});

test('tiến trình thật: SIGKILL (crash đột ngột) → lần sau phát hiện tắt đột ngột, DB vẫn toàn vẹn, chạy lại bình thường', async () => {
  const dir = makeTmpDir('nova-kill-');
  try {
    const a = launch(dir);
    await started(a);
    a.child.kill('SIGKILL');
    assert.deepEqual(await a.exited, { code: null, signal: 'SIGKILL' });

    const b = launch(dir);
    const port = await started(b);
    assert.match(all(b), /KHÔNG được tắt an toàn/, 'phát hiện lần chạy trước bị dừng đột ngột');
    assert.match(b.out, /lần chạy trước tắt đột ngột/);
    assert.equal((await get(port, '/api/health')).json.persist, 'READY', 'WAL được phục hồi, DB mở được');
    assert.match(all(b), /"migrationsApplied":\[\]/, 'không chạy lại migration sau crash');
    b.child.kill('SIGINT');
    assert.equal((await b.exited).code, 0);

    const c = launch(dir); // sau một lần tắt an toàn, cờ đột ngột được xoá
    await started(c);
    assert.ok(!/KHÔNG được tắt an toàn/.test(all(c)));
    c.child.kill('SIGINT');
    await c.exited;
  } finally { removeDir(dir); }
});

test('tiến trình thật: ghép đôi bằng URL launcher in ra → "Thoát an toàn" qua API → tiến trình thoát mã 0', async () => {
  const dir = makeTmpDir('nova-api-stop-');
  try {
    const a = launch(dir);
    const port = await started(a);
    const code = new URL(pairUrlOf(a)).hash.replace('#pair=', '');
    const paired = await post(port, '/api/admin/pair', {}, { code });
    assert.equal(paired.status, 200);
    const cookie = paired.headers['set-cookie'][0].split(';')[0];
    const h = { Cookie: cookie, 'X-Nova-CSRF': paired.json.csrf };
    assert.equal((await post(port, '/api/world/stop', h, {})).json.code, 'CONFIRM_REQUIRED');
    assert.equal((await post(port, '/api/world/stop', h, { confirm: 'XAC NHAN' })).status, 202);
    assert.deepEqual(await a.exited, { code: 0, signal: null }, all(a));
    assert.match(all(a), /Đã lưu an toàn/);
    // Mã chỉ được in ở khung thông báo cho người vận hành (không phải log): kiểm các dòng do Logger in + mọi tệp log trên đĩa.
    const loggerLines = all(a).split('\n').filter((l) => /^\d{4}-\d{2}-\d{2}T/.test(l));
    assert.ok(loggerLines.length > 5);
    assert.equal(loggerLines.some((l) => l.includes(code)), false, 'mã ghép đôi KHÔNG được xuất hiện trong dòng log');
    const logFiles = readdirSync(join(dir, 'logs')).filter((f) => f.endsWith('.log'));
    assert.ok(logFiles.length >= 1, 'có tệp log trên đĩa');
    for (const f of logFiles) {
      const text = readFileSync(join(dir, 'logs', f), 'utf8');
      assert.equal(text.includes(code), false, `${f} không được chứa mã ghép đôi`);
      assert.equal(text.includes(paired.json.csrf), false, `${f} không được chứa mã CSRF`);
      assert.equal(text.includes(cookie.split('=')[1]), false, `${f} không được chứa token phiên`);
    }
  } finally { removeDir(dir); }
});

test('tiến trình thật: cổng đang bận bởi bản NOVA khác → báo phiên bản, KHÔNG mở dữ liệu, thoát mã 2, không treo', async () => {
  const dir1 = makeTmpDir('nova-busy1-');
  const dir2 = makeTmpDir('nova-busy2-');
  let a = null;
  try {
    a = launch(dir1);
    const port = await started(a);
    const b = launch(dir2, { NOVA_PORT: String(port) }); // không có terminal → không hỏi được → dừng
    const ex = await b.exited;
    assert.equal(ex.code, 2, all(b));
    assert.match(all(b), /Đang có một bản NOVA FISHING khác chạy trên máy này \(phiên bản [\d.]+, cổng \d+\)/);
    assert.match(all(b), /Cổng \d+ đang được bản [\d.]+ dùng/);
    assert.ok(!existsSync(join(dir2, 'nova-demo.db')) && !existsSync(join(dir2, 'nova.db')), 'phát hiện TRƯỚC khi mở cơ sở dữ liệu');
  } finally {
    if (a) { a.child.kill('SIGINT'); await a.exited; } // luôn dừng tiến trình con, kể cả khi assert lỗi (tránh treo bộ test)
    removeDir(dir1); removeDir(dir2);
  }
});

test('tiến trình thật: chế độ LAN không có terminal/mật khẩu → từ chối khởi động; mật khẩu quá ngắn → mã 2', async () => {
  const dir = makeTmpDir('nova-lan-proc-');
  try {
    const a = launch(dir, { NOVA_MODE: 'lan', NOVA_LAN_HOST: '127.0.0.1' });
    const ex = await a.exited;
    assert.equal(ex.code, 1);
    assert.match(all(a), /Không có terminal tương tác/);
    assert.ok(!/Server đang chạy/.test(all(a)));

    const b = launch(dir, { NOVA_MODE: 'lan', NOVA_LAN_HOST: '127.0.0.1', NOVA_ADMIN_PASSWORD: 'ngan' });
    assert.equal((await b.exited).code, 2);
    assert.match(all(b), /quá ngắn/);
    assert.equal(/\bngan\b/.test(all(b)), false, 'mật khẩu đã nhập không được in lại ra màn hình/log');
  } finally { removeDir(dir); }
});

test('tiến trình thật: cấu hình sai → thông báo tiếng Việt, mã 2', async () => {
  const dir = makeTmpDir('nova-badcfg-');
  try {
    const a = launch(dir, { NOVA_PORT: 'abc' });
    assert.equal((await a.exited).code, 2);
    assert.match(all(a), /server\.port/);
  } finally { removeDir(dir); }
});
