import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export interface ImageOptimizeResult {
  originalBytes: number;
  optimizedBytes: number;
  webpPath?: string;
  avifPath?: string;
}

const MAX_WIDTH = 1920;
const JPEG_QUALITY = 80;
const PNG_QUALITY = 80;
const WEBP_QUALITY = 80;
const AVIF_QUALITY = 65;

/**
 * Optimize a single image file with Sharp.
 * Creates WebP and AVIF variants alongside the original.
 */
export async function optimizeImages(
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

  // Skip already-optimized formats and tiny files
  if (ext === '.svg') {
    return optimizeSvg(imagePath, inputBuffer);
  }

  if (ext === '.ico' || ext === '.gif') {
    // Don't re-encode ICOs or GIFs (animated GIFs would break)
    return { originalBytes, optimizedBytes: originalBytes };
  }

  try {
    let pipeline = sharp(inputBuffer);
    const metadata = await pipeline.metadata();

    // Resize if wider than MAX_WIDTH
    if (metadata.width && metadata.width > MAX_WIDTH) {
      pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    }

    // Optimize based on format
    let optimizedBuffer: Buffer;

    if (ext === '.jpg' || ext === '.jpeg') {
      optimizedBuffer = await pipeline
        .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
        .toBuffer();
    } else if (ext === '.png') {
      optimizedBuffer = await pipeline
        .png({ quality: PNG_QUALITY, compressionLevel: 9 })
        .toBuffer();
    } else if (ext === '.webp') {
      // Already WebP — just optimize quality
      optimizedBuffer = await pipeline
        .webp({ quality: WEBP_QUALITY, effort: 6 })
        .toBuffer();
    } else if (ext === '.avif') {
      // Already AVIF — just optimize quality
      optimizedBuffer = await pipeline
        .avif({ quality: AVIF_QUALITY, effort: 4 })
        .toBuffer();
    } else {
      // Unknown format, skip
      return { originalBytes, optimizedBytes: originalBytes };
    }

    // Only use optimized if it's smaller
    if (optimizedBuffer.length < originalBytes) {
      await fs.writeFile(imagePath, optimizedBuffer);
    } else {
      optimizedBuffer = inputBuffer;
    }

    const optimizedBytes = Math.min(optimizedBuffer.length, originalBytes);

    // Generate WebP variant (if not already WebP)
    let webpPath: string | undefined;
    if (ext !== '.webp' && ext !== '.avif') {
      try {
        const webpBuffer = await sharp(inputBuffer)
          .resize({ width: MAX_WIDTH, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY, effort: 6 })
          .toBuffer();
        webpPath = imagePath.replace(/\.[^.]+$/, '.webp');
        await fs.writeFile(webpPath, webpBuffer);
      } catch {
        // WebP generation failed, non-fatal
      }
    }

    // Generate AVIF variant (if not already AVIF)
    let avifPath: string | undefined;
    if (ext !== '.avif' && ext !== '.webp') {
      try {
        const avifBuffer = await sharp(inputBuffer)
          .resize({ width: MAX_WIDTH, withoutEnlargement: true })
          .avif({ quality: AVIF_QUALITY, effort: 4 })
          .toBuffer();
        avifPath = imagePath.replace(/\.[^.]+$/, '.avif');
        await fs.writeFile(avifPath, avifBuffer);
      } catch {
        // AVIF generation failed, non-fatal
      }
    }

    return { originalBytes, optimizedBytes, webpPath, avifPath };
  } catch (err) {
    console.warn(`Image optimization failed for ${imageRelativePath}:`, (err as Error).message);
    return { originalBytes, optimizedBytes: originalBytes };
  }
}

async function optimizeSvg(imagePath: string, inputBuffer: Buffer): Promise<ImageOptimizeResult> {
  const originalBytes = inputBuffer.length;
  let svg = inputBuffer.toString('utf-8');

  // Basic SVG optimization
  // Remove XML comments
  svg = svg.replace(/<!--[\s\S]*?-->/g, '');
  // Remove metadata
  svg = svg.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
  // Remove editor data (Inkscape, Illustrator, etc.)
  svg = svg.replace(/\s+(inkscape|sodipodi|xmlns:inkscape|xmlns:sodipodi|xmlns:dc|xmlns:cc|xmlns:rdf)[^=]*="[^"]*"/g, '');
  // Collapse whitespace
  svg = svg.replace(/\s{2,}/g, ' ');
  svg = svg.replace(/>\s+</g, '><');
  svg = svg.trim();

  const optimizedBuffer = Buffer.from(svg, 'utf-8');
  const optimizedBytes = optimizedBuffer.length;

  if (optimizedBytes < originalBytes) {
    await fs.writeFile(imagePath, optimizedBuffer);
  }

  return {
    originalBytes,
    optimizedBytes: Math.min(originalBytes, optimizedBytes),
  };
}

/**
 * Rewrite img tags to use <picture> element with WebP/AVIF sources.
 * Also adds loading="lazy" and decoding="async" attributes.
 */
export function rewriteImageTags(html: string, workDir: string): string {
  let imgIndex = 0;

  // Replace <img> tags with <picture> elements where alternatives exist
  html = html.replace(
    /<img\s([^>]*?)src="([^"]+\.(jpe?g|png))"([^>]*?)>/gi,
    (match, before, src, ext, after) => {
      imgIndex++;
      const avifSrc = src.replace(/\.[^.]+$/, '.avif');
      const webpSrc = src.replace(/\.[^.]+$/, '.webp');

      // First image is likely LCP — load eagerly
      const loadingAttr = imgIndex === 1
        ? 'loading="eager" fetchpriority="high"'
        : 'loading="lazy" decoding="async"';

      // Remove existing loading/decoding attributes
      const cleanBefore = before.replace(/\s*(loading|decoding|fetchpriority)="[^"]*"/g, '');
      const cleanAfter = after.replace(/\s*(loading|decoding|fetchpriority)="[^"]*"/g, '');

      return `<picture><source srcset="${avifSrc}" type="image/avif"><source srcset="${webpSrc}" type="image/webp"><img ${cleanBefore}src="${src}"${cleanAfter} ${loadingAttr}></picture>`;
    }
  );

  return html;
}
