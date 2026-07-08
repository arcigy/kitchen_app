import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { quoteSettingsStorageKey } from "../../ui/bomDevPanel";

const forbiddenImport = /from\s+["'][^"']*data\/(?:materials|hardware|pricing)(?:\/[^"']*)?["']/;
const runtimeRoots = ["src/modules", "src/layout", "src/ui", "src/app", "src/lib/materials"];
const sourceRoots = ["src", "scripts", "server"];
const allowedSystemSeedCatalogFiles = new Set([
  "scripts/testPortableMaterialLive.mjs",
  "scripts/testPricingContract.ts",
  "scripts/testModulePropertiesUi.mjs",
  "src/core/catalog/catalog-boundary.test.ts",
  "src/core/catalog/client-module-assignment.test.ts",
  "src/app/kitchenWorktopVisuals.test.ts",
  "src/core/catalog/catalog-repository.ts",
  "src/core/catalog/catalog-service.test.ts",
  "src/layout/kitchenMaterialSync.test.ts",
  "src/layout/placementManager.test.ts",
  "src/core/project-save/project-save.test.ts",
  "src/lib/materials/rendering.test.ts",
  "src/modules/fwmFurniture/fwmFurniture.test.ts",
  "src/modules/runtime/runtimeCatalog.test.ts"
]);

async function listRuntimeSourceFiles(root: string): Promise<string[]> {
  const absoluteRoot = path.join(process.cwd(), root);
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const next = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "package") continue;
      files.push(...await listRuntimeSourceFiles(next));
      continue;
    }
    if (/\.(ts|tsx|mjs)$/.test(entry.name)) files.push(next);
  }
  return files;
}

describe("ClientCatalog runtime boundaries", () => {
  it("keeps runtime files off global material, hardware, and pricing imports", async () => {
    const files = (await Promise.all(runtimeRoots.map((root) => listRuntimeSourceFiles(root)))).flat();

    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(process.cwd(), file), "utf-8");
      if (forbiddenImport.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  }, 30_000);

  it("keeps getSystemSeedCatalog inside seed, demo, and test boundaries", async () => {
    const files = (await Promise.all(sourceRoots.map((root) => listRuntimeSourceFiles(root)))).flat();
    const offenders: string[] = [];

    for (const file of files) {
      const source = await readFile(path.join(process.cwd(), file), "utf-8");
      if (!source.includes("getSystemSeedCatalog(")) continue;
      if (!allowedSystemSeedCatalogFiles.has(file.replaceAll("\\", "/"))) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  }, 30_000);

  it("keeps app composition off direct system seed repositories", async () => {
    const source = await readFile(path.join(process.cwd(), "src/app.ts"), "utf-8");

    expect(source).not.toContain("getSystemSeedCatalog(");
    expect(source).not.toContain("createSystemSeedClientCatalogRepository(");
  });

  it("scopes quote settings by client, project, and phase", () => {
    expect(quoteSettingsStorageKey({ clientId: "client_a" }, "project_a", "phase_1")).toBe(
      "bom.client_a.project_a.phase_1.projectQuoteSettings"
    );
    expect(quoteSettingsStorageKey({ clientId: "client_a" }, "project_a", "phase_1")).not.toBe(
      quoteSettingsStorageKey({ clientId: "client_b" }, "project_a", "phase_1")
    );
    expect(quoteSettingsStorageKey({ clientId: "client_a" }, "project_a", "phase_1")).not.toBe(
      quoteSettingsStorageKey({ clientId: "client_a" }, "project_a", "phase_2")
    );
  });
});
