import { pgTable, text, integer, bigint, timestamp, jsonb, index, uuid, boolean, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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

// ─── Enhanced PageSpeed Tracking ──────────────────────────────────

export const pagespeedAuditHistory = pgTable('pagespeed_audit_history', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  buildId: text('build_id').references(() => builds.id, { onDelete: 'set null' }),
  
  // Audit identification
  auditId: text('audit_id').notNull(),
  category: text('category').notNull(), // 'performance', 'accessibility', 'seo', 'best-practices'
  
  // Audit results
  score: real('score'), // 0-1 score from Lighthouse
  numericValue: real('numeric_value'), // Raw numeric value (ms, bytes, etc.)
  displayValue: text('display_value'), // Human-readable value
  
  // Full audit data for analysis
  auditData: jsonb('audit_data'), // Complete audit object from Lighthouse
  
  // Comparison with previous run
  previousScore: real('previous_score'),
  scoreImprovement: real('score_improvement'), // Positive = better
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  siteAuditIdx: index('pagespeed_audit_site_audit_idx').on(table.siteId, table.auditId),
  buildAuditIdx: index('pagespeed_audit_build_audit_idx').on(table.buildId, table.auditId),
  categoryIdx: index('pagespeed_audit_category_idx').on(table.category),
  createdAtIdx: index('pagespeed_audit_created_idx').on(table.createdAt),
}));

// ─── Enhanced Performance Comparisons ─────────────────────────────

// Add CLS-specific tracking columns to existing performance_comparisons table
// (Note: This would be an ALTER TABLE in migration, shown here for reference)
/*
ALTER TABLE performance_comparisons 
ADD COLUMN cls_before REAL,
ADD COLUMN cls_after REAL, 
ADD COLUMN cls_improvement REAL,
ADD COLUMN seo_score_before INTEGER,
ADD COLUMN seo_score_after INTEGER,
ADD COLUMN best_practices_score_before INTEGER,
ADD COLUMN best_practices_score_after INTEGER,
ADD COLUMN audit_counts_before JSONB, -- Count of failing audits by category
ADD COLUMN audit_counts_after JSONB,
ADD COLUMN optimization_applied JSONB; -- Which optimization modules were applied
*/

// ─── CLS Optimization Tracking ────────────────────────────────────

export const clsOptimizationHistory = pgTable('cls_optimization_history', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  buildId: text('build_id').references(() => builds.id, { onDelete: 'set null' }),
  
  // CLS measurements
  clsBefore: real('cls_before'),
  clsAfter: real('cls_after'),
  clsImprovement: real('cls_improvement'),
  
  // Optimization details
  imagesDimensionsInjected: integer('images_dimensions_injected').default(0),
  fontsOptimized: integer('fonts_optimized').default(0),
  dynamicContentContainersReserved: integer('dynamic_content_reserved').default(0),
  layoutContainmentApplied: integer('layout_containment_applied').default(0),
  
  // Estimated vs actual improvement
  estimatedImprovement: real('estimated_improvement'),
  actualImprovement: real('actual_improvement'),
  accuracyScore: real('accuracy_score'), // How accurate our estimation was
  
  optimizationSettings: jsonb('optimization_settings'), // CLS settings used
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index('cls_opt_site_id_idx').on(table.siteId),
  buildIdIdx: index('cls_opt_build_id_idx').on(table.buildId),
  clsImprovementIdx: index('cls_opt_improvement_idx').on(table.clsImprovement),
  createdAtIdx: index('cls_opt_created_idx').on(table.createdAt),
}));

// ─── SEO Optimization Tracking ────────────────────────────────────

export const seoOptimizationHistory = pgTable('seo_optimization_history', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  buildId: text('build_id').references(() => builds.id, { onDelete: 'set null' }),
  
  // SEO scores
  scoreBefore: integer('score_before'),
  scoreAfter: integer('score_after'),
  scoreImprovement: integer('score_improvement'),
  
  // Optimization counts
  metaTagsInjected: integer('meta_tags_injected').default(0),
  altAttributesAdded: integer('alt_attributes_added').default(0),
  linksOptimized: integer('links_optimized').default(0),
  crawlableLinksFixed: integer('crawlable_links_fixed').default(0),
  structuredDataInjected: integer('structured_data_injected').default(0),
  headingHierarchyFixed: integer('heading_hierarchy_fixed').default(0),
  
  // SEO audit details
  auditsPassed: integer('audits_passed').default(0),
  auditsFailed: integer('audits_failed').default(0),
  criticalAuditsFailed: text('critical_audits_failed'), // JSON array of critical failing audit IDs
  
  optimizationSettings: jsonb('optimization_settings'), // SEO settings used
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index('seo_opt_site_id_idx').on(table.siteId),
  buildIdIdx: index('seo_opt_build_id_idx').on(table.buildId),
  scoreImprovementIdx: index('seo_opt_improvement_idx').on(table.scoreImprovement),
  createdAtIdx: index('seo_opt_created_idx').on(table.createdAt),
}));

