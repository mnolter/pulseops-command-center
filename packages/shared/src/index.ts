import { z } from "zod";

export const ServiceStatus = {
  Operational: "operational",
  Degraded: "degraded",
  MajorOutage: "major_outage",
  Maintenance: "maintenance"
} as const;
export type ServiceStatus = (typeof ServiceStatus)[keyof typeof ServiceStatus];

export const IncidentSeverity = {
  Sev1: "sev1",
  Sev2: "sev2",
  Sev3: "sev3",
  Sev4: "sev4"
} as const;
export type IncidentSeverity =
  (typeof IncidentSeverity)[keyof typeof IncidentSeverity];

export const IncidentStatus = {
  Open: "open",
  Acknowledged: "acknowledged",
  Resolved: "resolved"
} as const;
export type IncidentStatus =
  (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const MonitorType = {
  Http: "http",
  Synthetic: "synthetic"
} as const;
export type MonitorType = (typeof MonitorType)[keyof typeof MonitorType];

export const UserRole = {
  Owner: "owner",
  Admin: "admin",
  Responder: "responder",
  Viewer: "viewer"
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AuditAction = {
  Login: "login",
  ServiceCreated: "service.created",
  ServiceUpdated: "service.updated",
  MonitorCreated: "monitor.created",
  CheckCompleted: "monitor.check.completed",
  IncidentCreated: "incident.created",
  IncidentUpdated: "incident.updated",
  AlertSent: "alert.sent"
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const NotificationChannelType = {
  Email: "email",
  Slack: "slack",
  Webhook: "webhook"
} as const;
export type NotificationChannelType =
  (typeof NotificationChannelType)[keyof typeof NotificationChannelType];

export const serviceSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(240).optional(),
  ownerTeam: z.string().min(2).max(80)
});

export const monitorSchema = z.object({
  serviceId: z.string().min(1),
  name: z.string().min(2).max(80),
  type: z.enum([MonitorType.Http, MonitorType.Synthetic]),
  targetUrl: z.string().min(4),
  method: z.enum(["GET", "POST", "HEAD"]).default("GET"),
  expectedStatus: z.number().int().min(100).max(599).default(200),
  intervalSeconds: z.number().int().min(30).max(3600).default(60),
  timeoutMs: z.number().int().min(500).max(30000).default(5000)
});

export const incidentSchema = z.object({
  serviceId: z.string().min(1),
  title: z.string().min(4).max(120),
  summary: z.string().min(8).max(500),
  severity: z.enum([
    IncidentSeverity.Sev1,
    IncidentSeverity.Sev2,
    IncidentSeverity.Sev3,
    IncidentSeverity.Sev4
  ])
});

export const incidentEventSchema = z.object({
  message: z.string().min(2).max(500),
  kind: z.enum(["note", "status_change", "automation", "postmortem"]).default(
    "note"
  )
});

export const alertRuleSchema = z.object({
  name: z.string().min(2).max(80),
  severity: z.enum([
    IncidentSeverity.Sev1,
    IncidentSeverity.Sev2,
    IncidentSeverity.Sev3,
    IncidentSeverity.Sev4
  ]),
  channelType: z.enum([
    NotificationChannelType.Email,
    NotificationChannelType.Slack,
    NotificationChannelType.Webhook
  ]),
  thresholdMinutes: z.number().int().min(0).max(240).default(0)
});

export type ServiceContract = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerTeam: string;
  status: ServiceStatus;
  updatedAt: string;
};

export type MonitorContract = {
  id: string;
  serviceId: string;
  name: string;
  type: MonitorType;
  targetUrl: string;
  method: string;
  expectedStatus: number;
  intervalSeconds: number;
  timeoutMs: number;
  isActive: boolean;
};

export type CheckResultContract = {
  id: string;
  monitorId: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
  createdAt: string;
};

export type IncidentContract = {
  id: string;
  serviceId: string;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  assigneeName: string | null;
  postmortem: string | null;
  openedAt: string;
  resolvedAt: string | null;
};

export type DashboardSummary = {
  serviceCount: number;
  monitorCount: number;
  openIncidentCount: number;
  uptime: number;
  averageLatencyMs: number;
  failingMonitorCount: number;
};

export function severityRank(severity: IncidentSeverity): number {
  return {
    [IncidentSeverity.Sev1]: 4,
    [IncidentSeverity.Sev2]: 3,
    [IncidentSeverity.Sev3]: 2,
    [IncidentSeverity.Sev4]: 1
  }[severity];
}

export function deriveServiceStatus(options: {
  failingChecks: number;
  activeIncidents: Array<{ severity: IncidentSeverity }>;
}): ServiceStatus {
  const highestSeverity = options.activeIncidents
    .map((incident) => severityRank(incident.severity))
    .sort((left, right) => right - left)[0];

  if (highestSeverity && highestSeverity >= severityRank(IncidentSeverity.Sev1)) {
    return ServiceStatus.MajorOutage;
  }

  if (
    options.failingChecks > 0 ||
    (highestSeverity && highestSeverity >= severityRank(IncidentSeverity.Sev2))
  ) {
    return ServiceStatus.Degraded;
  }

  return ServiceStatus.Operational;
}

export function canTransitionIncident(
  current: IncidentStatus,
  next: IncidentStatus
): boolean {
  if (current === next) {
    return true;
  }

  const allowed: Record<IncidentStatus, IncidentStatus[]> = {
    [IncidentStatus.Open]: [
      IncidentStatus.Acknowledged,
      IncidentStatus.Resolved
    ],
    [IncidentStatus.Acknowledged]: [
      IncidentStatus.Open,
      IncidentStatus.Resolved
    ],
    [IncidentStatus.Resolved]: [IncidentStatus.Open]
  };

  return allowed[current].includes(next);
}
