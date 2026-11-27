import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { EventEmitter } from 'node:events';
import {
  platformId, isSupportedPlatform, terminationSignals, resolveDataDir, projectRoot, browserOpenCommand,
  openBrowser, detectLanAddress, freeDiskBytes
} from '../src/system/platform.js';
import { loadSettings, SettingsError, assertSecurityPreconditions, readAdminPassword, validateSettings } from '../src/system/Settings.js';
import { Logger, redact } from '../src/system/Logger.js';
import { Metrics } from '../src/system/Metrics.js';
import { appVersion } from '../src/system/version.js';
import { makeTmpDir, removeDir, sleep, captureLogger } from './helpers.js';

// ───────── platform.js ─────────
test('platform: nhận diện OS và tín hiệu tắt theo từng OS', () => {
  assert.equal(platformId({ platform: 'darwin' }), 'darwin');
  assert.ok(isSupportedPlatform('darwin') && isSupportedPlatform('win32'));
  assert.ok(!isSupportedPlatform('linux'), 'Linux ngoài phạm vi V1');
  assert.deepEqual(terminationSignals('darwin'), ['SIGINT', 'SIGTERM', 'SIGHUP']);
  assert.ok(terminationSignals('win32').includes('SIGBREAK'), 'Windows phải bắt SIGBREAK (Ctrl+Break)');
  assert.ok(!terminationSignals('darwin').includes('SIGBREAK'));
});

test('platform: thư mục dữ liệu không dùng đường dẫn viết cứng', () => {
  const root = projectRoot();
  assert.ok(isAbsolute(root));
  assert.equal(resolveDataDir({ root }), join(root, 'data'));
  const base = makeTmpDir();
  try {
    assert.equal(resolveDataDir({ root, override: base }), base);
    assert.equal(resolveDataDir({ root: base, override: 'du-lieu' }), join(base, 'du-lieu'));
  } finally { removeDir(base); }
});

test('platform: lệnh mở trình duyệt đúng cho macOS và Windows (kiểm cấu trúc lệnh, không chạy)', () => {
  const url = 'http://127.0.0.1:8787/control#pair=abc';
  const mac = browserOpenCommand(url, 'darwin');
  assert.equal(mac.cmd, 'open');
  assert.deepEqual(mac.args, [url]);
  const win = browserOpenCommand(url, 'win32');
  assert.equal(win.cmd, 'cmd');
  assert.deepEqual(win.args.slice(0, 3), ['/c', 'start', '""']);
  assert.equal(win.args[3], url);
  assert.equal(win.options.windowsVerbatimArguments, true);
});

test('platform: openBrowser không ném lỗi khi lệnh không chạy được', async () => {
  const failing = () => { const e = new EventEmitter(); e.unref = () => {}; queueMicrotask(() => e.emit('error', new Error('ENOENT'))); return e; };
  assert.equal(await openBrowser('http://x', { spawnImpl: failing, id: 'darwin' }), false);
  const ok = () => { const e = new EventEmitter(); e.unref = () => {}; queueMicrotask(() => e.emit('spawn')); return e; };
  assert.equal(await openBrowser('http://x', { spawnImpl: ok, id: 'win32' }), true);
  const throwing = () => { throw new Error('boom'); };
  assert.equal(await openBrowser('http://x', { spawnImpl: throwing, id: 'darwin' }), false);
});

test('platform: địa chỉ LAN và dung lượng đĩa', () => {
  assert.equal(detectLanAddress({ lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] }), null);
  assert.equal(detectLanAddress({ en0: [{ family: 'IPv6', internal: false, address: 'fe80::1' }, { family: 'IPv4', internal: false, address: '192.168.1.9' }] }), '192.168.1.9');
  const dir = makeTmpDir();
  try {
    const free = freeDiskBytes(dir);
    assert.ok(Number.isFinite(free) && free > 0, `dung lượng trống đo được: ${free}`);
    assert.equal(freeDiskBytes(join(dir, 'khong-ton-tai-xyz')), null);
  } finally { removeDir(dir); }
});

