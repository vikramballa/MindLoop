"use client";

import Link from "next/link";
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Stagger index for `.animate-rise` children. */
export const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

/* ---------- Button ---------- */
type Variant = "primary" | "accent" | "secondary" | "ghost" | "quiet-danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:opacity-90 shadow-[0_8px_20px_-10px_rgb(var(--shadow)/0.6)]",
  accent: "bg-accent text-on-accent hover:brightness-[1.04] shadow-[0_8px_24px_-10px_color-mix(in_oklab,var(--accent)_70%,transparent)]",
  secondary: "bg-raised text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink-soft hover:text-ink hover:bg-surface-2",
  "quiet-danger": "bg-raised text-care border border-care-border hover:bg-care-soft",
};
const SIZES = { sm: "h-9 px-3.5 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-14 px-7 text-base" };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof SIZES;
  loading?: boolean;
  block?: boolean;
};

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] transition-[background-color,transform,box-shadow,opacity,filter] duration-200 ease-[var(--ease-out-soft)] active:scale-[0.97]";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        buttonBase,
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  block,
  className,
  children,
  onClick,
}: {
  href: string;
  variant?: Variant;
  size?: keyof typeof SIZES;
  block?: boolean;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className={cn(buttonBase, VARIANTS[variant], SIZES[size], block && "w-full", className)}>
      {children}
    </Link>
  );
}

/* ---------- Surfaces ---------- */
export function Card({
  className,
  children,
  as: As = "section",
  style,
  flush = false,
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article";
  style?: CSSProperties;
  /** No inner padding (for edge-to-edge lists). */
  flush?: boolean;
}) {
  return (
    <As className={cn("card", !flush && "p-5 sm:p-6", className)} style={style}>
      {children}
    </As>
  );
}

export function PageHeader({
  title,
  eyebrow,
  intro,
  children,
}: {
  title: ReactNode;
  eyebrow?: string;
  intro?: string;
  children?: ReactNode;
}) {
  return (
    <header className="animate-rise mb-7 flex flex-wrap items-end justify-between gap-3 px-1">
      <div className="max-w-xl">
        {eyebrow && <p className="mb-2 text-[13px] font-medium text-ink-faint">{eyebrow}</p>}
        <h1 className="font-display text-[2.6rem] leading-[1.02] tracking-[-0.035em] text-ink text-balance sm:text-5xl">{title}</h1>
        {intro && <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft text-pretty">{intro}</p>}
      </div>
      {children}
    </header>
  );
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
      <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "care" | "success"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-blue-soft text-ink border-transparent",
    care: "bg-care-soft text-care border-care-border",
    success: "bg-green-soft text-ink border-transparent",
  };
  return (
    <div role="status" className={cn("rounded-2xl border px-4 py-3 text-sm leading-relaxed", tones[tone], className)}>
      {children}
    </div>
  );
}

/* ---------- Chips & choices ---------- */
export function Chip({
  selected,
  onClick,
  children,
  className,
  disabled,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-95",
        selected
          ? "border-ink bg-ink text-bg"
          : "border-line bg-raised text-ink-soft hover:border-ink/30 hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  block,
}: {
  label: string;
  value: T | null | undefined;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  block?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex flex-wrap gap-1 rounded-[1.1rem] bg-surface-2 p-1", block && "flex w-full")}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-10 flex-auto whitespace-nowrap rounded-[0.85rem] px-3.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
              on ? "bg-raised text-ink shadow-[0_1px_3px_rgb(var(--shadow)/0.14)]" : "text-ink-soft hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <label htmlFor={id} className="text-[15px] text-ink">
        {label}
        {description && <span className="mt-0.5 block text-sm text-ink-faint">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
          checked ? "bg-ink" : "bg-surface-2 ring-1 ring-line ring-inset",
        )}
      >
        <span
          className={cn(
            "absolute top-1 left-1 h-5 w-5 rounded-full shadow transition-transform duration-300 ease-[var(--ease-spring)]",
            checked ? "translate-x-5 bg-accent" : "bg-raised",
          )}
        />
      </button>
    </div>
  );
}

/* ---------- Form fields ---------- */
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs leading-relaxed text-ink-faint">{hint}</p>}
      {error && (
        <p className="text-xs text-care" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const fieldClass =
  "w-full rounded-2xl border border-line bg-raised px-4 text-[15px] text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] focus:border-ink/40 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_35%,transparent)] focus:outline-none";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(fieldClass, "h-12", className)} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(fieldClass, "min-h-28 py-3 leading-relaxed", className)} {...rest} />;
  },
);

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(fieldClass, "h-12 appearance-none pr-10", className)} {...rest}>
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/* ---------- Feedback ---------- */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-2xl bg-surface-2", className)} />;
}

export function LoadingCard({ label, visible = false }: { label: string; visible?: boolean }) {
  return (
    <Card>
      <p className={visible ? "mb-4 text-[15px] text-ink-soft" : "sr-only"} role="status">
        {label}
      </p>
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </Card>
  );
}

/** Skeleton shaped like a page: header + hero + two tiles. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-5">
      <p className="sr-only" role="status">
        {label}
      </p>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-11 w-3/4" />
      <Skeleton className="h-56 w-full rounded-[var(--radius-card)]" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28 rounded-[var(--radius-card)]" />
        <Skeleton className="h-28 rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}
