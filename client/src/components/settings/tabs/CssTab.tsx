import { SettingField, SettingCard, Toggle, Select } from '../SettingField';

interface Props { settings: any; defaults: any; diff: any; onChange: (partial: any) => void; }

export function CssTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="PurgeCSS" description="Remove unused CSS selectors. The most impactful CSS optimization.">
        <SettingField label="Enable PurgeCSS" isOverridden={diff?.purge}>
          <Toggle checked={settings.purge} onChange={(v) => onChange({ purge: v })} />
        </SettingField>
        <SettingField label="Test Mode" description="Show removed selectors without committing changes" isOverridden={diff?.purgeTestMode}>
          <Toggle checked={settings.purgeTestMode} onChange={(v) => onChange({ purgeTestMode: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Critical CSS" description="Extract above-the-fold CSS and inline it for faster first paint">
        <SettingField label="Enable Critical CSS" isOverridden={diff?.critical}>
          <Toggle checked={settings.critical} onChange={(v) => onChange({ critical: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Minification">
        <SettingField label="cssnano Preset" description="Default is safe. Advanced can break JS references to keyframes." isOverridden={diff?.minifyPreset}>
          <Select
            value={settings.minifyPreset}
            options={[
              { value: 'default', label: 'Default (safe)' },
              { value: 'advanced', label: 'Advanced (risky)' },
              { value: 'lite', label: 'Lite (minimal)' },
            ]}
            onChange={(v) => onChange({ minifyPreset: v })}
          />
        </SettingField>
        {settings.minifyPreset === 'advanced' && (
          <div className="px-3 py-2 text-xs text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 rounded-md mt-2">
            Warning: Advanced preset may break JS references to keyframe names and stacking contexts.
          </div>
        )}
      </SettingCard>

      <SettingCard title="Font Display" description="Controls how fonts render before they finish loading">
        <SettingField label="font-display Strategy" isOverridden={diff?.fontDisplay}>
          <Select
            value={settings.fontDisplay}
            options={[
              { value: 'swap', label: 'swap (show fallback, swap when loaded)' },
              { value: 'optional', label: 'optional (best perf, may skip font)' },
              { value: 'fallback', label: 'fallback (3s swap window)' },
              { value: 'block', label: 'block (icon fonts only)' },
            ]}
            onChange={(v) => onChange({ fontDisplay: v })}
          />
        </SettingField>
      </SettingCard>
    </div>
  );
}
