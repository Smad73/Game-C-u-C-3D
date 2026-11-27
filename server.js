// Launcher dùng chung cho macOS và Windows (launchers/macos/*.command, launchers/windows/*.bat chỉ gọi tệp này).
// Việc: kiểm tra Node, hỏi mật khẩu (chế độ điện thoại), áp dụng chế độ chạy (Demo/LIVE) và khôi phục backup đã lên lịch,
// khởi động app, mở trình duyệt vào /control với mã ghép đôi một lần. Mã thoát 75 từ app = "khởi động lại trong cùng tiến trình".
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Cần Node.js từ 22.13 trở lên (đang là ${process.versions.node}). Tải bản LTS tại https://nodejs.org rồi chạy lại.`);
  process.exit(1);
}

const { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } = await import('node:fs');
const { join } = await import('node:path');
const { createApp } = await import('./src/app.js');
const { SettingsError, loadSettings, readAdminPassword } = await import('./src/system/Settings.js');
const { openBrowser, resolveDataDir, terminationSignals } = await import('./src/system/platform.js');
const { promptSecret } = await import('./src/system/promptSecret.js');
const { restorePendingDir, runModeFile } = await import('./src/gameRoutes.js');
const { probeNova, stopNova } = await import('./src/system/instanceProbe.js');

const RESTART = 75;
// Nhịp người xem giả lập mặc định của chế độ Demo (chỉnh được ở Control → Demo).
// Nhịp Demo mặc định = "Chậm" (≈ 1 quà/20 s) cho dễ xem; đổi nhanh ở Control → LIVE/Demo (Chậm/Vừa/Nhanh).
const DEMO_MOCK = { users: 300, commentsPerSec: 0.6, giftsPerSec: 0.05, likesPerSec: 2, followsPerSec: 0.02, sharesPerSec: 0.01, joinsPerSec: 0.15, realisticGifts: true };
function fatal(message, code = 2) {
  console.error(`\n[LỖI] ${message}\n`);
  process.exit(code);
}

/** Chế độ chạy do Control lưu (data/run-mode.json). Không có → Demo (game chạy ngay, dữ liệu vào nova-demo.db). */
function runModeOverrides(settings, dataDir) {
  const f = runModeFile(dataDir);
  let rm = null;
  if (existsSync(f)) { try { rm = JSON.parse(readFileSync(f, 'utf8')); } catch { rm = null; } }
  if (process.env.NOVA_INGEST_MODE) return {}; // biến môi trường thắng
  if (rm?.mode === 'live' && rm.username) return { ingest: { mode: 'live', autoConnect: false, live: { username: rm.username, provider: rm.provider || settings.ingest.live.provider } } };
  if (rm?.mode === 'off') return { ingest: { mode: 'off' } };
  if (rm?.mode === 'demo' || settings.ingest.mode === 'off') return { ingest: { mode: 'demo', autoConnect: true, mock: DEMO_MOCK } };
  return {};
}

/** Khôi phục backup đã lên lịch từ Control: DB hiện tại được CHUYỂN (không xoá) vào backups/pre-restore-<thời điểm>/. */
function applyPendingRestore(dataDir) {
  const dir = restorePendingDir(dataDir);
  const meta = join(dir, 'restore.json');
  if (!existsSync(meta)) return null;
  const { realm, from } = JSON.parse(readFileSync(meta, 'utf8'));
  if (realm !== 'live' && realm !== 'demo') return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const keep = join(dataDir, 'backups', `pre-restore-${realm}-${stamp}`);
  mkdirSync(keep, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const p = join(dataDir, `nova-${realm}.db${suffix}`);
    if (existsSync(p)) renameSync(p, join(keep, `nova-${realm}.db${suffix}`));
  }
  copyFileSync(join(dir, `nova-${realm}.db`), join(dataDir, `nova-${realm}.db`));
  renameSync(dir, join(dataDir, `restore-done-${stamp}`));
  return { realm, from, keep };
}

let current = null;
let signalCount = 0;
let started = 0;

/**
 * Đã có bản NOVA khác chạy trên máy (cổng bận)? Kiểm tra TRƯỚC khi mở dữ liệu. Hỏi người vận hành:
 * c → yêu cầu bản cũ lưu an toàn rồi thoát, chạy bản này; k → giữ bản cũ, mở trang điều khiển của nó.
 */
