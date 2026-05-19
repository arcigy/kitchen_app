import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTenantStorageInventory } from "../../../scripts/tenantStorageInventory";
import { getProjectMetaPath, writeProjectOwnershipMetadata } from "./project-ownership";

describe("tenant storage inventory", () => {
  let projectRoot = "";

  beforeEach(async () => {
    projectRoot = await createTempProjectRoot();
  });

  afterEach(async () => {
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  });

  it("does not write inventory artifacts", async () => {
    await seedTenantFile("client_a", "project_a", "phase_a", "renders", "render.json");
    const before = await listRelativeFiles(projectRoot);

    await createTenantStorageInventory({ projectRoot });

    expect(await listRelativeFiles(projectRoot)).toEqual(before);
  });

  it("reports valid tenant project metadata as keep", async () => {
    await seedTenantFile("client_a", "project_a", "phase_a", "renders", "render.json");
    await writeProjectOwnershipMetadata(projectRoot, "client_a", "project_a", {
      version: 1,
      clientId: "client_a",
      projectId: "project_a",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      phases: ["phase_a"]
    });

    const report = await createTenantStorageInventory({ projectRoot });
    const entry = report.entries.find((item) => item.detectedProjectId === "project_a");

    expect(entry).toMatchObject({
      category: "valid_tenant_projects_with_metadata",
      detectedClientId: "client_a",
      detectedProjectId: "project_a",
      detectedPhaseId: "phase_a",
      metadataStatus: "valid",
      recommendedAction: "keep"
    });
    expect(entry?.fileCount).toBeGreaterThanOrEqual(2);
    expect(entry?.totalSize).toBeGreaterThan(0);
    expect(entry?.lastModified).toEqual(expect.any(String));
  });

  it("reports tenant project missing metadata as manual review", async () => {
    await seedTenantFile("client_a", "project_missing", "phase_a", "renders", "render.json");

    const report = await createTenantStorageInventory({ projectRoot });
    const entry = report.entries.find((item) => item.detectedProjectId === "project_missing");

    expect(entry).toMatchObject({
      category: "tenant_projects_missing_metadata",
      detectedClientId: "client_a",
      detectedProjectId: "project_missing",
      detectedPhaseId: "phase_a",
      metadataStatus: "missing",
      recommendedAction: "manual_review"
    });
  });

  it("classifies global outputs, exports, and debug artifacts conservatively", async () => {
    await seedFile(path.join("outputs", "old-render.png"), "png");
    await seedFile(path.join("exports", "old-export.json"), "{}");
    await seedFile(path.join("public", "debug-pdf", "generated-debug.dxf"), "debug");

    const report = await createTenantStorageInventory({ projectRoot });
    const outputs = report.entries.find((item) => item.path.endsWith("outputs"));
    const exportsRoot = report.entries.find((item) => item.path.endsWith("exports"));
    const debugPdf = report.entries.find((item) => item.path.endsWith(path.join("public", "debug-pdf")));

    expect(outputs).toMatchObject({
      category: "legacy_candidates_for_migration",
      recommendedAction: "manual_review",
      metadataStatus: "not_applicable"
    });
    expect(exportsRoot).toMatchObject({
      category: "legacy_candidates_for_migration",
      recommendedAction: "manual_review"
    });
    expect(debugPdf).toMatchObject({
      category: "debug_only_artifacts",
      recommendedAction: "delete_candidate"
    });
  });

  it("reports unknown tenant structure as manual review", async () => {
    await seedFile(path.join("storage", "clients", "client_a", "loose.json"), "{}");

    const report = await createTenantStorageInventory({ projectRoot });
    const entry = report.entries.find((item) => item.detectedClientId === "client_a");

    expect(entry).toMatchObject({
      category: "orphan_unknown_artifacts",
      metadataStatus: "not_applicable",
      recommendedAction: "manual_review"
    });
  });

  it("reports unsafe tenant paths as unsafe skip", async () => {
    await seedFile(path.join("storage", "clients", "bad.client", "projects", "project_a", "x.json"), "{}");

    const report = await createTenantStorageInventory({ projectRoot });
    const entry = report.entries.find((item) => item.path.includes("bad.client"));

    expect(entry).toMatchObject({
      category: "unsafe_skipped_paths",
      recommendedAction: "unsafe_skip"
    });
  });

  it("rejects inventory legacy roots that escape the project root", async () => {
    await expect(createTenantStorageInventory({ projectRoot, legacyRoots: ["../outside"] })).rejects.toThrow(
      "Inventory root escapes the project root."
    );
  });

  async function seedTenantFile(clientId: string, projectId: string, phaseId: string, bucket: string, fileName: string): Promise<void> {
    await seedFile(path.join("storage", "clients", clientId, "projects", projectId, "phases", phaseId, bucket, fileName), "{}");
  }

  async function seedFile(relativePath: string, content: string): Promise<void> {
    const target = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf-8");
  }
});

async function listRelativeFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    try {
      const entries = await import("node:fs/promises").then(({ readdir }) => readdir(dir, { withFileTypes: true }));
      for (const entry of entries) {
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(target);
        else if (entry.isFile()) out.push(path.relative(root, target).replaceAll("\\", "/"));
      }
    } catch {
      // absent directories count as empty
    }
  }
  await walk(root);
  return out.sort();
}

async function createTempProjectRoot() {
  const root = path.join(await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "tenant-inventory-"))), "");
  await access(root);
  return root;
}
