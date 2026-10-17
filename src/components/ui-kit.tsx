import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ n, title, sub, children }: { n: number; title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
      <div>
        <div className="eyebrow">Screen {n} of 8</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{sub}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ title, note, children, className, actions }: { title?: string; note?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-md border border-border bg-card", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Metric({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className={cn("rounded-md border border-border bg-card p-4", accent && "border-l-4 border-l-primary")}>
      <div className="eyebrow">{label}</div>
      <div className="num mt-2 text-xl font-semibold text-foreground">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
export function toneFor(s: string = ""): Tone {
  const x = s.toLowerCase();
  if (/(blocked|failed|reject|high|breach|exit)/.test(x)) return "bad";
  if (/(pending|validation|needs|review|warn|medium|open|insufficient|consolidate|draft|investigat)/.test(x)) return "warn";
  if (/(executed|reconciled|approved|validated|success|matched|retain|eligible|resolved|closed|low|complete)/.test(x)) return "ok";
  if (/(scheduled|simulated)/.test(x)) return "info";
  return "neutral";
}
const toneCls: Record<Tone, string> = {
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  bad: "bg-danger-soft text-danger",
  info: "bg-info-soft text-foreground",
  neutral: "bg-muted text-muted-foreground",
};
export function Status({ children, tone }: { children: ReactNode; tone?: Tone }) {
  const t = tone ?? toneFor(String(children));
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[0.7rem] font-medium", toneCls[t])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Btn({ children, onClick, variant = "outline", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "outline" | "ink" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  const v = {
    primary: "bg-primary text-primary-foreground hover:brightness-95 border-primary",
    outline: "bg-card text-foreground border-border hover:bg-muted",
    ink: "bg-ink text-ink-foreground border-ink hover:opacity-90",
    danger: "bg-card text-danger border-danger/40 hover:bg-danger-soft",
  }[variant];
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={cn("inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40", v)}>
      {children}
    </button>
  );
}

export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="eyebrow">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-sm border border-input bg-card px-2 py-1.5 text-xs text-foreground">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 border-l-2 border-primary bg-accent px-3 py-2 text-xs text-secondary-foreground">{children}</p>;
}
