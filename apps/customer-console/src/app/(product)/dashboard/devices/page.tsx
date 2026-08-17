"use client";

import {
  Activity,
  BatteryCharging,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CirclePower,
  Filter,
  Gauge,
  PlugZap,
  RefreshCw,
  Search,
  Thermometer,
  Wifi,
  Zap
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
const CATEGORIES = [
  "smart_meter",
  "smart_plug",
  "refrigerator",
  "washing_machine",
  "clothes_dryer",
  "dishwasher",
  "lighting_circuit",
  "ev_charger",
  "heat_pump",
  "thermostat_hvac",
  "water_heater",
  "solar_inverter",
  "home_battery"
];

export default function ConnectedDevicesPage() {
  const { selectedHousehold } = useCustomerPortal();
  const [page, setPage] = useState<{ household: string | null; offset: number }>({
    household: selectedHousehold,
    offset: 0
  });
  const offset = page.household === selectedHousehold ? page.offset : 0;
  const setOffset = (value: number) => setPage({
    household: selectedHousehold,
    offset: value
  });
  const [category, setCategory] = useState("");
  const [profile, setProfile] = useState("");
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState("");
  const [flexible, setFlexible] = useState("");
  const [state, setState] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset)
    });
    if (category) params.set("category", category);
    if (profile) params.set("profile", profile);
    if (search.trim()) params.set("search", search.trim());
    if (online) params.set("online", online);
    if (flexible) params.set("flexible", flexible);
    if (state) params.set("state", state);
    return `/api/dashboard/devices?${params}`;
  }, [category, flexible, offset, online, profile, search, state]);

  const devices = useCustomerResource<CustomerDevices>(
    withHousehold(query, selectedHousehold),
    { refreshIntervalMs: 30000 }
  );
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((devices.data?.total || 0) / PAGE_SIZE));

  return (
    <>
      <ProductPageHeader
        eyebrow="Connected devices"
        title="Household device inventory"
        description="Explore the latest measured simulation state across appliances, heating, charging, generation and storage."
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

      <DeviceFilters
        category={category}
        profile={profile}
        search={search}
        online={online}
        flexible={flexible}
        state={state}
        onCategory={(value) => { setCategory(value); setOffset(0); }}
        onProfile={(value) => { setProfile(value); setOffset(0); }}
        onSearch={(value) => { setSearch(value); setOffset(0); }}
        onOnline={(value) => { setOnline(value); setOffset(0); }}
        onFlexible={(value) => { setFlexible(value); setOffset(0); }}
        onState={(value) => { setState(value); setOffset(0); }}
        onClear={() => {
          setCategory("");
          setProfile("");
          setSearch("");
          setOnline("");
          setFlexible("");
          setState("");
          setOffset(0);
        }}
      />

      {devices.data ? <DeviceSummary data={devices.data} /> : null}

      {devices.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="product-panel h-72 animate-pulse" />
          ))}
        </div>
      ) : devices.error ? (
        <ProductErrorState message={devices.error} onRetry={devices.refresh} />
      ) : devices.data?.devices.length ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, devices.data.total)} of{" "}
              {devices.data.total} devices
            </p>
            <StatusPill label="Server-side pagination" tone="cyan" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {devices.data.devices.map((device) => (
              <DeviceCard
                key={device.device_id}
                device={device}
                householdSelector={selectedHousehold}
              />
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              className="product-secondary-button"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              aria-label="Previous device page"
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
              aria-label="Next device page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : (
        <EmptyProductState
          title="No devices match these filters"
          message="Clear one or more filters, or wait for the household fleet to register and publish telemetry."
        />
      )}
    </>
  );
}

