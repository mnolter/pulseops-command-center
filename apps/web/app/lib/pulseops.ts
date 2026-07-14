import {
  IncidentSeverity,
  IncidentStatus,
  ServiceStatus,
  severityRank,
  type IncidentContract
} from "@pulseops/shared";

export function statusLabel(status: ServiceStatus | string): string {
  return {
    [ServiceStatus.Operational]: "Operational",
    [ServiceStatus.Degraded]: "Degraded",
    [ServiceStatus.MajorOutage]: "Major outage",
    [ServiceStatus.Maintenance]: "Maintenance"
  }[status] ?? "Unknown";
}

export function severityLabel(severity: IncidentSeverity | string): string {
  return {
    [IncidentSeverity.Sev1]: "SEV1",
    [IncidentSeverity.Sev2]: "SEV2",
    [IncidentSeverity.Sev3]: "SEV3",
    [IncidentSeverity.Sev4]: "SEV4"
  }[severity] ?? severity.toUpperCase();
}

export function statusPriority(status: ServiceStatus | string): number {
  return {
    [ServiceStatus.MajorOutage]: 4,
    [ServiceStatus.Degraded]: 3,
    [ServiceStatus.Maintenance]: 2,
    [ServiceStatus.Operational]: 1
  }[status] ?? 0;
}

export function incidentPriority(incident: Pick<IncidentContract, "severity" | "status">) {
  const statusWeight = incident.status === IncidentStatus.Resolved ? 0 : 10;
  return statusWeight + severityRank(incident.severity);
}

export function relativeAge(value: string): string {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.round(hours / 24)}d ago`;
}

export function compactPercent(value: number): string {
  return `${value.toFixed(value >= 99 ? 2 : 1)}%`;
}
