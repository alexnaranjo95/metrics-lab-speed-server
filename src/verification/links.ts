import { chromium } from 'playwright';
import type { PageInventory, LinkVerificationResult } from '../ai/types.js';

export type { LinkVerificationResult };

export async function verifyAllLinks(
  originalUrl: string,
  optimizedUrl: string,
  pages: PageInventory[],
  log: (msg: string) => void
): Promise<LinkVerificationResult[]> {
  const results: LinkVerificationResult[] = [];
  const checkedUrls = new Map<string, number>();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    for (const pageInfo of pages.slice(0, 10)) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();

      try {
        const optimizedPageUrl = new URL(pageInfo.path, optimizedUrl).href;
        await page.goto(optimizedPageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3000);

        const links = await page.$$eval('a[href]', (anchors) => anchors.map(a => ({
          href: a.getAttribute('href') || '',
          text: (a.textContent || '').trim().substring(0, 80),
          resolvedUrl: (a as HTMLAnchorElement).href,
        })));

        for (const link of links) {
          if (!link.href || link.href.startsWith('mailto:') || link.href.startsWith('tel:') || link.href.startsWith('javascript:') || link.href === '#') continue;

          const optimizedHost = new URL(optimizedUrl).hostname;
          const originalHost = new URL(originalUrl).hostname;
          const isInternal = link.resolvedUrl.includes(optimizedHost) || link.resolvedUrl.includes(originalHost) || link.href.startsWith('/') || link.href.startsWith('./');

          if (isInternal) {
            let checkUrl = link.resolvedUrl;
            if (checkUrl.includes(originalHost)) {
              checkUrl = checkUrl.replace(new URL(originalUrl).origin, optimizedUrl);
            }

            if (!checkedUrls.has(checkUrl)) {
              try {
                const response = await fetch(checkUrl, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
                checkedUrls.set(checkUrl, response.status);
              } catch {
                checkedUrls.set(checkUrl, 0);
              }
            }

            const status = checkedUrls.get(checkUrl)!;
            results.push({
              page: pageInfo.path, href: link.href, resolvedUrl: checkUrl, text: link.text,
              status, passed: status >= 200 && status < 400,
              failureReason: status === 0 ? 'Network error' : status >= 400 ? `HTTP ${status}` : undefined,
              isExternal: false, isInternal: true,
            });
          } else {
            results.push({
              page: pageInfo.path, href: link.href, resolvedUrl: link.resolvedUrl, text: link.text,
              status: null, passed: true, isExternal: true, isInternal: false,
            });
          }
        }
      } catch (err) {
        log(`Link check failed for ${pageInfo.path}: ${(err as Error).message}`);
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const broken = results.filter(l => !l.passed);
  log(`Links: ${results.length - broken.length} valid, ${broken.length} broken`);
  return results;
}
