import * as cheerio from 'cheerio';
import { getImageDimensions } from './optimizeImages.js';
import path from 'path';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

export interface CLSOptimizationResult {
  imagesDimensionsInjected: number;
  fontsOptimized: number;
  dynamicContentContainersReserved: number;
  layoutContainmentApplied: number;
  estimatedCLSImprovement: number;
}

/**
 * Comprehensive CLS (Cumulative Layout Shift) optimization for preventing layout shifts
 * that cause poor user experience and performance scores.
 */
export async function optimizeCLS(
  html: string, 
  workDir: string,
  settings?: OptimizationSettings
): Promise<{ html: string; result: CLSOptimizationResult }> {
  const $ = cheerio.load(html);
  
  const result: CLSOptimizationResult = {
    imagesDimensionsInjected: 0,
    fontsOptimized: 0,
    dynamicContentContainersReserved: 0,
    layoutContainmentApplied: 0,
    estimatedCLSImprovement: 0,
  };

  // Get CLS optimization settings
  const clsSettings = settings?.cls || {
    imageDimensionInjection: true,
    fontDisplayStrategy: 'optional' as const,
    dynamicContentReservation: true,
    enableLayoutContainment: true,
    addResponsiveCSS: true,
    preventFontLoaderShifts: true,
    reserveAdSpace: true,
    cookieBannerOptimization: true,
  };

  // Phase 1: Image dimension injection (highest CLS impact ~60%)
  if (clsSettings.imageDimensionInjection) {
    result.imagesDimensionsInjected = await injectImageDimensionsAdvanced($, workDir);
    result.estimatedCLSImprovement += result.imagesDimensionsInjected * 0.15; // ~0.15 CLS per image
  }

  // Phase 2: Font display optimization (prevents FOUT/FOIT shifts)
  if (clsSettings.fontDisplayStrategy) {
    result.fontsOptimized = optimizeFontDisplay($, clsSettings.fontDisplayStrategy, clsSettings.preventFontLoaderShifts !== false);
    result.estimatedCLSImprovement += result.fontsOptimized * 0.08; // ~0.08 CLS per font
  }

  // Phase 3: Dynamic content reservation (ads, embeds, late-loading content)
  if (clsSettings.dynamicContentReservation) {
    result.dynamicContentContainersReserved = reserveDynamicContentSpace($, {
      reserveAdSpace: clsSettings.reserveAdSpace !== false,
      cookieBannerOptimization: clsSettings.cookieBannerOptimization !== false,
    });
    result.estimatedCLSImprovement += result.dynamicContentContainersReserved * 0.12;
  }

  // Phase 4: Layout containment for component isolation
  if (clsSettings.enableLayoutContainment) {
    result.layoutContainmentApplied = applyLayoutContainment($);
    result.estimatedCLSImprovement += result.layoutContainmentApplied * 0.05;
  }

  // Phase 5: Responsive image aspect ratio preservation (when enabled)
  if (clsSettings.addResponsiveCSS !== false) {
    addResponsiveImageCSS($);
  }

  return { html: $.html(), result };
}

/**
 * Advanced image dimension injection using Sharp metadata
 * Prevents the most common cause of CLS (~60% of layout shifts)
 */
async function injectImageDimensionsAdvanced(
  $: cheerio.CheerioAPI, 
  workDir: string
): Promise<number> {
  let injected = 0;

  for (const element of $('img').toArray()) {
    const $img = $(element);
    const src = $img.attr('src');
    
    if (!src) continue;

    // Skip if already has both width and height
    const hasWidth = $img.attr('width') || $img.css('width');
    const hasHeight = $img.attr('height') || $img.css('height');
    if (hasWidth && hasHeight) continue;

    // Resolve image path (assets live at workDir/assets/)
    const srcNormalized = src.startsWith('/') ? src.slice(1) : src;
    let imagePath = path.join(workDir, srcNormalized);

    try {
      let dimensions = await getImageDimensions(imagePath);
      if (!dimensions && path.basename(srcNormalized) !== srcNormalized) {
        const fallbackPath = path.join(workDir, 'assets', path.basename(srcNormalized));
        dimensions = await getImageDimensions(fallbackPath);
      }
      if (dimensions) {
        // Add width/height attributes for aspect ratio calculation
        if (!hasWidth) $img.attr('width', dimensions.width.toString());
        if (!hasHeight) $img.attr('height', dimensions.height.toString());
        
        // Calculate and add aspect ratio for modern browsers
        const aspectRatio = (dimensions.height / dimensions.width).toFixed(4);
        $img.attr('data-aspect-ratio', aspectRatio);
        
        injected++;
      }
    } catch (error) {
      console.warn(`[CLS] Failed to get dimensions for ${src}:`, (error as Error).message);
    }
  }

  return injected;
}

