import { SettingField, SettingCard, Toggle, Select } from '../SettingField';

interface Props {
  settings: any;
  defaults: any;
  diff: any;
  onChange: (partial: any) => void;
  resourceHints?: any;
  resourceHintsDiff?: any;
  onResourceHintsChange?: (partial: any) => void;
}

export function CacheTab({ settings, defaults, diff, onChange, resourceHints, resourceHintsDiff, onResourceHintsChange }: Props) {
  return (
    <div>
      <SettingCard title="Cache & Headers" description="Master toggle for _headers file generation">
        <SettingField label="Enable Headers Generation" isOverridden={diff?.enabled}>
          <Toggle checked={settings.enabled} onChange={(v) => onChange({ enabled: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Cache Durations" description="Controls Cache-Control header values in the _headers file">
        {[
          { key: 'html', label: 'HTML Pages', desc: 'Always revalidate for fresh content' },
          { key: 'cssJs', label: 'CSS/JS (hashed)', desc: 'Hash in filename = cache forever' },
          { key: 'imagesHashed', label: 'Images (hashed)', desc: 'Content-addressed images' },
          { key: 'imagesUnhashed', label: 'Images (unhashed)', desc: 'Reasonable freshness' },
          { key: 'fonts', label: 'Fonts', desc: 'Rarely change' },
          { key: 'favicon', label: 'Favicon/Manifest', desc: 'Daily refresh' },
        ].map(item => (
          <SettingField key={item.key} label={item.label} description={item.desc} isOverridden={diff?.durations?.[item.key]}>
            <input
              type="text"
              value={settings.durations[item.key]}
              onChange={(e) => onChange({ durations: { [item.key]: e.target.value } })}
              className="h-8 w-72 px-2 text-xs font-mono rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
            />
          </SettingField>
        ))}
      </SettingCard>

      <SettingCard title="Security Headers" description="HTTP security headers included in all responses">
        <SettingField label="X-Content-Type-Options: nosniff" isOverridden={diff?.securityHeaders?.xContentTypeOptions}>
          <Toggle checked={settings.securityHeaders.xContentTypeOptions} onChange={(v) => onChange({ securityHeaders: { xContentTypeOptions: v } })} />
        </SettingField>
        <SettingField label="X-Frame-Options" isOverridden={diff?.securityHeaders?.xFrameOptions}>
          <Select
            value={settings.securityHeaders.xFrameOptions}
            options={[
              { value: 'DENY', label: 'DENY' },
              { value: 'SAMEORIGIN', label: 'SAMEORIGIN' },
              { value: 'disabled', label: 'Disabled' },
            ]}
            onChange={(v) => onChange({ securityHeaders: { xFrameOptions: v } })}
          />
        </SettingField>
        <SettingField label="Strict-Transport-Security" description="HSTS with preload" isOverridden={diff?.securityHeaders?.strictTransportSecurity}>
          <Toggle checked={settings.securityHeaders.strictTransportSecurity} onChange={(v) => onChange({ securityHeaders: { strictTransportSecurity: v } })} />
        </SettingField>
        <SettingField label="Referrer-Policy" isOverridden={diff?.securityHeaders?.referrerPolicy}>
          <Select
            value={settings.securityHeaders.referrerPolicy}
            options={[
              { value: 'strict-origin-when-cross-origin', label: 'strict-origin-when-cross-origin' },
              { value: 'no-referrer', label: 'no-referrer' },
              { value: 'origin', label: 'origin' },
              { value: 'same-origin', label: 'same-origin' },
            ]}
            onChange={(v) => onChange({ securityHeaders: { referrerPolicy: v } })}
          />
        </SettingField>
        <SettingField label="Permissions-Policy" description="Disable camera, microphone, geolocation" isOverridden={diff?.securityHeaders?.permissionsPolicy}>
          <Toggle checked={settings.securityHeaders.permissionsPolicy} onChange={(v) => onChange({ securityHeaders: { permissionsPolicy: v } })} />
        </SettingField>
        <SettingField label="X-XSS-Protection: 0" description="Modern best practice (disable legacy filter)" isOverridden={diff?.securityHeaders?.xXssProtection}>
          <Toggle checked={settings.securityHeaders.xXssProtection} onChange={(v) => onChange({ securityHeaders: { xXssProtection: v } })} />
        </SettingField>
      </SettingCard>

      {/* Resource Hints */}
      {resourceHints && onResourceHintsChange && (
        <SettingCard title="Resource Hints" description="Preload, preconnect, and DNS prefetch hints">
          <SettingField label="Enable Resource Hints" isOverridden={resourceHintsDiff?.enabled}>
            <Toggle checked={resourceHints.enabled} onChange={(v) => onResourceHintsChange({ enabled: v })} />
          </SettingField>
          <SettingField label="Auto-Preload LCP Image" description="Add preload for detected LCP image" isOverridden={resourceHintsDiff?.autoPreloadLcpImage}>
            <Toggle checked={resourceHints.autoPreloadLcpImage} onChange={(v) => onResourceHintsChange({ autoPreloadLcpImage: v })} />
          </SettingField>
          <SettingField label="Auto-Preconnect" description="Detect and add preconnect for used origins" isOverridden={resourceHintsDiff?.autoPreconnect}>
            <Toggle checked={resourceHints.autoPreconnect} onChange={(v) => onResourceHintsChange({ autoPreconnect: v })} />
          </SettingField>
          <SettingField label="Remove Unused Preconnects" description="Clean up preconnect hints for unused origins" isOverridden={resourceHintsDiff?.removeUnusedPreconnects}>
            <Toggle checked={resourceHints.removeUnusedPreconnects} onChange={(v) => onResourceHintsChange({ removeUnusedPreconnects: v })} />
          </SettingField>
        </SettingCard>
      )}
    </div>
  );
}
