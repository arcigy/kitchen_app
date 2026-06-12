import { describe, expect, it } from "vitest";
import { Box3, type Mesh } from "three";
import { getSystemSeedCatalog } from "../../core/catalog/catalog-repository";
import { validateFurnQuoteModulePackage } from "../../core/module-package/module-package-validation";
import { buildModulePackageGeometryFromPackage, createDefaultModulePackageParameters } from "../../core/module-package/runtime/module-runtime-adapter";
import type { FurnQuoteModulePackage } from "../../core/module-package/module-package-types";
import { applyKitchenContextToModuleParams } from "../../layout/kitchenMaterialSync";
import { makeDefaultKitchenContext, resolveContext } from "../../layout/kitchenContext";
import { staysOutsideKitchenWorktopFootprint, usesKitchenWorktopBinding } from "../../layout/kitchenModuleRules";
import { extendedFurnitureModulePackages } from "../../system/module-packages/extendedFurniture";
import { calculateFwmFurnitureBOM } from "./calculation";
import { FWM_FURNITURE_SPECS } from "./definitions";
import { normalizeFwmFurnitureParams, type FwmFurnitureParams } from "./types";

const requiredSystemParams = [
  "typeId",
  "type",
  "displayName",
  "family",
  "code",
  "variant",
  "version",
  "widthMm",
  "heightMm",
  "depthMm",
  "assemblyContext",
  "roomCategory",
  "kitchenModuleRole",
  "requiresWorktop",
  "positionXmm",
  "positionYmm",
  "positionZmm",
  "rotationZDeg",
  "customPriceOverride",
  "pricingEnabled",
  "priceSource",
  "costOverride",
  "quantity",
  "isActive",
  "isVisible",
  "isLocked",
  "isValid",
  "validationErrors",
  "notes",
  "tags",
  "createdAt",
  "updatedAt"
] as const;

const requiredIfcParams = [
  "exportToIfc",
  "ifcClass",
  "ifcPredefinedType",
  "ifcName",
  "ifcDescription",
  "ifcObjectType",
  "ifcTag",
  "classificationCode",
  "classificationSystem"
] as const;

const requiredOrientationParams = [
  "frontSide",
  "backSide",
  "leftSide",
  "rightSide",
  "frontDirection",
  "backDirection",
  "leftDirection",
  "rightDirection",
  "worktopBackSide"
] as const;

const requiredMaterialGroupParams = [
  "bodyMaterialGroup",
  "frontMaterialGroup",
  "backMaterialGroup",
  "shelfMaterialGroup",
  "worktopMaterialGroup",
  "drawerBoxMaterialGroup"
] as const;

function meshCount(root: { traverse: (visitor: (object: unknown) => void) => void }) {
  let count = 0;
  root.traverse((object) => {
    if ((object as Mesh).isMesh) count += 1;
  });
  return count;
}

function expectFiniteBox(root: Parameters<typeof Box3.prototype.setFromObject>[0]) {
  const box = new Box3().setFromObject(root);
  for (const value of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) {
    expect(Number.isFinite(value)).toBe(true);
  }
  expect(box.max.x - box.min.x).toBeGreaterThan(0.01);
  expect(box.max.y - box.min.y).toBeGreaterThan(0.01);
  expect(box.max.z - box.min.z).toBeGreaterThan(0.001);
}

function hasMeshNamed(root: { traverse: (visitor: (object: unknown) => void) => void }, pattern: RegExp) {
  let found = false;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && pattern.test(mesh.name)) found = true;
  });
  return found;
}

function meshes(root: { traverse: (visitor: (object: unknown) => void) => void }) {
  const result: Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh) result.push(mesh);
  });
  return result;
}

function getMeshNamed(root: { traverse: (visitor: (object: unknown) => void) => void }, name: string) {
  let found = null as Mesh | null;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.name === name) found = mesh;
  });
  return found;
}

function meshBoundsMm(mesh: Mesh) {
  mesh.updateMatrixWorld(true);
  const box = new Box3().setFromObject(mesh);
  return {
    minZ: box.min.z * 1000,
    maxZ: box.max.z * 1000,
    depth: (box.max.z - box.min.z) * 1000
  };
}

