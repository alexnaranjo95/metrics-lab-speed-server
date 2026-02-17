/**
 * VideoTypeClassifier — Determines whether a video element is a background
 * video or a click-to-play video based on 6 signal categories.
 *
 * Background videos use native <video> with HLS (System A).
 * Click-to-play videos use the facade pattern (System B).
 * Default: click-to-play (safer — never auto-plays unexpectedly).
 */

import type { CheerioAPI } from 'cheerio';

export type VideoType = 'background' | 'clicktoplay';

export interface ClassificationResult {
  type: VideoType;
  confidence: number;
  signals: string[];
}

const BG_CLASS_PATTERNS = [
  'bg-video', 'background-video', 'hero-video',
  'video-bg', 'full-bg', 'section-bg',
  'video-background', 'fullscreen-video',
];

const BG_DATA_ATTRS = [
  'data-video-type',
  'data-bg-video',
  'data-background-video',
];

const WP_BG_CLASSES = [
  'elementor-background-video-container',
  'wp-block-cover',
  'elementor-background-video',
];

/**
 * Classify a video or iframe element as background or click-to-play.
 */
export function classifyVideoType(
  $: CheerioAPI,
  el: any
): ClassificationResult {
  const signals: string[] = [];
  let bgScore = 0;
  let ctpScore = 0;

  const $el = $(el);
  const tagName = (el as any).tagName?.toLowerCase() ?? '';
  const src = $el.attr('src') || '';
  const classes = ($el.attr('class') || '').toLowerCase();
  const style = ($el.attr('style') || '').toLowerCase();
  const parent = $el.parent();
  const parentClasses = (parent.attr('class') || '').toLowerCase();
  const parentStyle = (parent.attr('style') || '').toLowerCase();

  // ── Signal 1: Explicit data attributes / class names ──
  for (const attr of BG_DATA_ATTRS) {
    const val = $el.attr(attr) || parent.attr(attr);
    if (val !== undefined) {
      if (attr === 'data-video-type' && val !== 'background') continue;
      signals.push(`data-attr: ${attr}="${val}"`);
      bgScore += 3;
    }
  }

  const allClasses = `${classes} ${parentClasses}`;
  for (const pattern of BG_CLASS_PATTERNS) {
    if (allClasses.includes(pattern)) {
      signals.push(`class: ${pattern}`);
      bgScore += 3;
    }
  }

  // ── Signal 2: CSS positioning context ──
  const combinedStyle = `${style} ${parentStyle}`;
  const hasAbsoluteOrFixed = /position\s*:\s*(absolute|fixed)/.test(combinedStyle);
  const hasFullWidth = /width\s*:\s*(100%|100vw)/.test(combinedStyle);
  const hasFullHeight = /height\s*:\s*(100%|100vh)|min-height\s*:\s*100vh/.test(combinedStyle);

  if (hasAbsoluteOrFixed && hasFullWidth && hasFullHeight) {
    signals.push('css: absolute/fixed + 100% width + 100% height');
    bgScore += 4;
  } else if (hasAbsoluteOrFixed && (hasFullWidth || hasFullHeight)) {
    signals.push('css: absolute/fixed + partial full dimensions');
    bgScore += 2;
  }

  // ── Signal 3: Video attributes (autoplay + muted + loop, no controls) ──
  if (tagName === 'video') {
    const hasAutoplay = $el.attr('autoplay') !== undefined;
    const hasMuted = $el.attr('muted') !== undefined;
    const hasLoop = $el.attr('loop') !== undefined;
    const hasControls = $el.attr('controls') !== undefined;

    if (hasAutoplay && hasMuted && hasLoop && !hasControls) {
      signals.push('attrs: autoplay+muted+loop without controls');
      bgScore += 5;
    }
    if (hasControls) {
      signals.push('attrs: has controls');
      ctpScore += 5;
    }
    if ($el.attr('poster')) {
      signals.push('attrs: has poster (suggests click-to-play)');
      ctpScore += 1;
    }
  }

  // ── Signal 4: Z-index context ──
  const zIndex = extractZIndex(combinedStyle);
  if (zIndex !== null && zIndex < 0) {
    signals.push(`z-index: ${zIndex} (negative, behind content)`);
    bgScore += 3;
  }

  // Check if a sibling is layered on top
  const siblings = parent.children().toArray();
  for (const sib of siblings) {
    if (sib === el) continue;
    const sibStyle = ($(sib).attr('style') || '').toLowerCase();
    const sibZ = extractZIndex(sibStyle);
    if (/position\s*:\s*(absolute|relative)/.test(sibStyle) && sibZ !== null && sibZ > 0) {
      signals.push('z-index: sibling layered above (content on top of video)');
      bgScore += 2;
      break;
    }
  }

  // ── Signal 5: WordPress / Elementor patterns ──
  for (const cls of WP_BG_CLASSES) {
    if (parentClasses.includes(cls) || allClasses.includes(cls)) {
      signals.push(`wp: ${cls}`);
      bgScore += 4;
    }
  }
  const elDataType = parent.attr('data-elementor-background-type') || $el.attr('data-elementor-background-type');
  if (elDataType === 'video') {
    signals.push('wp: data-elementor-background-type="video"');
    bgScore += 4;
  }

  // ── Signal 6: YouTube URL with autoplay+mute params ──
  if (src.includes('youtube') || src.includes('youtu.be')) {
    const hasAutoplayParam = /autoplay=1/.test(src);
    const hasMuteParam = /mute=1/.test(src);
    const hasLoopParam = /loop=1/.test(src);
    const hasControlsOff = /controls=0/.test(src);

    if (hasAutoplayParam && hasMuteParam) {
      signals.push('yt-params: autoplay=1&mute=1');
      bgScore += 3;
      if (hasLoopParam && hasControlsOff) {
        signals.push('yt-params: +loop=1&controls=0 (full bg pattern)');
        bgScore += 2;
      }
    }
  }

  // ── Click-to-play signals ──
  // Wrapped with a play button sibling
  for (const sib of siblings) {
    if (sib === el) continue;
    const sibClasses = ($(sib).attr('class') || '').toLowerCase();
    const sibRole = ($(sib).attr('role') || '').toLowerCase();
    if (sibClasses.includes('play') || sibRole === 'button') {
      signals.push('sibling: play button detected');
      ctpScore += 3;
      break;
    }
  }

  // ── Decision ──
  const totalScore = bgScore + ctpScore;
  const confidence = totalScore > 0 ? Math.min(1, Math.max(bgScore, ctpScore) / Math.max(totalScore, 1)) : 0.5;

  const type: VideoType = bgScore > ctpScore ? 'background' : 'clicktoplay';

  return { type, confidence, signals };
}

function extractZIndex(style: string): number | null {
  const match = style.match(/z-index\s*:\s*(-?\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
