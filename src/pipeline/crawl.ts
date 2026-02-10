import fs from 'fs/promises';
import path from 'path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { hashContent } from '../utils/crypto.js';
import { isSameOrigin, urlToPath } from '../utils/url.js';
import { config } from '../config.js';

export interface CrawlOptions {
  siteUrl: string;
  workDir: string;
  scope: string;
  existingPages: Array<{ path: string; contentHash: string }>;
  targetPages?: string[];
}

export interface CrawledPage {
  path: string;
  title: string;
  html: string;
  contentHash: string;
  assets: string[];
}

export interface AssetInfo {
  originalUrl: string;
  localPath: string;
  type: 'js' | 'css' | 'image' | 'font' | 'other';
  sizeBytes: number;
}

export interface CrawlResult {
  pages: CrawledPage[];
  assets: Map<string, AssetInfo>;
  totalPages: number;
  totalBytes: number;
}

function classifyAsset(url: string): AssetInfo['type'] {
  const lower = url.toLowerCase();
  if (lower.match(/\.js(\?|$)/)) return 'js';
  if (lower.match(/\.css(\?|$)/)) return 'css';
  if (lower.match(/\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?)(\?|$)/)) return 'image';
  if (lower.match(/\.(woff2?|ttf|eot|otf)(\?|$)/)) return 'font';
  return 'other';
}

function sanitizeFilename(url: string): string {
  try {
    const parsed = new URL(url);
    let filename = parsed.pathname.replace(/^\//, '').replace(/[^a-zA-Z0-9._/-]/g, '_');
    if (!filename || filename === '/') filename = 'index';
    // Add query hash for cache-busted URLs
    if (parsed.search) {
      const queryHash = hashContent(parsed.search).slice(0, 8);
      const ext = path.extname(filename);
      filename = filename.replace(ext, '') + '_' + queryHash + ext;
    }
    return filename;
  } catch {
    return hashContent(url).slice(0, 16);
  }
}

async function downloadAsset(
  url: string,
  workDir: string,
  assetsDir: string,
  assetRegistry: Map<string, AssetInfo>
): Promise<string | null> {
  if (assetRegistry.has(url)) {
    return assetRegistry.get(url)!.localPath;
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MetricsLabSpeed/1.0 (build-crawler; +https://metricslab.io)' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const relativePath = `assets/${sanitizeFilename(url)}`;
    const localPath = path.join(assetsDir, sanitizeFilename(url));

    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, buffer);

    assetRegistry.set(url, {
      originalUrl: url,
      localPath: relativePath,
      type: classifyAsset(url),
      sizeBytes: buffer.length,
    });

    return relativePath;
  } catch (err) {
    console.warn(`Failed to download asset ${url}:`, (err as Error).message);
    return null;
  }
}

async function extractPageData(page: Page, siteUrl: string): Promise<{
  html: string;
  title: string;
  internalLinks: string[];
  assetUrls: string[];
}> {
  const html = await page.content();
  const title = await page.title();

  const { internalLinks, assetUrls } = await page.evaluate((baseUrl: string) => {
    const links: string[] = [];
    const assets: string[] = [];

    // Collect internal links
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        links.push(href);
      }
    });

    // Collect script sources
    document.querySelectorAll('script[src]').forEach((s) => {
      assets.push((s as HTMLScriptElement).src);
    });

    // Collect stylesheet links
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach((l) => {
      assets.push((l as HTMLLinkElement).href);
    });

    // Collect images
    document.querySelectorAll('img[src]').forEach((i) => {
      assets.push((i as HTMLImageElement).src);
    });

    // Collect fonts and other linked resources
    document.querySelectorAll('link[href]').forEach((l) => {
      const link = l as HTMLLinkElement;
      if (link.rel === 'preload' || link.rel === 'prefetch') {
        assets.push(link.href);
      }
    });

    return { internalLinks: links, assetUrls: assets };
  }, siteUrl);

  return { html, title, internalLinks, assetUrls };
}

