/**
 * R2StagingUploader — Uploads downloaded video files to Cloudflare R2
 * as a staging area before CF Stream ingestion.
 *
 * CF Stream's /stream/copy endpoint needs a publicly accessible URL.
 * R2 presigned URLs provide that for locally downloaded files.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../../config.js';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    const accountId = config.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = (config as any).CF_R2_ACCESS_KEY_ID;
    const secretAccessKey = (config as any).CF_R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('R2 credentials not configured (CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY)');
    }

    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return _client;
}

function getBucket(): string {
  return (config as any).CF_R2_BUCKET_NAME || 'ml-video-staging';
}

export interface R2UploadResult {
  key: string;
  presignedUrl: string;
}

/**
 * Upload a local file to R2 staging bucket.
 * Returns a presigned URL valid for 1 hour.
 */
export async function uploadToR2(
  filePath: string,
  key: string
): Promise<R2UploadResult> {
  const client = getClient();
  const bucket = getBucket();

  console.log(`[r2-staging] Uploading ${path.basename(filePath)} to r2://${bucket}/${key}`);

  const fileBuffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === '.mp4' ? 'video/mp4'
    : ext === '.webm' ? 'video/webm'
    : ext === '.mov' ? 'video/quicktime'
    : 'application/octet-stream';

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  }));

  // Generate presigned URL for CF Stream to fetch
  const presignedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 3600 }
  );

  console.log(`[r2-staging] Uploaded to R2: ${key} (${fileBuffer.length} bytes)`);

  return { key, presignedUrl };
}

/**
 * Delete a staging file from R2 after CF Stream has ingested it.
 */
export async function deleteFromR2(key: string): Promise<void> {
  try {
    const client = getClient();
    const bucket = getBucket();

    await client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }));

    console.log(`[r2-staging] Deleted staging file: ${key}`);
  } catch (err) {
    console.warn(`[r2-staging] Failed to delete ${key}: ${(err as Error).message}`);
  }
}

/**
 * Check if R2 is configured and available.
 */
export function isR2Available(): boolean {
  return !!(
    config.CLOUDFLARE_ACCOUNT_ID &&
    (config as any).CF_R2_ACCESS_KEY_ID &&
    (config as any).CF_R2_SECRET_ACCESS_KEY
  );
}
