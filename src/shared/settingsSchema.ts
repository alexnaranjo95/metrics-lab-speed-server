import { z } from 'zod';

// ─── Image Settings ───────────────────────────────────────────────

const webpSettingsSchema = z.object({
  quality: z.number().min(1).max(100).default(80),
  effort: z.number().min(0).max(6).default(4),
  lossless: z.boolean().default(false),
  preset: z.enum(['default', 'photo', 'picture', 'drawing', 'icon', 'text']).default('default'),
});

const avifSettingsSchema = z.object({
  quality: z.number().min(1).max(100).default(50),
  effort: z.number().min(0).max(9).default(4),
  chromaSubsampling: z.enum(['4:2:0', '4:4:4']).default('4:4:4'),
  lossless: z.boolean().default(false),
});

const jpegSettingsSchema = z.object({
  quality: z.number().min(1).max(100).default(80),
  mozjpeg: z.boolean().default(true),
  progressive: z.boolean().default(true),
});

const qualityTierSchema = z.object({
  quality: z.number().min(1).max(100),
  lazyLoad: z.boolean(),
  fetchPriority: z.enum(['high', 'low', 'auto']),
  urlPatterns: z.array(z.string()).default([]),
  cssSelectors: z.array(z.string()).default([]),
});

const qualityTiersSchema = z.object({
  hero: qualityTierSchema.default({
    quality: 88, lazyLoad: false, fetchPriority: 'high',
    urlPatterns: [], cssSelectors: [],
  }),
  standard: qualityTierSchema.default({
    quality: 78, lazyLoad: true, fetchPriority: 'auto',
    urlPatterns: [], cssSelectors: [],
  }),
  thumbnail: qualityTierSchema.default({
    quality: 65, lazyLoad: true, fetchPriority: 'low',
    urlPatterns: [], cssSelectors: [],
  }),
});

const imageSettingsSchema = z.object({
  webp: webpSettingsSchema.default({ quality: 80, effort: 4, lossless: false, preset: 'default' }),
  avif: avifSettingsSchema.default({ quality: 50, effort: 4, chromaSubsampling: '4:4:4', lossless: false }),
  jpeg: jpegSettingsSchema.default({ quality: 80, mozjpeg: true, progressive: true }),
  format: z.enum(['webp', 'avif', 'auto']).default('auto'),
  breakpoints: z.array(z.number()).default([320, 640, 768, 1024, 1280, 1920]),
  maxWidth: z.number().default(2560),
  lazyLoadMargin: z.number().min(0).max(2000).default(200),
  stripMetadata: z.boolean().default(true),
  lcpDetection: z.enum(['auto', 'manual', 'disabled']).default('auto'),
  qualityTiers: qualityTiersSchema.default({
    hero: { quality: 88, lazyLoad: false, fetchPriority: 'high', urlPatterns: [], cssSelectors: [] },
    standard: { quality: 78, lazyLoad: true, fetchPriority: 'auto', urlPatterns: [], cssSelectors: [] },
    thumbnail: { quality: 65, lazyLoad: true, fetchPriority: 'low', urlPatterns: [], cssSelectors: [] },
  }),
});

// ─── Video / Media Settings ───────────────────────────────────────

const platformsSchema = z.object({
  youtube: z.boolean().default(true),
  vimeo: z.boolean().default(true),
  wistia: z.boolean().default(true),
});

const videoSettingsSchema = z.object({
  facadesEnabled: z.boolean().default(true),
  posterQuality: z.enum(['default', 'mqdefault', 'hqdefault', 'sddefault', 'maxresdefault']).default('sddefault'),
  posterLoading: z.enum(['lazy', 'eager']).default('lazy'),
  youtubeParams: z.string().default('rel=0&modestbranding=1'),
  preconnect: z.boolean().default(true),
  useNocookie: z.boolean().default(true),
  customPlayButton: z.boolean().default(false),
  platforms: platformsSchema.default({ youtube: true, vimeo: true, wistia: true }),
});

// ─── CSS Settings ─────────────────────────────────────────────────

