import {
  deriveServiceStatus,
  IncidentSeverity,
  type ServiceStatus
} from "@pulseops/shared";

export function calculateUptime(results: Array<{ ok: boolean }>): number {
  if (results.length === 0) {
    return 100;
  }

  const successful = results.filter((result) => result.ok).length;
  return Number(((successful / results.length) * 100).toFixed(2));
}

export function calculateAverageLatency(
  results: Array<{ latencyMs: number }>
): number {
  if (results.length === 0) {
    return 0;
  }

  const total = results.reduce((sum, result) => sum + result.latencyMs, 0);
  return Math.round(total / results.length);
}

export function deriveStatusFromHealth(input: {
  latestChecks: Array<{ ok: boolean }>;
  activeIncidents: Array<{ severity: string }>;
}): ServiceStatus {
  return deriveServiceStatus({
    failingChecks: input.latestChecks.filter((check) => !check.ok).length,
    activeIncidents: input.activeIncidents.map((incident) => ({
      severity: incident.severity as IncidentSeverity
    }))
  });
}
