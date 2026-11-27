// Điểm DUY NHẤT chứa khác biệt giữa hệ điều hành (ADR-0015, ARCHITECTURE §0.3).
// Phần còn lại của mã nguồn không được kiểm tra process.platform hay gọi lệnh riêng của OS.
import { spawn } from 'node:child_process';
import { statfsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORTED = new Set(['darwin', 'win32']);

/** Thư mục gốc dự án, tính từ vị trí tệp — không dùng đường dẫn tuyệt đối viết cứng. */
export function projectRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** 'darwin' | 'win32' | tên khác (Linux… — ngoài phạm vi V1, vẫn chạy được nhưng không được hỗ trợ). */
export function platformId(proc = process) {
  return proc.platform;
}

export function isSupportedPlatform(id = platformId()) {
  return SUPPORTED.has(id);
}

/** Tên tín hiệu tắt cần bắt (ADR-0012 §6). SIGBREAK chỉ tồn tại trên Windows. */
export function terminationSignals(id = platformId()) {
  return id === 'win32' ? ['SIGINT', 'SIGBREAK', 'SIGHUP', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];
}

/**
 * Thư mục dữ liệu chạy (DB, log, backup). Mặc định <gốc dự án>/data;
 * có thể ghi đè bằng NOVA_DATA_DIR / settings.dataDir (đường dẫn người dùng tự đặt).
 */
export function resolveDataDir({ root = projectRoot(), override = null } = {}) {
  if (override) return isAbsolute(override) ? resolve(override) : resolve(root, override);
  return join(root, 'data');
}

/** Số byte trống của ổ chứa `dir`; null nếu không đo được (ví dụ không hỗ trợ). */
export function freeDiskBytes(dir) {
  try {
    const s = statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** Địa chỉ IPv4 LAN đầu tiên (không phải loopback); null nếu không có. */
export function detectLanAddress(ifaces = networkInterfaces()) {
  for (const list of Object.values(ifaces)) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

/** Lệnh mở URL bằng trình duyệt mặc định của OS. Trả về { cmd, args, options }. */
export function browserOpenCommand(url, id = platformId()) {
  if (id === 'darwin') return { cmd: 'open', args: [url], options: { stdio: 'ignore', detached: true } };
  if (id === 'win32') {
    // `start` là lệnh dựng sẵn của cmd.exe; "" là tiêu đề cửa sổ (bắt buộc khi URL có ký tự đặc biệt).
    return { cmd: 'cmd', args: ['/c', 'start', '""', url], options: { stdio: 'ignore', detached: true, windowsHide: true, windowsVerbatimArguments: true } };
  }
  return { cmd: 'xdg-open', args: [url], options: { stdio: 'ignore', detached: true } };
}

/** Mở trình duyệt; resolve true nếu lệnh khởi chạy được, false nếu lỗi (không ném). */
export function openBrowser(url, { spawnImpl = spawn, id = platformId() } = {}) {
  return new Promise((done) => {
    try {
      const { cmd, args, options } = browserOpenCommand(url, id);
      const child = spawnImpl(cmd, args, options);
      child.once('error', () => done(false));
      child.once('spawn', () => {
        if (typeof child.unref === 'function') child.unref();
        done(true);
      });
    } catch {
      done(false);
    }
  });
}
