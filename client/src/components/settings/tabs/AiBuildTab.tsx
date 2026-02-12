import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SettingField, SettingCard, Toggle, Select, Slider } from '../SettingField';

interface Props {
  settings: { ai: any; build: any };
  defaults: { ai: any; build: any };
  diff: { ai: any; build: any };
  onChange: (section: 'ai' | 'build', partial: any) => void;
}

export function AiBuildTab({ settings, defaults, diff, onChange }: Props) {
  const { data: aiUsage } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => api.getAIUsage(),
    enabled: !!localStorage.getItem('apiKey'),
  });

  return (
    <div>
      {/* AI Status Banner */}
      {aiUsage && (
        <div className={cn(
          'rounded-lg p-4 mb-4 border',
          aiUsage.available
            ? 'bg-[hsl(var(--success))]/5 border-[hsl(var(--success))]/20'
            : 'bg-[hsl(var(--muted))]/30 border-[hsl(var(--border))]'
        )}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={cn('w-2.5 h-2.5 rounded-full', aiUsage.available ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--muted-foreground))]')} />
              <span className="text-sm font-medium">
                {aiUsage.available ? 'Claude Opus 4.6 Connected' : 'Claude API Not Configured'}
              </span>
            </div>
            {!aiUsage.available && (
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                Set ANTHROPIC_API_KEY in Coolify environment variables
              </span>
            )}
          </div>
          {aiUsage.available && aiUsage.estimatedCost > 0 && (
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              Monthly usage: ${aiUsage.estimatedCost.toFixed(2)} ({aiUsage.inputTokens?.toLocaleString() || 0} input + {aiUsage.outputTokens?.toLocaleString() || 0} output tokens) -- {aiUsage.currentMonth}
            </div>
          )}
        </div>
      )}

      <SettingCard title="AI Optimization" description="Claude Opus 4.6 autonomous optimization agent. Use the 'AI Optimize' button on the site page to start.">
        <SettingField label="Enable AI Features" description="Controls whether AI features (alt text, meta descriptions, etc.) are included during agent runs" isOverridden={diff?.ai?.enabled}>
          <Toggle checked={settings.ai?.enabled ?? false} onChange={(v) => onChange('ai', { enabled: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="AI Features" description="Enable individual AI-powered optimizations during agent runs">
        <SettingField label="Alt Text Generation" description="Generate alt text for images missing it" isOverridden={diff?.ai?.features?.altText}>
          <Toggle checked={settings.ai?.features?.altText ?? false} onChange={(v) => onChange('ai', { features: { altText: v } })} />
        </SettingField>
        <SettingField label="Meta Descriptions" description="Generate/improve page meta descriptions" isOverridden={diff?.ai?.features?.metaDescriptions}>
          <Toggle checked={settings.ai?.features?.metaDescriptions ?? false} onChange={(v) => onChange('ai', { features: { metaDescriptions: v } })} />
        </SettingField>
        <SettingField label="Structured Data (JSON-LD)" description="Create schema.org structured data" isOverridden={diff?.ai?.features?.structuredData}>
          <Toggle checked={settings.ai?.features?.structuredData ?? false} onChange={(v) => onChange('ai', { features: { structuredData: v } })} />
        </SettingField>
        <SettingField label="Accessibility Improvements" description="Add ARIA labels and semantic HTML" isOverridden={diff?.ai?.features?.accessibilityImprovements}>
          <Toggle checked={settings.ai?.features?.accessibilityImprovements ?? false} onChange={(v) => onChange('ai', { features: { accessibilityImprovements: v } })} />
        </SettingField>
        <SettingField label="Content Optimization" description="Suggest content improvements for SEO" isOverridden={diff?.ai?.features?.contentOptimization}>
          <Toggle checked={settings.ai?.features?.contentOptimization ?? false} onChange={(v) => onChange('ai', { features: { contentOptimization: v } })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Custom Instructions" description="Appended to the AI system prompt for all operations">
        <div className="pt-2">
          <textarea
            value={settings.ai?.customInstructions ?? ''}
            onChange={(e) => onChange('ai', { customInstructions: e.target.value })}
            placeholder="e.g., Maintain brand voice. Optimize for local SEO in San Francisco."
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] placeholder:text-[hsl(var(--muted-foreground))]"
          />
        </div>
      </SettingCard>

      <SettingCard title="Build Schedule">
        <SettingField label="Schedule Mode" isOverridden={diff?.build?.scheduleMode}>
          <Select
            value={settings.build?.scheduleMode ?? 'manual'}
            options={[
              { value: 'manual', label: 'Manual trigger only' },
              { value: 'cron', label: 'Cron schedule' },
              { value: 'webhook', label: 'Webhook trigger' },
              { value: 'api', label: 'API trigger' },
            ]}
            onChange={(v) => onChange('build', { scheduleMode: v })}
          />
        </SettingField>
        {settings.build?.scheduleMode === 'cron' && (
          <SettingField label="Cron Pattern" description="e.g., '0 3 * * *' for daily at 3 AM" isOverridden={diff?.build?.cronPattern}>
            <input
              type="text"
              value={settings.build?.cronPattern ?? ''}
              onChange={(e) => onChange('build', { cronPattern: e.target.value })}
              placeholder="0 3 * * *"
              className="h-8 w-40 px-2 text-sm font-mono rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
            />
          </SettingField>
        )}
      </SettingCard>

      <SettingCard title="Build Scope">
        <SettingField label="Default Scope" isOverridden={diff?.build?.scope}>
          <Select
            value={settings.build?.scope ?? 'full'}
            options={[
              { value: 'full', label: 'Full (all pages)' },
              { value: 'homepage', label: 'Homepage only' },
              { value: 'custom', label: 'Custom URL list' },
            ]}
            onChange={(v) => onChange('build', { scope: v })}
          />
        </SettingField>
        <SettingField label="Max Pages" description="Maximum pages to crawl per build" isOverridden={diff?.build?.maxPages}>
          <Slider value={settings.build?.maxPages ?? 100} min={1} max={500} step={10} onChange={(v) => onChange('build', { maxPages: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Build Configuration">
        <SettingField label="Page Load Timeout (seconds)" isOverridden={diff?.build?.pageLoadTimeout}>
          <Slider value={settings.build?.pageLoadTimeout ?? 30} min={10} max={120} onChange={(v) => onChange('build', { pageLoadTimeout: v })} />
        </SettingField>
        <SettingField label="Pipeline Timeout (minutes)" description="Max total build time before abort" isOverridden={diff?.build?.pipelineTimeout}>
          <Slider value={settings.build?.pipelineTimeout ?? 15} min={5} max={60} onChange={(v) => onChange('build', { pipelineTimeout: v })} />
        </SettingField>
        <SettingField label="Max Retries" isOverridden={diff?.build?.maxRetries}>
          <Slider value={settings.build?.maxRetries ?? 3} min={0} max={10} onChange={(v) => onChange('build', { maxRetries: v })} />
        </SettingField>
        <SettingField label="Max Concurrent Pages" isOverridden={diff?.build?.maxConcurrentPages}>
          <Slider value={settings.build?.maxConcurrentPages ?? 3} min={1} max={10} onChange={(v) => onChange('build', { maxConcurrentPages: v })} />
        </SettingField>
        <SettingField label="Auto-Deploy on Success" description="Automatically deploy to Cloudflare Pages when build succeeds" isOverridden={diff?.build?.autoDeployOnSuccess}>
          <Toggle checked={settings.build?.autoDeployOnSuccess ?? true} onChange={(v) => onChange('build', { autoDeployOnSuccess: v })} />
        </SettingField>
      </SettingCard>
    </div>
  );
}
