import { claudeJSON } from './claude.js';
import type { SiteInventory, OptimizationPlan } from './types.js';
import type { OptimizationWorkflow } from '../services/pagespeed/types.js';

export async function generateOptimizationPlan(
  inventory: SiteInventory,
  log: (msg: string) => void,
  pageSpeedData?: OptimizationWorkflow | null
): Promise<OptimizationPlan> {
  const systemPrompt = `You are an expert web performance optimization engineer. You are analyzing a WordPress website that will be converted to a high-performance static site deployed on Cloudflare Pages.

Generate an optimization settings configuration that maximizes Lighthouse performance while ensuring ZERO visual or functional regressions.

CRITICAL RULES:
1. NEVER remove a script that an interactive element depends on. If a slider uses Slick (jQuery-dependent), keep jQuery AND Slick.
2. NEVER enable aggressive CSS purging if the site uses Elementor, Beaver Builder, or Divi — their dynamic classes will be purged incorrectly. Use "safe" aggressiveness.
3. NEVER remove dashicons if ANY page uses dashicons classes.
4. NEVER remove Gutenberg frontend JS if the site has interactive Gutenberg blocks.
5. ALWAYS self-host Google Fonts — free performance win with zero risk.
6. For image quality, prefer quality 80 for WebP (visually indistinguishable).
7. PurgeCSS aggressiveness must be "safe" for any site using a page builder.
8. If jQuery is used by interactive elements, NEVER remove jQuery.

Return ONLY valid JSON with this structure:
{
  "settings": { /* complete optimization settings object */ },
  "reasoning": { "images": "...", "css": "...", "js": "...", "html": "...", "fonts": "...", "video": "..." },
  "risks": ["list of things that might break"],
  "expectedPerformance": { "lighthouse": 90, "lcp": "1500ms", "cls": "0.05" }
}

The settings object should match this shape (only include categories you want to change from defaults):
{
  "images": { "enabled": true, "webp": { "quality": 80 }, ... },
  "css": { "enabled": true, "purge": true, "purgeAggressiveness": "safe", ... },
  "js": { "enabled": true, "removeScripts": { "wpEmoji": true, ... }, "removeJquery": false, ... },
  "html": { "enabled": true, ... },
  "fonts": { "enabled": true, "selfHostGoogleFonts": true, ... },
  "video": { "facadesEnabled": true, ... },
  "cache": { "enabled": true, ... },
  "resourceHints": { "enabled": true, ... }
}`;

  const interactive = inventory.interactiveElements.filter(e => e.type !== 'link');

  let pageSpeedSection = '';
  if (pageSpeedData) {
    const { scores, coreWebVitals, opportunities, accessibilityIssues, seoIssues, optimizationPlan } = pageSpeedData;
    pageSpeedSection = `

PAGESPEED INSIGHTS (Live URL - Mobile):
Scores: Performance ${scores.performance}, Accessibility ${scores.accessibility}, Best Practices ${scores.bestPractices}, SEO ${scores.seo}
Core Web Vitals: LCP ${coreWebVitals.lcp.displayValue ?? coreWebVitals.lcp.numericValue ?? 'N/A'}, TBT ${coreWebVitals.tbt.displayValue ?? coreWebVitals.tbt.numericValue ?? 'N/A'}, CLS ${coreWebVitals.cls.displayValue ?? coreWebVitals.cls.numericValue ?? 'N/A'}

FAILING AUDITS / OPPORTUNITIES (address these in settings):
${opportunities.slice(0, 8).map(o => `- [${o.id}] ${o.title} (score: ${o.score}) → Actions: ${o.aiActions.join(', ')}`).join('\n')}
${accessibilityIssues.slice(0, 5).map(a => `- [a11y] ${a.id}: ${a.title} → ${a.aiActions.join(', ')}`).join('\n')}
${seoIssues.slice(0, 3).map(s => `- [seo] ${s.id}: ${s.title} → ${s.aiActions.join(', ')}`).join('\n')}

AI OPTIMIZATION PLAN (prioritize in this order):
${optimizationPlan.slice(0, 10).map((a, i) => `  ${i + 1}. [${a.category}] ${a.action} (impact: ${a.estimatedImpact}) → ${a.codeChanges.join(', ')}`).join('\n')}
`;
  }

  const userContent = `SITE: ${inventory.url}
Pages: ${inventory.pageCount}
Total size: ${inventory.totalSizeBytes} bytes

WORDPRESS:
- Elementor: ${inventory.wordpress.isElementor}
- Gutenberg: ${inventory.wordpress.isGutenberg}
- WooCommerce: ${inventory.wordpress.isWooCommerce}

SCRIPTS (${inventory.scripts.length}):
${inventory.scripts.map(s => `- ${s.src.split('/').pop()} [bloat:${s.isWordPressBloat}, jquery:${s.isJquery}, plugin:${s.isJqueryPlugin}, analytics:${s.isAnalytics}, defer:${s.hasDefer}]`).join('\n')}

INTERACTIVE ELEMENTS (${interactive.length}):
${interactive.map(e => `- [${e.page}] ${e.type}: ${e.description} (trigger: ${e.triggerAction}, jQuery: ${e.dependsOnJquery})`).join('\n')}

JQUERY: ${inventory.jqueryUsed ? `USED by: ${inventory.jqueryDependentScripts.join(', ')}. DO NOT remove jQuery.` : 'Not detected. jQuery removal MAY be safe.'}
${pageSpeedSection}

PAGES WITH FEATURES:
${inventory.pages.map(p => `- ${p.path}: slider=${p.hasSlider}, accordion=${p.hasAccordion}, tabs=${p.hasTabs}, modal=${p.hasModal}, dropdown=${p.hasDropdownMenu}, form=${p.hasForm}, video=${p.hasVideo}`).join('\n')}

Generate the complete optimization settings with full reasoning.`;

  log('Sending site inventory to Claude Opus 4 for analysis...');

  const { data } = await claudeJSON<OptimizationPlan>(systemPrompt, userContent);

  log(`AI plan generated. Expected Lighthouse: ${data.expectedPerformance?.lighthouse || 'N/A'}`);
  if (data.reasoning) {
    for (const [section, reason] of Object.entries(data.reasoning)) {
      log(`  [${section}] ${reason}`);
    }
  }
  if (data.risks?.length > 0) {
    log(`Identified ${data.risks.length} risks: ${data.risks.join('; ')}`);
  }

  return data;
}
