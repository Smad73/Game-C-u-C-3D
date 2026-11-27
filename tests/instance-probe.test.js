// Launcher: phát hiện bản NOVA đang chạy và tắt an toàn nó trước khi chạy bản mới (src/system/instanceProbe.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { probeNova, stopNova } from '../src/system/instanceProbe.js';
import { makeTmpDir, removeDir, waitFor } from './helpers.js';

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

test('probe: cổng trống → null; chương trình khác (không phải NOVA) → null', async () => {
  const tmp = http.createServer();
  const free = await listen(tmp);
  await new Promise((r) => tmp.close(r)); // lấy một cổng rồi đóng → cổng trống
  assert.equal(await probeNova(free), null);
  const srv = http.createServer((_q, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); });
  const other = await listen(srv);
  try {
    assert.equal(await probeNova(other), null, 'trả ok nhưng không đúng dạng health của NOVA');
  } finally { srv.close(); srv.closeAllConnections(); }
});

test('probe + stop: nhận ra bản NOVA đang chạy, yêu cầu lưu an toàn rồi thoát, chờ tới khi cổng trống', async (t) => {
  const dir = makeTmpDir('nova-probe-');
  const exits = [];
  const app = await createApp({ stdout: false, env: {}, exit: (c) => exits.push(c), settingsOverrides: { server: { port: 0 }, dataDir: dir, logging: { toFile: false } } });
  t.after(async () => { await app.stop('test-cleanup').catch(() => {}); removeDir(dir); });
  const found = await probeNova(app.port);
  assert.equal(found?.version, app.version ?? found?.version);
  assert.equal(typeof found.version, 'string');
  const r = await stopNova(app.port, { waitMs: 20000, pollMs: 100 });
  assert.deepEqual(r, { ok: true });
  await waitFor(() => exits.length > 0, { what: 'bản cũ gọi exit' });
  assert.equal(exits[0], 0, 'tắt an toàn, mã 0');
  assert.equal(await probeNova(app.port), null, 'cổng đã trống');
});

test('stop: bản cũ chưa có đường vào thẳng cùng máy → TOO_OLD (người dùng tự đóng cửa sổ)', async () => {
  const srv = http.createServer((q, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (q.url === '/api/health') return res.end(JSON.stringify({ ok: true, version: '0.4.0', persist: 'READY', mode: 'local' }));
    res.statusCode = 404; return res.end('{"ok":false}');
  });
  const port = await listen(srv);
  try {
    assert.deepEqual(await probeNova(port), { version: '0.4.0', mode: 'local' });
    assert.deepEqual(await stopNova(port, { waitMs: 500 }), { ok: false, reason: 'TOO_OLD' });
  } finally { srv.close(); srv.closeAllConnections(); }
});
