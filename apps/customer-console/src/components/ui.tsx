"use client";

import { CheckCircle2, Copy, Loader2, XCircle } from "lucide-react";
import { useState } from "react";

export function PageHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-semibold text-white md:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone="amber">Local Mode</Badge>
        <Badge tone="emerald">Gateway Only</Badge>
      </div>
    </div>
  );
}

export function Card({
  title,
  value,
  description,
  children,
  tone = "neutral"
}: {
  title?: string;
  value?: string;
  description?: string;
  children?: React.ReactNode;
  tone?: "neutral" | "emerald" | "blue" | "amber" | "rose";
}) {
  const ring = {
    neutral: "border-white/10 bg-white/[0.045]",
    emerald: "border-emerald-300/20 bg-emerald-400/[0.075]",
    blue: "border-blue-300/20 bg-blue-400/[0.07]",
    amber: "border-amber-300/20 bg-amber-300/[0.08]",
    rose: "border-rose-300/20 bg-rose-300/[0.08]"
  }[tone];
  return (
    <section className={`rounded-md border p-4 shadow-2xl shadow-black/10 ${ring}`}>
      {title ? <p className="text-sm font-medium text-slate-300">{title}</p> : null}
      {value ? <p className="mt-2 text-2xl font-semibold text-white">{value}</p> : null}
      {description ? <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p> : null}
      {children ? <div className={title || value || description ? "mt-4" : ""}>{children}</div> : null}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "emerald" | "blue" | "amber" | "rose";
}) {
  const color = {
    neutral: "border-white/10 bg-white/6 text-slate-200",
    emerald: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
    blue: "border-blue-300/30 bg-blue-300/10 text-blue-100",
    amber: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    rose: "border-rose-300/30 bg-rose-300/10 text-rose-100"
  }[tone];
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${color}`}>{children}</span>;
}

export function JsonViewer({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="json-viewer scrollbar-thin max-h-[32rem] overflow-auto rounded-md border border-white/10 bg-black/30 p-4 text-xs leading-5 text-slate-200">
      {text || "No data yet."}
    </pre>
  );
}

export function CopyJsonButton({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/8"
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "Copied" : "Copy JSON"}
    </button>
  );
}

export function LoadingButton({
  children,
  loading,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button"
}: {
  children: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const classes = {
    primary: "border-emerald-300/30 bg-emerald-300/15 text-emerald-50 hover:bg-emerald-300/22",
    secondary: "border-white/10 bg-white/6 text-slate-100 hover:bg-white/10",
    danger: "border-rose-300/30 bg-rose-300/12 text-rose-100 hover:bg-rose-300/20"
  }[variant];
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-55 ${classes}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function StateLine({
  ok,
  label,
  detail
}: {
  ok?: boolean;
  label: string;
  detail: string;
}) {
  const Icon = ok === false ? XCircle : CheckCircle2;
  return (
    <div className="flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
      <Icon className={`mt-0.5 h-4 w-4 ${ok === false ? "text-rose-300" : "text-emerald-300"}`} />
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{message}</p>
    </div>
  );
}
