// Small UI primitives shared across the app. One generic numeric field (with optional
// paired slider) replaces a dozen near-identical inputs.

import { useEffect, useState, type ReactNode } from 'react';

export function Card({ title, subtitle, right, children, className = '' }: {
  title?: ReactNode; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-[var(--c-muted)]">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Btn({ children, onClick, variant = 'ghost', title, disabled }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger';
  title?: string; disabled?: boolean;
}) {
  const styles = {
    primary: 'bg-[var(--c-accent)] text-white hover:opacity-90',
    ghost: 'border border-[var(--c-border)] hover:bg-[var(--c-grid)]/40',
    danger: 'border border-[var(--c-border)] text-[var(--c-bad)] hover:bg-[var(--c-bad)]/10',
  }[variant];
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

/**
 * Numeric input that tolerates in-progress typing ("", "-", "1e") by keeping local text
 * and committing parsed values. `percent` fields display ×100. Optional paired slider.
 */
export function NumField({ label, value, onChange, min, max, step, prefix, suffix, percent, slider, help }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  percent?: boolean;
  /** [min, max, step] for a paired slider (in display units). */
  slider?: [number, number, number];
  help?: string;
}) {
  const display = percent ? Math.round(value * 10000) / 100 : value;
  const [text, setText] = useState(String(display));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(display));
  }, [display, focused]);

  const commit = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    onChange(percent ? n / 100 : n);
  };

  return (
    <label className="block text-xs" title={help}>
      <span className="mb-1 flex items-center justify-between text-[var(--c-ink-2)]">
        {label}
        {help && <span className="cursor-help text-[var(--c-muted)]">ⓘ</span>}
      </span>
      <span className="flex items-center gap-1 rounded-lg border border-[var(--c-border)] bg-[var(--c-page)] px-2 focus-within:border-[var(--c-accent)]">
        {prefix && <span className="text-[var(--c-muted)]">{prefix}</span>}
        <input
          className="w-full min-w-0 bg-transparent py-1.5 text-sm outline-none"
          inputMode="decimal"
          value={text}
          min={min}
          max={max}
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setText(String(display)); }}
          onChange={(e) => commit(e.target.value)}
        />
        {suffix && <span className="text-[var(--c-muted)]">{suffix}</span>}
      </span>
      {slider && (
        <input
          type="range"
          aria-label={`${label} slider`}
          className="mt-1 w-full"
          min={slider[0]}
          max={slider[1]}
          step={slider[2]}
          value={display}
          onChange={(e) => onChange(percent ? Number(e.target.value) / 100 : Number(e.target.value))}
        />
      )}
    </label>
  );
}

export function Select<T extends string>({ label, value, onChange, options }: {
  label?: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <label className="block text-xs">
      {label && <span className="mb-1 block text-[var(--c-ink-2)]">{label}</span>}
      <select
        className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-page)] px-2 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string;
}) {
  return (
    <div className="text-xs">
      {label && <span className="mb-1 block text-[var(--c-ink-2)]">{label}</span>}
      <div className="inline-flex rounded-lg border border-[var(--c-border)] p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              value === o.value ? 'bg-[var(--c-accent)] text-white' : 'text-[var(--c-ink-2)] hover:bg-[var(--c-grid)]/40'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-dashed border-[var(--c-border)] p-3 text-center text-xs text-[var(--c-muted)]">
    {children}
  </p>
);
