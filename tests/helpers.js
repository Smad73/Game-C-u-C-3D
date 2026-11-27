// Tiện ích dùng chung cho test. Chỉ dùng API Node đa nền tảng (os.tmpdir, path) — không đường dẫn viết cứng.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function makeTmpDir(prefix = 'nova-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeDir(dir) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Phiên bản schema mới nhất = số tệp migration NNN_*.sql (Phase 2 thêm 002). */
export function latestSchemaVersion() {
  const dir = new URL('../src/data/migrations/', import.meta.url);
  return readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).length;
}

/** Chờ điều kiện đúng (poll), ném lỗi nếu quá hạn. */
export async function waitFor(fn, { timeoutMs = 5000, everyMs = 20, what = 'điều kiện' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`Quá hạn ${timeoutMs}ms khi chờ ${what}`);
    await sleep(everyMs);
  }
}

/**
 * Khởi động một PersistenceClient thật (Worker + SQLite thật trong thư mục tạm).
 * Trả { client, dir, cfg, stop() } — stop() đóng sạch và xoá thư mục tạm.
 */
export async function makePersistence(extraCfg = {}, { realm = 'live', allowFaults = true } = {}) {
  const { PersistenceClient } = await import('../src/data/PersistenceClient.js');
  const { loadSettings } = await import('../src/system/Settings.js');
  const { Logger } = await import('../src/system/Logger.js');
  const dir = makeTmpDir('nova-p-');
  const cfg = { ...loadSettings({ env: {} }).settings.persistence, restartBackoffMs: 20, retryBackoffMs: 10, ackTimeoutMs: 2000, healthIntervalMs: 200, ...extraCfg };
  const client = new PersistenceClient({
    dbPath: join(dir, `nova-${realm}.db`), backupDir: join(dir, 'backups'), rejectedDir: join(dir, 'rejected-batches'),
    realm, config: cfg, logger: new Logger({ level: 'error', stdout: false, toFile: false }), allowFaults
  });
  await client.start();
  return { client, dir, cfg, stop: async () => { await client.close({ deadlineMs: 2000 }).catch(() => {}); removeDir(dir); } };
}

/** Logger im lặng, gom bản ghi để test kiểm tra. */
export function captureLogger(Logger, level = 'debug') {
  const lines = [];
  const logger = new Logger({ level, stdout: true, toFile: false, writeStdout: (s) => lines.push(s) });
  return { logger, lines };
}
