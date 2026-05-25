import {
  Activity,
  BadgeCheck,
  Blocks,
  BookOpen,
  Boxes,
  Cloud,
  DatabaseZap,
  FileJson,
  Gauge,
  GitBranch,
  Home,
  LockKeyhole,
  RadioTower,
  Satellite,
  Send,
  ServerCog,
  ShieldCheck,
  Workflow,
  Zap
} from "lucide-react";

export const navigation = [
  { href: "/overview", label: "Executive Overview", icon: Home },
  { href: "/architecture", label: "Architecture Flow", icon: GitBranch },
  { href: "/security", label: "Security Gateway", icon: ShieldCheck },
  { href: "/telemetry", label: "Telemetry Simulator", icon: Send },
  { href: "/semantic", label: "Semantic Mapping", icon: Blocks },
  { href: "/ieee20305", label: "IEEE 2030.5", icon: RadioTower },
  { href: "/dso", label: "DSO Load Management", icon: Activity },
  { href: "/dispatch", label: "Dispatch Proposals", icon: Workflow },
  { href: "/mock-dispatch", label: "Mock Dispatch", icon: BadgeCheck },
  { href: "/device-command", label: "Device Translation", icon: Zap },
  { href: "/dataspace", label: "Dataspace Export", icon: FileJson },
  { href: "/aws-readiness", label: "AWS Readiness", icon: Cloud },
  { href: "/runbook", label: "Runbook", icon: BookOpen }
];

export const pipelineNodes = [
  {
    id: "frontend",
    label: "External Client / Frontend",
    purpose: "Customer-facing operator console and future client applications.",
    route: "Browser calls Next.js API routes only",
    receives: "Operator actions, simulation forms, dashboard reads",
    produces: "Server-side API requests to the security gateway",
    status: "Ready locally"
  },
  {
    id: "gateway",
    label: "Security Gateway",
    purpose: "Single local edge for external HTTP traffic.",
    route: "GATEWAY_BASE_URL, default http://localhost:3010",
    receives: "Authenticated API requests from Next.js server routes",
    produces: "Audited internal service calls with correlation IDs",
    status: "Ready locally"
  },
  {
    id: "ingestion",
    label: "Telemetry Ingestion",
    purpose: "Accepts validated household telemetry.",
    route: "Gateway POST /telemetry",
    receives: "Household telemetry JSON",
    produces: "raw.telemetry Kafka messages",
    status: "Active component"
  },
  {
    id: "kafka",
    label: "Kafka",
    purpose: "Event backbone between services.",
    route: "Internal broker only",
    receives: "Pipeline events",
    produces: "Topic streams for downstream services",
    status: "Internal"
  },
  {
    id: "engine",
    label: "Engine",
    purpose: "Normalizes raw telemetry into consistent readings.",
    route: "Internal worker",
    receives: "raw.telemetry",
    produces: "normalized.telemetry",
    status: "Internal"
  },
  {
    id: "semantic",
    label: "SLM Semantic Connector",
    purpose: "Adds deterministic SAREF4ENER meaning and optional SLM assistance for unknown readings.",
    route: "Internal worker",
    receives: "normalized.telemetry",
    produces: "semantic.enriched and semantic_events",
    status: "Internal"
  },
  {
    id: "ieee",
    label: "IEEE 2030.5 Translator",
    purpose: "Creates simplified grid/DER style messages and DSO grid signals.",
    route: "Gateway POST /dso/grid-signal",
    receives: "semantic.enriched and DSO grid signal requests",
    produces: "ieee20305.translated and grid.signals",
    status: "Active component"
  },
  {
    id: "aggregator",
    label: "Aggregator",
    purpose: "Creates safe dispatch command proposals.",
    route: "Gateway GET /dispatch/proposals",
    receives: "grid.signals",
    produces: "dispatch.command.proposed",
    status: "Proposal-only"
  },
  {
    id: "approval",
    label: "Approval Workflow",
    purpose: "Controls review, approval, rejection, and ready-to-dispatch transitions.",
    route: "Gateway /approvals/*",
    receives: "dispatch.command.proposed",
    produces: "dispatch.command.ready",
    status: "No execution"
  },
  {
    id: "mock",
    label: "Mock Dispatch Adapter",
    purpose: "Simulates dispatch preparation and result events.",
    route: "Gateway GET /mock-dispatch/audit",
    receives: "dispatch.command.ready",
    produces: "dispatch.command.mock.sent and dispatch.command.mock.result",
    status: "Mock only"
  },
  {
    id: "device",
    label: "Device Command Translator",
    purpose: "Translates ready commands into simulated Shelly and Enode / Easee API language.",
    route: "Gateway GET /device-command/audit",
    receives: "dispatch.command.ready",
    produces: "device.command.result and device.command.audit",
    status: "Simulated only"
  },
  {
    id: "sims",
    label: "Shelly / Enode Simulators",
    purpose: "Local simulated end-device APIs for Shelly Plug and Easee Core charger flows.",
    route: "Internal simulator APIs",
    receives: "Translated simulated device commands",
    produces: "Simulated accepted responses",
    status: "No real devices"
  },
  {
    id: "dataspace",
    label: "Dataspace Export",
    purpose: "Exports minimized, pseudonymized summaries for external stakeholders.",
    route: "Gateway /dataspace/*",
    receives: "Pipeline audit and summary tables",
    produces: "Safe export payloads and audit records",
    status: "Local foundation"
  }
];

export const awsReadiness = [
  { item: "API Gateway mapping prepared", status: "Ready locally", icon: ServerCog },
  { item: "WAF and rate limiting concept prepared", status: "Ready locally", icon: ShieldCheck },
  { item: "Secrets Manager plan prepared", status: "Prepared for deployment", icon: LockKeyhole },
  { item: "ECS/Fargate service mapping prepared", status: "Prepared for deployment", icon: Boxes },
  { item: "Frontend deployment-ready structure", status: "Prepared for deployment", icon: Cloud },
  { item: "Domain", status: "Pending credentials", icon: Satellite },
  { item: "ACM certificate", status: "Pending credentials", icon: BadgeCheck },
  { item: "Real AWS credentials", status: "Pending credentials", icon: LockKeyhole },
  { item: "Cognito/Auth0/JWT issuer", status: "Pending credentials", icon: Gauge },
  { item: "Real connector credentials", status: "Pending credentials", icon: DatabaseZap }
];

export const runbookSteps = [
  "Copy apps/customer-console/.env.example to apps/customer-console/.env.local.",
  "Start Docker Desktop.",
  "From the repository root, run scripts/start-demo.ps1 -Build for backend services.",
  "From apps/customer-console, run npm install once and npm run dev.",
  "Open http://localhost:3000 and sign in with the configured demo operator account.",
  "Send telemetry and a DSO load reduction request through the console.",
  "Review, approve, and mark a proposal ready.",
  "Verify mock dispatch, simulated device API translation, dataspace export, and security audit panels.",
  "Stop backend services with scripts/stop-demo.ps1 when finished."
];
