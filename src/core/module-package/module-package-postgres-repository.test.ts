import { computeModulePackageHash } from "./module-package-file";
import { systemModulePackageTemplates } from "../../system/module-packages";
import { ModulePackageRevisionConflictError } from "./module-package-write-lock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgresModulePackageRepository } from "./module-package-postgres-repository";
const query = vi.hoisted(() => vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] as unknown[], rowCount: 0 })));
vi.mock("../database/postgres-client", () => ({
  withSchemaClient: async (_url: string, _schema: string, read: (client: { query: typeof query }) => unknown) => read({ query })
}));
beforeEach(() => vi.clearAllMocks());
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


describe("atomic preset revision updates", () => {
  it("conditions the database write on both tenant and hash and rejects a stale writer", async () => {
    const repo = createPostgresModulePackageRepository({ connectionString: "test", schema: "test" });
    const ctx = { clientId: "company", userId: "owner", role: "owner" as const };
    const pkg = structuredClone(systemModulePackageTemplates[0]!);
    query.mockResolvedValueOnce({ rows: [{ package: pkg, source: "dev-json", package_hash: "original" }], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await repo.savePackage(ctx, pkg, { expectedPackageHash: computeModulePackageHash(pkg) });
    expect(query.mock.calls[1]?.[0]).toContain("client_id=$1 AND module_package_id=$2 AND package_hash=$8");
    expect(query.mock.calls[1]?.[1]?.[0]).toBe("company");
    expect(query.mock.calls[1]?.[1]?.[7]).toBe("original");
    await expect(repo.savePackage(ctx, pkg, { expectedPackageHash: computeModulePackageHash(pkg) })).rejects.toBeInstanceOf(ModulePackageRevisionConflictError);
  });
});
