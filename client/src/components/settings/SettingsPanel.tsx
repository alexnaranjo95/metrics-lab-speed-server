import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ImageTab } from './tabs/ImageTab';
import { MediaTab } from './tabs/MediaTab';
import { CssTab } from './tabs/CssTab';
import { JsTab } from './tabs/JsTab';
import { HtmlFontsTab } from './tabs/HtmlFontsTab';
import { CacheTab } from './tabs/CacheTab';
import { AiBuildTab } from './tabs/AiBuildTab';
import { Image, Video, Palette, Code2, FileText, Shield, Bot, RotateCcw, Save, X } from 'lucide-react';

const TABS = [
  { id: 'images', label: 'Images', icon: Image },
  { id: 'media', label: 'Media', icon: Video },
  { id: 'css', label: 'CSS', icon: Palette },
  { id: 'js', label: 'JavaScript', icon: Code2 },
  { id: 'html-fonts', label: 'HTML & Fonts', icon: FileText },
  { id: 'cache', label: 'Headers & Cache', icon: Shield },
  { id: 'ai-build', label: 'AI & Build', icon: Bot },
] as const;

interface SettingsPanelProps {
  siteId: string;
}

/** Deep merge utility for accumulating draft changes */
function deepMergeDraft(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    if (patch[key] !== undefined && typeof patch[key] === 'object' && !Array.isArray(patch[key]) && patch[key] !== null
        && typeof result[key] === 'object' && !Array.isArray(result[key]) && result[key] !== null) {
      result[key] = deepMergeDraft(result[key], patch[key]);
    } else {
      result[key] = patch[key];
    }
  }
  return result;
}

export function SettingsPanel({ siteId }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState('images');
  const [draft, setDraft] = useState<Record<string, any>>({});
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings', siteId],
    queryFn: () => api.getSettings(siteId),
  });

  const { data: diffData } = useQuery({
    queryKey: ['settings-diff', siteId],
    queryFn: () => api.getSettingsDiff(siteId),
  });

  const saveMutation = useMutation({
    mutationFn: (settings: Record<string, any>) => api.updateSettings(siteId, settings),
    onSuccess: () => {
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ['settings', siteId] });
      queryClient.invalidateQueries({ queryKey: ['settings-diff', siteId] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetSettings(siteId),
    onSuccess: () => {
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ['settings', siteId] });
      queryClient.invalidateQueries({ queryKey: ['settings-diff', siteId] });
    },
  });

  // Accumulate changes into the draft
  const updateField = useCallback((path: string[], value: any) => {
    setDraft(prev => {
      const patch: Record<string, any> = {};
      let current = patch;
      for (let i = 0; i < path.length - 1; i++) {
        current[path[i]] = {};
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return deepMergeDraft(prev, patch);
    });
  }, []);

  // Compute the effective settings (server data + draft overlay)
  const effectiveSettings = useMemo(() => {
    if (!data?.settings) return null;
    if (Object.keys(draft).length === 0) return data.settings;
    return deepMergeDraft(data.settings, draft);
  }, [data?.settings, draft]);

  const hasDraftChanges = Object.keys(draft).length > 0;

  // Determine which tabs have unsaved changes
  const dirtyTabs = useMemo(() => {
    const tabs = new Set<string>();
    for (const key of Object.keys(draft)) {
      if (key === 'images') tabs.add('images');
      else if (key === 'video') tabs.add('media');
      else if (key === 'css') tabs.add('css');
      else if (key === 'js') tabs.add('js');
      else if (key === 'html' || key === 'fonts') tabs.add('html-fonts');
      else if (key === 'cache' || key === 'resourceHints') tabs.add('cache');
      else if (key === 'ai' || key === 'build') tabs.add('ai-build');
    }
    return tabs;
  }, [draft]);

  if (isLoading) {
    return <div className="animate-pulse p-8 text-center text-[hsl(var(--muted-foreground))]">Loading settings...</div>;
  }

  const settings = effectiveSettings;
  const defaults = data?.defaults;
  const diff = diffData?.diff || {};
  const overrideCount = diffData?.overrideCount || 0;

  const handleSave = () => {
    // Merge the draft into the existing server-side overrides, then send full override
    const merged = data?.settings ? deepMergeDraft(data.settings, draft) : draft;
    saveMutation.mutate(merged);
  };

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Optimization Settings</h2>
          {overrideCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              {overrideCount} overridden
            </span>
          )}
        </div>
        {overrideCount > 0 && (
          <button
            onClick={() => resetMutation.mutate()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset all to defaults
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[hsl(var(--border))] overflow-x-auto">
        {TABS.map(tab => {
          const hasOverrides = diff[tab.id === 'html-fonts' ? 'html' : tab.id === 'ai-build' ? 'ai' : tab.id];
          const isDirty = dirtyTabs.has(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                  : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {isDirty && (
                <span className="w-2 h-2 rounded-full bg-[hsl(var(--warning))]" title="Unsaved changes" />
              )}
              {!isDirty && hasOverrides && (
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="p-5 pb-20">
        {settings && (
          <>
            {activeTab === 'images' && <ImageTab settings={settings.images} defaults={defaults?.images} diff={diff.images} onChange={(v) => updateField(['images'], v)} />}
            {activeTab === 'media' && <MediaTab settings={settings.video} defaults={defaults?.video} diff={diff.video} onChange={(v) => updateField(['video'], v)} />}
            {activeTab === 'css' && <CssTab settings={settings.css} defaults={defaults?.css} diff={diff.css} onChange={(v) => updateField(['css'], v)} />}
            {activeTab === 'js' && <JsTab settings={settings.js} defaults={defaults?.js} diff={diff.js} onChange={(v) => updateField(['js'], v)} />}
            {activeTab === 'html-fonts' && <HtmlFontsTab settings={{ html: settings.html, fonts: settings.fonts }} defaults={{ html: defaults?.html, fonts: defaults?.fonts }} diff={{ html: diff.html, fonts: diff.fonts }} onChange={(section, v) => updateField([section], v)} />}
            {activeTab === 'cache' && <CacheTab settings={settings.cache} defaults={defaults?.cache} diff={diff.cache} onChange={(v) => updateField(['cache'], v)} resourceHints={settings.resourceHints} resourceHintsDiff={diff.resourceHints} onResourceHintsChange={(v) => updateField(['resourceHints'], v)} />}
            {activeTab === 'ai-build' && <AiBuildTab settings={{ ai: settings.ai, build: settings.build }} defaults={{ ai: defaults?.ai, build: defaults?.build }} diff={{ ai: diff.ai, build: diff.build }} onChange={(section, v) => updateField([section], v)} />}
          </>
        )}
      </div>

      {/* Floating save/discard bar */}
      {hasDraftChanges && (
        <div className="sticky bottom-0 left-0 right-0 flex items-center justify-between px-5 py-3 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] shadow-lg">
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            You have unsaved changes
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDraft({})}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md hover:bg-[hsl(var(--muted))] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
