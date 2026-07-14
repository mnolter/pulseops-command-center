import { describe, expect, it } from "vitest";
import {
  canTransitionIncident,
  deriveServiceStatus,
  IncidentSeverity,
  IncidentStatus
} from "./index";

describe("shared domain contracts", () => {
  it("derives major outage from a SEV1 incident", () => {
    expect(
      deriveServiceStatus({
        failingChecks: 0,
        activeIncidents: [{ severity: IncidentSeverity.Sev1 }]
      })
    ).toBe("major_outage");
  });

  it("derives degraded status from failing checks", () => {
    expect(
      deriveServiceStatus({
        failingChecks: 2,
        activeIncidents: []
      })
    ).toBe("degraded");
  });

  it("allows reopening a resolved incident but not acknowledging it directly", () => {
    expect(
      canTransitionIncident(IncidentStatus.Resolved, IncidentStatus.Open)
    ).toBe(true);
    expect(
      canTransitionIncident(IncidentStatus.Resolved, IncidentStatus.Acknowledged)
    ).toBe(false);
  });
});
