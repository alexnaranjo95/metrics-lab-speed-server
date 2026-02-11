import fs from 'fs';
import { claudeJSON } from './claude.js';
import type { IterationResult, AIReviewDecision, SiteInventory, VisualComparisonResult } from './types.js';
import { aiVisualReview } from '../verification/visual.js';

export async function aiReviewAndAdjust(
  current: IterationResult,
  previousIterations: IterationResult[],
  inventory: SiteInventory,
  log: (msg: string) => void
): Promise<AIReviewDecision> {

  // Get AI visual reviews for problem pages
  const problemVisuals = current.visualComparisons.filter(v => v.status === 'needs-review' || v.status === 'failed');
  const visualReviews: any[] = [];

  for (const visual of problemVisuals.slice(0, 5)) {
    log(`AI reviewing visual diff for ${visual.page} @ ${visual.viewport}...`);
    const review = await aiVisualReview(visual, current.settings, log);
    visualReviews.push({ page: visual.page, viewport: visual.viewport, ...review });
  }

  const failedTests = current.functionalTests.filter(t => !t.passed);
  const brokenLinks = current.linkVerification.filter(l => !l.passed);
  const avgPerf = current.performance.length > 0
    ? current.performance.reduce((s, p) => s + p.performance, 0) / current.performance.length
    : 0;
  const worstPerf = current.performance.length > 0
    ? Math.min(...current.performance.map(p => p.performance))
    : 0;

  const systemPrompt = `You are the final QA reviewer for a WordPress-to-static-site optimization. You have complete authority to adjust any optimization setting. Your goal:
1. ZERO visual differences (<2% pixel diff on every page at every viewport)
2. ZERO functional regressions (every interactive element works)
3. ZERO broken internal links
4. Performance score >= 85 on every page

You are reviewing iteration ${current.iteration}.

${previousIterations.length > 0 ? `PREVIOUS ITERATIONS:
${previousIterations.map(prev => {
  const prevAvg = prev.performance.length > 0 ? prev.performance.reduce((s, p) => s + p.performance, 0) / prev.performance.length : 0;
  return `Iteration ${prev.iteration}: Avg perf ${prevAvg.toFixed(0)}, Visual fails ${prev.visualComparisons.filter(v => v.status === 'failed' || v.status === 'needs-review').length}, Functional fails ${prev.functionalTests.filter(t => !t.passed).length}`;
}).join('\n')}

IMPORTANT: Do NOT repeat the same setting change if it didn't fix the issue. Try a different approach.` : ''}

Return JSON:
{
  "overallVerdict": "pass" | "needs-changes" | "critical-failure",
  "settingChanges": { "css": { "purgeSafelist": { "standard": ["hero", "slider"] } }, ... },
  "reasoning": "Why these changes will fix the issues",
  "issuesSummary": ["Brief description of each issue"],
  "remainingIssues": ["Issues that still need fixing"],
  "shouldRebuild": true,
  "confidenceLevel": 85
}`;

  const userContent = `CURRENT SETTINGS:
${JSON.stringify(current.settings, null, 2).substring(0, 5000)}

PERFORMANCE:
${current.performance.map(p => `${p.page}: Score ${p.performance}, TTFB ${p.ttfb}ms`).join('\n')}
Average: ${avgPerf.toFixed(0)}, Worst: ${worstPerf}

VISUAL COMPARISON:
${current.visualComparisons.map(v => `${v.page} @ ${v.viewport}: ${v.diffPercent.toFixed(2)}% diff -> ${v.status}`).join('\n')}

AI VISUAL REVIEWS:
${visualReviews.map(r => JSON.stringify(r)).join('\n')}

FUNCTIONAL TESTS:
Passed: ${current.functionalTests.filter(t => t.passed).length}
Failed: ${failedTests.length}
${failedTests.map(t => `FAIL: [${t.element.type}] ${t.element.description} on ${t.element.page} - ${t.failureReason}`).join('\n')}

BROKEN LINKS: ${brokenLinks.length}
${brokenLinks.slice(0, 10).map(l => `${l.page}: ${l.href} -> ${l.failureReason}`).join('\n')}

INTERACTIVE ELEMENTS THAT DEPEND ON JQUERY:
${inventory.jqueryDependentScripts.join(', ') || 'None'}

What settings should change to fix ALL issues?`;

  try {
    const { data } = await claudeJSON<AIReviewDecision>(systemPrompt, userContent, 8000);

    log(`AI verdict: ${data.overallVerdict} (confidence: ${data.confidenceLevel}%)`);
    log(`Reasoning: ${data.reasoning}`);
    if (data.issuesSummary?.length > 0) {
      data.issuesSummary.forEach(issue => log(`  Issue: ${issue}`));
    }

    return data;
  } catch (err) {
    log(`AI review failed: ${(err as Error).message}`);
    return {
      overallVerdict: 'critical-failure',
      settingChanges: {},
      reasoning: `AI review error: ${(err as Error).message}`,
      issuesSummary: ['AI review failed'],
      remainingIssues: ['AI review failed'],
      shouldRebuild: false,
      confidenceLevel: 0,
    };
  }
}
