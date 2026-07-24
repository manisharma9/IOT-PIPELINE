"use client";

import {
  Building2,
  EyeOff,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Users,
  Waves
} from "lucide-react";
import { useCustomerPortal } from "@/components/product-shell";
import {
  EmptyProductState,
  formatNumber,
  MetricCard,
  ProductErrorState,
  ProductPageHeader,
  ProductPanel,
  SimulationNotice,
  StatusPill,
  customerDeviceType
} from "@/components/product-ui";
import { useCustomerResource, withHousehold } from "@/lib/customer-api";
import type { CommunitySummary } from "@/lib/customer-types";

export default function CommunityPage() {
  const { selectedHousehold } = useCustomerPortal();
  const community = useCustomerResource<CommunitySummary>(
    withHousehold("/api/customer/community", selectedHousehold)
  );
  const totalDevices = community.data?.device_type_distribution.reduce(
    (sum, item) => sum + item.count,
    0
  ) || 0;

  return (
    <>
      <ProductPageHeader
        eyebrow="Community"
        title="An anonymized view of shared energy flexibility"
        description="Community-level information is aggregated to support comparison without exposing another household's identity or private readings."
        action={(
          <button
            type="button"
            className="product-secondary-button"
            onClick={community.refresh}
            disabled={community.refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${community.refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      />
      <SimulationNotice />

      {community.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="product-panel h-36 animate-pulse" />
          ))}
        </div>
      ) : community.error ? (
        <ProductErrorState message={community.error} onRetry={community.refresh} />
      ) : community.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Active households"
              value={`${community.data.active_households}`}
              detail={`${community.data.household_count} households represented`}
              icon={<Users className="h-4 w-4" />}
              tone="green"
            />
            <MetricCard
              label="Community demand"
              value={formatNumber(community.data.total_community_demand_kw)}
              unit="kW"
              detail="Current aggregate simulated demand"
              icon={<Gauge className="h-4 w-4" />}
            />
            <MetricCard
              label="Flexible load available"
              value={formatNumber(community.data.flexible_load_available_kw)}
              unit="kW"
              detail="Estimated across active simulated devices"
              icon={<Waves className="h-4 w-4" />}
              tone="green"
            />
            <MetricCard
              label="Active opportunities"
              value={`${community.data.active_flexibility_events}`}
              detail={`${formatNumber(community.data.active_requested_reduction_kw)} kW requested`}
              icon={<Building2 className="h-4 w-4" />}
              tone="amber"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ProductPanel
              title="Connected device mix"
              description="Counts by device type across the simulated community."
            >
              {community.data.device_type_distribution.length ? (
                <div className="space-y-5">
                  {community.data.device_type_distribution.map((item) => {
                    const share = totalDevices ? (item.count / totalDevices) * 100 : 0;
                    return (
                      <div key={item.device_type}>
                        <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                          <span className="text-slate-300">{customerDeviceType(item.device_type)}</span>
                          <span className="text-slate-500">{item.count} devices</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-cyan-300"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyProductState
                  title="No community device data"
                  message="The device mix will appear when aggregated telemetry is available."
                />
              )}
            </ProductPanel>

            <ProductPanel
              title="Your household comparison"
              description="Comparison appears only when at least five households are represented."
            >
              {community.data.comparison_available &&
              community.data.selected_household_percentile !== null ? (
                <div className="flex h-full flex-col justify-center">
                  <p className="text-sm text-slate-400">Current demand percentile</p>
                  <p className="mt-3 text-5xl font-semibold text-cyan-200">
                    {formatNumber(community.data.selected_household_percentile, 0)}
                    <span className="ml-1 text-lg text-slate-400">%</span>
                  </p>
                  <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
                    Your current simulated demand is at or above this proportion of represented households. This is an energy-use comparison, not a performance rating.
                  </p>
                </div>
              ) : (
                <EmptyProductState
                  title="Comparison not available yet"
                  message={`At least ${community.data.privacy.minimum_comparison_group} households are required to protect privacy.`}
                />
              )}
            </ProductPanel>
          </div>

          <ProductPanel className="mt-4" title="Privacy protection">
            <div className="grid gap-4 md:grid-cols-3">
              <PrivacyPoint
                icon={<EyeOff className="h-5 w-5" />}
                title="Anonymized"
                description="Household identities are not included in community summaries."
              />
              <PrivacyPoint
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Aggregated"
                description="Only community totals, distributions and protected comparisons are shown."
              />
              <PrivacyPoint
                icon={<Users className="h-5 w-5" />}
                title="Minimum group size"
                description="Comparisons remain hidden until the privacy threshold is met."
              />
            </div>
            <div className="mt-5">
              <StatusPill label="No identifiable household data exposed" tone="green" />
            </div>
          </ProductPanel>
        </>
      ) : null}
    </>
  );
}

function PrivacyPoint({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-cyan-300">{icon}</span>
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

