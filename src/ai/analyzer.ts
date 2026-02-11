import fs from 'fs/promises';
import path from 'path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type {
  SiteInventory, PageInventory, ScriptInventory, StylesheetInventory,
  ImageInventory, FontInventory, WordPressInfo, InteractiveElement,
  BaselineScreenshot, FunctionalBaseline, ElementState,
} from './types.js';

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const VIEWPORTS = [
  { name: 'desktop' as const, width: 1920, height: 1080, scale: 1 },
  { name: 'tablet' as const, width: 768, height: 1024, scale: 1 },
  { name: 'mobile' as const, width: 375, height: 812, scale: 2 },
];

export async function analyzeSite(
  siteUrl: string,
  workDir: string,
  log: (msg: string) => void
): Promise<SiteInventory> {
  const screenshotsDir = path.join(workDir, 'baseline');
  await fs.mkdir(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    log('Crawling live site for inventory...');
    const context = await browser.newContext({ userAgent: CHROME_UA, viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });

    // ─── Discover pages ──────────────────────────────────
    const homepage = await context.newPage();
    await homepage.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await homepage.waitForTimeout(3000);

    const discoveredLinks = await homepage.evaluate((baseUrl: string) => {
      const links: string[] = [];
      document.querySelectorAll('a[href]').forEach(a => {
        const href = (a as HTMLAnchorElement).href;
        if (href && href.startsWith(baseUrl) && !href.includes('#') && !href.includes('wp-admin') && !href.includes('wp-login')) {
          links.push(href);
        }
      });
      return [...new Set(links)].slice(0, 20);
    }, siteUrl);

    const pageUrls = [siteUrl, ...discoveredLinks.filter(l => l !== siteUrl)].slice(0, 15);

    // ─── Analyze each page ───────────────────────────────
    const pages: PageInventory[] = [];
    const allScripts: Map<string, ScriptInventory> = new Map();
    const allStylesheets: Map<string, StylesheetInventory> = new Map();
    const allImages: ImageInventory[] = [];
    const allFonts: FontInventory[] = [];
    const allInteractive: InteractiveElement[] = [];
    let totalSize = 0;

    for (const pageUrl of pageUrls) {
      const page = await context.newPage();
      try {
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3000);

        const urlObj = new URL(pageUrl);
        const pagePath = urlObj.pathname || '/';

        const pageData = await page.evaluate(() => {
          const html = document.documentElement.outerHTML;
          const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => ({
            src: (s as HTMLScriptElement).src,
            hasDefer: (s as HTMLScriptElement).defer,
            hasAsync: (s as HTMLScriptElement).async,
          }));
          const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => ({
            href: (l as HTMLLinkElement).href,
          }));
          const imgs = Array.from(document.querySelectorAll('img')).map(i => ({
            src: (i as HTMLImageElement).src,
            width: (i as HTMLImageElement).naturalWidth || (i as HTMLImageElement).width,
            height: (i as HTMLImageElement).naturalHeight || (i as HTMLImageElement).height,
            hasAlt: !!(i as HTMLImageElement).alt,
            isLazy: (i as HTMLImageElement).loading === 'lazy',
          }));

          return {
            title: document.title,
            htmlSize: html.length,
            scripts,
            styles,
            images: imgs,
            hasForm: !!document.querySelector('form:not([action*="search"])'),
            hasSlider: !!document.querySelector('.slick-slider, .owl-carousel, .swiper-container, .swiper, .flexslider'),
            hasAccordion: !!document.querySelector('.accordion, .faq-item, [data-toggle="collapse"], .elementor-accordion, details'),
            hasTabs: !!document.querySelector('.tabs, [role="tablist"], .elementor-tabs, .nav-tabs'),
            hasModal: !!document.querySelector('[data-toggle="modal"], [data-fancybox], .popup-trigger'),
            hasDropdownMenu: !!document.querySelector('.menu-item-has-children, .dropdown, .has-submenu'),
            hasVideo: !!document.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]'),
          };
        });

        totalSize += pageData.htmlSize;
        pages.push({
          url: pageUrl,
          path: pagePath,
          title: pageData.title,
          sizeBytes: pageData.htmlSize,
          scriptsCount: pageData.scripts.length,
          stylesheetsCount: pageData.styles.length,
          imagesCount: pageData.images.length,
          hasForm: pageData.hasForm,
          hasSlider: pageData.hasSlider,
          hasAccordion: pageData.hasAccordion,
          hasTabs: pageData.hasTabs,
          hasModal: pageData.hasModal,
          hasDropdownMenu: pageData.hasDropdownMenu,
          hasVideo: pageData.hasVideo,
        });

        // Collect scripts
        for (const s of pageData.scripts) {
          if (!allScripts.has(s.src)) {
            const isWpBloat = /wp-emoji|jquery-migrate|wp-embed|wp-polyfill|comment-reply|hoverintent/i.test(s.src);
            const isJq = /\/jquery[.\-]/i.test(s.src) && !/jquery-migrate/i.test(s.src);
            const isJqPlugin = /slick|owl|swiper|fancybox|magnific|bootstrap/i.test(s.src);
            const isAnalytics = /gtag|analytics|gtm|google-analytics/i.test(s.src);
            allScripts.set(s.src, {
              src: s.src, isExternal: true, isInline: false, sizeBytes: 0,
              isWordPressBloat: isWpBloat, isJquery: isJq, isJqueryPlugin: isJqPlugin,
              pluginName: isJqPlugin ? s.src.split('/').pop()?.replace(/\.min\.js.*/, '') : undefined,
              isAnalytics, isEssential: isJq || isJqPlugin,
              hasDefer: s.hasDefer, hasAsync: s.hasAsync, pages: [pagePath],
            });
          } else {
            allScripts.get(s.src)!.pages.push(pagePath);
          }
        }

        // Collect stylesheets
        for (const st of pageData.styles) {
          if (!allStylesheets.has(st.href)) {
            allStylesheets.set(st.href, { href: st.href, isExternal: true, sizeBytes: 0, pages: [pagePath] });
          } else {
            allStylesheets.get(st.href)!.pages.push(pagePath);
          }
        }

        // Detect interactive elements
        const interactive = await detectInteractiveElements(page, pagePath);
        allInteractive.push(...interactive);

        log(`Analyzed: ${pagePath} (${pageData.title})`);
      } catch (err) {
        log(`Failed to analyze ${pageUrl}: ${(err as Error).message}`);
      } finally {
        await page.close();
      }
    }

    await homepage.close();
    await context.close();

    // ─── WordPress detection ─────────────────────────────
    const wordpress = detectWordPress(allScripts, allStylesheets);

    // ─── jQuery detection ────────────────────────────────
    const jqueryUsed = [...allScripts.values()].some(s => s.isJquery);
    const jqueryDependentScripts = [...allScripts.values()].filter(s => s.isJqueryPlugin).map(s => s.src);

    // ─── Capture baseline screenshots ────────────────────
    log('Capturing baseline screenshots...');
    const baselineScreenshots = await captureBaselineScreenshots(browser, pages, screenshotsDir, log);

    // ─── Record baseline behavior ────────────────────────
    log('Recording baseline interactive behavior...');
    const baselineBehavior = await recordBaselineBehavior(browser, siteUrl, allInteractive.filter(e => e.type !== 'link').slice(0, 30), log);

    return {
      url: siteUrl,
      pageCount: pages.length,
      totalSizeBytes: totalSize,
      pages,
      scripts: [...allScripts.values()],
      stylesheets: [...allStylesheets.values()],
      images: allImages,
      fonts: allFonts,
      wordpress,
      interactiveElements: allInteractive,
      jqueryUsed,
      jqueryVersion: null,
      jqueryDependentScripts,
      baselineScreenshots,
      baselineBehavior,
    };
  } finally {
    await browser.close();
  }
}

