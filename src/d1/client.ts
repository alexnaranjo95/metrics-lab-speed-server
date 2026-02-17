/**
 * D1 Client — Thin wrapper for Cloudflare D1 (SQLite) access.
 *
 * In production: accessed via Workers binding (env.ML_ASSETS_DB).
 * In development: uses the Wrangler D1 local emulator or REST API.
 *
 * Provides typed query helpers for the image_assets and optimization_runs tables.
 */

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: any;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface ImageAssetRow {
  asset_id: string;
  site_id: string;
  original_url: string;
  original_url_hash: string;
  cf_image_id: string;
  cf_delivery_url: string;
  original_width: number;
  original_height: number;
  original_format: string;
  location_type: string;
  is_critical: number;
  is_above_fold: number;
  migration_status: string;
  failure_reason: string;
  file_size_bytes: number;
  migrated_at: string;
}

export interface OptimizationRunRow {
  run_id: string;
  site_id: string;
  run_at: string;
  duration_ms: number;
  images_total: number;
  images_migrated: number;
  images_failed: number;
  images_skipped: number;
  videos_bg: number;
  videos_click: number;
  payload_before_kb: number;
  payload_after_kb: number;
  lcp_before_ms: number;
  lcp_after_ms: number;
  deployment_url: string;
  status: string;
}

/**
 * Insert or update an image asset record.
 */
export async function upsertImageAsset(
  db: D1Database,
  row: Omit<ImageAssetRow, 'asset_id' | 'migrated_at'>
): Promise<void> {
  await db.prepare(`
    INSERT INTO image_assets (site_id, original_url, original_url_hash, cf_image_id,
      cf_delivery_url, original_width, original_height, original_format,
      location_type, is_critical, is_above_fold, migration_status, failure_reason, file_size_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (asset_id) DO UPDATE SET
      cf_delivery_url = excluded.cf_delivery_url,
      migration_status = excluded.migration_status,
      failure_reason = excluded.failure_reason,
      migrated_at = datetime('now')
  `)
    .bind(
      row.site_id, row.original_url, row.original_url_hash, row.cf_image_id,
      row.cf_delivery_url, row.original_width, row.original_height, row.original_format,
      row.location_type, row.is_critical, row.is_above_fold, row.migration_status,
      row.failure_reason, row.file_size_bytes
    )
    .run();
}

/**
 * Check if an image has already been migrated by its URL hash.
 */
export async function findMigratedImage(
  db: D1Database,
  siteId: string,
  urlHash: string
): Promise<ImageAssetRow | null> {
  return db.prepare(
    'SELECT * FROM image_assets WHERE site_id = ? AND original_url_hash = ? AND migration_status = ?'
  )
    .bind(siteId, urlHash, 'migrated')
    .first<ImageAssetRow>();
}

/**
 * Insert a new optimization run record.
 */
export async function insertOptimizationRun(
  db: D1Database,
  row: Omit<OptimizationRunRow, 'run_at'>
): Promise<void> {
  await db.prepare(`
    INSERT INTO optimization_runs (run_id, site_id, duration_ms,
      images_total, images_migrated, images_failed, images_skipped,
      videos_bg, videos_click, payload_before_kb, payload_after_kb,
      lcp_before_ms, lcp_after_ms, deployment_url, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      row.run_id, row.site_id, row.duration_ms,
      row.images_total, row.images_migrated, row.images_failed, row.images_skipped,
      row.videos_bg, row.videos_click, row.payload_before_kb, row.payload_after_kb,
      row.lcp_before_ms, row.lcp_after_ms, row.deployment_url, row.status
    )
    .run();
}

/**
 * Get the latest optimization run for a site.
 */
export async function getLatestRun(
  db: D1Database,
  siteId: string
): Promise<OptimizationRunRow | null> {
  return db.prepare(
    'SELECT * FROM optimization_runs WHERE site_id = ? ORDER BY run_at DESC LIMIT 1'
  )
    .bind(siteId)
    .first<OptimizationRunRow>();
}

// ── v5: Script asset helpers ──

export async function upsertScriptAsset(
  db: D1Database,
  row: { id: string; site_id: string; original_src: string; local_path?: string; original_size_kb?: number; optimized_size_kb?: number; status: string; removal_reason?: string }
): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO script_assets (id, site_id, original_src, local_path, original_size_kb, optimized_size_kb, status, removal_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(row.id, row.site_id, row.original_src, row.local_path || '', row.original_size_kb || 0, row.optimized_size_kb || 0, row.status, row.removal_reason || '').run();
}

// ── v5: Third-party detection helpers ──

export async function insertThirdPartyDetection(
  db: D1Database,
  row: { site_id: string; job_id: string; tool_name: string; tool_category: string; tracking_id: string; original_src: string; zaraz_supported: boolean; action_taken: string; payload_saved_kb: number }
): Promise<void> {
  await db.prepare(`
    INSERT INTO third_party_detections (site_id, job_id, tool_name, tool_category, tracking_id, original_src, zaraz_supported, action_taken, payload_saved_kb)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(row.site_id, row.job_id, row.tool_name, row.tool_category, row.tracking_id, row.original_src, row.zaraz_supported ? 1 : 0, row.action_taken, row.payload_saved_kb).run();
}

export async function getThirdPartyDetections(
  db: D1Database,
  siteId: string
): Promise<Array<{ tool_name: string; tracking_id: string; zaraz_supported: number; action_taken: string }>> {
  const result = await db.prepare(
    'SELECT tool_name, tracking_id, zaraz_supported, action_taken FROM third_party_detections WHERE site_id = ? ORDER BY detected_at DESC'
  ).bind(siteId).all();
  return (result.results || []) as any[];
}
