import { describe, expect, it, vi } from "vitest";
import { createPostgresModulePackageRepository } from "./module-package-postgres-repository";
const query = vi.hoisted(() => vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [], rowCount: 0 })));
vi.mock("../database/postgres-client", () => ({
  withSchemaClient: async (_url: string, _schema: string, read: (client: { query: typeof query }) => unknown) => read({ query })
}));
describe("empty tenant package store", () => {
  it("does not recreate deleted packages on listing or direct lookup", async () => {
    const repo = createPostgresModulePackageRepository({ connectionString: "test", schema: "test" });
    const ctx = { clientId: "empty", userId: "fixture", role: "owner" as const };
    expect(await repo.listPackages(ctx)).toEqual([]);
    expect(await repo.getPackage(ctx, "drawer_low_family_v1")).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql] of query.mock.calls) expect(sql).toMatch(/^SELECT /);
  });
});
