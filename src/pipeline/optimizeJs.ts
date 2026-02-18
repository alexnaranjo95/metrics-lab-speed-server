import fs from 'fs/promises';
import path from 'path';
import { minify } from 'terser';
import { hashContent } from '../utils/crypto.js';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

export interface JsOptimizeResult {
  originalBytes: number;
  optimizedBytes: number;
  removed: boolean;
  newPath?: string;
}

/** Dead script filename patterns — when matched, file is unlinked (HTML tag removal is in optimizeHtml). */
function getDeadScriptPatterns(settings?: OptimizationSettings): string[] {
  const patterns: string[] = [];
  const r = settings?.js.removeScripts;
  if (!r || r.wpEmoji) patterns.push('wp-emoji-release', 'twemoji.min.js');
  if (!r || r.wpEmbed) patterns.push('wp-embed');
  if (!r || r.jqueryMigrate) patterns.push('jquery-migrate');
  if (!r || r.commentReply) patterns.push('comment-reply');
  if (!r || r.wpPolyfill) {
    patterns.push('wp-polyfill', 'regenerator-runtime', 'wp-polyfill-inert', 'wp-polyfill-dom-rect', 'wp-polyfill-node-contains', 'wp-polyfill-element-closest', 'wp-polyfill-formdata', 'wp-polyfill-url', 'wp-polyfill-object-fit');
  }
  if (!r || r.hoverIntent) patterns.push('hoverintent', 'hoverIntent');
  if (!r || r.adminBar) patterns.push('admin-bar');
  if (!r || r.gutenbergBlocks) {
    patterns.push('blocks.min.js', 'element.min.js', 'hooks.min.js', 'i18n.min.js', 'dom-ready.min.js', 'wp-block-editor', 'wp-edit-blocks');
  }
  patterns.push('cart-fragments');
  const custom = settings?.js?.customRemovePatterns ?? [];
  return [...patterns, ...custom.filter((p): p is string => typeof p === 'string' && p.length > 0)];
}

/**
 * Optimize a JavaScript file with Terser minification + content-hash rename.
 */
export async function optimizeJsFile(
  jsRelativePath: string,
  workDir: string,
  settings?: OptimizationSettings
): Promise<JsOptimizeResult> {
  const jsPath = path.join(workDir, jsRelativePath);

  let jsContent: string;
  try {
    jsContent = await fs.readFile(jsPath, 'utf-8');
  } catch {
    return { originalBytes: 0, optimizedBytes: 0, removed: false };
  }

  const originalBytes = Buffer.byteLength(jsContent, 'utf-8');
  const filename = path.basename(jsPath);

  const deadPatterns = getDeadScriptPatterns(settings);
  const isDead = deadPatterns.some(pattern => filename.includes(pattern));
  if (isDead) {
    await fs.unlink(jsPath).catch(() => {});
    console.log(`[js] Removed dead script: ${jsRelativePath}`);
    return { originalBytes, optimizedBytes: 0, removed: true };
  }

  if (settings?.js.removeJquery && /jquery(?!-migrate)/i.test(filename)) {
    await fs.unlink(jsPath).catch(() => {});
    console.log(`[js] Removed jQuery: ${jsRelativePath}`);
    return { originalBytes, optimizedBytes: 0, removed: true };
  }

  const minifyEnabled = settings?.js.minifyEnabled ?? true;
  if (!minifyEnabled) {
    const hash = hashContent(jsContent).slice(0, 8);
    const ext = path.extname(jsPath);
    const basename = path.basename(jsPath, ext);
    const hashedFilename = `${basename}.${hash}${ext}`;
    const hashedPath = path.join(path.dirname(jsPath), hashedFilename);
    await fs.writeFile(hashedPath, jsContent, 'utf-8');
    if (hashedPath !== jsPath) await fs.unlink(jsPath).catch(() => {});
    const hashedRelativePath = jsRelativePath.replace(path.basename(jsRelativePath), hashedFilename);
    return { originalBytes, optimizedBytes: originalBytes, removed: false, newPath: hashedRelativePath };
  }

  try {
    const result = await minify(jsContent, {
      compress: {
        passes: settings?.js.terserPasses ?? 3,
        dead_code: true,
        drop_console: settings?.js.dropConsole ?? true,
        drop_debugger: settings?.js.dropDebugger ?? true,
        conditionals: true,
        evaluate: true,
        booleans: true,
        loops: true,
        unused: true,
        join_vars: true,
        toplevel: false,
      },
      mangle: {
        toplevel: false,
        reserved: ['jQuery', '$', 'wp', 'google', 'fbq', 'gtag', 'dataLayer', 'gtag', '__ga', '_gaq'],
      },
      output: { comments: false, ascii_only: true },
    });

    if (result.code) {
      const optimizedBytes = Buffer.byteLength(result.code, 'utf-8');

      // Content-hash the filename
      const hash = hashContent(result.code).slice(0, 8);
      const ext = path.extname(jsPath);
      const basename = path.basename(jsPath, ext);
      const hashedFilename = `${basename}.${hash}${ext}`;
      const hashedPath = path.join(path.dirname(jsPath), hashedFilename);

      await fs.writeFile(hashedPath, result.code, 'utf-8');
      if (hashedPath !== jsPath) {
        await fs.unlink(jsPath).catch(() => {});
      }

      const hashedRelativePath = jsRelativePath.replace(path.basename(jsRelativePath), hashedFilename);
      console.log(`[js] ${jsRelativePath}: ${originalBytes} → ${optimizedBytes} bytes (${Math.round((1 - optimizedBytes / originalBytes) * 100)}% reduction) → ${hashedFilename}`);

      return { originalBytes, optimizedBytes, removed: false, newPath: hashedRelativePath };
    }
  } catch (err) {
    console.warn(`[js] Terser minification failed for ${jsRelativePath}:`, (err as Error).message);
  }

  return { originalBytes, optimizedBytes: originalBytes, removed: false };
}