const purgeSafelistSchema = z.object({
  standard: z.array(z.string()).default([
    'active', 'open', 'visible', 'show', 'hide', 'collapsed', 'hidden', 'current-menu-item',
  ]),
  deep: z.array(z.string()).default([
    '/^wp-/', '/^is-/', '/^has-/', '/^alignwide/', '/^alignfull/', '/^gallery/',
    '/^swiper-/', '/^slick-/', '/^woocommerce/',
  ]),
  greedy: z.array(z.string()).default([
    '/modal/', '/dropdown/', '/tooltip/', '/popover/', '/carousel/', '/slider/', '/swiper/',
  ]),
});

const cssSettingsSchema = z.object({
  purge: z.boolean().default(true),
  purgeSafelist: purgeSafelistSchema.default({
    standard: ['active', 'open', 'visible', 'show', 'hide', 'collapsed', 'hidden', 'current-menu-item'],
    deep: ['/^wp-/', '/^is-/', '/^has-/', '/^alignwide/', '/^alignfull/', '/^gallery/', '/^swiper-/', '/^slick-/', '/^woocommerce/'],
    greedy: ['/modal/', '/dropdown/', '/tooltip/', '/popover/', '/carousel/', '/slider/', '/swiper/'],
  }),
  purgeTestMode: z.boolean().default(false),
  critical: z.boolean().default(true),
  criticalDimensions: z.array(z.object({
    width: z.number(),
    height: z.number(),
  })).default([
    { width: 320, height: 480 },
    { width: 768, height: 1024 },
    { width: 1300, height: 900 },
  ]),
  minifyPreset: z.enum(['default', 'advanced', 'lite']).default('default'),
  fontDisplay: z.enum(['swap', 'optional', 'fallback', 'block']).default('swap'),
  sizeAdjust: z.string().optional(),
  ascentOverride: z.string().optional(),
  descentOverride: z.string().optional(),
});

// ─── JavaScript Settings ──────────────────────────────────────────

const removeScriptsSchema = z.object({
  wpEmoji: z.boolean().default(true),
  wpEmbed: z.boolean().default(true),
  jqueryMigrate: z.boolean().default(true),
  commentReply: z.boolean().default(true),
  wpPolyfill: z.boolean().default(true),
  hoverIntent: z.boolean().default(true),
  adminBar: z.boolean().default(true),
  gutenbergBlocks: z.boolean().default(true),
  dashicons: z.boolean().default(true),
  wpBlockLibrary: z.boolean().default(true),
  wpBlockLibraryTheme: z.boolean().default(true),
  classicThemeStyles: z.boolean().default(true),
});

const jsSettingsSchema = z.object({
  defaultLoadingStrategy: z.enum(['defer', 'async', 'module']).default('defer'),
  removeScripts: removeScriptsSchema.default({
    wpEmoji: true, wpEmbed: true, jqueryMigrate: true, commentReply: true,
    wpPolyfill: true, hoverIntent: true, adminBar: true, gutenbergBlocks: true,
    dashicons: true, wpBlockLibrary: true, wpBlockLibraryTheme: true, classicThemeStyles: true,
  }),
  removeJquery: z.boolean().default(false),
  dropConsole: z.boolean().default(true),
  dropDebugger: z.boolean().default(true),
  terserPasses: z.number().min(1).max(5).default(3),
});

// ─── HTML Settings ────────────────────────────────────────────────

const htmlSafeSchema = z.object({
  collapseWhitespace: z.boolean().default(true),
  removeComments: z.boolean().default(true),
  collapseBooleanAttributes: z.boolean().default(true),
  removeRedundantAttributes: z.boolean().default(true),
  removeScriptTypeAttributes: z.boolean().default(true),
  removeStyleLinkTypeAttributes: z.boolean().default(true),
  useShortDoctype: z.boolean().default(true),
  minifyCSS: z.boolean().default(true),
  minifyJS: z.boolean().default(true),
  decodeEntities: z.boolean().default(true),
});

const htmlAggressiveSchema = z.object({
  removeAttributeQuotes: z.boolean().default(false),
  removeOptionalTags: z.boolean().default(false),
  removeEmptyElements: z.boolean().default(false),
  sortAttributes: z.boolean().default(false),
  sortClassName: z.boolean().default(false),
  removeTagWhitespace: z.boolean().default(false),
});

