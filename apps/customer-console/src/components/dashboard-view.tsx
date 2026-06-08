"use client";

import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  FileJson,
  RadioTower,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Zap
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { awsReadiness, pipelineNodes, runbookSteps } from "@/lib/console-data";
import { Badge, Card, CopyJsonButton, EmptyState, JsonViewer, LoadingButton, PageHeader, StateLine } from "@/components/ui";

type ViewName =
  | "overview"
  | "architecture"
  | "security"
  | "telemetry"
  | "semantic"
  | "ieee20305"
  | "dso"
  | "dispatch"
  | "mock-dispatch"
  | "device-command"
  | "dataspace"
  | "aws-readiness"
  | "runbook";

type ApiEnvelope = {
  ok?: boolean;
  status_code?: number;
  correlation_id?: string | null;
  data?: unknown;
  error?: string;
  message?: string;
};

type DashboardViewProps = {
  view: ViewName;
};

const chartData = [
  { name: "Telemetry", value: 92 },
  { name: "Semantic", value: 88 },
  { name: "IEEE", value: 84 },
  { name: "Approval", value: 78 },
  { name: "Export", value: 86 }
];

const statusMix = [
  { name: "Ready locally", value: 6, color: "#34d399" },
  { name: "Prepared", value: 2, color: "#60a5fa" },
  { name: "Pending credentials", value: 3, color: "#f59e0b" }
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getArray(value: unknown, key: string) {
  const record = asRecord(value);
  return Array.isArray(record[key]) ? (record[key] as Record<string, unknown>[]) : [];
}

function getData(envelope: ApiEnvelope | null) {
  return envelope?.data;
}

async function fetchJson(path: string, options?: RequestInit): Promise<ApiEnvelope> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options?.headers || {})
    }
  });
  const json = await response.json().catch(() => ({}));
  return json as ApiEnvelope;
}

function ClientChartFrame({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="h-72 min-w-0">
      {ready ? children : <div className="h-full rounded-md border border-white/10 bg-white/[0.03]" />}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-300">{label}</span>
      <input
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none ring-emerald-300/30 transition placeholder:text-slate-500 focus:ring-2"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none ring-emerald-300/30 transition focus:ring-2"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-[#10141b]">
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DashboardView({ view }: DashboardViewProps) {
  if (view === "overview") return <OverviewPage />;
  if (view === "architecture") return <ArchitecturePage />;
  if (view === "security") return <SecurityPage />;
  if (view === "telemetry") return <TelemetryPage />;
  if (view === "semantic") return <SemanticPage />;
  if (view === "ieee20305") return <IeeePage />;
  if (view === "dso") return <DsoPage />;
  if (view === "dispatch") return <DispatchPage />;
  if (view === "mock-dispatch") return <AuditPage />;
  if (view === "device-command") return <DeviceCommandPage />;
  if (view === "dataspace") return <DataspacePage />;
  if (view === "aws-readiness") return <AwsReadinessPage />;
  return <RunbookPage />;
}

function OverviewPage() {
  const [health, setHealth] = useState<ApiEnvelope | null>(null);
  const [proposals, setProposals] = useState<ApiEnvelope | null>(null);
  const [exportData, setExportData] = useState<ApiEnvelope | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchJson("/api/health"),
      fetchJson("/api/dispatch/proposals?limit=5"),
      fetchJson("/api/dataspace/export?asset=full&limit=5")
    ])
      .then(([healthResult, proposalResult, exportResult]) => {
        setHealth(healthResult);
        setProposals(proposalResult);
        setExportData(exportResult);
      })
      .finally(() => setLoading(false));
  }, []);

  const downstream = getArray(asRecord(getData(health)).downstream, "none");
  const proposalCount = getArray(getData(proposals), "proposals").length;

  return (
    <>
      <PageHeader
        eyebrow="Executive overview"
        title="Production-style DSO communication pipeline"
        description="A client-facing view of telemetry ingestion, semantic translation, grid signaling, approval governance, safe mock dispatch, simulated device API translation, and minimized dataspace export."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Security gateway" value={health?.ok ? "Online" : loading ? "Checking" : "Unavailable"} description="External traffic enters through the local edge only." tone={health?.ok ? "emerald" : "amber"} />
        <Card title="Active components" value={String(downstream.length || 7)} description="Gateway health summarizes downstream services." tone="blue" />
        <Card title="Latest proposals" value={String(proposalCount)} description="Proposal records available through the gateway." />
        <Card title="Dataspace export" value={exportData?.ok ? "Ready" : "Pending data"} description="Minimized summaries, no raw private payloads." tone={exportData?.ok ? "emerald" : "amber"} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card title="Pipeline readiness trend" description="Illustrative readiness by pipeline capability.">
          <ClientChartFrame>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="readiness" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ background: "#10141b", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} />
                <Area type="monotone" dataKey="value" stroke="#34d399" fill="url(#readiness)" />
              </AreaChart>
            </ResponsiveContainer>
          </ClientChartFrame>
        </Card>
        <Card title="Business explanation" description="What this console proves.">
          <div className="space-y-3">
            <StateLine ok label="Understand telemetry" detail="Raw household readings become normalized, semantic energy data." />
            <StateLine ok label="Govern load management" detail="DSO requests become proposals, then require review before ready status." />
            <StateLine ok label="Keep execution safe" detail="Mock dispatch and simulated device APIs show the workflow without real control." />
            <StateLine ok label="Share responsibly" detail="Dataspace export provides minimized, pseudonymized summaries." />
          </div>
        </Card>
      </div>
    </>
  );
}

