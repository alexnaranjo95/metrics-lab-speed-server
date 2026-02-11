import fs from 'fs/promises';
import path from 'path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { hashContent } from '../utils/crypto.js';
import { isSameOrigin, urlToPath } from '../utils/url.js';
import { config } from '../config.js';
import { startScreencast, extractOverlays } from './screencast.js';
import { buildEmitter } from '../events/buildEmitter.js';

// Standard Chrome UA — avoids triggering Cloudflare/LiteSpeed bot detection
const CHROME_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface CrawlOptions {
  siteUrl: string;
  workDir: string;
  scope: string;
  existingPages: Array<{ path: string; contentHash: string }>;
  targetPages?: string[];
  buildId?: string;
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
      headers: { 'User-Agent': CHROME_USER_AGENT },
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
    console.warn(`[crawl] Failed to download asset ${url}:`, (err as Error).message);
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

    document.querySelectorAll('a[href]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        links.push(href);
      }
    });

    document.querySelectorAll('script[src]').forEach((s) => {
      assets.push((s as HTMLScriptElement).src);
    });

    document.querySelectorAll('link[rel="stylesheet"][href]').forEach((l) => {
      assets.push((l as HTMLLinkElement).href);
    });

    document.querySelectorAll('img[src]').forEach((i) => {
      assets.push((i as HTMLImageElement).src);
    });

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

/**
 * Navigate to a URL with retry logic.
 * Uses domcontentloaded + explicit wait instead of networkidle.
 * Retries up to `maxRetries` times with increasing delays.
 */
async function navigateWithRetry(
  context: BrowserContext,
  url: string,
  options: { timeout: number; maxRetries: number }
): Promise<{ page: Page; status: number }> {
  const { timeout, maxRetries } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const page = await context.newPage();
    try {
      console.log(`[crawl] Navigating to ${url} (attempt ${attempt}/${maxRetries})`);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });

      const status = response?.status() ?? 0;
      console.log(`[crawl] Navigation response: status=${status}, url=${url}`);

      // Wait for JS-rendered content to load
      await page.waitForTimeout(3000);

      // Check for bot protection pages
      if (status === 403 || status === 503) {
        const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
        console.error(`[crawl] Possible bot protection at ${url} (status ${status}): ${bodyText}`);

        if (attempt < maxRetries) {
          await page.close();
          const delay = attempt * 3000;
          console.log(`[crawl] Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      // Log first 500 chars of HTML to verify real content
      const htmlPreview = await page.evaluate(() => document.documentElement?.outerHTML?.slice(0, 500) || '');
      console.log(`[crawl] HTML preview for ${url}: ${htmlPreview}`);

      return { page, status };
    } catch (err) {
      console.error(`[crawl] Navigation failed for ${url} (attempt ${attempt}/${maxRetries}):`, (err as Error).message);
      await page.close();

      if (attempt < maxRetries) {
        const delay = attempt * 3000;
        console.log(`[crawl] Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err; // re-throw on final attempt
    }
  }

  throw new Error(`All ${maxRetries} navigation attempts failed for ${url}`);
}

