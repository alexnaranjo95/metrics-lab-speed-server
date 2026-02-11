import { SettingField, SettingCard, Toggle, Select, Slider } from '../SettingField';

interface Props {
  settings: { ai: any; build: any };
  defaults: { ai: any; build: any };
  diff: { ai: any; build: any };
  onChange: (section: 'ai' | 'build', partial: any) => void;
}

export function AiBuildTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="AI Optimization" description="AI-powered content optimization using Anthropic's Claude API">
        <SettingField label="Enable AI Optimization" description="Requires Claude API key" isOverridden={diff?.ai?.enabled}>
          <Toggle checked={settings.ai.enabled} onChange={(v) => onChange('ai', { enabled: v })} />
        </SettingField>
        <SettingField label="Model" description="Sonnet = fast/cheap. Opus = highest quality (~10x cost)." isOverridden={diff?.ai?.model}>
          <Select
            value={settings.ai.model}
            options={[
              { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet (recommended)' },
              { value: 'claude-3-opus', label: 'Claude 3 Opus (highest quality)' },
              { value: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku (cheapest)' },
            ]}
            onChange={(v) => onChange('ai', { model: v })}
          />
        </SettingField>
      </SettingCard>

      <SettingCard title="Cost Controls">
        <SettingField label="Per-Build Token Budget" isOverridden={diff?.ai?.perBuildTokenBudget}>
          <input
            type="number"
            value={settings.ai.perBuildTokenBudget}
            onChange={(e) => onChange('ai', { perBuildTokenBudget: Number(e.target.value) })}
            className="h-8 w-32 px-2 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
          />
        </SettingField>
        <SettingField label="Per-Page Token Limit" isOverridden={diff?.ai?.perPageTokenLimit}>
          <input
            type="number"
            value={settings.ai.perPageTokenLimit}
            onChange={(e) => onChange('ai', { perPageTokenLimit: Number(e.target.value) })}
            className="h-8 w-32 px-2 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
          />
        </SettingField>
        <SettingField label="Monthly Cost Cap ($)" isOverridden={diff?.ai?.monthlyCostCap}>
          <input
            type="number"
            value={settings.ai.monthlyCostCap}
            onChange={(e) => onChange('ai', { monthlyCostCap: Number(e.target.value) })}
            className="h-8 w-32 px-2 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
          />
        </SettingField>
        <SettingField label="Auto-Pause on Budget" isOverridden={diff?.ai?.autoPauseOnBudget}>
          <Toggle checked={settings.ai.autoPauseOnBudget} onChange={(v) => onChange('ai', { autoPauseOnBudget: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="AI Features" description="Enable individual AI-powered optimizations">
        <SettingField label="Alt Text Generation" description="Generate alt text for images missing it" isOverridden={diff?.ai?.features?.altText}>
          <Toggle checked={settings.ai.features.altText} onChange={(v) => onChange('ai', { features: { altText: v } })} />
        </SettingField>
        <SettingField label="Meta Descriptions" description="Generate/improve page meta descriptions" isOverridden={diff?.ai?.features?.metaDescriptions}>
          <Toggle checked={settings.ai.features.metaDescriptions} onChange={(v) => onChange('ai', { features: { metaDescriptions: v } })} />
        </SettingField>
        <SettingField label="Structured Data (JSON-LD)" description="Create schema.org structured data" isOverridden={diff?.ai?.features?.structuredData}>
          <Toggle checked={settings.ai.features.structuredData} onChange={(v) => onChange('ai', { features: { structuredData: v } })} />
        </SettingField>
        <SettingField label="Accessibility Improvements" description="Add ARIA labels and semantic HTML" isOverridden={diff?.ai?.features?.accessibilityImprovements}>
          <Toggle checked={settings.ai.features.accessibilityImprovements} onChange={(v) => onChange('ai', { features: { accessibilityImprovements: v } })} />
        </SettingField>
        <SettingField label="Content Optimization" description="Suggest content improvements for SEO" isOverridden={diff?.ai?.features?.contentOptimization}>
          <Toggle checked={settings.ai.features.contentOptimization} onChange={(v) => onChange('ai', { features: { contentOptimization: v } })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Custom Instructions" description="Appended to the AI system prompt for all operations">
        <div className="pt-2">
          <textarea
            value={settings.ai.customInstructions}
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
            value={settings.build.scheduleMode}
            options={[
              { value: 'manual', label: 'Manual trigger only' },
              { value: 'cron', label: 'Cron schedule' },
              { value: 'webhook', label: 'Webhook trigger' },
              { value: 'api', label: 'API trigger' },
            ]}
            onChange={(v) => onChange('build', { scheduleMode: v })}
          />
        </SettingField>
        {settings.build.scheduleMode === 'cron' && (
          <SettingField label="Cron Pattern" description="e.g., '0 3 * * *' for daily at 3 AM" isOverridden={diff?.build?.cronPattern}>
            <input
              type="text"
              value={settings.build.cronPattern}
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
            value={settings.build.scope}
            options={[
              { value: 'full', label: 'Full (all pages)' },
              { value: 'homepage', label: 'Homepage only' },
              { value: 'custom', label: 'Custom URL list' },
            ]}
            onChange={(v) => onChange('build', { scope: v })}
          />
        </SettingField>
        <SettingField label="Max Pages" description="Maximum pages to crawl per build" isOverridden={diff?.build?.maxPages}>
          <Slider value={settings.build.maxPages} min={1} max={500} step={10} onChange={(v) => onChange('build', { maxPages: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Build Configuration">
        <SettingField label="Page Load Timeout (seconds)" isOverridden={diff?.build?.pageLoadTimeout}>
          <Slider value={settings.build.pageLoadTimeout} min={10} max={120} onChange={(v) => onChange('build', { pageLoadTimeout: v })} />
        </SettingField>
        <SettingField label="Pipeline Timeout (minutes)" description="Max total build time before abort" isOverridden={diff?.build?.pipelineTimeout}>
          <Slider value={settings.build.pipelineTimeout} min={5} max={60} onChange={(v) => onChange('build', { pipelineTimeout: v })} />
        </SettingField>
        <SettingField label="Max Retries" isOverridden={diff?.build?.maxRetries}>
          <Slider value={settings.build.maxRetries} min={0} max={10} onChange={(v) => onChange('build', { maxRetries: v })} />
        </SettingField>
        <SettingField label="Max Concurrent Pages" isOverridden={diff?.build?.maxConcurrentPages}>
          <Slider value={settings.build.maxConcurrentPages} min={1} max={10} onChange={(v) => onChange('build', { maxConcurrentPages: v })} />
        </SettingField>
        <SettingField label="Auto-Deploy on Success" description="Automatically deploy to Cloudflare Pages when build succeeds" isOverridden={diff?.build?.autoDeployOnSuccess}>
          <Toggle checked={settings.build.autoDeployOnSuccess} onChange={(v) => onChange('build', { autoDeployOnSuccess: v })} />
        </SettingField>
      </SettingCard>
    </div>
  );
}