/**
 * Font display optimization to prevent FOUT/FOIT layout shifts
 * Implements zero-CLS font loading strategies.
 * preventFontLoaderShifts: when true, adds size-adjust/ascent-override to fallback fonts.
 */
function optimizeFontDisplay(
  $: cheerio.CheerioAPI,
  strategy: 'optional' | 'swap' | 'fallback' | 'block',
  preventFontLoaderShifts: boolean
): number {
  const displayValue = strategy === 'block' ? 'block' : strategy;
  let optimized = 0;

  // External font links (Google Fonts, etc.)
  $('link[rel="stylesheet"]').each((_, element) => {
    const $link = $(element);
    const href = $link.attr('href') || '';
    
    if (href.includes('fonts.googleapis.com') || href.includes('fonts.gstatic.com')) {
      // Add font-display parameter to Google Fonts URL
      if (!href.includes('display=')) {
        const separator = href.includes('?') ? '&' : '?';
        $link.attr('href', `${href}${separator}display=${displayValue}`);
        optimized++;
      }
    }
  });

  // Inline CSS font-face rules
  $('style').each((_, element) => {
    const $style = $(element);
    let css = $style.html() || '';
    
    // Add font-display to @font-face rules that don't have it
    css = css.replace(
      /@font-face\s*\{([^}]*)\}/g, 
      (match, inside) => {
        if (inside.includes('font-display:')) return match;
        optimized++;
        return `@font-face{${inside.trim()};font-display:${displayValue}}`;
      }
    );
    
    $style.html(css);
  });

  // Add font metric overrides for fallback fonts (prevents layout shift during swap)
  if (preventFontLoaderShifts && (displayValue === 'swap' || displayValue === 'fallback')) {
    const head = $('head');
    if (head.length) {
      head.append(`
        <style>
          /* Font metric overrides for reduced CLS during font swap */
          @font-face {
            font-family: 'Fallback Arial';
            src: local('Arial');
            ascent-override: 90%;
            descent-override: 22%;
            line-gap-override: 0%;
            size-adjust: 107%;
          }
        </style>
      `);
    }
  }

  return optimized;
}

interface ReserveOptions {
  reserveAdSpace?: boolean;
  cookieBannerOptimization?: boolean;
}

/**
 * Reserve space for dynamic content that loads after initial render
 * Prevents layout shifts from ads, embeds, widgets, etc.
 */
function reserveDynamicContentSpace($: cheerio.CheerioAPI, options?: ReserveOptions): number {
  const { reserveAdSpace = true, cookieBannerOptimization = true } = options ?? {};
  let reserved = 0;

  // Video embeds (YouTube, Vimeo, etc.)
  $('iframe').each((_, element) => {
    const $iframe = $(element);
    const src = $iframe.attr('src') || '';
    
    if (src.includes('youtube.com') || src.includes('vimeo.com') || src.includes('embed')) {
      const width = $iframe.attr('width');
      const height = $iframe.attr('height');
      
      if (width && height) {
        // Calculate aspect ratio and apply it
        const aspectRatio = (parseInt(height) / parseInt(width)) * 100;
        $iframe.wrap(`<div style="position:relative;padding-bottom:${aspectRatio}%;height:0;overflow:hidden;"></div>`);
        $iframe.css({
          'position': 'absolute',
          'top': '0',
          'left': '0',
          'width': '100%',
          'height': '100%',
        });
        reserved++;
      } else {
        // Default 16:9 aspect ratio for video embeds
        $iframe.wrap('<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;"></div>');
        $iframe.css({
          'position': 'absolute',
          'top': '0',
          'left': '0',
          'width': '100%',
          'height': '100%',
        });
        reserved++;
      }
    }
  });

  // Ad containers (common ad slot patterns) — gated by reserveAdSpace
  if (reserveAdSpace) {
    const adSelectors = [
      '[class*="ad-"]',
      '[class*="ads-"]',
      '[id*="ad-"]',
      '[id*="ads-"]',
      '.advertisement',
      '.google-ad',
      '.adsense',
    ];
    adSelectors.forEach(selector => {
    $(selector).each((_, element) => {
      const $el = $(element);
      if (!$el.css('min-height') && !$el.attr('style')?.includes('height')) {
        // Set minimum height for ad containers
        $el.css('min-height', '250px'); // Standard ad height
        reserved++;
      }
    });
    });
  }

  // Cookie banners and popups — gated by cookieBannerOptimization
  if (cookieBannerOptimization) {
    const popupSelectors = [
    '[class*="cookie"]',
    '[class*="consent"]',
    '[class*="popup"]',
    '[class*="modal"]',
    '[class*="banner"]',
  ];

    popupSelectors.forEach(selector => {
      $(selector).each((_, element) => {
        const $el = $(element);
        if (!$el.css('position')) {
          $el.css({
            'position': 'fixed',
            'transform': 'translateZ(0)',
            'will-change': 'transform',
          });
          reserved++;
        }
      });
    });
  }

  return reserved;
}

