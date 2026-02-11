import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingFieldProps {
  label: string;
  description?: string;
  isOverridden?: boolean;
  onReset?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function SettingField({ label, description, isOverridden, onReset, children, className }: SettingFieldProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-3', className)}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{label}</label>
          {isOverridden && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
              Overridden
            </span>
          )}
          {isOverridden && onReset && (
            <button
              onClick={onReset}
              className="p-0.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
              title="Reset to default"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
        {description && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// Reusable toggle
export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'
      )} />
    </button>
  );
}

// Reusable slider
export function Slider({ value, min, max, step = 1, onChange }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32 accent-[hsl(var(--primary))]"
      />
      <span className="text-sm font-mono w-10 text-right">{value}</span>
    </div>
  );
}

// Reusable select
export function Select({ value, options, onChange }: {
  value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 px-2 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// Card wrapper for groups of settings
export function SettingCard({ title, children, description }: { title: string; children: React.ReactNode; description?: string }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] p-4 mb-4">
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      {description && <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">{description}</p>}
      <div className="divide-y divide-[hsl(var(--border))]">{children}</div>
    </div>
  );
}
