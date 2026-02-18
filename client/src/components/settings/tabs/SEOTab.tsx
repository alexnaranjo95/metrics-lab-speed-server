import { SettingField, SettingCard, Toggle } from '../SettingField';

interface Props {
  settings: any;
  defaults: any;
  diff: any;
  onChange: (partial: any) => void;
}

export function SEOTab({ settings, defaults, diff, onChange }: Props) {
  return (
    <div>
      <SettingCard title="SEO Optimization" description="Master toggle for all SEO improvements">
        <SettingField label="Enable SEO Optimization" isOverridden={diff?.enabled}>
          <Toggle checked={settings.enabled} onChange={(v) => onChange({ enabled: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Meta Tags & Social" description="Open Graph, Twitter cards, and meta tags">
        <SettingField label="Meta Tag Injection" description="Inject or improve title, description meta tags" isOverridden={diff?.metaTagInjection}>
          <Toggle checked={settings.metaTagInjection} onChange={(v) => onChange({ metaTagInjection: v })} />
        </SettingField>
        <SettingField label="Open Graph Tags" description="og:image, og:title, og:description for social sharing" isOverridden={diff?.openGraphTags}>
          <Toggle checked={settings.openGraphTags} onChange={(v) => onChange({ openGraphTags: v })} />
        </SettingField>
        <SettingField label="Twitter Card Meta" description="twitter:card, twitter:image for Twitter sharing" isOverridden={diff?.twitterCardMeta}>
          <Toggle checked={settings.twitterCardMeta} onChange={(v) => onChange({ twitterCardMeta: v })} />
        </SettingField>
        <SettingField label="Canonical URL Generation" description="Add rel=canonical to prevent duplicate content" isOverridden={diff?.canonicalUrlGeneration}>
          <Toggle checked={settings.canonicalUrlGeneration} onChange={(v) => onChange({ canonicalUrlGeneration: v })} />
        </SettingField>
        <SettingField label="Robots Meta Optimization" description="Add or optimize robots meta tags" isOverridden={diff?.robotsMetaOptimization}>
          <Toggle checked={settings.robotsMetaOptimization} onChange={(v) => onChange({ robotsMetaOptimization: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Content & Structure" description="Structured data, alt text, and semantic improvements">
        <SettingField label="Structured Data (JSON-LD)" description="Inject schema.org structured data" isOverridden={diff?.structuredDataInjection}>
          <Toggle checked={settings.structuredDataInjection} onChange={(v) => onChange({ structuredDataInjection: v })} />
        </SettingField>
        <SettingField label="Auto-Generate Alt Text" description="Add alt to images missing it (non-AI)" isOverridden={diff?.autoGenerateAltText}>
          <Toggle checked={settings.autoGenerateAltText} onChange={(v) => onChange({ autoGenerateAltText: v })} />
        </SettingField>
        <SettingField label="Image Alt Generation" description="AI alt text when AI features enabled" isOverridden={diff?.imageAltGeneration}>
          <Toggle checked={settings.imageAltGeneration} onChange={(v) => onChange({ imageAltGeneration: v })} />
        </SettingField>
        <SettingField label="Heading Hierarchy Fix" description="Fix h1–h6 order for accessibility" isOverridden={diff?.headingHierarchyFix}>
          <Toggle checked={settings.headingHierarchyFix} onChange={(v) => onChange({ headingHierarchyFix: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Links & Accessibility" description="Link optimization and Core Web Vitals">
        <SettingField label="Link Text Optimization" description="Improve anchor text for SEO" isOverridden={diff?.linkTextOptimization}>
          <Toggle checked={settings.linkTextOptimization} onChange={(v) => onChange({ linkTextOptimization: v })} />
        </SettingField>
        <SettingField label="Crawlable Links Fixing" description="Fix broken or non-crawlable links" isOverridden={diff?.crawlableLinksFixing}>
          <Toggle checked={settings.crawlableLinksFixing} onChange={(v) => onChange({ crawlableLinksFixing: v })} />
        </SettingField>
        <SettingField label="Font Size Validation" description="Ensure readable font sizes" isOverridden={diff?.fontSizeValidation}>
          <Toggle checked={settings.fontSizeValidation} onChange={(v) => onChange({ fontSizeValidation: v })} />
        </SettingField>
        <SettingField label="Tap Target Optimization" description="Min 48x48 touch targets for mobile" isOverridden={diff?.tapTargetOptimization}>
          <Toggle checked={settings.tapTargetOptimization} onChange={(v) => onChange({ tapTargetOptimization: v })} />
        </SettingField>
      </SettingCard>

      <SettingCard title="Site Defaults" description="Site-wide SEO defaults used when page-specific data is missing">
        <SettingField label="Site Name" isOverridden={diff?.siteName}>
          <input
            type="text"
            value={settings.siteName ?? ''}
            onChange={(e) => onChange({ siteName: e.target.value || undefined })}
            placeholder="My Site"
            className="h-8 w-full max-w-xs px-2 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
          />
        </SettingField>
        <SettingField label="Default Title" description="Fallback page title" isOverridden={diff?.defaultTitle}>
          <input
            type="text"
            value={settings.defaultTitle ?? ''}
            onChange={(e) => onChange({ defaultTitle: e.target.value || undefined })}
            placeholder="Page title"
            className="h-8 w-full max-w-xs px-2 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
          />
        </SettingField>
        <SettingField label="Default Description" description="Fallback meta description" isOverridden={diff?.defaultDescription}>
          <input
            type="text"
            value={settings.defaultDescription ?? ''}
            onChange={(e) => onChange({ defaultDescription: e.target.value || undefined })}
            placeholder="Page description"
            className="h-8 w-full max-w-xs px-2 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
          />
        </SettingField>
        <SettingField label="Site URL" description="Canonical base URL for rel=canonical" isOverridden={diff?.siteUrl}>
          <input
            type="text"
            value={settings.siteUrl ?? ''}
            onChange={(e) => onChange({ siteUrl: e.target.value || undefined })}
            placeholder="https://example.com"
            className="h-8 w-full max-w-xs px-2 text-sm font-mono rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
          />
        </SettingField>
      </SettingCard>
    </div>
  );
}
