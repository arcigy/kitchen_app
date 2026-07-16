import { describe, expect, it } from "vitest";
import { summarizeSaasLoadTest, type SaasLoadSample } from "./saasLoadTestMetrics";

const samples: SaasLoadSample[] = [
  { name: "/api/auth/login", durationMs: 100, ok: true, status: 200, decodedResponseBytes: 100 },
  { name: "/api/catalog/bootstrap", durationMs: 1000, ok: true, status: 200, decodedResponseBytes: 10 * 1024 * 1024 },
  { name: "/api/modules", durationMs: 20, ok: true, status: 200, decodedResponseBytes: 1024 },
  { name: "/api/catalog/bootstrap", durationMs: 1200, ok: false, status: 503, decodedResponseBytes: 50 }
];

describe("SaaS load-test metrics", () => {
  it("keeps aggregate compatibility and adds exact response volume plus per-route latency", () => {
    const summary = summarizeSaasLoadTest({
      samples,
      target: "http://127.0.0.1:5180",
      scenario: "catalog",
      concurrency: 2,
      elapsedSeconds: 10,
      p95ThresholdMs: 2000,
      errorRateThreshold: 0.25
    });

    expect(summary).toMatchObject({
      ok: true,
      requests: 4,
      requestsPerSecond: 0.4,
      failures: 1,
      errorRate: 0.25,
      decodedResponseBytes: 10 * 1024 * 1024 + 1174,
      statusCounts: { "200": 3, "503": 1 }
    });
    expect(summary.byRoute.find((route) => route.name === "/api/catalog/bootstrap")).toMatchObject({
      requests: 2,
      failures: 1,
      decodedResponseBytes: 10 * 1024 * 1024 + 50,
      latencyMs: { p50: 1000, p95: 1200, p99: 1200, max: 1200 }
    });
  });

  it("fails threshold evaluation without hiding the measured route evidence", () => {
    const summary = summarizeSaasLoadTest({
      samples,
      target: "http://127.0.0.1:5180",
      scenario: "catalog",
      concurrency: 2,
      elapsedSeconds: 10,
      p95ThresholdMs: 500,
      errorRateThreshold: 0.1
    });
    expect(summary.ok).toBe(false);
    expect(summary.byRoute).toHaveLength(3);
  });

  it("treats an empty sample set as failure with finite zero-volume metrics", () => {
    const summary = summarizeSaasLoadTest({
      samples: [],
      target: "http://127.0.0.1:5180",
      scenario: "health",
      concurrency: 1,
      elapsedSeconds: 0,
      p95ThresholdMs: 500,
      errorRateThreshold: 0
    });
    expect(summary).toMatchObject({
      ok: false,
      requests: 0,
      failures: 0,
      errorRate: 1,
      decodedResponseBytes: 0,
      byRoute: []
    });
  });
});
