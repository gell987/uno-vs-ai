"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "uno";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_4px_0_#b45309,0_10px_24px_rgb(0_0_0/0.35)] hover:brightness-105 active:translate-y-[2px] active:shadow-[0_2px_0_#b45309]",
  secondary: "glass text-white hover:bg-white/15 active:bg-white/20",
  ghost: "text-white/80 hover:bg-white/10 hover:text-white",
  danger: "bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-[0_4px_0_#881337] hover:brightness-110 active:translate-y-[2px]",
  uno: "bg-gradient-to-b from-[#ff5a4f] to-[#c81e1e] text-white shadow-[0_4px_0_#7f1d1d,0_10px_28px_rgb(232_53_46/0.45)] hover:brightness-110 active:translate-y-[2px] active:shadow-[0_2px_0_#7f1d1d]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-14 px-7 text-lg" };
  return (
    <button
      type="button"
      className={`inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition disabled:pointer-events-none disabled:opacity-40 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`glass inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/85 transition hover:bg-white/15 hover:text-white ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-4 py-2 ${disabled ? "cursor-not-allowed opacity-45" : ""}`}>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-white">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-white/60">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-7 w-12 rounded-full bg-white/15 transition peer-checked:bg-emerald-400 peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-amber-300" />
        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full rounded-xl bg-black/30 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`min-h-9 flex-1 rounded-lg px-2 text-sm font-semibold transition ${
              active ? "bg-white text-emerald-950 shadow" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  dismissable = true,
  wide = false,
  labelledBy,
  overlay,
}: {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  dismissable?: boolean;
  wide?: boolean;
  labelledBy?: string;
  /** Rendered above the backdrop but outside the scrolling content (e.g. confetti). */
  overlay?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissable) onClose?.();
      }}
      onClick={(e) => {
        if (dismissable && e.target === ref.current) onClose?.();
      }}
      className={`m-auto max-h-[92dvh] w-[calc(100%-24px)] overflow-hidden rounded-3xl border border-white/10 bg-[#0e1a14] p-0 text-white shadow-[0_30px_80px_rgb(0_0_0/0.6)] open:animate-[modal-in_180ms_ease-out] ${
        wide ? "max-w-3xl" : "max-w-lg"
      }`}
    >
      {open && overlay}
      {open && (
        <div className="scrollbar-thin max-h-[92dvh] overflow-y-auto p-5 sm:p-7">
          {(title || (dismissable && onClose)) && (
            <div className="mb-4 flex items-start justify-between gap-4">
              {title && (
                <h2 id={labelledBy} className="font-display text-2xl leading-tight sm:text-3xl">
                  {title}
                </h2>
              )}
              {dismissable && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/80">{children}</kbd>;
}
