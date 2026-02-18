import fs from 'fs/promises';
import path from 'path';
import type { CrawledPage, AssetInfo } from './crawl.js';
import type { OptimizationSettings } from '../shared/settingsSchema.js';
import { buildEmitter } from '../events/buildEmitter.js';
import { optimizeHtml } from './optimizeHtml.js';
import { optimizeCssFile, extractCriticalCss, updateCssReferences, makeStylesheetsAsync } from './optimizeCss.js';
import { optimizeJsFile, addDeferToScripts, moveHeadScriptsToBody, updateJsReferences } from './optimizeJs.js';
import { optimizeImage, rewriteImageTags, injectImageDimensions, detectLCPImageCandidates } from './optimizeImages.js';
import { replaceVideoEmbeds } from './videoFacades.js';
import { replaceWidgetEmbeds } from './widgetFacades.js';
import { optimizePageAssets } from '../services/PageAssetOptimizer.js';
import { optimizeFonts } from './optimizeFonts.js';
import { injectResourceHints } from './resourceHints.js';
import { generateHeaders } from './headersGenerator.js';
import { optimizeCLS } from './optimizeCLS.js';
import { optimizeSEO } from './optimizeSEO.js';
import { scanScripts, getScriptSummary } from '../services/scripts/ScriptScanner.js';
import { detectThirdPartyTools } from '../services/scripts/ThirdPartyDetector.js';
import { injectZarazPlaceholder } from '../services/scripts/ZarazPlaceholderInjector.js';
import { extractCriticalCss as extractCritical, injectCriticalCss } from '../services/styles/CriticalCssExtractor.js';
import { deduplicateInlineSvgs } from '../services/html/SvgSpriteOptimizer.js';
import { injectResourceHints as injectPriorityHints } from '../services/html/ResourceHintInjector.js';
import * as cheerio from 'cheerio';

export interface OptimizeOptions {
  pages: CrawledPage[];
  assets: Map<string, AssetInfo>;
  workDir: string;
  siteUrl: string;
  settings: OptimizationSettings;
  buildId?: string;
  onPageProcessed?: (pageIndex: number) => Promise<void>;
}

export interface OptimizedPage {
  path: string;
  title: string;
  html: string;
  contentHash: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
}

export interface OptimizeStats {
  js: { originalBytes: number; optimizedBytes: number };
  css: { originalBytes: number; optimizedBytes: number };
  images: { originalBytes: number; optimizedBytes: number };
  facades: { total: number };
  scriptsRemoved: number;
}

export interface OptimizeResult {
  pages: OptimizedPage[];
  stats: OptimizeStats;
  totalOptimizedBytes: number;
}

