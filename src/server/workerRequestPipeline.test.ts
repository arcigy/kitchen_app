import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryAuthSessionStore } from "../core/auth/auth-session-store";
import { createInMemoryUserRepository } from "../core/auth/user-repository";
import { createUserService } from "../core/auth/user-service";
import { createClientJourneyMetrics } from "./clientJourneyMetrics";
import { createHttpRequestBudget } from "./http-request-budget";
import { createHttpRequestMetrics } from "./http-request-metrics";
import { readJsonRequestBody } from "./request-json-body";
import { createWorkerRequestHandler } from "./workerRequestPipeline";
import { ProjectSaveRevisionConflictError } from "../core/project/project-write-consistency";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function createHarness(options: {
  readiness?: () => Promise<unknown>;
  application?: (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<void>;
  maxRequests?: number;
} = {}) {
  const userService = createUserService(createInMemoryUserRepository());
  const authSessionStore = createInMemoryAuthSessionStore();
  const application = vi.fn(options.application ?? (async (_req, res, url) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ path: url.pathname }));
  }));
  const logError = vi.fn();
  const sendJson = (res: http.ServerResponse, status: number, data: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };
  const sendText = (res: http.ServerResponse, status: number, value: string) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "text/plain");
    res.end(value);
  };
  const server = http.createServer(createWorkerRequestHandler({
    host: "127.0.0.1",
    port: 0,
    userService,
    authSessionStore,
    requestMetrics: createHttpRequestMetrics(),
    clientJourneyMetrics: createClientJourneyMetrics(),
    requestBudget: createHttpRequestBudget({
      policies: [{ operation: "test", method: "GET", pathname: /^\/limited$/, maxRequests: options.maxRequests ?? 1, windowMs: 60_000, maxConcurrent: 1 }]
    }),
    readJsonBody: readJsonRequestBody,
    sendJson,
    sendText,
    checkReadiness: options.readiness ?? (async () => ({ ok: true, storage: "file" })),
    getClientContext: async () => ({ clientId: "client-a", userId: "user-a", role: "owner" }),
    handleApplicationRequest: application,
    logError
  }));
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  return { application, logError, request: (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init) };
}

describe("shared worker request pipeline", () => {
  it("owns health, readiness, request IDs and protected metrics before application routing", async () => {
    const harness = await createHarness();
    const health = await harness.request("/health");
    expect(health.status).toBe(200);
    expect(health.headers.get("x-request-id")).toBeTruthy();
    expect(await health.json()).toEqual({ ok: true });

    const readiness = await harness.request("/ready");
    expect(readiness.status).toBe(200);
    expect(await readiness.json()).toEqual({ ok: true, storage: "file" });

    const metrics = await harness.request("/metrics");
    expect(metrics.status).toBe(200);
    expect(await metrics.text()).toContain("arcigy_http_requests_total");
    expect(harness.application).not.toHaveBeenCalled();
  });

  it("keeps origin and request-budget rejection ahead of application handlers", async () => {
    const harness = await createHarness();
    const forbidden = await harness.request("/limited", {
      method: "POST",
      headers: { Origin: "https://foreign.example", Cookie: "arcigy_client_session=opaque" }
    });
    expect(forbidden.status).toBe(403);

    expect((await harness.request("/limited")).status).toBe(200);
    const limited = await harness.request("/limited");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(harness.application).toHaveBeenCalledTimes(1);
  });

  it("keeps readiness and unexpected errors private and retryable", async () => {
    const readinessHarness = await createHarness({
      readiness: async () => { throw Object.assign(new Error("connect ECONNREFUSED secret-host"), { code: "ECONNREFUSED" }); }
    });
    const unavailable = await readinessHarness.request("/ready");
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("2");
    expect(await unavailable.json()).toEqual({ ok: false, error: "Database temporarily unavailable. Please retry." });

    const errorHarness = await createHarness({
      application: async () => { throw new Error("private customer detail"); }
    });
    const failed = await errorHarness.request("/explode?token=top-secret");
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({
      ok: false,
      error: "Internal server error.",
      requestId: expect.any(String)
    });
    const logged = String(errorHarness.logError.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain("GET /explode -> 500: Error");
    expect(logged).not.toContain("top-secret");
    expect(logged).not.toContain("private customer detail");
  });

  it("returns a generic bad-request message for malformed JSON", async () => {
    const harness = await createHarness();
    const response = await harness.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json"
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "Malformed JSON request body.",
      requestId: expect.any(String)
    });
    expect(String(harness.logError.mock.calls[0]?.[0] ?? "")).not.toContain("not-json");
  });

  it("returns structured 409 details through the shared error pipeline", async () => {
    const harness = await createHarness({
      application: async () => { throw new ProjectSaveRevisionConflictError(4, 5); }
    });

    const response = await harness.request("/api/projects/project_1/save", { method: "POST" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "PROJECT_SAVE_REVISION_CONFLICT",
      expectedRevision: 4,
      currentRevision: 5,
      requestId: expect.any(String)
    });
  });
});
