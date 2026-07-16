import { EventEmitter } from "node:events";
import type http from "node:http";
import { describe, expect, it } from "vitest";
import { serializeClientSessionCookie } from "../core/client/session-cookie";
import { createHttpRequestBudget, type HttpRequestBudgetPolicy } from "./http-request-budget";

const policy: HttpRequestBudgetPolicy = {
  operation: "test-expensive",
  method: "POST",
  pathname: /^\/api\/expensive$/,
  maxRequests: 2,
  windowMs: 10_000,
  maxConcurrent: 1
};

function request(clientId = "client_a"): http.IncomingMessage {
  const cookie = serializeClientSessionCookie({
    version: 1,
    userId: `user_${clientId}`,
    clientId,
    role: "owner",
    displayName: clientId,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  return { method: "POST", headers: { cookie }, socket: { remoteAddress: "127.0.0.1" } } as unknown as http.IncomingMessage;
}

function response(): http.ServerResponse {
  return new EventEmitter() as unknown as http.ServerResponse;
}

describe("HTTP request budget", () => {
  it.each(["/api/catalog", "/api/catalog/bootstrap"])("applies the default catalog budget to %s", (pathname) => {
    const budget = createHttpRequestBudget();
    const catalogRequest = request();
    catalogRequest.method = "GET";
    const decision = budget.acquire(catalogRequest, new URL(`http://local${pathname}`));
    expect(decision).toMatchObject({ allowed: true, operation: "catalog" });
  });

  it("does not budget unrelated application routes", () => {
    const budget = createHttpRequestBudget({ policies: [policy] });
    expect(budget.acquire(request(), new URL("http://local/api/projects")).allowed).toBe(true);
    expect(budget.size()).toBe(0);
  });

  it("limits concurrent work per tenant and releases exactly once", () => {
    const budget = createHttpRequestBudget({ policies: [policy] });
    const first = budget.acquire(request("client_a"), new URL("http://local/api/expensive"));
    expect(first.allowed).toBe(true);
    if (!first.allowed) throw new Error("Expected first request to be allowed.");
    const res = response();
    first.registerRelease(res);
    expect(budget.acquire(request("client_a"), new URL("http://local/api/expensive"))).toMatchObject({
      allowed: false,
      operation: "test-expensive",
      retryAfterSeconds: 1
    });
    expect(budget.acquire(request("client_b"), new URL("http://local/api/expensive")).allowed).toBe(true);
    res.emit("finish");
    res.emit("close");
    expect(budget.acquire(request("client_a"), new URL("http://local/api/expensive")).allowed).toBe(true);
  });

  it("returns the remaining window after the request-rate budget is exhausted", () => {
    let current = 1_000;
    const budget = createHttpRequestBudget({ policies: [{ ...policy, maxConcurrent: 3 }], now: () => current });
    for (let index = 0; index < 2; index += 1) {
      const decision = budget.acquire(request(), new URL("http://local/api/expensive"));
      expect(decision.allowed).toBe(true);
      if (decision.allowed) {
        const res = response();
        decision.registerRelease(res);
        res.emit("finish");
      }
    }
    current = 5_000;
    expect(budget.acquire(request(), new URL("http://local/api/expensive"))).toMatchObject({
      allowed: false,
      retryAfterSeconds: 6
    });
    current = 11_000;
    expect(budget.acquire(request(), new URL("http://local/api/expensive")).allowed).toBe(true);
  });

  it("keeps attacker-controlled scopes bounded", () => {
    const budget = createHttpRequestBudget({ policies: [policy], maxBuckets: 2 });
    expect(budget.acquire(request("client_a"), new URL("http://local/api/expensive")).allowed).toBe(true);
    expect(budget.acquire(request("client_b"), new URL("http://local/api/expensive")).allowed).toBe(true);
    expect(budget.acquire(request("client_c"), new URL("http://local/api/expensive")).allowed).toBe(false);
    expect(budget.size()).toBe(2);
  });
});
