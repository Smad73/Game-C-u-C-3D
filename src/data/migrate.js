// Trình chạy migration (ADR-0021). Chỉ được import bên trong PersistenceWorker — luồng chính không chạm DB.
// Quy tắc: tệp NNN_ten.sql, đánh số liên tục từ 001; mỗi tệp chạy trong một transaction; checksum SHA-256;
// checksum sai hoặc DB mới hơn ứng dụng → dừng (không tự sửa); backup tự động trước khi áp dụng migration lên DB đã có dữ liệu.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export class MigrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
  }
}

const FILE_RE = /^(\d{3})_([a-z0-9_]+)\.sql$/;

export function loadMigrationFiles(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  } catch (e) {
    throw new MigrationError('MIGRATION_DIR', `Không đọc được thư mục migration: ${dir} (${e.code || e.message})`);
  }
  const out = [];
  for (const file of names) {
    const m = FILE_RE.exec(file);
    if (!m) throw new MigrationError('MIGRATION_NAME', `Tên tệp migration sai quy ước NNN_ten.sql: ${file}`);
    const sql = readFileSync(join(dir, file), 'utf8');
    out.push({ version: Number(m[1]), name: m[2], file, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  out.forEach((mig, i) => {
    if (mig.version !== i + 1) throw new MigrationError('MIGRATION_SEQUENCE', `Migration phải đánh số liên tục từ 001; gặp ${mig.file} ở vị trí ${i + 1}`);
  });
  return out;
}

/**
 * @returns {{ currentVersion:number, applied:number[], backups:string[] }}
 */
export function runMigrations(db, { dir, backupDir, now = Date.now }) {
  const files = loadMigrationFiles(dir);
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at_utc INTEGER NOT NULL
  ) STRICT`);

  const done = new Map(db.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version').all().map((r) => [r.version, r]));

  for (const [version, row] of done) {
    const f = files.find((x) => x.version === version);
    if (!f) throw new MigrationError('DB_NEWER_THAN_APP', `DB đã áp dụng migration ${version} (${row.name}) nhưng ứng dụng không có tệp tương ứng — DB mới hơn ứng dụng, không mở.`);
    if (f.checksum !== row.checksum) throw new MigrationError('MIGRATION_CHECKSUM', `Checksum migration ${f.file} khác với lúc đã áp dụng — tệp bị sửa sau khi chạy. Dừng để tránh hỏng dữ liệu.`);
  }

  const pending = files.filter((f) => !done.has(f.version));
  const backups = [];
  if (pending.length > 0 && done.size > 0) {
    mkdirSync(backupDir, { recursive: true });
    const path = join(backupDir, `pre-migration-v${pending[0].version}-${now()}.db`);
    db.prepare('VACUUM INTO ?').run(path);
    backups.push(path);
  }

  const applied = [];
  for (const mig of pending) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(mig.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, checksum, applied_at_utc) VALUES (?, ?, ?, ?)').run(mig.version, mig.name, mig.checksum, now());
      db.exec('COMMIT');
      applied.push(mig.version);
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* đã rollback */ }
      throw new MigrationError('MIGRATION_FAILED', `Migration ${mig.file} lỗi, đã rollback: ${e.message}`);
    }
  }
  return { currentVersion: files.length ? files[files.length - 1].version : 0, applied, backups };
}
