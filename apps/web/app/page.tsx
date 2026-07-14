"use client";

import {
  Activity,
  AlertTriangle,
  Bell,
  Bolt,
  CheckCircle2,
  ChevronRight,
  Command,
  Gauge,
  GitBranch,
  History,
  LayoutDashboard,
  LifeBuoy,
  ListFilter,
  Lock,
  Play,
  RadioTower,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Siren,
  Sparkles,
  TerminalSquare,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  IncidentSeverity,
  IncidentStatus,
  MonitorType,
  ServiceStatus,
  type DashboardSummary,
  type IncidentSeverity as IncidentSeverityValue,
  type IncidentStatus as IncidentStatusValue,
  type MonitorType as MonitorTypeValue,
  type ServiceStatus as ServiceStatusValue
} from "@pulseops/shared";
import {
  compactPercent,
  incidentPriority,
  relativeAge,
  severityLabel,
  statusLabel,
  statusPriority
} from "./lib/pulseops";

type ViewKey = "overview" | "services" | "incidents" | "alerts" | "audit" | "settings";

type CheckResult = {
  id: string;
  monitorId: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
  createdAt: string;
};

type Monitor = {
  id: string;
  serviceId: string;
  name: string;
  type: MonitorTypeValue;
  targetUrl: string;
  method: string;
  expectedStatus: number;
  intervalSeconds: number;
  timeoutMs: number;
  isActive: boolean;
  checkResults?: CheckResult[];
};

type Service = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerTeam: string;
  status: ServiceStatusValue;
  updatedAt: string;
  monitors: Monitor[];
  incidents: Incident[];
};

type IncidentEvent = {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
  author?: {
    name: string;
    avatarUrl?: string | null;
  } | null;
};

type Incident = {
  id: string;
  serviceId: string;
  title: string;
  summary: string;
  severity: IncidentSeverityValue;
  status: IncidentStatusValue;
  assigneeName?: string | null;
  assignee?: {
    name: string;
    avatarUrl?: string | null;
  } | null;
  postmortem: string | null;
  openedAt: string;
  resolvedAt: string | null;
  service?: Pick<Service, "id" | "name" | "slug" | "status">;
  events?: IncidentEvent[];
};

type AlertRule = {
  id: string;
  name: string;
  severity: IncidentSeverityValue;
  channelType: "email" | "slack" | "webhook";
  thresholdMinutes: number;
  isEnabled: boolean;
  createdAt: string;
};

type NotificationLog = {
  id: string;
  channelType: string;
  target: string;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    name: string;
    email: string;
    avatarUrl?: string | null;
  } | null;
};

type SessionUser = {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  role: string;
};