// ─── Security Headers Tracking ────────────────────────────────────

export const securityHeadersHistory = pgTable('security_headers_history', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  buildId: text('build_id').references(() => builds.id, { onDelete: 'set null' }),
  
  // Best Practices scores (security-related)
  bestPracticesScoreBefore: integer('best_practices_score_before'),
  bestPracticesScoreAfter: integer('best_practices_score_after'),
  scoreImprovement: integer('score_improvement'),
  
  // Security headers presence
  cspEnabled: boolean('csp_enabled').default(false),
  trustedTypesEnabled: boolean('trusted_types_enabled').default(false),
  hstsEnabled: boolean('hsts_enabled').default(false),
  frameProtectionEnabled: boolean('frame_protection_enabled').default(false),
  contentTypeOptionsEnabled: boolean('content_type_options_enabled').default(false),
  
  // Header counts and quality
  totalSecurityHeaders: integer('total_security_headers').default(0),
  securityHeadersQualityScore: real('security_headers_quality_score'), // 0-100 based on configuration quality
  
  // CSP details
  cspDirectivesCount: integer('csp_directives_count').default(0),
  cspHasTrustedTypes: boolean('csp_has_trusted_types').default(false),
  
  headersSnapshot: jsonb('headers_snapshot'), // Snapshot of all response headers
  optimizationSettings: jsonb('optimization_settings'), // Security settings used
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index('sec_headers_site_id_idx').on(table.siteId),
  buildIdIdx: index('sec_headers_build_id_idx').on(table.buildId),
  scoreImprovementIdx: index('sec_headers_improvement_idx').on(table.scoreImprovement),
  createdAtIdx: index('sec_headers_created_idx').on(table.createdAt),
}));

// ─── AI Optimization Sessions ─────────────────────────────────────

export const aiOptimizationSessions = pgTable('ai_optimization_sessions', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  
  // Session metadata
  sessionType: text('session_type').notNull().default('full_optimization'), // 'full_optimization', 'pagespeed_focus', 'cls_focus', etc.
  aiModel: text('ai_model').notNull(), // 'claude-opus-4-6', etc.
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  status: text('status').notNull().default('running'), // 'running', 'completed', 'failed', 'aborted'
  
  // Optimization targets and results
  targetMetrics: jsonb('target_metrics'), // What the AI was trying to optimize
  initialScores: jsonb('initial_scores'), // PageSpeed scores before optimization
  finalScores: jsonb('final_scores'), // PageSpeed scores after optimization
  
  // AI decision making
  optimizationPlan: jsonb('optimization_plan'), // AI-generated plan
  iterationsCompleted: integer('iterations_completed').default(0),
  settingsHistory: jsonb('settings_history'), // Array of settings tried
  
  // Results and learnings
  successfulOptimizations: jsonb('successful_optimizations'), // What worked
  failedOptimizations: jsonb('failed_optimizations'), // What didn't work
  aiReasonings: jsonb('ai_reasonings'), // AI explanations for decisions
  lessonsLearned: jsonb('lessons_learned').$type<string[]>(), // AI learnings from session
  
  // Resource usage
  totalTokensUsed: integer('total_tokens_used').default(0),
  estimatedCostUsd: real('estimated_cost_usd').default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  siteIdIdx: index('ai_opt_sessions_site_id_idx').on(table.siteId),
  statusIdx: index('ai_opt_sessions_status_idx').on(table.status),
  startedAtIdx: index('ai_opt_sessions_started_idx').on(table.startedAt),
  sessionTypeIdx: index('ai_opt_sessions_type_idx').on(table.sessionType),
}));

