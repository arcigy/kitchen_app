import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runTenantStorageMigration, type TrustedMigrationMappingItem } from "../../../scripts/tenantStorageMigration";
import { getProjectMetaPath } from "./project-ownership";
import { resolveBucketFilePath } from "./storage-path-resolver";
import { createClientProjectPhaseScope } from "./storage-types";

describe("trusted tenant storage migration", () => {
  let projectRoot = "";
  const previousAllow = process.env.ALLOW_TENANT_STORAGE_MIGRATION;

  beforeEach(async () => {
    projectRoot = await createTempProjectRoot();
    delete process.env.ALLOW_TENANT_STORAGE_MIGRATION;
  });

  afterEach(async () => {
    if (previousAllow === undefined) delete process.env.ALLOW_TENANT_STORAGE_MIGRATION;
    else process.env.ALLOW_TENANT_STORAGE_MIGRATION = previousAllow;
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  });

  it("dry-run writes nothing", async () => {
    await seedFile(path.join("outputs", "legacy.json"), "{}");
    const mappingPath = await writeMapping([migrateItem("outputs/legacy.json")]);

    const report = await runTenantStorageMigration({ projectRoot, mappingPath });

    expect(report.dryRun).toBe(true);
    expect(report.items[0].status).toBe("would_migrate");
    await expect(access(path.join(projectRoot, "storage"))).rejects.toThrow();
  });

  it("does not migrate without a trusted mapping file", async () => {
    await expect(runTenantStorageMigration({ projectRoot })).rejects.toThrow("Trusted mapping file is required.");
  });

  it("rejects write mode without env flag", async () => {
    await seedFile(path.join("outputs", "legacy.json"), "{}");
    const mappingPath = await writeMapping([migrateItem("outputs/legacy.json")]);

    await expect(runTenantStorageMigration({ projectRoot, mappingPath, dryRun: false })).rejects.toThrow(
      "ALLOW_TENANT_STORAGE_MIGRATION=true"
    );
  });

  it("reports unsafe source path as an error", async () => {
    await seedFile("outside.json", "{}");
    const mappingPath = await writeMapping([migrateItem(path.join("outputs", "..", "outside.json"))]);

    const report = await runTenantStorageMigration({ projectRoot, mappingPath });

    expect(report.errorsCount).toBe(1);
    expect(report.items[0]).toMatchObject({
      status: "error",
      errors: ["Source path is outside allowed legacy roots."]
    });
  });

  it("plans target paths through the storage resolver", async () => {
    await seedFile(path.join("outputs", "legacy.json"), "{}");
    const mappingPath = await writeMapping([migrateItem("outputs/legacy.json", { artifactType: "render" })]);
    const report = await runTenantStorageMigration({ projectRoot, mappingPath });
    const scope = createClientProjectPhaseScope(
      { userId: "test", clientId: "client_a", role: "admin" },
      { projectId: "project_a", phaseId: "phase_a" }
    );

    expect(report.items[0].targetPaths).toEqual([
      resolveBucketFilePath(projectRoot, scope, "renders", "legacy.json")
    ]);
  });

  it("reports conflict without overwrite", async () => {
    await seedFile(path.join("outputs", "legacy.json"), "{}");
    const target = await seedTargetFile("client_a", "project_a", "phase_a", "uploads", "legacy.json", "existing");
    const mappingPath = await writeMapping([migrateItem("outputs/legacy.json")]);
    process.env.ALLOW_TENANT_STORAGE_MIGRATION = "true";

    const report = await runTenantStorageMigration({ projectRoot, mappingPath, dryRun: false });

    expect(report.conflictsCount).toBe(1);
    expect(report.migratedCount).toBe(0);
    expect(report.items[0]).toMatchObject({ status: "conflict", conflicts: [target] });
    expect(await readFile(target, "utf-8")).toBe("existing");
  });

  it("does not delete delete_candidate sources", async () => {
    const source = await seedFile(path.join("public", "debug-pdf", "debug.json"), "{}");
    const mappingPath = await writeMapping([{
      ...migrateItem("public/debug-pdf/debug.json", { artifactType: "debug" }),
      action: "delete_candidate",
      reason: "Generated debug artifact"
    }]);
    process.env.ALLOW_TENANT_STORAGE_MIGRATION = "true";

    const report = await runTenantStorageMigration({ projectRoot, mappingPath, dryRun: false });

    expect(report.items[0].status).toBe("delete_candidate");
    await expect(access(source)).resolves.toBeUndefined();
    await expect(access(getProjectMetaPath(projectRoot, "client_a", "project_a"))).rejects.toThrow();
  });

  it("copies valid migrate items into tenant storage and creates metadata", async () => {
    await seedFile(path.join("outputs", "legacy.json"), "{\"ok\":true}");
    const mappingPath = await writeMapping([migrateItem("outputs/legacy.json", { artifactType: "export" })]);
    process.env.ALLOW_TENANT_STORAGE_MIGRATION = "true";

    const report = await runTenantStorageMigration({ projectRoot, mappingPath, dryRun: false });

    const target = report.items[0].targetPaths[0];
    expect(report).toMatchObject({ dryRun: false, migratedCount: 1, conflictsCount: 0, errorsCount: 0 });
    expect(target).toContain(path.join("storage", "clients", "client_a", "projects", "project_a", "phases", "phase_a", "exports"));
    expect(await readFile(target, "utf-8")).toBe("{\"ok\":true}");
    const meta = JSON.parse(await readFile(getProjectMetaPath(projectRoot, "client_a", "project_a"), "utf-8")) as {
      clientId?: string;
      projectId?: string;
      phases?: string[];
    };
    expect(meta).toMatchObject({ clientId: "client_a", projectId: "project_a", phases: ["phase_a"] });
    expect(report.reportPath).toEqual(expect.any(String));
    await expect(access(report.reportPath!)).resolves.toBeUndefined();
  });

  it("creates metadata only for explicit migrate actions", async () => {
    await seedFile(path.join("outputs", "legacy.json"), "{}");
    const mappingPath = await writeMapping([
      { ...migrateItem("outputs/legacy.json"), action: "skip", reason: "Not owned by this tenant" }
    ]);
    process.env.ALLOW_TENANT_STORAGE_MIGRATION = "true";

    const report = await runTenantStorageMigration({ projectRoot, mappingPath, dryRun: false });

    expect(report.skippedCount).toBe(1);
    await expect(access(getProjectMetaPath(projectRoot, "client_a", "project_a"))).rejects.toThrow();
  });

  async function writeMapping(items: TrustedMigrationMappingItem[]): Promise<string> {
    const mappingPath = path.join(projectRoot, "trusted-mapping.json");
    await writeFile(mappingPath, JSON.stringify({ items }, null, 2), "utf-8");
    return path.relative(projectRoot, mappingPath);
  }

  function migrateItem(sourcePath: string, overrides: Partial<TrustedMigrationMappingItem> = {}): TrustedMigrationMappingItem {
    return {
      sourcePath,
      targetClientId: "client_a",
      targetProjectId: "project_a",
      targetPhaseId: "phase_a",
      artifactType: "upload",
      action: "migrate",
      reason: "Trusted owner mapping",
      ...overrides
    };
  }

  async function seedFile(relativePath: string, content: string): Promise<string> {
    const target = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf-8");
    return target;
  }

  async function seedTargetFile(clientId: string, projectId: string, phaseId: string, bucket: "uploads", fileName: string, content: string): Promise<string> {
    const scope = createClientProjectPhaseScope({ userId: "test", clientId, role: "admin" }, { projectId, phaseId });
    const target = resolveBucketFilePath(projectRoot, scope, bucket, fileName);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf-8");
    expect((await stat(target)).isFile()).toBe(true);
    return target;
  }
});

async function createTempProjectRoot() {
  return path.join(await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "tenant-storage-migration-"))), "");
}
