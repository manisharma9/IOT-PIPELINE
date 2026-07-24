"use client";

import {
  Check,
  ChevronDown,
  Clock3,
  RefreshCw,
  ShieldCheck,
  ThumbsDown,
  UserCheck,
  Waves,
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
  StatusPill,
  customerDeviceType
} from "@/components/product-ui";
import {
  fetchCustomerData,
  useCustomerResource,
  withHousehold
} from "@/lib/customer-api";
import type {
  CustomerFlexibility,
  FlexibilityEvent
} from "@/lib/customer-types";

export default function FlexibilityPage() {
  const { selectedHousehold, session } = useCustomerPortal();
  const flexibility = useCustomerResource<CustomerFlexibility>(
    withHousehold("/api/customer/flexibility", selectedHousehold)
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionState, setActionState] = useState<{
    proposalId: string;
    loading: boolean;
    message: string | null;
    error: string | null;
  } | null>(null);
  const canManage = session.role !== "household_user";

  async function transition(event: FlexibilityEvent, action: string) {
    setActionState({
      proposalId: event.proposal_id,
      loading: true,
      message: null,
      error: null
    });
    try {
      await fetchCustomerData(`/api/approvals/${action}`, {
        method: "POST",
        body: JSON.stringify({
          id: event.proposal_id,
          reviewer_id: session.username,
          reviewer_role: session.role,
          comment: action === "reject"
            ? "Participation declined in the customer energy console."
            : "Status updated in the customer energy console."
        })
      });
      setActionState({
        proposalId: event.proposal_id,
        loading: false,
        message: "Event status updated.",
        error: null
      });
      await flexibility.refresh();
    } catch (error) {
      setActionState({
        proposalId: event.proposal_id,
        loading: false,
        message: null,
        error: error instanceof Error ? error.message : "The status could not be updated."
      });
    }
  }

  return (
    <>
      <ProductPageHeader
        eyebrow="Flexibility"
        title="Participate safely in grid flexibility events"
        description="Follow simulated load-management requests from opportunity through review, preparation and mock completion."
        action={(
          <button
            type="button"
            className="product-secondary-button"
            onClick={flexibility.refresh}
            disabled={flexibility.refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${flexibility.refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      />
      <SimulationNotice />

      {flexibility.loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="product-panel h-44 animate-pulse" />
          ))}
        </div>
      ) : flexibility.error ? (
        <ProductErrorState message={flexibility.error} onRetry={flexibility.refresh} />
      ) : flexibility.data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <ProductPanel>
              <p className="text-sm text-slate-400">Flexible load available</p>
              <p className="mt-4 text-3xl font-semibold text-emerald-300">
                {formatNumber(flexibility.data.flexible_load_currently_available_kw)}
                {flexibility.data.flexible_load_currently_available_kw !== null ? (
                  <span className="ml-2 text-sm text-slate-400">kW</span>
                ) : null}
              </p>
              <p className="mt-2 text-xs text-slate-500">Estimated from eligible simulated devices</p>
            </ProductPanel>
            <ProductPanel>
              <p className="text-sm text-slate-400">Latest event</p>
              <p className="mt-4 text-xl font-semibold text-white">
                {flexibility.data.latest_event?.display_status || "No event"}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {flexibility.data.latest_event
                  ? `${formatNumber(flexibility.data.latest_event.target_kw)} kW requested`
                  : "No recent grid request is available"}
              </p>
            </ProductPanel>
            <ProductPanel>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <ShieldCheck className="h-4 w-4 text-cyan-300" />
                Safety mode
              </div>
              <p className="mt-4 text-xl font-semibold text-cyan-200">Simulation only</p>
              <p className="mt-2 text-xs text-slate-500">No physical household command is executed</p>
            </ProductPanel>
          </div>

          <section className="mt-7">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-white">Flexibility event history</h2>
              <p className="mt-1 text-sm text-slate-400">
                Status labels are translated into clear participation stages.
              </p>
            </div>
            {flexibility.data.events.length ? (
              <div className="space-y-3">
                {flexibility.data.events.map((event) => {
                  const isExpanded = expanded === event.proposal_id;
                  const currentAction = actionState?.proposalId === event.proposal_id
                    ? actionState
                    : null;
                  return (
                    <article key={event.proposal_id} className="rounded-lg border border-white/10 bg-white/[0.025]">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-4 p-4 text-left"
                        onClick={() => setExpanded(isExpanded ? null : event.proposal_id)}
                        aria-expanded={isExpanded}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-300">
                            <Waves className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-sm font-semibold text-white">
                                {friendlyRequest(event.requested_action)}
                              </h2>
                              <StatusPill
                                label={event.display_status}
                                tone={statusTone(event.status)}
                              />
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                              {event.reason || "No reason supplied"}
                            </p>
                          </div>
                        </div>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${isExpanded ? "rotate-180" : ""}`} />
                      </button>

                      {isExpanded ? (
                        <div className="border-t border-white/8 p-4">
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <EventFact label="Requested reduction" value={`${formatNumber(event.target_kw)} kW`} icon={<Zap className="h-4 w-4" />} />
                            <EventFact label="Starts" value={formatDateTime(event.start_time)} icon={<Clock3 className="h-4 w-4" />} />
                            <EventFact label="Duration" value={`${formatNumber(event.duration_minutes, 0)} minutes`} icon={<Clock3 className="h-4 w-4" />} />
                            <EventFact label="Priority" value={event.priority || "Standard"} icon={<Waves className="h-4 w-4" />} />
                          </div>

                          {event.suggested_device_contributions?.length ? (
                            <div className="mt-5">
                              <p className="text-sm font-medium text-white">Suggested device contribution</p>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {event.suggested_device_contributions.map((contribution) => (
                                  <div key={`${event.proposal_id}-${contribution.device_id}`} className="flex items-center justify-between gap-4 rounded-lg bg-white/[0.035] p-3 text-sm">
                                    <div>
                                      <p className="text-slate-300">{customerDeviceType(contribution.device_type)}</p>
                                      <p className="mt-1 text-xs text-slate-500">{contribution.device_id}</p>
                                    </div>
                                    <StatusPill label={`${formatNumber(contribution.allocated_reduction_kw)} kW`} tone="green" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {event.timeline?.length ? (
                            <div className="mt-5">
                              <p className="text-sm font-medium text-white">Event timeline</p>
                              <ol className="mt-4 space-y-0">
                                {event.timeline.map((item, index) => (
                                  <li key={`${item.time}-${item.status}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
                                    {index < (event.timeline?.length || 0) - 1 ? (
                                      <span className="absolute left-[7px] top-4 h-full w-px bg-white/10" />
                                    ) : null}
                                    <span className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-cyan-300 bg-[#0b1929]" />
                                    <div>
                                      <p className="text-sm text-slate-300">{item.label}</p>
                                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.time)}</p>
                                      {item.comment || item.message ? (
                                        <p className="mt-1 text-xs leading-5 text-slate-400">{item.comment || item.message}</p>
                                      ) : null}
                                    </div>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          ) : null}

                          {event.simulated_shifted_energy_kwh !== null && event.simulated_shifted_energy_kwh !== undefined ? (
                            <div className="mt-5 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.045] p-3">
                              <p className="text-sm font-medium text-emerald-100">
                                Estimated simulated energy shifted: {formatNumber(event.simulated_shifted_energy_kwh)} kWh
                              </p>
                              <p className="mt-1 text-xs text-slate-500">This is a simulated estimate, not a measured physical outcome.</p>
                            </div>
                          ) : null}

                          {canManage ? (
                            <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
                              {event.status === "proposed" ? (
                                <button
                                  type="button"
                                  className="product-primary-button"
                                  disabled={currentAction?.loading}
                                  onClick={() => transition(event, "review")}
                                >
                                  <UserCheck className="h-4 w-4" />
                                  Mark as reviewed
                                </button>
                              ) : null}
                              {event.status === "reviewed" ? (
                                <button
                                  type="button"
                                  className="product-primary-button"
                                  disabled={currentAction?.loading}
                                  onClick={() => transition(event, "approve")}
                                >
                                  <Check className="h-4 w-4" />
                                  Approve for simulation
                                </button>
                              ) : null}
                              {event.status === "approved" ? (
                                <button
                                  type="button"
                                  className="product-primary-button"
                                  disabled={currentAction?.loading}
                                  onClick={() => transition(event, "mark-ready")}
                                >
                                  <ShieldCheck className="h-4 w-4" />
                                  Prepare simulation
                                </button>
                              ) : null}
                              {["proposed", "reviewed"].includes(event.status) ? (
                                <button
                                  type="button"
                                  className="product-secondary-button"
                                  disabled={currentAction?.loading}
                                  onClick={() => transition(event, "reject")}
                                >
                                  <ThumbsDown className="h-4 w-4" />
                                  Decline participation
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-5 text-xs text-slate-500">Your account can view participation status. Event approval is managed by an authorized operator.</p>
                          )}

                          {currentAction?.message ? (
                            <p className="mt-3 text-sm text-emerald-200">{currentAction.message}</p>
                          ) : null}
                          {currentAction?.error ? (
                            <p className="mt-3 text-sm text-rose-200">{currentAction.error}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyProductState
                title="No flexibility events yet"
                message="Grid opportunities and their simulated participation history will appear here."
              />
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

function EventFact({
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
      <p className="flex items-center gap-2 text-xs text-slate-500">{icon}{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-slate-200">{value}</p>
    </div>
  );
}

function friendlyRequest(value: string) {
  const labels: Record<string, string> = {
    reduce_load: "Reduce household load",
    shift_load: "Move energy use to another time",
    increase_export: "Increase available export",
    reduce_export: "Reduce available export"
  };
  return labels[value] || "Household flexibility opportunity";
}

function statusTone(status: string): "green" | "cyan" | "amber" | "red" | "neutral" {
  if (["approved", "ready_to_dispatch", "simulated_success"].includes(status)) return "green";
  if (status === "reviewed") return "cyan";
  if (status === "rejected") return "red";
  if (status === "proposed") return "amber";
  return "neutral";
}