function renderColorHex(mesh: Mesh | null) {
  return typeof mesh?.userData.renderColorHex === "string" ? mesh.userData.renderColorHex : "";
}

function materialIdForFamily(catalog: ReturnType<typeof getSystemSeedCatalog>, family: string, except: string[] = []) {
  return catalog.materials.find((material) =>
    material.materialType === "board" &&
    material.isActive &&
    material.boardFamily === family &&
    !except.includes(material.id)
  )?.id ?? catalog.materials.find((material) =>
    material.materialType === "board" &&
    material.isActive &&
    material.boardFamily === family
  )?.id ?? "";
}

function createChangedParameterSet(
  modulePackage: FurnQuoteModulePackage,
  mode: "low" | "high",
  catalog: ReturnType<typeof getSystemSeedCatalog>
) {
  const next = createDefaultModulePackageParameters(modulePackage) as Record<string, unknown>;
  for (const parameter of modulePackage.parameters.parameters) {
    if (parameter.key === "type") continue;
    if (parameter.type === "number") {
      if (mode === "low") {
        next[parameter.key] = typeof parameter.min === "number" ? parameter.min : 0;
      } else {
        const defaultValue = typeof parameter.defaultValue === "number" ? parameter.defaultValue : 1;
        const step = typeof parameter.step === "number" && parameter.step > 0 ? parameter.step : 1;
        const changedValue = parameter.key.endsWith("Count") ? defaultValue + 1 : defaultValue + step;
        next[parameter.key] = typeof parameter.max === "number" ? Math.min(parameter.max, changedValue) : changedValue;
      }
      continue;
    }
    if (parameter.type === "select") {
      const options = parameter.options ?? [];
      next[parameter.key] = mode === "low" ? options[0]?.value : options[options.length - 1]?.value;
      continue;
    }
    if (parameter.type === "boolean") {
      next[parameter.key] = !(parameter.defaultValue === true);
      continue;
    }
    if (parameter.type === "material") {
      next[parameter.key] =
        parameter.key === "frontMaterialId" ? catalog.kitchenDefaults.frontMaterialId :
        parameter.key === "backMaterialId" ? catalog.kitchenDefaults.backPanelMaterialId :
        parameter.key === "drawerBottomMaterialId" ? catalog.kitchenDefaults.drawerBottomMaterialId :
        parameter.key === "plinthMaterialId" ? catalog.kitchenDefaults.plinthMaterialId :
        parameter.key === "worktopMaterialId" ? catalog.kitchenDefaults.worktopMaterialId :
        catalog.kitchenDefaults.carcassMaterialId;
      continue;
    }
    if (parameter.type === "component") {
      next[parameter.key] =
        parameter.key === "runnerComponentId" ? catalog.kitchenDefaults.defaultDrawerSystemComponentId :
        parameter.key === "hingeComponentId" ? catalog.kitchenDefaults.defaultHingeComponentId :
        catalog.kitchenDefaults.defaultHandleComponentId;
      continue;
    }
    if (parameter.key === "tags" || parameter.key === "validationErrors") {
      next[parameter.key] = [`${parameter.key}-${mode}`];
      continue;
    }
    next[parameter.key] = `${parameter.key}-${mode}`;
  }
  return next as FwmFurnitureParams;
}

