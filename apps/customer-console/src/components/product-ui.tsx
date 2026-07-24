"use client";

import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Info,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import type { FlexibilityScoreResult } from "@/lib/customer-types";

export function ProductPageHeader({
  title,
  description,
  eyebrow,
  action
}: {
  title: string;
  description: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold text-cyan-300">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ProductPanel({
  children,
  className = "",
  title,
  description,
  action
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={`product-panel ${className}`}>
      {title || description || action ? (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title ? <h2 className="text-base font-semibold text-white">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm leading-5 text-slate-400">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  detail,
  icon,
  tone = "cyan"
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  icon?: React.ReactNode;
  tone?: "cyan" | "green" | "amber" | "neutral";
}) {
  const toneClass = {
    cyan: "text-cyan-300 bg-cyan-300/10 border-cyan-300/20",
    green: "text-emerald-300 bg-emerald-300/10 border-emerald-300/20",
    amber: "text-amber-300 bg-amber-300/10 border-amber-300/20",
    neutral: "text-slate-300 bg-white/[0.045] border-white/10"
  }[tone];
  return (
    <section className="product-panel min-h-36">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-400">{label}</p>
        {icon ? (
          <span className={`grid h-9 w-9 place-items-center rounded-lg border ${toneClass}`}>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-5 flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 break-words text-3xl font-semibold text-white">{value}</span>
        {unit ? <span className="text-sm font-medium text-slate-400">{unit}</span> : null}
      </div>
      {detail ? <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p> : null}
    </section>
  );
}

export function StatusPill({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "green" | "cyan" | "amber" | "red" | "neutral";
}) {
  const classes = {
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    neutral: "border-white/10 bg-white/[0.045] text-slate-300"
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}

export function SimulationNotice() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.055] px-4 py-3">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
      <p className="text-xs leading-5 text-slate-300 sm:text-sm">
        Controlled demonstration using simulated energy devices. No real household device control is enabled.
      </p>
    </div>
  );
}

export function LoadingGrid({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading energy information">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="product-panel h-36 animate-pulse">
          <div className="h-3 w-28 rounded bg-white/8" />
          <div className="mt-8 h-8 w-24 rounded bg-white/8" />
          <div className="mt-4 h-3 w-36 rounded bg-white/6" />
        </div>
      ))}
    </div>
  );
}

export function EmptyProductState({
  title,
  message
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
      <Info className="mx-auto h-5 w-5 text-slate-500" />
      <p className="mt-3 text-sm font-medium text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">{message}</p>
    </div>
  );
}

export function ProductErrorState({
  message,
  onRetry
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-rose-300/20 bg-rose-300/[0.055] p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
        <div>
          <p className="text-sm font-medium text-rose-100">Energy information unavailable</p>
          <p className="mt-1 text-sm leading-6 text-slate-400">{message}</p>
          {onRetry ? (
            <button type="button" className="product-secondary-button mt-4" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function LastUpdated({ value }: { value: string | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <Clock3 className="h-3.5 w-3.5" />
      {value ? `Updated ${formatRelativeTime(value)}` : "Waiting for data"}
    </span>
  );
}

export function DataQualityLabel({ quality }: { quality: string }) {
  const estimated = quality.includes("estimate");
  return (
    <StatusPill
      tone={estimated ? "amber" : "green"}
      label={estimated ? "Estimated" : "Measured"}
    />
  );
}

export function FlexibilityScoreCard({
  score
}: {
  score: FlexibilityScoreResult;
}) {
  if (!score.available || score.score === null) {
    return (
      <ProductPanel title="Household flexibility score">
        <EmptyProductState title="Not enough data yet" message={score.reason} />
      </ProductPanel>
    );
  }

  return (
    <ProductPanel title="Household flexibility score" description="An explainable score based on simulated controllable load, availability and event response.">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div
          className="grid h-32 w-32 shrink-0 place-items-center rounded-full border-[10px] border-emerald-300/20"
          aria-label={`Flexibility score ${score.score} out of 100`}
        >
          <div className="text-center">
            <p className="text-3xl font-semibold text-emerald-300">{score.score}</p>
            <p className="text-xs text-slate-500">out of 100</p>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {score.components.map((component) => {
            const points = component.points;
            const maximum = component.maximum;
            return (
              <div key={component.id}>
                <div className="mb-1 flex justify-between gap-3 text-xs">
                  <span className="truncate text-slate-300">{component.label}</span>
                  <span className="text-slate-500">{points} / {maximum}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-emerald-300"
                    style={{ width: `${Math.min(100, maximum ? (points / maximum) * 100 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ProductPanel>
  );
}

export function AIInsightCard({
  title,
  text,
  confidence
}: {
  title: string;
  text: string;
  confidence: number;
}) {
  return (
    <article className="border-b border-white/8 py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">
          <BrainCircuit className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <StatusPill label="AI-powered energy insight" tone="cyan" />
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
            Verified against supporting energy data · {Math.round(confidence * 100)}% confidence
          </p>
        </div>
      </div>
    </article>
  );
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-IE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value > 0 && value < 1 ? Math.min(2, digits) : 0
  }).format(value);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-IE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "at an unknown time";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const absolute = Math.abs(seconds);
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}

export function customerDeviceType(value: string) {
  return value === "shelly_plug"
    ? "Smart plug"
    : value === "ev_charger"
      ? "EV charger"
      : value === "heat_pump"
        ? "Heat pump"
        : "Energy device";
}
