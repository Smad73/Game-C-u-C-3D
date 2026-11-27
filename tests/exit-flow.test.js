// Khung tắt an toàn (src/shutdown.js) và nhập mật khẩu ẩn (promptSecret) — kiểm thử đơn vị.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ShutdownManager, EXIT } from '../src/shutdown.js';
import { promptSecret } from '../src/system/promptSecret.js';
import { Logger } from '../src/system/Logger.js';
import { sleep } from './helpers.js';

const quiet = new Logger({ level: 'error', stdout: false, toFile: false });
const mk = (over = {}) => {
  const exits = [];
  const m = new ShutdownManager({ logger: quiet, deadlineMs: 600, stepTimeoutMs: 200, exit: (c) => exits.push(c), ...over });
  return { m, exits };
};

test('các bước chạy ĐÚNG THỨ TỰ theo order (rồi theo thứ tự đăng ký); thoát mã 0 khi mọi bước ổn', async () => {
  const { m, exits } = mk();
  const order = [];
  m.register('log', () => order.push('log'), { order: 99 });
  m.register('db', async () => { await sleep(5); order.push('db'); }, { order: 50 });
  m.register('http', () => order.push('http'), { order: 10 });
  m.register('http2', () => order.push('http2'), { order: 10 });
  const rep = await m.run('test');
  assert.deepEqual(order, ['http', 'http2', 'db', 'log']);
  assert.equal(rep.safe, true);
  assert.equal(rep.reason, 'test');
  await sleep(10);
  assert.deepEqual(exits, [EXIT.OK]);
  assert.equal(m.state, 'done');
});

test('idempotent: gọi run nhiều lần chỉ chạy một lần, trả cùng kết quả', async () => {
  const { m, exits } = mk();
  let n = 0;
  m.register('x', async () => { n++; await sleep(20); });
  const [a, b, c] = await Promise.all([m.run('1'), m.run('2'), m.run('3')]);
  assert.equal(n, 1);
  assert.equal(a, b);
  assert.equal(b, c);
  await sleep(10);
  assert.equal(exits.length, 1);
});

test('bước lỗi / quá hạn → các bước SAU vẫn chạy, báo chưa an toàn, mã thoát 3', async () => {
  const { m, exits } = mk();
  const ran = [];
  m.register('loi', () => { throw new Error('hỏng'); }, { order: 1 });
  m.register('treo', () => new Promise(() => {}), { order: 2, timeoutMs: 50 });
  m.register('sau', () => ran.push('sau'), { order: 3 });
  const rep = await m.run('test');
  assert.deepEqual(ran, ['sau'], 'bước sau vẫn chạy dù bước trước hỏng');
  assert.equal(rep.safe, false);
  assert.deepEqual(rep.steps.map((s) => [s.name, s.ok, Boolean(s.timedOut)]), [['loi', false, false], ['treo', false, true], ['sau', true, false]]);
  assert.match(rep.steps[0].error, /hỏng/);
  await sleep(10);
  assert.deepEqual(exits, [EXIT.NOT_FULLY_SAFE]);
});

test('trần thời gian tổng: hết hạn thì bỏ qua các bước còn lại và báo rõ', async () => {
  const { m } = mk({ deadlineMs: 120, stepTimeoutMs: 1000 });
  m.register('cham', () => sleep(150), { order: 1, timeoutMs: 1000 });
  m.register('khong-kip', () => {}, { order: 2 });
  const rep = await m.run('test', { doExit: false });
  assert.equal(rep.safe, false);
  assert.equal(rep.steps[0].timedOut, true, 'bước chậm bị cắt theo thời hạn còn lại');
  assert.equal(rep.steps[1].skipped, true);
  assert.ok(rep.totalMs < 400);
});

test('mã thoát yêu cầu được giữ khi an toàn (lỗi → 1) và nâng lên 3 khi không an toàn', async () => {
  const a = mk();
  a.m.register('ok', () => {});
  await a.m.run('crash', { exitCode: EXIT.ERROR });
  await sleep(10);
  assert.deepEqual(a.exits, [1]);
  const b = mk();
  b.m.register('hong', () => { throw new Error('x'); });
  await b.m.run('crash', { exitCode: EXIT.ERROR });
  await sleep(10);
  assert.deepEqual(b.exits, [3]);
});

test('tín hiệu: lần 1 tắt an toàn; lần 2 chỉ báo đang lưu; lần 3 buộc thoát mã 130', async () => {
  const { m, exits } = mk();
  let finished = false;
  m.register('cham', async () => { await sleep(150); finished = true; });
  const proc = new EventEmitter();
  const installed = m.installSignalHandlers({ proc, signals: ['SIGINT', 'SIGBREAK'] });
  assert.deepEqual(installed, ['SIGINT', 'SIGBREAK']);
  proc.emit('SIGINT');
  assert.equal(m.state, 'running');
  proc.emit('SIGBREAK'); // lần 2: không buộc thoát
  assert.deepEqual(exits, []);
  await sleep(250);
  assert.equal(finished, true, 'bước đang chạy được chờ xong dù có tín hiệu thứ hai');
  assert.deepEqual(exits, [EXIT.OK]);

  const f = mk();
  f.m.register('treo', () => new Promise(() => {}), { timeoutMs: 5000 });
  const p2 = new EventEmitter();
  f.m.installSignalHandlers({ proc: p2, signals: ['SIGINT'] });
  p2.emit('SIGINT'); p2.emit('SIGINT'); p2.emit('SIGINT');
  assert.deepEqual(f.exits, [EXIT.FORCED], 'lần thứ ba buộc thoát ngay');
});

test('lỗi không bắt được → tắt an toàn mã 1 (chỉ một lần)', async () => {
  const { m, exits } = mk();
  let n = 0;
  m.register('luu', () => { n++; });
  const proc = new EventEmitter();
  m.installCrashHandlers({ proc });
  proc.emit('uncaughtException', new Error('boom'));
  proc.emit('unhandledRejection', new Error('boom2'));
  await sleep(40);
  assert.equal(n, 1);
  assert.deepEqual(exits, [EXIT.ERROR]);
});

// ───────── promptSecret ─────────
function fakeTty() {
  const input = new PassThrough();
  input.__testStream = true;
  input.isTTY = true;
  const raw = [];
  input.setRawMode = (v) => raw.push(v);
  const output = new PassThrough();
  let echoed = '';
  output.on('data', (d) => { echoed += d; });
  return { input, output, raw, echoed: () => echoed };
}

test('promptSecret: đọc mật khẩu, KHÔNG in lại ký tự gõ, hỗ trợ xoá lùi, bật/tắt raw mode', async () => {
  const t = fakeTty();
  const p = promptSecret('Mật khẩu: ', { input: t.input, output: t.output });
  t.input.write('abc');
  t.input.write('\u007fd');   // xoá 'c' rồi gõ 'd'
  t.input.write('ê\r');
  assert.equal(await p, 'abdê');
  assert.deepEqual(t.raw, [true, false]);
  const shown = t.echoed();
  assert.ok(shown.includes('Mật khẩu: '));
  for (const ch of ['abd', 'ê']) assert.equal(shown.includes(ch), false, 'không được in lại mật khẩu');
});

test('promptSecret: Ctrl+C huỷ; không có terminal thì từ chối rõ ràng', async () => {
  const t = fakeTty();
  const p = promptSecret('?', { input: t.input, output: t.output });
  t.input.write('ab\u0003');
  await assert.rejects(p, /huỷ/);
  const notty = new PassThrough();
  await assert.rejects(promptSecret('?', { input: notty, output: new PassThrough() }), /Không có terminal tương tác/);
});
