import { describe, expect, it } from "vitest";
import { assertProductionSnapshotTarget, orderTablesByForeignKey, snapshotProductionToDev } from "./productionSnapshotToDev";

function createSnapshotClient(options: { mismatch?: boolean } = {}) {
  const statements: string[] = [];
  const tables = ["arcigy_auth_sessions", "arcigy_organizations", "arcigy_projects", "schema_migrations"];
  const client = {
    async query(query: string) {
      statements.push(query);
      if (query.includes("information_schema.tables")) return { rows: tables.map((table_name) => ({ table_name })) };
      if (query.includes("information_schema.columns")) {
        return { rows: [{ source_column: "id", target_column: "id", source_type: "pg_catalog.uuid", target_type: "pg_catalog.uuid" }] };
      }
      if (query.includes("pg_constraint")) return { rows: [] };
      if (query.includes("INSERT INTO")) return { rows: [], rowCount: 1 };
      if (query.includes("SELECT count(*)::text AS count")) {
        return { rows: [{ count: "1", digest: options.mismatch && query.includes('FROM "dev"."arcigy_projects"') ? "different" : "same" }] };
      }
      return { rows: [], rowCount: null };
    }
  };
  return { client, statements };
}

describe("production snapshot safety", () => {
  it("permits only the deliberate production-to-develop direction", () => {
    expect(() => assertProductionSnapshotTarget("prod", "dev")).not.toThrow();
    expect(() => assertProductionSnapshotTarget("dev", "prod")).toThrow("prod -> dev");
    expect(() => assertProductionSnapshotTarget("prod", "staging")).toThrow("prod -> dev");
  });

  it("copies referenced tables before dependents and refuses cycles", () => {
    expect(orderTablesByForeignKey(["projects", "saves", "versions"], [
      { child_table: "saves", parent_table: "projects" },
      { child_table: "versions", parent_table: "projects" }
    ])).toEqual(["projects", "saves", "versions"]);
    expect(() => orderTablesByForeignKey(["a", "b"], [
      { child_table: "a", parent_table: "b" },
      { child_table: "b", parent_table: "a" }
    ])).toThrow("cyclic");
  });

  it("only truncates dev and verifies the exact copied data before committing", async () => {
    const { client, statements } = createSnapshotClient();
    const result = await snapshotProductionToDev(client as never);

    expect(result.copiedTables.map(({ table }) => table)).toEqual(["arcigy_organizations", "arcigy_projects"]);
    expect(result.skippedTables).toEqual(["arcigy_auth_sessions", "schema_migrations"]);
    expect(statements.some((statement) => statement.includes('TRUNCATE TABLE "dev".'))).toBe(true);
    expect(statements.some((statement) => statement.includes('INSERT INTO "dev"."arcigy_projects" SELECT * FROM "prod"."arcigy_projects"'))).toBe(true);
    expect(statements.some((statement) => /(?:TRUNCATE TABLE|INSERT INTO) "prod"\./.test(statement))).toBe(false);
    expect(statements).toContain("COMMIT");
  });

  it("rolls the dev replacement back when copied contents differ", async () => {
    const { client, statements } = createSnapshotClient({ mismatch: true });
    await expect(snapshotProductionToDev(client as never)).rejects.toThrow("verification mismatch");
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });
});