// ─── Interactive Element Detection ────────────────────────────────

async function detectInteractiveElements(page: Page, pagePath: string): Promise<InteractiveElement[]> {
  const elements: InteractiveElement[] = [];

  const detected = await page.evaluate(() => {
    const items: Array<{ type: string; selector: string; description: string; trigger: string; expected: string; jq: boolean }> = [];

    // Dropdowns
    document.querySelectorAll('.menu-item-has-children, .dropdown, .has-submenu').forEach((el, i) => {
      items.push({ type: 'dropdown', selector: getSelector(el), description: `Nav dropdown: ${el.textContent?.trim().substring(0, 40)}`, trigger: 'hover', expected: 'Submenu becomes visible', jq: false });
    });

    // Hamburger menu
    document.querySelectorAll('.hamburger, .mobile-menu-toggle, .menu-toggle, .navbar-toggler, .ast-mobile-menu-trigger, .elementor-menu-toggle').forEach(el => {
      items.push({ type: 'hamburger-menu', selector: getSelector(el), description: 'Mobile hamburger menu', trigger: 'click', expected: 'Mobile menu panel visible', jq: false });
    });

    // Sliders
    document.querySelectorAll('.slick-slider, .owl-carousel, .swiper-container, .swiper, .flexslider').forEach(el => {
      const isSlick = el.classList.contains('slick-slider');
      items.push({ type: 'slider', selector: getSelector(el), description: 'Image/content slider', trigger: 'click', expected: 'Slider advances', jq: isSlick });
    });

    // Accordions
    document.querySelectorAll('.accordion, .faq-item, [data-toggle="collapse"], .elementor-accordion, details').forEach(el => {
      items.push({ type: 'accordion', selector: getSelector(el), description: 'Accordion section', trigger: 'click', expected: 'Content expands', jq: false });
    });

    // Tabs
    document.querySelectorAll('[role="tablist"], .elementor-tabs, .nav-tabs').forEach(el => {
      items.push({ type: 'tab', selector: getSelector(el), description: 'Tab navigation', trigger: 'click', expected: 'Tab content switches', jq: false });
    });

    // Modals
    document.querySelectorAll('[data-toggle="modal"], [data-fancybox], [data-lightbox], .popup-trigger').forEach(el => {
      items.push({ type: 'modal', selector: getSelector(el), description: 'Modal trigger', trigger: 'click', expected: 'Modal overlay appears', jq: false });
    });

    // Forms
    document.querySelectorAll('form:not([action*="search"]):not([role="search"])').forEach(el => {
      const inputs = el.querySelectorAll('input:not([type="hidden"]), textarea, select');
      items.push({ type: 'form', selector: getSelector(el), description: `Form with ${inputs.length} fields`, trigger: 'click', expected: 'Fields interactive', jq: false });
    });

    function getSelector(el: Element): string {
      if (el.id) return `#${el.id}`;
      if (el.className && typeof el.className === 'string') {
        const cls = el.className.trim().split(/\s+/).filter(c => !c.match(/^(active|open|show|hover|focus|current|slick-|swiper-|owl-)/)).slice(0, 3);
        if (cls.length > 0) {
          const sel = `${el.tagName.toLowerCase()}.${cls.join('.')}`;
          if (document.querySelectorAll(sel).length <= 3) return sel;
        }
      }
      return `${el.tagName.toLowerCase()}`;
    }

    return items.slice(0, 50);
  });

  for (const d of detected) {
    elements.push({
      page: pagePath,
      type: d.type as any,
      selector: d.selector,
      description: d.description,
      triggerAction: d.trigger as any,
      expectedBehavior: d.expected,
      dependsOnJquery: d.jq,
      dependsOnScript: null,
    });
  }

  return elements;
}

