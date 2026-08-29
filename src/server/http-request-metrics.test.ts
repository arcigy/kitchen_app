import { EventEmitter } from "node:events";
import type http from "node:http";
import { describe, expect, it } from "vitest";
import { canReadHttpMetrics, createHttpRequestMetrics, normalizeHttpMetricRoute } from "./http-request-metrics";

function response(statusCode = 200): http.ServerResponse {
  return Object.assign(new EventEmitter(), { statusCode }) as unknown as http.ServerResponse;
}

describe("HTTP request metrics", () => {
  it("normalizes identifiers and removes query data", () => {
    expect(normalizeHttpMetricRoute("/api/projects/customer-secret/versions/27/load?token=hidden"))
      .toBe("/api/projects/:projectId/versions/:version/load");
    expect(normalizeHttpMetricRoute("/api/supplier-bridge/sessions/session-secret/candidates"))
      .toBe("/api/supplier-bridge/sessions/:sessionId/candidates");
    expect(normalizeHttpMetricRoute("/storage/clients/client-a/projects/project-a/file.png"))
      .toBe("/storage/*");
    expect(normalizeHttpMetricRoute("/assets/app-build-hash.js")).toBe("/assets/*");
    expect(normalizeHttpMetricRoute("/customer-specific-spa-route")).toBe("/other");
  });

  it("records bounded labels, duration buckets, and in-flight requests", () => {
    const times = [0, 100, 350, 400];
    const metrics = createHttpRequestMetrics({ now: () => times.shift() ?? 400 });
    const first = response(200);
    metrics.register({ method: "GET", url: "/api/projects/private-id?secret=x" } as http.IncomingMessage, first);
    expect(metrics.render()).toContain("arcigy_http_requests_in_flight 1");
    first.emit("finish");
    const output = metrics.render();
    expect(output).toContain('arcigy_http_requests_total{method="GET",route="/api/projects/:projectId",status="200"} 1');
    expect(output).toContain('arcigy_http_request_duration_seconds_bucket{method="GET",route="/api/projects/:projectId",status="200",le="0.5"} 1');
    expect(output).not.toContain("private-id");
    expect(output).not.toContain("secret");
    expect(output).toContain("arcigy_http_requests_in_flight 0");
  });

  it("records a response once when both finish and close fire", () => {
    const metrics = createHttpRequestMetrics({ now: () => 0 });
    const res = response(503);
    metrics.register({ method: "GET", url: "/ready" } as http.IncomingMessage, res);
    res.emit("finish");
    res.emit("close");
    expect(metrics.render()).toContain('arcigy_http_requests_total{method="GET",route="/ready",status="503"} 1');
  });

  it("hides production metrics without a token and validates bearer tokens", () => {
    const noAuth = { headers: {} } as http.IncomingMessage;
    expect(canReadHttpMetrics(noAuth, {})).toBe(true);
    expect(canReadHttpMetrics(noAuth, { NODE_ENV: "production" })).toBe(false);
    expect(canReadHttpMetrics(noAuth, { NODE_ENV: "production", ARCIGY_METRICS_TOKEN: "secret" })).toBe(false);
    expect(canReadHttpMetrics({ headers: { authorization: "Bearer secret" } } as http.IncomingMessage, {
      NODE_ENV: "production",
      ARCIGY_METRICS_TOKEN: "secret"
    })).toBe(true);
  });
});