/**
 * Check if a script uses document.write (not safe to defer).
 */
export function usesDocumentWrite(jsContent: string): boolean {
  return /document\.write\s*\(/.test(jsContent);
}

/** Scripts that must NOT be deferred (GTM, analytics, tracking). */
const CRITICAL_SCRIPT_PATTERNS = /googletagmanager|google-analytics|gtag|gtm\.js|fbevents|fbq\.js|facebook\.net\/en_US\/fbevents|analytics\.js/i;

/**
 * Apply loading strategy (defer/async/module) to script tags.
 * Skips GTM, GA, FB Pixel, and scripts that already have a strategy.
 */
export function addDeferToScripts(html: string, settings?: OptimizationSettings): string {
  const strategy = settings?.js.defaultLoadingStrategy ?? 'defer';
  const removeJquery = settings?.js.removeJquery ?? false;

  return html.replace(
    /<script\s([^>]*?)src=["']([^"']*?)["']([^>]*?)>([\s\S]*?)<\/script>/gi,
    (match, before, src, after, content) => {
      const attrs = before + after;
      if (/\b(defer|async)\b/i.test(attrs)) return match;
      if (attrs.includes('type="module"')) return match;
      if (content && usesDocumentWrite(content)) return match;
      if (CRITICAL_SCRIPT_PATTERNS.test(src)) return match;
      if (!removeJquery && /jquery(?!-migrate)\.(min\.)?js/i.test(src)) return match;

      const attr = strategy === 'module' ? ' type="module"' : strategy === 'async' ? ' async' : ' defer';
      return `<script ${before}src="${src}"${after}${attr}>${content}</script>`;
    }
  );
}

/**
 * Move scripts from <head> to end of <body>.
 * NEVER moves: GTM, GA, FB Pixel, JSON-LD, scripts with data-no-move.
 * Only runs when moveToBodyEnd is true.
 */
export function moveHeadScriptsToBody(html: string, settings?: OptimizationSettings): string {
  if (!(settings?.js.moveToBodyEnd ?? true)) return html;

  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return html;

  const headContent = headMatch[1];
  const scriptsToMove: string[] = [];

  const updatedHead = headContent.replace(
    /<script(\s[^>]*?)>([\s\S]*?)<\/script>/gi,
    (match, attrs, content) => {
      const src = attrs.match(/src=["']([^"']+)["']/i)?.[1] || '';
      if (attrs.includes('data-no-move') || attrs.includes('data-cfasync="false"')) return match;
      if (/application\/ld\+json/i.test(attrs)) return match;
      if (CRITICAL_SCRIPT_PATTERNS.test(src) || CRITICAL_SCRIPT_PATTERNS.test(content)) return match;
      if (/googletagmanager|gtag\(|dataLayer|fbq\(|_fbq/.test(content)) return match;
      if (content.length < 200 || /--[\w-]+\s*:/i.test(content)) return match;
      scriptsToMove.push(match);
      return '';
    }
  );

  if (scriptsToMove.length === 0) return html;

  html = html.replace(headMatch[0], `<head>${updatedHead}</head>`);
  html = html.replace('</body>', `${scriptsToMove.join('\n')}\n</body>`);
  return html;
}

/**
 * Update all JS references in HTML to use content-hashed filenames.
 */
export function updateJsReferences(html: string, renames: Map<string, string>): string {
  for (const [oldPath, newPath] of renames) {
    html = html.split(oldPath).join(newPath);
  }
  return html;
}