const wpHeadBloatSchema = z.object({
  metaGenerator: z.boolean().default(true),
  wlwmanifest: z.boolean().default(true),
  editUri: z.boolean().default(true),
  apiWpOrg: z.boolean().default(true),
  shortlink: z.boolean().default(true),
  rssFeedLinks: z.boolean().default(true),
  commentsFeedLink: z.boolean().default(true),
  pingback: z.boolean().default(true),
  dnsPrefetchWpOrg: z.boolean().default(true),
  oembedDiscovery: z.boolean().default(true),
  prevNextLinks: z.boolean().default(true),
});

const htmlSettingsSchema = z.object({
  safe: htmlSafeSchema.default({
    collapseWhitespace: true, removeComments: true, collapseBooleanAttributes: true,
    removeRedundantAttributes: true, removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true, useShortDoctype: true,
    minifyCSS: true, minifyJS: true, decodeEntities: true,
  }),
  aggressive: htmlAggressiveSchema.default({
    removeAttributeQuotes: false, removeOptionalTags: false, removeEmptyElements: false,
    sortAttributes: false, sortClassName: false, removeTagWhitespace: false,
  }),
  wpHeadBloat: wpHeadBloatSchema.default({
    metaGenerator: true, wlwmanifest: true, editUri: true, apiWpOrg: true,
    shortlink: true, rssFeedLinks: true, commentsFeedLink: true, pingback: true,
    dnsPrefetchWpOrg: true, oembedDiscovery: true, prevNextLinks: true,
  }),
  removeAnalytics: z.boolean().default(true),
});

// ─── Font Settings ────────────────────────────────────────────────

const fontSettingsSchema = z.object({
  selfHostGoogleFonts: z.boolean().default(true),
  preloadCount: z.number().min(0).max(5).default(2),
  fontDisplay: z.enum(['swap', 'optional', 'fallback', 'block']).default('swap'),
  subsetting: z.boolean().default(false),
  formatPreference: z.enum(['woff2', 'woff', 'both']).default('woff2'),
});

// ─── Cache & Headers Settings ─────────────────────────────────────

const cacheDurationsSchema = z.object({
  html: z.string().default('public, max-age=0, must-revalidate'),
  cssJs: z.string().default('public, max-age=31536000, immutable'),
  imagesHashed: z.string().default('public, max-age=31536000, immutable'),
  imagesUnhashed: z.string().default('public, max-age=86400'),
  fonts: z.string().default('public, max-age=31536000, immutable'),
  favicon: z.string().default('public, max-age=86400'),
});

const securityHeadersSchema = z.object({
  xContentTypeOptions: z.boolean().default(true),
  xFrameOptions: z.enum(['DENY', 'SAMEORIGIN', 'disabled']).default('DENY'),
  strictTransportSecurity: z.boolean().default(true),
  referrerPolicy: z.enum([
    'strict-origin-when-cross-origin', 'no-referrer', 'origin',
    'same-origin', 'origin-when-cross-origin',
  ]).default('strict-origin-when-cross-origin'),
  permissionsPolicy: z.boolean().default(true),
  contentSecurityPolicy: z.string().optional(),
  xXssProtection: z.boolean().default(true),
});

const cacheSettingsSchema = z.object({
  durations: cacheDurationsSchema.default({
    html: 'public, max-age=0, must-revalidate',
    cssJs: 'public, max-age=31536000, immutable',
    imagesHashed: 'public, max-age=31536000, immutable',
    imagesUnhashed: 'public, max-age=86400',
    fonts: 'public, max-age=31536000, immutable',
    favicon: 'public, max-age=86400',
  }),
  securityHeaders: securityHeadersSchema.default({
    xContentTypeOptions: true, xFrameOptions: 'DENY',
    strictTransportSecurity: true, referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: true, xXssProtection: true,
  }),
});

// ─── AI Settings ──────────────────────────────────────────────────

const aiFeaturesSchema = z.object({
  altText: z.boolean().default(false),
  metaDescriptions: z.boolean().default(false),
  structuredData: z.boolean().default(false),
  accessibilityImprovements: z.boolean().default(false),
  contentOptimization: z.boolean().default(false),
});

