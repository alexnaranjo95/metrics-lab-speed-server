import Anthropic from '@anthropic-ai/sdk';
import { Redis } from 'ioredis';
import { config } from '../config.js';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

// ─── Types ────────────────────────────────────────────────────────

export interface AIOptimizeResult {
  optimizedHtml: string;
  changes: Array<{
    type: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  tokenUsage: { input: number; output: number };
}

interface AIOptimizeOptions {
  model: string;
  maxTokens: number;
  features: {
    altText: boolean;
    metaDescriptions: boolean;
    structuredData: boolean;
    accessibilityImprovements: boolean;
    contentOptimization: boolean;
  };
  customInstructions: string;
  pageUrl: string;
}

// ─── Model Mapping ────────────────────────────────────────────────

const MODEL_MAP: Record<string, string> = {
  'claude-3-5-sonnet': 'claude-sonnet-4-20250514',
  'claude-3-opus': 'claude-opus-4-20250514',
  'claude-3-5-haiku': 'claude-haiku-4-20250514',
};

// ─── Cost Calculation ─────────────────────────────────────────────
// Sonnet pricing: $3/MTok input, $15/MTok output
// Opus pricing: $15/MTok input, $75/MTok output
// Haiku pricing: $0.25/MTok input, $1.25/MTok output

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-opus-4-20250514': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  'claude-haiku-4-20250514': { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model] || PRICING['claude-sonnet-4-20250514'];
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

// ─── Redis Usage Tracking ─────────────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {}),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    _redis.connect().catch(() => {});
  }
  return _redis;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function trackTokenUsage(inputTokens: number, outputTokens: number): Promise<void> {
  try {
    const redis = getRedis();
    const month = currentMonthKey();
    await redis.incrby(`ai:usage:${month}:input`, inputTokens);
    await redis.incrby(`ai:usage:${month}:output`, outputTokens);
    // Expire after 90 days
    await redis.expire(`ai:usage:${month}:input`, 90 * 86400);
    await redis.expire(`ai:usage:${month}:output`, 90 * 86400);
  } catch {
    // Non-fatal
  }
}

