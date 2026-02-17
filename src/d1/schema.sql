-- Cloudflare D1 (SQLite) schema for asset optimization pipeline.
-- Run via: wrangler d1 execute ML_ASSETS_DB --file=src/d1/schema.sql

CREATE TABLE IF NOT EXISTS image_assets (
  asset_id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  site_id             TEXT NOT NULL,
  original_url        TEXT NOT NULL,
  original_url_hash   TEXT NOT NULL,
  cf_image_id         TEXT NOT NULL,
  cf_delivery_url     TEXT NOT NULL,
  original_width      INTEGER DEFAULT 0,
  original_height     INTEGER DEFAULT 0,
  original_format     TEXT DEFAULT '',
  location_type       TEXT DEFAULT '',
  is_critical         INTEGER DEFAULT 0,
  is_above_fold       INTEGER DEFAULT 0,
  migration_status    TEXT DEFAULT 'migrated',
  failure_reason      TEXT DEFAULT '',
  file_size_bytes     INTEGER DEFAULT 0,
  migrated_at         TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_image_assets_site
  ON image_assets (site_id, original_url_hash);

CREATE INDEX IF NOT EXISTS idx_image_assets_status
  ON image_assets (migration_status);


CREATE TABLE IF NOT EXISTS optimization_runs (
  run_id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  site_id             TEXT NOT NULL,
  run_at              TEXT DEFAULT (datetime('now')),
  duration_ms         INTEGER DEFAULT 0,
  images_total        INTEGER DEFAULT 0,
  images_migrated     INTEGER DEFAULT 0,
  images_failed       INTEGER DEFAULT 0,
  images_skipped      INTEGER DEFAULT 0,
  videos_bg           INTEGER DEFAULT 0,
  videos_click        INTEGER DEFAULT 0,
  payload_before_kb   INTEGER DEFAULT 0,
  payload_after_kb    INTEGER DEFAULT 0,
  lcp_before_ms       INTEGER DEFAULT 0,
  lcp_after_ms        INTEGER DEFAULT 0,
  deployment_url      TEXT DEFAULT '',
  status              TEXT DEFAULT 'running'
);

CREATE INDEX IF NOT EXISTS idx_optimization_runs_site
  ON optimization_runs (site_id, run_at);


-- v5: Script assets tracking
CREATE TABLE IF NOT EXISTS script_assets (
  id                TEXT PRIMARY KEY,
  site_id           TEXT NOT NULL,
  original_src      TEXT NOT NULL,
  local_path        TEXT,
  original_size_kb  INTEGER DEFAULT 0,
  optimized_size_kb INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'optimized',
  removal_reason    TEXT DEFAULT '',
  migrated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_script_assets_site
  ON script_assets (site_id);


-- v5: Stylesheet assets tracking
CREATE TABLE IF NOT EXISTS stylesheet_assets (
  id                TEXT PRIMARY KEY,
  site_id           TEXT NOT NULL,
  original_href     TEXT NOT NULL,
  local_path        TEXT,
  original_size_kb  INTEGER DEFAULT 0,
  purged_size_kb    INTEGER DEFAULT 0,
  minified_size_kb  INTEGER DEFAULT 0,
  reduction_pct     INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'optimized',
  migrated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stylesheet_assets_site
  ON stylesheet_assets (site_id);


-- v5: Font assets tracking
CREATE TABLE IF NOT EXISTS font_assets (
  id                TEXT PRIMARY KEY,
  site_id           TEXT NOT NULL,
  family            TEXT NOT NULL,
  weight            TEXT DEFAULT '',
  style             TEXT DEFAULT 'normal',
  original_src      TEXT DEFAULT '',
  local_path        TEXT DEFAULT '',
  format            TEXT DEFAULT 'woff2',
  has_display_swap  INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'optimized',
  migrated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_font_assets_site
  ON font_assets (site_id);


-- v5: Third-party script detections
CREATE TABLE IF NOT EXISTS third_party_detections (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  site_id           TEXT NOT NULL,
  job_id            TEXT NOT NULL,
  tool_name         TEXT NOT NULL,
  tool_category     TEXT DEFAULT '',
  tracking_id       TEXT DEFAULT '',
  original_src      TEXT DEFAULT '',
  zaraz_supported   INTEGER DEFAULT 0,
  action_taken      TEXT DEFAULT 'removed',
  payload_saved_kb  INTEGER DEFAULT 0,
  detected_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_third_party_site
  ON third_party_detections (site_id);
