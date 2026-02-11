import { SettingField, SettingCard, Slider, Select, Toggle } from '../SettingField';

interface Props {
  settings: any;
  defaults: any;
  diff: any;
  onChange: (partial: any) => void;
}

const BREAKPOINT_PRESETS = [
  { value: 'recommended', label: 'Recommended (320–1920)', widths: [320, 640, 768, 1024, 1280, 1920] },
  { value: 'wordpress', label: 'WordPress (150–2048)', widths: [150, 300, 768, 1024, 1536, 2048] },
  { value: 'full', label: 'Full (320–2560)', widths: [320, 480, 640, 768, 1024, 1280, 1440, 1920, 2560] },
];

export function ImageTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="Quality Controls" description="Configure compression quality per output format. Lower quality = smaller files.">
        <SettingField label="WebP Quality" description="Sweet spot: 78–82. Default: 80" isOverridden={diff?.webp?.quality}>
          <Slider value={settings.webp.quality} min={1} max={100} onChange={(v) => onChange({ webp: { quality: v } })} />
        </SettingField>
        <SettingField label="AVIF Quality" description="AVIF 50 ≈ JPEG 80 at 30–50% smaller. Default: 50" isOverridden={diff?.avif?.quality}>
          <Slider value={settings.avif.quality} min={1} max={100} onChange={(v) => onChange({ avif: { quality: v } })} />
        </SettingField>
        <SettingField label="JPEG Quality" description="MozJPEG mode. Sweet spot: 75–82. Default: 80" isOverridden={diff?.jpeg?.quality}>
          <Slider value={settings.jpeg.quality} min={1} max={100} onChange={(v) => onChange({ jpeg: { quality: v } })} />
        </SettingField>
        <SettingField label="Output Format" isOverridden={diff?.format}>
          <Select
            value={settings.format}
            options={[
              { value: 'auto', label: 'Auto (WebP + AVIF)' },
              { value: 'webp', label: 'WebP only' },
              { value: 'avif', label: 'AVIF only' },
            ]}
            onChange={(v) => onChange({ format: v })}
          />
        </SettingField>
      </SettingCard>

      <SettingCard title="Responsive Breakpoints" description="Generate srcset variants at these widths (px)">
        <SettingField label="Breakpoint Preset" isOverridden={diff?.breakpoints}>
          <Select
            value={
              BREAKPOINT_PRESETS.find(p => JSON.stringify(p.widths) === JSON.stringify(settings.breakpoints))?.value || 'custom'
            }
            options={[...BREAKPOINT_PRESETS.map(p => ({ value: p.value, label: p.label })), { value: 'custom', label: 'Custom' }]}
            onChange={(v) => {
              const preset = BREAKPOINT_PRESETS.find(p => p.value === v);
              if (preset) onChange({ breakpoints: preset.widths });
            }}
          />
        </SettingField>
        <SettingField label="Max Width" description="Images wider than this are downscaled" isOverridden={diff?.maxWidth}>
          <Slider value={settings.maxWidth} min={1024} max={3840} step={128} onChange={(v) => onChange({ maxWidth: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Lazy Loading" description="Configure when off-screen images begin loading">
        <SettingField label="Lazy Load Margin" description="IntersectionObserver rootMargin in px. 200px = balanced" isOverridden={diff?.lazyLoadMargin}>
          <Slider value={settings.lazyLoadMargin} min={50} max={1000} step={50} onChange={(v) => onChange({ lazyLoadMargin: v })} />
        </SettingField>
        <SettingField label="LCP Detection" description="Auto-detect Largest Contentful Paint image during crawl" isOverridden={diff?.lcpDetection}>
          <Select
            value={settings.lcpDetection}
            options={[
              { value: 'auto', label: 'Auto-detect' },
              { value: 'manual', label: 'Manual' },
              { value: 'disabled', label: 'Disabled' },
            ]}
            onChange={(v) => onChange({ lcpDetection: v })}
          />
        </SettingField>
        <SettingField label="Strip Metadata" description="Remove EXIF, IPTC data from images" isOverridden={diff?.stripMetadata}>
          <Toggle checked={settings.stripMetadata} onChange={(v) => onChange({ stripMetadata: v })} />
        </SettingField>
      </SettingCard>
    </div>
  );
}
