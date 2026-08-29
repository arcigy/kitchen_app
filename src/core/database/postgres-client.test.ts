import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUIRED_DATABASE_MIGRATION_VERSIONS } from "./migration-version";

const postgresMock = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn()
}));

vi.mock("pg", () => ({
  Pool: class {
    connect = postgresMock.connect;
    end = postgresMock.end;
    on = postgresMock.on;
  }
}));

import { closeSchemaPools, withSchemaClient } from "./postgres-client";

type ClientFixture = {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

function createClient(appliedVersions: readonly string[]): ClientFixture {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("schema_migrations")) {
        return { rows: appliedVersions.map((version) => ({ version })) };
      }
      return { rows: [{ value: 1 }] };
    }),
    release: vi.fn()
  };
}

describe("PostgreSQL schema readiness", () => {
  beforeEach(() => {
    postgresMock.connect.mockReset();
    postgresMock.end.mockReset();
    postgresMock.on.mockReset();
  });

  afterEach(async () => {
    await closeSchemaPools();
  });

  it("allows work only after every repository migration is present", async () => {
    const client = createClient(REQUIRED_DATABASE_MIGRATION_VERSIONS);
    postgresMock.connect.mockResolvedValue(client);
    const work = vi.fn(async () => "ready");

    await expect(withSchemaClient("postgresql://database.example/arcigy", "dev", work)).resolves.toBe("ready");

    expect(work).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenNthCalledWith(1, 'SET search_path TO "dev", public');
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      "SELECT version FROM schema_migrations WHERE version = ANY($1::text[])",
      [REQUIRED_DATABASE_MIGRATION_VERSIONS]
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("fails closed when any earlier migration is missing", async () => {
    const client = createClient(REQUIRED_DATABASE_MIGRATION_VERSIONS.filter((version) => version !== "0002_supplier_bridge"));
    postgresMock.connect.mockResolvedValue(client);
    const work = vi.fn(async () => "must-not-run");

    await expect(withSchemaClient("postgresql://database.example/arcigy", "dev", work))
      .rejects.toThrow('Database schema "dev" is missing migration 0002_supplier_bridge');

    expect(work).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });
});