const aiSettingsSchema = z.object({
  model: z.enum(['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-5-haiku']).default('claude-3-5-sonnet'),
  perBuildTokenBudget: z.number().default(100000),
  perPageTokenLimit: z.number().default(10000),
  monthlyCostCap: z.number().default(50),
  autoPauseOnBudget: z.boolean().default(true),
  features: aiFeaturesSchema.default({
    altText: false, metaDescriptions: false, structuredData: false,
    accessibilityImprovements: false, contentOptimization: false,
  }),
  customInstructions: z.string().default(''),
});

// ─── Build Settings ───────────────────────────────────────────────

const buildSettingsSchema = z.object({
  scheduleMode: z.enum(['manual', 'cron', 'webhook', 'api']).default('manual'),
  cronPattern: z.string().default(''),
  pageSelection: z.enum(['sitemap', 'url_list', 'pattern']).default('sitemap'),
  customUrls: z.array(z.string()).default([]),
  excludePatterns: z.array(z.string()).default([
    '/wp-admin/*', '/feed/*', '/author/*', '/?s=*',
  ]),
  pageLoadTimeout: z.number().min(10).max(120).default(30),
  networkIdleTimeout: z.number().min(1).max(30).default(5),
  maxRetries: z.number().min(0).max(10).default(3),
  retryBackoffMs: z.number().default(5000),
  maxConcurrentPages: z.number().min(1).max(10).default(3),
});

// ─── Root Schema ──────────────────────────────────────────────────

export const settingsSchema = z.object({
  images: imageSettingsSchema.default({
    webp: { quality: 80, effort: 4, lossless: false, preset: 'default' },
    avif: { quality: 50, effort: 4, chromaSubsampling: '4:4:4', lossless: false },
    jpeg: { quality: 80, mozjpeg: true, progressive: true },
    format: 'auto', breakpoints: [320, 640, 768, 1024, 1280, 1920],
    maxWidth: 2560, lazyLoadMargin: 200, stripMetadata: true, lcpDetection: 'auto',
    qualityTiers: {
      hero: { quality: 88, lazyLoad: false, fetchPriority: 'high', urlPatterns: [], cssSelectors: [] },
      standard: { quality: 78, lazyLoad: true, fetchPriority: 'auto', urlPatterns: [], cssSelectors: [] },
      thumbnail: { quality: 65, lazyLoad: true, fetchPriority: 'low', urlPatterns: [], cssSelectors: [] },
    },
  }),
  video: videoSettingsSchema.default({
    facadesEnabled: true, posterQuality: 'sddefault', posterLoading: 'lazy',
    youtubeParams: 'rel=0&modestbranding=1', preconnect: true, useNocookie: true,
    customPlayButton: false, platforms: { youtube: true, vimeo: true, wistia: true },
  }),
  css: cssSettingsSchema.default({
    purge: true, purgeSafelist: {
      standard: ['active', 'open', 'visible', 'show', 'hide', 'collapsed', 'hidden', 'current-menu-item'],
      deep: ['/^wp-/', '/^is-/', '/^has-/', '/^alignwide/', '/^alignfull/', '/^gallery/', '/^swiper-/', '/^slick-/', '/^woocommerce/'],
      greedy: ['/modal/', '/dropdown/', '/tooltip/', '/popover/', '/carousel/', '/slider/', '/swiper/'],
    }, purgeTestMode: false, critical: true,
    criticalDimensions: [{ width: 320, height: 480 }, { width: 768, height: 1024 }, { width: 1300, height: 900 }],
    minifyPreset: 'default', fontDisplay: 'swap',
  }),
  js: jsSettingsSchema.default({
    defaultLoadingStrategy: 'defer',
    removeScripts: {
      wpEmoji: true, wpEmbed: true, jqueryMigrate: true, commentReply: true,
      wpPolyfill: true, hoverIntent: true, adminBar: true, gutenbergBlocks: true,
      dashicons: true, wpBlockLibrary: true, wpBlockLibraryTheme: true, classicThemeStyles: true,
    }, removeJquery: false, dropConsole: true, dropDebugger: true, terserPasses: 3,
  }),
  html: htmlSettingsSchema.default({
    safe: {
      collapseWhitespace: true, removeComments: true, collapseBooleanAttributes: true,
      removeRedundantAttributes: true, removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true, useShortDoctype: true,
      minifyCSS: true, minifyJS: true, decodeEntities: true,
    },
    aggressive: {
      removeAttributeQuotes: false, removeOptionalTags: false, removeEmptyElements: false,
      sortAttributes: false, sortClassName: false, removeTagWhitespace: false,
    },
    wpHeadBloat: {
      metaGenerator: true, wlwmanifest: true, editUri: true, apiWpOrg: true,
      shortlink: true, rssFeedLinks: true, commentsFeedLink: true, pingback: true,
      dnsPrefetchWpOrg: true, oembedDiscovery: true, prevNextLinks: true,
    },
    removeAnalytics: true,
  }),
  fonts: fontSettingsSchema.default({
    selfHostGoogleFonts: true, preloadCount: 2, fontDisplay: 'swap',
    subsetting: false, formatPreference: 'woff2',
  }),
  cache: cacheSettingsSchema.default({
    durations: {
      html: 'public, max-age=0, must-revalidate',
      cssJs: 'public, max-age=31536000, immutable',
      imagesHashed: 'public, max-age=31536000, immutable',
      imagesUnhashed: 'public, max-age=86400',
      fonts: 'public, max-age=31536000, immutable',
      favicon: 'public, max-age=86400',
    },
    securityHeaders: {
      xContentTypeOptions: true, xFrameOptions: 'DENY',
      strictTransportSecurity: true, referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: true, xXssProtection: true,
    },
  }),
  ai: aiSettingsSchema.default({
    model: 'claude-3-5-sonnet', perBuildTokenBudget: 100000, perPageTokenLimit: 10000,
    monthlyCostCap: 50, autoPauseOnBudget: true,
    features: { altText: false, metaDescriptions: false, structuredData: false, accessibilityImprovements: false, contentOptimization: false },
    customInstructions: '',
  }),
  build: buildSettingsSchema.default({
    scheduleMode: 'manual', cronPattern: '', pageSelection: 'sitemap',
    customUrls: [], excludePatterns: ['/wp-admin/*', '/feed/*', '/author/*', '/?s=*'],
    pageLoadTimeout: 30, networkIdleTimeout: 5, maxRetries: 3, retryBackoffMs: 5000, maxConcurrentPages: 3,
  }),
});