describe("FWM furniture module packages", () => {
  it("declares every requested module as a valid FurnQuote package", () => {
    expect(FWM_FURNITURE_SPECS).toHaveLength(44);
    expect(extendedFurnitureModulePackages).toHaveLength(44);

    for (const modulePackage of extendedFurnitureModulePackages) {
      expect(() => validateFurnQuoteModulePackage(modulePackage)).not.toThrow();
      expect(modulePackage.format).toBe("furnquote-module");
      expect(modulePackage.geometry.mode).toBe("trusted-runtime");
      if (modulePackage.geometry.mode !== "trusted-runtime") throw new Error("FWM package must use trusted runtime geometry.");
      expect(modulePackage.compatibility.requiredRuntimeBuilderKeys).toContain(modulePackage.geometry.runtimeBuilderKey);
      const parameterKeys = new Set(modulePackage.parameters.parameters.map((parameter) => parameter.key));
      for (const key of [...requiredSystemParams, ...requiredIfcParams, ...requiredOrientationParams, ...requiredMaterialGroupParams]) {
        expect(parameterKeys.has(key), `${modulePackage.module.moduleType} missing ${key}`).toBe(true);
      }
      const defaults = createDefaultModulePackageParameters(modulePackage);
      expect(defaults.frontSide).toBe("FRONT");
      expect(defaults.backSide).toBe("BACK");
      expect(defaults.leftSide).toBe("LEFT");
      expect(defaults.rightSide).toBe("RIGHT");
      expect(defaults.frontDirection).toBe("+Z");
      expect(defaults.backDirection).toBe("-Z");
      expect(defaults.assemblyContext).toBe(modulePackage.module.tags?.includes("kitchen") ? "kitchen" : defaults.assemblyContext);
      if (modulePackage.module.tags?.includes("kitchen")) {
        expect(defaults.roomCategory).toBe("kitchen");
        expect(["base", "top", "tall"]).toContain(defaults.kitchenModuleRole);
      } else {
        expect(defaults.roomCategory, modulePackage.module.moduleType).toBeTruthy();
        expect(defaults.roomCategory, modulePackage.module.moduleType).not.toBe("kitchen");
        expect(defaults.kitchenModuleRole, modulePackage.module.moduleType).toBeNull();
      }
    }
  });

  it("declares independent material parameters and slots for every FWM furniture module", () => {
    const requiredMaterialParams = [
      "bodyMaterialId",
      "frontMaterialId",
      "backMaterialId",
      "shelfMaterialId",
      "drawerBottomMaterialId",
      "plinthMaterialId",
      "worktopMaterialId"
    ];
    const requiredSlots = ["carcass", "front", "back", "shelf", "drawer_bottom", "plinth"];

    for (const modulePackage of extendedFurnitureModulePackages) {
      const parameterKeys = new Set(modulePackage.parameters.parameters.map((parameter) => parameter.key));
      for (const key of requiredMaterialParams) {
        expect(parameterKeys.has(key), `${modulePackage.module.moduleType} missing ${key}`).toBe(true);
      }

      const slotIds = new Set(modulePackage.materials.slots.map((slot) => slot.slotId));
      for (const slotId of requiredSlots) {
        expect(slotIds.has(slotId), `${modulePackage.module.moduleType} missing material slot ${slotId}`).toBe(true);
      }
    }
  });

  it("builds visible 3D geometry for every FWM module", () => {
    const catalog = getSystemSeedCatalog();

    for (const modulePackage of extendedFurnitureModulePackages) {
      const group = buildModulePackageGeometryFromPackage({ modulePackage, catalog });
      expect(meshCount(group), modulePackage.module.moduleType).toBeGreaterThan(0);
      expectFiniteBox(group);
      expect(group.userData.orientation.front.side).toBe("FRONT");
      expect(group.userData.orientation.back.side).toBe("BACK");
      expect(group.userData.worktopPlacement.backSide).toBe("BACK");
      expect(group.userData.worktopPlacement.rotatesWithModule).toBe(true);
      expect(group.userData.materialGroups.front).toBe("front");
      expect(group.userData.systemParameters.ifcClass).toBe("IfcFurniture");
    }
  }, 30_000);

  it("keeps all generated FWM mesh materials addressable and all plinths board-thin", () => {
    const catalog = getSystemSeedCatalog();
    const materialAssignments = {
      carcass: materialIdForFamily(catalog, "body"),
      front: materialIdForFamily(catalog, "front"),
      back: materialIdForFamily(catalog, "back"),
      shelf: materialIdForFamily(catalog, "body"),
      drawer_bottom: materialIdForFamily(catalog, "drawer_bottom") || catalog.kitchenDefaults.drawerBottomMaterialId,
      plinth: materialIdForFamily(catalog, "body"),
      worktop: materialIdForFamily(catalog, "worktop")
    };

    for (const modulePackage of extendedFurnitureModulePackages) {
      const params = {
        ...createDefaultModulePackageParameters(modulePackage),
        bodyMaterialId: materialAssignments.carcass,
        frontMaterialId: materialAssignments.front,
        backMaterialId: materialAssignments.back,
        shelfMaterialId: materialAssignments.shelf,
        drawerBottomMaterialId: materialAssignments.drawer_bottom,
        plinthMaterialId: materialAssignments.plinth,
        worktopMaterialId: materialAssignments.worktop,
        materialAssignments
      };
      const group = buildModulePackageGeometryFromPackage({ modulePackage, parameters: params, catalog });
      const allMeshes = meshes(group);
      expect(allMeshes.length, modulePackage.module.moduleType).toBeGreaterThan(0);

      for (const mesh of allMeshes) {
        if (mesh.userData.materialRole && !["hardware", "glass", "appliance", "soft"].includes(mesh.userData.materialRole)) {
          expect(mesh.userData.catalogMaterialId, `${modulePackage.module.moduleType}:${mesh.name}`).toBeTruthy();
        }
        if (mesh.name.includes("plinth")) {
          const dimensions = mesh.userData.dimensionsMm as { width?: number; height?: number; depth?: number } | undefined;
          expect(dimensions, `${modulePackage.module.moduleType}:${mesh.name}`).toBeTruthy();
          const boardThickness = Math.min(dimensions?.width ?? Infinity, dimensions?.height ?? Infinity, dimensions?.depth ?? Infinity);
          expect(boardThickness, `${modulePackage.module.moduleType}:${mesh.name}`).toBeLessThanOrEqual(24);
        }
      }
    }
  }, 30_000);

  it("normalizes edge-case parameters and keeps BOM pricing computable", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = makeDefaultKitchenContext(catalog);

    for (const modulePackage of extendedFurnitureModulePackages) {
      const defaults = createDefaultModulePackageParameters(modulePackage) as FwmFurnitureParams;
      const params = normalizeFwmFurnitureParams({
        ...defaults,
        width: 1,
        height: 1,
        depth: 1,
        drawerCount: 99,
        doorCount: 99,
        shelfCount: 99,
        boardThickness: 99,
        frontThicknessMm: -1,
        worktopThicknessMm: 500
      });
      const result = calculateFwmFurnitureBOM(params, ctx, catalog);
      expect(result.quoteBom.items.length, modulePackage.module.moduleType).toBeGreaterThan(0);
      expect(Number.isFinite(result.pricing.finalPrice)).toBe(true);
      for (const item of result.quoteBom.items) {
        expect(item.materialGroup, `${modulePackage.module.moduleType} ${item.id}`).toBeTruthy();
      }
    }
  }, 30_000);

  it("survives changing every declared parameter through low and high edge sets", () => {
    const catalog = getSystemSeedCatalog();
    for (const modulePackage of extendedFurnitureModulePackages) {
      for (const mode of ["low", "high"] as const) {
        const params = normalizeFwmFurnitureParams(createChangedParameterSet(modulePackage, mode, catalog));
        expect(params.type, `${modulePackage.module.moduleType} ${mode}`).toBe(modulePackage.module.moduleType);
        expect(Number.isFinite(params.width), `${modulePackage.module.moduleType} ${mode}`).toBe(true);
        expect(Number.isFinite(params.height), `${modulePackage.module.moduleType} ${mode}`).toBe(true);
        expect(Number.isFinite(params.depth), `${modulePackage.module.moduleType} ${mode}`).toBe(true);
        expect(params.widthMm, `${modulePackage.module.moduleType} ${mode}`).toBe(params.width);
        expect(params.heightMm, `${modulePackage.module.moduleType} ${mode}`).toBe(params.height);
        expect(params.depthMm, `${modulePackage.module.moduleType} ${mode}`).toBe(params.depth);
        expect(params.frontSide, `${modulePackage.module.moduleType} ${mode}`).toBe("FRONT");
        expect(params.backSide, `${modulePackage.module.moduleType} ${mode}`).toBe("BACK");
        expect(params.rightSide, `${modulePackage.module.moduleType} ${mode}`).toBe("RIGHT");
        expect(params.ifcClass, `${modulePackage.module.moduleType} ${mode}`).toBeTruthy();
        expect(params.bodyMaterialGroup, `${modulePackage.module.moduleType} ${mode}`).toBe("body");
      }
    }
  }, 30_000);

  it("syncs kitchen dimensions and catalog material thicknesses into kitchen FWM modules", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = resolveContext({
      ...makeDefaultKitchenContext(catalog),
      heightMm: 910,
      worktopDepthMm: 660,
      worktopFrontOffsetMm: 30,
      worktopBackOffsetMm: 10,
      worktopThicknessMm: 38,
      upperHeightMm: 760,
      upperDepthMm: 340,
      plinthHeightMm: 120,
      plinthDepthMm: 70
    });

    for (const modulePackage of extendedFurnitureModulePackages.filter((entry) => entry.module.tags?.includes("kitchen"))) {
      const params = createDefaultModulePackageParameters(modulePackage) as FwmFurnitureParams;
      applyKitchenContextToModuleParams(params, ctx, catalog, modulePackage);
      const normalized = normalizeFwmFurnitureParams(params);
      if (normalized.kitchenModuleRole === "top") {
        expect(normalized.height, modulePackage.module.moduleType).toBe(ctx.upperHeightMm);
        expect(normalized.depth, modulePackage.module.moduleType).toBe(ctx.upperDepthMm);
        expect(normalized.plinthHeight, modulePackage.module.moduleType).toBe(0);
      } else {
        expect(normalized.depth, modulePackage.module.moduleType).toBe(ctx.moduleDepthMm);
        if ((createDefaultModulePackageParameters(modulePackage).plinthHeight as number) > 0) {
          expect(normalized.plinthHeight, modulePackage.module.moduleType).toBe(ctx.plinthHeightMm);
        } else {
          expect(normalized.plinthHeight, modulePackage.module.moduleType).toBe(0);
        }
        if (normalized.requiresWorktop) {
          expect(normalized.worktopThicknessMm, modulePackage.module.moduleType).toBe(ctx.worktopThicknessMm);
        }
      }
      expect(normalized.bodyMaterialId, modulePackage.module.moduleType).toBe(ctx.corpusMaterialId);
      expect(normalized.frontMaterialId, modulePackage.module.moduleType).toBe(ctx.frontsMaterialId);
      expect(normalized.shelfMaterialId, modulePackage.module.moduleType).toBe(ctx.corpusMaterialId);
      expect(normalized.drawerBottomMaterialId, modulePackage.module.moduleType).toBe(ctx.drawerBottomMaterialId);
      if ((createDefaultModulePackageParameters(modulePackage).plinthHeight as number) > 0) {
        expect(normalized.plinthMaterialId, modulePackage.module.moduleType).toBe(catalog.kitchenDefaults.plinthMaterialId);
      } else {
        expect(normalized.plinthMaterialId, modulePackage.module.moduleType).toBe("");
      }
      expect(typeof normalized.backMaterialId, modulePackage.module.moduleType).toBe("string");
      const backMaterial = catalog.materials.find((material) => material.id === normalized.backMaterialId);
      expect(backMaterial?.boardFamily, modulePackage.module.moduleType).toBe("back");
      expect(normalized.backThickness, modulePackage.module.moduleType).toBe(backMaterial?.defaultThicknessMm);
    }
  }, 30_000);

  it("uses separate material parameters for body, fronts, backs, shelves, drawer bottoms and plinth boards", () => {
    const catalog = getSystemSeedCatalog();
    const bodyMaterialId = materialIdForFamily(catalog, "body");
    const plinthMaterialId = materialIdForFamily(catalog, "body", [bodyMaterialId]);
    const frontMaterialId = materialIdForFamily(catalog, "front");
    const backMaterialId = materialIdForFamily(catalog, "back");
    const drawerBottomMaterialId = materialIdForFamily(catalog, "drawer_bottom") || catalog.kitchenDefaults.drawerBottomMaterialId;
    const legComponentId = catalog.components.find((component) => component.componentType === "leg" && component.id === "cmp.leg.adjustable.100.black")?.id;
    const clipComponentId = catalog.components.find((component) => component.componentType === "plinth_clip" && component.id === "cmp.clip.plinth.standard")?.id;

    const drawerPackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_base_drawer_cabinet");
    const shelfPackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_base_shelf_cabinet");
    expect(drawerPackage).toBeTruthy();
    expect(shelfPackage).toBeTruthy();

    const drawerGroup = buildModulePackageGeometryFromPackage({
      modulePackage: drawerPackage!,
      catalog,
      parameters: {
        ...createDefaultModulePackageParameters(drawerPackage!),
        bodyMaterialId,
        frontMaterialId,
        backMaterialId,
        drawerBottomMaterialId,
        plinthMaterialId,
        legComponentId,
        clipComponentId,
        drawerCount: 2,
        plinthHeight: 120
      }
    });
    expect(getMeshNamed(drawerGroup, "left_side")?.userData.catalogMaterialId).toBe(bodyMaterialId);
    expect(getMeshNamed(drawerGroup, "drawer_front_1")?.userData.catalogMaterialId).toBe(frontMaterialId);
    expect(getMeshNamed(drawerGroup, "back")?.userData.catalogMaterialId).toBe(backMaterialId);
    expect(getMeshNamed(drawerGroup, "drawer_bottom_1")?.userData.catalogMaterialId).toBe(drawerBottomMaterialId);

    const plinth = getMeshNamed(drawerGroup, "plinth_front_board");
    expect(plinth?.userData.catalogMaterialId).toBe(plinthMaterialId || bodyMaterialId);
    expect(plinth?.userData.materialRole).toBe("plinth");
    expect(plinth?.userData.dimensionsMm.depth).toBeLessThanOrEqual(24);
    expect(getMeshNamed(drawerGroup, "plinth_left_return")).toBeNull();
    expect(getMeshNamed(drawerGroup, "plinth_right_return")).toBeNull();
    expect(getMeshNamed(drawerGroup, "leg_front_1")?.userData.componentId).toBe(legComponentId);
    expect(getMeshNamed(drawerGroup, "leg_front_1")?.userData.dimensionsMm).toMatchObject({ width: 39.392, height: 120, depth: 40 });
    expect(getMeshNamed(drawerGroup, "adjustable_foot_1")).toBeNull();
    expect(getMeshNamed(drawerGroup, "kickClip_front_1_collar")?.userData.componentId).toBe(clipComponentId);
    expect(getMeshNamed(drawerGroup, "kickClip_front_1_pad")?.userData.componentType).toBe("plinth_clip");
    expect(getMeshNamed(drawerGroup, "kickClip_front_1_arm")?.userData.dimensionsMm).toMatchObject({ width: 30, height: 35, depth: 25 });

    const shelfMaterialId = materialIdForFamily(catalog, "body", [bodyMaterialId, plinthMaterialId]);
    const shelfGroup = buildModulePackageGeometryFromPackage({
      modulePackage: shelfPackage!,
      catalog,
      parameters: {
        ...createDefaultModulePackageParameters(shelfPackage!),
        bodyMaterialId,
        frontMaterialId,
        backMaterialId,
        shelfMaterialId,
        shelfCount: 2
      }
    });
    expect(getMeshNamed(shelfGroup, "shelf_1")?.userData.catalogMaterialId).toBe(shelfMaterialId || bodyMaterialId);

    const bom = calculateFwmFurnitureBOM(
      drawerGroup.userData.modulePackageBuildParameters as FwmFurnitureParams,
      makeDefaultKitchenContext(catalog),
      catalog
    );
    expect(bom.quoteBom.items.find((item) => item.id === "drawer-bottoms")?.material?.catalogId).toBe(drawerBottomMaterialId);
    expect(bom.quoteBom.items.find((item) => item.id === "plinth-front-board")?.material?.catalogId).toBe(plinthMaterialId || bodyMaterialId);
    expect(bom.quoteBom.items.find((item) => item.id === "adjustable-legs")?.component?.catalogId).toBe(legComponentId);
    expect(bom.quoteBom.items.find((item) => item.id === "plinth-clips")?.component?.catalogId).toBe(clipComponentId);

    const visibleColors = new Set([
      renderColorHex(getMeshNamed(drawerGroup, "left_side")),
      renderColorHex(getMeshNamed(drawerGroup, "drawer_front_1")),
      renderColorHex(getMeshNamed(drawerGroup, "back")),
      renderColorHex(getMeshNamed(drawerGroup, "drawer_bottom_1")),
      renderColorHex(getMeshNamed(drawerGroup, "plinth_front_board"))
    ].filter(Boolean));
    expect(visibleColors.size).toBeGreaterThanOrEqual(3);
  });

  it("keeps the back panel rear face fixed and moves drawer boxes with the inner back face", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_base_drawer_cabinet");
    expect(modulePackage).toBeTruthy();
    const baseParams = {
      ...createDefaultModulePackageParameters(modulePackage!),
      type: "fwm_base_drawer_cabinet",
      width: 650,
      height: 860,
      depth: 560,
      drawerCount: 3,
      plinthHeight: 100,
      drawerBackGapMm: 10
    } as FwmFurnitureParams;

    const defaultBackGroup = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      catalog,
      parameters: normalizeFwmFurnitureParams({ ...baseParams, backThickness: 18 })
    });
    const mdfBackGroup = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      catalog,
      parameters: normalizeFwmFurnitureParams({ ...baseParams, backThickness: 3.3 })
    });

    const defaultBack = meshBoundsMm(getMeshNamed(defaultBackGroup, "back")!);
    const mdfBack = meshBoundsMm(getMeshNamed(mdfBackGroup, "back")!);
    const defaultDrawer = meshBoundsMm(getMeshNamed(defaultBackGroup, "drawer_bottom_1")!);
    const mdfDrawer = meshBoundsMm(getMeshNamed(mdfBackGroup, "drawer_bottom_1")!);

    expect(defaultBack.minZ).toBeCloseTo(-280, 4);
    expect(mdfBack.minZ).toBeCloseTo(-280, 4);
    expect(defaultBack.maxZ).toBeCloseTo(-262, 4);
    expect(mdfBack.maxZ).toBeCloseTo(-276.7, 4);
    expect(defaultDrawer.minZ - defaultBack.maxZ).toBeCloseTo(10, 4);
    expect(mdfDrawer.minZ - mdfBack.maxZ).toBeCloseTo(10, 4);
    expect(mdfDrawer.minZ).toBeLessThan(defaultDrawer.minZ);
    expect(mdfDrawer.maxZ).toBeCloseTo(defaultDrawer.maxZ, 4);
    expect(mdfDrawer.depth - defaultDrawer.depth).toBeCloseTo(14.7, 4);

    const bom = calculateFwmFurnitureBOM(
      mdfBackGroup.userData.modulePackageBuildParameters as FwmFurnitureParams,
      makeDefaultKitchenContext(catalog),
      catalog
    );
    expect(bom.quoteBom.items.find((item) => item.id === "drawer-bottoms")?.dimensionsMm?.length).toBeCloseTo(mdfDrawer.depth, 4);
  });

  it("builds an integrated dishwasher with a real front cladding panel and BOM item", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_built_in_dishwasher");
    expect(modulePackage).toBeTruthy();
    const frontMaterialId = materialIdForFamily(catalog, "front");
    const params = normalizeFwmFurnitureParams({
      ...createDefaultModulePackageParameters(modulePackage!),
      type: "fwm_built_in_dishwasher",
      width: 600,
      height: 862,
      depth: 590,
      plinthHeight: 120,
      frontMaterialId,
      worktopThicknessMm: 0,
      requiresWorktop: false
    } as FwmFurnitureParams);

    const group = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: params, catalog });
    const panel = getMeshNamed(group, "dishwasher_front_panel");
    const appliance = getMeshNamed(group, "dishwasher");

    expect(panel).toBeTruthy();
    expect(appliance).toBeTruthy();
    expect(panel?.userData.catalogMaterialId).toBe(frontMaterialId);
    expect(panel?.userData.materialRole).toBe("front");
    expect(panel?.userData.dimensionsMm.height).toBeGreaterThan(700);
    expect(panel?.position.z ?? 0).toBeGreaterThan(appliance?.position.z ?? 0);

    const bom = calculateFwmFurnitureBOM(params, makeDefaultKitchenContext(catalog), catalog);
    expect(bom.quoteBom.items.find((item) => item.id === "dishwasher-front-panel")?.material?.catalogId).toBe(frontMaterialId);
  });

  it("builds a full kitchen FWM assembly and reacts to changed kitchen context", () => {
    const catalog = getSystemSeedCatalog();
    const firstCtx = resolveContext({
      ...makeDefaultKitchenContext(catalog),
      heightMm: 860,
      worktopDepthMm: 620,
      worktopFrontOffsetMm: 20,
      worktopBackOffsetMm: 20,
      worktopThicknessMm: 38,
      upperHeightMm: 720,
      upperDepthMm: 320,
      plinthHeightMm: 100,
      plinthDepthMm: 50
    });
    const secondCtx = resolveContext({
      ...firstCtx,
      heightMm: 930,
      worktopDepthMm: 690,
      worktopFrontOffsetMm: 35,
      worktopBackOffsetMm: 15,
      worktopThicknessMm: 28,
      upperHeightMm: 780,
      upperDepthMm: 360,
      plinthHeightMm: 140,
      plinthDepthMm: 80
    });
    const kitchenPackages = extendedFurnitureModulePackages.filter((entry) => entry.module.tags?.includes("kitchen"));
    expect(kitchenPackages).toHaveLength(16);

    for (const modulePackage of kitchenPackages) {
      const paramsA = createDefaultModulePackageParameters(modulePackage) as FwmFurnitureParams;
      applyKitchenContextToModuleParams(paramsA, firstCtx, catalog, modulePackage);
      const normalizedA = normalizeFwmFurnitureParams(paramsA);

      const paramsB = createDefaultModulePackageParameters(modulePackage) as FwmFurnitureParams;
      applyKitchenContextToModuleParams(paramsB, secondCtx, catalog, modulePackage);
      const normalizedB = normalizeFwmFurnitureParams(paramsB);

      const role = normalizedB.kitchenModuleRole;
      if (role === "top") {
        expect(normalizedB.height, modulePackage.module.moduleType).toBe(secondCtx.upperHeightMm);
        expect(normalizedB.depth, modulePackage.module.moduleType).toBe(secondCtx.upperDepthMm);
      } else {
        expect(normalizedB.depth, modulePackage.module.moduleType).toBe(secondCtx.moduleDepthMm);
      }
      expect(normalizedB.depth, modulePackage.module.moduleType).not.toBe(normalizedA.depth);

      const group = buildModulePackageGeometryFromPackage({ modulePackage, parameters: normalizedB, catalog });
      group.rotation.y = Math.PI / 2;
      group.updateMatrixWorld(true);
      expectFiniteBox(group);
      expect(group.userData.orientation.front.direction, modulePackage.module.moduleType).toBe("+Z");
      expect(group.userData.orientation.back.direction, modulePackage.module.moduleType).toBe("-Z");
      expect(group.userData.worktopPlacement.backSide, modulePackage.module.moduleType).toBe("BACK");
      expect(group.userData.worktopPlacement.rotatesWithModule, modulePackage.module.moduleType).toBe(true);
      expect(staysOutsideKitchenWorktopFootprint(normalizedB), modulePackage.module.moduleType).toBe(role === "tall");
      if (usesKitchenWorktopBinding(normalizedB)) {
        expect(hasMeshNamed(group, /worktop/i), modulePackage.module.moduleType).toBe(true);
      }

      const result = calculateFwmFurnitureBOM(normalizedB, secondCtx, catalog);
      expect(result.quoteBom.items.length, modulePackage.module.moduleType).toBeGreaterThan(0);
      expect(Number.isFinite(result.pricing.finalPrice), modulePackage.module.moduleType).toBe(true);
    }
  }, 30_000);
});
