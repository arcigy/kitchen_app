// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import { createModulePackageControls } from "../core/module-package/runtime/module-package-controls";
import { createModulePackageDefaultParams } from "../core/module-package/runtime/module-runtime-adapter";
import { extendedFurnitureModulePackages } from "../system/module-packages/extendedFurniture";
import { createDrawerLowControls } from "../modules/drawerLow/controls";
import { makeDefaultDrawerLowParams } from "../modules/drawerLow/types";
import systemValues from "../modules/drawerLow/package/definitions/drawer_low.system-parameters.json";

vi.mock("../core/module-package/runtime/moduleParameterPresetPicker", () => ({
  createModuleParameterPresetPicker: () => ({ element: document.createElement("div"), refresh: vi.fn() }),
  resolveMatchingModuleParameterPresetId: () => ""
}));

describe("expanded module controls", () => {
  it("keeps legacy smart controls private and omits their imported system fields", () => {
    const clientCatalog = { clientId: "settings-test", ...createSystemCatalogSeed() };
    const params = makeDefaultDrawerLowParams();
    const before = structuredClone(systemValues);
    const host = document.createElement("div");
    createDrawerLowControls(host, params, { clientCatalog, onChange: vi.fn(), getWorktopThicknessMm: () => 38, userParametersOnly: true, textInputCommitMode: "explicit" });
    expect(host.querySelector(".portable-section--system")).toBeNull();
    const width = host.querySelector<HTMLInputElement>('[data-parameter-key="width"] input')!;
    expect(width).not.toBeNull();
    width.value = "750"; width.dispatchEvent(new Event("change", { bubbles: true }));
    expect(params.width).toBe(750);
    expect(systemValues).toEqual(before);
  });
  it("exposes omitted user dimensions while hiding internal material routing and inactive drawers", () => {
    const modulePackage = structuredClone(extendedFurnitureModulePackages.find((pkg) => pkg.module.moduleType === "fwm_catalog_base_drawers")!);
    const clientCatalog = { clientId: "settings-test", ...createSystemCatalogSeed() };
    const parameters = createModulePackageDefaultParams({ modulePackage, catalog: clientCatalog });
    parameters.drawerCount = 2;
    const host = document.createElement("div");
    const controls = createModulePackageControls(host, modulePackage, parameters, {
      clientCatalog, onChange: vi.fn(), getWorktopThicknessMm: () => 38, userParametersOnly: true
    });
    const row = (key: string) => host.querySelector<HTMLElement>(`[data-parameter-key="${key}"]`);
    expect(row("width")).not.toBeNull();
    expect(row("drawer1FrontHeightMm")?.hidden).toBe(false);
    expect(row("drawer2FrontHeightMm")?.hidden).toBe(false);
    expect(row("drawer3FrontHeightMm")?.hidden).toBe(true);
    expect(row("bodyMaterialId")).not.toBeNull();
    for (const key of ["type", "packageHash", "bodyMaterialGroup", "frontMaterialGroup"]) expect(row(key), key).toBeNull();
    parameters.drawerCount = 3;
    controls.syncFromParams();
    expect(row("drawer3FrontHeightMm")?.hidden).toBe(false);
  });
});