// ───────── Settings.js ─────────
test('settings: nạp lớp default + platform, đóng băng, phiên bản từ package.json', () => {
  const { settings, sources } = loadSettings({ env: {}, platform: 'darwin' });
  assert.equal(settings.server.mode, 'local');
  assert.equal(settings.timezone, 'Asia/Ho_Chi_Minh');
  assert.equal(settings.platform.id, 'darwin');
  assert.ok(sources.includes('config/platform/darwin.json'));
  assert.throws(() => { settings.server.port = 1; }, TypeError, 'cấu hình phải bị đóng băng');
  const w = loadSettings({ env: {}, platform: 'win32' }).settings;
  assert.equal(w.platform.id, 'win32');
  assert.match(appVersion(), /^\d+\.\d+\.\d+/);
});

test('settings: biến môi trường ghi đè, giá trị sai bị từ chối bằng thông báo tiếng Việt', () => {
  const { settings } = loadSettings({ env: { NOVA_PORT: '9001', NOVA_MODE: 'lan', NOVA_LOG_LEVEL: 'debug' } });
  assert.equal(settings.server.port, 9001);
  assert.equal(settings.server.mode, 'lan');
  assert.equal(settings.logging.level, 'debug');
  assert.throws(() => loadSettings({ env: { NOVA_PORT: 'abc' } }), (e) => e instanceof SettingsError && /server\.port/.test(e.message));
  assert.throws(() => loadSettings({ env: { NOVA_MODE: 'khac' } }), (e) => e instanceof SettingsError && /server\.mode/.test(e.message));
  assert.ok(validateSettings({ persistence: { writeBufferSoftMax: 10, writeBufferHardMax: 5 } }).some((p) => /SoftMax/.test(p)));
});

test('settings: tệp cấu hình hỏng hoặc thiếu → lỗi rõ ràng', () => {
  const root = makeTmpDir();
  try {
    assert.throws(() => loadSettings({ root, env: {} }), (e) => e instanceof SettingsError && /Không tìm thấy/.test(e.message));
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'config', 'default.json'), '{ không phải json');
    assert.throws(() => loadSettings({ root, env: {} }), (e) => e instanceof SettingsError && /JSON/.test(e.message));
  } finally { removeDir(root); }
});

test('settings: chế độ LAN bắt buộc mật khẩu Admin đủ dài; mật khẩu không nằm trong Settings', () => {
  const { settings } = loadSettings({ env: { NOVA_MODE: 'lan' } });
  assert.throws(() => assertSecurityPreconditions(settings, null), (e) => e instanceof SettingsError && /bắt buộc/.test(e.message));
  assert.throws(() => assertSecurityPreconditions(settings, 'ngan'), /quá ngắn/);
  assert.doesNotThrow(() => assertSecurityPreconditions(settings, 'mat-khau-du-dai-123'));
  const local = loadSettings({ env: {} }).settings;
  assert.doesNotThrow(() => assertSecurityPreconditions(local, null), 'chế độ local không bắt buộc mật khẩu');
  assert.equal(readAdminPassword({ NOVA_ADMIN_PASSWORD: 'x' }), 'x');
  assert.ok(!JSON.stringify(settings).includes('password') || !/NOVA_ADMIN/.test(JSON.stringify(settings)));
});

// ───────── Logger.js ─────────
test('logger: che khoá nhạy cảm và giá trị dạng password=…', () => {
  const r = redact({ user: 'a', password: 'hunter2', nested: { Authorization: 'Bearer x', pairCode: 'zzz', ok: 1 }, msg: 'dang nhap token=abc123 xong' });
  assert.equal(r.password, '***');
  assert.equal(r.nested.Authorization, '***');
  assert.equal(r.nested.pairCode, '***');
  assert.equal(r.nested.ok, 1);
  assert.match(r.msg, /token=\*\*\*/);
  assert.ok(!JSON.stringify(r).includes('hunter2'));
});

