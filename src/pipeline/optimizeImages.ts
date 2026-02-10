import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { optimize as svgoOptimize } from 'svgo';
import { hashContent } from '../utils/crypto.js';

export interface ImageOptimizeResult {
  originalBytes: number;
  optimizedBytes: number;
  webpPath?: string;
  avifPath?: string;
  responsivePaths?: string[];
}

// Aggressive quality for Lighthouse 90+
const JPEG_QUALITY = 75;
const PNG_QUALITY = 75;
const WEBP_QUALITY = 75;
const AVIF_QUALITY = 60;

// Responsive breakpoints
const RESPONSIVE_WIDTHS = [400, 800, 1200];
const MAX_WIDTH = 1920;

/**
 * Optimize a single image file with Sharp.
 * Creates WebP/AVIF variants and responsive sizes.
 */
export async function optimizeImage(
  imageRelativePath: string,
  workDir: string
): Promise<ImageOptimizeResult> {
  const imagePath = path.join(workDir, imageRelativePath);

  let inputBuffer: Buffer;
  try {
    inputBuffer = await fs.readFile(imagePath);
  } catch {
    return { originalBytes: 0, optimizedBytes: 0 };
  }

  const originalBytes = inputBuffer.length;
  const ext = path.extname(imagePath).toLowerCase();

  // SVG: use SVGO
  if (ext === '.svg') {
    return optimizeSvg(imagePath, inputBuffer);
  }

  // Skip ICO and GIF (animated GIFs would break)
  if (ext === '.ico' || ext === '.gif') {
    return { originalBytes, optimizedBytes: originalBytes };
  }

  try {
    const metadata = await sharp(inputBuffer).metadata();
    const srcWidth = metadata.width || MAX_WIDTH;

    // Optimize the original format
    let optimizedBuffer = await optimizeByFormat(inputBuffer, ext, srcWidth);

    // Only use optimized if smaller
    if (optimizedBuffer.length >= originalBytes) {
      optimizedBuffer = inputBuffer;
    } else {
      await fs.writeFile(imagePath, optimizedBuffer);
    }

    const optimizedBytes = Math.min(optimizedBuffer.length, originalBytes);

    // Generate WebP variant
    let webpPath: string | undefined;
    if (ext !== '.webp' && ext !== '.avif') {
      try {
        const webpBuffer = await sharp(inputBuffer)
          .resize({ width: Math.min(srcWidth, MAX_WIDTH), withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY, effort: 6 })
          .toBuffer();
        webpPath = imagePath.replace(/\.[^.]+$/, '.webp');
        await fs.writeFile(webpPath, webpBuffer);
      } catch { /* non-fatal */ }
    }

    // Generate AVIF variant
    let avifPath: string | undefined;
    if (ext !== '.avif') {
      try {
        const avifBuffer = await sharp(inputBuffer)
          .resize({ width: Math.min(srcWidth, MAX_WIDTH), withoutEnlargement: true })
          .avif({ quality: AVIF_QUALITY, effort: 4 })
          .toBuffer();
        avifPath = imagePath.replace(/\.[^.]+$/, '.avif');
        await fs.writeFile(avifPath, avifBuffer);
      } catch { /* non-fatal */ }
    }

    // Generate responsive sizes (WebP only for srcset)
    const responsivePaths: string[] = [];
    for (const w of RESPONSIVE_WIDTHS) {
      if (w >= srcWidth) continue; // Don't upscale
      try {
        const resizedBuffer = await sharp(inputBuffer)
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY, effort: 6 })
          .toBuffer();
        const resizedPath = imagePath.replace(/\.[^.]+$/, `-${w}w.webp`);
        await fs.writeFile(resizedPath, resizedBuffer);
        responsivePaths.push(resizedPath);
      } catch { /* non-fatal */ }
    }

    return { originalBytes, optimizedBytes, webpPath, avifPath, responsivePaths };
  } catch (err) {
    console.warn(`[images] Optimization failed for ${imageRelativePath}:`, (err as Error).message);
    return { originalBytes, optimizedBytes: originalBytes };
  }
}

async function optimizeByFormat(input: Buffer, ext: string, srcWidth: number): Promise<Buffer> {
  const pipeline = sharp(input).resize({ width: Math.min(srcWidth, MAX_WIDTH), withoutEnlargement: true });

  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return pipeline.jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true }).toBuffer();
    case '.png':
      return pipeline.png({ quality: PNG_QUALITY, compressionLevel: 9 }).toBuffer();
    case '.webp':
      return pipeline.webp({ quality: WEBP_QUALITY, effort: 6 }).toBuffer();
    case '.avif':
      return pipeline.avif({ quality: AVIF_QUALITY, effort: 4 }).toBuffer();
    default:
      return input;
  }
}

