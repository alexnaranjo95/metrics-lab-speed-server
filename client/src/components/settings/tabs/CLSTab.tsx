import { SettingField, SettingCard, Toggle, Select } from '../SettingField';

interface Props {
  settings: any;
  defaults: any;
  diff: any;
  onChange: (partial: any) => void;
}

export function CLSTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="CLS Optimization" description="Prevent Cumulative Layout Shift for better PageSpeed and Core Web Vitals scores">
        <SettingField label="Enable CLS Optimization" isOverridden={diff?.enabled}>
          <Toggle checked={settings.enabled} onChange={(v) => onChange({ enabled: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Image Dimensions" description="Inject width/height on images to prevent layout shift during load">
        <SettingField label="Image Dimension Injection" description="Read dimensions from files and add width/height attributes" isOverridden={diff?.imageDimensionInjection}>
          <Toggle checked={settings.imageDimensionInjection} onChange={(v) => onChange({ imageDimensionInjection: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Font Display" description="Control how fonts render before loading (prevents FOUT/FOIT)">
        <SettingField label="Font Display Strategy" isOverridden={diff?.fontDisplayStrategy}>
          <Select
            value={settings.fontDisplayStrategy}
            options={[
              { value: 'optional', label: 'optional (best perf)' },
              { value: 'swap', label: 'swap (show fallback, then swap)' },
              { value: 'fallback', label: 'fallback (3s swap window)' },
              { value: 'block', label: 'block (icon fonts only)' },
            ]}
            onChange={(v) => onChange({ fontDisplayStrategy: v })}
          />
        </SettingField>
      </SettingCard>

      <SettingCard title="Dynamic Content" description="Reserve space for late-loading content">
        <SettingField label="Dynamic Content Reservation" description="Reserve space for ads, embeds, widgets" isOverridden={diff?.dynamicContentReservation}>
          <Toggle checked={settings.dynamicContentReservation} onChange={(v) => onChange({ dynamicContentReservation: v })} />
        </SettingField>
        <SettingField label="Enable Layout Containment" description="Apply contain to widgets, sidebars" isOverridden={diff?.enableLayoutContainment}>
          <Toggle checked={settings.enableLayoutContainment} onChange={(v) => onChange({ enableLayoutContainment: v })} />
        </SettingField>
        <SettingField label="Add Responsive Image CSS" description="Add aspect-ratio preservation CSS" isOverridden={diff?.addResponsiveCSS}>
          <Toggle checked={settings.addResponsiveCSS} onChange={(v) => onChange({ addResponsiveCSS: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Advanced" description="Font metrics and ad/cookie banner handling">
        <SettingField label="Prevent Font Loader Shifts" description="Font metric overrides for fallback matching" isOverridden={diff?.preventFontLoaderShifts}>
          <Toggle checked={settings.preventFontLoaderShifts} onChange={(v) => onChange({ preventFontLoaderShifts: v })} />
        </SettingField>
        <SettingField label="Reserve Ad Space" description="Min-height for ad containers" isOverridden={diff?.reserveAdSpace}>
          <Toggle checked={settings.reserveAdSpace} onChange={(v) => onChange({ reserveAdSpace: v })} />
        </SettingField>
        <SettingField label="Cookie Banner Optimization" description="Fix positioning for cookie/consent banners" isOverridden={diff?.cookieBannerOptimization}>
          <Toggle checked={settings.cookieBannerOptimization} onChange={(v) => onChange({ cookieBannerOptimization: v })} />
        </SettingField>
      </SettingCard>
    </div>
  );
}
