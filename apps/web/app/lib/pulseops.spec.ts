import { describe, expect, it } from "vitest";
import { IncidentSeverity, IncidentStatus, ServiceStatus } from "@pulseops/shared";
import {
  compactPercent,
  incidentPriority,
  severityLabel,
  statusLabel,
  statusPriority
} from "./pulseops";

describe("pulseops UI helpers", () => {
  it("formats service status labels", () => {
    expect(statusLabel(ServiceStatus.MajorOutage)).toBe("Major outage");
  });

  it("sorts unhealthy services first", () => {
    expect(statusPriority(ServiceStatus.MajorOutage)).toBeGreaterThan(
      statusPriority(ServiceStatus.Operational)
    );
  });

  it("prioritizes open severe incidents", () => {
    expect(
      incidentPriority({
        severity: IncidentSeverity.Sev1,
        status: IncidentStatus.Open
      })
    ).toBeGreaterThan(
      incidentPriority({
        severity: IncidentSeverity.Sev2,
        status: IncidentStatus.Resolved
      })
    );
  });

  it("formats compact labels", () => {
    expect(severityLabel(IncidentSeverity.Sev2)).toBe("SEV2");
    expect(compactPercent(99.982)).toBe("99.98%");
  });
});
