import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { optimize as svgoOptimize } from 'svgo';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

// Default responsive widths for use in rewriteImageTags (used when no settings passed)
const DEFAULT_RESPONSIVE_WIDTHS = [320, 640, 768, 1024, 1280, 1920];

export interface ImageOptimizeResult {
  originalBytes: number;
  optimizedBytes: number;
  webpPath?: string;
  avifPath?: string;
  responsivePaths?: string[];
}

/**
 * Optimize a single image file with Sharp.
 * Creates WebP/AVIF variants and responsive sizes per settings.
 */
export async function optimizeImage(
  imageRelativePath: string,
  workDir: string,
  settings?: OptimizationSettings
): Promise<ImageOptimizeResult> {
  // Derive quality settings from resolved settings or use defaults
  const imgs = settings?.images;
  const JPEG_QUALITY = imgs?.jpeg?.quality ?? 80;
  const PNG_QUALITY = imgs?.jpeg?.quality ?? 80;
  const WEBP_QUALITY = imgs?.webp?.quality ?? 80;
  const AVIF_QUALITY = imgs?.avif?.quality ?? 50;
  const WEBP_EFFORT = imgs?.webp?.effort ?? 4;
  const AVIF_EFFORT = imgs?.avif?.effort ?? 4;
  const RESPONSIVE_WIDTHS = imgs?.breakpoints ?? [320, 640, 768, 1024, 1280, 1920];
  const MAX_WIDTH = imgs?.maxWidth ?? 2560;
  const convertToWebp = imgs?.convertToWebp ?? true;
  const convertToAvif = imgs?.convertToAvif ?? false;
  const generateSrcset = imgs?.generateSrcset ?? true;
  const keepOriginalAsFallback = imgs?.keepOriginalAsFallback ?? true;
  const stripMetadata = imgs?.stripMetadata ?? true;
  const optimizeSvgEnabled = imgs?.optimizeSvg ?? true;

  const imagePath = path.join(workDir, imageRelativePath);

  let inputBuffer: Buffer;
  try {
    inputBuffer = await fs.readFile(imagePath);
  } catch {
    return { originalBytes: 0, optimizedBytes: 0 };
  }

  const originalBytes = inputBuffer.length;
  const ext = path.extname(imagePath).toLowerCase();

  // SVG: use SVGO only when optimizeSvg is enabled
  if (ext === '.svg') {
    return optimizeSvg(imagePath, inputBuffer, optimizeSvgEnabled);
  }

  // Skip ICO and GIF (animated GIFs would break)
  if (ext === '.ico' || ext === '.gif') {
    return { originalBytes, optimizedBytes: originalBytes };
  }

  try {
    const metadata = await sharp(inputBuffer).metadata();
    const srcWidth = metadata.width || MAX_WIDTH;

    // Optimize the original format
    let optimizedBuffer = await optimizeByFormat(inputBuffer, ext, srcWidth, {
      jpegQuality: JPEG_QUALITY, pngQuality: PNG_QUALITY,
      webpQuality: WEBP_QUALITY, webpEffort: WEBP_EFFORT,
      avifQuality: AVIF_QUALITY, avifEffort: AVIF_EFFORT, maxWidth: MAX_WIDTH,
      stripMetadata,
    });

    // Only use optimized if smaller
    if (optimizedBuffer.length >= originalBytes) {
      optimizedBuffer = inputBuffer;
    } else {
      await fs.writeFile(imagePath, optimizedBuffer);
    }

    const optimizedBytes = Math.min(optimizedBuffer.length, originalBytes);

    // Generate WebP variant (only when convertToWebp)
    let webpPath: string | undefined;
    if (convertToWebp && ext !== '.webp' && ext !== '.avif') {
      try {
        let pipeline = sharp(inputBuffer)
          .resize({ width: Math.min(srcWidth, MAX_WIDTH), withoutEnlargement: true });
        if (stripMetadata) pipeline = pipeline.withMetadata(false);
        const webpBuffer = await pipeline
          .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
          .toBuffer();
        webpPath = imagePath.replace(/\.[^.]+$/, '.webp');
        await fs.writeFile(webpPath, webpBuffer);
      } catch { /* non-fatal */ }
    }

    // Generate AVIF variant (only when convertToAvif)
    let avifPath: string | undefined;
    if (convertToAvif && ext !== '.avif') {
      try {
        let pipeline = sharp(inputBuffer)
          .resize({ width: Math.min(srcWidth, MAX_WIDTH), withoutEnlargement: true });
        if (stripMetadata) pipeline = pipeline.withMetadata(false);
        const avifBuffer = await pipeline
          .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
          .toBuffer();
        avifPath = imagePath.replace(/\.[^.]+$/, '.avif');
        await fs.writeFile(avifPath, avifBuffer);
      } catch { /* non-fatal */ }
    }

    // Generate responsive sizes (only when generateSrcset and convertToWebp)
    const responsivePaths: string[] = [];
    if (generateSrcset && convertToWebp) {
      for (const w of RESPONSIVE_WIDTHS) {
        if (w >= srcWidth) continue; // Don't upscale
        try {
          let pipeline = sharp(inputBuffer)
            .resize({ width: w, withoutEnlargement: true });
          if (stripMetadata) pipeline = pipeline.withMetadata(false);
          const resizedBuffer = await pipeline
            .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
            .toBuffer();
          const resizedPath = imagePath.replace(/\.[^.]+$/, `-${w}w.webp`);
          await fs.writeFile(resizedPath, resizedBuffer);
          responsivePaths.push(resizedPath);
        } catch { /* non-fatal */ }
      }
    }

    // When keepOriginalAsFallback is false, remove original if we have WebP
    if (!keepOriginalAsFallback && webpPath) {
      try {
        await fs.unlink(imagePath);
      } catch { /* non-fatal */ }
    }

    return { originalBytes, optimizedBytes, webpPath, avifPath, responsivePaths };
  } catch (err) {
    console.warn(`[images] Optimization failed for ${imageRelativePath}:`, (err as Error).message);
    return { originalBytes, optimizedBytes: originalBytes };
  }
}

