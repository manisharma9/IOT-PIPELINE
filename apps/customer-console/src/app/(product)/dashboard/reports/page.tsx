"use client";

import {
  Download,
  Printer,
  RefreshCw
} from "lucide-react";
import { useMemo, useState } from "react";
import { useCustomerPortal } from "@/components/product-shell";
import {
  DataQualityLabel,
  EmptyProductState,
  formatDateTime,
  formatNumber,
  ProductErrorState,
  ProductPageHeader,
  ProductPanel,
  SimulationNotice,
  StatusPill,
  customerDeviceType
} from "@/components/product-ui";
import { useCustomerResource, withHousehold } from "@/lib/customer-api";
import type { CustomerReports } from "@/lib/customer-types";

type ReportPeriod = "daily" | "weekly" | "monthly";

export default function ReportsPage() {
  const { selectedHousehold, householdLabel } = useCustomerPortal();
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const report = useCustomerResource<CustomerReports>(
    withHousehold(`/api/customer/reports?period=${period}`, selectedHousehold)
  );
  const csvPath = withHousehold(
    `/api/customer/reports/csv?period=${period}`,
    selectedHousehold
  );
  const totals = useMemo(() => {
    const energy = report.data?.energy || [];
    return {
      energy: energy.reduce((sum, row) => sum + row.energy_used_kwh, 0),
      measured: energy.reduce((sum, row) => sum + row.metered_energy_kwh, 0),
      estimated: energy.reduce((sum, row) => sum + row.estimated_energy_kwh, 0)
    };
  }, [report.data]);

  return (
    <>
      <div className="print:hidden">
        <ProductPageHeader
          eyebrow="Reports"
          title="Household energy and participation reports"
          description="Review daily, weekly or monthly summaries with clear labels for measured, estimated and simulated values."
          action={(
            <div className="flex flex-wrap gap-2">
              <a href={csvPath} className="product-secondary-button" download>
                <Download className="h-4 w-4" />
                Export CSV
              </a>
              <button type="button" className="product-secondary-button" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print or save PDF
              </button>
            </div>
          )}
        />
        <SimulationNotice />
      </div>

      <header className="mb-6 hidden border-b border-slate-300 pb-4 text-slate-900 print:block">
        <h1 className="text-2xl font-semibold">EnerShare household energy report</h1>
        <p className="mt-1 text-sm">{householdLabel} · {period} summary</p>
      </header>

      <ProductPanel className="mb-4 print:border-slate-300 print:bg-white print:text-slate-900 print:shadow-none">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-white print:text-slate-900">Report period</p>
            <p className="mt-1 text-xs text-slate-500 print:text-slate-600">Maximum report range is 31 days.</p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            {(["daily", "weekly", "monthly"] as ReportPeriod[]).map((value) => (
              <button
                key={value}
                type="button"
                className={period === value ? "product-primary-button" : "product-secondary-button"}
                onClick={() => setPeriod(value)}
                aria-pressed={period === value}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
            <button type="button" className="product-secondary-button" onClick={report.refresh}>
              <RefreshCw className={`h-4 w-4 ${report.refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </ProductPanel>

      {report.loading ? (
        <div className="product-panel h-96 animate-pulse" />
      ) : report.error ? (
        <ProductErrorState message={report.error} onRetry={report.refresh} />
      ) : report.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <ReportTotal label="Energy represented" value={`${formatNumber(totals.energy)} kWh`} />
            <ReportTotal label="Metered component" value={`${formatNumber(totals.measured)} kWh`} />
            <ReportTotal label="Estimated component" value={`${formatNumber(totals.estimated)} kWh`} />
          </div>

          <ProductPanel className="mt-4 print:border-slate-300 print:bg-white print:shadow-none" title="Household energy">
            {report.data.energy.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Total energy</th>
                      <th className="pb-3 font-medium">Metered</th>
                      <th className="pb-3 font-medium">Estimated</th>
                      <th className="pb-3 font-medium">Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.energy.map((row) => (
                      <tr key={row.day} className="border-t border-white/8 text-slate-300 print:border-slate-200 print:text-slate-800">
                        <td className="py-3">{formatDateTime(row.day)}</td>
                        <td className="py-3">{formatNumber(row.energy_used_kwh)} kWh</td>
                        <td className="py-3">{formatNumber(row.metered_energy_kwh)} kWh</td>
                        <td className="py-3">{formatNumber(row.estimated_energy_kwh)} kWh</td>
                        <td className="py-3"><DataQualityLabel quality={row.data_quality} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyProductState
                title="No energy records in this period"
                message="Choose another period or allow the simulated devices to report telemetry."
              />
            )}
          </ProductPanel>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ProductPanel className="print:border-slate-300 print:bg-white print:shadow-none" title="Device energy breakdown">
              {report.data.device_breakdown.length ? (
                <div className="space-y-3">
                  {report.data.device_breakdown.map((device) => (
                    <div key={device.device_id} className="flex items-center justify-between gap-4 border-b border-white/8 pb-3 last:border-0 last:pb-0 print:border-slate-200">
                      <div>
                        <p className="text-sm font-medium text-white print:text-slate-900">{customerDeviceType(device.device_type)}</p>
                        <p className="mt-1 text-xs text-slate-500">{device.device_id}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white print:text-slate-900">{formatNumber(device.energy_used_kwh)} kWh</p>
                        <p className="mt-1 text-xs text-slate-500">{device.data_quality.replaceAll("_", " ")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyProductState title="No device breakdown" message="Device energy data is not available for this period." />
              )}
            </ProductPanel>

            <ProductPanel className="print:border-slate-300 print:bg-white print:shadow-none" title="Flexibility participation">
              {report.data.flexibility_history.length ? (
                <div className="space-y-3">
                  {report.data.flexibility_history.map((event) => (
                    <div key={event.proposal_id} className="flex items-start justify-between gap-4 border-b border-white/8 pb-3 last:border-0 last:pb-0 print:border-slate-200">
                      <div>
                        <p className="text-sm font-medium text-white print:text-slate-900">{event.display_status}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(event.start_time)}</p>
                      </div>
                      <div className="text-right">
                        <StatusPill label={`${formatNumber(event.target_kw)} kW`} tone="amber" />
                        <p className="mt-2 text-xs text-slate-500">Simulated result</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyProductState title="No event participation" message="No flexibility events occurred in this report period." />
              )}
            </ProductPanel>
          </div>

          <ProductPanel className="mt-4 print:border-slate-300 print:bg-white print:shadow-none" title="Report labels">
            <div className="grid gap-3 md:grid-cols-3">
              {Object.entries(report.data.labels).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-white/[0.035] p-3 print:border print:border-slate-200 print:bg-white">
                  <p className="text-xs font-medium text-slate-300 print:text-slate-800">{key[0].toUpperCase() + key.slice(1)}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 print:text-slate-600">{value}</p>
                </div>
              ))}
            </div>
          </ProductPanel>
        </>
      ) : (
        <EmptyProductState title="Report unavailable" message="No report data is currently available." />
      )}
    </>
  );
}

function ReportTotal({ label, value }: { label: string; value: string }) {
  return (
    <ProductPanel className="print:border-slate-300 print:bg-white print:text-slate-900 print:shadow-none">
      <p className="text-sm text-slate-400 print:text-slate-600">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white print:text-slate-900">{value}</p>
    </ProductPanel>
  );
}
