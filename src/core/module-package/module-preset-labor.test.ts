import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolveClientModulePackagePath } from "../storage/storage-path-resolver";
import { unpackModulePackage } from "./module-file-codec";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileModulePackageRepository } from "./module-package-repository";
import { createSystemSeedClientCatalogRepository } from "../catalog/catalog-repository";
import { createModulePackageService } from "./module-package-service";
import { systemModulePackageTemplates } from "../../system/module-packages";
import { ModulePackageRevisionConflictError } from "./module-package-write-lock";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "preset-labor-")); roots.push(root);
  const ctx = { clientId: "company-a", userId: "owner", role: "owner" as const };
  const repository = createFileModulePackageRepository(root);
  const catalogRepository = createSystemSeedClientCatalogRepository();
  const pkg = await repository.savePackage(ctx, structuredClone(systemModulePackageTemplates.find(p => p.module.moduleType === "fwm_catalog_base_drawers")!));
  return { root, ctx, repository, pkg, catalogRepository, service: createModulePackageService({ context: ctx, packageRepository: repository, catalogRepository }) };
}
describe("company preset labor persistence", () => {
  it("saves labor with a new preset, edits only its rate and survives a fresh repository read", async () => {
    const { service, pkg, repository, ctx } = await fixture();
    const created = await service.createParameterPreset({ modulePackageId: pkg.module.modulePackageId, name: "Two drawers", note: "fixture", parameters: { drawerCount: 2 }, laborRate: { amount: 200, currency: "CZK" } });
    const updated = await service.updatePresetLabor({ modulePackageId: pkg.module.modulePackageId, presetId: created.preset.presetId, expectedPackageHash: created.modulePackage.integrity.packageHash!, laborRate: { amount: 250, currency: "CZK" } });
    expect(updated.preset.parameterValues).toEqual(created.preset.parameterValues);
    expect(updated.modulePackage.geometry).toEqual(created.modulePackage.geometry);
    const saved = await repository.getPackage(ctx, pkg.module.modulePackageId);
    expect(saved?.parameterPresets?.presets.find(p => p.presetId === created.preset.presetId)?.laborRate).toEqual({ amount: 250, currency: "CZK" });
    expect(await repository.getPackage({ ...ctx, clientId: "other-company" }, pkg.module.modulePackageId)).toBeNull();
    await expect(service.updatePresetLabor({ modulePackageId: pkg.module.modulePackageId, presetId: created.preset.presetId, expectedPackageHash: created.modulePackage.integrity.packageHash!, laborRate: null })).rejects.toBeInstanceOf(ModulePackageRevisionConflictError);
    const reset = await service.updatePresetLabor({ modulePackageId: pkg.module.modulePackageId, presetId: created.preset.presetId, expectedPackageHash: updated.modulePackage.integrity.packageHash!, laborRate: null });
    expect(reset.preset.laborRate).toBeNull();
  });
  it("rejects a concurrent writer atomically and allows an explicit zero rate", async () => {
    const { service, pkg } = await fixture();
    const created = await service.createParameterPreset({ modulePackageId: pkg.module.modulePackageId, name: "Labor", note: "fixture", parameters: {}, laborRate: { amount: 200, currency: "CZK" } });
    const requests = [0, 300].map(amount => service.updatePresetLabor({ modulePackageId: pkg.module.modulePackageId, presetId: created.preset.presetId, expectedPackageHash: created.modulePackage.integrity.packageHash!, laborRate: { amount, currency: "CZK" } }));
    const results = await Promise.allSettled(requests);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("lists packages while a writer holds its lock and retains bundled assets on a rate update", async () => {
    const f = await fixture();
    const dir = resolveClientModulePackagePath(f.root, f.ctx, f.pkg.module.modulePackageId);
    await writeFile(`${dir}.write-lock`, "");
    expect(await f.repository.listPackages(f.ctx)).toHaveLength(1);
    expect((await f.repository.getRevision(f.ctx)).count).toBe(1);
    await rm(`${dir}.write-lock`);
    const bytes = Buffer.from("{}");
    const assets = [{ assetId: "fixture", fileName: "fixture.json", encoding: "base64" as const, mimeType: "application/json", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), data: bytes.toString("base64") }];
    delete f.pkg.integrity.packageHash;
    f.pkg.assets.files = [{ assetId: "fixture", fileName: "fixture.json", mimeType: "application/json", sizeBytes: bytes.length, sha256: assets[0].sha256 }];
    await f.repository.savePackage(f.ctx, f.pkg, { payload: { payloadType: "furnquote-module-package", payloadVersion: 1, exportedAt: new Date().toISOString(), modulePackage: f.pkg, bundledAssets: assets } });
    await f.service.createParameterPreset({ modulePackageId: f.pkg.module.modulePackageId, name: "With assets", note: "fixture", parameters: {}, laborRate: { amount: 200, currency: "CZK" } });
    expect(unpackModulePackage(await readFile(path.join(dir, "module.fqm"), "utf-8")).bundledAssets).toEqual(assets);
  });
  it("refuses viewers and invalid rates before writing", async () => {
    const f = await fixture();
    const service = createModulePackageService({ context: { ...f.ctx, role: "viewer" }, packageRepository: f.repository, catalogRepository: f.catalogRepository });
    await expect(service.updatePresetLabor({ modulePackageId: f.pkg.module.modulePackageId, presetId: "missing", expectedPackageHash: f.pkg.integrity.packageHash!, laborRate: null })).rejects.toThrow(/Viewer/);
    await expect(f.service.createParameterPreset({ modulePackageId: f.pkg.module.modulePackageId, name: "Invalid", note: "fixture", parameters: {}, laborRate: { amount: -1, currency: "CZK" } })).rejects.toThrow();
  });
});
