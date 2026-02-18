import 'dotenv/config';

function requireEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}

function intEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
  return parsed;
}

export const config = {
  // Server
  PORT: intEnv('PORT', 3002),
  NODE_ENV: optionalEnv('NODE_ENV', 'development') as string,
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info') as string,

  // Database
  DATABASE_URL: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/metrics_lab_speed'),

  // Redis
  REDIS_HOST: optionalEnv('REDIS_HOST', 'localhost') as string,
  REDIS_PORT: intEnv('REDIS_PORT', 6379),
  REDIS_PASSWORD: optionalEnv('REDIS_PASSWORD'),

  // Authentication (accept both MASTER_API_KEY and SPEED_BUILD_SERVER_MASTER_KEY for Coolify compat)
  MASTER_API_KEY: requireEnv('MASTER_API_KEY',
    process.env.SPEED_BUILD_SERVER_MASTER_KEY ?? 'dev_master_key_change_in_production'
  ),

  // AI (Claude)
  ANTHROPIC_API_KEY: optionalEnv('ANTHROPIC_API_KEY') as string | undefined,

  // Google PageSpeed Insights
  PAGESPEED_API_KEY: optionalEnv('PAGESPEED_API_KEY') as string | undefined,

  // Cloudflare
  CLOUDFLARE_ACCOUNT_ID: optionalEnv('CLOUDFLARE_ACCOUNT_ID'),
  CLOUDFLARE_API_TOKEN: optionalEnv('CLOUDFLARE_API_TOKEN'),

  // Cloudflare Images
  CF_IMAGES_API_TOKEN: optionalEnv('CF_IMAGES_API_TOKEN'),
  CF_IMAGES_ACCOUNT_HASH: optionalEnv('CF_IMAGES_ACCOUNT_HASH'),

  // Cloudflare Stream
  CF_STREAM_API_TOKEN: optionalEnv('CF_STREAM_API_TOKEN'),
  CF_STREAM_CUSTOMER_SUBDOMAIN: optionalEnv('CF_STREAM_CUSTOMER_SUBDOMAIN'),
  CF_STREAM_WEBHOOK_SECRET: optionalEnv('CF_STREAM_WEBHOOK_SECRET'),

  // Cloudflare R2 (video staging)
  CF_R2_ACCESS_KEY_ID: optionalEnv('CF_R2_ACCESS_KEY_ID'),
  CF_R2_SECRET_ACCESS_KEY: optionalEnv('CF_R2_SECRET_ACCESS_KEY'),
  CF_R2_BUCKET_NAME: optionalEnv('CF_R2_BUCKET_NAME', 'ml-video-staging'),

  // Video processing
  YTDLP_PATH: optionalEnv('YTDLP_PATH', 'yt-dlp') as string,
  VIDEO_TEMP_DIR: optionalEnv('VIDEO_TEMP_DIR', '/tmp/ml-video') as string,
  PLAYWRIGHT_SCREENSHOT_TIMEOUT_MS: intEnv('PLAYWRIGHT_SCREENSHOT_TIMEOUT_MS', 15000),
  PLAYWRIGHT_VIDEO_SEEK_SECONDS: intEnv('PLAYWRIGHT_VIDEO_SEEK_SECONDS', 3),
  PLAYWRIGHT_VIDEO_SEEK_BG_SECONDS: intEnv('PLAYWRIGHT_VIDEO_SEEK_BG_SECONDS', 2),
  BACKGROUND_VIDEO_MOBILE_BREAKPOINT: intEnv('BACKGROUND_VIDEO_MOBILE_BREAKPOINT', 768),

  // Image migration
  IMAGE_MIGRATION_CONCURRENCY: intEnv('IMAGE_MIGRATION_CONCURRENCY', 10),
  IMAGE_MAX_SIZE_MB: intEnv('IMAGE_MAX_SIZE_MB', 10),
  IMAGE_BATCH_SIZE: intEnv('IMAGE_BATCH_SIZE', 200),

  // Build workspace (persistent for checkpoint/resume; use /tmp for ephemeral)
  BUILD_WORK_DIR: optionalEnv('BUILD_WORK_DIR', './data/builds') as string,
  BUILD_CHECKPOINT_MAX_AGE_HOURS: intEnv('BUILD_CHECKPOINT_MAX_AGE_HOURS', 24),

  // Dashboard
  DASHBOARD_WEBHOOK_URL: optionalEnv('DASHBOARD_WEBHOOK_URL'),

  // Build limits
  MAX_PAGES_PER_SITE: intEnv('MAX_PAGES_PER_SITE', 500),
  MAX_CONCURRENT_BUILDS: intEnv('MAX_CONCURRENT_BUILDS', 2),
  BUILD_TIMEOUT_MINUTES: intEnv('BUILD_TIMEOUT_MINUTES', 30),

  // AI agent: page navigation timeout (analyzer crawl) — default 90s for slow sites
  AI_ANALYZER_NAV_TIMEOUT_MS: intEnv('AI_ANALYZER_NAV_TIMEOUT_MS', 90000),

  // Crawl: wait after page navigation for JS-rendered content (homepage + BFS)
  CRAWL_WAIT_AFTER_NAV_MS: intEnv('CRAWL_WAIT_AFTER_NAV_MS', 5000),
} as const;
