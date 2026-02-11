import { pgTable, text, integer, bigint, timestamp, jsonb, index, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { SettingsOverride, OptimizationSettings } from '../shared/settingsSchema.js';

export const sites = pgTable('sites', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  siteUrl: text('site_url').notNull(),

  // Webhook communication
  webhookSecret: text('webhook_secret').notNull(),

  // Status
  status: text('status').notNull().default('active'),

  // Latest build info (denormalized for quick access)
  lastBuildId: text('last_build_id'),
  lastBuildStatus: text('last_build_status'),
  lastBuildAt: timestamp('last_build_at'),

  // Edge deployment info
  edgeUrl: text('edge_url'),
  cloudflareProjectName: text('cloudflare_project_name'),

  // Stats
  pageCount: integer('page_count'),
  totalSizeBytes: bigint('total_size_bytes', { mode: 'number' }),

  // Hierarchical settings (sparse overrides — only non-default values stored)
  settings: jsonb('settings').$type<SettingsOverride>().default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  siteUrlIdx: index('site_url_idx').on(table.siteUrl),
}));

export const builds = pgTable('builds', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),

  // Build config
  scope: text('scope').notNull().default('full'),
  triggeredBy: text('triggered_by').notNull(),

  // Status tracking
  status: text('status').notNull().default('queued'),

  // Progress
  pagesTotal: integer('pages_total'),
  pagesProcessed: integer('pages_processed').default(0),

  // Size metrics
  originalSizeBytes: bigint('original_size_bytes', { mode: 'number' }),
  optimizedSizeBytes: bigint('optimized_size_bytes', { mode: 'number' }),

  // Optimization breakdown
  jsOriginalBytes: bigint('js_original_bytes', { mode: 'number' }),
  jsOptimizedBytes: bigint('js_optimized_bytes', { mode: 'number' }),
  cssOriginalBytes: bigint('css_original_bytes', { mode: 'number' }),
  cssOptimizedBytes: bigint('css_optimized_bytes', { mode: 'number' }),
  imageOriginalBytes: bigint('image_original_bytes', { mode: 'number' }),
  imageOptimizedBytes: bigint('image_optimized_bytes', { mode: 'number' }),
  facadesApplied: integer('facades_applied').default(0),
  scriptsRemoved: integer('scripts_removed').default(0),

  // Performance scores
  lighthouseScoreBefore: integer('lighthouse_score_before'),
  lighthouseScoreAfter: integer('lighthouse_score_after'),
  ttfbBefore: integer('ttfb_before'),
  ttfbAfter: integer('ttfb_after'),

  // Error info
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details'),

  // Resolved settings snapshot (full merged settings at build start)
  resolvedSettings: jsonb('resolved_settings').$type<OptimizationSettings>(),

  // Build log entries
  buildLog: jsonb('build_log').$type<Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    message: string;
  }>>(),

  // Timestamps
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index('build_site_id_idx').on(table.siteId),
  statusIdx: index('build_status_idx').on(table.status),
}));

// Asset-level settings overrides (per URL pattern)
export const assetOverrides = pgTable('asset_overrides', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  urlPattern: text('url_pattern').notNull(),
  assetType: text('asset_type'),  // 'image' | 'script' | 'style' | 'font' | 'video' | null
  settings: jsonb('settings').$type<SettingsOverride>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index('asset_override_site_id_idx').on(table.siteId),
}));

// Page-level tracking for partial rebuilds
export const pages = pgTable('pages', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),

  path: text('path').notNull(),
  title: text('title'),

  // Content hash for change detection
  contentHash: text('content_hash'),

  // Page-level metrics
  originalSizeBytes: integer('original_size_bytes'),
  optimizedSizeBytes: integer('optimized_size_bytes'),

  lastCrawledAt: timestamp('last_crawled_at'),
  lastDeployedAt: timestamp('last_deployed_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  sitePathIdx: index('page_site_path_idx').on(table.siteId, table.path),
}));

// Relations
export const sitesRelations = relations(sites, ({ many }) => ({
  builds: many(builds),
  pages: many(pages),
  assetOverrides: many(assetOverrides),
}));

export const buildsRelations = relations(builds, ({ one }) => ({
  site: one(sites, { fields: [builds.siteId], references: [sites.id] }),
}));

export const pagesRelations = relations(pages, ({ one }) => ({
  site: one(sites, { fields: [pages.siteId], references: [sites.id] }),
}));

export const assetOverridesRelations = relations(assetOverrides, ({ one }) => ({
  site: one(sites, { fields: [assetOverrides.siteId], references: [sites.id] }),
}));

// Type exports
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Build = typeof builds.$inferSelect;
export type NewBuild = typeof builds.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type AssetOverride = typeof assetOverrides.$inferSelect;
export type NewAssetOverride = typeof assetOverrides.$inferInsert;
