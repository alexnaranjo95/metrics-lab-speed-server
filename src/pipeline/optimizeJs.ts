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

/**
 * Build the dead script patterns from settings.
 */
function getDeadScriptPatterns(settings?: OptimizationSettings): string[] {
  const patterns: string[] = [];
  const r = settings?.js.removeScripts;
  if (!r || r.wpEmoji) patterns.push('wp-emoji-release.min.js');
  if (!r || r.jqueryMigrate) patterns.push('jquery-migrate.min.js');
  if (!r || r.wpEmbed) patterns.push('wp-embed.min.js');
  if (!r || r.wpPolyfill) patterns.push('wp-polyfill.min.js');
  if (!r || r.commentReply) patterns.push('comment-reply.min.js');
  if (!r || r.hoverIntent) patterns.push('hoverintent-js.min.js');
  if (!r || r.adminBar) patterns.push('admin-bar.js');
  // Always remove cart fragments
  patterns.push('cart-fragments.min.js');
  return patterns;
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

  // Check if this is a known dead script
  const deadPatterns = getDeadScriptPatterns(settings);
  const isDead = deadPatterns.some(pattern => filename.includes(pattern));
  if (isDead) {
    await fs.unlink(jsPath).catch(() => {});
    console.log(`[js] Removed dead script: ${jsRelativePath}`);
    return { originalBytes, optimizedBytes: 0, removed: true };
  }

  // Check jQuery removal setting
  if (settings?.js.removeJquery && filename.includes('jquery') && !filename.includes('jquery-migrate')) {
    await fs.unlink(jsPath).catch(() => {});
    console.log(`[js] Removed jQuery: ${jsRelativePath}`);
    return { originalBytes, optimizedBytes: 0, removed: true };
  }

  // Terser minification
  try {
    const result = await minify(jsContent, {
      compress: {
        passes: settings?.js.terserPasses ?? 3,
        dead_code: true,
        drop_console: settings?.js.dropConsole ?? true,
        drop_debugger: settings?.js.dropDebugger ?? true,
        pure_getters: true,
        unsafe_math: true,
      },
      mangle: { toplevel: true },
      output: { comments: false },
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

/**
 * Add defer attribute to ALL <script src> tags in the entire document
 * that don't already have defer or async.
 * Skip scripts that use document.write.
 */
export function addDeferToScripts(html: string): string {
  return html.replace(
    /<script\s([^>]*?)src=["']([^"']*?)["']([^>]*?)>([\s\S]*?)<\/script>/gi,
    (match, before, src, after, content) => {
      const attrs = before + after;
      // Skip if already has defer or async
      if (/\b(defer|async)\b/i.test(attrs)) return match;
      // Skip if inline content uses document.write
      if (content && usesDocumentWrite(content)) return match;

      return `<script ${before}src="${src}"${after} defer>${content}</script>`;
    }
  );
}

/**
 * Move inline <script> blocks from <head> to end of <body>.
 * Keeps scripts that set critical CSS variables or are tiny config objects.
 */
export function moveHeadScriptsToBody(html: string): string {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return html;

  const headContent = headMatch[1];
  const scriptsToMove: string[] = [];

  // Find inline scripts in head (no src attribute)
  const updatedHead = headContent.replace(
    /<script(?!\s[^>]*src=)([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attrs, content) => {
      // Keep tiny config scripts (< 200 chars) and JSON-LD in head
      if (content.length < 200 || /application\/ld\+json/i.test(attrs)) {
        return match;
      }
      // Keep scripts that define CSS custom properties
      if (/--[\w-]+\s*:/i.test(content)) {
        return match;
      }
      scriptsToMove.push(match);
      return ''; // Remove from head
    }
  );

  if (scriptsToMove.length === 0) return html;

  // Replace head
  html = html.replace(headMatch[0], `<head>${updatedHead}</head>`);

  // Append scripts before </body>
  const scriptsBlock = scriptsToMove.join('\n');
  html = html.replace('</body>', `${scriptsBlock}\n</body>`);

  console.log(`[js] Moved ${scriptsToMove.length} inline scripts from <head> to end of <body>`);
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
