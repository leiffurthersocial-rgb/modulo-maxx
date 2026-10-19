import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "text";

const styles: Record<Variant, string> = {
  primary: "h-14 w-full rounded-xl bg-accent text-lg font-medium text-accent-fg active:opacity-80 disabled:opacity-40",
  outline:
    "h-14 w-full rounded-xl border border-fg/80 text-lg font-medium active:bg-fg active:text-bg disabled:opacity-40",
  text: "text-sm text-muted underline-offset-4 hover:underline",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${styles[variant]} ${className}`} {...props} />;
}

export function Screen({ children, top }: { children: ReactNode; top?: ReactNode }) {
  return (
    <div className="fade-in flex flex-1 flex-col">
      {top && <div className="mb-6 flex items-center justify-between">{top}</div>}
      {children}
    </div>
  );
}

/** Thin horizontal bar, value 0..1. */
export function Bar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-line"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 ${value === o.value ? "bg-fg text-bg" : "text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
