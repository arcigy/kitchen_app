import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { createCatalogModuleDefinitionFromPackage } from "../core/module-package/module-package-catalog";
import { createModulePackageDefaultParams } from "../core/module-package/runtime/module-runtime-adapter";
import type { ModuleParams } from "../model/cabinetTypes";
import { extendedFurnitureModulePackages } from "../system/module-packages/extendedFurniture";
import { createReplacementModuleParams, listCompatibleModuleTypeOptions } from "./moduleTypeReplacement";

function modulePackage(moduleType: string) {
  const found = extendedFurnitureModulePackages.find((candidate) => candidate.module.moduleType === moduleType);
  if (!found) throw new Error(`Missing test module package: ${moduleType}`);
  return found;
}

function testCatalog(): ClientCatalog {
  return { clientId: "client_test", ...createSystemCatalogSeed() };
}

describe("module type replacement", () => {
  it("offers only enabled modules from the same Revit-like category, kitchen role and corner class", () => {
    const catalog = testCatalog();
    const current = modulePackage("fwm_catalog_base_corner");
    const lowerCorner = modulePackage("fwm_corner_base_module_1");
    const upperCorner = modulePackage("wall_corner_90");
    const straightBase = modulePackage("fwm_catalog_base_doors");
    const disabledLowerCorner = modulePackage("fwm_corner_base_module_2");
    catalog.modules = [
      createCatalogModuleDefinitionFromPackage(current, { catalog, enabled: true }),
      createCatalogModuleDefinitionFromPackage(lowerCorner, { catalog, enabled: true }),
      createCatalogModuleDefinitionFromPackage(upperCorner, { catalog, enabled: true }),
      createCatalogModuleDefinitionFromPackage(straightBase, { catalog, enabled: true }),
      createCatalogModuleDefinitionFromPackage(disabledLowerCorner, { catalog, enabled: false })
    ];

    const options = listCompatibleModuleTypeOptions({
      currentPackage: current,
      modulePackages: [current, lowerCorner, upperCorner, straightBase, disabledLowerCorner],
      catalog
    });

    expect(options.map((option) => option.value)).toEqual(expect.arrayContaining([
      current.module.modulePackageId,
      lowerCorner.module.modulePackageId
    ]));
    expect(options.map((option) => option.value)).not.toEqual(expect.arrayContaining([
      upperCorner.module.modulePackageId,
      straightBase.module.modulePackageId,
      disabledLowerCorner.module.modulePackageId
    ]));
  });

  it("starts from target defaults and transfers only valid shared user values and supported assignments", () => {
    const catalog = testCatalog();
    const current = modulePackage("fwm_catalog_base_doors");
    const target = modulePackage("fwm_catalog_base_drawers");
    const currentParams = createModulePackageDefaultParams({ modulePackage: current, catalog }) as ModuleParams & Record<string, unknown>;
    currentParams.width = 777;
    currentParams.widthMm = 777;
    currentParams.height = 810;
    currentParams.depth = 545;
    currentParams.doorCount = 2;
    currentParams.variant = "2d";
    currentParams.displayName = "Stary nazov";
    const carriedMaterialId = catalog.kitchenDefaults.carcassMaterialId ?? catalog.materials[0]!.id;
    const unsupportedMaterialId = catalog.kitchenDefaults.frontMaterialId ?? catalog.materials[0]!.id;
    currentParams.materialAssignments = {
      ...(currentParams.materialAssignments as Record<string, string>),
      corpus: carriedMaterialId,
      unsupported_old_slot: unsupportedMaterialId
    };
    currentParams.commercialSelections = { boardMaterials: { stale_old_part: "material.old" } };

    const next = createReplacementModuleParams({
      currentParams,
      currentPackage: current,
      targetPackage: target,
      catalog
    }) as ModuleParams & Record<string, unknown>;
    const targetDefaults = createModulePackageDefaultParams({ modulePackage: target, catalog });

    expect(next).toMatchObject({
      type: target.module.moduleType,
      moduleType: target.module.moduleType,
      modulePackageId: target.module.modulePackageId,
      width: 777,
      widthMm: 777,
      height: 810,
      depth: 545,
      doorCount: 2,
      displayName: targetDefaults.displayName,
      variant: targetDefaults.variant
    });
    expect(next.materialAssignments).toMatchObject({ corpus: carriedMaterialId });
    expect(next.materialAssignments).not.toHaveProperty("unsupported_old_slot");
    expect(next).not.toHaveProperty("commercialSelections");
  });
});