export async function optimizeAll(options: OptimizeOptions): Promise<OptimizeResult> {
  const { pages, assets, workDir, siteUrl, settings, buildId, onPageProcessed } = options;
  const emit = (phase: 'images' | 'css' | 'js' | 'html' | 'fonts', level: 'info' | 'warn' | 'error', msg: string, meta?: any) => {
    if (buildId) buildEmitter.log(buildId, phase, level, msg, meta);
  };

  console.log(`[optimize] ========== OPTIMIZATION START ==========`);
  console.log(`[optimize] Pages: ${pages.length}, Assets: ${assets.size}`);

  const stats: OptimizeStats = {
    js: { originalBytes: 0, optimizedBytes: 0 },
    css: { originalBytes: 0, optimizedBytes: 0 },
    images: { originalBytes: 0, optimizedBytes: 0 },
    facades: { total: 0 },
    scriptsRemoved: 0,
  };

  // Track filename renames for content-hashing
  const cssRenames = new Map<string, string>(); // oldRelPath → newRelPath
  const jsRenames = new Map<string, string>();

  // ═══ STEP 1: Optimize CSS assets (PurgeCSS + cssnano + font-display + hash) ═══
  if (buildId) buildEmitter.emitPhase(buildId, 'css');
  const cssAssets = [...assets.entries()].filter(([, a]) => a.type === 'css');
  const allHtmlContent = pages.map(p => p.html);

  if (!settings.css.enabled) {
    emit('css', 'info', 'CSS optimization disabled — skipping');
    console.log(`[optimize] Step 1: CSS optimization disabled (css.enabled=false) — skipping`);
  } else {
    const c = settings.css;
    const cssLog = `purge=${c.purge} (${c.purgeAggressiveness}), critical=${c.critical}, combine=${c.combineStylesheets}, minify=${c.minifyPreset}, font-display=${c.fontDisplay}`;
    emit('css', 'info', `Using settings: ${cssLog}`);
    console.log(`[optimize] CSS settings: ${cssLog}`);

    if (c.combineStylesheets && cssAssets.length > 1) {
      try {
        let combined = '';
        const combinedPaths: string[] = [];
        for (const [, asset] of cssAssets) {
          const fp = path.join(workDir, asset.localPath);
          try {
            combined += `/* Source: ${asset.localPath} */\n${await fs.readFile(fp, 'utf-8')}\n\n`;
            combinedPaths.push(asset.localPath);
          } catch { /* skip missing */ }
        }
        if (combinedPaths.length > 1) {
          const combinedRel = path.join(path.dirname(cssAssets[0][1].localPath), 'combined.css');
          const combinedFull = path.join(workDir, combinedRel);
          await fs.mkdir(path.dirname(combinedFull), { recursive: true });
          await fs.writeFile(combinedFull, combined, 'utf-8');
          const optResult = await optimizeCssFile(combinedRel, allHtmlContent, workDir, settings);
          const hashedRel = optResult.newPath!;
          for (const lp of combinedPaths) cssRenames.set(lp, hashedRel);
          stats.css.originalBytes = Buffer.byteLength(combined, 'utf-8');
          stats.css.optimizedBytes = optResult.optimizedBytes;
          for (const lp of combinedPaths) {
            try { await fs.unlink(path.join(workDir, lp)); } catch { /* ignore */ }
          }
          emit('css', 'info', `Combined ${combinedPaths.length} stylesheets → ${hashedRel}`);
          console.log(`[optimize] Combined ${combinedPaths.length} stylesheets → ${hashedRel}`);
        }
      } catch (err) {
        emit('css', 'warn', `Combine failed, falling back to per-file: ${(err as Error).message}`);
        console.warn(`[optimize] CSS combine failed:`, (err as Error).message);
      }
    }

    if (cssRenames.size === 0) {
      for (const [url, asset] of cssAssets) {
        try {
          const result = await optimizeCssFile(asset.localPath, allHtmlContent, workDir, settings);
          stats.css.originalBytes += result.originalBytes;
          stats.css.optimizedBytes += result.optimizedBytes;
          if (result.newPath && result.newPath !== asset.localPath) {
            cssRenames.set(asset.localPath, result.newPath);
          }
          emit('css', 'info', `Optimized ${asset.localPath}`, { assetUrl: url, savings: { before: result.originalBytes, after: result.optimizedBytes } });
        } catch (err) {
          emit('css', 'warn', `CSS optimization failed for ${url}: ${(err as Error).message}`);
          console.warn(`[optimize] CSS optimization failed for ${url}:`, (err as Error).message);
        }
      }
    }
    console.log(`[optimize] CSS: ${stats.css.originalBytes} → ${stats.css.optimizedBytes} bytes`);
  }

  // ═══ STEP 2: Optimize JS assets (Terser + hash) ═══
  if (buildId) buildEmitter.emitPhase(buildId, 'js');
  const jsAssets = [...assets.entries()].filter(([, a]) => a.type === 'js');

  if (!settings.js.enabled) {
    emit('js', 'info', 'JavaScript optimization disabled — skipping');
    console.log(`[optimize] Step 2: JavaScript optimization disabled (js.enabled=false) — skipping`);
  } else {
    const j = settings.js;
    const jsLog = `strategy=${j.defaultLoadingStrategy}, minify=${j.minifyEnabled}, moveToBody=${j.moveToBodyEnd}, combine=${j.combineScripts}, terser-passes=${j.terserPasses}`;
    emit('js', 'info', `Using settings: ${jsLog}`);
    console.log(`[optimize] JS settings: ${jsLog}`);

    for (const [url, asset] of jsAssets) {
      try {
        const result = await optimizeJsFile(asset.localPath, workDir, settings);
        stats.js.originalBytes += result.originalBytes;
        stats.js.optimizedBytes += result.optimizedBytes;
        if (result.removed) stats.scriptsRemoved++;
        if (result.newPath && result.newPath !== asset.localPath) {
          jsRenames.set(asset.localPath, result.newPath);
        }
        emit('js', 'info', result.removed ? `Removed ${asset.localPath}` : `Optimized ${asset.localPath}`, { assetUrl: url, savings: { before: result.originalBytes, after: result.optimizedBytes } });
      } catch (err) {
        emit('js', 'warn', `JS optimization failed for ${asset.localPath}: ${(err as Error).message}`, { assetUrl: url });
        console.warn(`[optimize] JS optimization failed for ${url}:`, (err as Error).message);
      }
    }
    console.log(`[optimize] JS: ${stats.js.originalBytes} → ${stats.js.optimizedBytes} bytes`);
  }

  // ═══ STEP 3: Optimize image assets (Sharp + responsive + SVGO) ═══
  if (buildId) buildEmitter.emitPhase(buildId, 'images');
  const imageAssets = [...assets.entries()].filter(([, a]) => a.type === 'image');

  if (!settings.images.enabled) {
    emit('images', 'info', 'Image optimization disabled — skipping');
    console.log(`[optimize] Step 3: Image optimization disabled (images.enabled=false) — skipping`);
  } else {
    emit('images', 'info', `Optimizing ${imageAssets.length} images...`);
    console.log(`[optimize] Step 3: Optimizing image assets...`);
    const imgLog = `WebP=${settings.images.webp.quality}, AVIF=${settings.images.avif.quality}, JPEG=${settings.images.jpeg.quality}, maxWidth=${settings.images.maxWidth}, convertToWebp=${settings.images.convertToWebp}, convertToAvif=${settings.images.convertToAvif}, srcset=${settings.images.generateSrcset}`;
    emit('images', 'info', `Using settings: ${imgLog}`);
    console.log(`[optimize] Image settings: ${imgLog}`);

    for (const [url, asset] of imageAssets) {
      try {
        const result = await optimizeImage(asset.localPath, workDir, settings);
        stats.images.originalBytes += result.originalBytes;
        stats.images.optimizedBytes += result.optimizedBytes;
        emit('images', 'info', `Optimized ${asset.localPath}`, { assetUrl: url, savings: { before: result.originalBytes, after: result.optimizedBytes } });
      } catch (err) {
        emit('images', 'warn', `Image optimization failed for ${url}: ${(err as Error).message}`);
        console.warn(`[optimize] Image optimization failed for ${url}:`, (err as Error).message);
      }
    }
    console.log(`[optimize] Images: ${stats.images.originalBytes} → ${stats.images.optimizedBytes} bytes`);
  }

  // ═══ STEP 4: Process each page's HTML ═══
  if (buildId) buildEmitter.emitPhase(buildId, 'html');
  console.log(`[optimize] Step 4: Processing ${pages.length} pages...`);
  const optimizedPages: OptimizedPage[] = [];
  let totalOptimizedBytes = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const originalSize = Buffer.byteLength(page.html, 'utf-8');

    let html = page.html;

    // 4a. Update CSS/JS references to content-hashed filenames
    try {
      html = updateCssReferences(html, cssRenames);
      html = updateJsReferences(html, jsRenames);
    } catch (err) {
      emit('html', 'warn', `CSS/JS reference update failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
      console.error(`[optimize] CSS/JS reference update failed for ${page.path}:`, (err as Error).message);
    }

    // 4b. WordPress bloat removal (Cheerio-based) — only when html.enabled
    if (settings.html.enabled) {
      try {
        html = await optimizeHtml(html, settings);
      } catch (err) {
        emit('html', 'warn', `WP bloat removal failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] WP bloat removal failed for ${page.path}:`, (err as Error).message);
      }
    } else if (i === 0) {
      console.log(`[html] HTML optimization disabled — skipping`);
    }

    // 4b2. CLS Optimization - Prevent layout shifts
    if (settings.cls?.enabled !== false) {
      try {
        if (i === 0) {
          const cls = settings.cls || {};
          emit('html', 'info', `CLS: dimensions=${cls.imageDimensionInjection}, fontDisplay=${cls.fontDisplayStrategy}, dynamicContent=${cls.dynamicContentReservation}, layoutContainment=${cls.enableLayoutContainment}`);
          console.log(`[optimize] CLS settings: dimensions=${cls.imageDimensionInjection}, fontDisplay=${cls.fontDisplayStrategy}, dynamicContent=${cls.dynamicContentReservation}, layoutContainment=${cls.enableLayoutContainment}`);
        }
        const clsResult = await optimizeCLS(html, workDir, settings);
        html = clsResult.html;
        if (i === 0) {
          const r = clsResult.result;
          emit('html', 'info', `CLS optimization: ${r.imagesDimensionsInjected} images fixed, ${r.fontsOptimized} fonts optimized, ${r.dynamicContentContainersReserved} containers reserved, estimated improvement: ${r.estimatedCLSImprovement.toFixed(3)}`);
          console.log(`[optimize] CLS results: ${r.imagesDimensionsInjected} images fixed, ${r.fontsOptimized} fonts optimized, ${r.dynamicContentContainersReserved} containers reserved, est. improvement: ${r.estimatedCLSImprovement.toFixed(3)}`);
        }
      } catch (err) {
        emit('html', 'warn', `CLS optimization failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] CLS optimization failed for ${page.path}:`, (err as Error).message);
      }
    }

    // 4b3. SEO Optimization - Comprehensive SEO improvements
    if (settings.seo?.enabled !== false) {
      try {
        if (i === 0) {
          const seo = settings.seo || {};
          emit('html', 'info', `SEO: altText=${seo.autoGenerateAltText}, metaTags=${seo.metaTagInjection}, structuredData=${seo.structuredDataInjection}, linkOptim=${seo.linkTextOptimization}`);
          console.log(`[optimize] SEO settings: altText=${seo.autoGenerateAltText}, metaTags=${seo.metaTagInjection}, structuredData=${seo.structuredDataInjection}, linkOptim=${seo.linkTextOptimization}`);
        }
        const seoResult = await optimizeSEO(html, { ...settings, seo: settings.seo });
        html = seoResult.html;
        if (i === 0) {
          const r = seoResult.result;
          emit('html', 'info', `SEO optimization: ${r.metaTagsInjected} meta tags, ${r.altAttributesAdded} alt attributes, ${r.linksOptimized} links optimized, estimated score: ${r.estimatedSEOScoreAfter}/100`);
          console.log(`[optimize] SEO results: ${r.metaTagsInjected} meta tags, ${r.altAttributesAdded} alt attributes, ${r.linksOptimized} links optimized, est. score: ${r.estimatedSEOScoreAfter}/100`);
        }
      } catch (err) {
        emit('html', 'warn', `SEO optimization failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] SEO optimization failed for ${page.path}:`, (err as Error).message);
      }
    }

    // 4b4. Script scanning + third-party detection + Zaraz placeholder
    if (settings.js.removeThirdPartyScripts !== false) try {
      const $scan = cheerio.load(html);
      const scriptRecords = scanScripts($scan);
      if (i === 0) {
        const summary = getScriptSummary(scriptRecords);
        emit('html', 'info', `Scripts: ${summary.total} total, ${summary.deadCode} dead, ${summary.thirdParty} third-party`);
        console.log(`[optimize] Script scan: ${summary.total} total, ${summary.deadCode} dead, ${summary.thirdParty} third-party`);
      }

      const thirdPartyReport = detectThirdPartyTools(scriptRecords);
      if (thirdPartyReport.detectedTools.length > 0 && i === 0) {
        emit('html', 'info', `Third-party: ${thirdPartyReport.detectedTools.map(t => t.name).join(', ')} (~${thirdPartyReport.estimatedPayloadSavedKb}KB)`);
        console.log(`[optimize] Third-party detected: ${thirdPartyReport.detectedTools.map(t => t.name).join(', ')}`);
      }

      // Remove or defer third-party scripts based on settings
      const thirdPartyAction = (settings.js as any).thirdPartyAction ?? 'remove';
      for (const record of scriptRecords) {
        if (record.isThirdParty && thirdPartyAction === 'remove') {
          if (record.src) {
            $scan(`script[src="${record.src}"]`).remove();
          }
        } else if (record.isThirdParty && thirdPartyAction === 'defer') {
          if (record.src) {
            $scan(`script[src="${record.src}"]`).attr('defer', '');
          }
        }
        if (record.isDeadCode && record.suggestedLoading === 'remove') {
          if (record.src) {
            $scan(`script[src*="${record.src.split('/').pop()}"]`).remove();
          } else if (record.content) {
            $scan('script:not([src])').each((_, el) => {
              const c = $scan(el).html() || '';
              if (c.trim() === record.content?.trim()) $scan(el).remove();
            });
          }
        }
      }

      // Remove scripts matching custom patterns
      const customPatterns = (settings.js as any)?.customRemovePatterns ?? [] as string[];
      if (customPatterns.length > 0) {
        $scan('script[src]').each((_, el) => {
          const src = $scan(el).attr('src') || '';
          const match = customPatterns.some((p: string) => {
            if (typeof p !== 'string' || !p) return false;
            try {
              if (p.startsWith('/') && p.endsWith('/')) {
                return new RegExp(p.slice(1, -1)).test(src);
              }
              return src.includes(p) || src.toLowerCase().includes(p.toLowerCase());
            } catch {
              return src.includes(p);
            }
          });
          if (match) {
            $scan(el).remove();
            console.log(`[optimize] Removed script matching custom pattern: ${src}`);
          }
        });
      }

      // Inject Zaraz placeholder
      const zarazResult = injectZarazPlaceholder($scan, thirdPartyReport);
      if (zarazResult.injected && i === 0) {
        emit('html', 'info', `Zaraz placeholder injected for ${zarazResult.toolCount} tools`);
      }

      html = $scan.html();
    } catch (err) {
      emit('html', 'warn', `Script scanning failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
      console.error(`[optimize] Script scanning failed for ${page.path}:`, (err as Error).message);
    }

    // 4c. Video facade replacement
    try {
      if (i === 0) {
        const v = settings.video;
        emit('images', 'info', `Media: facades=${v.facadesEnabled}, poster=${v.posterQuality}, nocookie=${v.useNocookie}, preconnect=${v.preconnect}, lazy-iframes=${v.lazyLoadIframes}, maps=${v.googleMapsUseFacade}`);
        console.log(`[optimize] Media settings: facades=${v.facadesEnabled}, poster=${v.posterQuality}, nocookie=${v.useNocookie}, preconnect=${v.preconnect}, lazy-iframes=${v.lazyLoadIframes}, maps=${v.googleMapsUseFacade}`);
      }
      const videoResult = await replaceVideoEmbeds(html, workDir, settings);
      html = videoResult.html;
      stats.facades.total += videoResult.facadesApplied;
    } catch (err) {
      emit('html', 'warn', `Video facade replacement failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
      console.error(`[optimize] Video facade replacement failed for ${page.path}:`, (err as Error).message);
    }

    // 4d. Widget facade replacement (includes Google Maps — respects video.* settings)
    try {
      const widgetResult = await replaceWidgetEmbeds(html, settings);
      html = widgetResult.html;
      stats.facades.total += widgetResult.facadesApplied;
      stats.scriptsRemoved += widgetResult.scriptsRemoved;
    } catch (err) {
      emit('html', 'warn', `Widget facade replacement failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
      console.error(`[optimize] Widget facade replacement failed for ${page.path}:`, (err as Error).message);
    }

    // 4e. Image tag rewriting (<picture>, lazy loading, fetchpriority) — only when images.enabled
    if (settings.images.enabled) {
      try {
        html = rewriteImageTags(html, workDir, settings);
      } catch (err) {
        emit('html', 'warn', `Image tag rewriting failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] Image tag rewriting failed for ${page.path}:`, (err as Error).message);
      }

      // 4f. Inject width/height on images for CLS prevention
      if (settings.images.addDimensions) {
        try {
          html = await injectImageDimensions(html, workDir);
        } catch (err) {
          emit('html', 'warn', `Image dimension injection failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
          console.error(`[optimize] Image dimension injection failed for ${page.path}:`, (err as Error).message);
        }
      }
    }

    // 4g. Font optimization (self-host Google Fonts, preload) — only when fonts.enabled
    if (settings.fonts.enabled) {
      try {
        const fontResult = await optimizeFonts(html, workDir, settings);
        html = fontResult.html;
      } catch (err) {
        emit('fonts', 'warn', `Font optimization failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] Font optimization failed for ${page.path}:`, (err as Error).message);
      }
    }

    // 4h. Move scripts from <head> to end of <body> — only when js.enabled
    if (settings.js.enabled) {
      try {
        html = moveHeadScriptsToBody(html, settings);
      } catch (err) {
        emit('html', 'warn', `Script relocation failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] Script relocation failed for ${page.path}:`, (err as Error).message);
      }

      try {
        html = addDeferToScripts(html, settings);
      } catch (err) {
        emit('html', 'warn', `Script defer failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] Script defer failed for ${page.path}:`, (err as Error).message);
      }
    }

    // 4j. Make stylesheets non-render-blocking (async loading) — only when css.enabled
    if (settings.css.enabled && settings.css.makeNonCriticalAsync) {
      try {
        const cssFiles: Array<{ path: string; css: string }> = [];
        for (const [, asset] of assets) {
          if (asset.type === 'css') {
            try {
              const cssPath = path.join(workDir, asset.localPath);
              const hashedPath = cssRenames.get(asset.localPath);
              const actualPath = hashedPath ? path.join(workDir, hashedPath) : cssPath;
              const css = await fs.readFile(actualPath, 'utf-8');
              cssFiles.push({ path: asset.localPath, css });
            } catch { /* file may have been renamed/removed */ }
          }
        }
        const critResult = await extractCriticalCss(html, cssFiles, settings.css);
        html = critResult.html;
      } catch (err) {
        emit('css', 'warn', `Async CSS conversion failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] Async CSS conversion failed for ${page.path}:`, (err as Error).message);
        try { html = makeStylesheetsAsync(html); } catch { /* last resort */ }
      }
    }

    // 4k. Resource hints (LCP preload, preconnect, cleanup)
    try {
      html = injectResourceHints(html, settings);
    } catch (err) {
      emit('html', 'warn', `Resource hints injection failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
      console.error(`[optimize] Resource hints injection failed for ${page.path}:`, (err as Error).message);
    }

    // 4k2. CF Images migration (upload all images to Cloudflare Images CDN)
    if ((settings as any).imageMigration?.enabled) {
      try {
        if (i === 0) {
          const imgMig = (settings as any).imageMigration;
          emit('images', 'info', `CF Images migration: enabled=${imgMig.enabled}, cfImages=${imgMig.useCfImages}`);
          console.log(`[optimize] CF Images migration enabled for ${page.path}`);
        }
        const assetResult = await optimizePageAssets({
          html,
          siteId: siteUrl,
          siteUrl,
          workDir,
          settings,
          onProgress: (event) => {
            if (buildId) {
              emit('images', 'info', event.message);
            }
          },
        });
        html = assetResult.optimizedHtml;
        if (i === 0) {
          const r = assetResult.report;
          emit('images', 'info', `CF Images: ${r.imagesMigrated} migrated, ${r.imagesFailed} failed, ${r.replacedCount} URLs replaced, ${r.dimensionsAdded} dimensions added`);
          console.log(`[optimize] CF Images migration: ${r.imagesMigrated} migrated, ${r.imagesFailed} failed`);
        }
      } catch (err) {
        emit('images', 'warn', `CF Images migration failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] CF Images migration failed for ${page.path}:`, (err as Error).message);
      }
    }

    // 4l-pre1. Critical CSS extraction (Playwright coverage) — only when css.critical
    if (settings.css.enabled && settings.css.critical !== false) {
      try {
        const critResult = await extractCritical(html, (msg) => {
          if (i === 0 && buildId) emit('css', 'info', msg);
        }, {
          criticalDimensions: settings.css.criticalDimensions,
          criticalForMobile: settings.css.criticalForMobile,
        });
        if (critResult.criticalCss) {
          const $crit = cheerio.load(html);
          const cssFilePaths = $crit('link[rel="stylesheet"]').toArray()
            .map(el => $crit(el).attr('href') || '')
            .filter(Boolean);
          injectCriticalCss($crit, critResult.criticalCss, cssFilePaths);
          html = $crit.html();
          if (i === 0) {
            emit('css', 'info', `Critical CSS: ${critResult.criticalSizeKb.toFixed(1)}KB inlined`);
            console.log(`[optimize] Critical CSS: ${critResult.criticalSizeKb.toFixed(1)}KB`);
          }
        }
      } catch (err) {
        emit('css', 'warn', `Critical CSS extraction failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] Critical CSS extraction failed for ${page.path}:`, (err as Error).message);
        try { html = makeStylesheetsAsync(html); } catch { /* fallback: ensure CSS is deferred */ }
      }
    }

    // 4l-pre2. SVG sprite deduplication
    if (settings.html.removeSvgDuplicates !== false) try {
      const $svg = cheerio.load(html);
      const svgResult = deduplicateInlineSvgs($svg);
      if (svgResult.spriteCreated) {
        html = $svg.html();
        if (i === 0) {
          emit('html', 'info', `SVG sprite: ${svgResult.symbolCount} symbols, ${svgResult.replacements} replacements, ~${(svgResult.savedBytes / 1024).toFixed(1)}KB saved`);
        }
      }
    } catch (err) {
      emit('html', 'warn', `SVG sprite optimization failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
      console.error(`[optimize] SVG sprite optimization failed for ${page.path}:`, (err as Error).message);
    }

    // 4l-pre3. Priority-ordered resource hint injection
    try {
      const $hints = cheerio.load(html);
      injectPriorityHints($hints, {
        hasBackgroundVideo: html.includes('ml-bg-wrapper'),
        hasCfStreamVideos: html.includes('cloudflarestream.com'),
      });
      html = $hints.html();
    } catch (err) {
      emit('html', 'warn', `Priority resource hints failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
      console.error(`[optimize] Priority resource hints failed for ${page.path}:`, (err as Error).message);
    }

    // 4l. Final HTML minification (html-minifier-terser) — runs LAST, only when html.enabled
    if (settings.html.enabled) {
      try {
        const a = settings.html.aggressive;
        if (a.removeEmptyElements) console.warn('[html] WARNING: removeEmptyElements is ON. May remove intentional spacers, icon font placeholders (<i class="fa">), and CSS-only layout elements. Visual layout may break. Test thoroughly.');
        if (a.removeTagWhitespace) console.warn('[html] WARNING: removeTagWhitespace is ON. Can break rendering in some browsers. Only enable if you have thoroughly tested the output.');

        const { minify: htmlMinify } = await import('html-minifier-terser');
        html = await htmlMinify(html, {
          collapseWhitespace: settings.html.safe.collapseWhitespace,
          removeComments: settings.html.safe.removeComments,
          removeRedundantAttributes: settings.html.safe.removeRedundantAttributes,
          useShortDoctype: settings.html.safe.useShortDoctype,
          minifyCSS: settings.html.safe.minifyCSS,
          minifyJS: settings.html.safe.minifyJS,
          collapseBooleanAttributes: settings.html.safe.collapseBooleanAttributes,
          removeScriptTypeAttributes: settings.html.safe.removeScriptTypeAttributes,
          removeStyleLinkTypeAttributes: settings.html.safe.removeStyleLinkTypeAttributes,
          decodeEntities: settings.html.safe.decodeEntities,
          ignoreCustomComments: [/^\[if /],
          // Aggressive options
          removeAttributeQuotes: a.removeAttributeQuotes,
          removeOptionalTags: a.removeOptionalTags,
          removeEmptyElements: a.removeEmptyElements,
          sortAttributes: a.sortAttributes,
          sortClassName: a.sortClassName,
          removeTagWhitespace: a.removeTagWhitespace,
        });
      } catch (err) {
        emit('html', 'warn', `Final HTML minification failed for ${page.path}: ${(err as Error).message}`, { pageUrl: page.path });
        console.error(`[optimize] Final HTML minification failed for ${page.path}:`, (err as Error).message);
      }
    }

    const optimizedSize = Buffer.byteLength(html, 'utf-8');
    totalOptimizedBytes += optimizedSize;

    optimizedPages.push({
      path: page.path,
      title: page.title,
      html,
      contentHash: page.contentHash,
      originalSizeBytes: originalSize,
      optimizedSizeBytes: optimizedSize,
    });

    console.log(`[optimize] Page ${page.path}: ${originalSize} → ${optimizedSize} bytes (${Math.round((1 - optimizedSize / originalSize) * 100)}% reduction)`);

    if (onPageProcessed) {
      await onPageProcessed(i);
    }
  }

  // Add asset sizes to total
  totalOptimizedBytes += stats.css.optimizedBytes + stats.js.optimizedBytes + stats.images.optimizedBytes;

  // ═══ STEP 5: Write optimized files to output directory ═══
  console.log(`[optimize] Step 5: Writing output files...`);
  const outputDir = path.join(workDir, 'output');
  await fs.mkdir(outputDir, { recursive: true });

  // Write optimized HTML pages
  for (const page of optimizedPages) {
    const htmlFilename = page.path === '/'
      ? 'index.html'
      : `${page.path.slice(1).replace(/\/$/, '')}/index.html`;
    const htmlPath = path.join(outputDir, htmlFilename);
    await fs.mkdir(path.dirname(htmlPath), { recursive: true });
    await fs.writeFile(htmlPath, page.html, 'utf-8');
  }

  // Copy optimized assets to output directory
  const assetsSourceDir = path.join(workDir, 'assets');
  const assetsOutputDir = path.join(outputDir, 'assets');
  try {
    await fs.cp(assetsSourceDir, assetsOutputDir, { recursive: true });
  } catch {
    // Assets dir might not exist if no assets were downloaded
  }

  // ═══ STEP 6: Generate Cloudflare _headers file ═══
  console.log(`[optimize] Step 6: Generating _headers file...`);
  await generateHeaders(outputDir, settings);

  console.log(`[optimize] ========== OPTIMIZATION COMPLETE ==========`);
  console.log(`[optimize] Total optimized bytes: ${totalOptimizedBytes}`);
  console.log(`[optimize] CSS: ${stats.css.originalBytes} → ${stats.css.optimizedBytes} (${Math.round((1 - stats.css.optimizedBytes / (stats.css.originalBytes || 1)) * 100)}% reduction)`);
  console.log(`[optimize] JS: ${stats.js.originalBytes} → ${stats.js.optimizedBytes} (${Math.round((1 - stats.js.optimizedBytes / (stats.js.originalBytes || 1)) * 100)}% reduction)`);
  console.log(`[optimize] Images: ${stats.images.originalBytes} → ${stats.images.optimizedBytes} (${Math.round((1 - stats.images.optimizedBytes / (stats.images.originalBytes || 1)) * 100)}% reduction)`);
  console.log(`[optimize] Facades applied: ${stats.facades.total}, Scripts removed: ${stats.scriptsRemoved}`);

  return {
    pages: optimizedPages,
    stats,
    totalOptimizedBytes,
  };
}
