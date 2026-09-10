import { describe, expect, it, vi } from "vitest";
import type { UserActivityTrackingConfig } from "../core/user-activity/user-activity-config";
import { createInMemoryUserActivityRepository } from "../core/user-activity/user-activity-repository";
import { handleUserActivityApi, parseUserActivityPulse } from "./userActivityEndpoint";

const context = { clientId: "client-1", userId: "user-1", role: "designer" } as const;
const enabledConfig: UserActivityTrackingConfig = {
  enabled: true,
  heartbeatIntervalMs: 30_000,
  idleThresholdMs: 300_000,
  offlineThresholdMs: 90_000,
  maxCreditableGapMs: 45_000,
  disclosure: "Activity disclosure"
};
const validPulse = {
  localDate: "2026-09-02",
  sequence: 1,
  state: "active",
  timeZone: "Europe/Bratislava",
  trackerId: "11111111-1111-4111-8111-111111111111"
};

function endpointDeps(body: unknown, config = enabledConfig) {
  const sent: { status?: number; data?: unknown } = {};
  return {
    sent,
    deps: {
      getContext: vi.fn(async () => context),
      readJsonBody: vi.fn(async () => body),
      sendJson: vi.fn((_res, status: number, data: unknown) => {
        sent.status = status;
        sent.data = data;
      }),
      repository: createInMemoryUserActivityRepository(),
      resolveConfig: () => config,
      now: () => new Date("2026-09-02T08:00:00Z")
    }
  };
}

describe("user activity endpoint", () => {
  it("returns authenticated tenant-specific configuration", async () => {
    const { deps, sent } = endpointDeps({});
    const handled = await handleUserActivityApi(
      { method: "GET", headers: {} } as never,
      {} as never,
      new URL("http://localhost/api/user-activity/config"),
      deps
    );
    expect(handled).toBe(true);
    expect(sent).toEqual({ status: 200, data: expect.objectContaining({ enabled: true, disclosure: "Activity disclosure" }) });
  });

  it("does not accept pulses when the tenant feature is disabled", async () => {
    const { deps, sent } = endpointDeps(validPulse, { ...enabledConfig, enabled: false });
    const recordPulse = vi.spyOn(deps.repository, "recordPulse");
    await handleUserActivityApi(
      { method: "POST", headers: {} } as never,
      {} as never,
      new URL("http://localhost/api/user-activity/pulse"),
      deps
    );
    expect(sent.status).toBe(404);
    expect(recordPulse).not.toHaveBeenCalled();
  });

  it("accepts only the minimal allowlisted pulse schema", async () => {
    expect(() => parseUserActivityPulse({ ...validPulse, keyText: "secret" })).toThrow();
    expect(() => parseUserActivityPulse({ ...validPulse, timeZone: "not/a-zone" })).toThrow();

    const { deps, sent } = endpointDeps(validPulse);
    await handleUserActivityApi(
      { method: "POST", headers: {} } as never,
      {} as never,
      new URL("http://localhost/api/user-activity/pulse"),
      deps
    );
    expect(sent.status).toBe(202);
    expect(sent.data).toEqual(expect.objectContaining({ ok: true, accepted: true, state: "active" }));
  });
});
