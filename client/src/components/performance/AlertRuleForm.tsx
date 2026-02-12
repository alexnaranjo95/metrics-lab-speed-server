import { useState } from 'react';
import { Plus, Trash2, Bell, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertRule } from '@/lib/api';

interface AlertRuleFormProps {
  rules: AlertRule[];
  onCreateRule: (data: {
    metric: string;
    condition: string;
    value: number;
    severity: string;
    channels: string[];
    webhookUrl?: string;
    slackWebhookUrl?: string;
  }) => void;
  onToggleRule: (ruleId: string, enabled: boolean) => void;
  onDeleteRule: (ruleId: string) => void;
  className?: string;
}

const METRICS = [
  { value: 'performanceScore', label: 'Performance Score' },
  { value: 'lcp', label: 'LCP (ms)' },
  { value: 'tbt', label: 'TBT (ms)' },
  { value: 'cls', label: 'CLS' },
  { value: 'fcp', label: 'FCP (ms)' },
  { value: 'si', label: 'Speed Index (ms)' },
];

const CONDITIONS = [
  { value: 'decreases_by', label: 'Decreases by' },
  { value: 'exceeds_threshold', label: 'Exceeds threshold' },
  { value: 'below_threshold', label: 'Below threshold' },
];

const SEVERITIES = [
  { value: 'info', label: 'Info', color: 'text-[hsl(var(--primary))]' },
  { value: 'warning', label: 'Warning', color: 'text-[hsl(var(--warning))]' },
  { value: 'critical', label: 'Critical', color: 'text-[hsl(var(--destructive))]' },
];

export function AlertRuleForm({ rules, onCreateRule, onToggleRule, onDeleteRule, className }: AlertRuleFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [metric, setMetric] = useState('performanceScore');
  const [condition, setCondition] = useState('decreases_by');
  const [value, setValue] = useState(10);
  const [severity, setSeverity] = useState('warning');
  const [channels, setChannels] = useState<string[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [slackUrl, setSlackUrl] = useState('');

  const handleSubmit = () => {
    onCreateRule({
      metric,
      condition,
      value,
      severity,
      channels,
      webhookUrl: webhookUrl || undefined,
      slackWebhookUrl: slackUrl || undefined,
    });
    setShowForm(false);
    setWebhookUrl('');
    setSlackUrl('');
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Existing rules */}
      {rules.length === 0 && !showForm && (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">No alert rules configured</p>
      )}

      {rules.map(rule => (
        <div key={rule.id} className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2">
          <button
            onClick={() => onToggleRule(rule.id, !rule.enabled)}
            className="shrink-0"
          >
            {rule.enabled
              ? <Bell className="h-4 w-4 text-[hsl(var(--success))]" />
              : <BellOff className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            }
          </button>
          <div className="flex-1 min-w-0">
            <span className="text-sm">
              {METRICS.find(m => m.value === rule.metric)?.label || rule.metric}{' '}
              <span className="text-[hsl(var(--muted-foreground))]">
                {CONDITIONS.find(c => c.value === rule.condition)?.label || rule.condition}
              </span>{' '}
              <span className="font-medium">{rule.value}</span>
            </span>
          </div>
          <span className={cn(
            'text-xs font-medium',
            SEVERITIES.find(s => s.value === rule.severity)?.color
          )}>
            {rule.severity}
          </span>
          <button onClick={() => onDeleteRule(rule.id)} className="shrink-0 p-1 hover:bg-[hsl(var(--muted))] rounded">
            <Trash2 className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
          </button>
        </div>
      ))}

      {/* Add rule form */}
      {showForm ? (
        <div className="rounded-md border border-[hsl(var(--border))] p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select value={metric} onChange={e => setMetric(e.target.value)}
              className="text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5">
              {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={condition} onChange={e => setCondition(e.target.value)}
              className="text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5">
              {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input type="number" value={value} onChange={e => setValue(Number(e.target.value))}
              className="text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5"
              placeholder="Value" />
            <select value={severity} onChange={e => setSeverity(e.target.value)}
              className="text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5">
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Channels */}
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={channels.includes('webhook')}
                onChange={e => setChannels(prev => e.target.checked ? [...prev, 'webhook'] : prev.filter(c => c !== 'webhook'))} />
              Webhook
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={channels.includes('slack')}
                onChange={e => setChannels(prev => e.target.checked ? [...prev, 'slack'] : prev.filter(c => c !== 'slack'))} />
              Slack
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={channels.includes('email')}
                onChange={e => setChannels(prev => e.target.checked ? [...prev, 'email'] : prev.filter(c => c !== 'email'))} />
              Email
            </label>
          </div>

          {channels.includes('webhook') && (
            <input type="url" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
              placeholder="Webhook URL" className="w-full text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5" />
          )}
          {channels.includes('slack') && (
            <input type="url" value={slackUrl} onChange={e => setSlackUrl(e.target.value)}
              placeholder="Slack Webhook URL" className="w-full text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5" />
          )}

          <div className="flex gap-2">
            <button onClick={handleSubmit}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              Create Rule
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-[hsl(var(--border))]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-sm text-[hsl(var(--primary))] hover:underline">
          <Plus className="h-3.5 w-3.5" /> Add Alert Rule
        </button>
      )}
    </div>
  );
}