async function ensureNoOtherInstance(port) {
  const other = await probeNova(port);
  if (!other) return;
  console.log(`\nĐang có một bản NOVA FISHING khác chạy trên máy này (phiên bản ${other.version}, cổng ${port}).`);
  const ans = await ask('Tắt an toàn bản đó rồi mở bản này? Gõ c (có) hoặc k (không) rồi Enter: ');
  if (ans === null) fatal(`Cổng ${port} đang được bản ${other.version} dùng. Đóng cửa sổ của bản đó rồi chạy lại.`);
  if (!/^\s*[cy]/i.test(ans)) {
    console.log('Giữ bản đang chạy. Đang mở trang điều khiển của bản đó…');
    await openBrowser(`http://127.0.0.1:${port}/control/`);
    process.exit(0);
  }
  console.log('Đang yêu cầu bản cũ lưu an toàn rồi thoát…');
  const r = await stopNova(port);
  if (r.ok) { console.log('Bản cũ đã tắt an toàn. Đang khởi động bản này…\n'); return; }
  if (r.reason === 'TOO_OLD') fatal(`Bản đang chạy (${other.version}) chưa hỗ trợ tắt tự động. Mở cửa sổ Terminal của bản đó, nhấn Ctrl+C, đợi báo tắt xong rồi chạy lại bản này.`);
  if (r.reason === 'TIMEOUT') fatal('Bản cũ chưa tắt xong sau 60 giây. Hãy xem cửa sổ của bản đó rồi chạy lại.');
  fatal(`Bản cũ không chịu tắt: ${r.detail ?? 'không rõ lý do'}. Hãy đóng cửa sổ của bản đó rồi chạy lại.`);
}

async function main(adminPassword) {
  const { settings } = loadSettings();
  if (started === 0) await ensureNoOtherInstance(settings.server.port);
  const dataDir = resolveDataDir({ override: settings.dataDir });
  mkdirSync(dataDir, { recursive: true });
  const restored = applyPendingRestore(dataDir);
  if (restored) console.log(`Đã khôi phục ${restored.realm} từ ${restored.from}. DB trước đó được giữ ở: ${restored.keep}`);

  const app = await createApp({
    adminPassword,
    settingsOverrides: runModeOverrides(settings, dataDir),
    exit: (code) => {
      if (code === RESTART) { signalCount = 0; console.log('\nĐang khởi động lại…\n'); main(adminPassword).catch(onStartError); return; }
      process.exit(code);
    }
  });
  current = app;
  started++;

  const pair = app.createPairing();
  const url = app.controlUrl(pair.code);
  const mode = app.settings.ingest.mode;
  console.log('\n=====================================================');
  console.log(' NOVA FISHING LIVE 3D đang chạy');
  console.log(` Chế độ           : ${mode === 'demo' ? 'DEMO (người xem giả lập, dữ liệu riêng nova-demo.db)' : mode === 'live' ? `LIVE @${app.settings.ingest.live.username}` : 'TẮT nguồn sự kiện'}`);
  console.log(` Trang điều khiển : ${app.baseUrl}/control/`);
  console.log(` Màn hình phát    : ${app.stageUrl()}   (thêm vào OBS / TikTok LIVE Studio, 1080x1920)`);
  if (app.settings.server.mode === 'lan') {
    console.log(' CHẾ ĐỘ ĐIỆN THOẠI: kết nối KHÔNG mã hoá (HTTP). Chỉ dùng trên mạng tin cậy.');
    console.log(` Khoá xem stage từ máy khác: thêm ?k=<khoá> (lấy trong trang điều khiển).`);
  }
  if (app.previousRunUnclean) console.log(' Lưu ý: lần chạy trước tắt đột ngột; dữ liệu đã ghi bền vẫn nguyên vẹn.');
  console.log(' Tắt an toàn: nhấn Ctrl+C một lần (hoặc nút "Thoát an toàn" trên trang điều khiển).');
  console.log(' Cần mã ghép đôi mới (xác thực lại / thêm điện thoại): gõ p rồi Enter tại cửa sổ này.');
  console.log('=====================================================\n');

  const wantBrowser = started === 1 && app.settings.launcher?.openBrowserOnStart !== false && process.env.NOVA_NO_BROWSER !== '1';
  const opened = wantBrowser ? await openBrowser(url) : false;
  if (!opened) {
    // Mã ghép đôi dùng một lần, hết hạn sau 2 phút: chỉ in ra màn hình của chính người vận hành, không ghi vào log.
    console.log(`Hãy mở địa chỉ này trong trình duyệt (mã ghép đôi hết hạn sau ${Math.round(pair.ttlMs / 1000)} giây):\n${url}\n`);
  }
}