// ─── WordPress Detection ──────────────────────────────────────────

function detectWordPress(scripts: Map<string, ScriptInventory>, styles: Map<string, StylesheetInventory>): WordPressInfo {
  const allSrcs = [...scripts.keys(), ...styles.keys()].join(' ');
  return {
    version: null,
    theme: null,
    plugins: [],
    isElementor: allSrcs.includes('elementor'),
    isGutenberg: allSrcs.includes('wp-block') || allSrcs.includes('block-library'),
    isWooCommerce: allSrcs.includes('woocommerce'),
  };
}

// ─── Baseline Screenshots ─────────────────────────────────────────

async function captureBaselineScreenshots(
  browser: Browser,
  pages: PageInventory[],
  outputDir: string,
  log: (msg: string) => void
): Promise<BaselineScreenshot[]> {
  const screenshots: BaselineScreenshot[] = [];

  for (const pageInfo of pages.slice(0, 10)) {
    for (const vp of VIEWPORTS) {
      try {
        const context = await browser.newContext({
          userAgent: CHROME_UA,
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.scale,
          ignoreHTTPSErrors: true,
        });
        const page = await context.newPage();
        await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3000);
        await page.waitForTimeout(2000);

        // Scroll down to trigger lazy content then back up
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 300) {
            window.scrollTo(0, y);
            await new Promise(r => setTimeout(r, 100));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(1000);

        const safePath = (pageInfo.path || '/').replace(/\//g, '_') || 'index';
        const fullPagePath = path.join(outputDir, `${safePath}_${vp.name}_full.png`);
        const aboveFoldPath = path.join(outputDir, `${safePath}_${vp.name}_fold.png`);

        await page.screenshot({ path: fullPagePath, fullPage: true, type: 'png' });
        await page.screenshot({ path: aboveFoldPath, fullPage: false, type: 'png' });

        screenshots.push({
          page: pageInfo.path,
          viewport: vp.name,
          width: vp.width,
          height: vp.height,
          fullPagePath,
          aboveFoldPath,
          timestamp: new Date().toISOString(),
        });

        await context.close();
      } catch (err) {
        log(`Screenshot failed for ${pageInfo.path} @ ${vp.name}: ${(err as Error).message}`);
      }
    }
  }

  return screenshots;
}

