import { pgTable, text, integer, bigint, timestamp, jsonb, index, uuid, boolean, real } from 'drizzle-orm/pg-core';
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
  deploymentNumber: integer('deployment_number'),

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

// Settings change history for rollback
export const settingsHistory = pgTable('settings_history', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<SettingsOverride>().notNull(),
  changedBy: text('changed_by').default('api'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index('settings_history_site_id_idx').on(table.siteId),
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

// ─── Performance Comparisons ──────────────────────────────────────
export const performanceComparisons = pgTable('performance_comparisons', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  buildId: text('build_id').references(() => builds.id, { onDelete: 'set null' }),

  testedAt: timestamp('tested_at').defaultNow().notNull(),
  strategy: text('strategy').notNull(), // 'mobile' | 'desktop'

  originalDomain: text('original_domain').notNull(),
  optimizedDomain: text('optimized_domain').notNull(),

  // Original domain metrics
  originalPerformanceScore: integer('original_performance_score'),
  originalLcpMs: real('original_lcp_ms'),
  originalTbtMs: real('original_tbt_ms'),
  originalCls: real('original_cls'),
  originalFcpMs: real('original_fcp_ms'),
  originalSiMs: real('original_si_ms'),
  originalTtfbMs: real('original_ttfb_ms'),

  // Optimized domain metrics
  optimizedPerformanceScore: integer('optimized_performance_score'),
  optimizedLcpMs: real('optimized_lcp_ms'),
  optimizedTbtMs: real('optimized_tbt_ms'),
  optimizedCls: real('optimized_cls'),
  optimizedFcpMs: real('optimized_fcp_ms'),
  optimizedSiMs: real('optimized_si_ms'),
  optimizedTtfbMs: real('optimized_ttfb_ms'),

  // Improvement percentages
  scoreImprovement: real('score_improvement'),
  lcpImprovement: real('lcp_improvement'),
  tbtImprovement: real('tbt_improvement'),
  clsImprovement: real('cls_improvement'),
  fcpImprovement: real('fcp_improvement'),
  siImprovement: real('si_improvement'),

  // Payload savings (from build data, if available)
  totalPayloadReductionKb: integer('total_payload_reduction_kb'),
  imageOptimizationSavingsKb: integer('image_optimization_savings_kb'),
  jsOptimizationSavingsKb: integer('js_optimization_savings_kb'),
  cssOptimizationSavingsKb: integer('css_optimization_savings_kb'),

  // Raw data (jsonb)
  rawLighthouseOriginal: jsonb('raw_lighthouse_original'),
  rawLighthouseOptimized: jsonb('raw_lighthouse_optimized'),
  fieldDataOriginal: jsonb('field_data_original'),
  fieldDataOptimized: jsonb('field_data_optimized'),
  opportunitiesOriginal: jsonb('opportunities_original'),
  opportunitiesOptimized: jsonb('opportunities_optimized'),
}, (table) => ({
  siteTestedIdx: index('perf_comp_site_tested_idx').on(table.siteId, table.testedAt),
  siteStrategyTestedIdx: index('perf_comp_site_strategy_tested_idx').on(table.siteId, table.strategy, table.testedAt),
}));

// ─── Performance Monitors ─────────────────────────────────────────
export const performanceMonitors = pgTable('performance_monitors', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  frequency: text('frequency').notNull().default('daily'), // 'hourly' | 'daily' | 'weekly'
  enabled: boolean('enabled').notNull().default(true),

  alertOnRegression: boolean('alert_on_regression').notNull().default(true),
  regressionThreshold: integer('regression_threshold').default(-10), // score points

  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index('perf_monitor_site_id_idx').on(table.siteId),
}));

// ─── Alert Rules ──────────────────────────────────────────────────
export const alertRules = pgTable('alert_rules', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),

  metric: text('metric').notNull(), // 'performanceScore' | 'lcp' | 'tbt' | 'cls' | 'fcp' | 'si'
  condition: text('condition').notNull(), // 'decreases_by' | 'exceeds_threshold' | 'below_threshold'
  value: real('value').notNull(),
  timeWindow: text('time_window').default('24h'), // '1h' | '24h' | '7d'
  severity: text('severity').notNull().default('warning'), // 'info' | 'warning' | 'critical'
  channels: jsonb('channels').$type<string[]>().default([]), // ['webhook', 'slack', 'email']

  enabled: boolean('enabled').notNull().default(true),
  webhookUrl: text('webhook_url'),
  slackWebhookUrl: text('slack_webhook_url'),

  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index('alert_rule_site_id_idx').on(table.siteId),
}));

// ─── Alert Log ────────────────────────────────────────────────────
export const alertLog = pgTable('alert_log', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  ruleId: text('rule_id').references(() => alertRules.id, { onDelete: 'set null' }),

  message: text('message').notNull(),
  severity: text('severity').notNull(),
  data: jsonb('data'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index('alert_log_site_id_idx').on(table.siteId),
}));

// Relations
export const sitesRelations = relations(sites, ({ many }) => ({
  builds: many(builds),
  pages: many(pages),
  assetOverrides: many(assetOverrides),
  settingsHistory: many(settingsHistory),
  performanceComparisons: many(performanceComparisons),
  performanceMonitors: many(performanceMonitors),
  alertRules: many(alertRules),
  alertLogs: many(alertLog),
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

export const settingsHistoryRelations = relations(settingsHistory, ({ one }) => ({
  site: one(sites, { fields: [settingsHistory.siteId], references: [sites.id] }),
}));

export const performanceComparisonsRelations = relations(performanceComparisons, ({ one }) => ({
  site: one(sites, { fields: [performanceComparisons.siteId], references: [sites.id] }),
  build: one(builds, { fields: [performanceComparisons.buildId], references: [builds.id] }),
}));

export const performanceMonitorsRelations = relations(performanceMonitors, ({ one }) => ({
  site: one(sites, { fields: [performanceMonitors.siteId], references: [sites.id] }),
}));

export const alertRulesRelations = relations(alertRules, ({ one, many }) => ({
  site: one(sites, { fields: [alertRules.siteId], references: [sites.id] }),
  logs: many(alertLog),
}));

export const alertLogRelations = relations(alertLog, ({ one }) => ({
  site: one(sites, { fields: [alertLog.siteId], references: [sites.id] }),
  rule: one(alertRules, { fields: [alertLog.ruleId], references: [alertRules.id] }),
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
export type SettingsHistoryEntry = typeof settingsHistory.$inferSelect;
export type PerformanceComparison = typeof performanceComparisons.$inferSelect;
export type NewPerformanceComparison = typeof performanceComparisons.$inferInsert;
export type PerformanceMonitor = typeof performanceMonitors.$inferSelect;
export type AlertRule = typeof alertRules.$inferSelect;
export type AlertLogEntry = typeof alertLog.$inferSelect;
