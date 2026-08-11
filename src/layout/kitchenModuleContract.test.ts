import { describe, expect, it } from "vitest";
import { systemModulePackageTemplates } from "../system/module-packages";
import { createSystemSeedClientCatalogRepository } from "../core/catalog/catalog-repository";
import { buildModulePackageGeometryFromPackage, createDefaultModulePackageParameters } from "../core/module-package/runtime/module-runtime-adapter";
import { auditKitchenModuleGeometryContract, auditKitchenModulePlacementContract } from "./kitchenModulePlacementContract";
import { makeDefaultKitchenContext, resolveContext } from "./kitchenContext";

describe("Kitchen module contract", () => {
  it("emits an explicit, valid contract for every Kitchen system package", () => {
    const kitchenPackages = systemModulePackageTemplates.filter((modulePackage) =>
      modulePackage.module.tags?.includes("kitchen") || modulePackage.parameters.parameters.some((parameter) => parameter.key === "assemblyContext" && parameter.defaultValue === "kitchen")
    );
    expect(kitchenPackages).not.toHaveLength(0);
    for (const modulePackage of kitchenPackages) {
      expect(modulePackage.kitchenContract, modulePackage.module.moduleType).toBeTruthy();
      expect(auditKitchenModulePlacementContract(modulePackage), modulePackage.module.moduleType).toEqual([]);
    }
  });

  it("keeps a v2 chamfered corner on two declared depth reference planes", () => {
    const modulePackage = systemModulePackageTemplates.find((entry) => entry.module.moduleType === "fwm_catalog_base_corner");
    expect(modulePackage?.kitchenContract).toMatchObject({ topology: "corner-symmetric", geometryContractVersion: 2 });
    const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient("client_delfi");
    const build = (frontChamferMm: number) => buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      catalog,
      parameters: {
        ...createDefaultModulePackageParameters(modulePackage!),
        variant: "corner_chamfered",
        cornerShape: "chamfered",
        depth: 580,
        frontChamferMm,
        requiresWorktop: false,
        hasWorktop: false,
        worktopThicknessMm: 0
      }
    });
    for (const frontChamferMm of [200, 320]) {
      const group = build(frontChamferMm);
      const corner = group.getObjectByName("__kitchen_corner_anchor")!;
      const xArm = group.getObjectByName("__kitchen_corner_x_anchor")!;
      const zArm = group.getObjectByName("__kitchen_corner_z_anchor")!;
      expect((corner.position.x - xArm.position.x) * 1000).toBeCloseTo(580, 4);
      expect((zArm.position.z - corner.position.z) * 1000).toBeCloseTo(580, 4);
      const auditPackage = structuredClone(modulePackage!);
      for (const parameter of auditPackage.parameters.parameters) {
        if (parameter.key === "variant") parameter.defaultValue = "corner_chamfered";
        if (parameter.key === "depth") parameter.defaultValue = 580;
        if (parameter.key === "frontChamferMm") parameter.defaultValue = frontChamferMm;
      }
      expect(auditKitchenModuleGeometryContract(auditPackage, group)).toEqual([]);
    }
  });

  it("keeps low, top, and tall group dimensions independent", () => {
    const context = resolveContext({
      ...makeDefaultKitchenContext(),
      heightMm: 900,
      upperHeightMm: 720,
      upperDepthMm: 330,
      tallHeightMm: 2400,
      tallDepthMm: 610
    });
    expect(context.moduleHeightMm).toBe(862);
    expect(context.upperHeightMm).toBe(720);
    expect(context.tallHeightMm).toBe(2400);
    expect(context.tallDepthMm).toBe(610);
  });
});
