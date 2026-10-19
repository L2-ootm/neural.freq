import { useId, type ReactNode } from 'react';
import { useStore, t } from '../store';
import type { Key } from '../i18n';

const ICONS: Record<string, string> = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6z',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
};

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="31" height="31" rx="2" fill="oklch(0.23 0.024 262)" stroke="oklch(1 0 0 / 14%)" />
      <g stroke="oklch(0.82 0.16 165)" strokeWidth="1" fill="none">
        <path d="M5 21c4-1 6-6 11-6s7 4 11 3" opacity=".45" />
        <path d="M5 16c4-1 6-6 11-6s7 4 11 3" />
        <path d="M5 11c4-1 6-6 11-6s7 4 11 3" opacity=".45" />
      </g>
    </svg>
  );
}

export function StatusChip() {
  const status = useStore((s) => s.engine.status);
  return (
    <span className="chip" data-state={status} role="status">
      <i aria-hidden="true" />
      {t(`status.${status}` as Key)}
    </span>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Text shown in the output and announced by screen readers, e.g. "10.0 Hz". */
  text: string;
  onChange: (v: number) => void;
  help?: string;
  disabled?: boolean;
}

export function Slider({ label, value, min, max, step, text, onChange, help, disabled }: SliderProps) {
  const id = useId();
  const hid = `${id}-h`;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <output className="num" htmlFor={id}>
          {text}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        aria-describedby={help ? hid : undefined}
        style={{ '--p': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      {help && (
        <p className="help" id={hid}>
          {help}
        </p>
      )}
    </div>
  );
}

interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.value === value);
            const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            e.stopPropagation();
            const n = options[(i + d + options.length) % options.length]!;
            onChange(n.value);
            queueMicrotask(() => (e.currentTarget.parentElement?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface TabDef {
  id: string;
  label: string;
}

/** Accessible tab list (arrow keys, Home/End). Panels are rendered by the caller with matching ids. */
export function Tabs({ tabs, value, onChange, label }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tb, i) => (
        <button
          key={tb.id}
          type="button"
          role="tab"
          id={`tab-${tb.id}`}
          aria-selected={tb.id === value}
          aria-controls={`panel-${tb.id}`}
          tabIndex={tb.id === value ? 0 : -1}
          onClick={() => onChange(tb.id)}
          onKeyDown={(e) => {
            const last = tabs.length - 1;
            const to = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + last) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
            if (to < 0) return;
            e.preventDefault();
            e.stopPropagation();
            onChange(tabs[to]!.id);
            queueMicrotask(() => document.getElementById(`tab-${tabs[to]!.id}`)?.focus());
          }}
        >
          {tb.label}
        </button>
      ))}
    </div>
  );
}
