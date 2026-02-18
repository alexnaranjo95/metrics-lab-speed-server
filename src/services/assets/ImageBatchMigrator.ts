/**
 * ImageBatchMigrator — Uploads images to Cloudflare Images via URL or direct file.
 *
 * When resolvedUrl points to a local asset (/assets/*), uploads from disk (file) instead
 * of URL — URLs like origin.com/assets/foo.webp don't exist during build.
 * Uses batch token API for rate limit bypass. Runs up to 10 concurrent uploads per batch.
 */

import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { config } from '../../config.js';
import type { ImageRecord } from './ImageScanner.js';

const CF_API = 'https://api.cloudflare.com/client/v4/accounts';

export interface MigrationResult {
  id: string;
  originalUrl: string;
  cfImageId: string;
  cfDeliveryUrl: string;
  status: 'migrated' | 'failed' | 'skipped' | 'existing';
  failureReason?: string;
  width?: number;
  height?: number;
}

function getToken(): string | undefined {
  return (config as any).CF_IMAGES_API_TOKEN || config.CLOUDFLARE_API_TOKEN;
}

function getAccountId(): string | undefined {
  return config.CLOUDFLARE_ACCOUNT_ID;
}

function getAccountHash(): string | undefined {
  return (config as any).CF_IMAGES_ACCOUNT_HASH;
}

export interface MigrationOptions {
  skipSvg?: boolean;
  maxSizeMb?: number;
  concurrency?: number;
}

/** Extract path from URL; for relative paths return as-is */
function getPathFromUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
    try {
      return new URL(url.startsWith('//') ? `https:${url}` : url).pathname;
    } catch {
      return url;
    }
  }
  return url.startsWith('/') ? url : `/${url}`;
}

/**
 * Migrate all images to Cloudflare Images.
 * @param workDir - When provided, upload from local file when resolvedUrl is /assets/*
 * @param options - Per-site migration settings (skipSvg, maxSizeMb, concurrency); falls back to config/env
 */
