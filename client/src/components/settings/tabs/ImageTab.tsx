import { SettingField, SettingCard, Slider, Select, Toggle } from '../SettingField';

interface Props {
  settings: any;
  defaults: any;
  diff: any;
  onChange: (partial: any) => void;
}

const BREAKPOINT_PRESETS = [
  { value: 'recommended', label: 'Recommended (320-1920)', widths: [320, 640, 768, 1024, 1280, 1920] },
  { value: 'wordpress', label: 'WordPress (150-2048)', widths: [150, 300, 768, 1024, 1536, 2048] },
  { value: 'full', label: 'Full (320-2560)', widths: [320, 480, 640, 768, 1024, 1280, 1440, 1920, 2560] },
];

export function ImageTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="Image Optimization" description="Master toggle for all image optimizations">
        <SettingField label="Enable Image Optimization" isOverridden={diff?.enabled}>
          <Toggle checked={settings.enabled} onChange={(v) => onChange({ enabled: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Quality Controls" description="Configure compression quality per output format. Lower quality = smaller files.">
        <SettingField label="WebP Quality" description="Sweet spot: 78-82. Default: 80" isOverridden={diff?.webp?.quality}>
          <Slider value={settings.webp.quality} min={1} max={100} onChange={(v) => onChange({ webp: { quality: v } })} />
        </SettingField>
        <SettingField label="AVIF Quality" description="AVIF 50 = JPEG 80 at 30-50% smaller. Default: 50" isOverridden={diff?.avif?.quality}>
          <Slider value={settings.avif.quality} min={1} max={100} onChange={(v) => onChange({ avif: { quality: v } })} />
        </SettingField>
        <SettingField label="JPEG Quality" description="MozJPEG mode. Sweet spot: 75-82. Default: 80" isOverridden={diff?.jpeg?.quality}>
          <Slider value={settings.jpeg.quality} min={1} max={100} onChange={(v) => onChange({ jpeg: { quality: v } })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Format Conversion" description="Convert images to modern formats for better compression">
        <SettingField label="Convert to WebP" isOverridden={diff?.convertToWebp}>
          <Toggle checked={settings.convertToWebp} onChange={(v) => onChange({ convertToWebp: v })} />
        </SettingField>
        <SettingField label="Convert to AVIF" description="Slower to encode but 30-50% smaller than WebP" isOverridden={diff?.convertToAvif}>
          <Toggle checked={settings.convertToAvif} onChange={(v) => onChange({ convertToAvif: v })} />
        </SettingField>
        <SettingField label="Keep Original as Fallback" isOverridden={diff?.keepOriginalAsFallback}>
          <Toggle checked={settings.keepOriginalAsFallback} onChange={(v) => onChange({ keepOriginalAsFallback: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Responsive Images" description="Generate srcset variants at different widths">
        <SettingField label="Generate Responsive srcset" isOverridden={diff?.generateSrcset}>
          <Toggle checked={settings.generateSrcset} onChange={(v) => onChange({ generateSrcset: v })} />
        </SettingField>
        <SettingField label="Breakpoint Preset" isOverridden={diff?.breakpoints}>
          <Select
            value={BREAKPOINT_PRESETS.find(p => JSON.stringify(p.widths) === JSON.stringify(settings.breakpoints))?.value || 'custom'}
            options={[...BREAKPOINT_PRESETS.map(p => ({ value: p.value, label: p.label })), { value: 'custom', label: 'Custom' }]}
            onChange={(v) => { const preset = BREAKPOINT_PRESETS.find(p => p.value === v); if (preset) onChange({ breakpoints: preset.widths }); }}
          />
        </SettingField>
        <SettingField label="Max Width" description="Images wider than this are downscaled" isOverridden={diff?.maxWidth}>
          <Slider value={settings.maxWidth} min={1024} max={3840} step={128} onChange={(v) => onChange({ maxWidth: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Lazy Loading & LCP" description="Configure loading behavior for images">
        <SettingField label="Enable Lazy Loading" isOverridden={diff?.lazyLoadEnabled}>
          <Toggle checked={settings.lazyLoadEnabled} onChange={(v) => onChange({ lazyLoadEnabled: v })} />
        </SettingField>
        <SettingField label="Lazy Load Margin" description="Pixels below viewport. 200px = balanced" isOverridden={diff?.lazyLoadMargin}>
          <Slider value={settings.lazyLoadMargin} min={50} max={1000} step={50} onChange={(v) => onChange({ lazyLoadMargin: v })} />
        </SettingField>
        <SettingField label="LCP Detection" description="Auto-detect Largest Contentful Paint image" isOverridden={diff?.lcpDetection}>
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
        <SettingField label="Add fetchpriority=high to LCP" isOverridden={diff?.lcpImageFetchPriority}>
          <Toggle checked={settings.lcpImageFetchPriority} onChange={(v) => onChange({ lcpImageFetchPriority: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Processing Options">
        <SettingField label="Strip Metadata" description="Remove EXIF, IPTC data" isOverridden={diff?.stripMetadata}>
          <Toggle checked={settings.stripMetadata} onChange={(v) => onChange({ stripMetadata: v })} />
        </SettingField>
        <SettingField label="Add Width/Height Attributes" description="Prevent CLS by injecting dimensions" isOverridden={diff?.addDimensions}>
          <Toggle checked={settings.addDimensions} onChange={(v) => onChange({ addDimensions: v })} />
        </SettingField>
        <SettingField label="Optimize SVGs" description="Run SVGO on SVG files" isOverridden={diff?.optimizeSvg}>
          <Toggle checked={settings.optimizeSvg} onChange={(v) => onChange({ optimizeSvg: v })} />
        </SettingField>
      </SettingCard>
    </div>
  );
}
