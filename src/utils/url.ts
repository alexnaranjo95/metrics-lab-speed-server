/**
 * Normalize a site URL: ensure https, strip trailing slash, lowercase host.
 */
export function normalizeUrl(url: string): string {
  let normalized = url.trim();

  // Ensure protocol
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }

  // Force https
  normalized = normalized.replace(/^http:\/\//, 'https://');

  // Strip trailing slash
  normalized = normalized.replace(/\/+$/, '');

  // Parse and rebuild to normalize
  try {
    const parsed = new URL(normalized);
    parsed.hostname = parsed.hostname.toLowerCase();
    // Remove default port
    if (parsed.port === '443' || parsed.port === '80') {
      parsed.port = '';
    }
    // Rebuild without trailing slash on pathname if it's just "/"
    let result = `${parsed.protocol}//${parsed.hostname}`;
    if (parsed.port) result += `:${parsed.port}`;
    if (parsed.pathname && parsed.pathname !== '/') {
      result += parsed.pathname.replace(/\/+$/, '');
    }
    return result;
  } catch {
    return normalized;
  }
}

/**
 * Extract the domain from a URL (e.g., "myblog.com" from "https://myblog.com/path").
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

/**
 * Generate a Cloudflare project name from a domain.
 * Format: "mls-{sanitized-domain}" (max 63 chars for CF Pages).
 */
export function generateCloudflareProjectName(domain: string): string {
  const sanitized = domain
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const name = `mls-${sanitized}`;
  return name.slice(0, 63);
}

/**
 * Check if a URL is on the same origin as the base URL.
 */
export function isSameOrigin(baseUrl: string, testUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const test = new URL(testUrl, baseUrl);
    return base.hostname === test.hostname;
  } catch {
    return false;
  }
}

/**
 * Convert an absolute URL to a relative path.
 */
export function urlToPath(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url, baseUrl);
    let path = parsed.pathname;
    // Remove trailing slash for non-root paths
    if (path !== '/' && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path || '/';
  } catch {
    return '/';
  }
}