function DeviceFilters(props: {
  category: string;
  profile: string;
  search: string;
  online: string;
  flexible: string;
  state: string;
  onCategory: (value: string) => void;
  onProfile: (value: string) => void;
  onSearch: (value: string) => void;
  onOnline: (value: string) => void;
  onFlexible: (value: string) => void;
  onState: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <ProductPanel className="mb-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <Filter className="h-4 w-4 text-cyan-300" />
          Filter inventory
        </p>
        <button type="button" className="text-xs font-medium text-cyan-300 hover:text-cyan-200" onClick={props.onClear}>
          Clear filters
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-medium text-slate-400">
          Search devices
          <span className="relative mt-2 block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input
              value={props.search}
              onChange={(event) => props.onSearch(event.target.value)}
              maxLength={80}
              placeholder="Name or device ID"
              className="w-full rounded-md border border-white/10 bg-[#0b1722] py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
            />
          </span>
        </label>
        <FilterSelect label="Category" value={props.category} onChange={props.onCategory}>
          <option value="">All categories</option>
          {CATEGORIES.map((item) => (
            <option value={item} key={item}>{friendlyCategory(item)}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Household profile" value={props.profile} onChange={props.onProfile}>
          <option value="">All profiles</option>
          <option value="apartment">Apartment</option>
          <option value="standard_home">Standard home</option>
          <option value="prosumer_home">Prosumer home</option>
        </FilterSelect>
        <FilterSelect label="Connection" value={props.online} onChange={props.onOnline}>
          <option value="">Any connection</option>
          <option value="true">Online</option>
          <option value="false">Offline</option>
        </FilterSelect>
        <FilterSelect label="Flexibility" value={props.flexible} onChange={props.onFlexible}>
          <option value="">Any capability</option>
          <option value="true">Flexible</option>
          <option value="false">Not flexible</option>
        </FilterSelect>
        <FilterSelect label="Current state" value={props.state} onChange={props.onState}>
          <option value="">Any state</option>
          <option value="active">Active</option>
          <option value="idle">Idle</option>
          <option value="offline">Offline</option>
        </FilterSelect>
      </div>
    </ProductPanel>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-medium text-slate-400">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-md border border-white/10 bg-[#0b1722] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
      >
        {children}
      </select>
    </label>
  );
}

function DeviceSummary({ data }: { data: CustomerDevices }) {
  const cards = [
    { label: "Total devices", value: data.summary.total_devices, icon: Boxes },
    { label: "Online now", value: data.summary.online_devices, icon: Wifi },
    { label: "Active now", value: data.summary.active_devices, icon: Activity },
    { label: "Flexible devices", value: data.summary.flexible_devices, icon: CirclePower },
    {
      label: "Current consumption",
      value: `${formatNumber(data.summary.current_consumption_kw)} kW`,
      icon: Zap
    },
    {
      label: "Energy today",
      value: `${formatNumber(data.summary.energy_used_today_kwh)} kWh`,
      icon: Gauge
    }
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
          <Icon className="h-4 w-4 text-cyan-300" />
          <p className="mt-4 text-lg font-semibold text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

function DeviceCard({
  device,
  householdSelector
}: {
  device: CustomerDevice;
  householdSelector: string | null;
}) {
  const Icon = device.device_type === "ev_charger"
    ? BatteryCharging
    : device.device_type.includes("heat") || device.device_type.includes("hvac")
      ? Thermometer
      : PlugZap;
  return (
    <Link
      href={`/dashboard/devices/${encodeURIComponent(device.device_id)}${
        householdSelector ? `?household=${encodeURIComponent(householdSelector)}` : ""
      }`}
      className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      <ProductPanel className="flex min-h-[280px] flex-col transition-colors hover:border-cyan-300/25">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-300">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white">{device.display_name}</h2>
              <p className="mt-1 truncate text-xs text-slate-500">{friendlyCategory(device.device_category)}</p>
            </div>
          </div>
          <StatusPill label={device.online ? "Online" : "Offline"} tone={device.online ? "green" : "neutral"} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <DeviceMetric
            label="Current power"
            value={device.current_power_kw === null ? "Unavailable" : `${formatNumber(device.current_power_kw)} kW`}
          />
          <DeviceMetric
            label="Energy today"
            value={device.energy_used_today_kwh === null ? "Unavailable" : `${formatNumber(device.energy_used_today_kwh)} kWh`}
          />
        </div>

        <div className="mt-5 space-y-3 border-t border-white/8 pt-4">
          <DeviceDetail label="State" value={device.operating_state} />
          <DeviceDetail
            label="Flexibility"
            value={device.flexibility_available
              ? `${formatNumber(device.flexibility_available_kw)} kW available`
              : device.flexibility_capable ? "Currently unavailable" : "Not flexible"}
          />
          <DeviceDetail label="Last seen" value={formatDateTime(device.last_seen)} />
        </div>

        <p className="mt-auto pt-5 text-xs font-medium text-cyan-300">
          View device details
        </p>
      </ProductPanel>
    </Link>
  );
}

function DeviceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.035] p-3">
      <p className="text-xs text-slate-500">{label}</p>
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

export function friendlyCategory(value: string) {
  const labels: Record<string, string> = {
    smart_meter: "Smart meter",
    smart_plug: "Smart plug",
    shelly_plug: "Shelly smart plug",
    refrigerator: "Refrigerator",
    washing_machine: "Washing machine",
    clothes_dryer: "Clothes dryer",
    dishwasher: "Dishwasher",
    lighting_circuit: "Lighting circuit",
    ev_charger: "EV charger",
    heat_pump: "Heat pump",
    thermostat_hvac: "Thermostat and HVAC",
    water_heater: "Water heater",
    solar_inverter: "Solar inverter",
    home_battery: "Home battery"
  };
  return labels[value] || value.replaceAll("_", " ");
}
