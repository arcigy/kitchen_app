import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { systemModulePackageTemplates } from "../../system/module-packages";
import { createSystemSeedClientCatalogRepository } from "../catalog/catalog-repository";
import { createFileModulePackageRepository } from "./module-package-repository";
import { createModulePackageService } from "./module-package-service";
import { computeModulePackageHash } from "./module-package-file";
import { packModulePackage } from "./module-file-codec";
import { ModulePackageRevisionConflictError } from "./module-package-write-lock";
import { resolveClientModulePackagePath } from "../storage/storage-path-resolver";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "preset-durable-")); roots.push(root);
  const context = { clientId: "synthetic_company", userId: "owner", role: "owner" as const };
  const repository = createFileModulePackageRepository(root);
  const catalog = createSystemSeedClientCatalogRepository();
  const template = structuredClone(systemModulePackageTemplates.find(pkg => pkg.module.moduleType === "fwm_catalog_base_drawers")!);
  const original = await repository.savePackage(context, template, { expectedPackageHash: null });
  const service = createModulePackageService({ context, packageRepository: repository, catalogRepository: catalog });
  const request: Parameters<typeof service.createParameterPreset>[0] = { modulePackageId: template.module.modulePackageId, name: "  Dve zásuvky  ", note: "  Klientská konfigurácia  ",
    parameters: { drawerCount: 2, hasDoors: false, shelfCount: 0, width: 900, materialAssignments: { corpus: "fixture" } },
    laborRate: { amount: 0, currency: "EUR" }, expectedPackageHash: original.integrity.packageHash,
    operationId: "synthetic_creation_operation" };
  return { root, context, repository, catalog, template, original, service, request };
}

