import { describe, expect, it } from "vitest";
import {
  collectArcigyOdooMetrics,
  configFromEnv,
  parsePrometheusText,
  parseReadyPayload,
  validatePrometheusPayload
} from "./saasOdooMetricSync";

const firstScrape = `
# TYPE arcigy_http_requests_in_flight gauge
arcigy_http_requests_in_flight 2
arcigy_process_uptime_seconds 3600
arcigy_http_requests_total{method="GET",route="/api/projects",status="200"} 90
arcigy_http_requests_total{method="GET",route="/api/projects",status="500"} 10
arcigy_http_requests_total{method="GET",route="/health",status="200"} 1000
arcigy_http_request_duration_seconds_bucket{method="GET",route="/api/projects",status="200",le="0.5"} 80
arcigy_http_request_duration_seconds_bucket{method="GET",route="/api/projects",status="200",le="2"} 90
arcigy_http_request_duration_seconds_bucket{method="GET",route="/api/projects",status="200",le="+Inf"} 90
arcigy_http_request_duration_seconds_bucket{method="GET",route="/api/projects",status="500",le="0.5"} 0
arcigy_http_request_duration_seconds_bucket{method="GET",route="/api/projects",status="500",le="2"} 10
arcigy_http_request_duration_seconds_bucket{method="GET",route="/api/projects",status="500",le="+Inf"} 10
`;

const secondScrape = firstScrape
  .replace('status="200"} 90', 'status="200"} 180')
  .replace('status="500"} 10', 'status="500"} 20')
  .replaceAll('status="200",le="0.5"} 80', 'status="200",le="0.5"} 160')
  .replaceAll('status="200",le="2"} 90', 'status="200",le="2"} 180')
  .replaceAll('status="200",le="+Inf"} 90', 'status="200",le="+Inf"} 180')
  .replaceAll('status="500",le="2"} 10', 'status="500",le="2"} 20')
  .replaceAll('status="500",le="+Inf"} 10', 'status="500",le="+Inf"} 20');

const browserFirstScrape = `
arcigy_browser_journey_total{journey="project_open",variant="loaded",outcome="success"} 9
arcigy_browser_journey_total{journey="project_open",variant="loaded",outcome="failure"} 1
arcigy_browser_journey_duration_seconds_bucket{journey="project_open",variant="loaded",outcome="success",le="5"} 5
arcigy_browser_journey_duration_seconds_bucket{journey="project_open",variant="loaded",outcome="success",le="10"} 9
arcigy_browser_journey_duration_seconds_bucket{journey="project_open",variant="loaded",outcome="success",le="+Inf"} 9
arcigy_browser_journey_duration_seconds_bucket{journey="project_open",variant="loaded",outcome="failure",le="5"} 0
arcigy_browser_journey_duration_seconds_bucket{journey="project_open",variant="loaded",outcome="failure",le="10"} 1
arcigy_browser_journey_duration_seconds_bucket{journey="project_open",variant="loaded",outcome="failure",le="+Inf"} 1
arcigy_browser_runtime_errors_total{signal="js_error"} 1
arcigy_browser_long_task_duration_seconds_bucket{le="0.1"} 2
arcigy_browser_long_task_duration_seconds_bucket{le="0.5"} 5
arcigy_browser_long_task_duration_seconds_bucket{le="+Inf"} 5
arcigy_browser_memory_used_bytes_bucket{le="536870912"} 5
arcigy_browser_memory_used_bytes_bucket{le="+Inf"} 5
`;

const browserSecondScrape = browserFirstScrape
  .replace('outcome="success"} 9', 'outcome="success"} 18')
  .replace('outcome="failure"} 1', 'outcome="failure"} 2')
  .replace('outcome="success",le="5"} 5', 'outcome="success",le="5"} 10')
  .replace('outcome="success",le="10"} 9', 'outcome="success",le="10"} 18')
  .replace('outcome="success",le="+Inf"} 9', 'outcome="success",le="+Inf"} 18')
  .replace('outcome="failure",le="10"} 1', 'outcome="failure",le="10"} 2')
  .replace('outcome="failure",le="+Inf"} 1', 'outcome="failure",le="+Inf"} 2')
  .replace('signal="js_error"} 1', 'signal="js_error"} 3')
  .replace('le="0.1"} 2', 'le="0.1"} 4')
  .replace('le="0.5"} 5', 'le="0.5"} 10')
  .replace('arcigy_browser_long_task_duration_seconds_bucket{le="+Inf"} 5', 'arcigy_browser_long_task_duration_seconds_bucket{le="+Inf"} 10')
  .replace('arcigy_browser_memory_used_bytes_bucket{le="536870912"} 5', 'arcigy_browser_memory_used_bytes_bucket{le="536870912"} 10')
  .replace('arcigy_browser_memory_used_bytes_bucket{le="+Inf"} 5', 'arcigy_browser_memory_used_bytes_bucket{le="+Inf"} 10');

