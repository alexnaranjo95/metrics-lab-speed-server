import fs from 'fs/promises';
import path from 'path';
import type { CrawledPage, AssetInfo } from './crawl.js';
import type { OptimizationSettings } from '../shared/settingsSchema.js';
import { buildEmitter } from '../events/buildEmitter.js';
import { optimizeHtml } from './optimizeHtml.js';
import { optimizeCssFile, extractCriticalCss, updateCssReferences, makeStylesheetsAsync } from './optimizeCss.js';
import { optimizeJsFile, addDeferToScripts, moveHeadScriptsToBody, updateJsReferences } from './optimizeJs.js';
import { optimizeImage, rewriteImageTags, injectImageDimensions } from './optimizeImages.js';
import { replaceVideoEmbeds } from './videoFacades.js';
import { replaceWidgetEmbeds } from './widgetFacades.js';
import { optimizeFonts } from './optimizeFonts.js';
import { injectResourceHints } from './resourceHints.js';
import { generateHeaders } from './headersGenerator.js';

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
      console.error(`[optimize] CSS/JS reference update failed for ${page.path}:`, (err as Error).message);
    }

    // 4b. WordPress bloat removal (Cheerio-based) — only when html.enabled
    if (settings.html.enabled) {
      try {
        html = await optimizeHtml(html, settings);
      } catch (err) {
        console.error(`[optimize] WP bloat removal failed for ${page.path}:`, (err as Error).message);
      }
    } else if (i === 0) {
      console.log(`[html] HTML optimization disabled — skipping`);
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
      console.error(`[optimize] Video facade replacement failed for ${page.path}:`, (err as Error).message);
    }

    // 4d. Widget facade replacement (includes Google Maps — respects video.* settings)
    try {
      const widgetResult = await replaceWidgetEmbeds(html, settings);
      html = widgetResult.html;
      stats.facades.total += widgetResult.facadesApplied;
      stats.scriptsRemoved += widgetResult.scriptsRemoved;
    } catch (err) {
      console.error(`[optimize] Widget facade replacement failed for ${page.path}:`, (err as Error).message);
    }

    // 4e. Image tag rewriting (<picture>, lazy loading, fetchpriority) — only when images.enabled
    if (settings.images.enabled) {
      try {
        html = rewriteImageTags(html, workDir, settings);
      } catch (err) {
        console.error(`[optimize] Image tag rewriting failed for ${page.path}:`, (err as Error).message);
      }

      // 4f. Inject width/height on images for CLS prevention
      if (settings.images.addDimensions) {
        try {
          html = await injectImageDimensions(html, workDir);
        } catch (err) {
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
        console.error(`[optimize] Font optimization failed for ${page.path}:`, (err as Error).message);
      }
    }

    // 4h. Move scripts from <head> to end of <body> — only when js.enabled
    if (settings.js.enabled) {
      try {
        html = moveHeadScriptsToBody(html, settings);
      } catch (err) {
        console.error(`[optimize] Script relocation failed for ${page.path}:`, (err as Error).message);
      }

      try {
        html = addDeferToScripts(html, settings);
      } catch (err) {
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
        console.error(`[optimize] Async CSS conversion failed for ${page.path}:`, (err as Error).message);
        try { html = makeStylesheetsAsync(html); } catch { /* last resort */ }
      }
    }

    // 4k. Resource hints (LCP preload, preconnect, cleanup)
    try {
      html = injectResourceHints(html);
    } catch (err) {
      console.error(`[optimize] Resource hints injection failed for ${page.path}:`, (err as Error).message);
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