describe("preset durability through the complete write path", () => {
  it("replays a lost response across a fresh service without another preset or package write", async () => {
    const f = await fixture();
    const first = await f.service.createParameterPreset(f.request);
    const restarted = createModulePackageService({ context: f.context, packageRepository: createFileModulePackageRepository(f.root), catalogRepository: f.catalog });
    const save = vi.spyOn(f.repository, "savePackage");
    const repeated = await restarted.createParameterPreset({ ...f.request, parameters: { ...f.request.parameters } });
    expect(repeated.preset).toEqual(first.preset);
    expect(save).not.toHaveBeenCalled();
    expect(repeated.modulePackage.parameterPresets!.presets.filter(p => p.creationOperation?.operationId === f.request.operationId)).toHaveLength(1);
    expect(first.preset.parameterValues).toMatchObject({ drawerCount: 2, hasDoors: false, shelfCount: 0 });
    expect(first.preset.parameterValues).not.toHaveProperty("width");
    expect(first.preset.parameterValues).not.toHaveProperty("materialAssignments");
    expect(first.preset.laborRate?.amount).toBe(0);
  });
  it("coalesces racing copies of the same operation using the durable receipt", async () => {
    const f = await fixture();
    const results = await Promise.all([f.service.createParameterPreset(f.request), f.service.createParameterPreset(f.request)]);
    expect(results[0].preset.presetId).toBe(results[1].preset.presetId);
    const persisted = await f.repository.getPackage(f.context, f.request.modulePackageId);
    expect(persisted!.parameterPresets!.presets.filter(p => p.creationOperation?.operationId === f.request.operationId)).toHaveLength(1);
  });
  it("refuses operation reuse with changed parameters, name, note, rate or actor", async () => {
    const f = await fixture(); await f.service.createParameterPreset(f.request);
    const changes: Partial<Parameters<typeof f.service.createParameterPreset>[0]>[] = [{ parameters: { drawerCount: 3 } }, { name: "Other" }, { note: "Other" }, { laborRate: { amount: 10, currency: "EUR" } }];
    for (const change of changes) {
      await expect(f.service.createParameterPreset({ ...f.request, ...change })).rejects.toBeInstanceOf(ModulePackageRevisionConflictError);
    }
    const otherActor = createModulePackageService({ context: { ...f.context, userId: "other" }, packageRepository: f.repository, catalogRepository: f.catalog });
    await expect(otherActor.createParameterPreset(f.request)).rejects.toBeInstanceOf(ModulePackageRevisionConflictError);
  });
  it("preserves the winning preset when different operations race on one revision", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([f.service.createParameterPreset(f.request), f.service.createParameterPreset({ ...f.request, operationId: "different_creation_operation", name: "Other" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(ModulePackageRevisionConflictError);
    const saved = await createFileModulePackageRepository(f.root).getPackage(f.context, f.request.modulePackageId);
    expect(saved!.parameterPresets!.presets.filter(p => p.creationOperation)).toHaveLength(1);
  });
  it("recovers after catalog publication fails after the authoritative write", async () => {
    const f = await fixture();
    vi.spyOn(f.catalog, "saveCatalog").mockRejectedValueOnce(new Error("catalog unavailable"));
    await expect(f.service.createParameterPreset(f.request)).rejects.toThrow("catalog unavailable");
    const durable = await f.repository.getPackage(f.context, f.request.modulePackageId);
    expect(durable!.parameterPresets!.presets.filter(p => p.creationOperation)).toHaveLength(1);
    const retry = await f.service.createParameterPreset(f.request);
    expect(retry.preset).toEqual(durable!.parameterPresets!.presets.at(-1));
    expect((await f.catalog.getCatalog(f.context)).modules.find(m => m.modulePackageId === f.request.modulePackageId)?.packageHash).toBe(retry.modulePackage.integrity.packageHash);
  });
  it.each(["json", "fqm"])("retains complete client presets when the original template is imported as %s", async format => {
    const f = await fixture(); const created = await f.service.createParameterPreset(f.request);
    const imported = await f.service.importPackage(format === "json" ? { rawJson: JSON.stringify(f.template) } : {
      fqm: packModulePackage({ payloadType: "furnquote-module-package", payloadVersion: 1, exportedAt: new Date().toISOString(), modulePackage: f.template, bundledAssets: [] })
    });
    expect(imported.modulePackage.parameterPresets!.presets.find(p => p.presetId === created.preset.presetId)).toEqual(created.preset);
    expect((await f.service.createParameterPreset(f.request)).preset).toEqual(created.preset);
  });
  it.each(["id", "type", "all", "custom-id"])("retains client configuration when the real refresh CLI selects %s", async selection => {
    const f = await fixture();
    if (selection === "custom-id") {
      f.template.module.modulePackageId = "synthetic_custom_drawers";
      f.original = await f.repository.savePackage(f.context, f.template, { expectedPackageHash: null });
      f.request.modulePackageId = f.template.module.modulePackageId;
      f.request.expectedPackageHash = f.original.integrity.packageHash;
    }
    const created = await f.service.createParameterPreset(f.request);
    const selected = selection === "type" ? f.template.module.moduleType : selection === "all" ? "all" : f.request.modulePackageId;
    await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/assignClientModules.ts", "--storage", "file", "--projectRoot", f.root,
      "--clientId", f.context.clientId, "--modules", selected, "--refresh-packages", "--write"], { cwd: process.cwd(), timeout: 30_000 });
    const saved = await createFileModulePackageRepository(f.root).getPackage(f.context, f.request.modulePackageId);
    expect(saved!.parameterPresets!.presets.find(p => p.presetId === created.preset.presetId)).toEqual(created.preset);
    expect(saved!.integrity.packageHash).toBe(computeModulePackageHash(saved!));
  }, 40_000);
  it("refuses a schema change which removes a saved parameter without touching storage", async () => {
    const f = await fixture(); await f.service.createParameterPreset(f.request);
    const before = await f.repository.getPackage(f.context, f.request.modulePackageId);
    const incompatible = structuredClone(f.template);
    incompatible.parameters.parameters = incompatible.parameters.parameters.filter(p => p.key !== "drawerCount");
    await expect(f.service.importPackage({ package: incompatible })).rejects.toThrow();
    expect(await f.repository.getPackage(f.context, f.request.modulePackageId)).toEqual(before);
  });
  it("prevents direct and compare-and-swap writes from dropping a saved preset", async () => {
    const f = await fixture(); const created = await f.service.createParameterPreset(f.request);
    await expect(f.repository.savePackage(f.context, f.template)).rejects.toBeInstanceOf(ModulePackageRevisionConflictError);
    await expect(f.repository.savePackage(f.context, f.template, { expectedPackageHash: created.modulePackage.integrity.packageHash })).rejects.toBeInstanceOf(ModulePackageRevisionConflictError);
    await expect(f.repository.savePackage(f.context, f.template, { expectedPackageHash: null })).rejects.toBeInstanceOf(ModulePackageRevisionConflictError);
    expect(await f.repository.getPackage(f.context, f.request.modulePackageId)).toEqual(created.modulePackage);
  });
  it("replays labor writes, including zero and inherit, without reverting a later edit", async () => {
    const f = await fixture(); const created = await f.service.createParameterPreset(f.request);
    const input = { modulePackageId: f.request.modulePackageId, presetId: created.preset.presetId,
      expectedPackageHash: created.modulePackage.integrity.packageHash!, laborRate: null, operationId: "synthetic_labor_operation" };
    const first = await f.service.updatePresetLabor(input);
    expect((await f.service.updatePresetLabor(input)).modulePackage).toEqual(first.modulePackage);
    await f.service.updatePresetLabor({ ...input, expectedPackageHash: first.modulePackage.integrity.packageHash!, laborRate: { amount: 100, currency: "EUR" }, operationId: "later_labor_operation" });
    await expect(f.service.updatePresetLabor(input)).rejects.toBeInstanceOf(ModulePackageRevisionConflictError);
  });
  it("does not leak operations to another tenant or permit viewer writes", async () => {
    const f = await fixture(); await f.service.createParameterPreset(f.request);
    const other = createModulePackageService({ context: { ...f.context, clientId: "other_company" }, packageRepository: f.repository, catalogRepository: f.catalog });
    await expect(other.createParameterPreset(f.request)).rejects.toThrow("not found");
    const viewer = createModulePackageService({ context: { ...f.context, role: "viewer" }, packageRepository: f.repository, catalogRepository: f.catalog });
    await expect(viewer.createParameterPreset(f.request)).rejects.toThrow("Viewer");
    await expect(viewer.importPackage({ package: f.template })).rejects.toThrow("Viewer");
  });
  it("keeps the committed package readable if an auxiliary file cannot be replaced", async () => {
    const f = await fixture(); const created = await f.service.createParameterPreset(f.request);
    const dir = resolveClientModulePackagePath(f.root, f.context, f.request.modulePackageId);
    await rm(path.join(dir, "module.meta.json"));
    const { mkdir } = await import("node:fs/promises"); await mkdir(path.join(dir, "module.meta.json"));
    await expect(f.service.createParameterPreset({ ...f.request, expectedPackageHash: created.modulePackage.integrity.packageHash,
      operationId: "failed_io_operation", name: "Cannot commit" })).rejects.toThrow();
    expect(JSON.parse(await readFile(path.join(dir, "module.package.json"), "utf-8"))).toEqual(created.modulePackage);
    expect(await createFileModulePackageRepository(f.root).getPackage(f.context, f.request.modulePackageId)).toEqual(created.modulePackage);
  });
  it.each([NaN, Infinity, -Infinity, () => 1])("refuses invalid values without saving a partial configuration (%s)", async value => {
    const f = await fixture();
    await expect(f.service.createParameterPreset({ ...f.request, parameters: { drawerCount: value } })).rejects.toThrow();
    expect(await f.repository.getPackage(f.context, f.request.modulePackageId)).toEqual(f.original);
  });
});
