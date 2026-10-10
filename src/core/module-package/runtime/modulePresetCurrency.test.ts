// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../../catalog/catalog-bootstrap";
import { extendedFurnitureModulePackages } from "../../../system/module-packages/extendedFurniture";
import { createModulePackageDefaultParams } from "./module-runtime-adapter";
import { createResolvedModuleControls } from "./module-package-controls";
import type { ModuleParams } from "../../../model/cabinetTypes";
import type { ModuleLaborState } from "../../project-manufacturing/module-labor";

afterEach(() => document.body.replaceChildren());

it.each([false, true])("uses tenant currency for a new preset and preserves an existing rate (existing: %s)", (existing) => {
  const catalog = { ...createSystemCatalogSeed(), clientId: "tenant-czk-test" };
  const pkg = extendedFurnitureModulePackages.find(item => item.module.moduleType === "fwm_catalog_base_drawers")!;
  const params = createModulePackageDefaultParams({ modulePackage: pkg, catalog }) as ModuleParams;
  if (existing) params.moduleLabor = { schemaVersion: 1, inherited: { source: "legacy", rate: { amount: 10, currency: "EUR" } } } satisfies ModuleLaborState;
  const before = structuredClone(params);
  const host = document.createElement("div");
  document.body.append(host);
  createResolvedModuleControls(host, pkg, params, {
    clientCatalog: catalog, defaultCurrency: "CZK", getWorktopThicknessMm: () => 0,
    onChange: vi.fn(), createParameterPreset: vi.fn()
  });
  host.querySelector<HTMLButtonElement>(".module-parameter-preset-create")!.click();
  const dialog = document.querySelector("[data-preset-dialog]")!;
  const input = dialog.querySelector<HTMLInputElement>("[data-create-preset-labor]")!;
  const currency = dialog.querySelector<HTMLElement>("[data-labor-currency]")!;
  expect(dialog.querySelector("select")).toBeNull();
  expect(currency.textContent).toBe("CZK");
  expect(input.value).toBe("");
  expect(params).toEqual(before);
});
