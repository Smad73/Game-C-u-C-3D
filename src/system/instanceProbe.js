// Phát hiện / tắt an toàn một bản NOVA khác đang chạy trên cùng máy (launcher dùng TRƯỚC khi mở dữ liệu).
// Chỉ nói chuyện với 127.0.0.1 (cùng máy) qua đúng các API công khai/Admin sẵn có — không có đường tắt nào khác.
// Tắt an toàn: vào thẳng cùng máy (ADR-0027) → /api/world/stop với chuỗi xác nhận, như bấm "Thoát an toàn" trên Control.
import http from 'node:http';

const CONFIRM = 'XAC NHAN';

function req(port, { method = 'GET', path, headers = {}, body, timeoutMs = 1500 }) {
  return new Promise((resolve) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const h = { Host: `127.0.0.1:${port}`, ...headers };
    if (data !== undefined) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ host: '127.0.0.1', port, method, path, headers: h, timeout: timeoutMs, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* không phải JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json });
      });
    });
    r.on('timeout', () => { r.destroy(); resolve(null); });
    r.on('error', () => resolve(null));
    r.end(data);
  });
}

/** Có bản NOVA đang nghe ở cổng này không? → {version, mode} hoặc null (cổng trống / chương trình khác). */
export async function probeNova(port) {
  const r = await req(port, { path: '/api/health' });
  if (!r || r.status !== 200 || r.json?.ok !== true || typeof r.json.version !== 'string' || !('persist' in r.json)) return null;
  return { version: r.json.version, mode: r.json.mode ?? null };
}

/**
 * Yêu cầu bản đang chạy tắt an toàn rồi chờ cổng trống.
 * @returns {Promise<{ok:true}|{ok:false, reason:'TOO_OLD'|'REFUSED'|'TIMEOUT', detail?:string}>}
 *   TOO_OLD: bản cũ chưa có đường vào thẳng cùng máy (trước 0.4.1) → người dùng tự đóng cửa sổ đó.
 */
export async function stopNova(port, { waitMs = 60000, pollMs = 500 } = {}) {
  const origin = `http://127.0.0.1:${port}`;
  const login = await req(port, { method: 'POST', path: '/api/admin/local', headers: { Origin: origin }, body: {} });
  if (!login || login.status === 404) return { ok: false, reason: 'TOO_OLD' };
  if (login.status !== 200 || !login.json?.csrf) return { ok: false, reason: 'REFUSED', detail: login.json?.message };
  const cookie = String(login.headers['set-cookie']?.[0] ?? '').split(';')[0];
  const stop = await req(port, { method: 'POST', path: '/api/world/stop', headers: { Origin: origin, Cookie: cookie, 'X-Nova-CSRF': login.json.csrf }, body: { confirm: CONFIRM } });
  if (!stop || stop.status !== 202) return { ok: false, reason: 'REFUSED', detail: stop?.json?.message };
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, pollMs));
    if (!(await req(port, { path: '/api/health', timeoutMs: 800 }))) return { ok: true };
  }
  return { ok: false, reason: 'TIMEOUT' };
}
