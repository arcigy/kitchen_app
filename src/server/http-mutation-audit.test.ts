import { EventEmitter } from "node:events";
import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { serializeClientSessionCookie } from "../core/client/session-cookie";
import { registerMutationAudit } from "./http-mutation-audit";

function response(statusCode = 200): http.ServerResponse {
  return Object.assign(new EventEmitter(), { statusCode, writableEnded: true }) as unknown as http.ServerResponse;
}

function authenticatedRequest(method: string, rawUrl: string): http.IncomingMessage {
  const cookie = serializeClientSessionCookie({
    version: 1,
    userId: "private-user-id",
    clientId: "private-tenant-id",
    role: "owner",
    displayName: "Private User",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  return { method, url: rawUrl, headers: { cookie } } as http.IncomingMessage;
}

describe("HTTP mutation audit", () => {
  it("logs a privacy-safe mutation record without raw identifiers or query data", () => {
    const log = vi.fn();
    const req = authenticatedRequest("POST", "/api/projects/private-project-id/save?secret=hidden");
    const res = response(200);
    registerMutationAudit(req, res, new URL(`http://local${req.url}`), "request-1", {
      env: { AUTH_SESSION_SECRET: "audit-test-secret" },
      now: () => Date.parse("2026-07-15T10:00:00.000Z"),
      log
    });
    res.emit("finish");
    res.emit("close");

    expect(log).toHaveBeenCalledTimes(1);
    const serialized = log.mock.calls[0][0] as string;
    expect(serialized).not.toContain("private-project-id");
    expect(serialized).not.toContain("private-user-id");
    expect(serialized).not.toContain("private-tenant-id");
    expect(serialized).not.toContain("hidden");
    expect(JSON.parse(serialized)).toMatchObject({
      event: "mutation_audit",
      timestamp: "2026-07-15T10:00:00.000Z",
      requestId: "request-1",
      action: "project.save",
      source: "session",
      status: 200,
      outcome: "success",
      actorRole: "owner",
      resources: { projectRef: expect.stringMatching(/^project_[0-9a-f]{16}$/) }
    });
  });

  it("does not audit read-only requests", () => {
    const log = vi.fn();
    const res = response();
    registerMutationAudit(authenticatedRequest("GET", "/api/projects/private-project-id/load"), res,
      new URL("http://local/api/projects/private-project-id/load"), "request-read", { log });
    res.emit("finish");
    expect(log).not.toHaveBeenCalled();
  });

  it("records rejected token mutations without logging the bearer token", () => {
    const log = vi.fn();
    const req = {
      method: "POST",
      url: "/api/supplier-bridge/sessions/private-session/candidates",
      headers: { authorization: "Bearer private-token" }
    } as http.IncomingMessage;
    const res = response(403);
    registerMutationAudit(req, res, new URL(`http://local${req.url}`), "request-token", {
      env: { ARCIGY_AUDIT_HASH_SECRET: "audit-test-secret" },
      log
    });
    res.emit("finish");

    const serialized = log.mock.calls[0][0] as string;
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("private-session");
    expect(JSON.parse(serialized)).toMatchObject({
      action: "supplier.extension.mutate",
      source: "token",
      status: 403,
      outcome: "rejected"
    });
  });
});
