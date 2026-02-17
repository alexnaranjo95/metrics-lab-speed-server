/**
 * CloudflareStreamUploader — Uploads videos to Cloudflare Stream.
 *
 * Two paths:
 * - Direct URL copy: POST /stream/copy for publicly accessible URLs
 * - Upload via R2: download -> R2 staging -> presigned URL -> /stream/copy
 *
 * Returns Stream UID, HLS URL, and MP4 download URL.
 */

import { config } from '../../config.js';

const CF_API = 'https://api.cloudflare.com/client/v4';

export interface StreamUploadResult {
  uid: string;
  hlsUrl: string;
  mp4Url: string;
  dashUrl: string;
  status: string;
  readyToStream: boolean;
}

function getStreamToken(): string {
  const token = (config as any).CF_STREAM_API_TOKEN || config.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CF_STREAM_API_TOKEN not configured');
  return token;
}

function getAccountId(): string {
  if (!config.CLOUDFLARE_ACCOUNT_ID) throw new Error('CLOUDFLARE_ACCOUNT_ID not configured');
  return config.CLOUDFLARE_ACCOUNT_ID;
}

function getSubdomain(): string {
  return (config as any).CF_STREAM_CUSTOMER_SUBDOMAIN || '';
}

/**
 * Upload a video to CF Stream by providing a source URL.
 * Works for direct MP4 URLs, WordPress uploads, R2 presigned URLs.
 */
export async function uploadFromUrl(
  sourceUrl: string,
  meta: { name?: string; siteId?: string; platform?: string }
): Promise<StreamUploadResult> {
  const token = getStreamToken();
  const accountId = getAccountId();

  console.log(`[cf-stream] Uploading from URL: ${sourceUrl.slice(0, 80)}...`);

  const response = await fetch(
    `${CF_API}/accounts/${accountId}/stream/copy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: sourceUrl,
        meta: {
          name: meta.name || 'Metrics Lab Video',
          siteId: meta.siteId,
          platform: meta.platform,
        },
        requireSignedURLs: false,
      }),
      signal: AbortSignal.timeout(60000),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CF Stream copy failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    result?: {
      uid: string;
      status?: { state: string };
      readyToStream?: boolean;
      playback?: { hls?: string; dash?: string };
    };
    errors?: Array<{ message: string }>;
  };

  if (!data.success || !data.result) {
    throw new Error(`CF Stream API error: ${data.errors?.map(e => e.message).join(', ')}`);
  }

  const uid = data.result.uid;
  const subdomain = getSubdomain();
  const customerBase = subdomain
    ? `https://customer-${subdomain}.cloudflarestream.com`
    : `https://cloudflarestream.com`;

  return {
    uid,
    hlsUrl: data.result.playback?.hls || `${customerBase}/${uid}/manifest/video.m3u8`,
    mp4Url: `${customerBase}/${uid}/downloads/default.mp4`,
    dashUrl: data.result.playback?.dash || `${customerBase}/${uid}/manifest/video.mpd`,
    status: data.result.status?.state || 'queued',
    readyToStream: data.result.readyToStream || false,
  };
}

/**
 * Poll CF Stream until video is ready to stream.
 * Returns updated status. Times out after maxWaitMs.
 */
export async function waitForReady(
  uid: string,
  maxWaitMs: number = 300000
): Promise<StreamUploadResult> {
  const token = getStreamToken();
  const accountId = getAccountId();
  const subdomain = getSubdomain();
  const customerBase = subdomain
    ? `https://customer-${subdomain}.cloudflarestream.com`
    : `https://cloudflarestream.com`;

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(
      `${CF_API}/accounts/${accountId}/stream/${uid}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (response.ok) {
      const data = (await response.json()) as {
        success: boolean;
        result?: {
          uid: string;
          readyToStream?: boolean;
          status?: { state: string };
          playback?: { hls?: string; dash?: string };
        };
      };

      if (data.result?.readyToStream) {
        console.log(`[cf-stream] Video ${uid} is ready to stream`);
        return {
          uid,
          hlsUrl: data.result.playback?.hls || `${customerBase}/${uid}/manifest/video.m3u8`,
          mp4Url: `${customerBase}/${uid}/downloads/default.mp4`,
          dashUrl: data.result.playback?.dash || `${customerBase}/${uid}/manifest/video.mpd`,
          status: 'ready',
          readyToStream: true,
        };
      }
    }

    // Wait 5 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.warn(`[cf-stream] Video ${uid} not ready after ${maxWaitMs}ms — proceeding anyway`);
  return {
    uid,
    hlsUrl: `${customerBase}/${uid}/manifest/video.m3u8`,
    mp4Url: `${customerBase}/${uid}/downloads/default.mp4`,
    dashUrl: `${customerBase}/${uid}/manifest/video.mpd`,
    status: 'processing',
    readyToStream: false,
  };
}

/**
 * Check if CF Stream is configured.
 */
export function isStreamAvailable(): boolean {
  return !!(
    config.CLOUDFLARE_ACCOUNT_ID &&
    ((config as any).CF_STREAM_API_TOKEN || config.CLOUDFLARE_API_TOKEN)
  );
}