export async function migrateAll(
  records: ImageRecord[],
  siteId: string,
  onProgress?: (migrated: number, total: number, currentUrl: string) => void,
  workDir?: string,
  options?: MigrationOptions
): Promise<MigrationResult[]> {
  const token = getToken();
  const accountId = getAccountId();
  const accountHash = getAccountHash();

  const skipSvg = options?.skipSvg ?? true;
  const maxSizeMb = options?.maxSizeMb ?? (config as any).IMAGE_MAX_SIZE_MB ?? 10;
  const concurrency = options?.concurrency ?? (config as any).IMAGE_MIGRATION_CONCURRENCY ?? 10;
  const batchSize = (config as any).IMAGE_BATCH_SIZE ?? 200;

  if (!token || !accountId || !accountHash) {
    const missing = [
      !token && 'CF_IMAGES_API_TOKEN or CLOUDFLARE_API_TOKEN',
      !accountId && 'CLOUDFLARE_ACCOUNT_ID',
      !accountHash && 'CF_IMAGES_ACCOUNT_HASH',
    ].filter(Boolean);
    console.warn(`[image-migrator] CF Images not configured — missing: ${missing.join(', ')}. Skipping migration.`);
    return records.map(r => ({
      id: r.id,
      originalUrl: r.resolvedUrl,
      cfImageId: r.id,
      cfDeliveryUrl: r.resolvedUrl,
      status: 'skipped' as const,
      failureReason: 'CF Images not configured',
    }));
  }

  // Filter by settings
  let filteredRecords = records;
  if (skipSvg) {
    filteredRecords = filteredRecords.filter(r => !/\.svg(\?|$)/i.test(r.resolvedUrl));
    if (filteredRecords.length < records.length) {
      console.log(`[image-migrator] Skipped ${records.length - filteredRecords.length} SVG images (skipSvg=true)`);
    }
  }

  // Deduplicate by resolved URL
  const uniqueRecords = deduplicateByUrl(filteredRecords);
  console.log(`[image-migrator] Migrating ${uniqueRecords.length} unique images (concurrency=${concurrency}, maxSizeMb=${maxSizeMb})`);

  const results: MigrationResult[] = [];
  const existingCache = new Map<string, string>();
  const limit = pLimit(concurrency);

  for (let i = 0; i < uniqueRecords.length; i += batchSize) {
    const batch = uniqueRecords.slice(i, i + batchSize);

    const batchPromises = batch.map((record) =>
      limit(async (): Promise<MigrationResult> => {
        try {
          // Check cache first
          if (existingCache.has(record.resolvedUrl)) {
            return {
              id: record.id,
              originalUrl: record.resolvedUrl,
              cfImageId: record.id,
              cfDeliveryUrl: existingCache.get(record.resolvedUrl)!,
              status: 'existing',
            };
          }

          // Check if image already exists in CF Images
          const existingUrl = await checkExisting(record.id, accountId, token, accountHash);
          if (existingUrl) {
            existingCache.set(record.resolvedUrl, existingUrl);
            return {
              id: record.id,
              originalUrl: record.resolvedUrl,
              cfImageId: record.id,
              cfDeliveryUrl: existingUrl,
              status: 'existing',
            };
          }

          // Prefer direct file upload when path is /assets/* (local build output)
          const urlPath = getPathFromUrl(record.resolvedUrl);
          const metadata = { siteId, originalUrl: record.resolvedUrl, migratedAt: new Date().toISOString() };
          let result: MigrationResult;
          if (workDir && (urlPath.startsWith('/assets/') || urlPath.startsWith('assets/'))) {
            const localPath = path.join(workDir, urlPath.replace(/^\//, ''));
            const fileExists = await fs.access(localPath).then(() => true).catch(() => false);
            if (fileExists) {
              const stat = await fs.stat(localPath);
              const sizeMb = stat.size / (1024 * 1024);
              if (sizeMb > maxSizeMb) {
                return {
                  id: record.id,
                  originalUrl: record.resolvedUrl,
                  cfImageId: record.id,
                  cfDeliveryUrl: record.resolvedUrl,
                  status: 'skipped',
                  failureReason: `File exceeds maxSizeMb (${sizeMb.toFixed(1)} > ${maxSizeMb})`,
                };
              }
              result = await uploadViaFile(
                localPath,
                record.id,
                metadata,
                record.resolvedUrl,
                accountId,
                token,
                accountHash
              );
            } else {
              result = await uploadViaUrl(
                record.resolvedUrl,
                record.id,
                metadata,
                accountId,
                token,
                accountHash
              );
            }
          } else {
            result = await uploadViaUrl(
              record.resolvedUrl,
              record.id,
              metadata,
              accountId,
              token,
              accountHash
            );
          }

          existingCache.set(record.resolvedUrl, result.cfDeliveryUrl);

          onProgress?.(results.length + 1, uniqueRecords.length, record.resolvedUrl);

          return result;
        } catch (err) {
          return {
            id: record.id,
            originalUrl: record.resolvedUrl,
            cfImageId: record.id,
            cfDeliveryUrl: record.resolvedUrl,
            status: 'failed',
            failureReason: (err as Error).message,
          };
        }
      })
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Rate limit between batches
    if (i + batchSize < uniqueRecords.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const migrated = results.filter(r => r.status === 'migrated').length;
  const existing = results.filter(r => r.status === 'existing').length;
  const failed = results.filter(r => r.status === 'failed').length;
  console.log(`[image-migrator] Complete: ${migrated} migrated, ${existing} existing, ${failed} failed`);

  // Build lookup for all original URLs -> CF URLs (including duplicates)
  const urlLookup = new Map<string, MigrationResult>();
  for (const r of results) {
    urlLookup.set(r.originalUrl, r);
  }

  // Map back to all original records (including duplicates)
  return records.map(rec => {
    const result = urlLookup.get(rec.resolvedUrl);
    if (result) return { ...result, id: rec.id };
    return {
      id: rec.id,
      originalUrl: rec.resolvedUrl,
      cfImageId: rec.id,
      cfDeliveryUrl: rec.resolvedUrl,
      status: 'skipped' as const,
    };
  });
}

async function checkExisting(
  imageId: string,
  accountId: string,
  token: string,
  accountHash: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${CF_API}/${accountId}/images/v1/${imageId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (res.status === 200) {
      return `https://imagedelivery.net/${accountHash}/${imageId}/public`;
    }
  } catch {
    // not found or error — proceed with upload
  }
  return null;
}

async function uploadViaUrl(
  imageUrl: string,
  imageId: string,
  metadata: Record<string, string>,
  accountId: string,
  token: string,
  accountHash: string
): Promise<MigrationResult> {
  const formData = new FormData();
  formData.append('url', imageUrl);
  formData.append('id', imageId);
  formData.append('metadata', JSON.stringify(metadata));
  formData.append('requireSignedURLs', 'false');

  const response = await fetch(
    `${CF_API}/${accountId}/images/v1`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!response.ok) {
    const body = await response.text();

    // Image already exists
    if (response.status === 409 || body.includes('already exists')) {
      return {
        id: imageId,
        originalUrl: imageUrl,
        cfImageId: imageId,
        cfDeliveryUrl: `https://imagedelivery.net/${accountHash}/${imageId}/public`,
        status: 'existing',
      };
    }

    // Rate limited — wait and retry once
    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 30000));
      const retryRes = await fetch(
        `${CF_API}/${accountId}/images/v1`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!retryRes.ok) {
        throw new Error(`Rate limited, retry failed: ${retryRes.status}`);
      }
      const retryData = (await retryRes.json()) as any;
      if (retryData.success && retryData.result) {
        return {
          id: imageId,
          originalUrl: imageUrl,
          cfImageId: retryData.result.id,
          cfDeliveryUrl: `https://imagedelivery.net/${accountHash}/${retryData.result.id}/public`,
          status: 'migrated',
        };
      }
    }

    throw new Error(`CF Images upload failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    result?: { id: string };
    errors?: Array<{ message: string }>;
  };

  if (!data.success || !data.result) {
    throw new Error(`CF Images error: ${data.errors?.map(e => e.message).join(', ')}`);
  }

  return {
    id: imageId,
    originalUrl: imageUrl,
    cfImageId: data.result.id,
    cfDeliveryUrl: `https://imagedelivery.net/${accountHash}/${data.result.id}/public`,
    status: 'migrated',
  };
}

async function uploadViaFile(
  localPath: string,
  imageId: string,
  metadata: Record<string, string>,
  originalUrlForLookup: string,
  accountId: string,
  token: string,
  accountHash: string
): Promise<MigrationResult> {
  const fileBuffer = await fs.readFile(localPath);
  const filename = path.basename(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const mime = ext === '.webp' ? 'image/webp'
    : ext === '.avif' ? 'image/avif'
    : ext === '.png' ? 'image/png'
    : ext === '.gif' ? 'image/gif'
    : 'image/jpeg';

  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: mime }), filename);
  formData.append('id', imageId);
  formData.append('metadata', JSON.stringify(metadata));
  formData.append('requireSignedURLs', 'false');

  const response = await fetch(
    `${CF_API}/${accountId}/images/v1`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: AbortSignal.timeout(60000),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 409 || body.includes('already exists')) {
      return {
        id: imageId,
        originalUrl: originalUrlForLookup,
        cfImageId: imageId,
        cfDeliveryUrl: `https://imagedelivery.net/${accountHash}/${imageId}/public`,
        status: 'existing',
      };
    }
    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 30000));
      const retryFormData = new FormData();
      retryFormData.append('file', new Blob([fileBuffer], { type: mime }), filename);
      retryFormData.append('id', imageId);
      retryFormData.append('metadata', JSON.stringify(metadata));
      retryFormData.append('requireSignedURLs', 'false');
      const retryRes = await fetch(
        `${CF_API}/${accountId}/images/v1`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: retryFormData,
          signal: AbortSignal.timeout(60000),
        }
      );
      if (!retryRes.ok) {
        throw new Error(`Rate limited, retry failed: ${retryRes.status}`);
      }
      const retryData = (await retryRes.json()) as any;
      if (retryData.success && retryData.result) {
        return {
          id: imageId,
          originalUrl: originalUrlForLookup,
          cfImageId: retryData.result.id,
          cfDeliveryUrl: `https://imagedelivery.net/${accountHash}/${retryData.result.id}/public`,
          status: 'migrated',
        };
      }
    }
    throw new Error(`CF Images upload failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    result?: { id: string };
    errors?: Array<{ message: string }>;
  };

  if (!data.success || !data.result) {
    throw new Error(`CF Images error: ${data.errors?.map(e => e.message).join(', ')}`);
  }

  return {
    id: imageId,
    originalUrl: originalUrlForLookup,
    cfImageId: data.result.id,
    cfDeliveryUrl: `https://imagedelivery.net/${accountHash}/${data.result.id}/public`,
    status: 'migrated',
  };
}

function deduplicateByUrl(records: ImageRecord[]): ImageRecord[] {
  const seen = new Set<string>();
  return records.filter(r => {
    if (seen.has(r.resolvedUrl)) return false;
    seen.add(r.resolvedUrl);
    return true;
  });
}
