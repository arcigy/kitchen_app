import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedClientSession } from "../client/client-types";
import { createPostgresAuthSessionStore } from "./auth-session-postgres-store";
import { createInMemoryAuthSessionStore } from "./auth-session-store";

const query = vi.hoisted(() => vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [{ active: true }] as unknown[], rowCount: 1 })));
vi.mock("../database/postgres-client", () => ({
  withSchemaClient: async (_url: string, _schema: string, read: (client: { query: typeof query }) => unknown) => read({ query })
}));
beforeEach(() => vi.clearAllMocks());

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

  it("rejects a signed session without a server-side session id", async () => {
    const store = createInMemoryAuthSessionStore();
    await store.issue(session());

    await expect(store.isActive(session(), new Date("2026-07-15T11:00:00.000Z"))).resolves.toBe(false);
  });

  it("rejects a session id that was never issued", async () => {
    const store = createInMemoryAuthSessionStore();

    await expect(store.isActive(
      session({ sessionId: "00000000-0000-4000-8000-000000000000" }),
      new Date("2026-07-15T11:00:00.000Z")
    )).resolves.toBe(false);
  });
});

describe("postgres auth session store", () => {
  const store = createPostgresAuthSessionStore({ connectionString: "test", schema: "test" });

  it("rejects a signed session without a server-side session id before querying", async () => {
    await expect(store.isActive(session(), new Date("2026-07-15T11:00:00.000Z"))).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("requires a matching unrevoked unexpired row for a session id", async () => {
    const candidate = session({ sessionId: "00000000-0000-4000-8000-000000000000" });
    await expect(store.isActive(candidate, new Date("2026-07-15T11:00:00.000Z"))).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("revoked_at IS NULL");
    expect(sql).toContain("expires_at > $5");
    expect(values?.slice(2)).toEqual(["user-1", "client-1", "2026-07-15T11:00:00.000Z"]);

    query.mockResolvedValueOnce({ rows: [{ active: false }], rowCount: 1 });
    await expect(store.isActive(candidate, new Date("2026-07-15T11:00:00.000Z"))).resolves.toBe(false);
  });
});
