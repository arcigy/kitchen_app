import { describe, expect, it } from "vitest";
import { createSystemSeedClientCatalogRepository } from "../core/catalog/catalog-repository";
import { buildModulePackageGeometryFromPackage } from "../core/module-package/runtime/module-runtime-adapter";
import { extendedFurnitureModulePackages } from "../system/module-packages/extendedFurniture";
import {
  auditKitchenModuleGeometryContract,
  auditKitchenModulePlacementContract
} from "./kitchenModulePlacementContract";

const DELFI_RELEVANT_FWM_TYPES = [
  "fwm_catalog_base_corner",
  "fwm_catalog_base_doors",
  "fwm_catalog_base_drawers",
  "fwm_catalog_base_open_end",
  "fwm_catalog_tall_cabinet",
  "fwm_tall_open_end",
  "fwm_catalog_wall_cabinet",
  "fwm_catalog_wall_open_end"
];

describe("kitchen module placement contract", () => {
  it("keeps DELFI-relevant kitchen modules placement-safe and grain-defined", () => {
    const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient("client_delfi");
    const packages = extendedFurnitureModulePackages.filter((modulePackage) =>
      DELFI_RELEVANT_FWM_TYPES.includes(modulePackage.module.moduleType)
    );

    expect([...new Set(packages.map((modulePackage) => modulePackage.module.moduleType))].sort())
      .toEqual([...DELFI_RELEVANT_FWM_TYPES].sort());

    const issues = packages.flatMap((modulePackage) => [
      ...auditKitchenModulePlacementContract(modulePackage).map((issue) => ({ moduleType: modulePackage.module.moduleType, ...issue })),
      ...auditKitchenModuleGeometryContract(
        modulePackage,
        buildModulePackageGeometryFromPackage({ modulePackage, catalog })
      ).map((issue) => ({ moduleType: modulePackage.module.moduleType, ...issue }))
    ]);

    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  }, 30_000);

  it("allows top corner wall-cabinet packages without floor or worktop requirements", () => {
    const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient("client_delfi");
    const wallPackage = extendedFurnitureModulePackages.find((modulePackage) => modulePackage.module.moduleType === "fwm_catalog_wall_cabinet");
    expect(wallPackage).toBeTruthy();
    const topCornerPackage = structuredClone(wallPackage!);
    topCornerPackage.module.modulePackageId = "client_delfi_wall_corner_chamfered_v1";
    topCornerPackage.module.displayName = "Horni rohovy skoseny";
    topCornerPackage.kitchenContract = {
      ...topCornerPackage.kitchenContract!,
      topology: "corner-asymmetric",
      placementMode: "corner",
      capabilities: topCornerPackage.kitchenContract!.capabilities.filter((capability) => capability !== "plinth" && capability !== "worktop")
    };
    topCornerPackage.placement = {
      allowedContexts: ["kitchen_corner"],
      requiredAnchors: ["two_perpendicular_walls", "corner", "wall"],
      requiresCorner: true,
      requiresWall: true,
      requiresFloor: false,
      allowFreePlacement: false,
      corner: { required: true, allowedAngles: [90], toleranceDeg: 3, mustTouchBothWalls: true },
      wall: { mustAttachToWall: true },
      clearance: { frontMm: 500, leftMm: 0, rightMm: 0 },
      collision: { allowOverlap: false }
    };
    for (const parameter of topCornerPackage.parameters.parameters) {
      if (parameter.key === "variant") parameter.defaultValue = "corner_chamfered";
      if (parameter.key === "width") {
        parameter.defaultValue = 600;
        parameter.uiVisibility = "user";
      }
      if (parameter.key === "depth") parameter.defaultValue = 330;
      if (parameter.key === "height") parameter.defaultValue = 450;
      if (parameter.key === "heightCarcass") parameter.defaultValue = 450;
      if (parameter.key === "shelfCount") parameter.defaultValue = 1;
      if (parameter.key === "doorCount") parameter.defaultValue = 1;
      if (parameter.key === "frontChamferMm") parameter.defaultValue = 270;
      if (parameter.key === "isCorner") parameter.defaultValue = true;
      if (parameter.key === "frontFaceCount") parameter.defaultValue = 0;
      if (parameter.key === "backFaceCount") parameter.defaultValue = 2;
      if (parameter.key === "cornerShape") parameter.defaultValue = "chamfered";
      if (parameter.key === "requiresWorktop") parameter.defaultValue = false;
      if (parameter.key === "hasWorktop") parameter.defaultValue = false;
      if (parameter.key === "hasPlinth") parameter.defaultValue = false;
      if (parameter.key === "plinthHeight") parameter.defaultValue = 0;
      if (parameter.key === "wallMounted") parameter.defaultValue = true;
    }

    const issues = [
      ...auditKitchenModulePlacementContract(topCornerPackage),
      ...auditKitchenModuleGeometryContract(
        topCornerPackage,
        buildModulePackageGeometryFromPackage({ modulePackage: topCornerPackage, catalog })
      )
    ];

    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
