-- 002_ingest — Phase 2: Ingest & GiftJournal (ADR-0006, 0012 §1.3, 0017, 0018, 0021).
-- Quy ước như 001: timestamp INTEGER ms UTC; bảng STRICT; không BEGIN/COMMIT (trình chạy migration bọc transaction).
-- Hiệu ứng quà ở Phase 2 = KẾ TOÁN QUÀ (sổ cái xu/số lượng theo người chơi). Gắn quà → hành động gameplay thuộc Phase 4.

-- Tổng quà đã áp dụng theo người chơi (chỉ cộng qua op có khoá idempotency, ADR-0017 R13).
ALTER TABLE players ADD COLUMN gift_coins_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN gift_count_total INTEGER NOT NULL DEFAULT 0;

-- Bổ sung journal quà (ADR-0018). key_mode: M = msgId, S = streak có groupId (cộng phần tăng), H = khoá dự phòng (WEAK).
ALTER TABLE gift_events ADD COLUMN source TEXT NOT NULL DEFAULT 'tiktok';
ALTER TABLE gift_events ADD COLUMN source_event_id TEXT;
ALTER TABLE gift_events ADD COLUMN key_mode TEXT NOT NULL DEFAULT 'M' CHECK (key_mode IN ('M', 'S', 'H'));
ALTER TABLE gift_events ADD COLUMN streak_key TEXT;
ALTER TABLE gift_events ADD COLUMN repeat_end INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gift_events ADD COLUMN gift_name TEXT;
ALTER TABLE gift_events ADD COLUMN live_session_id TEXT;
ALTER TABLE gift_events ADD COLUMN room_id TEXT;
ALTER TABLE gift_events ADD COLUMN occurred_at_utc INTEGER;
ALTER TABLE gift_events ADD COLUMN applied_qty INTEGER;
ALTER TABLE gift_events ADD COLUMN applied_coins INTEGER;
ALTER TABLE gift_events ADD COLUMN reason TEXT;
ALTER TABLE gift_events ADD COLUMN last_error TEXT;
CREATE INDEX idx_gift_events_streak ON gift_events (streak_key);

-- Trạng thái streak: số lượng lớn nhất đã áp dụng cho mỗi streak (chỉ cộng phần tăng, ADR-0018).
CREATE TABLE gift_streaks (
  streak_key     TEXT PRIMARY KEY,
  player_key     TEXT,
  gift_id        INTEGER,
  max_count      INTEGER NOT NULL DEFAULT 0,
  ended          INTEGER NOT NULL DEFAULT 0,
  updated_at_utc INTEGER NOT NULL
) STRICT;

-- Sổ cái hiệu ứng quà (bất biến, chỉ chèn). UNIQUE (source_key, effect_seq) chặn áp dụng hai lần (I1).
CREATE TABLE gift_ledger (
  ledger_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key      TEXT NOT NULL,
  effect_seq      INTEGER NOT NULL,
  player_key      TEXT NOT NULL REFERENCES players (player_key),
  gift_id         INTEGER,
  quantity        INTEGER NOT NULL,
  coins           INTEGER NOT NULL,
  live_session_id TEXT,
  at_utc          INTEGER NOT NULL,
  UNIQUE (source_key, effect_seq)
) STRICT;
CREATE INDEX idx_gift_ledger_player ON gift_ledger (player_key);

-- Buổi LIVE theo sự kiện thật (ARCHITECTURE §1.3, ADR-0012): room_id mới → buổi mới; cùng room_id → tiếp tục.
CREATE TABLE live_sessions (
  session_id        TEXT PRIMARY KEY,
  username          TEXT,
  room_id           TEXT,
  source            TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RECOVERING', 'ENDED')),
  started_at_utc    INTEGER NOT NULL,
  ended_at_utc      INTEGER,
  end_reason        TEXT CHECK (end_reason IS NULL OR end_reason IN ('STREAM_END', 'MANUAL', 'INFERRED')),
  last_event_at_utc INTEGER
) STRICT;
CREATE UNIQUE INDEX idx_live_sessions_room ON live_sessions (room_id) WHERE room_id IS NOT NULL;
CREATE INDEX idx_live_sessions_status ON live_sessions (status, started_at_utc);
