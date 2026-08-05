"use client";

import {
  Building2,
  EyeOff,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
    withHousehold("/api/dashboard/community", selectedHousehold)
  );
  const validationDeviceMix = community.data?.validation_population.by_category || [];
  const totalDevices = validationDeviceMix.reduce(
    (sum, item) => sum + item.count,
    0
  );

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
          <ProductPanel
            className="mb-4"
            title={
              community.data.validation_population.household_count === 100 &&
              community.data.validation_population.asset_count === 1000
                ? "Validated 1,000-asset local cohort"
                : "Controlled scale-validation cohort"
            }
            description="A bounded, deterministic local population. Counts come from the registered simulator inventory and processed telemetry."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CohortMetric
                label="Households"
                value={community.data.validation_population.household_count}
              />
              <CohortMetric
                label="Simulated assets"
                value={community.data.validation_population.asset_count}
              />
              <CohortMetric
                label="Online assets"
                value={community.data.validation_population.online_assets}
              />
              <CohortMetric
                label="Active assets"
                value={community.data.validation_population.active_assets}
              />
              <CohortMetric
                label="Flexible assets"
                value={community.data.validation_population.flexible_assets}
              />
              <CohortMetric
                label="Current demand"
                value={`${formatNumber(
                  community.data.validation_population.total_simulated_demand_kw
                )} kW`}
              />
              <CohortMetric
                label="Available flexibility"
                value={`${formatNumber(
                  community.data.validation_population.available_flexibility_kw
                )} kW`}
              />
              <CohortMetric
                label="Data ready"
                value={`${formatNumber(
                  community.data.validation_population.semantic_progress.completion_percent,
                  1
                )}%`}
              />
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Household profiles</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {community.data.validation_population.by_profile.map((item) => (
                    <div key={item.profile} className="rounded-md border border-white/8 bg-white/[0.025] p-3">
                      <p className="text-sm font-medium capitalize text-white">
                        {item.profile.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.households} homes / {item.assets} assets
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Data interpretation</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <CohortMetric
                    label="Readings available"
                    value={community.data.validation_population.semantic_progress.mapped_assets}
                  />
                  <CohortMetric
                    label="Needs review"
                    value={community.data.validation_population.semantic_progress.safely_unmapped_assets}
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <StatusPill label="Energy data interpretation active" tone="cyan" />
              <StatusPill label="Simulated assets only" tone="amber" />
              <StatusPill label="No real execution" tone="green" />
            </div>
          </ProductPanel>

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
              title="Validation asset mix"
              description="Exact category totals in the controlled 1,000-asset cohort."
            >
              {validationDeviceMix.length ? (
                <div className="space-y-5">
                  {validationDeviceMix.map((item) => {
                    const share = totalDevices ? (item.count / totalDevices) * 100 : 0;
                    return (
                      <div key={item.category}>
                        <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                          <span className="text-slate-300">{customerDeviceType(item.category)}</span>
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

function CohortMetric({
  label,
  value
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-md border border-white/8 bg-white/[0.025] p-4">
      <Sparkles className="h-4 w-4 text-cyan-300" />
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
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
