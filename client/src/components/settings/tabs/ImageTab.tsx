import { SettingField, SettingCard, Slider, Select, Toggle } from '../SettingField';

interface Props {
  settings: any;
  defaults: any;
  diff: any;
  onChange: (partial: any) => void;
  migrationSettings?: any;
  migrationDiff?: any;
  onMigrationChange?: (partial: any) => void;
}

const BREAKPOINT_PRESETS = [
  { value: 'recommended', label: 'Recommended (320-1920)', widths: [320, 640, 768, 1024, 1280, 1920] },
  { value: 'wordpress', label: 'WordPress (150-2048)', widths: [150, 300, 768, 1024, 1536, 2048] },
  { value: 'full', label: 'Full (320-2560)', widths: [320, 480, 640, 768, 1024, 1280, 1440, 1920, 2560] },
];

export function ImageTab({ settings, defaults, diff, onChange, migrationSettings, migrationDiff, onMigrationChange }: Props) {
  return (
    <div>
      <SettingCard title="Image Optimization" description="Master toggle for all image optimizations">
        <SettingField label="Enable Image Optimization" isOverridden={diff?.enabled}>
          <Toggle checked={settings.enabled} onChange={(v) => onChange({ enabled: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Quality Controls" description="Configure compression quality per output format. Lower quality = smaller files.">
        <SettingField label="WebP Quality" description="Sweet spot: 78-82. Default: 80" isOverridden={diff?.webp?.quality}>
          <Slider value={settings.webp.quality} min={1} max={100} onChange={(v) => onChange({ webp: { ...settings.webp, quality: v } })} />
        </SettingField>
        <SettingField label="WebP Effort" description="0-6. Higher = smaller file, slower encode. Default: 4" isOverridden={diff?.webp?.effort}>
          <Slider value={settings.webp?.effort ?? 4} min={0} max={6} onChange={(v) => onChange({ webp: { ...settings.webp, effort: v } })} />
        </SettingField>
        <SettingField label="AVIF Quality" description="AVIF 50 = JPEG 80 at 30-50% smaller. Default: 50" isOverridden={diff?.avif?.quality}>
          <Slider value={settings.avif.quality} min={1} max={100} onChange={(v) => onChange({ avif: { ...settings.avif, quality: v } })} />
        </SettingField>
        <SettingField label="AVIF Effort" description="0-9. Higher = smaller file, slower encode. Default: 4" isOverridden={diff?.avif?.effort}>
          <Slider value={settings.avif?.effort ?? 4} min={0} max={9} onChange={(v) => onChange({ avif: { ...settings.avif, effort: v } })} />
        </SettingField>
        <SettingField label="JPEG Quality" description="MozJPEG mode. Sweet spot: 75-82. Default: 80" isOverridden={diff?.jpeg?.quality}>
          <Slider value={settings.jpeg.quality} min={1} max={100} onChange={(v) => onChange({ jpeg: { ...settings.jpeg, quality: v } })} />
        </SettingField>
        <SettingField label="Hero Quality" description="Above-the-fold images" isOverridden={diff?.qualityTiers?.hero?.quality}>
          <Slider value={settings.qualityTiers?.hero?.quality ?? 88} min={50} max={100} onChange={(v) => onChange({ qualityTiers: { ...settings.qualityTiers, hero: { ...(settings.qualityTiers?.hero ?? {}), quality: v } } })} />
        </SettingField>
        <SettingField label="Standard Quality" description="Below-the-fold images" isOverridden={diff?.qualityTiers?.standard?.quality}>
          <Slider value={settings.qualityTiers?.standard?.quality ?? 75} min={50} max={100} onChange={(v) => onChange({ qualityTiers: { ...settings.qualityTiers, standard: { ...(settings.qualityTiers?.standard ?? {}), quality: v } } })} />
        </SettingField>
        <SettingField label="Thumbnail Quality" description="Small thumbs, galleries" isOverridden={diff?.qualityTiers?.thumbnail?.quality}>
          <Slider value={settings.qualityTiers?.thumbnail?.quality ?? 65} min={40} max={90} onChange={(v) => onChange({ qualityTiers: { ...settings.qualityTiers, thumbnail: { ...(settings.qualityTiers?.thumbnail ?? {}), quality: v } } })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Format Conversion" description="Convert images to modern formats for better compression">
        <SettingField label="Output Format" description="Preferred format (auto picks best per-browser)" isOverridden={diff?.format}>
          <Select
            value={settings.format ?? 'auto'}
            options={[
              { value: 'auto', label: 'Auto (WebP/AVIF per browser)' },
              { value: 'webp', label: 'WebP only' },
              { value: 'avif', label: 'AVIF only' },
            ]}
            onChange={(v) => onChange({ format: v })}
          />
        </SettingField>
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
        {settings.lcpDetection === 'manual' && (
          <SettingField label="LCP Image Selector" description="CSS selector for the hero/LCP image" isOverridden={diff?.lcpImageSelector}>
            <input
              type="text"
              value={settings.lcpImageSelector ?? ''}
              onChange={(e) => onChange({ lcpImageSelector: e.target.value || undefined })}
              placeholder=".hero img, img.lcp-image"
              className="w-full h-8 px-2 text-sm font-mono rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
            />
          </SettingField>
        )}
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

      {migrationSettings && onMigrationChange && (
        <SettingCard title="Cloudflare Images CDN" description="Upload all page images to Cloudflare Images for automatic AVIF/WebP delivery from edge CDN. Zero images served from original host after migration.">
          <SettingField label="Enable CF Images Migration" description="Migrate all images to Cloudflare Images CDN" isOverridden={migrationDiff?.enabled}>
            <Toggle checked={migrationSettings.enabled} onChange={(v) => onMigrationChange({ enabled: v })} />
          </SettingField>
          {migrationSettings.enabled && (
            <>
              <SettingField label="Use Cloudflare Images API" description="Off = local Sharp optimization only" isOverridden={migrationDiff?.useCfImages}>
                <Toggle checked={migrationSettings.useCfImages} onChange={(v) => onMigrationChange({ useCfImages: v })} />
              </SettingField>
              <SettingField label="Skip SVG Files" description="SVGs benefit less from format conversion" isOverridden={migrationDiff?.skipSvg}>
                <Toggle checked={migrationSettings.skipSvg} onChange={(v) => onMigrationChange({ skipSvg: v })} />
              </SettingField>
              <SettingField label="Max File Size (MB)" description="Skip images larger than this" isOverridden={migrationDiff?.maxSizeMb}>
                <Slider value={migrationSettings.maxSizeMb} min={1} max={50} step={1} onChange={(v) => onMigrationChange({ maxSizeMb: v })} />
              </SettingField>
              <SettingField label="Upload Concurrency" description="Parallel uploads per batch" isOverridden={migrationDiff?.concurrency}>
                <Slider value={migrationSettings.concurrency} min={1} max={50} step={1} onChange={(v) => onMigrationChange({ concurrency: v })} />
              </SettingField>
              <SettingField label="Simplify &lt;picture&gt; Elements" description="Replace <picture> with single <img> (CF Images handles format)" isOverridden={migrationDiff?.simplifyPicture}>
                <Toggle checked={migrationSettings.simplifyPicture} onChange={(v) => onMigrationChange({ simplifyPicture: v })} />
              </SettingField>
              <SettingField label="Migrate Open Graph Images" description="Update og:image and twitter:image meta tags" isOverridden={migrationDiff?.migrateOgImages}>
                <Toggle checked={migrationSettings.migrateOgImages} onChange={(v) => onMigrationChange({ migrateOgImages: v })} />
              </SettingField>
              <SettingField label="Migrate Favicons" description="Update favicon and touch icon URLs" isOverridden={migrationDiff?.migrateFavicons}>
                <Toggle checked={migrationSettings.migrateFavicons} onChange={(v) => onMigrationChange({ migrateFavicons: v })} />
              </SettingField>
              <SettingField label="Migrate CSS Backgrounds" description="Update background-image URLs in inline styles and style blocks" isOverridden={migrationDiff?.migrateBackgrounds}>
                <Toggle checked={migrationSettings.migrateBackgrounds} onChange={(v) => onMigrationChange({ migrateBackgrounds: v })} />
              </SettingField>
            </>
          )}
        </SettingCard>
      )}
    </div>
  );
}
