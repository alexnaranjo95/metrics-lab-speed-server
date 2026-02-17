/**
 * VideoSourceResolver — Detects video platform and extracts metadata from URLs.
 * Supports 12 source types: YouTube, Vimeo, Loom, Wistia, Bunny.net, Mux,
 * Dailymotion, Streamable, Twitch, direct MP4/WebM/MOV, WordPress uploads, file uploads.
 */

export type VideoPlatform =
  | 'youtube'
  | 'vimeo'
  | 'loom'
  | 'wistia'
  | 'bunny'
  | 'mux'
  | 'dailymotion'
  | 'streamable'
  | 'twitch'
  | 'directVideo'
  | 'wordpress';

export interface ResolvedVideoSource {
  platform: VideoPlatform;
  videoId: string;
  embedUrl: string;
  screenshotUrl: string;
  requiresDownload: boolean;
  title?: string;
}

const YOUTUBE_ID_RE = /(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/;
const VIMEO_ID_RE = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/;
const LOOM_ID_RE = /loom\.com\/(?:share|embed)\/([a-f0-9-]+)/;
const WISTIA_ID_RE = /(?:wistia\.com\/medias\/|fast\.wistia\.(?:net|com)\/embed\/iframe\/)([a-zA-Z0-9]+)/;
const BUNNY_RE = /(?:iframe\.mediadelivery\.net\/embed\/\d+\/|video\.bunnycdn\.com\/)([a-f0-9-]+)/;
const MUX_RE = /(?:stream\.mux\.com|player\.mux\.com)\/([a-zA-Z0-9]+)/;
const DAILYMOTION_RE = /dailymotion\.com\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/;
const STREAMABLE_RE = /streamable\.com\/(?:e\/)?([a-zA-Z0-9]+)/;
const TWITCH_VOD_RE = /twitch\.tv\/videos\/(\d+)/;
const TWITCH_CLIP_RE = /clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/;
const DIRECT_VIDEO_RE = /\.(mp4|webm|mov|mkv|m4v)(\?|$)/i;
const WP_UPLOADS_RE = /\/wp-content\/uploads\/.+\.(mp4|webm|mov|m4v)(\?|$)/i;

export function resolveVideoSource(url: string): ResolvedVideoSource | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // WordPress self-hosted (check before generic direct video)
  if (WP_UPLOADS_RE.test(trimmed)) {
    return {
      platform: 'wordpress',
      videoId: hashString(trimmed),
      embedUrl: trimmed,
      screenshotUrl: trimmed,
      requiresDownload: false,
    };
  }

  // Direct video files
  if (DIRECT_VIDEO_RE.test(trimmed)) {
    return {
      platform: 'directVideo',
      videoId: hashString(trimmed),
      embedUrl: trimmed,
      screenshotUrl: trimmed,
      requiresDownload: false,
    };
  }

  // YouTube
  const ytMatch = trimmed.match(YOUTUBE_ID_RE);
  if (ytMatch) {
    const id = ytMatch[1];
    return {
      platform: 'youtube',
      videoId: id,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      screenshotUrl: `https://www.youtube.com/watch?v=${id}`,
      requiresDownload: true,
    };
  }

  // Vimeo
  const vimeoMatch = trimmed.match(VIMEO_ID_RE);
  if (vimeoMatch) {
    const id = vimeoMatch[1];
    return {
      platform: 'vimeo',
      videoId: id,
      embedUrl: `https://player.vimeo.com/video/${id}`,
      screenshotUrl: `https://vimeo.com/${id}`,
      requiresDownload: true,
    };
  }

  // Loom
  const loomMatch = trimmed.match(LOOM_ID_RE);
  if (loomMatch) {
    const id = loomMatch[1];
    return {
      platform: 'loom',
      videoId: id,
      embedUrl: `https://www.loom.com/embed/${id}`,
      screenshotUrl: `https://www.loom.com/share/${id}`,
      requiresDownload: true,
    };
  }

  // Wistia
  const wistiaMatch = trimmed.match(WISTIA_ID_RE);
  if (wistiaMatch) {
    const id = wistiaMatch[1];
    return {
      platform: 'wistia',
      videoId: id,
      embedUrl: `https://fast.wistia.net/embed/iframe/${id}`,
      screenshotUrl: `https://fast.wistia.net/embed/iframe/${id}`,
      requiresDownload: true,
    };
  }

  // Bunny.net
  const bunnyMatch = trimmed.match(BUNNY_RE);
  if (bunnyMatch) {
    const id = bunnyMatch[1];
    return {
      platform: 'bunny',
      videoId: id,
      embedUrl: trimmed,
      screenshotUrl: trimmed,
      requiresDownload: false,
    };
  }

  // Mux
  const muxMatch = trimmed.match(MUX_RE);
  if (muxMatch) {
    const id = muxMatch[1];
    return {
      platform: 'mux',
      videoId: id,
      embedUrl: `https://stream.mux.com/${id}`,
      screenshotUrl: `https://stream.mux.com/${id}`,
      requiresDownload: true,
    };
  }

  // Dailymotion
  const dmMatch = trimmed.match(DAILYMOTION_RE);
  if (dmMatch) {
    const id = dmMatch[1];
    return {
      platform: 'dailymotion',
      videoId: id,
      embedUrl: `https://www.dailymotion.com/embed/video/${id}`,
      screenshotUrl: `https://www.dailymotion.com/video/${id}`,
      requiresDownload: true,
    };
  }

  // Streamable
  const streamableMatch = trimmed.match(STREAMABLE_RE);
  if (streamableMatch) {
    const id = streamableMatch[1];
    return {
      platform: 'streamable',
      videoId: id,
      embedUrl: `https://streamable.com/e/${id}`,
      screenshotUrl: `https://streamable.com/${id}`,
      requiresDownload: false,
    };
  }

  // Twitch VOD
  const twitchVodMatch = trimmed.match(TWITCH_VOD_RE);
  if (twitchVodMatch) {
    const id = twitchVodMatch[1];
    return {
      platform: 'twitch',
      videoId: id,
      embedUrl: `https://player.twitch.tv/?video=${id}&parent=localhost`,
      screenshotUrl: `https://www.twitch.tv/videos/${id}`,
      requiresDownload: true,
    };
  }

  // Twitch Clip
  const twitchClipMatch = trimmed.match(TWITCH_CLIP_RE);
  if (twitchClipMatch) {
    const id = twitchClipMatch[1];
    return {
      platform: 'twitch',
      videoId: id,
      embedUrl: `https://clips.twitch.tv/embed?clip=${id}&parent=localhost`,
      screenshotUrl: `https://clips.twitch.tv/${id}`,
      requiresDownload: true,
    };
  }

  return null;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
