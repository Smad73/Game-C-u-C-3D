-- 003_game — gameplay: hồ sơ mở rộng, trang bị, sổ tay cá, thành tích, lượt câu, sổ cái điểm, BXH, buff, sự kiện thế giới, điểm danh.
-- Quy ước như 001/002: timestamp INTEGER ms UTC; điểm/khối lượng INTEGER; bảng STRICT; không BEGIN/COMMIT.
-- Mọi phép cộng đi qua op có khoá idempotency (applied_ops, ADR-0017 R13) hoặc UNIQUE (source_key, effect_seq).

-- Hiệu ứng quà đã áp dụng (JSON) — để công bố RAM đúng kể cả khi mất ACK (GB8 đọc lại từ DB).
ALTER TABLE gift_events ADD COLUMN applied_effects TEXT;

ALTER TABLE players ADD COLUMN coins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN catches_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN boss_kills INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN best_tier INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN daily_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN last_daily TEXT;
ALTER TABLE players ADD COLUMN appearance INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_players_last_seen ON players (last_seen_utc);
CREATE INDEX idx_players_nickname ON players (nickname);

CREATE TABLE player_equipment (
  player_key     TEXT NOT NULL REFERENCES players (player_key),
  slot           TEXT NOT NULL CHECK (slot IN ('rod', 'line', 'bobber', 'bait')),
  level          INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  updated_at_utc INTEGER NOT NULL,
  PRIMARY KEY (player_key, slot)
) STRICT;

CREATE TABLE fishdex (
  player_key     TEXT NOT NULL REFERENCES players (player_key),
  species_id     INTEGER NOT NULL,
  count          INTEGER NOT NULL DEFAULT 0,
  best_weight_g  INTEGER NOT NULL DEFAULT 0,
  first_at_utc   INTEGER NOT NULL,
  PRIMARY KEY (player_key, species_id)
) STRICT;

CREATE TABLE player_achievements (
  player_key     TEXT NOT NULL REFERENCES players (player_key),
  achievement_id TEXT NOT NULL,
  at_utc         INTEGER NOT NULL,
  PRIMARY KEY (player_key, achievement_id)
) STRICT;

-- Mỗi lượt câu thành công (kể cả cá Boss/kho báu).
CREATE TABLE catches (
  catch_id        TEXT PRIMARY KEY,
  player_key      TEXT NOT NULL REFERENCES players (player_key),
  species_id      INTEGER NOT NULL,
  tier            INTEGER NOT NULL,
  weight_g        INTEGER NOT NULL,
  score           INTEGER NOT NULL,
  xp              INTEGER NOT NULL,
  coins           INTEGER NOT NULL,
  live_session_id TEXT,
  world_event_id  TEXT,
  at_utc          INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_catches_player ON catches (player_key, at_utc);
CREATE INDEX idx_catches_at ON catches (at_utc);
CREATE INDEX idx_catches_tier ON catches (tier, at_utc);

-- Sổ cái điểm BẤT BIẾN — nguồn của mọi BXH (ADR-0010). source: CATCH | GIFT | BOSS | ADJUST.
CREATE TABLE score_ledger (
  ledger_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  player_key      TEXT NOT NULL REFERENCES players (player_key),
  score           INTEGER NOT NULL,
  weight_g        INTEGER NOT NULL DEFAULT 0,
  source          TEXT NOT NULL CHECK (source IN ('CATCH', 'GIFT', 'BOSS', 'ADJUST')),
  source_key      TEXT NOT NULL,
  effect_seq      INTEGER NOT NULL DEFAULT 0,
  at_utc          INTEGER NOT NULL,
  minute_utc      INTEGER NOT NULL,
  live_session_id TEXT,
  UNIQUE (source_key, effect_seq)
) STRICT;
CREATE INDEX idx_score_ledger_at ON score_ledger (at_utc);
CREATE INDEX idx_score_ledger_player ON score_ledger (player_key, at_utc);
CREATE INDEX idx_score_ledger_session ON score_ledger (live_session_id);

-- BXH theo kỳ cố định (live/day/week/all) — cập nhật trong CÙNG transaction với sổ cái. TOP 60 phút tính từ score_ledger.
CREATE TABLE leaderboard_scores (
  scope          TEXT NOT NULL CHECK (scope IN ('live', 'day', 'week', 'all')),
  period_key     TEXT NOT NULL,
  player_key     TEXT NOT NULL REFERENCES players (player_key),
  score          INTEGER NOT NULL DEFAULT 0,
  weight_g       INTEGER NOT NULL DEFAULT 0,
  reached_at_utc INTEGER NOT NULL,
  PRIMARY KEY (scope, period_key, player_key)
) STRICT;
CREATE INDEX idx_lb_rank ON leaderboard_scores (scope, period_key, score DESC, weight_g DESC, reached_at_utc ASC);

-- Buff có hạn (may mắn, lực kéo, cá hiếm lượt sau). expires_at tính từ received_at của quà → replay không kéo dài sai.
CREATE TABLE player_buffs (
  source_key     TEXT NOT NULL,
  effect_seq     INTEGER NOT NULL,
  player_key     TEXT NOT NULL REFERENCES players (player_key),
  kind           TEXT NOT NULL CHECK (kind IN ('luck', 'power', 'rare_next')),
  value          INTEGER NOT NULL,
  uses           INTEGER,
  expires_at_utc INTEGER,
  created_at_utc INTEGER NOT NULL,
  PRIMARY KEY (source_key, effect_seq)
) STRICT;
CREATE INDEX idx_player_buffs_player ON player_buffs (player_key, expires_at_utc);

-- Sự kiện thế giới (Boss, kho báu, thời tiết…): hàng đợi bền, idempotent theo event_id / source_key.
CREATE TABLE world_events (
  event_id        TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('SCHEDULE', 'GIFT', 'ADMIN', 'AUTO')),
  source_key      TEXT UNIQUE,
  summoner_key    TEXT,
  level           INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL CHECK (status IN ('QUEUED', 'WARNING', 'ACTIVE', 'DONE', 'FAILED', 'CANCELLED')),
  hp_max          INTEGER,
  hp_left         INTEGER,
  active_players  INTEGER,
  queued_at_utc   INTEGER NOT NULL,
  warned_at_utc   INTEGER,
  started_at_utc  INTEGER,
  ended_at_utc    INTEGER,
  result          TEXT,
  params          TEXT NOT NULL DEFAULT '{}',
  live_session_id TEXT
) STRICT;
CREATE INDEX idx_world_events_status ON world_events (status, queued_at_utc);
CREATE INDEX idx_world_events_started ON world_events (started_at_utc);

CREATE TABLE world_event_contrib (
  event_id   TEXT NOT NULL REFERENCES world_events (event_id),
  player_key TEXT NOT NULL REFERENCES players (player_key),
  damage     INTEGER NOT NULL DEFAULT 0,
  rewarded   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, player_key)
) STRICT;

CREATE TABLE player_daily (
  player_key TEXT NOT NULL REFERENCES players (player_key),
  day_key    TEXT NOT NULL,
  coins      INTEGER NOT NULL,
  xp         INTEGER NOT NULL,
  streak     INTEGER NOT NULL,
  at_utc     INTEGER NOT NULL,
  PRIMARY KEY (player_key, day_key)
) STRICT;
