import { chromium } from 'playwright';
import { captureElementState } from '../ai/analyzer.js';
import type { InteractiveElement, FunctionalBaseline, FunctionalTestResult, ElementState } from '../ai/types.js';

export type { InteractiveElement, FunctionalTestResult };

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function verifyFunctionalBehavior(
  optimizedUrl: string,
  elements: InteractiveElement[],
  baselines: FunctionalBaseline[],
  log: (msg: string) => void
): Promise<FunctionalTestResult[]> {
  const results: FunctionalTestResult[] = [];
  const interactiveOnly = elements.filter(e => e.type !== 'link').slice(0, 30);

  if (interactiveOnly.length === 0) return results;

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    // Group by page
    const byPage = new Map<string, InteractiveElement[]>();
    for (const el of interactiveOnly) {
      const group = byPage.get(el.page) || [];
      group.push(el);
      byPage.set(el.page, group);
    }

    for (const [pagePath, pageElements] of byPage) {
      const context = await browser.newContext({
        userAgent: CHROME_UA,
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
      });

      for (const element of pageElements) {
        const page = await context.newPage();
        try {
          const pageUrl = new URL(pagePath, optimizedUrl).href;
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForTimeout(3000);
          await page.waitForTimeout(1000);

          const baseline = baselines.find(b => b.selector === element.selector && b.page === element.page);

          // Check if element exists
          const el = await page.$(element.selector);
          if (!el) {
            results.push({ element, passed: false, failureReason: `Element not found: ${element.selector}` });
            await page.close();
            continue;
          }

          // Check visibility
          const isVisible = await el.isVisible();
          if (!isVisible && baseline?.stateBefore?.isVisible) {
            results.push({ element, passed: false, failureReason: 'Element exists but not visible (was visible on original)' });
            await page.close();
            continue;
          }

          // Capture state before interaction
          const stateBefore = await captureElementState(page, element.selector);

          // Perform interaction
          try {
            if (element.triggerAction === 'click') await el.click({ timeout: 3000 });
            else if (element.triggerAction === 'hover') await el.hover();
          } catch (err: any) {
            results.push({ element, passed: false, failureReason: `Interaction failed: ${err.message}` });
            await page.close();
            continue;
          }

          await page.waitForTimeout(600);
          const stateAfter = await captureElementState(page, element.selector);

          // Compare behavior
          const passed = compareBehavior(baseline, stateBefore, stateAfter, element);

          results.push({
            element,
            passed,
            failureReason: passed ? undefined : describeMismatch(element, stateAfter),
          });

          log(`[${element.type}] ${element.description}: ${passed ? 'PASS' : 'FAIL'}`);
        } catch (err) {
          results.push({ element, passed: false, failureReason: `Test error: ${(err as Error).message}` });
        } finally {
          await page.close();
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  return results;
}

function compareBehavior(
  baseline: FunctionalBaseline | undefined,
  before: ElementState | null,
  after: ElementState | null,
  element: InteractiveElement
): boolean {
  if (!baseline || !baseline.stateBefore || !baseline.stateAfter) return true;
  if (!before || !after) return false;

  switch (element.type) {
    case 'dropdown':
    case 'hamburger-menu': {
      const baselineChanged = baseline.stateBefore.computedStyle.display !== baseline.stateAfter.computedStyle.display ||
        baseline.stateBefore.isVisible !== baseline.stateAfter.isVisible;
      if (baselineChanged) {
        return before.computedStyle.display !== after.computedStyle.display || before.isVisible !== after.isVisible;
      }
      return true;
    }
    case 'slider':
    case 'carousel': {
      if (baseline.stateAfter.activeSlideIndex !== undefined && baseline.stateBefore.activeSlideIndex !== undefined) {
        return after.activeSlideIndex !== before.activeSlideIndex;
      }
      return after.innerText !== before.innerText;
    }
    case 'accordion': {
      const baselineExpanded = baseline.stateAfter.boundingBox && baseline.stateBefore.boundingBox &&
        baseline.stateAfter.boundingBox.height > baseline.stateBefore.boundingBox.height;
      if (baselineExpanded) {
        return !!after.boundingBox && !!before.boundingBox && after.boundingBox.height > before.boundingBox.height;
      }
      return true;
    }
    case 'tab':
      return after.innerText !== before.innerText;
    case 'modal':
      return after.isVisible && !before.isVisible;
    case 'form':
      return true;
    default:
      return true;
  }
}

function describeMismatch(element: InteractiveElement, state: ElementState | null): string {
  const map: Record<string, string> = {
    'dropdown': 'Dropdown did not open. JS controlling this element likely removed.',
    'hamburger-menu': 'Hamburger menu did not open. Mobile menu JS likely removed.',
    'slider': 'Slider did not advance. Slider library (Slick/Owl/Swiper) likely removed or jQuery broken.',
    'accordion': 'Accordion did not expand. Accordion JS removed.',
    'tab': 'Tab content did not switch. Tab JS removed.',
    'modal': 'Modal did not appear. Modal library JS removed.',
  };
  return map[element.type] || `Interaction did not produce expected behavior.`;
}