export async function getMonthlyUsage(): Promise<{ inputTokens: number; outputTokens: number; estimatedCost: number }> {
  try {
    const redis = getRedis();
    const month = currentMonthKey();
    const [input, output] = await Promise.all([
      redis.get(`ai:usage:${month}:input`),
      redis.get(`ai:usage:${month}:output`),
    ]);
    const inputTokens = parseInt(input || '0', 10);
    const outputTokens = parseInt(output || '0', 10);
    // Default to Sonnet pricing for monthly cost estimate
    const estimatedCost = calculateCost('claude-sonnet-4-20250514', inputTokens, outputTokens);
    return { inputTokens, outputTokens, estimatedCost };
  } catch {
    return { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
  }
}

// ─── System Prompt ────────────────────────────────────────────────

function buildSystemPrompt(options: AIOptimizeOptions): string {
  const featureInstructions: string[] = [];

  if (options.features.altText) {
    featureInstructions.push('- Generate descriptive alt text for <img> tags that have empty or missing alt attributes. Describe what the image likely shows based on filename, context, and surrounding text.');
  }
  if (options.features.metaDescriptions) {
    featureInstructions.push('- If the page is missing a <meta name="description"> tag, or it has a generic/empty one, generate a compelling meta description (120-155 characters) based on the page content.');
  }
  if (options.features.structuredData) {
    featureInstructions.push('- Add a JSON-LD structured data block (<script type="application/ld+json">) if none exists. Infer the page type (Article, WebPage, LocalBusiness, etc.) from content.');
  }
  if (options.features.accessibilityImprovements) {
    featureInstructions.push('- Improve semantic HTML: replace div-based navigation with <nav>, add ARIA labels to interactive elements, ensure heading hierarchy is correct (h1 → h2 → h3).');
  }

  const customPart = options.customInstructions
    ? `\n\nAdditional instructions from the site owner:\n${options.customInstructions}`
    : '';

  return `You are a web performance optimization expert. You receive an HTML page and return an optimized version focused STRICTLY on loading performance and Core Web Vitals.

ABSOLUTE RULES — NEVER VIOLATE THESE:
1. NEVER change visible text content, images, layout, or design
2. NEVER remove CSS classes that affect layout (especially WordPress theme classes like ast-*, elementor-*, wp-*, custom-logo, site-header, etc.)
3. NEVER break JavaScript functionality
4. NEVER add new visible UI elements
5. NEVER change URLs, links, or navigation
6. Keep the HTML structure intact — only modify attributes, add resource hints, and restructure loading order

YOUR OPTIMIZATION TASKS (in priority order):

HIGH IMPACT — Always do:
- Identify the likely LCP (Largest Contentful Paint) element and add <link rel="preload"> for it in <head>
- Ensure the LCP image has fetchpriority="high" and loading="eager"
- Add loading="lazy" and decoding="async" to non-LCP images that lack them
- Add width and height attributes to <img> tags missing them (estimate from context/filename if needed)
- Add defer attribute to <script> tags that don't have defer or async
- Ensure all @font-face rules have font-display: swap (or optional)
- Remove unnecessary tags: <meta name="generator">, <link rel="pingback">, <link rel="wlwmanifest">, <link rel="EditURI">

MEDIUM IMPACT — Do if applicable:
${featureInstructions.length > 0 ? featureInstructions.join('\n') : '- No additional features enabled.'}
${customPart}

RESPONSE FORMAT — You MUST return ONLY valid JSON, nothing else:
{
  "optimizedHtml": "<!DOCTYPE html>...(the full optimized HTML)...",
  "changes": [
    { "type": "lcp", "description": "Added preload for /hero.webp", "impact": "high" },
    { "type": "images", "description": "Added lazy loading to 5 images", "impact": "high" }
  ]
}

IMPORTANT: The "optimizedHtml" field must contain the COMPLETE HTML document. Do not truncate or summarize it.`;
}

// ─── Main Optimize Function ───────────────────────────────────────

export async function aiOptimizePage(
  html: string,
  options: AIOptimizeOptions
): Promise<AIOptimizeResult> {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const resolvedModel = MODEL_MAP[options.model] || 'claude-sonnet-4-20250514';
  const systemPrompt = buildSystemPrompt(options);

  const response = await client.messages.create({
    model: resolvedModel,
    max_tokens: options.maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Optimize this HTML page (URL: ${options.pageUrl}):\n\n${html}`,
      },
    ],
  });

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;

  // Extract text content from response
  const textBlock = response.content.find((b: any) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return {
      optimizedHtml: html,
      changes: [],
      tokenUsage: { input: inputTokens, output: outputTokens },
    };
  }

  // Parse JSON response
  let parsed: any;
  try {
    // Claude sometimes wraps JSON in markdown code blocks
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    console.warn('[ai] Failed to parse Claude response as JSON — using original HTML');
    return {
      optimizedHtml: html,
      changes: [],
      tokenUsage: { input: inputTokens, output: outputTokens },
    };
  }

  if (!parsed.optimizedHtml || typeof parsed.optimizedHtml !== 'string') {
    console.warn('[ai] Claude response missing optimizedHtml field — using original HTML');
    return {
      optimizedHtml: html,
      changes: parsed.changes || [],
      tokenUsage: { input: inputTokens, output: outputTokens },
    };
  }

  // Safety check: reject if size changed too drastically
  const sizeDiff = Math.abs(parsed.optimizedHtml.length - html.length) / html.length;
  if (sizeDiff > 0.5) {
    console.warn(`[ai] Rejecting AI output — size differs by ${(sizeDiff * 100).toFixed(0)}% (safety threshold: 50%)`);
    return {
      optimizedHtml: html,
      changes: [],
      tokenUsage: { input: inputTokens, output: outputTokens },
    };
  }

  return {
    optimizedHtml: parsed.optimizedHtml,
    changes: parsed.changes || [],
    tokenUsage: { input: inputTokens, output: outputTokens },
  };
}

// ─── Check if AI is available ─────────────────────────────────────

export function isAIAvailable(): boolean {
  return !!config.ANTHROPIC_API_KEY;
}