test('logger: lọc theo mức, in stdout, ghi tệp JSON theo ngày UTC', async () => {
  const dir = makeTmpDir();
  try {
    const lines = [];
    const fixed = new Date('2026-11-24T10:00:00.000Z');
    const log = new Logger({ level: 'info', dir, now: () => fixed, writeStdout: (s) => lines.push(s) });
    log.debug('khong hien');
    log.child('db').info('xin chao', { password: 'bi-mat', n: 5 });
    log.warn('canh bao');
    await log.close();
    assert.equal(lines.length, 2);
    assert.match(lines[0], /INFO\s+\[db\] xin chao/);
    assert.ok(!lines.join('').includes('bi-mat'));
    const file = join(dir, 'app-2026-11-24.log');
    assert.ok(existsSync(file));
    const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].component, 'db');
    assert.equal(rows[0].fields.password, '***');
  } finally { removeDir(dir); }
});

test('logger: dọn tệp log cũ hơn số ngày giữ, không đụng tệp lạ', async () => {
  const dir = makeTmpDir();
  try {
    const old = join(dir, 'app-2020-01-01.log');
    const alien = join(dir, 'ghi-chu-cua-nguoi-dung.txt');
    writeFileSync(old, 'x');
    writeFileSync(alien, 'x');
    const past = new Date('2020-01-02T00:00:00Z');
    utimesSync(old, past, past);
    utimesSync(alien, past, past);
    const log = new Logger({ dir, stdout: false, retainDays: 7 });
    await log.close();
    const left = readdirSync(dir);
    assert.ok(!left.includes('app-2020-01-01.log'), 'tệp log cũ phải bị dọn');
    assert.ok(left.includes('ghi-chu-cua-nguoi-dung.txt'), 'không được xoá tệp không phải log của Logger');
  } finally { removeDir(dir); }
});

test('logger: không ghi được tệp thì vẫn chạy (chuyển sang stdout), không ném lỗi', () => {
  const base = makeTmpDir();
  try {
    const blocker = join(base, 'la-mot-tep');
    writeFileSync(blocker, 'x');
    const { logger, lines } = captureLogger(Logger);
    const broken = new Logger({ dir: join(blocker, 'con'), writeStdout: (s) => lines.push(s) });
    assert.doesNotThrow(() => broken.info('van chay'));
    assert.ok(lines.some((l) => l.includes('van chay')));
    assert.ok(logger);
  } finally { removeDir(base); }
});

// ───────── Metrics.js ─────────
test('metrics: bộ đếm, giá trị, bộ nhớ và độ trễ event loop đo được thật', async () => {
  // Chu kỳ lấy mẫu rất dài: test tự gọi sample() để cửa sổ chứa đỉnh trễ không bị cửa sổ sau ghi đè.
  const m = new Metrics({ sampleEveryMs: 600000 });
  try {
    m.inc('http.requests');
    m.inc('http.requests', 2);
    m.set('ws.clients', 4);
    await sleep(40); // khởi động bộ đo: Node bỏ qua lần đo đầu tiên (chưa có mốc trước đó)
    const busyUntil = Date.now() + 120;
    while (Date.now() < busyUntil) { /* chặn event loop có chủ ý để đo được độ trễ */ }
    await sleep(40); // cho bộ đo của Node ghi nhận độ trễ vừa xảy ra
    const w = m.sample();
    assert.ok(w.maxMs >= 50, `độ trễ event loop tối đa đo được = ${w.maxMs}ms (kỳ vọng ≥ 50ms sau khi chặn 120ms)`);
    const snap = m.snapshot();
    assert.equal(snap.counters['http.requests'], 3);
    assert.equal(snap.gauges['ws.clients'], 4);
    assert.ok(snap.process.rssMb > 0 && snap.process.heapUsedMb > 0);
    assert.equal(snap.eventLoop.maxMs, w.maxMs);
  } finally { m.close(); }
});