async function optimizeSvg(imagePath: string, inputBuffer: Buffer): Promise<ImageOptimizeResult> {
  const originalBytes = inputBuffer.length;
  try {
    const svgString = inputBuffer.toString('utf-8');
    const result = svgoOptimize(svgString, {
      multipass: true,
      plugins: [
        'preset-default',
        'removeDimensions',
        { name: 'removeAttrs', params: { attrs: ['data-name'] } },
      ],
    });
    const optimizedBuffer = Buffer.from(result.data, 'utf-8');
    const optimizedBytes = optimizedBuffer.length;
    if (optimizedBytes < originalBytes) {
      await fs.writeFile(imagePath, optimizedBuffer);
    }
    return { originalBytes, optimizedBytes: Math.min(originalBytes, optimizedBytes) };
  } catch {
    return { originalBytes, optimizedBytes: originalBytes };
  }
}

/**
 * Get image dimensions from a file path.
 */
export async function getImageDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const buffer = await fs.readFile(filePath);
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
  } catch { /* non-fatal */ }
  return null;
}

/**
 * Rewrite <img> tags in HTML:
 * - Wrap in <picture> with AVIF/WebP sources + responsive srcset
 * - Add width/height attributes for CLS prevention
 * - Add loading="lazy" / decoding="async" (except LCP candidate)
 * - LCP candidate gets fetchpriority="high" + loading="eager"
 */
export function rewriteImageTags(html: string, workDir: string): string {
  let imgIndex = 0;
  let insideMain = false;
  let lcpFound = false;

  // Track if we're inside <main>, <article>, or <header> for LCP detection
  html = html.replace(
    /<img\s([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
    (match, before, src, after) => {
      imgIndex++;

      const ext = path.extname(src).toLowerCase();
      const isRaster = ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext);

      if (!isRaster) {
        // For SVG/other, just add lazy loading
        return addLoadingAttrs(match, before, after, imgIndex === 1 && !lcpFound);
      }

      // Determine LCP candidate: first large image
      const isLCP = !lcpFound && imgIndex <= 3;
      if (isLCP) lcpFound = true;

      const loadingAttr = isLCP
        ? 'loading="eager" fetchpriority="high"'
        : 'loading="lazy" decoding="async"';

      // Clean existing loading/decoding/fetchpriority attributes
      const cleanBefore = before.replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '');
      const cleanAfter = after.replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '');

      // Build srcset for responsive images
      const basePath = src.replace(/\.[^.]+$/, '');
      const avifSrc = `${basePath}.avif`;
      const webpSrc = `${basePath}.webp`;

      // Build responsive srcset
      const srcsetParts: string[] = [];
      for (const w of RESPONSIVE_WIDTHS) {
        srcsetParts.push(`${basePath}-${w}w.webp ${w}w`);
      }
      srcsetParts.push(`${webpSrc} 1200w`); // Original as largest

      const srcsetAttr = srcsetParts.length > 1
        ? ` srcset="${srcsetParts.join(', ')}" sizes="(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px"`
        : '';

      return `<picture>` +
        `<source srcset="${avifSrc}" type="image/avif">` +
        `<source${srcsetAttr ? srcsetAttr : ` srcset="${webpSrc}"`} type="image/webp">` +
        `<img ${cleanBefore}src="${src}"${cleanAfter} ${loadingAttr}>` +
        `</picture>`;
    }
  );

  return html;
}

function addLoadingAttrs(match: string, before: string, after: string, isFirst: boolean): string {
  const cleanBefore = before.replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '');
  const cleanAfter = after.replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '');
  const attrs = isFirst ? 'loading="eager"' : 'loading="lazy" decoding="async"';
  return match.replace(
    /<img\s([^>]*?)>/i,
    `<img ${cleanBefore}${cleanAfter} ${attrs}>`
  );
}

/**
 * Inject width/height on all <img> tags that don't have them.
 * Reads actual dimensions from image files in workDir.
 */
export async function injectImageDimensions(html: string, workDir: string): Promise<string> {
  const imgRegex = /<img\s([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi;
  const matches = [...html.matchAll(imgRegex)];

  for (const match of matches) {
    const fullMatch = match[0];
    const before = match[1];
    const src = match[2];
    const after = match[3];

    // Skip if already has width AND height
    if (/width=["']/i.test(before + after) && /height=["']/i.test(before + after)) {
      continue;
    }

    // Resolve the image path
    let imagePath: string;
    if (src.startsWith('/')) {
      imagePath = path.join(workDir, src);
    } else {
      imagePath = path.join(workDir, src);
    }

    const dims = await getImageDimensions(imagePath);
    if (dims) {
      const widthAttr = /width=["']/i.test(before + after) ? '' : ` width="${dims.width}"`;
      const heightAttr = /height=["']/i.test(before + after) ? '' : ` height="${dims.height}"`;
      const replacement = fullMatch.replace(/>$/, `${widthAttr}${heightAttr}>`);
      html = html.replace(fullMatch, replacement);
    }
  }

  return html;
}
