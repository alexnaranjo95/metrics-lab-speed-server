import { SettingField, SettingCard, Toggle, Select, Slider } from '../SettingField';

interface Props { settings: any; defaults: any; diff: any; onChange: (partial: any) => void; }

const WP_SCRIPTS = [
  { key: 'wpEmoji', label: 'wp-emoji-release.min.js + inline settings', description: 'WordPress emoji detection script' },
  { key: 'wpEmbed', label: 'wp-embed.min.js', description: 'oEmbed for WP-to-WP embedding' },
  { key: 'jqueryMigrate', label: 'jquery-migrate.min.js', description: 'Backward-compat shim' },
  { key: 'commentReply', label: 'comment-reply.min.js', description: 'Threaded comments' },
  { key: 'wpPolyfill', label: 'wp-polyfill.min.js + regenerator-runtime', description: 'Legacy polyfills' },
  { key: 'hoverIntent', label: 'hoverintent-js.min.js', description: 'Admin bar hover' },
  { key: 'adminBar', label: 'admin-bar.js + admin-bar CSS', description: 'WordPress admin toolbar' },
  { key: 'gutenbergBlocks', label: 'Gutenberg block editor scripts', description: 'Frontend block JS' },
  { key: 'dashicons', label: 'dashicons.min.css', description: '~46KB icon font' },
  { key: 'wpBlockLibrary', label: 'wp-block-library/style.min.css', description: '~30-40KB Gutenberg defaults' },
  { key: 'wpBlockLibraryTheme', label: 'wp-block-library-theme.min.css', description: 'Block theme styles' },
  { key: 'classicThemeStyles', label: 'classic-theme-styles', description: 'WP 6.1+ inline styles' },
];

export function JsTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="JavaScript Optimization" description="Master toggle for all JS optimizations">
        <SettingField label="Enable JS Optimization" isOverridden={diff?.enabled}>
          <Toggle checked={settings.enabled} onChange={(v) => onChange({ enabled: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="WordPress Scripts Removal" description="Scripts safe to remove from static HTML. All checked by default.">
        {WP_SCRIPTS.map(script => (
          <SettingField key={script.key} label={script.label} description={script.description} isOverridden={diff?.removeScripts?.[script.key]}>
            <Toggle
              checked={settings.removeScripts[script.key]}
              onChange={(v) => onChange({ removeScripts: { [script.key]: v } })}
            />
          </SettingField>
        ))}
      </SettingCard>

      <SettingCard title="jQuery" description="Only safe to remove if no frontend plugins depend on it">
        <SettingField label="Remove jQuery" description="Check compatibility before enabling" isOverridden={diff?.removeJquery}>
          <Toggle checked={settings.removeJquery} onChange={(v) => onChange({ removeJquery: v })} />
        </SettingField>
        {settings.removeJquery && (
          <div className="px-3 py-2 text-xs text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 rounded-md mt-2">
            Warning: Removing jQuery will break plugins that depend on $() or jQuery() calls.
          </div>
        )}
        <SettingField label="jQuery Compatibility Check" description="Scan pages for jQuery usage during crawl" isOverridden={diff?.jqueryCompatibilityCheck}>
          <Toggle checked={settings.jqueryCompatibilityCheck} onChange={(v) => onChange({ jqueryCompatibilityCheck: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Script Processing">
        <SettingField label="Default Loading Strategy" description="Applied to scripts without explicit async/defer" isOverridden={diff?.defaultLoadingStrategy}>
          <Select
            value={settings.defaultLoadingStrategy}
            options={[
              { value: 'defer', label: 'defer (safest default)' },
              { value: 'async', label: 'async (independent scripts)' },
              { value: 'module', label: 'module (ES modules)' },
            ]}
            onChange={(v) => onChange({ defaultLoadingStrategy: v })}
          />
        </SettingField>
        <SettingField label="Minify JavaScript" isOverridden={diff?.minifyEnabled}>
          <Toggle checked={settings.minifyEnabled} onChange={(v) => onChange({ minifyEnabled: v })} />
        </SettingField>
        <SettingField label="Move Scripts to Body End" description="Move head scripts before closing body tag" isOverridden={diff?.moveToBodyEnd}>
          <Toggle checked={settings.moveToBodyEnd} onChange={(v) => onChange({ moveToBodyEnd: v })} />
        </SettingField>
        <SettingField label="Combine Scripts" description="Risky -- may break execution order. Off by default." isOverridden={diff?.combineScripts}>
          <Toggle checked={settings.combineScripts} onChange={(v) => onChange({ combineScripts: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Terser Configuration">
        <SettingField label="Compression Passes" isOverridden={diff?.terserPasses}>
          <Slider value={settings.terserPasses} min={1} max={5} onChange={(v) => onChange({ terserPasses: v })} />
        </SettingField>
        <SettingField label="Drop console.log" isOverridden={diff?.dropConsole}>
          <Toggle checked={settings.dropConsole} onChange={(v) => onChange({ dropConsole: v })} />
        </SettingField>
        <SettingField label="Drop debugger" isOverridden={diff?.dropDebugger}>
          <Toggle checked={settings.dropDebugger} onChange={(v) => onChange({ dropDebugger: v })} />
        </SettingField>
      </SettingCard>
    </div>
  );
}
