import { SettingField, SettingCard, Toggle, Select, Slider } from '../SettingField';

interface Props { settings: any; defaults: any; diff: any; onChange: (partial: any) => void; }

export function MediaTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="Video Facades" description="Replace heavy video embeds with click-to-load placeholders. Saves ~1MB per YouTube embed.">
        <SettingField label="Enable Video Facades" isOverridden={diff?.facadesEnabled}>
          <Toggle checked={settings.facadesEnabled} onChange={(v) => onChange({ facadesEnabled: v })} />
        </SettingField>
        <SettingField label="Poster Quality" description="YouTube thumbnail quality (fallback when screenshot fails)" isOverridden={diff?.posterQuality}>
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

      <SettingCard title="Cloudflare Video & Image Hosting" description="Upload posters to CF Images and videos to CF Stream for CDN-edge delivery with automatic AVIF/WebP.">
        <SettingField label="Use CF Images for Posters" description="Upload Playwright screenshots to Cloudflare Images CDN" isOverridden={diff?.useCfImages}>
          <Toggle checked={settings.useCfImages} onChange={(v) => onChange({ useCfImages: v })} />
        </SettingField>
        <SettingField label="Use CF Stream for Background Video" description="Re-host background videos on Cloudflare Stream with HLS" isOverridden={diff?.useCfStream}>
          <Toggle checked={settings.useCfStream} onChange={(v) => onChange({ useCfStream: v })} />
        </SettingField>
        <SettingField label="Above-Fold Detection" description="Auto-detect above-fold videos for priority loading" isOverridden={diff?.aboveTheFoldDetection}>
          <Toggle checked={settings.aboveTheFoldDetection} onChange={(v) => onChange({ aboveTheFoldDetection: v })} />
        </SettingField>
        <SettingField label="Screenshot Timestamp (Click-to-Play)" description="Which second to capture for poster thumbnail" isOverridden={diff?.screenshotTimestamp}>
          <Slider value={settings.screenshotTimestamp} min={0} max={30} step={1} onChange={(v) => onChange({ screenshotTimestamp: v })} />
        </SettingField>
        <SettingField label="Screenshot Timestamp (Background)" description="Background videos use an earlier frame to avoid black intros" isOverridden={diff?.screenshotTimestampBg}>
          <Slider value={settings.screenshotTimestampBg} min={0} max={30} step={1} onChange={(v) => onChange({ screenshotTimestampBg: v })} />
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

      <SettingCard title="Platform Support" description="Enable or disable facade processing per video platform">
        <SettingField label="YouTube" isOverridden={diff?.platforms?.youtube}>
          <Toggle checked={settings.platforms?.youtube} onChange={(v) => onChange({ platforms: { youtube: v } })} />
        </SettingField>
        <SettingField label="Vimeo" isOverridden={diff?.platforms?.vimeo}>
          <Toggle checked={settings.platforms?.vimeo} onChange={(v) => onChange({ platforms: { vimeo: v } })} />
        </SettingField>
        <SettingField label="Wistia" isOverridden={diff?.platforms?.wistia}>
          <Toggle checked={settings.platforms?.wistia} onChange={(v) => onChange({ platforms: { wistia: v } })} />
        </SettingField>
        <SettingField label="Loom" isOverridden={diff?.platforms?.loom}>
          <Toggle checked={settings.platforms?.loom} onChange={(v) => onChange({ platforms: { loom: v } })} />
        </SettingField>
        <SettingField label="Bunny.net" isOverridden={diff?.platforms?.bunny}>
          <Toggle checked={settings.platforms?.bunny} onChange={(v) => onChange({ platforms: { bunny: v } })} />
        </SettingField>
        <SettingField label="Mux" isOverridden={diff?.platforms?.mux}>
          <Toggle checked={settings.platforms?.mux} onChange={(v) => onChange({ platforms: { mux: v } })} />
        </SettingField>
        <SettingField label="Dailymotion" isOverridden={diff?.platforms?.dailymotion}>
          <Toggle checked={settings.platforms?.dailymotion} onChange={(v) => onChange({ platforms: { dailymotion: v } })} />
        </SettingField>
        <SettingField label="Streamable" isOverridden={diff?.platforms?.streamable}>
          <Toggle checked={settings.platforms?.streamable} onChange={(v) => onChange({ platforms: { streamable: v } })} />
        </SettingField>
        <SettingField label="Twitch" isOverridden={diff?.platforms?.twitch}>
          <Toggle checked={settings.platforms?.twitch} onChange={(v) => onChange({ platforms: { twitch: v } })} />
        </SettingField>
        <SettingField label="Direct MP4 / WordPress Video" isOverridden={diff?.platforms?.directMp4}>
          <Toggle checked={settings.platforms?.directMp4} onChange={(v) => onChange({ platforms: { directMp4: v } })} />
        </SettingField>
      </SettingCard>
    </div>
  );
}
