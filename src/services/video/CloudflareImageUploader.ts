/**
 * CloudflareImageUploader — Uploads PNG buffer to Cloudflare Images API.
 * Returns CDN delivery URLs with automatic AVIF/WebP format negotiation.
 * Falls back to local sharp WebP optimization if CF Images is not configured.
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../../config.js';

const CF_IMAGES_API = 'https://api.cloudflare.com/client/v4/accounts';

export interface ImageUploadResult {
  publicUrl: string;
  thumbUrl: string;
  isLocal: boolean;
}

function getCfImagesToken(): string | undefined {
  return (config as any).CF_IMAGES_API_TOKEN || config.CLOUDFLARE_API_TOKEN;
}

function getAccountId(): string | undefined {
  return config.CLOUDFLARE_ACCOUNT_ID;
}

function getAccountHash(): string | undefined {
  return (config as any).CF_IMAGES_ACCOUNT_HASH;
}

/**
 * Upload a screenshot buffer to CF Images, or fall back to local storage.
 */
export async function uploadThumbnail(
  screenshotBuffer: Buffer,
  imageId: string,
  metadata: { siteId?: string; sourceUrl?: string; capturedAt?: string },
  workDir: string
): Promise<ImageUploadResult> {
  const token = getCfImagesToken();
  const accountId = getAccountId();
  const accountHash = getAccountHash();

  if (token && accountId && accountHash) {
    try {
      return await uploadToCloudflareImages(screenshotBuffer, imageId, metadata, accountId, token, accountHash);
    } catch (err) {
      console.warn(`[cf-images] Upload failed, falling back to local: ${(err as Error).message}`);
    }
  }

  return saveLocally(screenshotBuffer, imageId, workDir);
}

async function uploadToCloudflareImages(
  buffer: Buffer,
  imageId: string,
  metadata: { siteId?: string; sourceUrl?: string; capturedAt?: string },
  accountId: string,
  token: string,
  accountHash: string
): Promise<ImageUploadResult> {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), `${imageId}.png`);
  formData.append('id', imageId);
  formData.append('metadata', JSON.stringify(metadata));
  formData.append('requireSignedURLs', 'false');

  const response = await fetch(
    `${CF_IMAGES_API}/${accountId}/images/v1`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    // If image already exists (duplicate), try to use the existing URL
    if (response.status === 409 || body.includes('already exists')) {
      console.log(`[cf-images] Image ${imageId} already exists, reusing.`);
      return {
        publicUrl: `https://imagedelivery.net/${accountHash}/${imageId}/public`,
        thumbUrl: `https://imagedelivery.net/${accountHash}/${imageId}/thumb`,
        isLocal: false,
      };
    }
    throw new Error(`CF Images API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    result?: { id: string; variants?: string[] };
    errors?: Array<{ message: string }>;
  };

  if (!data.success || !data.result) {
    throw new Error(`CF Images API error: ${data.errors?.map((e) => e.message).join(', ')}`);
  }

  return {
    publicUrl: `https://imagedelivery.net/${accountHash}/${data.result.id}/public`,
    thumbUrl: `https://imagedelivery.net/${accountHash}/${data.result.id}/thumb`,
    isLocal: false,
  };
}

/**
 * Fallback: optimize with sharp and save locally.
 */
async function saveLocally(
  buffer: Buffer,
  imageId: string,
  workDir: string
): Promise<ImageUploadResult> {
  const thumbDir = path.join(workDir, 'assets', 'video-thumbnails');
  await fs.mkdir(thumbDir, { recursive: true });

  const filename = `${imageId}.webp`;
  const optimized = await sharp(buffer)
    .resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  const localPath = path.join(thumbDir, filename);
  await fs.writeFile(localPath, optimized);

  const publicUrl = `/assets/video-thumbnails/${filename}`;

  // Also create a thumb variant
  const thumbFilename = `${imageId}-thumb.webp`;
  const thumbBuffer = await sharp(buffer)
    .resize(640, 360, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  await fs.writeFile(path.join(thumbDir, thumbFilename), thumbBuffer);

  const thumbUrl = `/assets/video-thumbnails/${thumbFilename}`;

  return { publicUrl, thumbUrl, isLocal: true };
}

/**
 * Delete an image from CF Images (cleanup utility).
 */
export async function deleteImage(imageId: string): Promise<void> {
  const token = getCfImagesToken();
  const accountId = getAccountId();
  if (!token || !accountId) return;

  try {
    await fetch(`${CF_IMAGES_API}/${accountId}/images/v1/${imageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // non-critical, ignore
  }
}