/** Full settings type — every field populated */
export type OptimizationSettings = z.infer<typeof settingsSchema>;

/**
 * Recursively make all properties of a type optional (deep partial).
 * Used for sparse override storage where only non-default values are saved.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

/** Sparse override type for storage — every nested field optional */
export type SettingsOverride = DeepPartial<OptimizationSettings>;

/**
 * Validate a sparse settings override at runtime.
 * We use .partial() on the top-level and rely on the deep merge logic
 * to handle nested fields. The stored value is a plain JSON object
 * that only contains overridden fields.
 */
export function validateSettingsOverride(data: unknown): { success: boolean; data?: SettingsOverride; error?: string } {
  if (data === null || data === undefined) return { success: true, data: {} };
  if (typeof data !== 'object') return { success: false, error: 'Settings must be an object' };

  // Attempt to merge with defaults and validate the full result
  try {
    const merged = settingsSchema.parse(data);
    // If it parsed, the override is valid (we store just the sparse input)
    return { success: true, data: data as SettingsOverride };
  } catch (err: any) {
    if (err?.issues) {
      return { success: false, error: err.issues.map((e: any) => `${(e.path || []).join('.')}: ${e.message}`).join('; ') };
    }
    return { success: false, error: 'Invalid settings' };
  }
}

// ─── Application Defaults ─────────────────────────────────────────

export const APP_DEFAULTS: OptimizationSettings = settingsSchema.parse({});

// ─── Sub-schema exports for per-tab validation ────────────────────

export {
  imageSettingsSchema,
  videoSettingsSchema,
  cssSettingsSchema,
  jsSettingsSchema,
  htmlSettingsSchema,
  fontSettingsSchema,
  cacheSettingsSchema,
  aiSettingsSchema,
  buildSettingsSchema,
};
