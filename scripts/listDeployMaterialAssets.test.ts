import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PBR_MATERIAL_IDS, PBR_TEXTURE_FILES } from "../src/materials/pbrMaterialManifest";
import { listDeployMaterialAssets } from "./listDeployMaterialAssets";

describe("deploy material asset manifest", () => {
  it("includes every runtime PBR map without shipping unused source previews", async () => {
    const assets = await listDeployMaterialAssets(process.cwd());

    for (const materialId of PBR_MATERIAL_IDS) {
      for (const fileName of PBR_TEXTURE_FILES) {
        expect(assets).toContain(`public/materials/${materialId}/${fileName}`);
      }
    }
    expect(assets.some((asset) => asset.includes("Preview"))).toBe(false);
    expect(assets.some((asset) => asset.includes("/1K/"))).toBe(false);
  });

  it("wires the validated manifest into the deploy archive after exclusions", async () => {
    const [workflow, dockerIgnore] = await Promise.all([
      readFile(path.join(process.cwd(), ".github", "workflows", "deploy-caprover.yml"), "utf-8"),
      readFile(path.join(process.cwd(), ".dockerignore"), "utf-8")
    ]);
    const manifest = workflow.indexOf("scripts/listDeployMaterialAssets.ts > material-asset-files.txt");
    const exclusion = workflow.indexOf("--exclude=./public/materials");
    const append = workflow.indexOf("tar -rf kitchenapp.tar -T material-asset-files.txt");

    expect(manifest).toBeGreaterThan(-1);
    expect(exclusion).toBeGreaterThan(manifest);
    expect(append).toBeGreaterThan(exclusion);
    expect(workflow).not.toContain("material-basecolor-files.txt");
    expect(dockerIgnore).not.toMatch(/^\/?public\/materials\/?$/m);
  });
});
