import { SettingField, SettingCard, Toggle, Select, Slider } from '../SettingField';

interface Props {
  settings: { html: any; fonts: any };
  defaults: { html: any; fonts: any };
  diff: { html: any; fonts: any };
  onChange: (section: 'html' | 'fonts', partial: any) => void;
}

const SAFE_TOGGLES = [
  { key: 'collapseWhitespace', label: 'Collapse Whitespace' },
  { key: 'removeComments', label: 'Remove Comments' },
  { key: 'collapseBooleanAttributes', label: 'Collapse Boolean Attributes' },
  { key: 'removeRedundantAttributes', label: 'Remove Redundant Attributes' },
  { key: 'removeScriptTypeAttributes', label: 'Remove Script Type Attributes' },
  { key: 'removeStyleLinkTypeAttributes', label: 'Remove Style Link Type Attributes' },
  { key: 'useShortDoctype', label: 'Use Short Doctype' },
  { key: 'minifyCSS', label: 'Minify Inline CSS' },
  { key: 'minifyJS', label: 'Minify Inline JS' },
  { key: 'decodeEntities', label: 'Decode Entities' },
];

const AGGRESSIVE_TOGGLES = [
  { key: 'removeAttributeQuotes', label: 'Remove Attribute Quotes', warn: 'Can break some parsers' },
  { key: 'removeOptionalTags', label: 'Remove Optional Tags', warn: 'Removes </body>, </html>' },
  { key: 'removeEmptyElements', label: 'Remove Empty Elements', warn: 'May remove intentional spacers' },
  { key: 'sortAttributes', label: 'Sort Attributes', warn: 'Improves gzip but changes DOM order' },
  { key: 'sortClassName', label: 'Sort Class Names', warn: 'Changes class attribute order' },
  { key: 'removeTagWhitespace', label: 'Remove Tag Whitespace', warn: 'Can break rendering' },
];

const WP_BLOAT = [
  { key: 'metaGenerator', label: '<meta name="generator">', description: 'Version fingerprinting risk' },
  { key: 'wlwmanifest', label: '<link rel="wlwmanifest">', description: 'Dead Windows Live Writer support' },
  { key: 'editUri', label: '<link rel="EditURI">', description: 'RSD/XML-RPC (security risk)' },
  { key: 'apiWpOrg', label: 'REST API discovery link', description: 'api.w.org link' },
  { key: 'shortlink', label: '<link rel="shortlink">', description: 'Unnecessary short URL' },
  { key: 'rssFeedLinks', label: 'RSS/Atom feed links', description: 'Non-functional on static sites' },
  { key: 'commentsFeedLink', label: 'Comments feed link', description: 'Non-functional on static' },
  { key: 'pingback', label: '<link rel="pingback">', description: 'XML-RPC attack vector' },
  { key: 'dnsPrefetchWpOrg', label: 'dns-prefetch for s.w.org', description: 'Emoji CDN (not needed)' },
  { key: 'oembedDiscovery', label: 'oEmbed discovery links', description: 'Not needed on static sites' },
  { key: 'prevNextLinks', label: 'rel="prev/next" links', description: 'Google ignores these' },
];

export function HtmlFontsTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="HTML Optimization" description="Master toggle for HTML minification and bloat removal">
        <SettingField label="Enable HTML Optimization" isOverridden={diff?.html?.enabled}>
          <Toggle checked={settings.html.enabled} onChange={(v) => onChange('html', { enabled: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Safe HTML Minification" description="All enabled by default. Safe for all sites.">
        {SAFE_TOGGLES.map(t => (
          <SettingField key={t.key} label={t.label} isOverridden={diff?.html?.safe?.[t.key]}>
            <Toggle
              checked={settings.html.safe[t.key]}
              onChange={(v) => onChange('html', { safe: { [t.key]: v } })}
            />
          </SettingField>
        ))}
      </SettingCard>

      <SettingCard title="Aggressive HTML Minification" description="Disabled by default. May cause issues.">
        {AGGRESSIVE_TOGGLES.map(t => (
          <SettingField key={t.key} label={t.label} description={t.warn} isOverridden={diff?.html?.aggressive?.[t.key]}>
            <Toggle
              checked={settings.html.aggressive[t.key]}
              onChange={(v) => onChange('html', { aggressive: { [t.key]: v } })}
            />
          </SettingField>
        ))}
      </SettingCard>

      <SettingCard title="WordPress Head Bloat Removal" description="All enabled by default. Remove unnecessary meta tags and links.">
        {WP_BLOAT.map(b => (
          <SettingField key={b.key} label={b.label} description={b.description} isOverridden={diff?.html?.wpHeadBloat?.[b.key]}>
            <Toggle
              checked={settings.html.wpHeadBloat[b.key]}
              onChange={(v) => onChange('html', { wpHeadBloat: { [b.key]: v } })}
            />
          </SettingField>
        ))}
      </SettingCard>

      <SettingCard title="Remove Analytics" description="Remove Google Analytics/GTM scripts from static output">
        <SettingField label="Remove Analytics Scripts" isOverridden={diff?.html?.removeAnalytics}>
          <Toggle
            checked={settings.html.removeAnalytics}
            onChange={(v) => onChange('html', { removeAnalytics: v })}
          />
        </SettingField>
      </SettingCard>

      <SettingCard title="Font Optimization" description="Master toggle for font optimizations">
        <SettingField label="Enable Font Optimization" isOverridden={diff?.fonts?.enabled}>
          <Toggle checked={settings.fonts.enabled} onChange={(v) => onChange('fonts', { enabled: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Google Fonts" description="Self-host fonts for better performance and privacy">
        <SettingField label="Self-Host Google Fonts" isOverridden={diff?.fonts?.selfHostGoogleFonts}>
          <Toggle checked={settings.fonts.selfHostGoogleFonts} onChange={(v) => onChange('fonts', { selfHostGoogleFonts: v })} />
        </SettingField>
        <SettingField label="Preload Count" description="Number of critical fonts to preload (max 3 recommended)" isOverridden={diff?.fonts?.preloadCount}>
          <Slider value={settings.fonts.preloadCount} min={0} max={5} onChange={(v) => onChange('fonts', { preloadCount: v })} />
        </SettingField>
        <SettingField label="Font Display" isOverridden={diff?.fonts?.fontDisplay}>
          <Select
            value={settings.fonts.fontDisplay}
            options={[
              { value: 'swap', label: 'swap' },
              { value: 'optional', label: 'optional' },
              { value: 'fallback', label: 'fallback' },
              { value: 'block', label: 'block' },
            ]}
            onChange={(v) => onChange('fonts', { fontDisplay: v })}
          />
        </SettingField>
        <SettingField label="Smart Subsetting" description="Analyze crawled pages to subset fonts to used characters only" isOverridden={diff?.fonts?.subsetting}>
          <Toggle checked={settings.fonts.subsetting} onChange={(v) => onChange('fonts', { subsetting: v })} />
        </SettingField>
      </SettingCard>
    </div>
  );
}