type DashboardPayload = {
  organization: {
    id: string;
    name: string;
  };
  summary: DashboardSummary;
  servicesByStatus: Record<string, number>;
  latencySeries: Array<{
    time: string;
    latencyMs: number;
    ok: boolean;
  }>;
  services: Service[];
  incidents: Incident[];
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? API_URL.replace(/\/api\/v1$/, "");

const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "matias@pulseops.dev";
const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "pulseops-demo";

function shouldUseLiveApi() {
  if (process.env.NEXT_PUBLIC_ENABLE_LIVE_API === "true") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  if (window.location.search.includes("demo=1")) {
    return false;
  }

  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

const serviceSeeds: Array<Omit<Service, "monitors" | "incidents">> = [
  {
    id: "svc-edge",
    name: "Edge Gateway",
    slug: "edge-gateway",
    ownerTeam: "Platform",
    status: ServiceStatus.Operational,
    description: "Global traffic routing and request shielding.",
    updatedAt: ago(3)
  },
  {
    id: "svc-checkout",
    name: "Checkout API",
    slug: "checkout-api",
    ownerTeam: "Revenue",
    status: ServiceStatus.Degraded,
    description: "Payments, invoices and order orchestration.",
    updatedAt: ago(11)
  },
  {
    id: "svc-identity",
    name: "Identity Core",
    slug: "identity-core",
    ownerTeam: "Security",
    status: ServiceStatus.Operational,
    description: "Authentication, sessions and organization membership.",
    updatedAt: ago(7)
  },
  {
    id: "svc-telemetry",
    name: "Telemetry Stream",
    slug: "telemetry-stream",
    ownerTeam: "Observability",
    status: ServiceStatus.MajorOutage,
    description: "Event ingestion and real-time analytics pipelines.",
    updatedAt: ago(2)
  },
  {
    id: "svc-notify",
    name: "Notification Relay",
    slug: "notification-relay",
    ownerTeam: "Comms",
    status: ServiceStatus.Operational,
    description: "Slack, email and webhook delivery fanout.",
    updatedAt: ago(16)
  }
];

const makeCheck = (
  monitorId: string,
  ok: boolean,
  latencyMs: number,
  minutes: number
): CheckResult => ({
  id: `${monitorId}-${minutes}`,
  monitorId,
  ok,
  statusCode: ok ? 200 : 503,
  latencyMs,
  error: ok ? null : "Synthetic SLO breached",
  createdAt: ago(minutes)
});

const demoServices: Service[] = serviceSeeds.map((service, index) => ({
  ...service,
  monitors: [
    {
      id: `${service.id}-http`,
      serviceId: service.id,
      name: `${service.name} health endpoint`,
      type: MonitorType.Http,
      targetUrl:
        service.slug === "telemetry-stream"
          ? "demo://telemetry-down"
          : service.slug === "checkout-api"
            ? "demo://checkout-flaky"
            : "demo://healthy",
      method: "GET",
      expectedStatus: 200,
      intervalSeconds: 60,
      timeoutMs: 3000,
      isActive: true,
      checkResults: [
        makeCheck(
          `${service.id}-http`,
          service.status !== ServiceStatus.MajorOutage,
          96 + index * 28,
          4
        )
      ]
    },
    {
      id: `${service.id}-synthetic`,
      serviceId: service.id,
      name: `${service.name} synthetic journey`,
      type: MonitorType.Synthetic,
      targetUrl: "demo://journey",
      method: "GET",
      expectedStatus: 200,
      intervalSeconds: 120,
      timeoutMs: 5000,
      isActive: true,
      checkResults: [
        makeCheck(
          `${service.id}-synthetic`,
          service.status === ServiceStatus.Operational,
          145 + index * 34,
          8
        )
      ]
    }
  ],
  incidents: []
}));

const demoIncidents: Incident[] = [
  {
    id: "inc-telemetry",
    serviceId: "svc-telemetry",
    title: "Telemetry ingestion queue stalled",
    summary:
      "Event ingestion workers are timing out and dashboard freshness is behind by 18 minutes.",
    severity: IncidentSeverity.Sev1,
    status: IncidentStatus.Open,
    assigneeName: "Matias Silva",
    assignee: { name: "Matias Silva" },
    postmortem: null,
    openedAt: ago(37),
    resolvedAt: null,
    service: {
      id: "svc-telemetry",
      name: "Telemetry Stream",
      slug: "telemetry-stream",
      status: ServiceStatus.MajorOutage
    },
    events: [
      {
        id: "evt-telemetry-auto",
        kind: "automation",
        message: "Major outage created after sustained ingestion failures.",
        createdAt: ago(37),
        author: { name: "PulseOps Worker" }
      }
    ]
  },
  {
    id: "inc-checkout",
    serviceId: "svc-checkout",
    title: "Checkout API latency above SLO",
    summary:
      "p95 latency crossed 900ms for multiple regions after a payment provider retry storm.",
    severity: IncidentSeverity.Sev2,
    status: IncidentStatus.Acknowledged,
    assigneeName: "Lina Torres",
    assignee: { name: "Lina Torres" },
    postmortem: null,
    openedAt: ago(96),
    resolvedAt: null,
    service: {
      id: "svc-checkout",
      name: "Checkout API",
      slug: "checkout-api",
      status: ServiceStatus.Degraded
    },
    events: [
      {
        id: "evt-checkout-auto",
        kind: "automation",
        message: "Incident opened automatically after 3 failed checks.",
        createdAt: ago(96),
        author: { name: "PulseOps Worker" }
      },
      {
        id: "evt-checkout-ack",
        kind: "status_change",
        message: "Lina acknowledged and started provider failover.",
        createdAt: ago(84),
        author: { name: "Lina Torres" }
      }
    ]
  }
];

const demoLatencySeries = Array.from({ length: 64 }).map((_, index) => ({
  time: ago((64 - index) * 5),
  latencyMs:
    110 +
    Math.round(Math.sin(index / 5) * 34) +
    (index > 51 ? (index - 51) * 21 : 0),
  ok: index < 58 || index % 3 !== 0
}));

const demoDashboard: DashboardPayload = {
  organization: {
    id: "org-demo",
    name: "PulseOps Demo Cloud"
  },
  summary: {
    serviceCount: demoServices.length,
    monitorCount: demoServices.reduce(
      (total, service) => total + service.monitors.length,
      0
    ),
    openIncidentCount: demoIncidents.length,
    uptime: 98.74,
    averageLatencyMs: 214,
    failingMonitorCount: 3
  },
  servicesByStatus: {
    [ServiceStatus.Operational]: 3,
    [ServiceStatus.Degraded]: 1,
    [ServiceStatus.MajorOutage]: 1,
    [ServiceStatus.Maintenance]: 0
  },
  latencySeries: demoLatencySeries,
  services: demoServices,
  incidents: demoIncidents
};

const demoRules: AlertRule[] = [
  {
    id: "rule-sev1",
    name: "SEV1 page responders",
    severity: IncidentSeverity.Sev1,
    channelType: "slack",
    thresholdMinutes: 0,
    isEnabled: true,
    createdAt: ago(170)
  },
  {
    id: "rule-sev2",
    name: "SEV2 email incident channel",
    severity: IncidentSeverity.Sev2,
    channelType: "email",
    thresholdMinutes: 5,
    isEnabled: true,
    createdAt: ago(160)
  },
  {
    id: "rule-webhook",
    name: "Webhook for incident archive",
    severity: IncidentSeverity.Sev3,
    channelType: "webhook",
    thresholdMinutes: 15,
    isEnabled: true,
    createdAt: ago(154)
  }
];

const demoLogs: NotificationLog[] = [
  {
    id: "log-telemetry",
    channelType: "slack",
    target: "#incident-command",
    status: "simulated",
    payload: { title: "Telemetry ingestion queue stalled" },
    createdAt: ago(36)
  },
  {
    id: "log-checkout",
    channelType: "email",
    target: "oncall@pulseops.dev",
    status: "simulated",
    payload: { title: "Checkout API latency above SLO" },
    createdAt: ago(82)
  }
];

const demoAudit: AuditLog[] = [
  {
    id: "audit-login",
    action: "login",
    entityType: "session",
    entityId: null,
    metadata: { strategy: "password" },
    createdAt: ago(11),
    actor: { name: "Matias Silva", email: demoEmail }
  },
  {
    id: "audit-alert",
    action: "alert.sent",
    entityType: "notification",
    entityId: "inc-telemetry",
    metadata: { channel: "slack", simulated: true },
    createdAt: ago(36),
    actor: { name: "PulseOps Worker", email: "worker@pulseops.dev" }
  },
  {
    id: "audit-update",
    action: "incident.updated",
    entityType: "incident",
    entityId: "inc-checkout",
    metadata: { status: "acknowledged" },
    createdAt: ago(84),
    actor: { name: "Lina Torres", email: "lina@pulseops.dev" }
  }
];

const navItems: Array<{
  id: ViewKey;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "services", label: "Services", icon: RadioTower },
  { id: "incidents", label: "Incidents", icon: Siren },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "audit", label: "Audit", icon: History },
  { id: "settings", label: "Settings", icon: Settings }
];

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`PulseOps API returned ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function channelIcon(channel: string) {
  if (channel === "slack") {
    return <Command size={15} />;
  }

  if (channel === "webhook") {
    return <GitBranch size={15} />;
  }

  return <Bell size={15} />;
}

function statusDot(status: ServiceStatusValue | string) {
  return <span className={`status-dot status-${status}`} aria-hidden="true" />;
}

export default function PulseOpsPage() {
  const [view, setView] = useState<ViewKey>("overview");
  const [dashboard, setDashboard] = useState<DashboardPayload>(demoDashboard);
  const [services, setServices] = useState<Service[]>(demoServices);
  const [incidents, setIncidents] = useState<Incident[]>(demoIncidents);
  const [rules, setRules] = useState<AlertRule[]>(demoRules);
  const [logs, setLogs] = useState<NotificationLog[]>(demoLogs);
  const [audit, setAudit] = useState<AuditLog[]>(demoAudit);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiMode, setApiMode] = useState<"live" | "fallback">("fallback");
  const [connected, setConnected] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(
    demoIncidents[0]?.id ?? ""
  );
  const [notice, setNotice] = useState<string | null>(null);

  const switchView = useCallback((nextView: ViewKey) => {
    setView(nextView);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${nextView}`);
    }
  }, []);

  const loadData = useCallback(async (loginFirst = true) => {
    setLoading(true);

    try {
      if (!shouldUseLiveApi()) {
        throw new Error("Public demo mode uses embedded recruiter data.");
      }

      if (loginFirst) {
        await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: demoEmail,
            password: demoPassword
          })
        });
      }

      const [session, overview, serviceList, incidentList, ruleList, logList, auditList] =
        await Promise.all([
          apiRequest<SessionUser>("/me"),
          apiRequest<DashboardPayload>("/dashboard"),
          apiRequest<Service[]>("/services"),
          apiRequest<Incident[]>("/incidents"),
          apiRequest<AlertRule[]>("/alert-rules"),
          apiRequest<NotificationLog[]>("/notifications/logs"),
          apiRequest<AuditLog[]>("/audit-logs")
        ]);

      setMe(session);
      setDashboard(overview);
      setServices(serviceList);
      setIncidents(incidentList);
      setRules(ruleList);
      setLogs(logList);
      setAudit(auditList);
      setApiMode("live");
      setSelectedIncidentId((current) => current || incidentList[0]?.id || "");
    } catch {
      setDashboard(demoDashboard);
      setServices(demoServices);
      setIncidents(demoIncidents);
      setRules(demoRules);
      setLogs(demoLogs);
      setAudit(demoAudit);
      setMe({
        userId: "demo-user",
        email: demoEmail,
        name: "Matias Silva",
        organizationId: demoDashboard.organization.id,
        organizationName: demoDashboard.organization.name,
        role: "owner"
      });
      setApiMode("fallback");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    const hashView = navItems.find((item) => item.id === hash)?.id;

    if (hashView) {
      setView(hashView);
    }

    void loadData(true);
  }, [loadData]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (apiMode !== "live") {
      setConnected(false);
      return;
    }

    let cleanup = () => {};

    void import("socket.io-client").then(({ io }) => {
      const socket = io(WS_URL, {
        withCredentials: true,
        transports: ["websocket", "polling"]
      });

      socket.on("connect", () => {
        setConnected(true);
        socket.emit("joinOrg", {
          organizationId: dashboard.organization.id
        });
      });

      socket.on("disconnect", () => setConnected(false));

      socket.on("incident.created", () => {
        setNotice("New incident received from the monitor worker.");
        void loadData(false);
      });

      socket.on("incident.updated", () => {
        setNotice("Incident timeline updated.");
        void loadData(false);
      });

      socket.on("monitor.check.completed", () => {
        setNotice("A monitor check completed.");
        void loadData(false);
      });

      socket.on("alert.sent", () => {
        setNotice("Simulated alert delivery recorded.");
        void loadData(false);
      });

      cleanup = () => socket.disconnect();
    });

    return () => cleanup();
  }, [apiMode, dashboard.organization.id, loadData]);

  const activeIncidents = useMemo(
    () =>
      incidents
        .filter((incident) => incident.status !== IncidentStatus.Resolved)
        .sort((left, right) => incidentPriority(right) - incidentPriority(left)),
    [incidents]
  );

  const sortedServices = useMemo(
    () =>
      [...services].sort(
        (left, right) => statusPriority(right.status) - statusPriority(left.status)
      ),
    [services]
  );

  const selectedIncident =
    incidents.find((incident) => incident.id === selectedIncidentId) ??
    incidents[0] ??
    null;

  const latencyData = useMemo(
    () =>
      dashboard.latencySeries.map((point) => ({
        ...point,
        label: new Date(point.time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })
      })),
    [dashboard.latencySeries]
  );

  const statusData = useMemo(
    () =>
      Object.entries(dashboard.servicesByStatus).map(([status, count]) => ({
        status,
        label: statusLabel(status),
        count
      })),
    [dashboard.servicesByStatus]
  );

  const commands = useMemo(
    () => [
      ...navItems.map((item) => ({
        id: item.id,
        label: `Open ${item.label}`,
        action: () => switchView(item.id)
      })),
      {
        id: "refresh",
        label: "Refresh live data",
        action: () => void loadData(false)
      },
      {
        id: "drill",
        label: "Run incident drill",
        action: () => void runIncidentDrill()
      }
    ],
    [loadData, switchView]
  );

  const filteredCommands = commands.filter((command) =>
    command.label.toLowerCase().includes(query.toLowerCase())
  );

  async function runIncidentDrill() {
    const service =
      services.find((candidate) => candidate.status === ServiceStatus.Operational) ??
      services[0];

    if (!service) {
      return;
    }

    const payload = {
      serviceId: service.id,
      title: `${service.name} synthetic drill`,
      summary:
        "Manual drill opened from the UI to demonstrate the incident response workflow.",
      severity: IncidentSeverity.Sev3
    };

    try {
      const incident = await apiRequest<Incident>("/incidents", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setNotice("Incident drill created through the API.");
      setSelectedIncidentId(incident.id);
      switchView("incidents");
      await loadData(false);
    } catch {
      const incident: Incident = {
        id: `inc-drill-${Date.now()}`,
        serviceId: service.id,
        title: payload.title,
        summary: payload.summary,
        severity: payload.severity,
        status: IncidentStatus.Open,
        assigneeName: me?.name ?? "Matias Silva",
        postmortem: null,
        openedAt: new Date().toISOString(),
        resolvedAt: null,
        service: {
          id: service.id,
          name: service.name,
          slug: service.slug,
          status: service.status
        },
        events: [
          {
            id: `evt-${Date.now()}`,
            kind: "note",
            message: "Incident opened locally because the API is not connected.",
            createdAt: new Date().toISOString(),
            author: { name: me?.name ?? "Matias Silva" }
          }
        ]
      };

      setIncidents((current) => [incident, ...current]);
      setSelectedIncidentId(incident.id);
      switchView("incidents");
      setNotice("Fallback drill created locally. Start the API for persistence.");
    }
  }

  async function updateIncidentStatus(
    incident: Incident,
    status: IncidentStatusValue
  ) {
    try {
      const updated = await apiRequest<Incident>(`/incidents/${incident.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setIncidents((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setNotice(`Incident moved to ${status}.`);
    } catch {
      setIncidents((current) =>
        current.map((item) =>
          item.id === incident.id
            ? {
                ...item,
                status,
                resolvedAt:
                  status === IncidentStatus.Resolved
                    ? new Date().toISOString()
                    : item.resolvedAt,
                events: [
                  ...(item.events ?? []),
                  {
                    id: `evt-${Date.now()}`,
                    kind: "status_change",
                    message: `Incident moved to ${status} locally.`,
                    createdAt: new Date().toISOString(),
                    author: { name: me?.name ?? "Matias Silva" }
                  }
                ]
              }
            : item
        )
      );
      setNotice("Status updated locally. API is not connected.");
    }
  }

  async function runMonitor(monitor: Monitor) {
    try {
      await apiRequest(`/monitors/${monitor.id}/run`, {
        method: "POST"
      });
      setNotice(`${monitor.name} executed through the worker engine.`);
      await loadData(false);
    } catch {
      setNotice("Monitor run simulated locally. Start the API for real checks.");
    }
  }

  function renderOverview() {
    return (
      <div className="view-grid">
        <section className="command-surface">
          <div>
            <div className="eyebrow">
              <Sparkles size={16} />
              Live incident command
            </div>
            <h1>PulseOps Command Center</h1>
            <p>
              Services, probes, incidents and alert trails in one operational
              cockpit.
            </p>
          </div>
          <div className="hero-actions">
            <button className="primary-action" onClick={() => void runIncidentDrill()}>
              <Play size={17} />
              Drill
            </button>
            <button className="icon-button" aria-label="Refresh data" onClick={() => void loadData(false)}>
              <RefreshCw size={18} />
            </button>
          </div>
        </section>

        <section className="metric-grid">
          <MetricCard
            icon={RadioTower}
            label="Services"
            value={dashboard.summary.serviceCount}
            detail={`${dashboard.summary.failingMonitorCount} failing monitors`}
            tone="cyan"
          />
          <MetricCard
            icon={ShieldCheck}
            label="Uptime"
            value={compactPercent(dashboard.summary.uptime)}
            detail="last 500 checks"
            tone="green"
          />
          <MetricCard
            icon={Gauge}
            label="Avg latency"
            value={`${dashboard.summary.averageLatencyMs}ms`}
            detail={`${dashboard.summary.monitorCount} active probes`}
            tone="amber"
          />
          <MetricCard
            icon={Siren}
            label="Open incidents"
            value={dashboard.summary.openIncidentCount}
            detail="active response"
            tone="rose"
          />
        </section>

        <section className="panel wide">
          <PanelHeader
            icon={Activity}
            title="Latency Stream"
            action={`${connected ? "socket live" : apiMode}`}
          />
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={270}>
              <AreaChart data={latencyData}>
                <defs>
                  <linearGradient id="latencyGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#3dd6b4" stopOpacity={0.62} />
                    <stop offset="100%" stopColor="#3dd6b4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tickLine={false} axisLine={false} width={42} />
                <Tooltip
                  contentStyle={{
                    background: "#10141d",
                    border: "1px solid rgba(255,255,255,.12)",
                    borderRadius: 8,
                    color: "#f4f7fb"
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="latencyMs"
                  stroke="#3dd6b4"
                  fill="url(#latencyGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <PanelHeader icon={Bolt} title="Service Health" action="by status" />
          <div className="donut-layout">
            <ResponsiveContainer width="100%" height={205}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {statusData.map((entry) => (
                    <Cell key={entry.status} fill={`var(--status-${entry.status})`} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#10141d",
                    border: "1px solid rgba(255,255,255,.12)",
                    borderRadius: 8,
                    color: "#f4f7fb"
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="status-legend">
              {statusData.map((entry) => (
                <div key={entry.status}>
                  {statusDot(entry.status)}
                  <span>{entry.label}</span>
                  <strong>{entry.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel wide">
          <PanelHeader icon={RadioTower} title="Service Map" action="latest probe" />
          <div className="service-map">
            {sortedServices.map((service) => (
              <button
                key={service.id}
                className={`service-node service-${service.status}`}
                onClick={() => switchView("services")}
              >
                <span>{statusDot(service.status)}</span>
                <strong>{service.name}</strong>
                <small>{service.ownerTeam}</small>
                <em>
                  {service.monitors.length} probes · {relativeAge(service.updatedAt)}
                </em>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeader icon={Siren} title="Incident Queue" action="priority" />
          <div className="incident-stack">
            {activeIncidents.map((incident) => (
              <button
                key={incident.id}
                className={`incident-item severity-${incident.severity}`}
                onClick={() => {
                  setSelectedIncidentId(incident.id);
                  switchView("incidents");
                }}
              >
                <span>{severityLabel(incident.severity)}</span>
                <strong>{incident.title}</strong>
                <small>
                  {incident.service?.name ?? "Unknown service"} ·{" "}
                  {relativeAge(incident.openedAt)}
                </small>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderServices() {
    const teamData = Object.entries(
      services.reduce<Record<string, number>>((acc, service) => {
        acc[service.ownerTeam] = (acc[service.ownerTeam] ?? 0) + 1;
        return acc;
      }, {})
    ).map(([team, count]) => ({ team, count }));

    return (
      <div className="view-grid">
        <section className="panel wide">
          <PanelHeader icon={RadioTower} title="Services" action="tenant scoped" />
          <div className="data-table">
            <div className="table-row table-head">
              <span>Service</span>
              <span>Status</span>
              <span>Owner</span>
              <span>Monitors</span>
              <span>Latest</span>
            </div>
            {sortedServices.map((service) => {
              const latestCheck = service.monitors
                .flatMap((monitor) => monitor.checkResults ?? [])
                .sort(
                  (left, right) =>
                    new Date(right.createdAt).getTime() -
                    new Date(left.createdAt).getTime()
                )[0];

              return (
                <div className="table-row" key={service.id}>
                  <span className="service-cell">
                    <strong>{service.name}</strong>
                    <small>{service.description}</small>
                  </span>
                  <span className={`pill pill-${service.status}`}>
                    {statusDot(service.status)}
                    {statusLabel(service.status)}
                  </span>
                  <span>{service.ownerTeam}</span>
                  <span>{service.monitors.length}</span>
                  <span className={latestCheck?.ok ? "ok-text" : "bad-text"}>
                    {latestCheck
                      ? `${latestCheck.latencyMs}ms · ${latestCheck.statusCode}`
                      : "No checks"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <PanelHeader icon={ListFilter} title="Ownership" action="teams" />
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={teamData} layout="vertical">
              <CartesianGrid stroke="rgba(255,255,255,.08)" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="team" type="category" width={92} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "#10141d",
                  border: "1px solid rgba(255,255,255,.12)",
                  borderRadius: 8,
                  color: "#f4f7fb"
                }}
              />
              <Bar dataKey="count" fill="#f7c66b" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel wide">
          <PanelHeader icon={TerminalSquare} title="Monitors" action="run now" />
          <div className="monitor-grid">
            {services.flatMap((service) =>
              service.monitors.map((monitor) => (
                <div className="monitor-card" key={monitor.id}>
                  <div>
                    <strong>{monitor.name}</strong>
                    <small>{monitor.targetUrl}</small>
                  </div>
                  <span className="pill neutral">{monitor.type}</span>
                  <button
                    className="icon-button"
                    aria-label={`Run ${monitor.name}`}
                    onClick={() => void runMonitor(monitor)}
                  >
                    <Play size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderIncidents() {
    return (
      <div className="incident-layout">
        <section className="panel incident-list-panel">
          <PanelHeader icon={Siren} title="Incidents" action={`${incidents.length} total`} />
          <div className="incident-list">
            {incidents.map((incident) => (
              <button
                key={incident.id}
                className={`incident-row ${
                  selectedIncident?.id === incident.id ? "selected" : ""
                }`}
                onClick={() => setSelectedIncidentId(incident.id)}
              >
                <span className={`severity-chip severity-${incident.severity}`}>
                  {severityLabel(incident.severity)}
                </span>
                <strong>{incident.title}</strong>
                <small>
                  {incident.service?.name ?? "Unknown service"} ·{" "}
                  {statusLabel(incident.status)}
                </small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel incident-detail-panel">
          {selectedIncident ? (
            <>
              <div className="incident-detail-head">
                <div>
                  <span className={`severity-chip severity-${selectedIncident.severity}`}>
                    {severityLabel(selectedIncident.severity)}
                  </span>
                  <h2>{selectedIncident.title}</h2>
                  <p>{selectedIncident.summary}</p>
                </div>
                <div className="incident-actions">
                  <button
                    className="secondary-action"
                    onClick={() =>
                      void updateIncidentStatus(
                        selectedIncident,
                        IncidentStatus.Acknowledged
                      )
                    }
                  >
                    <CheckCircle2 size={16} />
                    Ack
                  </button>
                  <button
                    className="primary-action"
                    onClick={() =>
                      void updateIncidentStatus(selectedIncident, IncidentStatus.Resolved)
                    }
                  >
                    <ShieldCheck size={16} />
                    Resolve
                  </button>
                </div>
              </div>

              <div className="detail-grid">
                <Detail label="Service" value={selectedIncident.service?.name ?? "Unknown"} />
                <Detail label="Status" value={statusLabel(selectedIncident.status)} />
                <Detail
                  label="Assignee"
                  value={
                    selectedIncident.assignee?.name ??
                    selectedIncident.assigneeName ??
                    "Unassigned"
                  }
                />
                <Detail label="Opened" value={relativeAge(selectedIncident.openedAt)} />
              </div>

              <div className="timeline">
                {(selectedIncident.events ?? []).map((event) => (
                  <div className="timeline-item" key={event.id}>
                    <span />
                    <div>
                      <strong>{event.message}</strong>
                      <small>
                        {event.author?.name ?? "System"} · {relativeAge(event.createdAt)}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <LifeBuoy size={32} />
              <strong>No incidents selected</strong>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderAlerts() {
    return (
      <div className="view-grid">
        <section className="panel">
          <PanelHeader icon={Bell} title="Alert Rules" action="simulated" />
          <div className="rule-stack">
            {rules.map((rule) => (
              <div className="rule-card" key={rule.id}>
                <div>
                  <span className={`severity-chip severity-${rule.severity}`}>
                    {severityLabel(rule.severity)}
                  </span>
                  <strong>{rule.name}</strong>
                  <small>
                    after {rule.thresholdMinutes}m · {rule.isEnabled ? "enabled" : "paused"}
                  </small>
                </div>
                <span className="channel-pill">
                  {channelIcon(rule.channelType)}
                  {rule.channelType}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel wide">
          <PanelHeader icon={Zap} title="Notification Logs" action="delivery trail" />
          <div className="data-table compact">
            <div className="table-row table-head">
              <span>Channel</span>
              <span>Target</span>
              <span>Status</span>
              <span>Payload</span>
              <span>Time</span>
            </div>
            {logs.map((log) => (
              <div className="table-row" key={log.id}>
                <span className="channel-pill">
                  {channelIcon(log.channelType)}
                  {log.channelType}
                </span>
                <span>{log.target}</span>
                <span className="ok-text">{log.status}</span>
                <span>{String(log.payload.title ?? "incident alert")}</span>
                <span>{relativeAge(log.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderAudit() {
    return (
      <section className="panel full">
        <PanelHeader icon={History} title="Audit Log" action="append only" />
        <div className="data-table compact">
          <div className="table-row table-head">
            <span>Action</span>
            <span>Actor</span>
            <span>Entity</span>
            <span>Metadata</span>
            <span>Time</span>
          </div>
          {audit.map((entry) => (
            <div className="table-row" key={entry.id}>
              <span>{entry.action}</span>
              <span>{entry.actor?.name ?? "System"}</span>
              <span>{entry.entityType}</span>
              <span>{entry.metadata ? JSON.stringify(entry.metadata) : "none"}</span>
              <span>{relativeAge(entry.createdAt)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderSettings() {
    return (
      <div className="view-grid">
        <section className="panel">
          <PanelHeader icon={Lock} title="Session" action={apiMode} />
          <div className="settings-stack">
            <Detail label="User" value={me?.name ?? "Demo user"} />
            <Detail label="Email" value={me?.email ?? demoEmail} />
            <Detail label="Role" value={me?.role ?? "owner"} />
            <Detail
              label="Organization"
              value={me?.organizationName ?? dashboard.organization.name}
            />
          </div>
        </section>

        <section className="panel wide">
          <PanelHeader icon={TerminalSquare} title="Backend Surface" action="REST + WS" />
          <div className="endpoint-grid">
            {[
              "POST /api/v1/auth/login",
              "GET /api/v1/me",
              "GET /api/v1/dashboard",
              "GET/POST /api/v1/services",
              "GET/POST /api/v1/monitors",
              "GET/POST /api/v1/incidents",
              "POST /api/v1/incidents/:id/events",
              "GET/POST /api/v1/alert-rules",
              "GET /api/v1/audit-logs",
              "WS incident.updated"
            ].map((endpoint) => (
              <code key={endpoint}>{endpoint}</code>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={22} />
          </div>
          <div>
            <strong>PulseOps</strong>
            <span>Incident Command</span>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => switchView(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className={`connection ${connected ? "on" : ""}`}>
            <span />
            {connected ? "WebSocket live" : apiMode === "live" ? "API live" : "Demo fallback"}
          </span>
          <small>{dashboard.organization.name}</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="command-trigger" onClick={() => setCommandOpen(true)}>
            <Search size={17} />
            <span>Search commands</span>
            <kbd>Ctrl K</kbd>
          </button>

          <div className="topbar-actions">
            {loading ? <span className="loading-pulse">Syncing</span> : null}
            <button className="icon-button" aria-label="Refresh data" onClick={() => void loadData(false)}>
              <RefreshCw size={17} />
            </button>
            <button className="primary-action" onClick={() => void runIncidentDrill()}>
              <Siren size={16} />
              Drill
            </button>
            <div className="user-chip">
              <span>{(me?.name ?? "MS").slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{me?.name ?? "Matias Silva"}</strong>
                <small>{me?.role ?? "owner"}</small>
              </div>
            </div>
          </div>
        </header>

        {notice ? (
          <button className="notice" onClick={() => setNotice(null)}>
            <AlertTriangle size={16} />
            {notice}
          </button>
        ) : null}

        {view === "overview" ? renderOverview() : null}
        {view === "services" ? renderServices() : null}
        {view === "incidents" ? renderIncidents() : null}
        {view === "alerts" ? renderAlerts() : null}
        {view === "audit" ? renderAudit() : null}
        {view === "settings" ? renderSettings() : null}
      </section>

      {commandOpen ? (
        <div className="command-backdrop" onClick={() => setCommandOpen(false)}>
          <div className="command-menu" onClick={(event) => event.stopPropagation()}>
            <div className="command-input">
              <Command size={18} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Jump to a view or action"
              />
            </div>
            <div className="command-results">
              {filteredCommands.map((command) => (
                <button
                  key={command.id}
                  onClick={() => {
                    command.action();
                    setCommandOpen(false);
                    setQuery("");
                  }}
                >
                  <ChevronRight size={16} />
                  {command.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  detail: string;
  tone: "cyan" | "green" | "amber" | "rose";
}) {
  return (
    <section className={`metric-card tone-${tone}`}>
      <div>
        <Icon size={19} />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  action
}: {
  icon: typeof Activity;
  title: string;
  action: string;
}) {
  return (
    <div className="panel-header">
      <div>
        <Icon size={17} />
        <h2>{title}</h2>
      </div>
      <span>{action}</span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