/**
 * Apply layout containment to isolate components
 * Prevents internal changes from affecting sibling elements
 */
function applyLayoutContainment($: cheerio.CheerioAPI): number {
  let applied = 0;

  // Apply containment to common container patterns
  const containerSelectors = [
    '.widget',
    '.sidebar',
    '.content-area',
    '.post-content',
    '.entry-content',
    '.article-content',
    '[class*="container"]',
    '[class*="wrapper"]',
  ];

  containerSelectors.forEach(selector => {
    $(selector).each((_, element) => {
      const $el = $(element);
      if (!$el.css('contain')) {
        $el.css('contain', 'layout style');
        applied++;
      }
    });
  });

  // Apply stricter containment to isolated components
  const isolatedSelectors = [
    '.comment-section',
    '.related-posts',
    '.author-bio',
    '[class*="social"]',
    '.share-buttons',
  ];

  isolatedSelectors.forEach(selector => {
    $(selector).each((_, element) => {
      const $el = $(element);
      if (!$el.css('contain')) {
        $el.css('contain', 'layout style paint');
        applied++;
      }
    });
  });

  return applied;
}

/**
 * Add responsive image CSS to prevent layout shifts
 * Ensures images maintain aspect ratio during loading
 */
function addResponsiveImageCSS($: cheerio.CheerioAPI): void {
  const head = $('head');
  if (head.length) {
    head.append(`
      <style>
        /* CLS Prevention: Responsive images with aspect ratio preservation */
        img {
          max-width: 100%;
          height: auto;
        }
        
        /* Modern aspect ratio support */
        img[width][height] {
          aspect-ratio: attr(width) / attr(height);
        }
        
        /* Fallback for older browsers using data-aspect-ratio */
        img[data-aspect-ratio] {
          width: 100%;
        }
        
        img[data-aspect-ratio]:before {
          content: '';
          display: block;
          padding-bottom: calc(var(--aspect-ratio, 0.75) * 100%);
        }
        
        /* Prevent layout shifts during image loading */
        img {
          background-color: #f0f0f0;
          background-image: linear-gradient(45deg, transparent 49%, rgba(255,255,255,0.1) 49%, rgba(255,255,255,0.1) 51%, transparent 51%);
          background-size: 20px 20px;
        }
        
        /* Optimize font rendering to reduce CLS */
        * {
          font-display: swap;
        }
        
        /* Prevent content shifts from focus outlines */
        *:focus {
          outline-offset: 2px;
        }
        
        /* Contain layout shifts in dynamic content areas */
        .wp-block,
        .widget,
        .sidebar {
          contain: layout style;
        }
      </style>
    `);
  }
}

/**
 * Measure potential CLS improvement based on optimization metrics
 */
export function estimateCLSImprovement(result: CLSOptimizationResult): {
  estimatedCLSBefore: number;
  estimatedCLSAfter: number;
  improvementPercentage: number;
} {
  // Assume baseline CLS of 1.013 (from user's spec)
  const estimatedCLSBefore = 1.013;
  const estimatedCLSAfter = Math.max(0.05, estimatedCLSBefore - result.estimatedCLSImprovement);
  const improvementPercentage = ((estimatedCLSBefore - estimatedCLSAfter) / estimatedCLSBefore) * 100;

  return {
    estimatedCLSBefore,
    estimatedCLSAfter,
    improvementPercentage,
  };
}

/**
 * Detect likely LCP (Largest Contentful Paint) images for priority optimization
 */
export function detectLCPImages($: cheerio.CheerioAPI): string[] {
  const lcpCandidates: string[] = [];
  
  // Look for hero images, banners, large images above the fold
  const heroSelectors = [
    '.hero img',
    '.banner img', 
    '.featured-image img',
    '.post-thumbnail img',
    'header img',
    '.slider img:first-child',
  ];
  
  heroSelectors.forEach(selector => {
    $(selector).each((_, element) => {
      const src = $(element).attr('src');
      if (src) lcpCandidates.push(src);
    });
  });
  
  // First few images are often LCP candidates
  $('img').slice(0, 3).each((_, element) => {
    const src = $(element).attr('src');
    if (src && !lcpCandidates.includes(src)) {
      lcpCandidates.push(src);
    }
  });
  
  return lcpCandidates;
}