export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const { siteUrl, workDir, scope, existingPages, targetPages, buildId } = options;
  let stopScreencast: (() => Promise<void>) | null = null;
  const maxPages = config.MAX_PAGES_PER_SITE;
  const concurrency = 3;
  const pageTimeout = 30000;

  console.log(`[crawl] ========== CRAWL START ==========`);
  console.log(`[crawl] Site URL: ${siteUrl}`);
  console.log(`[crawl] Scope: ${scope}`);
  console.log(`[crawl] Work dir: ${workDir}`);
  console.log(`[crawl] Max pages: ${maxPages}`);

  const assetsDir = path.join(workDir, 'assets');
  const htmlDir = path.join(workDir, 'html');
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.mkdir(htmlDir, { recursive: true });

  const crawledPages: CrawledPage[] = [];
  const assetRegistry = new Map<string, AssetInfo>();
  const visited = new Set<string>();
  const queue: string[] = [];
  let totalBytes = 0;
  let failedPages = 0;

  // Determine starting URLs
  if (scope === 'partial' && targetPages && targetPages.length > 0) {
    for (const p of targetPages) {
      const fullUrl = p.startsWith('http') ? p : `${siteUrl}${p.startsWith('/') ? p : '/' + p}`;
      queue.push(fullUrl);
    }
  } else {
    queue.push(siteUrl);
    queue.push(`${siteUrl}/`);
  }

  // Deduplicate initial queue
  const uniqueQueue = [...new Set(queue.map(u => {
    try { return new URL(u).pathname; } catch { return u; }
  }))].map(p => `${siteUrl}${p === '/' ? '' : p}`);
  queue.length = 0;
  queue.push(...uniqueQueue);

  console.log(`[crawl] Starting URLs in queue: ${JSON.stringify(queue)}`);

  console.log(`[crawl] Launching Chromium...`);
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
  console.log(`[crawl] Chromium launched successfully`);

  const context = await browser.newContext({
    userAgent: CHROME_USER_AGENT,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  console.log(`[crawl] Browser context created with UA: ${CHROME_USER_AGENT}`);

  try {
    // ── First, crawl the homepage with retry logic (critical page) ──
    if (queue.length > 0) {
      const homepageUrl = queue.shift()!;
      const homepagePath = urlToPath(homepageUrl, siteUrl);
      visited.add(homepagePath);

      console.log(`[crawl] Crawling homepage: ${homepageUrl} (path: ${homepagePath})`);

      try {
        const { page, status } = await navigateWithRetry(context, homepageUrl, {
          timeout: pageTimeout,
          maxRetries: 3,
        });

        // Start CDP screencast for live viewer
        if (buildId) {
          try {
            stopScreencast = await startScreencast(page, { buildId });
            await extractOverlays(page, buildId);
          } catch (err) {
            console.warn('[crawl] Screencast start failed (non-fatal):', (err as Error).message);
          }
          buildEmitter.log(buildId, 'crawl', 'info', `Crawling homepage: ${homepageUrl}`);
        }

        try {
          const { html, title, internalLinks, assetUrls } = await extractPageData(page, siteUrl);
          const contentHash = hashContent(html);

          console.log(`[crawl] Homepage extracted: title="${title}", html=${html.length} bytes, links=${internalLinks.length}, assets=${assetUrls.length}`);

          // Download and register assets
          const pageAssets: string[] = [];
          for (const assetUrl of assetUrls) {
            if (!assetUrl || assetUrl.startsWith('data:')) continue;
            const localPath = await downloadAsset(assetUrl, workDir, assetsDir, assetRegistry);
            if (localPath) pageAssets.push(localPath);
          }

          // Rewrite asset URLs in HTML
          let processedHtml = html;
          for (const [originalUrl, asset] of assetRegistry) {
            processedHtml = processedHtml.split(originalUrl).join(`/${asset.localPath}`);
          }

          // Save HTML
          const htmlFilename = homepagePath === '/' ? 'index.html' : `${homepagePath.slice(1).replace(/\/$/, '')}/index.html`;
          const htmlPath = path.join(htmlDir, htmlFilename);
          await fs.mkdir(path.dirname(htmlPath), { recursive: true });
          await fs.writeFile(htmlPath, processedHtml, 'utf-8');

          const pageSize = Buffer.byteLength(processedHtml, 'utf-8');
          totalBytes += pageSize;

          crawledPages.push({
            path: homepagePath,
            title,
            html: processedHtml,
            contentHash,
            assets: pageAssets,
          });

          // Add discovered internal links
          let linksAdded = 0;
          for (const link of internalLinks) {
            if (isSameOrigin(siteUrl, link)) {
              const linkPath = urlToPath(link, siteUrl);
              if (!visited.has(linkPath) && !queue.some(q => urlToPath(q, siteUrl) === linkPath)) {
                if (linkPath.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|doc|mp4|mp3|css|js)$/i)) continue;
                if (linkPath.includes('wp-admin') || linkPath.includes('wp-login')) continue;
                if (linkPath.includes('?') && linkPath.includes('replytocom=')) continue;
                queue.push(`${siteUrl}${linkPath}`);
                linksAdded++;
              }
            }
          }

          console.log(`[crawl] Homepage crawled: ${homepagePath} (${title}) - ${pageSize} bytes, ${linksAdded} new links queued`);
        } finally {
          await page.close();
        }
      } catch (err) {
        console.error(`[crawl] HOMEPAGE CRAWL FAILED after all retries: ${(err as Error).message}`);
        failedPages++;
      }
    }

    // ── BFS crawl remaining pages ──
    console.log(`[crawl] Starting BFS crawl. Queue has ${queue.length} URLs after homepage.`);

    while (queue.length > 0 && crawledPages.length < maxPages) {
      const batch = queue.splice(0, concurrency);
      const promises = batch.map(async (url) => {
        const pagePath = urlToPath(url, siteUrl);

        if (visited.has(pagePath)) return;
        visited.add(pagePath);

        if (crawledPages.length >= maxPages) return;

        let page: Page | null = null;
        try {
          console.log(`[crawl] Crawling: ${url} (path: ${pagePath})`);
          page = await context.newPage();

          const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: pageTimeout,
          });

          const status = response?.status() ?? 0;
          console.log(`[crawl] Response: status=${status} for ${url}`);

          if (status === 403 || status === 503) {
            console.warn(`[crawl] Skipping ${url}: possible bot protection (status ${status})`);
            failedPages++;
            return;
          }

          if (status >= 400) {
            console.warn(`[crawl] Skipping ${url}: HTTP error (status ${status})`);
            failedPages++;
            return;
          }

          // Wait for JS-rendered content
          await page.waitForTimeout(2000);

          const { html, title, internalLinks, assetUrls } = await extractPageData(page, siteUrl);
          const contentHash = hashContent(html);

          // For partial builds, skip unchanged pages
          if (scope === 'partial') {
            const existing = existingPages.find(p => p.path === pagePath);
            if (existing && existing.contentHash === contentHash) {
              console.log(`[crawl] Skipping unchanged page: ${pagePath}`);
              return;
            }
          }

          // Download and register assets
          const pageAssets: string[] = [];
          for (const assetUrl of assetUrls) {
            if (!assetUrl || assetUrl.startsWith('data:')) continue;
            const localPath = await downloadAsset(assetUrl, workDir, assetsDir, assetRegistry);
            if (localPath) pageAssets.push(localPath);
          }

          // Rewrite asset URLs in HTML
          let processedHtml = html;
          for (const [originalUrl, asset] of assetRegistry) {
            processedHtml = processedHtml.split(originalUrl).join(`/${asset.localPath}`);
          }

          // Save HTML
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

          // Add discovered internal links
          for (const link of internalLinks) {
            if (isSameOrigin(siteUrl, link)) {
              const linkPath = urlToPath(link, siteUrl);
              if (!visited.has(linkPath) && !queue.some(q => urlToPath(q, siteUrl) === linkPath)) {
                if (linkPath.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|doc|mp4|mp3|css|js)$/i)) continue;
                if (linkPath.includes('wp-admin') || linkPath.includes('wp-login')) continue;
                if (linkPath.includes('?') && linkPath.includes('replytocom=')) continue;
                queue.push(`${siteUrl}${linkPath}`);
              }
            }
          }

          console.log(`[crawl] Crawled: ${pagePath} (${title}) - ${pageSize} bytes`);
          if (buildId) {
            buildEmitter.log(buildId, 'crawl', 'info', `Crawled ${pagePath} (${title})`, { pageUrl: pagePath });
          }
        } catch (err) {
          console.error(`[crawl] Failed to crawl ${url}:`, (err as Error).message);
          if (buildId) {
            buildEmitter.log(buildId, 'crawl', 'warn', `Failed to crawl ${url}: ${(err as Error).message}`);
          }
          failedPages++;
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

    console.log(`[crawl] ========== CRAWL COMPLETE ==========`);
    console.log(`[crawl] Pages crawled: ${crawledPages.length}`);
    console.log(`[crawl] Pages failed: ${failedPages}`);
    console.log(`[crawl] Assets downloaded: ${assetRegistry.size}`);
    console.log(`[crawl] Total bytes: ${totalBytes}`);
    console.log(`[crawl] Remaining in queue: ${queue.length}`);

    return {
      pages: crawledPages,
      assets: assetRegistry,
      totalPages: crawledPages.length,
      totalBytes,
    };
  } finally {
    // Stop screencast before closing browser
    if (stopScreencast) {
      try { await stopScreencast(); } catch { /* non-fatal */ }
    }
    await context.close();
    await browser.close();
    console.log(`[crawl] Browser closed`);
  }
}
