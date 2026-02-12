import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { alertRules, alertLog, type PerformanceComparison } from '../db/schema.js';

// ─── Alert Rule Evaluation ────────────────────────────────────────

interface MetricValues {
  performanceScore: number;
  lcp: number;
  tbt: number;
  cls: number;
  fcp: number;
  si: number;
}

function getMetricValue(metrics: MetricValues, metric: string): number {
  switch (metric) {
    case 'performanceScore': return metrics.performanceScore;
    case 'lcp': return metrics.lcp;
    case 'tbt': return metrics.tbt;
    case 'cls': return metrics.cls;
    case 'fcp': return metrics.fcp;
    case 'si': return metrics.si;
    default: return 0;
  }
}

/**
 * Check all active alert rules for a site against a new comparison result.
 * Triggers notifications for matched rules and logs them.
 */
export async function checkAlertRules(
  siteId: string,
  comparison: PerformanceComparison
): Promise<void> {
  const rules = await db.query.alertRules.findMany({
    where: and(eq(alertRules.siteId, siteId), eq(alertRules.enabled, true)),
  });

  if (rules.length === 0) return;

  const optimizedMetrics: MetricValues = {
    performanceScore: comparison.optimizedPerformanceScore ?? 0,
    lcp: comparison.optimizedLcpMs ?? 0,
    tbt: comparison.optimizedTbtMs ?? 0,
    cls: comparison.optimizedCls ?? 0,
    fcp: comparison.optimizedFcpMs ?? 0,
    si: comparison.optimizedSiMs ?? 0,
  };

  const originalMetrics: MetricValues = {
    performanceScore: comparison.originalPerformanceScore ?? 0,
    lcp: comparison.originalLcpMs ?? 0,
    tbt: comparison.originalTbtMs ?? 0,
    cls: comparison.originalCls ?? 0,
    fcp: comparison.originalFcpMs ?? 0,
    si: comparison.originalSiMs ?? 0,
  };

  const { nanoid } = await import('nanoid');

  for (const rule of rules) {
    const triggered = evaluateRule(rule, optimizedMetrics, originalMetrics);
    if (!triggered) continue;

    const message = formatAlertMessage(rule, optimizedMetrics, originalMetrics, comparison);

    // Log the alert
    await db.insert(alertLog).values({
      id: `alert_${nanoid(12)}`,
      siteId,
      ruleId: rule.id,
      message,
      severity: rule.severity,
      data: {
        metric: rule.metric,
        condition: rule.condition,
        threshold: rule.value,
        currentValue: getMetricValue(optimizedMetrics, rule.metric),
        originalValue: getMetricValue(originalMetrics, rule.metric),
        strategy: comparison.strategy,
      },
    });

    // Update last triggered time
    await db.update(alertRules)
      .set({ lastTriggeredAt: new Date() })
      .where(eq(alertRules.id, rule.id));

    // Send notifications
    const channels = (rule.channels as string[]) || [];
    await Promise.allSettled(
      channels.map(channel => sendNotification(channel, rule, message, comparison))
    );
  }
}

function evaluateRule(
  rule: typeof alertRules.$inferSelect,
  optimized: MetricValues,
  original: MetricValues
): boolean {
  const currentValue = getMetricValue(optimized, rule.metric);
  const originalValue = getMetricValue(original, rule.metric);

  switch (rule.condition) {
    case 'decreases_by': {
      // For score: optimized score dropped by N+ points vs original
      if (rule.metric === 'performanceScore') {
        return (originalValue - currentValue) >= rule.value;
      }
      // For time metrics: increase (regression) by N+ ms
      return (currentValue - originalValue) >= rule.value;
    }
    case 'exceeds_threshold':
      return currentValue > rule.value;
    case 'below_threshold':
      return currentValue < rule.value;
    default:
      return false;
  }
}

function formatAlertMessage(
  rule: typeof alertRules.$inferSelect,
  optimized: MetricValues,
  original: MetricValues,
  comparison: PerformanceComparison
): string {
  const metricNames: Record<string, string> = {
    performanceScore: 'Performance Score',
    lcp: 'LCP',
    tbt: 'TBT',
    cls: 'CLS',
    fcp: 'FCP',
    si: 'Speed Index',
  };

  const metricName = metricNames[rule.metric] || rule.metric;
  const current = getMetricValue(optimized, rule.metric);
  const original_ = getMetricValue(original, rule.metric);

  switch (rule.condition) {
    case 'decreases_by':
      return `${metricName} regression detected on ${comparison.optimizedDomain}: ${original_} → ${current} (${comparison.strategy})`;
    case 'exceeds_threshold':
      return `${metricName} exceeds threshold (${rule.value}): current value is ${current} on ${comparison.optimizedDomain} (${comparison.strategy})`;
    case 'below_threshold':
      return `${metricName} below threshold (${rule.value}): current value is ${current} on ${comparison.optimizedDomain} (${comparison.strategy})`;
    default:
      return `Alert triggered for ${metricName} on ${comparison.optimizedDomain}`;
  }
}

// ─── Notification Channels ────────────────────────────────────────

async function sendNotification(
  channel: string,
  rule: typeof alertRules.$inferSelect,
  message: string,
  comparison: PerformanceComparison
): Promise<void> {
  try {
    switch (channel) {
      case 'webhook':
        await sendWebhook(rule.webhookUrl, message, comparison);
        break;
      case 'slack':
        await sendSlack(rule.slackWebhookUrl, message, comparison);
        break;
      case 'email':
        // Email is a placeholder — log for now
        console.log(`[alert:email] ${message}`);
        break;
      default:
        console.warn(`[alert] Unknown channel: ${channel}`);
    }
  } catch (err) {
    console.error(`[alert:${channel}] Failed to send notification: ${(err as Error).message}`);
  }
}

async function sendWebhook(
  webhookUrl: string | null,
  message: string,
  comparison: PerformanceComparison
): Promise<void> {
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'performance_alert',
      message,
      comparison: {
        siteId: comparison.siteId,
        strategy: comparison.strategy,
        originalDomain: comparison.originalDomain,
        optimizedDomain: comparison.optimizedDomain,
        originalScore: comparison.originalPerformanceScore,
        optimizedScore: comparison.optimizedPerformanceScore,
        scoreImprovement: comparison.scoreImprovement,
        testedAt: comparison.testedAt,
      },
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10000),
  });
}

async function sendSlack(
  webhookUrl: string | null,
  message: string,
  comparison: PerformanceComparison
): Promise<void> {
  if (!webhookUrl) return;

  const scoreEmoji = (comparison.optimizedPerformanceScore ?? 0) >= 90 ? ':white_check_mark:'
    : (comparison.optimizedPerformanceScore ?? 0) >= 50 ? ':warning:'
    : ':red_circle:';

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Performance Alert', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${scoreEmoji} ${message}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Original:* ${comparison.originalDomain}` },
        { type: 'mrkdwn', text: `*Optimized:* ${comparison.optimizedDomain}` },
        { type: 'mrkdwn', text: `*Score:* ${comparison.originalPerformanceScore} → ${comparison.optimizedPerformanceScore}` },
        { type: 'mrkdwn', text: `*Strategy:* ${comparison.strategy}` },
      ],
    },
  ];

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
    signal: AbortSignal.timeout(10000),
  });
}
