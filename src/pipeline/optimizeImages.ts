import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { optimize as svgoOptimize } from 'svgo';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

// Default responsive widths for use in rewriteImageTags (used when no settings passed)
const DEFAULT_RESPONSIVE_WIDTHS = [320, 640, 768, 1024, 1280, 1920];

/** Extract data-sizes value from img attributes (e.g. WordPress) for accurate responsive sizing */
function parseDataSizes(attrs: string): string | null {
  const m = attrs.match(/data-sizes=["']([^"']+)["']/i);
  return m ? m[1].trim() : null;
}

/** Extract width and height attributes from img attrs to preserve for CLS */
function parseWidthHeight(attrs: string): { width?: string; height?: string } {
  const widthMatch = attrs.match(/width=["'](\d+)["']/i);
  const heightMatch = attrs.match(/height=["'](\d+)["']/i);
  return {
    width: widthMatch ? widthMatch[1] : undefined,
    height: heightMatch ? heightMatch[1] : undefined,
  };
}

/** Infer max displayed width from data-sizes (e.g. "580px") or width attribute */
function parseMaxDisplayWidth(attrs: string): number | null {
  const sizes = attrs.match(/data-sizes=["']([^"']+)["']/i)?.[1];
  if (sizes) {
    const pxMatch = sizes.match(/(\d+)px/);
    if (pxMatch) return parseInt(pxMatch[1], 10);
  }
  const widthMatch = attrs.match(/width=["'](\d+)["']/i);
  if (widthMatch) return parseInt(widthMatch[1], 10);
  return null;
}

export interface ImageOptimizeResult {
  originalBytes: number;
  optimizedBytes: number;
  webpPath?: string;
  avifPath?: string;
  responsivePaths?: string[];
  isLCPCandidate?: boolean;
  aspectRatio?: number;
  compressionRatio?: number;
}

/**
 * Optimize a single image file with Sharp.
 * Creates WebP/AVIF variants and responsive sizes per settings.
 * Enhanced for LCP optimization and comprehensive format support.
 */
export async function optimizeImage(
  imageRelativePath: string,
  workDir: string,
  settings?: OptimizationSettings,
  isLCPCandidate?: boolean
): Promise<ImageOptimizeResult> {
  // Derive quality settings from resolved settings or use defaults
  const imgs = settings?.images;

  // Quality tiers from settings (hero/standard/thumbnail) or fallback to hardcoded
  const qualityTier = determineQualityTier(imageRelativePath, isLCPCandidate, imgs?.qualityTiers);
  const JPEG_QUALITY = imgs?.jpeg?.quality ?? qualityTier.jpeg;
  const PNG_QUALITY = imgs?.jpeg?.quality ?? qualityTier.png;
  const WEBP_QUALITY = imgs?.webp?.quality ?? qualityTier.webp;
  const AVIF_QUALITY = imgs?.avif?.quality ?? qualityTier.avif;
  const WEBP_EFFORT = imgs?.webp?.effort ?? 4;
  const AVIF_EFFORT = imgs?.avif?.effort ?? (isLCPCandidate ? 6 : 4); // Higher effort for LCP images
  
  const RESPONSIVE_WIDTHS = imgs?.breakpoints ?? [400, 800, 1200, 1600];
  const MAX_WIDTH = imgs?.maxWidth ?? 2560;
  const format = imgs?.format ?? 'auto';
  const convertToWebp = format === 'avif' ? false : (imgs?.convertToWebp ?? true);
  const convertToAvif = format === 'webp' ? false : (imgs?.convertToAvif ?? (format === 'auto' || format === 'avif'));
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
    const srcHeight = metadata.height || Math.round(srcWidth * 0.75);
    const aspectRatio = srcHeight / srcWidth;

    // Optimize the original format with enhanced settings
    let optimizedBuffer = await optimizeByFormat(inputBuffer, ext, srcWidth, {
      jpegQuality: JPEG_QUALITY, pngQuality: PNG_QUALITY,
      webpQuality: WEBP_QUALITY, webpEffort: WEBP_EFFORT,
      avifQuality: AVIF_QUALITY, avifEffort: AVIF_EFFORT, maxWidth: MAX_WIDTH,
      stripMetadata, isLCPCandidate,
    });

    // Only use optimized if significantly smaller or same size for LCP images
    const threshold = isLCPCandidate ? 1.0 : 0.95; // Less aggressive for LCP images
    if (optimizedBuffer.length >= originalBytes * threshold) {
      optimizedBuffer = inputBuffer;
    } else {
      await fs.writeFile(imagePath, optimizedBuffer);
    }

    const optimizedBytes = Math.min(optimizedBuffer.length, originalBytes);
    const compressionRatio = 1 - (optimizedBytes / originalBytes);

    // Generate WebP variant (only when convertToWebp)
    let webpPath: string | undefined;
    if (convertToWebp && ext !== '.webp' && ext !== '.avif') {
      try {
        let pipeline = sharp(inputBuffer)
          .resize({ width: Math.min(srcWidth, MAX_WIDTH), withoutEnlargement: true });
        if (stripMetadata) pipeline = pipeline.withMetadata({});
        const webpBuffer = await pipeline
          .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
          .toBuffer();
        webpPath = imagePath.replace(/\.[^.]+$/, '.webp');
        await fs.writeFile(webpPath, webpBuffer);
      } catch { /* non-fatal */ }
    }

    // Generate AVIF variant with enhanced optimization (50% smaller than JPEG)
    let avifPath: string | undefined;
    if (convertToAvif && ext !== '.avif') {
      try {
        let pipeline = sharp(inputBuffer)
          .resize({ width: Math.min(srcWidth, MAX_WIDTH), withoutEnlargement: true });
        if (stripMetadata) pipeline = pipeline.withMetadata({});
        
        // Enhanced AVIF settings for maximum compression
        const avifOptions: any = { 
          quality: AVIF_QUALITY, 
          effort: AVIF_EFFORT,
        };
        
        // Use lossless for very small images or when quality is critical
        if (originalBytes < 50000 && isLCPCandidate) {
          avifOptions.lossless = true;
        }
        
        const avifBuffer = await pipeline.avif(avifOptions).toBuffer();
        
        // Only save AVIF if it's significantly smaller
        if (avifBuffer.length < originalBytes * 0.7) {
          avifPath = imagePath.replace(/\.[^.]+$/, '.avif');
          await fs.writeFile(avifPath, avifBuffer);
        }
      } catch (error) {
        console.warn(`[images] AVIF generation failed for ${imageRelativePath}:`, (error as Error).message);
      }
    }

    // Generate responsive sizes (only when generateSrcset and convertToWebp)
    const responsivePaths: string[] = [];
    if (generateSrcset && convertToWebp) {
      for (const w of RESPONSIVE_WIDTHS) {
        if (w >= srcWidth) continue; // Don't upscale
        try {
          let pipeline = sharp(inputBuffer)
            .resize({ width: w, withoutEnlargement: true });
          if (stripMetadata) pipeline = pipeline.withMetadata({});
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

    return { 
      originalBytes, 
      optimizedBytes, 
      webpPath, 
      avifPath, 
      responsivePaths,
      isLCPCandidate,
      aspectRatio,
      compressionRatio,
    };
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
  isLCPCandidate?: boolean;
}

async function optimizeByFormat(input: Buffer, ext: string, srcWidth: number, opts: FormatOptions): Promise<Buffer> {
  let pipeline = sharp(input).resize({ width: Math.min(srcWidth, opts.maxWidth), withoutEnlargement: true });
  if (opts.stripMetadata) pipeline = pipeline.withMetadata({});

  switch (ext) {
    case '.jpg':
    case '.jpeg':
      // Enhanced JPEG optimization with progressive loading for LCP images
      return pipeline.jpeg({ 
        quality: opts.jpegQuality, 
        progressive: true, 
        mozjpeg: true,
        optimizeScans: opts.isLCPCandidate, // Better compression for LCP images
      }).toBuffer();
    case '.png':
      // Enhanced PNG optimization
      return pipeline.png({ 
        quality: opts.pngQuality, 
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: opts.isLCPCandidate ? false : true, // Preserve quality for LCP
      }).toBuffer();
    case '.webp':
      return pipeline.webp({ 
        quality: opts.webpQuality, 
        effort: opts.webpEffort,
        nearLossless: opts.isLCPCandidate && opts.webpQuality > 90,
      }).toBuffer();
    case '.avif':
      return pipeline.avif({ 
        quality: opts.avifQuality, 
        effort: opts.avifEffort,
        chromaSubsampling: '4:2:0', // Better compression
      }).toBuffer();
    default:
      return input;
  }
}

/**
 * Determine quality tier based on image importance and use case.
 * Uses settings.images.qualityTiers when present, else hardcoded defaults.
 */
function determineQualityTier(
  imagePath: string,
  isLCPCandidate?: boolean,
  qualityTiers?: { hero?: { quality?: number }; standard?: { quality?: number }; thumbnail?: { quality?: number } }
): { jpeg: number; png: number; webp: number; avif: number } {
  const heroQ = qualityTiers?.hero?.quality ?? 88;
  const standardQ = qualityTiers?.standard?.quality ?? 75;
  const thumbQ = qualityTiers?.thumbnail?.quality ?? 65;

  if (isLCPCandidate) {
    return {
      jpeg: heroQ,
      png: Math.min(heroQ + 2, 95),
      webp: heroQ,
      avif: Math.round(heroQ * 0.68),
    };
  }

  if (imagePath.includes('thumb') || imagePath.includes('small') || imagePath.includes('icon')) {
    return {
      jpeg: thumbQ,
      png: Math.min(thumbQ + 5, 90),
      webp: thumbQ,
      avif: Math.round(thumbQ * 0.62),
    };
  }

  return {
    jpeg: standardQ,
    png: Math.min(standardQ + 5, 90),
    webp: standardQ,
    avif: Math.round(standardQ * 0.6),
  };
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
  const format = imgs?.format ?? 'auto';
  const opts: ImageRewriteSettings = imgs
    ? {
        convertToWebp: format === 'avif' ? false : (imgs.convertToWebp ?? true),
        convertToAvif: format === 'webp' ? false : (imgs.convertToAvif ?? (format === 'auto' || format === 'avif')),
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

      const cleanBefore = before
        .replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '')
        .replace(/\s*(width|height)=["']\d+["']/gi, '');
      const cleanAfter = after
        .replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '')
        .replace(/\s*(width|height)=["']\d+["']/gi, '');
      const allAttrs = before + after;

      const basePath = src.replace(/\.[^.]+$/, '');
      const avifSrc = `${basePath}.avif`;
      const webpSrc = `${basePath}.webp`;

      const usePicture = opts.convertToWebp || opts.convertToAvif;
      if (!usePicture) {
        return addLoadingAttrs(match, before, after, opts.lazyLoadEnabled, opts.lcpImageFetchPriority && isLCP);
      }

      const fallbackSrc = opts.keepOriginalAsFallback ? src : (opts.convertToWebp ? webpSrc : src);

      const maxDisplayWidth = parseMaxDisplayWidth(allAttrs);
      const dataSizes = parseDataSizes(allAttrs);
      const cappedBreakpoints = maxDisplayWidth
        ? opts.breakpoints.filter((w) => w <= maxDisplayWidth)
        : opts.breakpoints;
      const nextAbove = maxDisplayWidth
        ? opts.breakpoints.find((w) => w >= maxDisplayWidth)
        : null;
      const effectiveBreakpoints = cappedBreakpoints.length
        ? cappedBreakpoints
        : nextAbove
          ? [nextAbove]
          : opts.breakpoints;

      const avifSource = opts.convertToAvif
        ? `<source srcset="${avifSrc}" type="image/avif">`
        : '';
      const maxSrcsetW = effectiveBreakpoints.length ? Math.max(...effectiveBreakpoints) : 1920;
      const webpSrcset = opts.generateSrcset && opts.convertToWebp
        ? effectiveBreakpoints
            .map((w) => `${basePath}-${w}w.webp ${w}w`)
            .concat(maxSrcsetW >= 1920 ? `${webpSrc} 1920w` : [])
            .join(', ')
        : webpSrc;
      const webpSource = opts.convertToWebp
        ? `<source srcset="${webpSrcset}" type="image/webp">`
        : '';

      const pictureContent = [avifSource, webpSource]
        .filter(Boolean)
        .join('');
      const sizesAttr = opts.generateSrcset && opts.convertToWebp
        ? dataSizes
          ? ` sizes="${dataSizes.replace(/"/g, '&quot;')}"`
          : ' sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"'
        : '';

      const { width: w, height: h } = parseWidthHeight(allAttrs);
      const explicitDims = (w && h) ? ` width="${w}" height="${h}"` : '';
      const imgTag = `<img ${cleanBefore}src="${fallbackSrc}"${cleanAfter}${explicitDims}${sizesAttr}${loadingAttr ? ` ${loadingAttr}` : ''}>`;
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

    // Resolve the image path (assets live at workDir/assets/)
    const srcNormalized = src.startsWith('/') ? src.slice(1) : src;
    let imagePath = path.join(workDir, srcNormalized);
    let dims = await getImageDimensions(imagePath);
    if (!dims && path.basename(srcNormalized) !== srcNormalized) {
      const fallbackPath = path.join(workDir, 'assets', path.basename(srcNormalized));
      dims = await getImageDimensions(fallbackPath);
    }
    if (dims) {
      const widthAttr = /width=["']/i.test(before + after) ? '' : ` width="${dims.width}"`;
      const heightAttr = /height=["']/i.test(before + after) ? '' : ` height="${dims.height}"`;
      const replacement = fullMatch.replace(/>$/, `${widthAttr}${heightAttr}>`);
      html = html.replace(fullMatch, replacement);
    }
  }

  return html;
}

/**
 * Enhanced image rewriting with modern picture element and LCP optimization
 */
export function rewriteImageTagsAdvanced(
  html: string,
  workDir: string,
  lcpImages: string[] = [],
  settings?: OptimizationSettings
): string {
  const imgs = settings?.images;
  const opts: ImageRewriteSettings = imgs
    ? {
        convertToWebp: imgs.convertToWebp ?? true,
        convertToAvif: imgs.convertToAvif ?? true, // Default to true
        keepOriginalAsFallback: imgs.keepOriginalAsFallback ?? true,
        generateSrcset: imgs.generateSrcset ?? true,
        breakpoints: imgs.breakpoints ?? [400, 800, 1200, 1600],
        lazyLoadEnabled: imgs.lazyLoadEnabled ?? true,
        lazyLoadMargin: imgs.lazyLoadMargin ?? 200,
        lcpDetection: imgs.lcpDetection ?? 'auto',
        lcpImageSelector: imgs.lcpImageSelector,
        lcpImageFetchPriority: imgs.lcpImageFetchPriority ?? true,
      }
    : {
        ...DEFAULT_IMAGE_REWRITE,
        convertToAvif: true,
        breakpoints: [400, 800, 1200, 1600],
      };

  let imgIndex = 0;
  let lcpFound = false;

  html = html.replace(
    /<img\s([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
    (match, before, src, after) => {
      imgIndex++;

      const ext = path.extname(src).toLowerCase();
      const isRaster = ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext);

      // Check if this is an LCP candidate
      const isLCPCandidate = !lcpFound && (
        lcpImages.includes(src) || // Explicitly marked as LCP
        (opts.lcpDetection === 'auto' && imgIndex <= 2) || // First 2 images
        (before + after).includes('hero') || 
        (before + after).includes('banner') ||
        (before + after).includes('featured')
      );
      
      if (isLCPCandidate) lcpFound = true;

      if (!isRaster) {
        return addLoadingAttrs(
          match, before, after,
          opts.lazyLoadEnabled,
          opts.lcpImageFetchPriority && isLCPCandidate
        );
      }

      const useLazy = opts.lazyLoadEnabled && !isLCPCandidate;
      const loadingAttrs = [];
      
      if (isLCPCandidate && opts.lcpImageFetchPriority) {
        loadingAttrs.push('loading="eager"', 'fetchpriority="high"', 'decoding="sync"');
      } else if (useLazy) {
        loadingAttrs.push('loading="lazy"', 'decoding="async"');
      } else {
        loadingAttrs.push('decoding="async"');
      }

      const cleanBefore = before.replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '');
      const cleanAfter = after.replace(/\s*(loading|decoding|fetchpriority)=["'][^"']*["']/gi, '');

      const basePath = src.replace(/\.[^.]+$/, '');
      const avifSrc = `${basePath}.avif`;
      const webpSrc = `${basePath}.webp`;

      const usePicture = opts.convertToWebp || opts.convertToAvif;
      if (!usePicture) {
        const attrs = loadingAttrs.join(' ');
        return `<img ${cleanBefore}src="${src}"${cleanAfter}${attrs ? ` ${attrs}` : ''}>`;
      }

      const fallbackSrc = opts.keepOriginalAsFallback ? src : (opts.convertToWebp ? webpSrc : src);

      // Build picture element with AVIF priority
      const sources = [];
      
      if (opts.convertToAvif) {
        const avifSrcset = opts.generateSrcset 
          ? opts.breakpoints
              .map((w) => `${basePath}-${w}w.avif ${w}w`)
              .concat(`${avifSrc} 1600w`)
              .join(', ')
          : avifSrc;
        sources.push(`<source srcset="${avifSrcset}" type="image/avif">`);
      }
      
      if (opts.convertToWebp) {
        const webpSrcset = opts.generateSrcset 
          ? opts.breakpoints
              .map((w) => `${basePath}-${w}w.webp ${w}w`)
              .concat(`${webpSrc} 1600w`)
              .join(', ')
          : webpSrc;
        sources.push(`<source srcset="${webpSrcset}" type="image/webp">`);
      }

      const sizesAttr = opts.generateSrcset 
        ? ' sizes="(max-width: 600px) 100vw, (max-width: 1200px) 80vw, 1200px"'
        : '';

      const attrs = loadingAttrs.join(' ');
      const imgTag = `<img ${cleanBefore}src="${fallbackSrc}"${cleanAfter}${attrs ? ` ${attrs}` : ''}${sizesAttr}>`;
      
      return `<picture>${sources.join('')}${imgTag}</picture>`;
    }
  );

  return html;
}

/**
 * Detect LCP image candidates from HTML content
 */
export function detectLCPImageCandidates(html: string): string[] {
  const candidates: string[] = [];
  
  // Hero/banner image patterns
  const heroPatterns = [
    /<img[^>]*class="[^"]*(?:hero|banner|featured|main)[^"]*"[^>]*src=["']([^"']+)["']/gi,
    /<img[^>]*(?:id="[^"]*(?:hero|banner|featured)[^"]*")[^>]*src=["']([^"']+)["']/gi,
  ];
  
  heroPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      candidates.push(match[1]);
    }
  });
  
  // First images in content (likely above fold)
  const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["']/gi);
  let count = 0;
  for (const match of imgMatches) {
    if (count >= 3) break; // Top 3 images are LCP candidates
    if (!candidates.includes(match[1])) {
      candidates.push(match[1]);
    }
    count++;
  }
  
  return candidates;
}

/**
 * Generate preload links for critical images (LCP images)
 */
export function generateImagePreloadLinks(lcpImages: string[]): string {
  return lcpImages
    .slice(0, 2) // Only preload top 2 LCP candidates
    .map(src => {
      const ext = path.extname(src).toLowerCase();
      const basePath = src.replace(/\.[^.]+$/, '');
      
      // Preload modern format if available, fallback to original
      const avifSrc = `${basePath}.avif`;
      const webpSrc = `${basePath}.webp`;
      
      return `<link rel="preload" as="image" href="${avifSrc}" type="image/avif">
<link rel="preload" as="image" href="${webpSrc}" type="image/webp">
<link rel="preload" as="image" href="${src}">`;
    })
    .join('\n');
}

/**
 * Calculate image optimization savings and performance impact
 */
export function calculateImageOptimizationMetrics(results: ImageOptimizeResult[]): {
  totalOriginalBytes: number;
  totalOptimizedBytes: number;
  totalSavings: number;
  savingsPercentage: number;
  avifSavings: number;
  webpSavings: number;
  estimatedLCPImprovement: number;
} {
  const totalOriginal = results.reduce((sum, r) => sum + r.originalBytes, 0);
  const totalOptimized = results.reduce((sum, r) => sum + r.optimizedBytes, 0);
  const totalSavings = totalOriginal - totalOptimized;
  const savingsPercentage = totalOriginal > 0 ? (totalSavings / totalOriginal) * 100 : 0;
  
  // Estimate AVIF and WebP specific savings (AVIF ~50% smaller, WebP ~25% smaller than JPEG)
  const avifImages = results.filter(r => r.avifPath);
  const avifSavings = avifImages.reduce((sum, r) => sum + r.originalBytes * 0.5, 0);
  
  const webpImages = results.filter(r => r.webpPath);
  const webpSavings = webpImages.reduce((sum, r) => sum + r.originalBytes * 0.25, 0);
  
  // Estimate LCP improvement based on LCP image optimizations
  const lcpImages = results.filter(r => r.isLCPCandidate);
  const lcpSavings = lcpImages.reduce((sum, r) => sum + (r.originalBytes - r.optimizedBytes), 0);
  const estimatedLCPImprovement = Math.min(1000, lcpSavings / 1000); // ~1ms improvement per KB saved
  
  return {
    totalOriginalBytes: totalOriginal,
    totalOptimizedBytes: totalOptimized,
    totalSavings,
    savingsPercentage,
    avifSavings,
    webpSavings,
    estimatedLCPImprovement,
  };
}
