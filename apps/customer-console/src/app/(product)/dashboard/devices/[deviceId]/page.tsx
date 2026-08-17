"use client";

import {
  ArrowLeft,
  BatteryCharging,
  CalendarCheck,
  Clock3,
  Gauge,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useCustomerPortal } from "@/components/product-shell";
import {
  formatDateTime,
  formatNumber,
  ProductErrorState,
  ProductPageHeader,
  ProductPanel,
  SimulationNotice,
  StatusPill
} from "@/components/product-ui";
import { useCustomerResource, withHousehold } from "@/lib/customer-api";
import type { CustomerDeviceDetail } from "@/lib/customer-types";
import { friendlyCategory } from "../page";

export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const searchParams = useSearchParams();
  const { selectedHousehold } = useCustomerPortal();
  const householdSelector = searchParams.get("household") || selectedHousehold;
  const resource = useCustomerResource<CustomerDeviceDetail>(
    withHousehold(
      `/api/dashboard/devices/${encodeURIComponent(params.deviceId)}`,
      householdSelector
    ),
    { refreshIntervalMs: 30000 }
  );

  if (resource.loading) {
    return <div className="product-panel h-[560px] animate-pulse" />;
  }
  if (resource.error || !resource.data) {
    return <ProductErrorState message={resource.error || "Device data is unavailable."} onRetry={resource.refresh} />;
  }

  const { device, recent_usage: usage } = resource.data;
  return (
    <>
      <Link
        href={`/dashboard/devices${
          householdSelector ? `?household=${encodeURIComponent(householdSelector)}` : ""
        }`}
        className="mb-5 inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to device inventory
      </Link>
      <ProductPageHeader
        eyebrow={friendlyCategory(device.device_category)}
        title={device.display_name}
        description="Current state, recent energy use, flexibility availability and simulated event participation."
        action={<StatusPill label={device.online ? "Online" : "Offline"} tone={device.online ? "green" : "neutral"} />}
      />
      <SimulationNotice />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DetailMetric icon={Zap} label="Current power" value={device.current_power_kw === null ? "Unavailable" : `${formatNumber(device.current_power_kw)} kW`} />
        <DetailMetric icon={Gauge} label="Energy today" value={device.energy_used_today_kwh === null ? "Unavailable" : `${formatNumber(device.energy_used_today_kwh)} kWh`} />
        <DetailMetric icon={BatteryCharging} label="Flexible power" value={device.flexibility_available ? `${formatNumber(device.flexibility_available_kw)} kW` : "Not available"} />
        <DetailMetric icon={Clock3} label="Last seen" value={formatDateTime(device.last_seen)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
        <ProductPanel>
          <div className="mb-5">
            <h2 className="text-base font-semibold text-white">Recent power usage</h2>
            <p className="mt-1 text-xs text-slate-500">Bounded 15-minute averages from the last 24 hours.</p>
          </div>
          {usage.length ? (
            <div className="h-72 w-full" aria-label="Recent device power usage chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={usage}>
                  <CartesianGrid stroke="rgba(148,163,184,0.09)" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    stroke="#64748b"
                    fontSize={11}
                    minTickGap={28}
                  />
                  <YAxis stroke="#64748b" fontSize={11} width={42} unit=" kW" />
                  <Tooltip
                    labelFormatter={(value) => formatDateTime(String(value))}
                    formatter={(value) => [`${formatNumber(Number(value))} kW`, "Power"]}
                    contentStyle={{ background: "#09141f", border: "1px solid rgba(103,232,249,.2)", borderRadius: 6 }}
                  />
                  <Line type="monotone" dataKey="power_kw" stroke="#67e8f9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="grid h-72 place-items-center text-center text-sm text-slate-500">
              A recent usage chart will appear after sufficient telemetry arrives.
            </div>
          )}
        </ProductPanel>

        <div className="space-y-5">
          <ProductPanel>
            <h2 className="text-sm font-semibold text-white">Device state</h2>
            <div className="mt-4 space-y-3">
              <StateRow label="Operating state" value={device.operating_state} />
              <StateRow label="Category" value={friendlyCategory(device.device_category)} />
              <StateRow label="Profile" value={device.household_profile?.replaceAll("_", " ") || "Not configured"} />
              {device.battery_soc_percent !== null ? <StateRow label="Battery charge" value={`${formatNumber(device.battery_soc_percent, 1)}%`} /> : null}
              {device.indoor_temperature_c !== null ? <StateRow label="Indoor temperature" value={`${formatNumber(device.indoor_temperature_c, 1)} C`} /> : null}
              {device.water_temperature_c !== null ? <StateRow label="Water temperature" value={`${formatNumber(device.water_temperature_c, 1)} C`} /> : null}
            </div>
          </ProductPanel>

          <ProductPanel>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <CalendarCheck className="h-4 w-4 text-emerald-300" />
              Flexibility participation
            </h2>
            {device.latest_simulated_command ? (
              <div className="mt-4">
                <p className="text-sm text-slate-200">{device.latest_simulated_command.action.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(device.latest_simulated_command.time)}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No simulated event participation recorded.</p>
            )}
            <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-300/15 bg-emerald-300/[0.05] p-3 text-xs text-emerald-200">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              No real device action is enabled.
            </div>
          </ProductPanel>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            Simulated device telemetry, processed through the live pipeline.
          </div>
        </div>
      </div>
    </>
  );
}

function DetailMetric({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <ProductPanel>
      <Icon className="h-4 w-4 text-cyan-300" />
      <p className="mt-5 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </ProductPanel>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right capitalize text-slate-200">{value}</span>
    </div>
  );
}
