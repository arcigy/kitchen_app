import { describe, expect, it } from "vitest";
import { createSystemSeedClientCatalogRepository } from "../catalog/catalog-repository";
import { systemModulePackageTemplates } from "../../system/module-packages";
import { createCatalogModuleDefinitionFromPackage } from "./module-package-catalog";
import { computeModulePackageHash } from "./module-package-file";
import { presetCatalogReference } from "./module-preset-catalog";

describe("preset catalog references", () => {
  it("updates every reference without flattening company aliases or changing another package", () => {
    const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient("synthetic_alias_company");
    const pkg = systemModulePackageTemplates.find(item => item.module.moduleType === "fwm_catalog_base_drawers")!;
    const definition = createCatalogModuleDefinitionFromPackage(pkg, { catalog });
    const first = { ...definition, id: "company_alias_a", name: "First alias", packageHash: "old-a" };
    const second = { ...definition, id: "company_alias_b", name: "Second alias", packageHash: "old-b" };
    const unrelated = { ...definition, id: "other_package", modulePackageId: "other_package", packageHash: "unrelated" };
    catalog.modules = [first, second, unrelated];
    const result = presetCatalogReference(catalog, pkg);
    const hash = computeModulePackageHash(pkg);
    expect(result.modules).toEqual([{ ...first, packageHash: hash }, { ...second, packageHash: hash }, unrelated]);
    expect(catalog.modules).toEqual([first, second, unrelated]);
    expect(result.changed).toBe(true);
    expect(presetCatalogReference({ ...catalog, modules: result.modules }, pkg).changed).toBe(false);
  });
});