// ─── AI Knowledge Base and Learning Tables ────────────────────────
export const optimizationKnowledgeBase = pgTable('optimization_knowledge_base', {
  id: text('id').primaryKey(),
  
  // Pattern identification
  patternName: text('pattern_name').notNull(), // e.g., "WordPress + Elementor + WooCommerce"
  patternHash: text('pattern_hash').notNull().unique(), // Hash of characteristics for fast lookup
  
  siteCharacteristics: jsonb('site_characteristics').$type<{
    cms: string;
    theme?: string;
    plugins: string[];
    complexity: 'simple' | 'moderate' | 'complex';
    commonTraits: string[];
  }>().notNull(),
  
  // Optimization knowledge
  successfulStrategies: jsonb('successful_strategies').$type<Array<{
    strategy: string;
    successRate: number;
    averageImprovement: number;
    sampleSize: number;
    optimalSettings: Record<string, unknown>;
    prerequisites: string[];
  }>>(),
  
  problematicStrategies: jsonb('problematic_strategies').$type<Array<{
    strategy: string;
    failureRate: number;
    commonFailureReasons: string[];
    sampleSize: number;
    avoidanceConditions: string[];
  }>>(),
  
  // PageSpeed audit specific knowledge
  auditSolutions: jsonb('audit_solutions').$type<Record<string, {
    auditId: string;
    successfulApproaches: Array<{
      approach: string;
      successRate: number;
      averageImprovement: number;
      settings: Record<string, unknown>;
    }>;
    commonPitfalls: string[];
  }>>(),
  
  // Learning metadata
  confidence: real('confidence').notNull().default(0.5), // 0-1 confidence in this pattern
  sampleSize: integer('sample_size').notNull().default(1),
  lastValidated: timestamp('last_validated'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  patternHashIdx: index('knowledge_pattern_hash_idx').on(table.patternHash),
  confidenceIdx: index('knowledge_confidence_idx').on(table.confidence),
}));

export const pageSpeedAuditSolutions = pgTable('pagespeed_audit_solutions', {
  id: text('id').primaryKey(),
  
  // Audit identification
  auditId: text('audit_id').notNull(), // e.g., 'largest-contentful-paint', 'unused-css-rules'
  category: text('category').notNull(), // 'performance', 'accessibility', 'seo', 'best-practices'
  
  // Solution tracking
  solutionType: text('solution_type').notNull(), // 'settings-only', 'code-modification', 'hybrid'
  description: text('description').notNull(),
  
  // Effectiveness data
  successRate: real('success_rate').notNull().default(0),
  averageImprovement: real('average_improvement').notNull().default(0),
  sampleSize: integer('sample_size').notNull().default(0),
  
  // Solution details
  requiredSettings: jsonb('required_settings').$type<Record<string, unknown>>(),
  codeChangesRequired: jsonb('code_changes_required').$type<{
    files: string[];
    modifications: Array<{
      type: 'add' | 'modify' | 'remove';
      target: string;
      description: string;
    }>;
    reversible: boolean;
  }>(),
  
  // Applicability conditions
  siteRequirements: jsonb('site_requirements').$type<{
    cmsTypes: string[];
    excludedPlugins: string[];
    requiredFeatures: string[];
    complexityLimits: string[];
  }>(),
  
  // Risk assessment
  riskLevel: text('risk_level').notNull().default('medium'), // 'low', 'medium', 'high', 'critical'
  riskFactors: jsonb('risk_factors').$type<string[]>(),
  rollbackProcedure: text('rollback_procedure'),
  
  // Verification requirements
  verificationSteps: jsonb('verification_steps').$type<Array<{
    type: 'automated' | 'manual';
    description: string;
    passThreshold?: number;
  }>>(),
  
  // Learning data
  commonFailureReasons: jsonb('common_failure_reasons').$type<string[]>(),
  troubleshootingTips: jsonb('troubleshooting_tips').$type<string[]>(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  auditIdIdx: index('audit_solutions_audit_id_idx').on(table.auditId),
  categoryIdx: index('audit_solutions_category_idx').on(table.category),
  successRateIdx: index('audit_solutions_success_rate_idx').on(table.successRate),
  riskLevelIdx: index('audit_solutions_risk_level_idx').on(table.riskLevel),
}));

