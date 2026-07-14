import { describe, expect, it } from "vitest";
import { IncidentStatus } from "@pulseops/shared";
import { canTransitionIncident } from "@pulseops/shared";
import {
  calculateAverageLatency,
  calculateUptime,
  deriveStatusFromHealth
} from "./monitoring";

describe("monitoring domain", () => {
  it("calculates uptime from check history", () => {
    expect(
      calculateUptime([{ ok: true }, { ok: true }, { ok: false }, { ok: true }])
    ).toBe(75);
  });

  it("calculates average latency", () => {
    expect(
      calculateAverageLatency([
        { latencyMs: 120 },
        { latencyMs: 180 },
        { latencyMs: 300 }
      ])
    ).toBe(200);
  });

  it("derives degraded status from a failing latest check", () => {
    expect(
      deriveStatusFromHealth({
        latestChecks: [{ ok: true }, { ok: false }],
        activeIncidents: []
      })
    ).toBe("degraded");
  });

  it("guards invalid incident transitions", () => {
    expect(
      canTransitionIncident(IncidentStatus.Open, IncidentStatus.Acknowledged)
    ).toBe(true);
    expect(
      canTransitionIncident(IncidentStatus.Resolved, IncidentStatus.Acknowledged)
    ).toBe(false);
  });
});
