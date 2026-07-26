"use client";

import { Activity, CalendarRange, Gauge, RefreshCw, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { EnergyUsageChart } from "@/components/energy-usage-chart";
import { useCustomerPortal } from "@/components/product-shell";
import {
  DataQualityLabel,
  EmptyProductState,
  formatDateTime,
  formatNumber,
  MetricCard,
  ProductErrorState,
  ProductPageHeader,
  ProductPanel,
  SimulationNotice,
  StatusPill
} from "@/components/product-ui";
import { useCustomerResource, withHousehold } from "@/lib/customer-api";
import type { CustomerAnalytics } from "@/lib/customer-types";

type RangeValue = "24h" | "7d" | "30d" | "custom";

export default function EnergyAnalyticsPage() {
  const { selectedHousehold } = useCustomerPortal();
  const [range, setRange] = useState<RangeValue>("24h");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const resourcePath = useMemo(() => {
    let path = `/api/dashboard/analytics?range=${range}`;
    if (range === "custom" && customStart && customEnd) {
      path += `&start=${encodeURIComponent(new Date(customStart).toISOString())}`;
      path += `&end=${encodeURIComponent(new Date(customEnd).toISOString())}`;
    }
    return withHousehold(path, selectedHousehold);
  }, [range, customStart, customEnd, selectedHousehold]);
  const analytics = useCustomerResource<CustomerAnalytics>(resourcePath);

  const summary = useMemo(() => {
    const points = analytics.data?.points || [];
    if (!points.length) return null;
    const average = points.reduce((sum, point) => sum + point.total_power_kw, 0) / points.length;
    const peak = points.reduce((current, point) => (
      point.total_power_kw > current.total_power_kw ? point : current
    ), points[0]);
    const contribution = {
      smartPlug: points.reduce((sum, point) => sum + point.smart_plug_power_kw, 0) / points.length,
      evCharger: points.reduce((sum, point) => sum + point.ev_charger_power_kw, 0) / points.length,
      heatPump: points.reduce((sum, point) => sum + point.heat_pump_power_kw, 0) / points.length
    };
    return { average, peak, contribution };
  }, [analytics.data]);

  return (
    <>
      <ProductPageHeader
        eyebrow="Energy analytics"
        title="Understand when and where energy is used"
        description="Explore bounded, downsampled household power history with separate contributions from your simulated smart plug, EV charger and heat pump."
        action={(
          <button
            type="button"
            className="product-secondary-button"
            onClick={analytics.refresh}
            disabled={analytics.refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${analytics.refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      />
      <SimulationNotice />

      <ProductPanel className="mb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-white">Time period</p>
            <p className="mt-1 text-xs text-slate-500">Charts are limited to 31 days and at most 500 points.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Analytics time period">
            {([
              ["24h", "24 hours"],
              ["7d", "7 days"],
              ["30d", "30 days"],
              ["custom", "Custom"]
            ] as Array<[RangeValue, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={range === value ? "product-primary-button" : "product-secondary-button"}
                onClick={() => setRange(value)}
                aria-pressed={range === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {range === "custom" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Start date
              <input
                type="datetime-local"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                className="product-select mt-1.5 w-full"
              />
            </label>
            <label className="text-xs text-slate-400">
              End date
              <input
                type="datetime-local"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="product-select mt-1.5 w-full"
              />
            </label>
          </div>
        ) : null}
      </ProductPanel>

      {analytics.loading ? (
        <div className="product-panel h-[28rem] animate-pulse" />
      ) : analytics.error ? (
        <ProductErrorState message={analytics.error} onRetry={analytics.refresh} />
      ) : analytics.data?.points.length && summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Average household power"
              value={formatNumber(summary.average)}
              unit="kW"
              detail={analytics.data.range.label}
              icon={<Activity className="h-4 w-4" />}
            />
            <MetricCard
              label="Peak household power"
              value={formatNumber(summary.peak.total_power_kw)}
              unit="kW"
              detail={formatDateTime(summary.peak.bucket_start)}
              icon={<Zap className="h-4 w-4" />}
              tone="amber"
            />
            <MetricCard
              label="Measurements represented"
              value={formatNumber(
                analytics.data.points.reduce((sum, point) => sum + point.sample_count, 0),
                0
              )}
              detail={`${analytics.data.points.length} downsampled chart points`}
              icon={<Gauge className="h-4 w-4" />}
              tone="green"
            />
          </div>

          <ProductPanel
            className="mt-4"
            title="Power usage over time"
            description="Power is measured in kilowatts. Hover or focus chart points for the recorded value."
            action={<DataQualityLabel quality={analytics.data.data_quality} />}
          >
            <EnergyUsageChart points={analytics.data.points} />
            {analytics.data.partial_data ? (
              <div className="mt-4 rounded-lg border border-amber-300/15 bg-amber-300/[0.055] p-3 text-sm text-amber-100">
                Some time periods contain partial data. Available measurements are shown without filling gaps.
              </div>
            ) : null}
          </ProductPanel>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
            <ProductPanel title="Average device contribution">
              <div className="space-y-5">
                {[
                  ["EV charger", summary.contribution.evCharger, "bg-emerald-300"],
                  ["Heat pump", summary.contribution.heatPump, "bg-amber-300"],
                  ["Smart plug", summary.contribution.smartPlug, "bg-violet-300"]
                ].map(([label, value, color]) => {
                  const power = Number(value);
                  const share = summary.average > 0
                    ? Math.min(100, (power / summary.average) * 100)
                    : 0;
                  return (
                    <div key={String(label)}>
                      <div className="mb-2 flex justify-between gap-4 text-sm">
                        <span className="text-slate-300">{label}</span>
                        <span className="text-slate-500">{formatNumber(power)} kW</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/8">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ProductPanel>
            <ProductPanel
              title="Flexibility event overlays"
              description="Grid-event periods that overlap the selected energy range."
              action={<CalendarRange className="h-5 w-5 text-cyan-300" />}
            >
              {analytics.data.flexibility_events.length ? (
                <div className="space-y-3">
                  {analytics.data.flexibility_events.map((event) => (
                    <div key={event.proposal_id} className="flex flex-col gap-2 border-b border-white/8 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">{event.display_status}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(event.start_time)} to {formatDateTime(event.end_time)}
                        </p>
                      </div>
                      <StatusPill label={`${formatNumber(event.target_kw)} kW requested`} tone="amber" />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyProductState
                  title="No events in this period"
                  message="There are no flexibility-event overlays for the selected time range."
                />
              )}
            </ProductPanel>
          </div>

          <ProductPanel className="mt-4" title="Accessible chart summary">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="pb-3 font-medium">Time</th>
                    <th className="pb-3 font-medium">Total</th>
                    <th className="pb-3 font-medium">EV charger</th>
                    <th className="pb-3 font-medium">Heat pump</th>
                    <th className="pb-3 font-medium">Smart plug</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.data.points.slice(-12).map((point) => (
                    <tr key={point.bucket_start} className="border-t border-white/8 text-slate-300">
                      <td className="py-3">{formatDateTime(point.bucket_start)}</td>
                      <td className="py-3">{formatNumber(point.total_power_kw)} kW</td>
                      <td className="py-3">{formatNumber(point.ev_charger_power_kw)} kW</td>
                      <td className="py-3">{formatNumber(point.heat_pump_power_kw)} kW</td>
                      <td className="py-3">{formatNumber(point.smart_plug_power_kw)} kW</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ProductPanel>
        </>
      ) : (
        <EmptyProductState
          title="No energy history for this period"
          message="Choose another period or allow the simulated devices to report telemetry."
        />
      )}
    </>
  );
}