// ─── Baseline Behavior Recording ──────────────────────────────────

async function recordBaselineBehavior(
  browser: Browser,
  siteUrl: string,
  elements: InteractiveElement[],
  log: (msg: string) => void
): Promise<FunctionalBaseline[]> {
  const baselines: FunctionalBaseline[] = [];
  if (elements.length === 0) return baselines;

  const context = await browser.newContext({
    userAgent: CHROME_UA,
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });

  // Group by page
  const byPage = new Map<string, InteractiveElement[]>();
  for (const el of elements) {
    const group = byPage.get(el.page) || [];
    group.push(el);
    byPage.set(el.page, group);
  }

  for (const [pagePath, pageElements] of byPage) {
    const page = await context.newPage();
    try {
      const pageUrl = new URL(pagePath, siteUrl).href;
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);

      for (const element of pageElements.slice(0, 10)) {
        try {
          const el = await page.$(element.selector);
          if (!el) {
            baselines.push({ ...element, baselineResult: 'element-not-found', passed: false });
            continue;
          }

          const stateBefore = await captureElementState(page, element.selector);

          if (element.triggerAction === 'click') await el.click({ timeout: 3000 }).catch(() => {});
          else if (element.triggerAction === 'hover') await el.hover().catch(() => {});

          await page.waitForTimeout(500);
          const stateAfter = await captureElementState(page, element.selector);

          baselines.push({
            ...element,
            baselineResult: 'recorded',
            stateBefore,
            stateAfter,
            passed: true,
          });

          // Reload to reset state
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(500);
        } catch {
          baselines.push({ ...element, baselineResult: 'interaction-failed', passed: false });
        }
      }
    } catch (err) {
      log(`Baseline recording failed for ${pagePath}: ${(err as Error).message}`);
    } finally {
      await page.close();
    }
  }

  await context.close();
  return baselines;
}

export async function captureElementState(page: Page, selector: string): Promise<ElementState | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return {
      isVisible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && parseFloat(style.opacity) > 0,
      boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      computedStyle: { display: style.display, visibility: style.visibility, opacity: style.opacity, height: style.height },
      classList: Array.from(el.classList),
      innerText: (el as HTMLElement).innerText?.substring(0, 200) || '',
      activeSlideIndex: el.querySelector('.slick-current, .swiper-slide-active, .owl-item.active')
        ? Array.from(el.querySelectorAll('.slick-slide, .swiper-slide, .owl-item')).indexOf(el.querySelector('.slick-current, .swiper-slide-active, .owl-item.active')!)
        : undefined,
    };
  }, selector);
}