interface FormatOptions {
  jpegQuality: number; pngQuality: number;
  webpQuality: number; webpEffort: number;
  avifQuality: number; avifEffort: number;
  maxWidth: number;
  stripMetadata: boolean;
}

async function optimizeByFormat(input: Buffer, ext: string, srcWidth: number, opts: FormatOptions): Promise<Buffer> {
  let pipeline = sharp(input).resize({ width: Math.min(srcWidth, opts.maxWidth), withoutEnlargement: true });
  if (opts.stripMetadata) pipeline = pipeline.withMetadata(false);

  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return pipeline.jpeg({ quality: opts.jpegQuality, progressive: true, mozjpeg: true }).toBuffer();
    case '.png':
      return pipeline.png({ quality: opts.pngQuality, compressionLevel: 9 }).toBuffer();
    case '.webp':
      return pipeline.webp({ quality: opts.webpQuality, effort: opts.webpEffort }).toBuffer();
    case '.avif':
      return pipeline.avif({ quality: opts.avifQuality, effort: opts.avifEffort }).toBuffer();
    default:
      return input;
  }
}

async function optimizeSvg(imagePath: string, inputBuffer: Buffer, enabled: boolean): Promise<ImageOptimizeResult> {
  const originalBytes = inputBuffer.length;
  if (!enabled) return { originalBytes, optimizedBytes: originalBytes };
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

/** Image settings subset needed for rewriteImageTags */
export type ImageRewriteSettings = Pick<
  OptimizationSettings['images'],
  | 'convertToWebp'
  | 'convertToAvif'
  | 'keepOriginalAsFallback'
  | 'generateSrcset'
  | 'breakpoints'
  | 'lazyLoadEnabled'
  | 'lazyLoadMargin'
  | 'lcpDetection'
  | 'lcpImageSelector'
  | 'lcpImageFetchPriority'
>;

const DEFAULT_IMAGE_REWRITE: ImageRewriteSettings = {
  convertToWebp: true,
  convertToAvif: false,
  keepOriginalAsFallback: true,
  generateSrcset: true,
  breakpoints: [320, 640, 768, 1024, 1280, 1920],
  lazyLoadEnabled: true,
  lazyLoadMargin: 200,
  lcpDetection: 'auto',
  lcpImageFetchPriority: true,
};

/**
 * Rewrite <img> tags in HTML:
 * - Wrap in <picture> with AVIF/WebP sources + responsive srcset (per settings)
 * - Add loading="lazy" / decoding="async" when lazyLoadEnabled
 * - LCP candidate gets fetchpriority="high" + loading="eager" when lcpImageFetchPriority
 */
export function rewriteImageTags(
  html: string,
  workDir: string,
  settings?: OptimizationSettings
): string {
  const imgs = settings?.images;
  const opts: ImageRewriteSettings = imgs
    ? {
        convertToWebp: imgs.convertToWebp ?? true,
        convertToAvif: imgs.convertToAvif ?? false,
        keepOriginalAsFallback: imgs.keepOriginalAsFallback ?? true,
        generateSrcset: imgs.generateSrcset ?? true,
        breakpoints: imgs.breakpoints ?? DEFAULT_RESPONSIVE_WIDTHS,
        lazyLoadEnabled: imgs.lazyLoadEnabled ?? true,
        lazyLoadMargin: imgs.lazyLoadMargin ?? 200,
        lcpDetection: imgs.lcpDetection ?? 'auto',
        lcpImageSelector: imgs.lcpImageSelector,
        lcpImageFetchPriority: imgs.lcpImageFetchPriority ?? true,
      }
    : DEFAULT_IMAGE_REWRITE;

  let imgIndex = 0;
  let lcpFound = false;

  html = html.replace(
    /<img\s([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
    (match, before, src, after) => {
      imgIndex++;

      const ext = path.extname(src).toLowerCase();
      const isRaster = ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext);

      if (!isRaster) {
        const isLCP = opts.lcpImageFetchPriority && !lcpFound && imgIndex <= 3;
        if (isLCP) lcpFound = true;
        return addLoadingAttrs(
          match, before, after,
          opts.lazyLoadEnabled,
          opts.lcpImageFetchPriority && isLCP
        );
      }

      // LCP candidate: first few images (auto) or manual selector match
      const hasManualLcp = opts.lcpDetection === 'manual' && opts.lcpImageSelector;
      const isLCP = opts.lcpDetection !== 'disabled' && !lcpFound && (
        hasManualLcp
          ? false // Manual selector would need DOM/DOM path — not available in regex; treat as non-LCP for now
          : imgIndex <= 3
      );
      if (isLCP) lcpFound = true;

      const useLazy = opts.lazyLoadEnabled && !(opts.lcpImageFetchPriority && isLCP);
      const loadingAttr = useLazy
        ? 'loading="lazy" decoding="async"'
        : opts.lcpImageFetchPriority && isLCP
          ? 'loading="eager" fetchpriority="high"'
          : '';

      const cleanBefore = before.replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '');
      const cleanAfter = after.replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '');

      const basePath = src.replace(/\.[^.]+$/, '');
      const avifSrc = `${basePath}.avif`;
      const webpSrc = `${basePath}.webp`;

      const usePicture = opts.convertToWebp || opts.convertToAvif;
      if (!usePicture) {
        return addLoadingAttrs(match, before, after, opts.lazyLoadEnabled, opts.lcpImageFetchPriority && isLCP);
      }

      const fallbackSrc = opts.keepOriginalAsFallback ? src : (opts.convertToWebp ? webpSrc : src);

      const avifSource = opts.convertToAvif
        ? `<source srcset="${avifSrc}" type="image/avif">`
        : '';
      const webpSrcset = opts.generateSrcset && opts.convertToWebp
        ? opts.breakpoints
            .map((w) => `${basePath}-${w}w.webp ${w}w`)
            .concat(`${webpSrc} 1920w`)
            .join(', ')
        : webpSrc;
      const webpSource = opts.convertToWebp
        ? `<source srcset="${webpSrcset}" type="image/webp">`
        : '';

      const pictureContent = [avifSource, webpSource]
        .filter(Boolean)
        .join('');
      const sizesAttr = opts.generateSrcset && opts.convertToWebp
        ? ' sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"'
        : '';

      const imgTag = `<img ${cleanBefore}src="${fallbackSrc}"${cleanAfter}${loadingAttr ? ` ${loadingAttr}` : ''}>`;
      return `<picture>${pictureContent}${imgTag}</picture>`;
    }
  );

  return html;
}

function addLoadingAttrs(
  match: string,
  _before: string,
  _after: string,
  lazyEnabled: boolean,
  isLCP: boolean
): string {
  const cleaned = match.replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '').replace(/\s+/g, ' ').trim();
  const attrs = isLCP ? 'loading="eager" fetchpriority="high"' : lazyEnabled ? 'loading="lazy" decoding="async"' : '';
  return attrs ? cleaned.replace(/>\s*$/, ` ${attrs}>`) : cleaned;
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
