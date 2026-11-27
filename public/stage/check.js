// Trang kiểm tra màn hình phát (Phase 1) — KHÔNG có logic game. Kiểm: WebGL2, Three.js tự host, canvas 1080×1920,
// FPS, WebSocket tới server, âm thanh (WebAudio), chữ tiếng Việt. Kết quả báo về server qua /ws?role=stage để hiện ở trang điều khiển.
// Chỉ dùng textContent (không innerHTML) và không có style nội tuyến (CSP).
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const TARGET_FPS = Number(params.get('fps')) || 30; // thiết kế: khoá 30 FPS để nhường CPU cho phần mềm phát (ARCHITECTURE Phụ lục A)

const report = {
  webgl2: false, renderer: null, vendor: null, maxTextureSize: null, fps: 0,
  canvas: { w: 1080, h: 1920 }, viewport: { w: 0, h: 0 }, devicePixelRatio: 1,
  audio: { ok: false, state: 'chưa kiểm' }, ws: { rttMs: null }, three: { ok: false, revision: null },
  font: { vietnameseOk: false }, userAgent: navigator.userAgent
};
const ui = { wsState: 'đang kết nối…', wsOpen: false, threeError: null, software: false, audioHint: '' };

// ───────── co giãn khung 1080×1920 vừa cửa sổ (trong OBS đặt đúng 1080×1920 thì tỉ lệ = 1) ─────────
const frame = $('frame');
function fit() {
  const s = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
  frame.style.transform = `scale(${s})`;
  report.viewport = { w: window.innerWidth, h: window.innerHeight };
  report.devicePixelRatio = window.devicePixelRatio || 1;
}
window.addEventListener('resize', fit);
document.addEventListener('visibilitychange', () => { frames = 0; windowStart = performance.now(); }); // bỏ số đo lẫn giai đoạn ẩn
fit();
if (params.get('guides') !== '0') $('guides').hidden = false;

// ───────── WebGL2 ─────────
function probeWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    report.webgl2 = true;
    report.renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    report.vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
    report.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    ui.software = /swiftshader|llvmpipe|software|basic render/i.test(report.renderer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch (e) {
    report.webgl2 = false;
    report.renderer = `lỗi: ${e.message}`;
  }
}

// ───────── Three.js (tự host trong /vendor) — khối xoay chỉ để kiểm hình + FPS ─────────
let frames = 0;
let windowStart = performance.now();
function countFrame() {
  frames++;
  const now = performance.now();
  if (now - windowStart >= 1000) {
    report.fps = Math.round(((frames * 1000) / (now - windowStart)) * 10) / 10;
    frames = 0;
    windowStart = now;
    render();
  }
}

async function startThree() {
  let THREE;
  try {
    THREE = await import('/vendor/three/three.module.js');
  } catch (e) {
    ui.threeError = `không nạp được Three.js: ${e.message}`;
    return startFallback();
  }
  try {
    const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(1080, 1920, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07162b);
    const camera = new THREE.PerspectiveCamera(45, 1080 / 1920, 0.1, 100);
    camera.position.set(0, 0, 9);
    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a2a44, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 5, 6);
    scene.add(sun);
    const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1.6, 0.5, 160, 24), new THREE.MeshStandardMaterial({ color: 0x35b6ff, roughness: 0.35, metalness: 0.2 }));
    mesh.position.y = -1.6;
    scene.add(mesh);
    report.three = { ok: true, revision: String(THREE.REVISION) };
    let last = 0;
    const loop = (t) => {
      requestAnimationFrame(loop);
      if (t - last < 1000 / TARGET_FPS - 2) return; // khoá FPS
      last = t;
      mesh.rotation.x += 0.02;
      mesh.rotation.y += 0.03;
      renderer.render(scene, camera);
      countFrame();
    };
    requestAnimationFrame(loop);
  } catch (e) {
    ui.threeError = `Three.js lỗi khi dựng: ${e.message}`;
    startFallback();
  }
}

/** Dự phòng khi Three.js lỗi: vẫn đo FPS bằng WebGL2 thô để biết lỗi nằm ở Three.js hay ở WebGL. */
function startFallback() {
  const gl = $('gl').getContext('webgl2');
  if (!gl) return;
  let last = 0;
  const loop = (t) => {
    requestAnimationFrame(loop);
    if (t - last < 1000 / TARGET_FPS - 2) return;
    last = t;
    const v = (Math.sin(t / 700) + 1) / 2;
    gl.clearColor(0.03, 0.09 + v * 0.1, 0.17 + v * 0.2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    countFrame();
  };
  requestAnimationFrame(loop);
}

// ───────── âm thanh (WebAudio) ─────────
let audioCtx = null;
function ensureAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  } catch (e) {
    report.audio = { ok: false, state: `lỗi: ${e.message}` };
    return null;
  }
}
function syncAudio() {
  if (!audioCtx) return;
  report.audio = { ok: audioCtx.state === 'running', state: audioCtx.state };
  ui.audioHint = audioCtx.state === 'suspended' ? 'Bị chặn tự phát — trong OBS thường tự bật; trình duyệt thường cần bấm nút.' : '';
}
async function tryResume() {
  const c = ensureAudio();
  if (!c) return;
  try { await c.resume(); } catch { /* bị chặn */ }
  syncAudio();
}
function beep() {
  const c = ensureAudio();
  if (!c) return;
  c.resume().then(() => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    gain.gain.value = 0.05; // nhỏ, tránh làm giật mình
    osc.frequency.value = 660;
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.25);
    syncAudio();
    render();
  }).catch(() => { syncAudio(); render(); });
}
$('beep').addEventListener('click', beep);
if (params.get('beep') === '1') setInterval(beep, 3000); // chỉ khi cố ý bật để kiểm mức âm trong OBS