export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const { siteUrl, workDir, scope, existingPages, targetPages } = options;
  const maxPages = config.MAX_PAGES_PER_SITE;
  const concurrency = 3;
  const pageTimeout = 30000;

  const assetsDir = path.join(workDir, 'assets');
  const htmlDir = path.join(workDir, 'html');
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.mkdir(htmlDir, { recursive: true });

  const crawledPages: CrawledPage[] = [];
  const assetRegistry = new Map<string, AssetInfo>();
  const visited = new Set<string>();
  const queue: string[] = [];
  let totalBytes = 0;

  // Determine starting URLs
  if (scope === 'partial' && targetPages && targetPages.length > 0) {
    for (const p of targetPages) {
      const fullUrl = p.startsWith('http') ? p : `${siteUrl}${p.startsWith('/') ? p : '/' + p}`;
      queue.push(fullUrl);
    }
  } else {
    queue.push(siteUrl);
    // Also add /sitemap.xml discovery (best effort)
    queue.push(`${siteUrl}/`);
  }

  // Deduplicate initial queue
  const uniqueQueue = [...new Set(queue.map(u => {
    try { return new URL(u).pathname; } catch { return u; }
  }))].map(p => `${siteUrl}${p === '/' ? '' : p}`);
  queue.length = 0;
  queue.push(...uniqueQueue);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--single-process',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'MetricsLabSpeed/1.0 (build-crawler; +https://metricslab.io)',
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });

  try {
    // BFS crawl with concurrency
    while (queue.length > 0 && crawledPages.length < maxPages) {
      const batch = queue.splice(0, concurrency);
      const promises = batch.map(async (url) => {
        const pagePath = urlToPath(url, siteUrl);

        if (visited.has(pagePath)) return;
        visited.add(pagePath);

        if (crawledPages.length >= maxPages) return;

        let page: Page | null = null;
        try {
          page = await context.newPage();
          await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: pageTimeout,
          });

          const { html, title, internalLinks, assetUrls } = await extractPageData(page, siteUrl);
          const contentHash = hashContent(html);

          // For partial builds, skip unchanged pages
          if (scope === 'partial') {
            const existing = existingPages.find(p => p.path === pagePath);
            if (existing && existing.contentHash === contentHash) {
              console.log(`Skipping unchanged page: ${pagePath}`);
              return;
            }
          }

          // Download and register assets
          const pageAssets: string[] = [];
          for (const assetUrl of assetUrls) {
            if (!assetUrl || assetUrl.startsWith('data:')) continue;
            const localPath = await downloadAsset(assetUrl, workDir, assetsDir, assetRegistry);
            if (localPath) {
              pageAssets.push(localPath);
            }
          }

          // Rewrite asset URLs in HTML
          let processedHtml = html;
          for (const [originalUrl, asset] of assetRegistry) {
            // Replace all occurrences of the original URL with the local path
            processedHtml = processedHtml.split(originalUrl).join(`/${asset.localPath}`);
          }

          // Save HTML to work directory
          const htmlFilename = pagePath === '/' ? 'index.html' : `${pagePath.slice(1).replace(/\/$/, '')}/index.html`;
          const htmlPath = path.join(htmlDir, htmlFilename);
          await fs.mkdir(path.dirname(htmlPath), { recursive: true });
          await fs.writeFile(htmlPath, processedHtml, 'utf-8');

          const pageSize = Buffer.byteLength(processedHtml, 'utf-8');
          totalBytes += pageSize;

          crawledPages.push({
            path: pagePath,
            title,
            html: processedHtml,
            contentHash,
            assets: pageAssets,
          });

          // Add discovered internal links to the queue
          for (const link of internalLinks) {
            if (isSameOrigin(siteUrl, link)) {
              const linkPath = urlToPath(link, siteUrl);
              if (!visited.has(linkPath) && !queue.some(q => urlToPath(q, siteUrl) === linkPath)) {
                // Skip common non-page URLs
                if (linkPath.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|doc|mp4|mp3|css|js)$/i)) continue;
                if (linkPath.includes('wp-admin') || linkPath.includes('wp-login')) continue;
                if (linkPath.includes('?') && linkPath.includes('replytocom=')) continue;
                queue.push(`${siteUrl}${linkPath}`);
              }
            }
          }

          console.log(`Crawled: ${pagePath} (${title}) - ${pageSize} bytes`);
        } catch (err) {
          console.warn(`Failed to crawl ${url}:`, (err as Error).message);
        } finally {
          if (page) await page.close();
        }
      });

      await Promise.all(promises);
    }

    // Add asset sizes to total
    for (const asset of assetRegistry.values()) {
      totalBytes += asset.sizeBytes;
    }

    return {
      pages: crawledPages,
      assets: assetRegistry,
      totalPages: crawledPages.length,
      totalBytes,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