export const optimizationPatterns = pgTable('optimization_patterns', {
  id: text('id').primaryKey(),
  
  // Pattern identification
  patternType: text('pattern_type').notNull(), // 'site-profile', 'audit-combination', 'failure-mode'
  patternDescription: text('pattern_description').notNull(),
  
  // Pattern conditions
  conditions: jsonb('conditions').$type<{
    siteCharacteristics?: Record<string, unknown>;
    auditFailures?: string[];
    contextualFactors?: string[];
  }>().notNull(),
  
  // Pattern outcomes
  recommendedActions: jsonb('recommended_actions').$type<Array<{
    action: string;
    priority: number;
    confidence: number;
    expectedImpact: number;
    settings: Record<string, unknown>;
  }>>(),
  
  avoidedActions: jsonb('avoided_actions').$type<Array<{
    action: string;
    reason: string;
    riskLevel: string;
  }>>(),
  
  // Effectiveness tracking
  timesApplied: integer('times_applied').default(0),
  successfulApplications: integer('successful_applications').default(0),
  averageImprovement: real('average_improvement').default(0),
  
  // Pattern learning
  discoveredAt: timestamp('discovered_at').defaultNow().notNull(),
  lastApplied: timestamp('last_applied'),
  confidence: real('confidence').default(0.5),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  patternTypeIdx: index('patterns_type_idx').on(table.patternType),
  confidenceIdx: index('patterns_confidence_idx').on(table.confidence),
  successRateIdx: index('patterns_success_rate_idx').on(sql`(successful_applications::float / GREATEST(times_applied, 1))`),
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
  pagespeedAuditHistory: many(pagespeedAuditHistory),
  clsOptimizationHistory: many(clsOptimizationHistory),
  seoOptimizationHistory: many(seoOptimizationHistory),
  securityHeadersHistory: many(securityHeadersHistory),
  aiOptimizationSessions: many(aiOptimizationSessions),
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

// Enhanced tracking relations
export const pagespeedAuditHistoryRelations = relations(pagespeedAuditHistory, ({ one }) => ({
  site: one(sites, { fields: [pagespeedAuditHistory.siteId], references: [sites.id] }),
  build: one(builds, { fields: [pagespeedAuditHistory.buildId], references: [builds.id] }),
}));

export const clsOptimizationHistoryRelations = relations(clsOptimizationHistory, ({ one }) => ({
  site: one(sites, { fields: [clsOptimizationHistory.siteId], references: [sites.id] }),
  build: one(builds, { fields: [clsOptimizationHistory.buildId], references: [builds.id] }),
}));

export const seoOptimizationHistoryRelations = relations(seoOptimizationHistory, ({ one }) => ({
  site: one(sites, { fields: [seoOptimizationHistory.siteId], references: [sites.id] }),
  build: one(builds, { fields: [seoOptimizationHistory.buildId], references: [builds.id] }),
}));

export const securityHeadersHistoryRelations = relations(securityHeadersHistory, ({ one }) => ({
  site: one(sites, { fields: [securityHeadersHistory.siteId], references: [sites.id] }),
  build: one(builds, { fields: [securityHeadersHistory.buildId], references: [builds.id] }),
}));

export const aiOptimizationSessionsRelations = relations(aiOptimizationSessions, ({ one }) => ({
  site: one(sites, { fields: [aiOptimizationSessions.siteId], references: [sites.id] }),
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

// Enhanced tracking types
export type PageSpeedAuditHistoryEntry = typeof pagespeedAuditHistory.$inferSelect;
export type NewPageSpeedAuditHistoryEntry = typeof pagespeedAuditHistory.$inferInsert;
export type CLSOptimizationHistoryEntry = typeof clsOptimizationHistory.$inferSelect;
export type NewCLSOptimizationHistoryEntry = typeof clsOptimizationHistory.$inferInsert;
export type SEOOptimizationHistoryEntry = typeof seoOptimizationHistory.$inferSelect;
export type NewSEOOptimizationHistoryEntry = typeof seoOptimizationHistory.$inferInsert;
export type SecurityHeadersHistoryEntry = typeof securityHeadersHistory.$inferSelect;
export type NewSecurityHeadersHistoryEntry = typeof securityHeadersHistory.$inferInsert;
export type AIOptimizationSession = typeof aiOptimizationSessions.$inferSelect;
export type NewAIOptimizationSession = typeof aiOptimizationSessions.$inferInsert;

// AI Learning and Knowledge Base types
export type OptimizationKnowledge = typeof optimizationKnowledgeBase.$inferSelect;
export type NewOptimizationKnowledge = typeof optimizationKnowledgeBase.$inferInsert;
export type PageSpeedAuditSolution = typeof pageSpeedAuditSolutions.$inferSelect;
export type NewPageSpeedAuditSolution = typeof pageSpeedAuditSolutions.$inferInsert;
export type OptimizationPattern = typeof optimizationPatterns.$inferSelect;
export type NewOptimizationPattern = typeof optimizationPatterns.$inferInsert;
