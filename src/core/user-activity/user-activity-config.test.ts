import { describe, expect, it } from "vitest";
import { resolveUserActivityTrackingConfig } from "./user-activity-config";

describe("user activity tracking config", () => {
  it("is off unless both the global switch and exact tenant allowlist enable it", () => {
    expect(resolveUserActivityTrackingConfig("client-1", {}).enabled).toBe(false);
    expect(resolveUserActivityTrackingConfig("client-1", {
      ARCIGY_USER_ACTIVITY_TRACKING_ENABLED: "true",
      ARCIGY_USER_ACTIVITY_TRACKING_CLIENTS: "client-2"
    }).enabled).toBe(false);
    expect(resolveUserActivityTrackingConfig("client-1", {
      ARCIGY_USER_ACTIVITY_TRACKING_ENABLED: "true",
      ARCIGY_USER_ACTIVITY_TRACKING_CLIENTS: "client-1,client-2"
    }).enabled).toBe(true);
  });

  it("keeps accounting bounds internally consistent", () => {
    const config = resolveUserActivityTrackingConfig("client-1", {
      ARCIGY_USER_ACTIVITY_HEARTBEAT_MS: "60000",
      ARCIGY_USER_ACTIVITY_OFFLINE_MS: "120000"
    });
    expect(config.maxCreditableGapMs).toBeGreaterThanOrEqual(config.heartbeatIntervalMs);
    expect(config.maxCreditableGapMs).toBeLessThanOrEqual(config.offlineThresholdMs);
    expect(config.offlineThresholdMs).toBeGreaterThanOrEqual(config.heartbeatIntervalMs * 2);
  });
});
