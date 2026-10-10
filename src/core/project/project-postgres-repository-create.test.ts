import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ClientContext } from "../client/client-context";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(async (_sql: string, _values?: readonly unknown[]) => ({ rows: [] as Array<Record<string, unknown>> }))
}));

vi.mock("../database/postgres-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../database/postgres-client")>();
  const client = { query: queryMock } as unknown as PoolClient;
  return {
    ...actual,
    withSchemaClient: async <T>(
      _connectionString: string,
      _schema: string,
      operation: (db: PoolClient) => Promise<T>
    ): Promise<T> => operation(client)
  };
});

import { createPostgresProjectRepository } from "./project-postgres-repository";

describe("Postgres project creation", () => {
  it("stores canonical empty address and contact values when only the name is supplied", async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: [] });
    const repository = createPostgresProjectRepository({
      connectionString: "postgres://unit.test",
      projectRoot: "/tmp/arcigy-postgres-project-test"
    });
    const ctx: ClientContext = { userId: "user_test", clientId: "client_test", role: "owner" };

    const created = await repository.createProject(ctx, { name: "Minimal project", location: {}, contact: {} });

    expect(created.location.address).toBe("");
    expect(created.contact.name).toBe("");
    expect(queryMock).toHaveBeenCalledOnce();
    const values = queryMock.mock.calls[0]?.[1];
    if (!Array.isArray(values)) throw new Error("Postgres project insert did not provide query values.");
    const metadata: unknown = JSON.parse(String(values[2]));
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || !("location" in metadata) || !("contact" in metadata)) {
      throw new Error("Postgres metadata is not a project object.");
    }
    expect(metadata.location).toEqual({ address: "" });
    expect(metadata.contact).toEqual({ name: "" });
  });
});
