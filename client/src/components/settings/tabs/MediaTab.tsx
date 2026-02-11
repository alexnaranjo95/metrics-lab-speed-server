import { SettingField, SettingCard, Toggle, Select } from '../SettingField';

interface Props { settings: any; defaults: any; diff: any; onChange: (partial: any) => void; }

export function MediaTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="Video Facades" description="Replace heavy video embeds with lightweight click-to-load placeholders. Saves ~1MB per YouTube embed.">
        <SettingField label="Enable Video Facades" isOverridden={diff?.facadesEnabled}>
          <Toggle checked={settings.facadesEnabled} onChange={(v) => onChange({ facadesEnabled: v })} />
        </SettingField>
        <SettingField label="Poster Quality" description="YouTube thumbnail quality for the facade" isOverridden={diff?.posterQuality}>
          <Select
            value={settings.posterQuality}
            options={[
              { value: 'default', label: 'Default (120×90)' },
              { value: 'mqdefault', label: 'Medium (320×180)' },
              { value: 'hqdefault', label: 'High (480×360)' },
              { value: 'sddefault', label: 'SD (640×480)' },
              { value: 'maxresdefault', label: 'Max (1280×720)' },
            ]}
            onChange={(v) => onChange({ posterQuality: v })}
          />
        </SettingField>
        <SettingField label="Use Privacy-Enhanced Mode" description="Use youtube-nocookie.com domain" isOverridden={diff?.useNocookie}>
          <Toggle checked={settings.useNocookie} onChange={(v) => onChange({ useNocookie: v })} />
        </SettingField>
        <SettingField label="Preconnect" description="Add preconnect hint for video CDN" isOverridden={diff?.preconnect}>
          <Toggle checked={settings.preconnect} onChange={(v) => onChange({ preconnect: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Platform Support">
        <SettingField label="YouTube" isOverridden={diff?.platforms?.youtube}>
          <Toggle checked={settings.platforms.youtube} onChange={(v) => onChange({ platforms: { youtube: v } })} />
        </SettingField>
        <SettingField label="Vimeo" isOverridden={diff?.platforms?.vimeo}>
          <Toggle checked={settings.platforms.vimeo} onChange={(v) => onChange({ platforms: { vimeo: v } })} />
        </SettingField>
        <SettingField label="Wistia" isOverridden={diff?.platforms?.wistia}>
          <Toggle checked={settings.platforms.wistia} onChange={(v) => onChange({ platforms: { wistia: v } })} />
        </SettingField>
      </SettingCard>
    </div>
  );
}
