import { describe, expect, it } from "vitest";
import type { AuthenticatedClientSession } from "../client/client-types";
import { createInMemoryAuthSessionStore } from "./auth-session-store";

function session(overrides: Partial<AuthenticatedClientSession> = {}): AuthenticatedClientSession {
  return {
    version: 1,
    userId: "user-1",
    clientId: "client-1",
    role: "owner",
    displayName: "Owner",
    issuedAt: "2026-07-15T10:00:00.000Z",
    expiresAt: "2026-07-15T12:00:00.000Z",
    ...overrides
  };
}

describe("in-memory auth session store", () => {
  it("issues an opaque server-side session and validates its binding", async () => {
    const store = createInMemoryAuthSessionStore();
    const issued = await store.issue(session());

    expect(issued.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(store.isActive(issued, new Date("2026-07-15T11:00:00.000Z"))).resolves.toBe(true);
    await expect(store.isActive({ ...issued, clientId: "other-client" }, new Date("2026-07-15T11:00:00.000Z"))).resolves.toBe(false);
  });

  it("rejects a revoked or expired server-side session", async () => {
    const store = createInMemoryAuthSessionStore();
    const issued = await store.issue(session());
    await store.revoke(issued, new Date("2026-07-15T10:30:00.000Z"));

    await expect(store.isActive(issued, new Date("2026-07-15T11:00:00.000Z"))).resolves.toBe(false);

    const expired = await store.issue(session());
    await expect(store.isActive(expired, new Date("2026-07-15T12:00:00.000Z"))).resolves.toBe(false);
  });

  it("keeps legacy signed cookies valid only through their existing cookie expiry", async () => {
    const store = createInMemoryAuthSessionStore();
    await expect(store.isActive(session(), new Date("2026-07-15T11:00:00.000Z"))).resolves.toBe(true);
  });
});
