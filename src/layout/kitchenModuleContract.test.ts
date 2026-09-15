import { describe, expect, it } from "vitest";
import { Box3, Group } from "three";
import { systemModulePackageTemplates } from "../system/module-packages";
import { createSystemSeedClientCatalogRepository } from "../core/catalog/catalog-repository";
import { buildModulePackageGeometryFromPackage, createDefaultModulePackageParameters } from "../core/module-package/runtime/module-runtime-adapter";
import { auditKitchenModuleGeometryContract, auditKitchenModulePlacementContract } from "./kitchenModulePlacementContract";
import { makeDefaultKitchenContext, resolveContext } from "./kitchenContext";
import { normalizeKitchenModulePackage } from "./kitchenModuleContract";

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

  it("keeps a v3 chamfered corner on two declared depth-plus-chamfer reference planes", () => {
    const modulePackage = systemModulePackageTemplates.find((entry) => entry.module.moduleType === "fwm_catalog_base_corner");
    expect(modulePackage?.kitchenContract).toMatchObject({ topology: "corner-symmetric", geometryContractVersion: 3 });
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
      expect((corner.position.x - xArm.position.x) * 1000).toBeCloseTo(580 + frontChamferMm + 18, 4);
      expect((zArm.position.z - corner.position.z) * 1000).toBeCloseTo(580 + frontChamferMm + 18, 4);
      const boardBounds = kitchenBoardBounds(group);
      expect((boardBounds.max.x - boardBounds.min.x) * 1000).toBeCloseTo(580 + frontChamferMm + 18, 4);
      expect((boardBounds.max.z - boardBounds.min.z) * 1000).toBeCloseTo(580 + frontChamferMm + 18, 4);
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

  it("keeps declared outside depth equal to rendered board depth when a front is present", () => {
    const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient("client_delfi");
    for (const moduleType of ["fwm_catalog_base_doors", "fwm_catalog_base_drawers", "fwm_catalog_wall_cabinet", "base_bottle_pullout"]) {
      const modulePackage = systemModulePackageTemplates.find((entry) => entry.module.moduleType === moduleType);
      expect(modulePackage, moduleType).toBeTruthy();
      const group = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, catalog });
      const bounds = kitchenBoardBounds(group);
      const declaredDepth = modulePackage!.parameters.parameters.find((parameter) => parameter.key === "depth")?.defaultValue;
      expect(typeof declaredDepth).toBe("number");
      expect((bounds.max.z - bounds.min.z) * 1000).toBeCloseTo(declaredDepth as number, 4);
    }
  });

  it("keeps the wall chamfered corner inside its declared width planes", () => {
    const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient("client_delfi");
    const modulePackage = systemModulePackageTemplates.find((entry) => entry.module.moduleType === "fwm_catalog_wall_cabinet");
    expect(modulePackage).toBeTruthy();
    const group = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      catalog,
      parameters: {
        ...createDefaultModulePackageParameters(modulePackage!),
        variant: "corner_chamfered",
        cornerShape: "chamfered",
        width: 600,
        depth: 330
      }
    });
    const bounds = kitchenBoardBounds(group);
    expect((bounds.max.x - bounds.min.x) * 1000).toBeCloseTo(600, 4);
    expect((bounds.max.z - bounds.min.z) * 1000).toBeCloseTo(600, 4);
  });

  it("keeps the wall 90-degree corner inside its declared width planes", () => {
    const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient("client_delfi");
    const modulePackage = systemModulePackageTemplates.find((entry) => entry.module.moduleType === "fwm_catalog_wall_cabinet");
    expect(modulePackage).toBeTruthy();
    const group = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      catalog,
      parameters: {
        ...createDefaultModulePackageParameters(modulePackage!),
        variant: "corner_90",
        cornerShape: "l_shape",
        width: 600,
        depth: 330
      }
    });
    const bounds = kitchenBoardBounds(group);
    expect((bounds.max.x - bounds.min.x) * 1000).toBeCloseTo(600, 4);
    expect((bounds.max.z - bounds.min.z) * 1000).toBeCloseTo(600, 4);
  });

  it("removes drawer system and M/E size selectors from package-backed Properties", () => {
    for (const modulePackage of systemModulePackageTemplates.filter((entry) => entry.module.tags?.includes("kitchen"))) {
      const normalized = normalizeKitchenModulePackage(structuredClone(modulePackage));
      const keys = normalized.parameters.parameters.map((parameter) => parameter.key);
      expect(keys.some((key) => key === "drawerSystemBrand" || key === "runnerComponentId" || /^drawer\d+System(Size|Label|MinFrontHeightMm|BackHeightMm)$/.test(key) || /^tallSlot\d+DrawerSystemSize$/.test(key))).toBe(false);
      expect(normalized.ui.controls.some((control) => keyIsRemoved(control.parameterKey))).toBe(false);
    }
  });
});

function kitchenBoardBounds(group: Group) {
  const bounds = new Box3();
  group.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh && ["corpus", "front", "back", "shelf", "drawer_bottom", "plinth"].includes(String(object.userData.materialGroup))) {
      bounds.union(new Box3().setFromObject(object));
    }
  });
  return bounds;
}

function keyIsRemoved(key: string) {
  return key === "drawerSystemBrand" || key === "runnerComponentId" || /^drawer\d+System(Size|Label|MinFrontHeightMm|BackHeightMm)$/.test(key) || /^tallSlot\d+DrawerSystemSize$/.test(key);
}
