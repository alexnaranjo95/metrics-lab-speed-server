import { useState } from 'react';
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
import { Image, Video, Palette, Code2, FileText, Shield, Bot, RotateCcw } from 'lucide-react';

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

export function SettingsPanel({ siteId }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState('images');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings', siteId],
    queryFn: () => api.getSettings(siteId),
  });

  const { data: diffData } = useQuery({
    queryKey: ['settings-diff', siteId],
    queryFn: () => api.getSettingsDiff(siteId),
  });

  const mutation = useMutation({
    mutationFn: (settings: Record<string, any>) => api.updateSettings(siteId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', siteId] });
      queryClient.invalidateQueries({ queryKey: ['settings-diff', siteId] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetSettings(siteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', siteId] });
      queryClient.invalidateQueries({ queryKey: ['settings-diff', siteId] });
    },
  });

  if (isLoading) {
    return <div className="animate-pulse p-8 text-center text-[hsl(var(--muted-foreground))]">Loading settings...</div>;
  }

  const settings = data?.settings;
  const defaults = data?.defaults;
  const diff = diffData?.diff || {};
  const overrideCount = diffData?.overrideCount || 0;

  const updateField = (path: string[], value: any) => {
    const override: Record<string, any> = {};
    let current = override;
    for (let i = 0; i < path.length - 1; i++) {
      current[path[i]] = {};
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
    mutation.mutate(override);
  };

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
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
              {hasOverrides && (
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="p-5">
        {settings && (
          <>
            {activeTab === 'images' && <ImageTab settings={settings.images} defaults={defaults?.images} diff={diff.images} onChange={(v) => updateField(['images'], v)} />}
            {activeTab === 'media' && <MediaTab settings={settings.video} defaults={defaults?.video} diff={diff.video} onChange={(v) => updateField(['video'], v)} />}
            {activeTab === 'css' && <CssTab settings={settings.css} defaults={defaults?.css} diff={diff.css} onChange={(v) => updateField(['css'], v)} />}
            {activeTab === 'js' && <JsTab settings={settings.js} defaults={defaults?.js} diff={diff.js} onChange={(v) => updateField(['js'], v)} />}
            {activeTab === 'html-fonts' && <HtmlFontsTab settings={{ html: settings.html, fonts: settings.fonts }} defaults={{ html: defaults?.html, fonts: defaults?.fonts }} diff={{ html: diff.html, fonts: diff.fonts }} onChange={(section, v) => updateField([section], v)} />}
            {activeTab === 'cache' && <CacheTab settings={settings.cache} defaults={defaults?.cache} diff={diff.cache} onChange={(v) => updateField(['cache'], v)} />}
            {activeTab === 'ai-build' && <AiBuildTab settings={{ ai: settings.ai, build: settings.build }} defaults={{ ai: defaults?.ai, build: defaults?.build }} diff={{ ai: diff.ai, build: diff.build }} onChange={(section, v) => updateField([section], v)} />}
          </>
        )}
      </div>
    </div>
  );
}
