import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface FontOptimizeResult {
  fontsDownloaded: number;
  fontFaceRules: string; // The rewritten @font-face CSS to inline
  preloadTags: string[]; // <link rel="preload"> tags for critical fonts
  removedGoogleFontLinks: number;
}

/**
 * Optimize Google Fonts: self-host, add font-display:swap, generate preloads.
 *
 * 1. Detect <link> tags pointing to fonts.googleapis.com
 * 2. Download the CSS (requesting woff2 format via UA)
 * 3. Parse @font-face rules, download each .woff2 file
 * 4. Save fonts to /assets/fonts/ in workDir
 * 5. Rewrite @font-face rules to point to local paths + font-display:swap
 * 6. Return rules to inline in <style> + preload tags for critical fonts
 */
export async function optimizeFonts(
  html: string,
  workDir: string
): Promise<{ html: string; result: FontOptimizeResult }> {
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

  for (const { href, element } of googleFontLinks) {
    try {
      // Download the Google Fonts CSS (request woff2 format)
      const cssResponse = await fetch(href, {
        headers: { 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(10000),
      });

      if (!cssResponse.ok) {
        console.warn(`[fonts] Failed to fetch Google Fonts CSS: ${cssResponse.status}`);
        continue;
      }

      const cssText = await cssResponse.text();

      // Parse and download each font file
      const rewrittenCss = await downloadAndRewriteFonts(
        cssText,
        fontsDir,
        (fontPath) => {
          fontsDownloaded++;
          // Keep track of first 2 fonts for preloading
          if (criticalFontPaths.length < 2) {
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
  for (const fontPath of criticalFontPaths) {
    const tag = `<link rel="preload" as="font" type="font/woff2" crossorigin href="${fontPath}">`;
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

  // Inject font-display: swap into all @font-face rules
  rewrittenCss = rewrittenCss.replace(/@font-face\s*\{([^}]*)\}/gi, (match, body) => {
    if (/font-display\s*:/i.test(body)) return match;
    return `@font-face{${body.trim()};font-display:swap}`;
  });

  return rewrittenCss;
}
