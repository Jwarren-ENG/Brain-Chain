"use client";

import { cn, classificationStyles } from "@/lib/utils";
import type { Classification } from "@brainchain/shared";
import { AlertTriangle, Check, Info, Loader2, ShieldAlert, X } from "lucide-react";
import * as React from "react";

/* ------------------------------------------------------------------ Button */
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-[13px]",
        // Design language: primary buttons are the surface inverse (light on
        // dark, dark on light) — not the accent color.
        variant === "primary" && "bg-btn text-btn-ink hover:opacity-90",
        variant === "secondary" &&
          "border border-line-strong bg-transparent font-medium text-ink hover:bg-panel-2",
        variant === "ghost" && "font-medium text-ink-2 hover:bg-panel-2 hover:text-ink",
        variant === "danger" && "bg-crit text-white hover:opacity-90",
        variant === "success" && "bg-good text-[#0b1710] hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------- Card */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-line bg-panel", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  sub,
  action,
  icon,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="text-ink-3 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-2">
            {title}
          </h3>
          {sub && <p className="mt-1 text-xs normal-case tracking-normal text-ink-3">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "accent" | "good" | "warn" | "crit" | "serious";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-panel-2 text-ink-2",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "good" && "bg-good/12 text-good",
        tone === "warn" && "bg-warn/12 text-warn",
        tone === "serious" && "bg-serious/12 text-serious",
        tone === "crit" && "bg-crit/12 text-crit",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ClassificationBadge({ classification }: { classification: Classification }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
        classificationStyles[classification.name] ?? "bg-panel-2 text-ink-2",
      )}
      title={`Security classification: ${classification.name} (level ${classification.level})`}
    >
      <ShieldAlert className="size-3" aria-hidden />
      {classification.name}
    </span>
  );
}

export function FreshnessDot({ freshness }: { freshness: string }) {
  const color =
    freshness === "fresh" ? "bg-good" : freshness === "recent" ? "bg-warn" : "bg-ink-3";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3" title={`Data freshness: ${freshness}`}>
      <span className={cn("size-1.5 rounded-full", color)} aria-hidden />
      {freshness}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, { tone: "neutral" | "accent" | "good" | "warn" | "crit" | "serious"; icon?: React.ReactNode }> = {
    completed: { tone: "good", icon: <Check className="size-3" /> },
    connected: { tone: "good", icon: <Check className="size-3" /> },
    healthy: { tone: "good", icon: <Check className="size-3" /> },
    success: { tone: "good", icon: <Check className="size-3" /> },
    approved: { tone: "good", icon: <Check className="size-3" /> },
    executed_dry_run: { tone: "accent", icon: <Check className="size-3" /> },
    executed: { tone: "good", icon: <Check className="size-3" /> },
    done: { tone: "good", icon: <Check className="size-3" /> },
    open: { tone: "neutral" },
    in_progress: { tone: "accent" },
    queued: { tone: "neutral" },
    retrieving: { tone: "accent" },
    planning: { tone: "accent" },
    executing: { tone: "accent" },
    verifying: { tone: "accent" },
    awaiting_approval: { tone: "warn", icon: <AlertTriangle className="size-3" /> },
    pending: { tone: "warn", icon: <AlertTriangle className="size-3" /> },
    degraded: { tone: "warn", icon: <AlertTriangle className="size-3" /> },
    paused: { tone: "neutral" },
    blocked: { tone: "crit", icon: <AlertTriangle className="size-3" /> },
    failing: { tone: "crit", icon: <X className="size-3" /> },
    failed: { tone: "crit", icon: <X className="size-3" /> },
    rejected: { tone: "crit", icon: <X className="size-3" /> },
    error: { tone: "crit", icon: <X className="size-3" /> },
    superseded: { tone: "neutral" },
    active: { tone: "good" },
    submitted: { tone: "good" },
    draft: { tone: "neutral" },
  };
  const cfg = map[status] ?? { tone: "neutral" as const };
  return (
    <Badge tone={cfg.tone}>
      {cfg.icon}
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

/* ---------------------------------------------------------------- Skeleton */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse-soft rounded-md bg-panel-2", className)} aria-hidden />;
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="p-4 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </Card>
  );
}

/* -------------------------------------------------------------- EmptyState */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="text-ink-3 mb-1">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="text-xs text-ink-3 max-w-sm">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-crit/30 bg-crit/5 px-6 py-8 text-center">
      <AlertTriangle className="size-6 text-crit" aria-hidden />
      <p className="text-sm text-ink">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Inputs */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9.5 w-full rounded-lg border border-line-strong bg-panel px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-line-strong bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent",
        className,
      )}
      {...props}
    />
  );
});

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9.5 rounded-lg border border-line-strong bg-panel px-2.5 text-sm text-ink focus:border-accent",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/* -------------------------------------------------------------------- Tabs */
export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: string; label: React.ReactNode }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-lg bg-panel-2 p-1 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === tab.key
              ? "bg-panel text-ink shadow-sm border border-line"
              : "text-ink-2 hover:text-ink",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Dialog */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "w-full rounded-xl border border-line bg-panel shadow-2xl max-h-[80vh] flex flex-col",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-ink-3 hover:bg-panel-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto scroll-thin p-5">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Stat */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "good" | "warn" | "crit";
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "good" && "text-good",
          tone === "warn" && "text-warn",
          tone === "crit" && "text-crit",
          !tone && "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </Card>
  );
}

/* ----------------------------------------------------------------- Spinner */
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-3">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

/* ---------------------------------------------------------------- InfoNote */
export function InfoNote({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "privacy";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed",
        tone === "info" && "border-accent/25 bg-accent-soft/60 text-ink-2",
        tone === "warn" && "border-warn/30 bg-warn/8 text-ink-2",
        tone === "privacy" && "border-good/30 bg-good/8 text-ink-2",
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------- Table */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto scroll-thin rounded-xl border border-line", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-line bg-panel-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-3",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-line px-3 py-2.5 align-top text-ink-2", className)}>{children}</td>;
}
