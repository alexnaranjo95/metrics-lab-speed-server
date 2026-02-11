import { SettingField, SettingCard, Toggle, Select, Slider } from '../SettingField';

interface Props { settings: any; defaults: any; diff: any; onChange: (partial: any) => void; }

export function MediaTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="Video Facades" description="Replace heavy video embeds with click-to-load placeholders. Saves ~1MB per YouTube embed.">
        <SettingField label="Enable Video Facades" isOverridden={diff?.facadesEnabled}>
          <Toggle checked={settings.facadesEnabled} onChange={(v) => onChange({ facadesEnabled: v })} />
        </SettingField>
        <SettingField label="Poster Quality" description="YouTube thumbnail quality" isOverridden={diff?.posterQuality}>
          <Select
            value={settings.posterQuality}
            options={[
              { value: 'default', label: 'Default (120x90)' },
              { value: 'mqdefault', label: 'Medium (320x180)' },
              { value: 'hqdefault', label: 'High (480x360)' },
              { value: 'sddefault', label: 'SD (640x480)' },
              { value: 'maxresdefault', label: 'Max (1280x720)' },
            ]}
            onChange={(v) => onChange({ posterQuality: v })}
          />
        </SettingField>
        <SettingField label="Use Privacy-Enhanced Mode" description="youtube-nocookie.com domain" isOverridden={diff?.useNocookie}>
          <Toggle checked={settings.useNocookie} onChange={(v) => onChange({ useNocookie: v })} />
        </SettingField>
        <SettingField label="Preconnect" description="Add preconnect hint for video CDN" isOverridden={diff?.preconnect}>
          <Toggle checked={settings.preconnect} onChange={(v) => onChange({ preconnect: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Iframe Loading" description="Control lazy loading for all iframes">
        <SettingField label="Lazy Load Iframes" isOverridden={diff?.lazyLoadIframes}>
          <Toggle checked={settings.lazyLoadIframes} onChange={(v) => onChange({ lazyLoadIframes: v })} />
        </SettingField>
        <SettingField label="Iframe Lazy Margin (px)" description="Distance below viewport to start loading" isOverridden={diff?.iframeLazyMargin}>
          <Slider value={settings.iframeLazyMargin} min={0} max={1000} step={50} onChange={(v) => onChange({ iframeLazyMargin: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Google Maps" description="Replace Google Maps embeds with click-to-load facades">
        <SettingField label="Use Map Facade" isOverridden={diff?.googleMapsUseFacade}>
          <Toggle checked={settings.googleMapsUseFacade} onChange={(v) => onChange({ googleMapsUseFacade: v })} />
        </SettingField>
        <SettingField label="Static Map Preview" description="Show a static map image as placeholder" isOverridden={diff?.googleMapsStaticPreview}>
          <Toggle checked={settings.googleMapsStaticPreview} onChange={(v) => onChange({ googleMapsStaticPreview: v })} />
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
