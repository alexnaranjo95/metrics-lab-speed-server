import crypto from 'crypto';

/**
 * Generate a random webhook secret (64 hex characters = 32 bytes).
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create an HMAC-SHA256 signature for a payload.
 */
export function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify an HMAC-SHA256 signature against a payload.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = signPayload(payload, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Generate a SHA-256 hash of content (for content change detection).
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
