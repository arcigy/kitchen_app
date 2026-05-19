import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyStorage } from "../../../scripts/legacyStorageMigration";
import { getProjectMetaPath } from "./project-ownership";

describe("legacy storage migration", () => {
  let projectRoot = "";

  beforeEach(async () => {
    projectRoot = await createTempProjectRoot();
  });

  afterEach(async () => {
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  });

  it("defaults to dry-run and writes nothing", async () => {
    const sourceFile = await seedLegacyFile("outputs", "legacy.json");

    const report = await migrateLegacyStorage({
      projectRoot,
      clientId: "client_a",
      projectId: "project_a",
      phaseId: "phase_a",
      sourcePath: sourceFile
    });

    expect(report.dryRun).toBe(true);
    expect(report.deprecated).toBe(true);
    expect(report.filesCopied).toBe(0);
    expect(report.nextSteps.join(" ")).toContain("tenantStorageMigration.ts");
    await expect(access(getProjectMetaPath(projectRoot, "client_a", "project_a"))).rejects.toThrow();
    await expect(access(path.join(projectRoot, "storage"))).rejects.toThrow();
  });

  it("rejects write migration because the helper is read-only", async () => {
    const sourceFile = await seedLegacyFile("outputs", "legacy.json");

    await expect(
      migrateLegacyStorage({
        projectRoot,
        clientId: "client_a",
        projectId: "project_a",
        phaseId: "phase_a",
        sourcePath: sourceFile,
        dryRun: false
      })
    ).rejects.toThrow("deprecated and read-only");
  });

  it("rejects source path traversal outside allowed roots", async () => {
    await writeFile(path.join(projectRoot, "outside.json"), "{}", "utf-8");

    await expect(
      migrateLegacyStorage({
        projectRoot,
        clientId: "client_a",
        projectId: "project_a",
        phaseId: "phase_a",
        sourcePath: path.join("outputs", "..", "outside.json")
      })
    ).rejects.toThrow("outside allowed legacy roots");
  });

  it("rejects sources outside allowed legacy roots", async () => {
    const sourceDir = path.join(projectRoot, "tmp");
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(sourceDir, "legacy.json"), "{}", "utf-8");

    await expect(
      migrateLegacyStorage({
        projectRoot,
        clientId: "client_a",
        projectId: "project_a",
        phaseId: "phase_a",
        sourcePath: sourceDir
      })
    ).rejects.toThrow("outside allowed legacy roots");
  });

  it("rejects target namespace traversal through unsafe IDs", async () => {
    const sourceFile = await seedLegacyFile("outputs", "legacy.json");

    await expect(
      migrateLegacyStorage({
        projectRoot,
        clientId: "../client_a",
        projectId: "project_a",
        phaseId: "phase_a",
        sourcePath: sourceFile
      })
    ).rejects.toThrow("clientId contains unsupported characters.");
  });

  it("does not create project metadata, copy files, or write reports", async () => {
    const sourceFile = await seedLegacyFile("outputs", "legacy.json", "{\"ok\":true}");

    const report = await migrateLegacyStorage({
      projectRoot,
      clientId: "client_a",
      projectId: "project_a",
      phaseId: "phase_a",
      sourcePath: sourceFile
    });

    expect(report).toMatchObject({
      sourcePath: path.resolve(projectRoot, sourceFile),
      clientId: "client_a",
      projectId: "project_a",
      phaseId: "phase_a",
      filesCopied: 0,
      skippedFiles: [],
      errors: [],
      dryRun: true
    });
    expect(report.targetTenantPath).toContain(path.join("storage", "clients", "client_a", "projects", "project_a"));
    expect(report.timestamp).toEqual(expect.any(String));
    await expect(access(getProjectMetaPath(projectRoot, "client_a", "project_a"))).rejects.toThrow();
    await expect(access(path.join(projectRoot, "storage"))).rejects.toThrow();
  });

  it("does not expose any delete-capable API surface", async () => {
    const sourceFile = await seedLegacyFile(path.join("public", "debug-pdf"), "debug.json");

    const report = await migrateLegacyStorage({
      projectRoot,
      clientId: "client_a",
      projectId: "project_a",
      phaseId: "phase_a",
      sourcePath: sourceFile
    });

    expect("filesDeleted" in report).toBe(false);
    await expect(access(path.resolve(projectRoot, sourceFile))).resolves.toBeUndefined();
  });

  it("does not import migration helpers from production runtime entrypoints", async () => {
    const runtimeFiles = [
      path.join(process.cwd(), "src", "server", "workerServer.ts"),
      path.join(process.cwd(), "server", "workerServer.ts")
    ];
    for (const runtimeFile of runtimeFiles) {
      const source = await readFile(runtimeFile, "utf-8");
      expect(source).not.toContain("legacyStorageMigration");
    }
  });

  async function seedLegacyFile(root: string, fileName: string, content = "{}"): Promise<string> {
    const dir = path.join(projectRoot, root);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, fileName);
    await writeFile(filePath, content, "utf-8");
    return path.relative(projectRoot, filePath);
  }
});

async function createTempProjectRoot() {
  return path.join(await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "legacy-migration-"))), "");
}
