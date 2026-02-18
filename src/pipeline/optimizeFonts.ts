import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface FontOptimizeResult {
  fontsDownloaded: number;
  fontFaceRules: string;
  preloadTags: string[];
  removedGoogleFontLinks: number;
}

/**
 * Optimize Google Fonts: self-host, add font-display, generate preloads.
 */
export async function optimizeFonts(
  html: string,
  workDir: string,
  settings?: OptimizationSettings
): Promise<{ html: string; result: FontOptimizeResult }> {
  const emptyResult = (): { html: string; result: FontOptimizeResult } => ({
    html,
    result: { fontsDownloaded: 0, fontFaceRules: '', preloadTags: [], removedGoogleFontLinks: 0 },
  });
  if (settings?.fonts.enabled === false) return emptyResult();
  // Check if self-hosting is enabled
  if (settings?.fonts.selfHostGoogleFonts === false) return emptyResult();
  const $ = cheerio.load(html);
  const googleFontLinks: Array<{ href: string; element: any }> = [];

  // Find all Google Fonts <link> tags
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      googleFontLinks.push({ href, element: el });
    }
  });

  if (googleFontLinks.length === 0) {
    return {
      html: $.html(),
      result: { fontsDownloaded: 0, fontFaceRules: '', preloadTags: [], removedGoogleFontLinks: 0 },
    };
  }

  console.log(`[fonts] Found ${googleFontLinks.length} Google Fonts link(s)`);

  const fontsDir = path.join(workDir, 'assets', 'fonts');
  await fs.mkdir(fontsDir, { recursive: true });

  let allFontFaceRules = '';
  let fontsDownloaded = 0;
  const preloadTags: string[] = [];
  const criticalFontPaths: string[] = [];

  const subsetting = settings?.fonts.subsetting ?? false;
  const subsets = settings?.fonts.subsets ?? ['latin'];
  const formatPreference = settings?.fonts.formatPreference ?? 'woff2';

  for (const { href, element } of googleFontLinks) {
    try {
      let fontCssUrl = href;
      if (subsetting && subsets.length > 0) {
        const subsetParam = `subset=${subsets.join(',')}`;
        fontCssUrl = href.includes('?') ? `${href}&${subsetParam}` : `${href}?${subsetParam}`;
      }

      // Use Chrome UA for woff2; older UA for woff (legacy browser support)
      const ua = (formatPreference === 'woff2' || formatPreference === 'both')
        ? CHROME_UA
        : 'Mozilla/5.0 (Windows NT 6.1; rv:31.0) Gecko/20100101 Firefox/31.0';

      const cssResponse = await fetch(fontCssUrl, {
        headers: { 'User-Agent': ua },
        signal: AbortSignal.timeout(10000),
      });

      if (!cssResponse.ok) {
        console.warn(`[fonts] Failed to fetch Google Fonts CSS: ${cssResponse.status}`);
        continue;
      }

      const cssText = await cssResponse.text();

      // Parse and download each font file
      const fontDisplayValue = settings?.fonts.fontDisplay ?? 'swap';
      const rewrittenCss = await downloadAndRewriteFonts(
        cssText,
        fontsDir,
        fontDisplayValue,
        (fontPath) => {
          fontsDownloaded++;
          // Keep track of critical fonts for preloading
          const maxPreloads = settings?.fonts.preloadCount ?? 2;
          if (criticalFontPaths.length < maxPreloads) {
            criticalFontPaths.push(fontPath);
          }
        }
      );

      allFontFaceRules += rewrittenCss + '\n';

      // Remove the original Google Fonts <link>
      $(element).remove();
    } catch (err) {
      console.warn(`[fonts] Error processing Google Fonts:`, (err as Error).message);
    }
  }

  // Remove preconnect hints for Google Fonts (no longer needed)
  $('link[rel="preconnect"][href*="fonts.googleapis.com"]').remove();
  $('link[rel="preconnect"][href*="fonts.gstatic.com"]').remove();
  $('link[rel="dns-prefetch"][href*="fonts.googleapis.com"]').remove();
  $('link[rel="dns-prefetch"][href*="fonts.gstatic.com"]').remove();

  // Inject self-hosted font CSS inline in <head>
  if (allFontFaceRules.trim()) {
    $('head').append(`<style>${allFontFaceRules.trim()}</style>`);
  }

  // Generate preload tags for critical fonts
  const fontType = formatPreference === 'woff' ? 'font/woff' : 'font/woff2';
  for (const fontPath of criticalFontPaths) {
    const tag = `<link rel="preload" as="font" type="${fontType}" crossorigin href="${fontPath}">`;
    preloadTags.push(tag);
    // Insert preload early in <head>
    $('head').prepend(tag);
  }

  console.log(`[fonts] Self-hosted ${fontsDownloaded} font files, removed ${googleFontLinks.length} Google Fonts links`);

  return {
    html: $.html(),
    result: {
      fontsDownloaded,
      fontFaceRules: allFontFaceRules,
      preloadTags,
      removedGoogleFontLinks: googleFontLinks.length,
    },
  };
}

/**
 * Parse @font-face rules in CSS, download .woff2 files, rewrite URLs.
 */
async function downloadAndRewriteFonts(
  css: string,
  fontsDir: string,
  fontDisplay: string,
  onDownload: (localPath: string) => void
): Promise<string> {
  // Match url(...) in @font-face rules
  const urlRegex = /url\(([^)]+)\)/g;
  const downloads = new Map<string, string>(); // originalUrl → localPath

  // Collect all URLs to download
  let match;
  while ((match = urlRegex.exec(css)) !== null) {
    let url = match[1].replace(/['"]/g, '').trim();
    if (url.startsWith('data:') || downloads.has(url)) continue;

    try {
      // Download the font file
      const response = await fetch(url, {
        headers: { 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());

      // Generate a clean filename
      const urlObj = new URL(url);
      let filename = path.basename(urlObj.pathname);
      if (!filename || filename === '/') {
        filename = `font-${downloads.size}.woff2`;
      }

      const localFilePath = path.join(fontsDir, filename);
      await fs.writeFile(localFilePath, buffer);

      const localWebPath = `/assets/fonts/${filename}`;
      downloads.set(url, localWebPath);
      onDownload(localWebPath);
    } catch {
      // Non-fatal: keep original URL
    }
  }

  // Rewrite URLs in CSS
  let rewrittenCss = css;
  for (const [originalUrl, localPath] of downloads) {
    rewrittenCss = rewrittenCss.split(originalUrl).join(localPath);
  }

  // Inject font-display into all @font-face rules
  rewrittenCss = rewrittenCss.replace(/@font-face\s*\{([^}]*)\}/gi, (match, body) => {
    if (/font-display\s*:/i.test(body)) return match;
    return `@font-face{${body.trim()};font-display:${fontDisplay}}`;
  });

  return rewrittenCss;
}
