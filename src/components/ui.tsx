// Small UI primitives shared across the app. One generic numeric field (with optional
// paired slider) replaces a dozen near-identical inputs.

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function Card({ title, subtitle, right, children, className = '' }: {
  title?: ReactNode; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
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
 * Focusable help affordance (F28): an ⓘ button that opens a small popover on
 * click/Enter/Space, closing on Escape or outside mousedown. This is the accessible
 * channel for caveats — `title` attributes elsewhere are a hover-only bonus.
 */
export function Help({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={label ? `About ${label}` : 'More info'}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        // preventDefault: inside a <label>, the click must not activate the labeled input.
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className="grid h-4 w-4 place-items-center rounded-full text-[11px] leading-none text-[var(--c-muted)] hover:text-[var(--c-accent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--c-accent)]"
      >
        ⓘ
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute right-0 top-5 z-30 w-60 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-2.5 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-[var(--c-ink-2)] shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/**
 * Numeric input that tolerates in-progress typing ("", "-", "1e") by keeping local text
 * and committing parsed values. `percent` fields display ×100. Optional paired slider.
 * `min`/`max` are in DISPLAY units (like `slider`); typing commits unclamped so partial
 * numbers don't jump, but blur/Enter clamps the final value into range (D19).
 */
export function NumField({ label, value, onChange, min, max, step, prefix, suffix, percent, slider, help, ariaLabel }: {
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
  /** Accessible name when there is no visible label (e.g. grid cells named by column headers). */
  ariaLabel?: string;
}) {
  const display = percent ? Math.round(value * 10000) / 100 : value;
  const [text, setText] = useState(String(display));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Explicit association + aria-label: the Help ⓘ is a labelable <button> inside this
  // <label>, which would otherwise steal the implicit association and leave the input
  // unnamed for assistive tech.
  const id = useId();
  useEffect(() => {
    if (!focused) setText(String(display));
  }, [display, focused]);
  // Select-all once the focus swap (formatted → raw) has rendered: the swap resets any
  // selection the browser made on focus, which would turn "type to replace" into append.
  useEffect(() => {
    if (focused) inputRef.current?.select();
  }, [focused]);

  // At rest the value reads like a number ("120,000"); focus swaps to raw digits for
  // editing (F18). Percent fields are small and stay plain. Commas are stripped on
  // parse so pasting a formatted number still works.
  const atRest = percent ? String(display) : display.toLocaleString('en-US', { maximumFractionDigits: 10 });
  const parse = (raw: string) => Number(raw.replace(/,/g, ''));

  const commit = (raw: string) => {
    setText(raw);
    const n = parse(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    onChange(percent ? n / 100 : n);
  };

  const commitFinal = () => {
    setFocused(false);
    const n = parse(text);
    if (text.trim() === '' || !Number.isFinite(n)) {
      setText(String(display));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    onChange(percent ? clamped / 100 : clamped);
    setText(String(clamped));
  };

  return (
    <label htmlFor={id} className="block text-xs" title={help}>
      <span className="mb-1 flex items-center justify-between text-[var(--c-ink-2)]">
        {label}
        {help && <Help text={help} label={label} />}
      </span>
      <span className="flex items-center gap-1 rounded-lg border border-[var(--c-border)] bg-[var(--c-page)] px-2 focus-within:border-[var(--c-accent)]">
        {prefix && <span className="text-[var(--c-muted)]">{prefix}</span>}
        <input
          ref={inputRef}
          id={id}
          aria-label={ariaLabel ?? (label || undefined)}
          className="w-full min-w-0 bg-transparent py-1.5 text-base outline-none sm:text-sm"
          inputMode="decimal"
          value={focused ? text : atRest}
          min={min}
          max={max}
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={commitFinal}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
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
        className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-page)] px-2 py-1.5 text-base outline-none focus:border-[var(--c-accent)] sm:text-sm"
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

// ---------------------------------------------------------------------------
// Toast: one slot, auto-dismiss — announces state changes that used to happen
// silently (scenario switches) and replaces alert() for errors (F15/F17).

interface ToastMsg {
  text: string;
  action?: { label: string; run: () => void };
}

const ToastCtx = createContext<(t: ToastMsg) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((t: ToastMsg) => {
    setToast(t);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2.5 text-xs shadow-xl"
        >
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="whitespace-nowrap font-semibold text-[var(--c-accent)] hover:underline"
              onClick={() => { toast.action!.run(); setToast(null); }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss notification"
            className="text-[var(--c-muted)] hover:text-[var(--c-ink)]"
            onClick={() => setToast(null)}
          >
            ✕
          </button>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------------------
// Confirm: an in-page popover that replaces window.confirm — one-click for
// ordinary deletes, type-to-confirm for full wipes (F17).

export function Confirm({ title, body, confirmLabel = 'Confirm', typeWord, onConfirm, children, className = 'inline-flex' }: {
  title: string;
  body?: string;
  confirmLabel?: string;
  /** Require typing this word before the confirm button enables (full wipes). */
  typeWord?: string;
  onConfirm: () => void;
  /** Renders the trigger; call the provided function to open the popover. */
  children: (open: () => void) => ReactNode;
  /** Wrapper display class — e.g. "block w-full" when the trigger is a menu item. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  const armed = !typeWord || typed.trim() === typeWord;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const confirm = () => {
    setOpen(false);
    onConfirm();
  };

  return (
    <span ref={ref} className={`relative ${className}`}>
      {children(() => { setTyped(''); setOpen((v) => !v); })}
      {open && (
        <div
          role="dialog"
          aria-label={title}
          className="absolute right-0 top-8 z-40 w-60 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-left shadow-xl"
        >
          <p className="text-xs font-semibold">{title}</p>
          {body && <p className="mt-1 text-[11px] leading-relaxed text-[var(--c-muted)]">{body}</p>}
          {typeWord && (
            <input
              autoFocus
              aria-label={`Type ${typeWord} to confirm`}
              placeholder={typeWord}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && armed) confirm(); }}
              className="mt-2 w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-page)] px-2 py-1.5 text-base uppercase tracking-wide outline-none focus:border-[var(--c-accent)] sm:text-xs"
            />
          )}
          <div className="mt-2.5 flex justify-end gap-1.5">
            <Btn onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="danger" disabled={!armed} onClick={confirm}>{confirmLabel}</Btn>
          </div>
        </div>
      )}
    </span>
  );
}
