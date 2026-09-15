import { afterEach, describe, expect, it, vi } from "vitest";
import { systemModulePackageTemplates } from "../system/module-packages";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import { createCatalogModuleDefinitionFromPackage } from "../core/module-package/module-package-catalog";
import { createModuleParameterPresetSaver } from "./moduleParameterPresetService";

afterEach(() => vi.unstubAllGlobals());
describe("company preset saving", () => {
  it("updates only the exact package and never the edited module parameters", async () => {
    const pkg = structuredClone(systemModulePackageTemplates.find((p) => p.module.moduleType === "fwm_catalog_base_drawers")!);
    const other = structuredClone(pkg); other.module.modulePackageId = "another-vendor-package";
    const otherModule = createCatalogModuleDefinitionFromPackage(other);
    const catalog = { clientId: "fixture", ...createSystemCatalogSeed(), modules: [otherModule, createCatalogModuleDefinitionFromPackage(pkg)] };
    const updated = structuredClone(pkg); updated.integrity.packageHash = "new-hash";
    const parameters = { width: 720, commercialSelections: { boardMaterials: { corpus: "fixture-material" } }, packageHash: "original" };
    const before = structuredClone(parameters);
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async () => ({ ok: true, modulePackage: updated, catalogModule: createCatalogModuleDefinitionFromPackage(updated), preset: { presetId: "new-preset" } }) }));
    vi.stubGlobal("fetch", fetch);
    const result = await createModuleParameterPresetSaver(catalog)({ modulePackage: pkg, parameters, name: "Fixture", note: "Configuration" });
    expect(result?.presetId).toBe("new-preset"); expect(parameters).toEqual(before);
    expect(catalog.modules[0]).toBe(otherModule); expect(pkg.integrity.packageHash).toBe("new-hash");
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/modules/${encodeURIComponent(pkg.module.modulePackageId)}/parameter-presets`);
  });
  it("preserves caller state when the server refuses the write", async () => {
    const pkg = structuredClone(systemModulePackageTemplates[0]!); const before = structuredClone(pkg);
    const catalog = { clientId: "fixture", ...createSystemCatalogSeed() };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, error: "Forbidden" }) })));
    await expect(createModuleParameterPresetSaver(catalog)({ modulePackage: pkg, parameters: { width: 780 }, name: "Fixture", note: "Configuration" })).rejects.toThrow("Forbidden");
    expect(pkg).toEqual(before);
  });
});
