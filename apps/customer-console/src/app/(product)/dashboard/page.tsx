"use client";

import {
  Activity,
  ArrowRight,
  BatteryCharging,
  CalendarClock,
  PlugZap,
  RefreshCw,
  Sparkles,
  Waves,
  Zap
} from "lucide-react";
import Link from "next/link";
import { EnergyUsageChart } from "@/components/energy-usage-chart";
import { useCustomerPortal } from "@/components/product-shell";
import {
  AIInsightCard,
  EmptyProductState,
  FlexibilityScoreCard,
  formatNumber,
  LastUpdated,
  LoadingGrid,
  MetricCard,
  ProductErrorState,
  ProductPageHeader,
  ProductPanel,
  SimulationNotice,
  StatusPill,
  customerDeviceType
} from "@/components/product-ui";
import {
  useCustomerResource,
  withHousehold
} from "@/lib/customer-api";
import type {
  CustomerAnalytics,
  CustomerDevices,
  CustomerInsights,
  CustomerSummary
} from "@/lib/customer-types";

export default function CustomerDashboardPage() {
  const { selectedHousehold, householdLabel } = useCustomerPortal();
  const summary = useCustomerResource<CustomerSummary>(
    withHousehold("/api/dashboard/summary", selectedHousehold),
    { refreshIntervalMs: 30000 }
  );
  const analytics = useCustomerResource<CustomerAnalytics>(
    withHousehold("/api/dashboard/analytics?range=24h", selectedHousehold),
    { refreshIntervalMs: 60000 }
  );
  const devices = useCustomerResource<CustomerDevices>(
    withHousehold("/api/dashboard/devices?limit=12&offset=0", selectedHousehold),
    { refreshIntervalMs: 30000 }
  );
  const insights = useCustomerResource<CustomerInsights>(
    withHousehold("/api/dashboard/insights", selectedHousehold)
  );

  async function refreshAll() {
    await Promise.all([
      summary.refresh(),
      analytics.refresh(),
      devices.refresh(),
      insights.refresh()
    ]);
  }

  const deviceBreakdown = Object.entries(
    (devices.data?.devices || []).reduce<Record<string, number>>((accumulator, device) => {
      accumulator[device.device_type] =
        (accumulator[device.device_type] || 0) + (device.current_power_kw || 0);
      return accumulator;
    }, {})
  ).sort((left, right) => right[1] - left[1]);
  const totalDevicePower = deviceBreakdown.reduce((sum, entry) => sum + entry[1], 0);

  return (
    <>
      <ProductPageHeader
        eyebrow="Household overview"
        title={`Good ${timeGreeting()}, ${householdLabel}.`}
        description="See how your household is using energy, where flexible demand is available, and how simulated grid events are progressing."
        action={(
          <button
            type="button"
            className="product-secondary-button"
            onClick={refreshAll}
            disabled={summary.refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${summary.refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      />
      <SimulationNotice />

      {summary.loading ? <LoadingGrid /> : null}
      {summary.error ? (
        <ProductErrorState message={summary.error} onRetry={summary.refresh} />
      ) : null}
      {summary.data ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <ProductPanel className="relative min-h-56 overflow-hidden">
              <div className="relative z-10 flex h-full flex-col justify-between gap-8 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusPill
                      label={
                        summary.data.connection.status === "live"
                          ? "Live connection"
                          : summary.data.connection.status === "stale"
                            ? "Connection delayed"
                            : "Waiting for telemetry"
                      }
                      tone={
                        summary.data.connection.status === "live"
                          ? "green"
                          : summary.data.connection.status === "stale"
                            ? "amber"
                            : "neutral"
                      }
                    />
                    <StatusPill label="Simulated" tone="cyan" />
                  </div>
                  <p className="mt-8 text-sm text-slate-400">Live household consumption</p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-3">
                    <span className="text-5xl font-semibold text-cyan-200 sm:text-6xl">
                      {formatNumber(summary.data.live_consumption_kw)}
                    </span>
                    {summary.data.live_consumption_kw !== null ? (
                      <span className="text-lg text-slate-400">kW</span>
                    ) : null}
                  </div>
                  <div className="mt-4">
                    <LastUpdated value={summary.data.connection.last_updated} />
                  </div>
                </div>
                <div className="grid h-32 w-32 shrink-0 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-200 sm:h-40 sm:w-40">
                  <Zap className="h-14 w-14" strokeWidth={1.35} aria-hidden="true" />
                </div>
              </div>
            </ProductPanel>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <MetricCard
                label="Flexible load available"
                value={formatNumber(summary.data.flexible_load_available_kw)}
                unit={summary.data.flexible_load_available_kw !== null ? "kW" : undefined}
                detail={
                  summary.data.flexible_load_available_kw !== null
                    ? "Estimated from connected simulated devices"
                    : "No eligible load is currently available"
                }
                icon={<BatteryCharging className="h-4 w-4" />}
                tone="green"
              />
              <MetricCard
                label="Current grid event"
                value={summary.data.current_grid_event?.display_status || "No active event"}
                detail={
                  summary.data.current_grid_event
                    ? `${formatNumber(summary.data.current_grid_event.target_kw)} kW requested`
                    : "Your household has no current flexibility request"
                }
                icon={<CalendarClock className="h-4 w-4" />}
                tone={summary.data.current_grid_event ? "amber" : "neutral"}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summary.data.energy_used_today_kwh !== null ? (
              <MetricCard
                label="Energy used today"
                value={formatNumber(summary.data.energy_used_today_kwh)}
                unit="kWh"
                detail={
                  summary.data.energy_used_today_quality.includes("estimate")
                    ? "Includes an estimate from sampled power"
                    : "Measured from simulated meter telemetry"
                }
                icon={<Activity className="h-4 w-4" />}
              />
            ) : null}
            <MetricCard
              label="Connected devices"
              value={`${summary.data.active_devices} of ${summary.data.total_devices}`}
              detail="Recently active simulated energy devices"
              icon={<PlugZap className="h-4 w-4" />}
              tone="green"
            />
            {summary.data.simulated_energy_shifted_today_kwh !== null ? (
              <MetricCard
                label="Energy shifted today"
                value={formatNumber(summary.data.simulated_energy_shifted_today_kwh)}
                unit="kWh"
                detail="Estimated simulated event outcome"
                icon={<Waves className="h-4 w-4" />}
                tone="amber"
              />
            ) : null}
          </div>
        </>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <ProductPanel
          title="Household power"
          description="Downsampled power measurements from the last 24 hours."
          action={(
            <Link href="/dashboard/analytics" className="product-secondary-button">
              Explore
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        >
          {analytics.loading ? (
            <div className="h-64 animate-pulse rounded-lg bg-white/[0.04]" />
          ) : analytics.error ? (
            <ProductErrorState message={analytics.error} onRetry={analytics.refresh} />
          ) : analytics.data?.points.length ? (
            <>
              <EnergyUsageChart points={analytics.data.points} compact />
              {analytics.data.partial_data ? (
                <p className="mt-3 text-xs text-amber-200">
                  Some time periods contain partial measurements.
                </p>
              ) : null}
            </>
          ) : (
            <EmptyProductState
              title="No energy history yet"
              message="Energy history will appear after the simulated devices have reported telemetry."
            />
          )}
        </ProductPanel>

        <ProductPanel title="Device contribution" description="Current power by connected device type.">
          {devices.loading ? (
            <div className="space-y-5">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-10 animate-pulse rounded bg-white/[0.04]" />
              ))}
            </div>
          ) : deviceBreakdown.length ? (
            <div className="space-y-5">
              {deviceBreakdown.map(([deviceType, power]) => {
                const percentage = totalDevicePower
                  ? Math.round((power / totalDevicePower) * 100)
                  : 0;
                return (
                  <div key={deviceType}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-300">{customerDeviceType(deviceType)}</span>
                      <span className="text-slate-500">
                        {formatNumber(power)} kW · {percentage}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-cyan-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <Link href="/dashboard/devices" className="product-secondary-button mt-2 w-full">
                View connected devices
              </Link>
            </div>
          ) : (
            <EmptyProductState
              title="No active device data"
              message="Current device contribution will appear when telemetry is available."
            />
          )}
        </ProductPanel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ProductPanel
          title="Energy insights"
          description="Concise observations generated from verified, aggregated household energy data."
          action={<Sparkles className="h-5 w-5 text-cyan-300" />}
        >
          {insights.loading ? (
            <div className="space-y-3">
              {[1, 2].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-lg bg-white/[0.04]" />
              ))}
            </div>
          ) : insights.error || insights.data?.status === "temporarily_unavailable" ? (
            <EmptyProductState
              title="Insights temporarily unavailable"
              message="Your energy metrics remain available while the insight service recovers."
            />
          ) : insights.data?.insights.length ? (
            <div className="space-y-3">
              {insights.data.insights.map((insight) => (
                <AIInsightCard
                  key={insight.insight_id}
                  title={insight.title}
                  text={insight.text}
                  confidence={insight.confidence}
                />
              ))}
            </div>
          ) : (
            <EmptyProductState
              title="Not enough data yet"
              message="Insights will be created after enough aggregated household energy data is available."
            />
          )}
        </ProductPanel>
        {summary.data ? (
          <FlexibilityScoreCard score={summary.data.flexibility_score} />
        ) : (
          <ProductPanel>
            <EmptyProductState
              title="Flexibility score unavailable"
              message="The score will appear when household and event data are available."
            />
          </ProductPanel>
        )}
      </div>
    </>
  );
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
