import fs from 'fs/promises';
import path from 'path';
import { minify } from 'terser';

// Known dead scripts that serve no purpose on static sites
const DEAD_SCRIPT_PATTERNS = [
  'wp-emoji-release.min.js',
  'jquery-migrate.min.js',
  'wp-embed.min.js',
  'cart-fragments.min.js',
  'wp-polyfill.min.js',
];

export interface JsOptimizeResult {
  originalBytes: number;
  optimizedBytes: number;
  removed: boolean;
}

/**
 * Optimize a JavaScript file with Terser minification.
 * Returns removed=true if the script was identified as dead code.
 */
export async function optimizeJs(
  jsRelativePath: string,
  workDir: string
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
  const isDead = DEAD_SCRIPT_PATTERNS.some(pattern => filename.includes(pattern));
  if (isDead) {
    // Remove the file entirely
    await fs.unlink(jsPath).catch(() => {});
    return { originalBytes, optimizedBytes: 0, removed: true };
  }

  // Terser minification
  try {
    const result = await minify(jsContent, {
      compress: {
        passes: 3,
        dead_code: true,
        drop_console: true,
        drop_debugger: true,
        pure_getters: true,
        unsafe_math: true,
      },
      mangle: { toplevel: true },
      output: { comments: false },
    });

    if (result.code) {
      const optimizedBytes = Buffer.byteLength(result.code, 'utf-8');
      await fs.writeFile(jsPath, result.code, 'utf-8');
      return { originalBytes, optimizedBytes, removed: false };
    }
  } catch (err) {
    console.warn(`Terser minification failed for ${jsRelativePath}:`, (err as Error).message);
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
 * Add defer attribute to script tags in <head> that don't already have defer or async.
 * Skip scripts that use document.write (they break with defer).
 */
export function addDeferToScripts(html: string): string {
  // Match script tags in <head> that have a src but no defer/async
  return html.replace(
    /(<head[\s\S]*?<\/head>)/i,
    (headBlock) => {
      return headBlock.replace(
        /<script\s([^>]*?)src="([^"]*?)"([^>]*?)>([\s\S]*?)<\/script>/gi,
        (match, before, src, after, content) => {
          // Skip if already has defer or async
          const attrs = before + after;
          if (/\b(defer|async)\b/i.test(attrs)) return match;

          // Skip if inline content uses document.write
          if (content && usesDocumentWrite(content)) return match;

          return `<script ${before}src="${src}"${after} defer>${content}</script>`;
        }
      );
    }
  );
}
