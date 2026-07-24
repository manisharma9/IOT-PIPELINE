"use client";

import {
  BatteryCharging,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gauge,
  Power,
  RefreshCw,
  Thermometer,
  ToggleRight,
  Zap
} from "lucide-react";
import { useState } from "react";
import { useCustomerPortal } from "@/components/product-shell";
import {
  EmptyProductState,
  formatDateTime,
  formatNumber,
  ProductErrorState,
  ProductPageHeader,
  ProductPanel,
  SimulationNotice,
  StatusPill
} from "@/components/product-ui";
import { useCustomerResource, withHousehold } from "@/lib/customer-api";
import type { CustomerDevice, CustomerDevices } from "@/lib/customer-types";

const PAGE_SIZE = 12;

export default function ConnectedDevicesPage() {
  const { selectedHousehold } = useCustomerPortal();
  const [offset, setOffset] = useState(0);
  const devices = useCustomerResource<CustomerDevices>(
    withHousehold(
      `/api/customer/devices?limit=${PAGE_SIZE}&offset=${offset}`,
      selectedHousehold
    )
  );
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((devices.data?.total || 0) / PAGE_SIZE));

  return (
    <>
      <ProductPageHeader
        eyebrow="Connected devices"
        title="Your household energy devices"
        description="See the current state, energy contribution and flexibility availability of each simulated household asset."
        action={(
          <button
            type="button"
            className="product-secondary-button"
            onClick={devices.refresh}
            disabled={devices.refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${devices.refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      />
      <SimulationNotice />

      {devices.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="product-panel h-80 animate-pulse" />
          ))}
        </div>
      ) : devices.error ? (
        <ProductErrorState message={devices.error} onRetry={devices.refresh} />
      ) : devices.data?.devices.length ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              {devices.data.total} connected {devices.data.total === 1 ? "device" : "devices"}
            </p>
            <StatusPill
              label={`${devices.data.devices.filter((device) => device.online).length} active on this page`}
              tone="green"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {devices.data.devices.map((device) => (
              <DeviceCard key={device.device_id} device={device} />
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              className="product-secondary-button"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-sm text-slate-400">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="product-secondary-button"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= devices.data.total}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : (
        <EmptyProductState
          title="No connected devices yet"
          message="Simulated smart plugs, EV chargers and heat pumps will appear after their first telemetry update."
        />
      )}
    </>
  );
}

function DeviceCard({ device }: { device: CustomerDevice }) {
  const Icon = device.device_type === "ev_charger"
    ? BatteryCharging
    : device.device_type === "heat_pump"
      ? Thermometer
      : Power;
  return (
    <ProductPanel className="flex min-h-[330px] flex-col">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-300">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">{device.display_name}</h2>
            <p className="mt-1 truncate text-xs text-slate-500">{device.device_id}</p>
          </div>
        </div>
        <StatusPill label={device.online ? "Active" : "Offline"} tone={device.online ? "green" : "neutral"} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <DeviceMetric
          label="Current power"
          value={device.current_power_kw === null ? "Unavailable" : `${formatNumber(device.current_power_kw)} kW`}
          icon={<Zap className="h-3.5 w-3.5" />}
        />
        <DeviceMetric
          label="Energy today"
          value={device.energy_used_today_kwh === null ? "Unavailable" : `${formatNumber(device.energy_used_today_kwh)} kWh`}
          icon={<Gauge className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="mt-5 space-y-3 border-t border-white/8 pt-4">
        <DeviceDetail label="Operating state" value={device.operating_state} />
        {device.indoor_temperature_c !== null ? (
          <DeviceDetail
            label="Indoor temperature"
            value={`${formatNumber(device.indoor_temperature_c, 1)}°C`}
          />
        ) : null}
        {device.target_temperature_c !== null ? (
          <DeviceDetail
            label="Target temperature"
            value={`${formatNumber(device.target_temperature_c, 1)}°C`}
          />
        ) : null}
        <DeviceDetail
          label="Flexibility"
          value={
            device.flexibility_available
              ? `${formatNumber(device.flexibility_available_kw)} kW available`
              : "Not currently available"
          }
        />
        <DeviceDetail label="Last seen" value={formatDateTime(device.last_seen)} />
      </div>

      <div className="mt-auto pt-5">
        {device.latest_simulated_command ? (
          <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.05] p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-200">
              <ToggleRight className="h-4 w-4" />
              Latest simulated instruction
            </div>
            <p className="mt-2 text-sm text-slate-300">
              {friendlyAction(device.latest_simulated_command.action)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatDateTime(device.latest_simulated_command.time)} · No physical action
            </p>
          </div>
        ) : (
          <p className="inline-flex items-center gap-2 text-xs text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            No event participation recorded
          </p>
        )}
      </div>
    </ProductPanel>
  );
}

function DeviceMetric({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-white/[0.035] p-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function DeviceDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-300">{value}</span>
    </div>
  );
}

function friendlyAction(value: string) {
  const labels: Record<string, string> = {
    turn_off: "Pause smart-plug load",
    turn_on: "Restore smart-plug load",
    reduce_load: "Reduce smart-plug load",
    restore_load: "Restore smart-plug load",
    pause_charging: "Pause EV charging",
    resume_charging: "Resume EV charging",
    reduce_charging_power: "Reduce EV charging power",
    restore_charging_power: "Restore EV charging power",
    reduce_heat_pump_power: "Reduce heat-pump output",
    restore_heat_pump_power: "Restore heat-pump output"
  };
  return labels[value] || value.replaceAll("_", " ");
}