describe("SaaS Odoo metric sync", () => {
  it("parses bounded Prometheus samples without comments", () => {
    const samples = parsePrometheusText(firstScrape);
    expect(samples.some((sample) => sample.name === "arcigy_http_requests_total" && sample.labels.route === "/api/projects")).toBe(true);
    expect(samples.some((sample) => sample.labels.route === "/health")).toBe(true);
  });

  it("preserves escaped label values without ambiguous backslash parsing", () => {
    const samples = parsePrometheusText('arcigy_http_requests_total{route="A=\\!\\\\\\\"",status="200"} 1');
    expect(samples).toHaveLength(1);
    expect(samples[0]?.labels.route).toBe('A=\\!\\"');
  });

  it("rejects HTML fallbacks and empty or unrelated metrics payloads", () => {
    expect(() => validatePrometheusPayload("<!doctype html><html></html>", "text/html; charset=utf-8"))
      .toThrow(/HTML instead of Prometheus/);
    expect(() => validatePrometheusPayload("# no samples\n", "text/plain"))
      .toThrow(/recognized Arcigy telemetry/);
    expect(() => validatePrometheusPayload("unrelated_metric 1\n", "text/plain"))
      .toThrow(/recognized Arcigy telemetry/);
    expect(validatePrometheusPayload(firstScrape, "text/plain").length).toBeGreaterThan(0);
  });

  it("excludes probes and keeps numerator plus denominator", () => {
    const collected = collectArcigyOdooMetrics({
      metricsText: firstScrape,
      measuredAt: "2026-07-16T10:00:00.000Z",
      ready: true,
      readiness: parseReadyPayload('{"ok":true,"storage":"postgres","latencyMs":42}')
    });
    const requestCount = collected.metrics.find((metric) => metric.code === "http_request_count");
    const success = collected.metrics.find((metric) => metric.code === "http_request_success_rate");
    expect(requestCount?.value).toBe(100);
    expect(success).toMatchObject({ value: 90, numerator: 90, denominator: 100, status: "critical" });
    expect(collected.metrics.some((metric) => metric.code === "http_requests_per_second")).toBe(false);
    expect(collected.metrics.find((metric) => metric.code === "worker_uptime_seconds")?.value).toBe(3600);
    expect(collected.metrics.find((metric) => metric.code === "db_readiness_latency_seconds")?.value).toBe(0.042);
  });

  it("calculates rates and window histogram quantiles from the previous scrape", () => {
    const first = collectArcigyOdooMetrics({
      metricsText: firstScrape,
      measuredAt: "2026-07-16T10:00:00.000Z",
      ready: true
    });
    const second = collectArcigyOdooMetrics({
      metricsText: secondScrape,
      measuredAt: "2026-07-16T10:05:00.000Z",
      ready: true,
      previous: first.state
    });
    expect(second.metrics.find((metric) => metric.code === "http_requests_per_second")?.value).toBeCloseTo(1 / 3);
    expect(second.metrics.find((metric) => metric.code === "http_latency_p95_seconds")?.value).toBe(2);
  });

  it("exports privacy-safe browser journey deltas and percentiles", () => {
    const first = collectArcigyOdooMetrics({
      metricsText: browserFirstScrape,
      measuredAt: "2026-07-16T10:00:00.000Z",
      ready: true
    });
    const second = collectArcigyOdooMetrics({
      metricsText: browserSecondScrape,
      measuredAt: "2026-07-16T10:05:00.000Z",
      ready: true,
      previous: first.state
    });
    expect(second.metrics.find((metric) => metric.code === "project_open_success_rate")).toMatchObject({
      value: 90,
      numerator: 9,
      denominator: 10
    });
    expect(second.metrics.find((metric) => metric.code === "project_open_p95_seconds")?.value).toBe(10);
    expect(second.metrics.find((metric) => metric.code === "browser_runtime_error_count")?.value).toBe(2);
    expect(second.metrics.find((metric) => metric.code === "browser_long_task_p95_seconds")?.value).toBe(0.5);
    expect(second.metrics.find((metric) => metric.code === "browser_memory_p95_bytes")?.value).toBe(536870912);
  });

  it("requires both Develop and Main URLs and HTTPS outside loopback", () => {
    expect(() => configFromEnv({
      ARCIGY_DEVELOP_URL: "https://develop.example.com",
      ARCIGY_MAIN_URL: "http://main.example.com",
      ARCIGY_ODOO_URL: "https://odoo.example.com",
      ARCIGY_ODOO_API_KEY: "secret",
      ARCIGY_SAAS_SYNC_STATE_FILE: "C:/state.json"
    })).toThrow(/ARCIGY_MAIN_URL must use HTTPS/);

    const config = configFromEnv({
      ARCIGY_DEVELOP_URL: "https://develop.example.com",
      ARCIGY_MAIN_URL: "https://main.example.com",
      ARCIGY_ODOO_URL: "https://odoo.example.com",
      ARCIGY_ODOO_API_KEY: "secret",
      ARCIGY_SAAS_SYNC_STATE_FILE: "C:/state.json"
    });
    expect(config.environments.map((environment) => environment.environment)).toEqual(["develop", "main"]);
  });

  it("rejects malformed or unbounded readiness payloads", () => {
    expect(parseReadyPayload('{"ok":true,"storage":"postgres","latencyMs":12}')).toEqual({
      ok: true,
      storage: "postgres",
      latencyMs: 12
    });
    expect(() => parseReadyPayload('{"ok":true,"storage":"postgres","latencyMs":999999}')).toThrow(/latencyMs/);
    expect(() => parseReadyPayload("not-json")).toThrow(/invalid JSON/);
  });
});