// ───────── chữ tiếng Việt (so độ rộng glyph với ký tự thiếu) ─────────
function probeFont() {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '40px sans-serif';
    const w = (s) => ctx.measureText(s).width;
    report.font.vietnameseOk = w('ằẳẵặ') > 0 && w('ằẳẵặ') !== w('￿￿￿￿');
  } catch { report.font.vietnameseOk = false; }
}

// ───────── WebSocket tới server ─────────
let ws = null;
let backoff = 1000;
function connect() {
  const k = params.get('k');
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?role=stage${k ? `&k=${encodeURIComponent(k)}` : ''}`;
  ws = new WebSocket(url);
  ws.onopen = () => { ui.wsState = 'đã kết nối'; ui.wsOpen = true; backoff = 1000; render(); };
  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.type === 'pong' && Number.isFinite(m.t)) report.ws.rttMs = Math.round(performance.now() - m.t);
    } catch { /* bỏ qua */ }
  };
  ws.onclose = () => {
    ui.wsState = `mất kết nối — thử lại sau ${Math.round(backoff / 1000)}s`;
    ui.wsOpen = false;
    render();
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 10000);
  };
  ws.onerror = () => { /* onclose sẽ xử lý */ };
}
setInterval(() => {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'ping', t: Math.round(performance.now()) }));
  ws.send(JSON.stringify({ type: 'metrics', report }));
}, 2000);

// ───────── hiển thị ─────────
function setCell(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  el.className = cls || '';
}
function render() {
  fit(); // cửa sổ có thể đổi kích thước/hiện ra sau khi trang đã tải (ví dụ Browser Source)
  syncAudio();
  setCell('r-webgl2', report.webgl2 ? 'CÓ (WebGL2)' : 'KHÔNG — game 3D không chạy được', report.webgl2 ? 'ok' : 'bad');
  setCell('r-renderer', `${report.renderer ?? '—'}${ui.software ? '  ⚠ render bằng CPU (rất chậm)' : ''}`, ui.software ? 'warn' : '');
  setCell('r-three', report.three.ok ? `OK — r${report.three.revision}` : (ui.threeError || 'đang nạp…'), report.three.ok ? 'ok' : (ui.threeError ? 'bad' : ''));
  setCell('r-canvas', `${report.canvas.w} × ${report.canvas.h}`, '');
  setCell('r-viewport', `${report.viewport.w} × ${report.viewport.h}  (DPR ${report.devicePixelRatio})`, '');
  const hidden = document.hidden; // tab/cửa sổ ẩn: trình duyệt hạ requestAnimationFrame còn ~1 Hz, FPS lúc này không có ý nghĩa
  report.hidden = hidden;
  setCell('r-fps', hidden ? `${report.fps} — trang đang ẨN, không đo FPS` : `${report.fps} / ${TARGET_FPS}`, hidden ? 'warn' : (report.fps >= TARGET_FPS * 0.8 ? 'ok' : (report.fps > 0 ? 'warn' : '')));
  setCell('r-ws', `${ui.wsState}${report.ws.rttMs !== null ? `  · RTT ${report.ws.rttMs}ms` : ''}`, ui.wsOpen ? 'ok' : 'bad');
  setCell('r-audio', `${report.audio.state}${ui.audioHint ? ` — ${ui.audioHint}` : ''}`, report.audio.ok ? 'ok' : 'warn');
  setCell('r-font', report.font.vietnameseOk ? 'hiển thị được dấu tiếng Việt' : 'có thể thiếu glyph tiếng Việt', report.font.vietnameseOk ? 'ok' : 'bad');
  setCell('r-ua', report.userAgent, 'small');

  const problems = [];
  if (!report.webgl2) problems.push('KHÔNG CÓ WEBGL2');
  if (!report.three.ok) problems.push('THREE.JS CHƯA CHẠY');
  if (!ui.wsOpen) problems.push('CHƯA KẾT NỐI SERVER');
  if (!hidden && report.fps > 0 && report.fps < TARGET_FPS * 0.8) problems.push(`FPS THẤP (${report.fps})`);
  const v = $('verdict');
  if (hidden && problems.length === 0) { v.textContent = 'TRANG ĐANG ẨN — chưa đo được FPS'; v.className = 'verdict wait'; }
  else if (report.fps === 0 && problems.length === 0) { v.textContent = 'ĐANG KIỂM TRA…'; v.className = 'verdict wait'; }
  else if (problems.length === 0) { v.textContent = 'ĐẠT: hình + kết nối'; v.className = 'verdict ok'; }
  else { v.textContent = problems.join(' · '); v.className = 'verdict bad'; }
}

probeWebGL2();
probeFont();
render();
connect();
tryResume();
startThree();
setInterval(render, 1000);
