import fs from 'fs/promises';
import path from 'path';
import type { CrawledPage, AssetInfo } from './crawl.js';
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
  const { pages, assets, workDir, siteUrl, onPageProcessed } = options;

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

  // ═══ STEP 1: Optimize CSS assets (PurgeCSS + CleanCSS + font-display + hash) ═══
  console.log(`[optimize] Step 1: Optimizing CSS assets...`);
  const cssAssets = [...assets.entries()].filter(([, a]) => a.type === 'css');
  const allHtmlContent = pages.map(p => p.html);

  for (const [url, asset] of cssAssets) {
    try {
      const result = await optimizeCssFile(asset.localPath, allHtmlContent, workDir);
      stats.css.originalBytes += result.originalBytes;
      stats.css.optimizedBytes += result.optimizedBytes;
      if (result.newPath && result.newPath !== asset.localPath) {
        cssRenames.set(asset.localPath, result.newPath);
      }
    } catch (err) {
      console.warn(`[optimize] CSS optimization failed for ${url}:`, (err as Error).message);
    }
  }
  console.log(`[optimize] CSS: ${stats.css.originalBytes} → ${stats.css.optimizedBytes} bytes`);

  // ═══ STEP 2: Optimize JS assets (Terser + hash) ═══
  console.log(`[optimize] Step 2: Optimizing JS assets...`);
  const jsAssets = [...assets.entries()].filter(([, a]) => a.type === 'js');

  for (const [url, asset] of jsAssets) {
    try {
      const result = await optimizeJsFile(asset.localPath, workDir);
      stats.js.originalBytes += result.originalBytes;
      stats.js.optimizedBytes += result.optimizedBytes;
      if (result.removed) stats.scriptsRemoved++;
      if (result.newPath && result.newPath !== asset.localPath) {
        jsRenames.set(asset.localPath, result.newPath);
      }
    } catch (err) {
      console.warn(`[optimize] JS optimization failed for ${url}:`, (err as Error).message);
    }
  }
  console.log(`[optimize] JS: ${stats.js.originalBytes} → ${stats.js.optimizedBytes} bytes`);

  // ═══ STEP 3: Optimize image assets (Sharp + responsive + SVGO) ═══
  console.log(`[optimize] Step 3: Optimizing image assets...`);
  const imageAssets = [...assets.entries()].filter(([, a]) => a.type === 'image');

  for (const [url, asset] of imageAssets) {
    try {
      const result = await optimizeImage(asset.localPath, workDir);
      stats.images.originalBytes += result.originalBytes;
      stats.images.optimizedBytes += result.optimizedBytes;
    } catch (err) {
      console.warn(`[optimize] Image optimization failed for ${url}:`, (err as Error).message);
    }
  }
  console.log(`[optimize] Images: ${stats.images.originalBytes} → ${stats.images.optimizedBytes} bytes`);

  // ═══ STEP 4: Process each page's HTML ═══
  console.log(`[optimize] Step 4: Processing ${pages.length} pages...`);
  const optimizedPages: OptimizedPage[] = [];
  let totalOptimizedBytes = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const originalSize = Buffer.byteLength(page.html, 'utf-8');

    let html = page.html;

    // 4a. Update CSS/JS references to content-hashed filenames
    html = updateCssReferences(html, cssRenames);
    html = updateJsReferences(html, jsRenames);

    // 4b. WordPress bloat removal (Cheerio-based)
    html = await optimizeHtml(html);

    // 4c. Video facade replacement
    const videoResult = await replaceVideoEmbeds(html, workDir);
    html = videoResult.html;
    stats.facades.total += videoResult.facadesApplied;

    // 4d. Widget facade replacement
    const widgetResult = await replaceWidgetEmbeds(html);
    html = widgetResult.html;
    stats.facades.total += widgetResult.facadesApplied;
    stats.scriptsRemoved += widgetResult.scriptsRemoved;

    // 4e. Image tag rewriting (<picture>, lazy loading, fetchpriority)
    html = rewriteImageTags(html, workDir);

    // 4f. Inject width/height on images for CLS prevention
    html = await injectImageDimensions(html, workDir);

    // 4g. Font optimization (self-host Google Fonts, preload)
    try {
      const fontResult = await optimizeFonts(html, workDir);
      html = fontResult.html;
    } catch (err) {
      console.warn(`[optimize] Font optimization failed for ${page.path}:`, (err as Error).message);
    }

    // 4h. Move inline scripts from <head> to end of <body>
    html = moveHeadScriptsToBody(html);

    // 4i. Add defer to ALL <script src> tags
    html = addDeferToScripts(html);

    // 4j. Critical CSS extraction + async loading of non-critical CSS
    try {
      const cssFiles: Array<{ path: string; css: string }> = [];
      for (const [, asset] of assets) {
        if (asset.type === 'css') {
          try {
            const cssPath = path.join(workDir, asset.localPath);
            // Try the hashed version first
            const hashedPath = cssRenames.get(asset.localPath);
            const actualPath = hashedPath ? path.join(workDir, hashedPath) : cssPath;
            const css = await fs.readFile(actualPath, 'utf-8');
            cssFiles.push({ path: asset.localPath, css });
          } catch { /* file may have been renamed/removed */ }
        }
      }

      if (cssFiles.length > 0) {
        const critResult = await extractCriticalCss(html, cssFiles);
        html = critResult.html;
      }
    } catch (err) {
      console.warn(`[optimize] Critical CSS extraction failed for ${page.path}:`, (err as Error).message);
      // Fallback: at least make stylesheets async
      html = makeStylesheetsAsync(html);
    }

    // 4k. Resource hints (LCP preload, preconnect, cleanup)
    html = injectResourceHints(html);

    // 4l. Final HTML minification (html-minifier-terser) — runs LAST
    // Note: optimizeHtml already did minification, but we run the Cheerio output
    // through html-minifier-terser again since subsequent steps added new HTML.
    try {
      const { minify: htmlMinify } = await import('html-minifier-terser');
      html = await htmlMinify(html, {
        collapseWhitespace: true,
        removeComments: true,
        removeRedundantAttributes: true,
        minifyCSS: true,
        minifyJS: true,
        sortAttributes: true,
        collapseBooleanAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
      });
    } catch (err) {
      console.warn(`[optimize] Final HTML minification failed for ${page.path}:`, (err as Error).message);
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
  await generateHeaders(outputDir);

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
