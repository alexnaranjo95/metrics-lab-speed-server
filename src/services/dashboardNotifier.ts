import { config } from '../config.js';
import { signPayload } from '../utils/crypto.js';
import type { Site, Build } from '../db/schema.js';

/**
 * Send a webhook notification to the dashboard (app.metricslab.io)
 * at each build phase transition.
 */
export async function notifyDashboard(
  site: Site,
  build: Build,
  status: string
): Promise<void> {
  if (!config.DASHBOARD_WEBHOOK_URL) {
    // Dashboard URL not configured — skip notification (OK for local dev)
    return;
  }

  const payload = JSON.stringify({
    site_id: site.id,
    build_id: build.id,
    status,
    pages_processed: build.pagesProcessed ?? 0,
    pages_total: build.pagesTotal ?? 0,
    total_size_bytes: build.optimizedSizeBytes ?? 0,
    build_duration_seconds: build.startedAt
      ? Math.round((Date.now() - new Date(build.startedAt).getTime()) / 1000)
      : 0,
    optimization_stats: {
      js_reduction_bytes: (build.jsOriginalBytes ?? 0) - (build.jsOptimizedBytes ?? 0),
      css_reduction_bytes: (build.cssOriginalBytes ?? 0) - (build.cssOptimizedBytes ?? 0),
      image_reduction_bytes: (build.imageOriginalBytes ?? 0) - (build.imageOptimizedBytes ?? 0),
      facades_applied: build.facadesApplied ?? 0,
    },
    error: build.errorMessage ?? null,
    lighthouse_score: build.lighthouseScoreAfter ?? null,
    ttfb_ms: build.ttfbAfter ?? null,
    edge_url: site.edgeUrl ?? null,
  });

  const signature = signPayload(payload, site.webhookSecret);

  try {
    const response = await fetch(config.DASHBOARD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`Dashboard notification failed: ${response.status} ${response.statusText}`);
    }
  } catch (error: any) {
    // Don't fail the build if dashboard notification fails
    console.error('Dashboard notification error:', error.message);
  }
}
