import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { ClientContext } from "../core/client/client-context";
import {
  createClientJourneyMetrics,
  handleClientJourneyMetricsApi,
  parseClientJourneyMetric,
  parseClientRuntimeMetric
} from "./clientJourneyMetrics";

const context: ClientContext = { clientId: "client-a", userId: "user-a", role: "designer" };

describe("client journey metrics", () => {
  it("accepts only bounded allowlisted low-cardinality payloads", () => {
    expect(parseClientJourneyMetric({
      journey: "project_open",
      variant: "loaded_session_cache",
      outcome: "success",
      durationMs: 4_250
    })).toEqual({ journey: "project_open", variant: "loaded_session_cache", outcome: "success", durationMs: 4_250 });
    expect(parseClientJourneyMetric({
      journey: "project_open",
      variant: "loaded",
      outcome: "success",
      durationMs: 4_250,
      projectId: "private-project"
    })).toBeNull();
    expect(parseClientJourneyMetric({ journey: "project_open", variant: "private-project", outcome: "success", durationMs: 1 })).toBeNull();
    expect(parseClientJourneyMetric({ journey: "app_data_load", variant: "network", outcome: "success", durationMs: Infinity })).toBeNull();
    expect(parseClientRuntimeMetric({ signal: "long_task", value: 125.5 })).toEqual({ signal: "long_task", value: 125.5 });
    expect(parseClientRuntimeMetric({ signal: "memory_used", value: 256 * 1024 * 1024 })).toEqual({
      signal: "memory_used",
      value: 256 * 1024 * 1024
    });
    expect(parseClientRuntimeMetric({ signal: "js_error", value: 1, kind: "image" })).toEqual({ signal: "js_error", value: 1, kind: "image" });
    expect(parseClientRuntimeMetric({ signal: "js_error", value: 1 })).toEqual({ signal: "js_error", value: 1, kind: "unknown" });
    expect(parseClientRuntimeMetric({ signal: "js_error", value: 1, url: "private" })).toBeNull();
    expect(parseClientRuntimeMetric({ signal: "js_error", value: 2 })).toBeNull();
    expect(parseClientRuntimeMetric({ signal: "private", value: 1 })).toBeNull();
    expect(parseClientRuntimeMetric({ signal: "memory_used", value: Infinity })).toBeNull();
  });

  it("renders bounded Prometheus counters and histograms without tenant data", () => {
    const metrics = createClientJourneyMetrics();
    metrics.record({ journey: "project_open", variant: "loaded", outcome: "success", durationMs: 4_250 });
    metrics.record({ journey: "project_open", variant: "loaded", outcome: "success", durationMs: 5_500 });
    metrics.recordRuntime({ signal: "js_error", value: 1, kind: "image" });
    metrics.recordRuntime({ signal: "unhandled_rejection", value: 1, kind: "runtime" });
    metrics.recordRuntime({ signal: "long_task", value: 125 });
    metrics.recordRuntime({ signal: "memory_used", value: 256 * 1024 * 1024 });
    const output = metrics.render();
    expect(output).toContain('arcigy_browser_journey_total{journey="project_open",variant="loaded",outcome="success"} 2');
    expect(output).toContain('arcigy_browser_journey_duration_seconds_bucket{journey="project_open",variant="loaded",outcome="success",le="5"} 1');
    expect(output).toContain('arcigy_browser_journey_duration_seconds_bucket{journey="project_open",variant="loaded",outcome="success",le="10"} 2');
    expect(output).toContain('arcigy_browser_runtime_errors_total{signal="js_error"} 1');
    expect(output).toContain('arcigy_browser_runtime_errors_total{signal="unhandled_rejection"} 1');
    expect(output).toContain('arcigy_browser_runtime_failure_categories_total{signal="js_error",kind="image"} 1');
    expect(output).toContain('arcigy_browser_runtime_failure_categories_total{signal="unhandled_rejection",kind="runtime"} 1');
    expect(output).toContain('arcigy_browser_long_task_duration_seconds_bucket{le="0.25"} 1');
    expect(output).toContain("arcigy_browser_long_task_duration_seconds_sum 0.125");
    expect(output).toContain('arcigy_browser_memory_used_bytes_bucket{le="268435456"} 1');
    expect(output).toContain("arcigy_browser_memory_used_bytes_sum 268435456");
    expect(output).not.toContain(context.clientId);
    expect(output).not.toContain(context.userId);
  });

  it("authenticates before recording and rejects invalid bodies", async () => {
    const metrics = createClientJourneyMetrics();
    const sent: Array<{ status: number; data: unknown }> = [];
    const getContext = vi.fn(async () => context);
    const deps = {
      getContext,
      readJsonBody: vi.fn<() => Promise<unknown>>(async () => ({ journey: "app_data_load", variant: "network", outcome: "success", durationMs: 125 })),
      sendJson: (_res: http.ServerResponse, status: number, data: unknown) => sent.push({ status, data }),
      metrics
    };
    const req = { method: "POST", headers: { cookie: "session=opaque" } } as http.IncomingMessage;
    const res = {} as http.ServerResponse;

    await expect(handleClientJourneyMetricsApi(req, res, new URL("http://localhost/api/client-metrics"), deps)).resolves.toBe(true);
    expect(getContext).toHaveBeenCalledWith("session=opaque");
    expect(sent.at(-1)).toEqual({ status: 202, data: { ok: true } });
    expect(metrics.render()).toContain('journey="app_data_load",variant="network",outcome="success"');

    deps.readJsonBody.mockResolvedValueOnce({ signal: "js_error", value: 1, kind: "image" });
    await handleClientJourneyMetricsApi(req, res, new URL("http://localhost/api/client-metrics"), deps);
    expect(sent.at(-1)).toEqual({ status: 202, data: { ok: true } });
    expect(metrics.render()).toContain('arcigy_browser_runtime_errors_total{signal="js_error"} 1');
    expect(metrics.render()).toContain('arcigy_browser_runtime_failure_categories_total{signal="js_error",kind="image"} 1');

    deps.readJsonBody.mockResolvedValueOnce({ tenantId: "client-b" });
    await handleClientJourneyMetricsApi(req, res, new URL("http://localhost/api/client-metrics"), deps);
    expect(sent.at(-1)).toEqual({ status: 400, data: { ok: false, error: "Invalid client browser metric." } });
  });
});
