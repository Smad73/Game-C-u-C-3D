-- 001_init — nền tảng Phase 1 (ADR-0017, 0018, 0020, 0021, 0022).
-- Quy ước: mọi timestamp là INTEGER (ms, UTC); điểm/khối lượng là INTEGER; bảng STRICT.
-- Không chứa BEGIN/COMMIT: trình chạy migration bọc mỗi tệp trong một transaction.
-- Các bảng gameplay (score_ledger, catches, leaderboard_*, world_events…) thuộc migration của Phase 2/3/4.

-- Siêu dữ liệu file DB: realm (live|demo) để không bao giờ mở nhầm DB DEMO như DB LIVE (ADR-0021).
CREATE TABLE db_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

-- Cấu hình Admin (JSON dạng chuỗi). `version` tăng dần để không ghi đè bằng bản cũ hơn.
CREATE TABLE settings (
  key            TEXT PRIMARY KEY,
  value          TEXT NOT NULL,
  version        INTEGER NOT NULL,
  updated_at_utc INTEGER NOT NULL
) STRICT;

-- R13 lớp batch: batch đã commit (ghi trong CÙNG transaction của batch).
CREATE TABLE committed_batches (
  batch_id         TEXT PRIMARY KEY,
  committed_at_utc INTEGER NOT NULL,
  op_count         INTEGER NOT NULL,
  checksum         TEXT NOT NULL
) STRICT;
CREATE INDEX idx_committed_batches_at ON committed_batches (committed_at_utc);

-- R13 lớp op: khoá idempotency ổn định theo miền nghiệp vụ; phép cộng chỉ chạy khi chèn được op_key.
CREATE TABLE applied_ops (
  op_key   TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  at_utc   INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_applied_ops_at ON applied_ops (at_utc);

-- ADR-0021: khoá người chơi `player_key` = tt:<userId> (LIVE) | demo:<id> (DEMO).
CREATE TABLE players (
  player_key     TEXT PRIMARY KEY,
  realm          TEXT NOT NULL CHECK (realm IN ('live', 'demo')),
  external_id    TEXT NOT NULL,
  unique_id      TEXT,
  nickname       TEXT,
  xp             INTEGER NOT NULL DEFAULT 0,
  level          INTEGER NOT NULL DEFAULT 1,
  total_score    INTEGER NOT NULL DEFAULT 0,
  total_weight_g INTEGER NOT NULL DEFAULT 0,
  first_seen_utc INTEGER NOT NULL,
  last_seen_utc  INTEGER NOT NULL,
  UNIQUE (realm, external_id),
  CHECK ((realm = 'live' AND player_key LIKE 'tt:%') OR (realm = 'demo' AND player_key LIKE 'demo:%'))
) STRICT;

-- ADR-0018: nhật ký quà (chỉ bảng; logic GiftJournal thuộc Phase 2).
CREATE TABLE gift_events (
  gift_event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_key        TEXT NOT NULL UNIQUE,
  player_key      TEXT REFERENCES players (player_key),
  gift_id         INTEGER,
  repeat_count    INTEGER,
  quantity        INTEGER NOT NULL DEFAULT 1,
  coin_value      INTEGER,
  effect_params   TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL CHECK (status IN ('RECEIVED', 'APPLIED', 'REJECTED', 'FAILED', 'DEAD')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  received_at_utc INTEGER NOT NULL,
  applied_at_utc  INTEGER,
  key_quality     TEXT NOT NULL DEFAULT 'STRONG' CHECK (key_quality IN ('STRONG', 'WEAK'))
) STRICT;
CREATE INDEX idx_gift_events_status ON gift_events (status, received_at_utc);

-- ADR-0020: sổ thiết bị đã ghép đôi (thu hồi được). Phiên (session) chỉ ở RAM.
CREATE TABLE admin_devices (
  device_id      TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  user_agent     TEXT,
  paired_at_utc  INTEGER NOT NULL,
  last_seen_utc  INTEGER NOT NULL,
  revoked_at_utc INTEGER
) STRICT;

-- ADR-0020: nhật ký thao tác Admin (không chứa token/mật khẩu).
CREATE TABLE admin_audit (
  audit_id  TEXT PRIMARY KEY,
  at_utc    INTEGER NOT NULL,
  device_id TEXT,
  ip        TEXT,
  action    TEXT NOT NULL,
  detail    TEXT,
  result    TEXT NOT NULL
) STRICT;
CREATE INDEX idx_admin_audit_at ON admin_audit (at_utc);
