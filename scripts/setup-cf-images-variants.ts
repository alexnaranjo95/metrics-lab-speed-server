/**
 * One-time setup script for Cloudflare Images variants.
 *
 * Creates "public" and "thumb" image variants, and retrieves the account hash.
 *
 * Usage: npx tsx scripts/setup-cf-images-variants.ts
 *
 * Required env vars:
 *   CF_IMAGES_API_TOKEN or CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID
 */

import 'dotenv/config';

const CF_API = 'https://api.cloudflare.com/client/v4';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CF_IMAGES_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID) {
  console.error('CLOUDFLARE_ACCOUNT_ID is required');
  process.exit(1);
}
if (!TOKEN) {
  console.error('CF_IMAGES_API_TOKEN or CLOUDFLARE_API_TOKEN is required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

interface CFResponse {
  success: boolean;
  result?: any;
  errors?: Array<{ code: number; message: string }>;
}

async function getAccountHash(): Promise<string | null> {
  try {
    const res = await fetch(`${CF_API}/accounts/${ACCOUNT_ID}/images/v1/keys`, { headers });
    const data = (await res.json()) as CFResponse;
    if (data.success && data.result?.keys?.[0]?.name) {
      return data.result.keys[0].name;
    }
    // Try to get hash from any existing image
    const listRes = await fetch(`${CF_API}/accounts/${ACCOUNT_ID}/images/v2?per_page=1`, { headers });
    const listData = (await listRes.json()) as CFResponse;
    if (listData.success && listData.result?.images?.[0]?.variants?.[0]) {
      const url: string = listData.result.images[0].variants[0];
      const match = url.match(/imagedelivery\.net\/([^/]+)\//);
      if (match) return match[1];
    }
  } catch (err) {
    console.error('Failed to retrieve account hash:', (err as Error).message);
  }
  return null;
}

async function createVariant(id: string, options: Record<string, any>): Promise<boolean> {
  try {
    const res = await fetch(`${CF_API}/accounts/${ACCOUNT_ID}/images/v1/variants`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id, options, neverRequireSignedURLs: true }),
    });
    const data = (await res.json()) as CFResponse;

    if (data.success) {
      console.log(`  Created variant "${id}"`);
      return true;
    }

    if (data.errors?.some((e) => e.message.includes('already exists') || e.code === 5400)) {
      console.log(`  Variant "${id}" already exists — skipping`);
      return true;
    }

    console.error(`  Failed to create variant "${id}":`, data.errors);
    return false;
  } catch (err) {
    console.error(`  Error creating variant "${id}":`, (err as Error).message);
    return false;
  }
}

async function main() {
  console.log('Cloudflare Images — Variant Setup');
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log('');

  // Retrieve account hash
  console.log('Retrieving account hash...');
  const hash = await getAccountHash();
  if (hash) {
    console.log(`  Account hash: ${hash}`);
    console.log(`  Set this in your .env: CF_IMAGES_ACCOUNT_HASH=${hash}`);
  } else {
    console.log('  Could not retrieve account hash. Upload an image first, then re-run.');
    console.log('  Or find it in Cloudflare Dashboard > Images > any image delivery URL.');
  }
  console.log('');

  // Create variants
  console.log('Creating image variants...');

  await createVariant('public', {
    fit: 'scale-down',
    metadata: 'none',
    quality: 85,
  });

  await createVariant('thumb', {
    width: 640,
    fit: 'scale-down',
    metadata: 'none',
    quality: 80,
  });

  await createVariant('bg-desktop', {
    width: 1920,
    height: 1080,
    fit: 'cover',
    metadata: 'none',
    quality: 85,
  });

  await createVariant('bg-mobile', {
    width: 768,
    height: 1024,
    fit: 'cover',
    metadata: 'none',
    quality: 80,
  });

  await createVariant('og', {
    width: 1200,
    height: 630,
    fit: 'cover',
    metadata: 'none',
    quality: 90,
  });

  await createVariant('icon', {
    width: 180,
    height: 180,
    fit: 'cover',
    metadata: 'none',
    quality: 90,
  });

  console.log('');
  console.log('Setup complete. 6 variants configured: public, thumb, bg-desktop, bg-mobile, og, icon');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