function onStartError(e) {
  if (e instanceof SettingsError) fatal(e.message);
  if (e && e.code && ['CORRUPT', 'MIGRATION_CHECKSUM', 'DB_NEWER_THAN_APP', 'REALM_MISMATCH', 'MIGRATION_FAILED', 'WAL_UNAVAILABLE'].includes(e.code)) {
    fatal(`Không mở được cơ sở dữ liệu (${e.code}): ${e.message}\nDữ liệu cũ không bị sửa. Hãy khôi phục từ thư mục data/backups hoặc liên hệ hỗ trợ.`);
  }
  fatal(`Không khởi động được: ${e?.message || e}`, 1);
}

// Tín hiệu tắt cài MỘT lần cho cả tiến trình (app có thể khởi động lại): lần 1 lưu an toàn, lần 2 báo chờ, lần 3 buộc thoát.
for (const sig of terminationSignals()) {
  try {
    process.on(sig, () => {
      signalCount++;
      if (!current) process.exit(130);
      if (signalCount === 1) { current.logger.info('Nhận tín hiệu tắt, đang lưu an toàn…', { signal: sig }); current.shutdown.run(`signal:${sig}`); }
      else if (signalCount === 2) console.log('Đang lưu dữ liệu, vui lòng chờ… (nhấn thêm một lần nữa để buộc thoát, có thể mất dữ liệu)');
      else process.exit(130);
    });
  } catch { /* tín hiệu không hỗ trợ trên OS này */ }
}
// Cửa sổ Terminal bị đóng/mất: mọi lệnh ghi ra màn hình lỗi EIO/EPIPE. Trước đây lỗi đó đi vào uncaughtException → console.error
// lại lỗi → vòng lặp 100% CPU, tiến trình chạy ngầm giữ cổng (LESSONS L-024). Nay: nuốt lỗi ghi màn hình và tắt an toàn MỘT lần.
const TERMINAL_GONE = new Set(['EIO', 'EPIPE', 'ENXIO', 'EBADF']);
let terminalGone = false;
function onTerminalGone(reason) {
  if (terminalGone) return;
  terminalGone = true;
  if (!current) process.exit(0);
  if (current.shutdown.state === 'idle') current.shutdown.run(`terminal:${reason}`);
}
for (const stream of [process.stdout, process.stderr, process.stdin]) {
  stream.on('error', (e) => { if (TERMINAL_GONE.has(e?.code)) onTerminalGone(e.code); });
}
for (const kind of ['uncaughtException', 'unhandledRejection']) {
  process.on(kind, (err) => {
    if (TERMINAL_GONE.has(err?.code) && (err?.syscall === 'write' || err?.syscall === 'read' || terminalGone)) { onTerminalGone(err.code); return; }
    console.error(`Lỗi không bắt được (${kind}):`, err?.stack || err);
    if (current && current.shutdown.state === 'idle') current.shutdown.run(kind, { exitCode: 1 });
  });
}

// Lệnh ở cửa sổ khởi chạy: gõ "p" + Enter để lấy mã ghép đôi MỚI (dùng để xác thực lại hoặc ghép thêm thiết bị).
// Câu hỏi có/không ở cửa sổ khởi chạy dùng chung ô nhập này (ask): khi đang chờ trả lời, dòng gõ vào là câu trả lời.
let answerWaiter = null;
function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve(null);
  process.stdout.write(question);
  return new Promise((r) => { answerWaiter = r; });
}
if (process.stdin.isTTY) {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (answerWaiter) { const w = answerWaiter; answerWaiter = null; w(line); return; }
    if (line.trim().toLowerCase() !== 'p' || !current) return;
    const c = current.createPairing();
    console.log(`\nMã ghép đôi mới (dùng một lần, hết hạn sau ${Math.round(c.ttlMs / 1000)} giây):\n  mã   : ${c.code}\n  mở   : ${current.controlUrl(c.code)}\n`);
  });
}

try {
  let adminPassword = readAdminPassword();
  const { settings } = loadSettings();
  if (settings.server.mode === 'lan' && !adminPassword) {
    console.log('Chế độ điện thoại (LAN): cần đặt mật khẩu Admin cho lần chạy này (tối thiểu ' + settings.security.adminPasswordMinLength + ' ký tự).');
    adminPassword = await promptSecret('Mật khẩu Admin (không hiện khi gõ): ');
  }
  await main(adminPassword);
} catch (e) {
  onStartError(e);
}