function ArchitecturePage() {
  const [selected, setSelected] = useState(pipelineNodes[0]);
  return (
    <>
      <PageHeader
        eyebrow="Architecture flow"
        title="Gateway-first pipeline map"
        description="Click a component to inspect its role, route, inputs, outputs, and readiness status."
      />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.7fr]">
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pipelineNodes.map((node, index) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelected(node)}
                className={`min-h-28 rounded-md border p-4 text-left transition ${
                  selected.id === node.id
                    ? "border-emerald-300/40 bg-emerald-300/12"
                    : "border-white/10 bg-black/18 hover:border-white/20 hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold text-white">{node.label}</span>
                  {index < pipelineNodes.length - 1 ? <ArrowRight className="h-4 w-4 text-slate-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-400">{node.purpose}</p>
              </button>
            ))}
          </div>
        </div>
        <Card title={selected.label} description={selected.purpose} tone="blue">
          <div className="space-y-3 text-sm">
            <Detail label="Route / port" value={selected.route} />
            <Detail label="Receives" value={selected.receives} />
            <Detail label="Produces" value={selected.produces} />
            <Detail label="Status" value={selected.status} />
          </div>
        </Card>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-100">{value}</p>
    </div>
  );
}

function SecurityPage() {
  const [result, setResult] = useState<ApiEnvelope | null>(null);
  const [audit, setAudit] = useState<ApiEnvelope | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendBlockedTest() {
    setLoading(true);
    const blocked = await fetchJson("/api/security/blocked-test", { method: "POST", body: "{}" });
    setResult(blocked);
    if (blocked.correlation_id) {
      setAudit(await fetchJson(`/api/security/audit?correlation_id=${encodeURIComponent(blocked.correlation_id)}`));
    }
    setLoading(false);
  }

  return (
    <>
      <PageHeader
        eyebrow="Security gateway"
        title="Local edge controls and audit"
        description="The browser never calls internal services. Next.js server routes attach the edge API key and forward requests through the security gateway."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ["API key authentication", "Enabled through server-side x-edge-api-key"],
          ["JWT-ready status", "Structured for future Cognito/Auth0/JWT issuer"],
          ["Rate limiting", "Per client IP at the local edge"],
          ["IP filtering", "Allow/block lists available through environment variables"],
          ["DPI-style inspection", "Blocks obvious SQL, XSS, traversal, and command injection strings"],
          ["Correlation ID", "Generated or forwarded on every request"],
          ["Audit logging", "Accepted, blocked, unauthorized, and downstream-error requests are audited"]
        ].map(([title, detail]) => (
          <StateLine key={title} ok label={title} detail={detail} />
        ))}
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card title="Blocked request demo" description="Sends a harmless SQL-like telemetry payload through the gateway to prove request inspection works.">
          <LoadingButton loading={loading} onClick={sendBlockedTest}>
            <ShieldAlert className="h-4 w-4" />
            Send safe blocked test payload
          </LoadingButton>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Badge tone={result?.status_code === 403 ? "emerald" : "amber"}>Status {result?.status_code || "not sent"}</Badge>
            <Badge tone="blue">Correlation {result?.correlation_id || "pending"}</Badge>
            <Badge tone={audit?.ok ? "emerald" : "neutral"}>Audit {audit?.ok ? "found" : "pending"}</Badge>
          </div>
        </Card>
        <Card title="Response and audit preview">
          <JsonViewer value={{ blocked_response: result, audit }} />
        </Card>
      </div>
    </>
  );
}

function TelemetryPage() {
  const [form, setForm] = useState({
    community_id: "community-dublin-north",
    household_id: "household-001",
    device_id: "meter-001",
    device_type: "smart_meter",
    reading_type: "active_power_kw",
    value: "3.2",
    unit: "kW",
    timestamp: new Date().toISOString()
  });
  const [response, setResponse] = useState<ApiEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const payload = useMemo(() => ({
    community_id: form.community_id,
    household_id: form.household_id,
    device_id: form.device_id,
    device_type: form.device_type,
    timestamp: form.timestamp,
    protocol: "http",
    source: "customer-console",
    readings: {
      [form.reading_type]: {
        value: Number(form.value),
        unit: form.unit
      }
    }
  }), [form]);

  async function submit() {
    setLoading(true);
    setResponse(await fetchJson("/api/telemetry", { method: "POST", body: JSON.stringify(payload) }));
    setLoading(false);
  }

  return (
    <>
      <PageHeader eyebrow="Telemetry simulator" title="Send household telemetry through the gateway" description="Build a telemetry payload, preview the exact JSON, and submit through a Next.js API route." />
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card title="Telemetry form">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["community_id", "household_id", "device_id", "device_type", "reading_type", "value", "unit", "timestamp"] as const).map((key) => (
              <TextInput key={key} label={key.replaceAll("_", " ")} value={form[key]} onChange={(value) => setForm((current) => ({ ...current, [key]: value }))} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <LoadingButton onClick={() => setForm((current) => ({ ...current, reading_type: "active_power_kw", value: "3.2", unit: "kW", timestamp: new Date().toISOString() }))} variant="secondary">Load sample telemetry</LoadingButton>
            <LoadingButton loading={loading} onClick={submit}><Send className="h-4 w-4" />Send telemetry</LoadingButton>
            <LoadingButton onClick={() => setResponse(null)} variant="secondary">Reset</LoadingButton>
          </div>
        </Card>
        <Card title="Request and response">
          <div className="grid gap-4 lg:grid-cols-2">
            <JsonViewer value={payload} />
            <JsonViewer value={response || "No response yet."} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={response?.ok ? "emerald" : "neutral"}>Stage: gateway to raw.telemetry</Badge>
            <Badge tone="blue">Correlation: {response?.correlation_id || "pending"}</Badge>
          </div>
        </Card>
      </div>
    </>
  );
}

function SemanticPage() {
  return <SummaryPage asset="semantic" eyebrow="Semantic mapping" title="SAREF-style semantic mapping" description="Reads the minimized semantic summary through dataspace export when pipeline data exists." fields={["mapping_source", "mapping_confidence", "saref_property", "saref_unit", "explanation"]} />;
}

function IeeePage() {
  return <SummaryPage asset="grid" eyebrow="IEEE 2030.5 translation" title="Grid and energy protocol object" description="Shows IEEE 2030.5-style summaries when translated grid events are available." fields={["resource_type", "translation_status", "translation_confidence", "explanation"]} />;
}

function SummaryPage({ asset, eyebrow, title, description, fields }: { asset: string; eyebrow: string; title: string; description: string; fields: string[] }) {
  const [data, setData] = useState<ApiEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setData(await fetchJson(`/api/dataspace/export?asset=${asset}&limit=10`));
    setLoading(false);
  }
  const rows = getArray(asRecord(getData(data)).data, "none");
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="mb-4 flex gap-2">
        <LoadingButton loading={loading} onClick={load}><RefreshCw className="h-4 w-4" />Load latest summary</LoadingButton>
      </div>
      {rows.length ? (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card title="Latest mapped data">
            <div className="space-y-3">
              {rows.slice(0, 5).map((row, index) => (
                <div key={index} className="rounded-md border border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-semibold text-white">Record {index + 1}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {fields.map((field) => <Detail key={field} label={field} value={String(row[field] ?? "not exposed")} />)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Raw API response"><JsonViewer value={data} /></Card>
        </div>
      ) : (
        <EmptyState title="No summary rows available yet" message="Run telemetry and dataspace export first, or use the response panel to confirm the endpoint is not exposed yet." />
      )}
    </>
  );
}

function DsoPage() {
  const [form, setForm] = useState({
    community_id: "community-dublin-north",
    area_id: "dublin-north",
    reduction_type: "fixed_kw",
    requested_amount: "2.5",
    start_time: new Date().toISOString(),
    duration_minutes: "60",
    reason: "Local transformer load is approaching threshold",
    priority: "medium"
  });
  const [response, setResponse] = useState<ApiEnvelope | null>(null);
  const [proposals, setProposals] = useState<ApiEnvelope | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setResponse(await fetchJson("/api/dso/grid-signal", { method: "POST", body: JSON.stringify(form) }));
    setProposals(await fetchJson("/api/dispatch/proposals?limit=5"));
    setLoading(false);
  }

  return (
    <>
      <PageHeader eyebrow="DSO load management" title="Send load reduction request" description="The console converts the operator request into the current grid signal contract and sends it through the gateway." />
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card title="DSO request form">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="target area" value={form.area_id} onChange={(value) => setForm((current) => ({ ...current, area_id: value }))} />
            <TextInput label="community ID" value={form.community_id} onChange={(value) => setForm((current) => ({ ...current, community_id: value }))} />
            <SelectInput label="load reduction type" value={form.reduction_type} onChange={(value) => setForm((current) => ({ ...current, reduction_type: value }))} options={["fixed_kw", "percentage"]} />
            <TextInput label="requested amount" value={form.requested_amount} onChange={(value) => setForm((current) => ({ ...current, requested_amount: value }))} />
            <TextInput label="start time" value={form.start_time} onChange={(value) => setForm((current) => ({ ...current, start_time: value }))} />
            <TextInput label="duration minutes" value={form.duration_minutes} onChange={(value) => setForm((current) => ({ ...current, duration_minutes: value }))} />
            <SelectInput label="priority" value={form.priority} onChange={(value) => setForm((current) => ({ ...current, priority: value }))} options={["low", "medium", "high", "critical"]} />
            <TextInput label="reason" value={form.reason} onChange={(value) => setForm((current) => ({ ...current, reason: value }))} />
          </div>
          <div className="mt-4">
            <LoadingButton loading={loading} onClick={submit}><RadioTower className="h-4 w-4" />Send DSO Load Reduction Request</LoadingButton>
          </div>
        </Card>
        <Card title="Response and proposal status">
          <div className="grid gap-4 lg:grid-cols-2">
            <JsonViewer value={response || "No DSO response yet."} />
            <JsonViewer value={proposals || "No proposal lookup yet."} />
          </div>
        </Card>
      </div>
    </>
  );
}

function DispatchPage() {
  const [data, setData] = useState<ApiEnvelope | null>(null);
  const [actionResult, setActionResult] = useState<ApiEnvelope | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setData(await fetchJson("/api/approvals/proposals?limit=20"));
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    fetchJson("/api/approvals/proposals?limit=20")
      .then((result) => {
        if (active) {
          setData(result);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function action(actionName: "review" | "approve" | "reject" | "mark-ready", id: unknown) {
    setActionResult(await fetchJson(`/api/approvals/${actionName}`, {
      method: "POST",
      body: JSON.stringify({
        id,
        reviewer_id: "operator",
        reviewer_role: "customer_operator",
        comment: actionName === "reject" ? "Rejected from customer console." : "Processed from customer console for local demo workflow."
      })
    }));
    await load();
  }

  const rows = getArray(getData(data), "proposals");

  return (
    <>
      <PageHeader eyebrow="Dispatch proposals" title="Review and prepare safe dispatch proposals" description="Proposal status transitions are called through the gateway. No command execution endpoint exists." />
      <div className="mb-4 flex gap-2"><LoadingButton loading={loading} onClick={load}><RefreshCw className="h-4 w-4" />Refresh proposals</LoadingButton></div>
      {rows.length ? (
        <div className="overflow-hidden rounded-md border border-white/10">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-white/[0.06] text-xs uppercase tracking-[0.14em] text-slate-400">
              <tr>
                {["Proposal ID", "Target", "Reduction", "Status", "Created", "Reason", "Actions"].map((header) => <th key={header} className="px-4 py-3">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-t border-white/10">
                  <td className="px-4 py-3 font-mono text-xs text-slate-200">{String(row.id)}</td>
                  <td className="px-4 py-3">{String(row.community_id || row.household_id || "community")}</td>
                  <td className="px-4 py-3">{String(row.target_kw || "n/a")} kW</td>
                  <td className="px-4 py-3"><Badge tone={row.status === "ready_to_dispatch" ? "emerald" : "blue"}>{String(row.status || "proposed")}</Badge></td>
                  <td className="px-4 py-3 text-slate-400">{String(row.created_at || row.event_time || "")}</td>
                  <td className="px-4 py-3 text-slate-300">{String(row.reason || "No reason provided")}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <LoadingButton variant="secondary" onClick={() => action("review", row.id)}>Review</LoadingButton>
                      <LoadingButton variant="secondary" onClick={() => action("approve", row.id)}>Approve</LoadingButton>
                      <LoadingButton variant="danger" onClick={() => action("reject", row.id)}>Reject</LoadingButton>
                      <LoadingButton onClick={() => action("mark-ready", row.id)}>Mark ready</LoadingButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No proposals available" message="Send a DSO load request first. If the endpoint is unavailable, the response panel will show the gateway error." />}
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Card title="Last action result"><JsonViewer value={actionResult || "No action submitted yet."} /></Card>
        <Card title="Latest proposal response"><JsonViewer value={data || "No proposal response yet."} /></Card>
      </div>
    </>
  );
}

function AuditPage() {
  const [data, setData] = useState<ApiEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setData(await fetchJson("/api/mock-dispatch/audit?limit=20"));
    setLoading(false);
  }
  const rows = getArray(getData(data), "audit");
  return (
    <>
      <PageHeader eyebrow="Mock dispatch" title="Safe mock dispatch audit" description="Ready dispatch commands become simulated sent and result events. No real household device is controlled." />
      <LoadingButton loading={loading} onClick={load}><RefreshCw className="h-4 w-4" />Load mock dispatch audit</LoadingButton>
      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card title="Safety flags" tone="emerald">
          <StateLine ok label="no_real_execution = true" detail="Mock adapter outputs must explicitly mark no real execution." />
          <div className="mt-3"><StateLine ok label="execution_mode = mock" detail="Events are simulated workflow proof, not device control." /></div>
        </Card>
        <Card title="Audit response"><JsonViewer value={data || "No audit loaded yet."} /></Card>
      </div>
      {rows.length ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.slice(0, 6).map((row, index) => (
            <Card key={index} title={String(row.proposed_action || "mock command")} description={String(row.simulation_message || "Simulated result")}>
              <Badge tone="emerald">{String(row.execution_mode || "mock")}</Badge>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}

function DeviceCommandPage() {
  const [tab, setTab] = useState<"all" | "shelly" | "enode" | "heat-pump">("all");
  const [data, setData] = useState<ApiEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setData(await fetchJson("/api/device-command/audit?limit=30"));
    setLoading(false);
  }
  const rows = getArray(getData(data), "audit").filter((row) => {
    if (tab === "shelly") return row.device_type === "shelly_plug";
    if (tab === "enode") return row.provider === "enode" || row.device_type === "ev_charger";
    if (tab === "heat-pump") return row.device_type === "heat_pump";
    return true;
  });
  return (
    <>
      <PageHeader eyebrow="Device API translation" title="Shelly, Enode / Easee, and Heat Pump simulated commands" description="Approved ready commands are translated into simulated end-device API language through the gateway-only dashboard path." />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "shelly", "enode", "heat-pump"] as const).map((nextTab) => (
          <button key={nextTab} type="button" onClick={() => setTab(nextTab)} className={`rounded-md border px-4 py-2 text-sm ${tab === nextTab ? "border-emerald-300/35 bg-emerald-300/15 text-white" : "border-white/10 bg-white/5 text-slate-300"}`}>
            {nextTab === "all" ? "All Devices" : nextTab === "shelly" ? "Shelly Plug" : nextTab === "enode" ? "Enode / Easee Core" : "Heat Pump"}
          </button>
        ))}
        <LoadingButton loading={loading} onClick={load}><RefreshCw className="h-4 w-4" />Load audit</LoadingButton>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card title="Translated device commands">
          {rows.length ? (
            <div className="space-y-3">
              {rows.slice(0, 8).map((row, index) => (
                <div key={index} className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{String(row.device_id || "simulated device")}</p>
                    <Badge tone="emerald">no_real_execution={String(row.no_real_execution)}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{String(row.action || "translated command")} | {String(row.execution_mode || "simulated_device_api")}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No device command audit rows" message="Mark a proposal ready first, then reload this panel." />}
        </Card>
        <Card title="Full audit payload"><JsonViewer value={data || "No audit loaded yet."} /></Card>
      </div>
    </>
  );
}

function DataspacePage() {
  const [catalog, setCatalog] = useState<ApiEnvelope | null>(null);
  const [exportData, setExportData] = useState<ApiEnvelope | null>(null);
  const [loading, setLoading] = useState("");
  return (
    <>
      <PageHeader eyebrow="Dataspace export" title="Minimized and pseudonymized export view" description="Load catalog metadata and run full pipeline export summaries through Next.js server routes and the security gateway." />
      <div className="mb-4 flex flex-wrap gap-2">
        <LoadingButton loading={loading === "catalog"} onClick={async () => { setLoading("catalog"); setCatalog(await fetchJson("/api/dataspace/catalog")); setLoading(""); }}><Database className="h-4 w-4" />Load Catalog</LoadingButton>
        <LoadingButton loading={loading === "export"} onClick={async () => { setLoading("export"); setExportData(await fetchJson("/api/dataspace/export?asset=full&limit=20")); setLoading(""); }}><FileJson className="h-4 w-4" />Run Export Summary</LoadingButton>
        <CopyJsonButton value={exportData || catalog || {}} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Catalog"><JsonViewer value={catalog || "Catalog not loaded yet."} /></Card>
        <Card title="Full pipeline export"><JsonViewer value={exportData || "Export not loaded yet."} /></Card>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <StateLine ok label="Pseudonymized identifiers" detail="Household and device identifiers are pseudonymized by the dataspace service." />
        <StateLine ok label="Minimized output" detail="Exports include summaries, statuses, resource types, and safety flags." />
        <StateLine ok label="No raw private payloads" detail="The export policy avoids raw telemetry and source payload JSON." />
      </div>
    </>
  );
}

function AwsReadinessPage() {
  return (
    <>
      <PageHeader eyebrow="AWS readiness" title="Deployment preparation checklist" description="This page does not fake AWS deployment. It shows what is locally ready, what is prepared, and what still requires real credentials or infrastructure." />
      <div className="grid gap-4 xl:grid-cols-[1fr_0.7fr]">
        <div className="grid gap-3 md:grid-cols-2">
          {awsReadiness.map((item) => {
            const Icon = item.icon;
            const tone = item.status === "Ready locally" ? "emerald" : item.status === "Prepared for deployment" ? "blue" : "amber";
            return (
              <Card key={item.item}>
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-white/6"><Icon className="h-5 w-5 text-emerald-200" /></div>
                  <div>
                    <p className="text-sm font-semibold text-white">{item.item}</p>
                    <div className="mt-2"><Badge tone={tone}>{item.status}</Badge></div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <Card title="Readiness distribution">
          <ClientChartFrame>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie data={statusMix} innerRadius={58} outerRadius={92} paddingAngle={5} dataKey="value">
                  {statusMix.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#10141b", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </ClientChartFrame>
        </Card>
      </div>
    </>
  );
}

function RunbookPage() {
  return (
    <>
      <PageHeader eyebrow="Documentation and runbook" title="Local operation and deployment notes" description="Operational steps for the backend stack, the customer console, and future Vercel/AWS deployment." />
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card title="Run locally">
          <ol className="space-y-3">
            {runbookSteps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-300/12 text-xs font-semibold text-emerald-100">{index + 1}</span>
                <span className="text-sm leading-6 text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Environment variables">
          <JsonViewer value={{
            NEXT_PUBLIC_APP_NAME: "Smart Grid Communication Console",
            GATEWAY_BASE_URL: "server-side only gateway URL",
            "Edge API key": "server-side only local edge API key",
            DEMO_AUTH_USERNAME: "local demo operator",
            DEMO_AUTH_PASSWORD: "local demo password",
            NEXT_PUBLIC_DEPLOYMENT_MODE: "local"
          }} />
          <div className="mt-4 flex gap-2"><Badge tone="amber">Do not commit real secrets</Badge><Badge tone="blue">Vercel-ready structure</Badge></div>
        </Card>
      </div>
    </>
  );
}
