/**
 * PageAssetOptimizer — Master orchestrator for Systems A, B, and C.
 *
 * Coordinates three pipelines in parallel:
 * - System A: Background video (native <video> + CF Stream HLS)
 * - System B: Click-to-play video (facade pattern)
 * - System C: Full image migration to CF Images
 *
 * Produces a single optimized HTML output with all asset URLs replaced.
 */

import * as cheerio from 'cheerio';
import type { OptimizationSettings } from '../shared/settingsSchema.js';
import { scanImages, type ImageRecord } from './assets/ImageScanner.js';
import { migrateAll, type MigrationResult } from './assets/ImageBatchMigrator.js';
import { replaceAllUrls } from './assets/ImageUrlReplacer.js';

export interface AssetOptimizationInput {
  html: string;
  siteId: string;
  siteUrl: string;
  workDir: string;
  settings: OptimizationSettings;
  onProgress?: (event: AssetProgressEvent) => void;
}

export interface AssetProgressEvent {
  type: string;
  message: string;
  data?: Record<string, any>;
}

export interface AssetOptimizationReport {
  imagesTotal: number;
  imagesMigrated: number;
  imagesFailed: number;
  imagesSkipped: number;
  videosBg: number;
  videosClickPlay: number;
  replacedCount: number;
  dimensionsAdded: number;
}

export interface AssetOptimizationResult {
  optimizedHtml: string;
  report: AssetOptimizationReport;
}

/**
 * Run full page asset optimization: image migration + preload injection.
 *
 * Video processing (Systems A+B) is handled separately in videoFacades.ts
 * since it's already integrated into the optimize.ts pipeline.
 * This module focuses on System C (image migration) and cross-system
 * preload tag ordering.
 */
export async function optimizePageAssets(
  input: AssetOptimizationInput
): Promise<AssetOptimizationResult> {
  const { html, siteId, siteUrl, settings, workDir } = input;
  const imgSettings = (settings as any).imageMigration;

  if (!imgSettings?.enabled || imgSettings?.useCfImages === false) {
    return {
      optimizedHtml: html,
      report: {
        imagesTotal: 0, imagesMigrated: 0, imagesFailed: 0, imagesSkipped: 0,
        videosBg: 0, videosClickPlay: 0, replacedCount: 0, dimensionsAdded: 0,
      },
    };
  }

  const $ = cheerio.load(html);

  // ── Step 1: Scan all images ──
  input.onProgress?.({
    type: 'scan_complete',
    message: 'Scanning page for images...',
  });

  const imageRecords = scanImages(html, siteUrl);

  input.onProgress?.({
    type: 'scan_complete',
    message: `Found ${imageRecords.length} images`,
    data: { images: imageRecords.length },
  });

  console.log(`[asset-optimizer] Found ${imageRecords.length} images to process`);

  // ── Step 2: Migrate images to CF Images ──
  input.onProgress?.({
    type: 'images_progress',
    message: 'Migrating images to Cloudflare Images...',
    data: { migrated: 0, total: imageRecords.length },
  });

  const migrationResults = await migrateAll(
    imageRecords,
    siteId,
    (migrated, total, currentUrl) => {
      input.onProgress?.({
        type: 'images_progress',
        message: `Migrating images: ${migrated}/${total}`,
        data: { migrated, total, currentUrl },
      });
    },
    workDir,
    {
      skipSvg: imgSettings?.skipSvg,
      maxSizeMb: imgSettings?.maxSizeMb,
      concurrency: imgSettings?.concurrency,
    }
  );

  // ── Step 3: Replace all URLs in HTML ──
  input.onProgress?.({
    type: 'replacing_html',
    message: 'Updating image URLs in HTML...',
  });

  const { replacedCount, dimensionsAdded } = replaceAllUrls($, imageRecords, migrationResults);

  // ── Step 4: Inject priority-ordered preload tags ──
  injectCriticalPreloads($, imageRecords, migrationResults);

  // ── Step 5: Clean up WordPress lazy-load artifacts ──
  cleanupWpArtifacts($);

  // ── Build report ──
  const migrated = migrationResults.filter(r => r.status === 'migrated').length;
  const existing = migrationResults.filter(r => r.status === 'existing').length;
  const failed = migrationResults.filter(r => r.status === 'failed').length;
  const skipped = migrationResults.filter(r => r.status === 'skipped').length;

  const report: AssetOptimizationReport = {
    imagesTotal: imageRecords.length,
    imagesMigrated: migrated + existing,
    imagesFailed: failed,
    imagesSkipped: skipped,
    videosBg: 0,
    videosClickPlay: 0,
    replacedCount,
    dimensionsAdded,
  };

  console.log(
    `[asset-optimizer] Complete: ${report.imagesMigrated} migrated, ` +
    `${report.imagesFailed} failed, ${report.imagesSkipped} skipped, ` +
    `${report.replacedCount} URLs replaced, ${report.dimensionsAdded} dimensions added`
  );

  input.onProgress?.({
    type: 'complete',
    message: `Image optimization complete: ${report.imagesMigrated} migrated`,
    data: report as any,
  });

  return {
    optimizedHtml: $.html(),
    report,
  };
}

/**
 * Inject preload tags in priority order:
 * 1. Background video screenshot
 * 2. Hero/banner image
 * 3. Site logo
 * 4. Video poster (above fold)
 */
function injectCriticalPreloads(
  $: cheerio.CheerioAPI,
  records: ImageRecord[],
  results: MigrationResult[]
): void {
  const head = $('head').first();
  if (!head.length) return;

  const preloads: string[] = [];
  const urlMap = new Map<string, MigrationResult>();

  for (let i = 0; i < records.length; i++) {
    const result = results[i];
    if (!result || result.status === 'failed' || result.status === 'skipped') continue;
    urlMap.set(records[i].resolvedUrl, result);
  }

  // Collect critical above-fold images
  const criticalRecords = records
    .filter(r => r.isCritical && r.isAboveFold)
    .sort((a, b) => {
      // Hero/banner first, then logo
      const aHero = a.locationType === 'css-background' || a.elementSelector.includes('hero') ? 0 : 1;
      const bHero = b.locationType === 'css-background' || b.elementSelector.includes('hero') ? 0 : 1;
      return aHero - bHero;
    });

  for (const rec of criticalRecords.slice(0, 4)) {
    const result = urlMap.get(rec.resolvedUrl);
    if (!result || result.cfDeliveryUrl === rec.resolvedUrl) continue;

    const thumbUrl = result.cfDeliveryUrl.replace(/\/public$/, '/thumb');
    const tag = `<link rel="preload" href="${result.cfDeliveryUrl}" as="image" imagesrcset="${thumbUrl} 640w, ${result.cfDeliveryUrl} 1280w" imagesizes="(max-width: 640px) 640px, 1280px" fetchpriority="high">`;

    // Don't duplicate existing preloads
    if ($(`link[href="${result.cfDeliveryUrl}"]`).length === 0) {
      preloads.push(tag);
    }
  }

  if (preloads.length > 0) {
    head.prepend(preloads.join('\n'));
  }
}

/**
 * Clean up WordPress/LiteSpeed lazy-loading artifacts that are no longer needed.
 */
function cleanupWpArtifacts($: cheerio.CheerioAPI): void {
  $('[data-lazyloaded]').removeAttr('data-lazyloaded');
  $('[data-ll-status]').removeAttr('data-ll-status');
  $('[data-lazy-loaded]').removeAttr('data-lazy-loaded');
  $('[data-lazy-src]').removeAttr('data-lazy-src');
  $('[data-ll-src]').removeAttr('data-ll-src');
}
