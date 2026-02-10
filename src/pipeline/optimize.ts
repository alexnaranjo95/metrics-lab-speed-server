import fs from 'fs/promises';
import path from 'path';
import type { CrawledPage, AssetInfo } from './crawl.js';
import { optimizeHtml } from './optimizeHtml.js';
import { optimizeCss } from './optimizeCss.js';
import { optimizeJs, addDeferToScripts } from './optimizeJs.js';
import { optimizeImages, rewriteImageTags } from './optimizeImages.js';
import { replaceVideoEmbeds } from './videoFacades.js';
import { replaceWidgetEmbeds } from './widgetFacades.js';

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

  const stats: OptimizeStats = {
    js: { originalBytes: 0, optimizedBytes: 0 },
    css: { originalBytes: 0, optimizedBytes: 0 },
    images: { originalBytes: 0, optimizedBytes: 0 },
    facades: { total: 0 },
    scriptsRemoved: 0,
  };

  // ── Optimize CSS assets ──
  const cssAssets = [...assets.entries()].filter(([, a]) => a.type === 'css');
  const allHtmlContent = pages.map(p => p.html);

  for (const [url, asset] of cssAssets) {
    try {
      const result = await optimizeCss(asset.localPath, allHtmlContent, workDir);
      stats.css.originalBytes += result.originalBytes;
      stats.css.optimizedBytes += result.optimizedBytes;
    } catch (err) {
      console.warn(`CSS optimization failed for ${url}:`, (err as Error).message);
    }
  }

  // ── Optimize JS assets ──
  const jsAssets = [...assets.entries()].filter(([, a]) => a.type === 'js');

  for (const [url, asset] of jsAssets) {
    try {
      const result = await optimizeJs(asset.localPath, workDir);
      stats.js.originalBytes += result.originalBytes;
      stats.js.optimizedBytes += result.optimizedBytes;
      if (result.removed) stats.scriptsRemoved++;
    } catch (err) {
      console.warn(`JS optimization failed for ${url}:`, (err as Error).message);
    }
  }

  // ── Optimize images ──
  const imageAssets = [...assets.entries()].filter(([, a]) => a.type === 'image');

  for (const [url, asset] of imageAssets) {
    try {
      const result = await optimizeImages(asset.localPath, workDir);
      stats.images.originalBytes += result.originalBytes;
      stats.images.optimizedBytes += result.optimizedBytes;
    } catch (err) {
      console.warn(`Image optimization failed for ${url}:`, (err as Error).message);
    }
  }

  // ── Process each page's HTML ──
  const optimizedPages: OptimizedPage[] = [];
  let totalOptimizedBytes = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const originalSize = Buffer.byteLength(page.html, 'utf-8');

    // Step 1: HTML optimization (WP bloat removal, minification)
    let html = await optimizeHtml(page.html);

    // Step 2: Video facade replacement
    const videoResult = await replaceVideoEmbeds(html, workDir);
    html = videoResult.html;
    stats.facades.total += videoResult.facadesApplied;

    // Step 3: Widget facade replacement
    const widgetResult = await replaceWidgetEmbeds(html);
    html = widgetResult.html;
    stats.facades.total += widgetResult.facadesApplied;
    stats.scriptsRemoved += widgetResult.scriptsRemoved;

    // Step 4: Image tag rewriting (<picture> elements, lazy loading)
    html = rewriteImageTags(html, workDir);

    // Step 5: Add defer to head scripts
    html = addDeferToScripts(html);

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

    if (onPageProcessed) {
      await onPageProcessed(i);
    }
  }

  // Add asset sizes to total
  totalOptimizedBytes += stats.css.optimizedBytes + stats.js.optimizedBytes + stats.images.optimizedBytes;

  // ── Write optimized files to output directory ──
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

  return {
    pages: optimizedPages,
    stats,
    totalOptimizedBytes,
  };
}
