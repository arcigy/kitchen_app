import { describe, expect, it } from "vitest";
import { Box3, type Mesh, type Object3D } from "three";
import { getSystemSeedCatalog } from "../../core/catalog/catalog-repository";
import { validateFurnQuoteModulePackage } from "../../core/module-package/module-package-validation";
import { applyModuleParameterPreset, buildModulePackageGeometryFromPackage, createDefaultModulePackageParameters } from "../../core/module-package/runtime/module-runtime-adapter";
import type { FurnQuoteModulePackage } from "../../core/module-package/module-package-types";
import { applyKitchenContextToModuleParams } from "../../layout/kitchenMaterialSync";
import { makeDefaultKitchenContext, resolveContext } from "../../layout/kitchenContext";
import { staysOutsideKitchenWorktopFootprint, usesKitchenWorktopBinding } from "../../layout/kitchenModuleRules";
import { DELFI_CATALOG_COVERAGE } from "../../system/catalog-templates/delfiModuleCoverage";
import { extendedFurnitureModulePackages } from "../../system/module-packages/extendedFurniture";
import { calculateFwmFurnitureBOM } from "./calculation";
import baseCornerChamferedGroundTruth from "./data/baseCornerChamferedGroundTruth.compact.json";
import { FWM_DRAWER_SYSTEM_PRESETS } from "./drawerSystemPresets";
import { FWM_FURNITURE_SPECS } from "./definitions";
import { normalizeFwmFurnitureParams, validateFwmFurniture, type FwmFurnitureParams } from "./types";

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

const delfiActiveRuntimeModuleTypes = [
  "fwm_catalog_base_corner",
  "fwm_catalog_base_doors",
  "fwm_catalog_base_drawers",
  "fwm_catalog_base_open_end",
  "fwm_catalog_tall_cabinet",
  "fwm_tall_open_end",
  "fwm_catalog_wall_cabinet",
  "fwm_catalog_wall_open_end"
] as const;

const legacyMaterialGroups = ["body", "carcass", "shelf"] as const;
const canonicalBoardMaterialGroups = ["corpus", "front", "back", "plinth", "worktop", "drawer_bottom"] as const;
const canonicalMeshMaterialGroups = [...canonicalBoardMaterialGroups, "hardware", "appliance", "glass", "soft"] as const;

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

function getObjectNamed(root: { traverse: (visitor: (object: unknown) => void) => void }, name: string) {
  let found = null as Object3D | null;
  root.traverse((object) => {
    const item = object as Object3D;
    if (item.name === name) found = item;
  });
  return found;
}

function getMeshByBoardName(root: { traverse: (visitor: (object: unknown) => void) => void }, boardName: string) {
  let found = null as Mesh | null;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.userData.boardName === boardName) found = mesh;
  });
  return found;
}

function objectBoundsMm(object: Mesh | { updateMatrixWorld: (force?: boolean) => void }) {
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object as Mesh);
  return {
    minX: box.min.x * 1000,
    maxX: box.max.x * 1000,
    width: (box.max.x - box.min.x) * 1000,
    minY: box.min.y * 1000,
    maxY: box.max.y * 1000,
    height: (box.max.y - box.min.y) * 1000,
    minZ: box.min.z * 1000,
    maxZ: box.max.z * 1000,
    depth: (box.max.z - box.min.z) * 1000
  };
}

function unapprovedBoardOverlaps(root: { traverse: (visitor: (object: unknown) => void) => void }) {
  const toleranceMm = 2;
  const boardMeshes = meshes(root).filter((mesh) => {
    if (mesh.visible === false || mesh.userData.hiddenByDefault === true) return false;
    return canonicalBoardMaterialGroups.includes(mesh.userData.materialGroup as typeof canonicalBoardMaterialGroups[number]);
  });
  const boxes = boardMeshes.map((mesh) => ({ mesh, box: new Box3().setFromObject(mesh) }));
  const overlaps: string[] = [];

  for (let index = 0; index < boxes.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < boxes.length; otherIndex += 1) {
      const a = boxes[index]!;
      const b = boxes[otherIndex]!;
      const aAllow = (a.mesh.userData.allowOverlapWith as string[] | undefined) ?? [];
      const bAllow = (b.mesh.userData.allowOverlapWith as string[] | undefined) ?? [];
      if (aAllow.includes(b.mesh.name) || bAllow.includes(a.mesh.name)) continue;

      const overlapMm = {
        x: (Math.min(a.box.max.x, b.box.max.x) - Math.max(a.box.min.x, b.box.min.x)) * 1000,
        y: (Math.min(a.box.max.y, b.box.max.y) - Math.max(a.box.min.y, b.box.min.y)) * 1000,
        z: (Math.min(a.box.max.z, b.box.max.z) - Math.max(a.box.min.z, b.box.min.z)) * 1000
      };
      if (overlapMm.x <= toleranceMm || overlapMm.y <= toleranceMm || overlapMm.z <= toleranceMm) continue;
      overlaps.push(`${a.mesh.name}/${b.mesh.name}:${Math.round(overlapMm.x)}x${Math.round(overlapMm.y)}x${Math.round(overlapMm.z)}mm`);
    }
  }

  return overlaps;
}

function visibleObjectBoundsMm(object: Object3D) {
  object.updateMatrixWorld(true);
  const box = new Box3();
  let hasVisiblePart = false;
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || child.visible === false || child.userData.hiddenByDefault === true) return;
    box.union(new Box3().setFromObject(child));
    hasVisiblePart = true;
  });
  if (!hasVisiblePart) box.setFromObject(object);
  return {
    minX: box.min.x * 1000,
    maxX: box.max.x * 1000,
    width: (box.max.x - box.min.x) * 1000,
    minY: box.min.y * 1000,
    maxY: box.max.y * 1000,
    height: (box.max.y - box.min.y) * 1000,
    minZ: box.min.z * 1000,
    maxZ: box.max.z * 1000,
    depth: (box.max.z - box.min.z) * 1000
  };
}

function rawGroundTruthBoundsMm(snapshot: { primitives: Array<{ params?: { verticesMm?: Array<{ x?: number; y?: number; z?: number }> } }> }) {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (const primitive of snapshot.primitives) {
    for (const vertex of primitive.params?.verticesMm ?? []) {
      if (typeof vertex.x === "number") xs.push(vertex.x);
      if (typeof vertex.y === "number") ys.push(vertex.y);
      if (typeof vertex.z === "number") zs.push(vertex.z);
    }
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    width: Math.max(...xs) - Math.min(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    height: Math.max(...ys) - Math.min(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    depth: Math.max(...zs) - Math.min(...zs)
  };
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
  it("keeps drawer system deduction preset values positive", () => {
    for (const brandPresets of Object.values(FWM_DRAWER_SYSTEM_PRESETS)) {
      for (const preset of Object.values(brandPresets)) {
        if (!preset) continue;
        expect(preset.bottomDepthDeductionMm).toBeGreaterThanOrEqual(0);
        expect(preset.bottomWidthDeductionMm).toBeGreaterThanOrEqual(0);
        expect(preset.backWidthDeductionMm).toBeGreaterThanOrEqual(0);
        expect(preset.cutleryInsertWidthDeductionMm).toBeGreaterThanOrEqual(0);
        expect(preset.cutleryInsertDepthDeductionMm).toBeGreaterThanOrEqual(0);
        expect(preset.innerDrawerFrontDeductionMm).toBeGreaterThanOrEqual(0);
        expect(preset.innerDrawerCrossRailDeductionMm).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("declares every requested module as a valid FurnQuote package", () => {
    expect(FWM_FURNITURE_SPECS).toHaveLength(63);
    expect(extendedFurnitureModulePackages).toHaveLength(63);

    for (const modulePackage of extendedFurnitureModulePackages) {
      expect(() => validateFurnQuoteModulePackage(modulePackage)).not.toThrow();
      expect(modulePackage.format).toBe("furnquote-module");
      expect(modulePackage.geometry.mode).toBe("trusted-runtime");
      if (modulePackage.geometry.mode !== "trusted-runtime") throw new Error("FWM package must use trusted runtime geometry.");
      expect(modulePackage.compatibility.requiredRuntimeBuilderKeys).toContain(modulePackage.geometry.runtimeBuilderKey);
      const parameterKeys = new Set(modulePackage.parameters.parameters.map((parameter) => parameter.key));
      const expectedRequiredKeys = modulePackage.module.moduleType === "fwm_catalog_wall_open_end"
        ? [...requiredSystemParams, ...requiredIfcParams, ...requiredOrientationParams, "bodyMaterialGroup"]
        : [...requiredSystemParams, ...requiredIfcParams, ...requiredOrientationParams, ...requiredMaterialGroupParams];
      for (const key of expectedRequiredKeys) {
        expect(parameterKeys.has(key), `${modulePackage.module.moduleType} missing ${key}`).toBe(true);
      }
      const defaults = createDefaultModulePackageParameters(modulePackage);
      if (modulePackage.module.moduleType === "fwm_catalog_base_corner") {
        expect(defaults.frontChamferMm).toBe(200);
        expect(defaults.backChamferMm).toBe(0);
      }
      expect(defaults.frontSide).toBe("FRONT");
      expect(defaults.backSide).toBe("BACK");
      expect(defaults.leftSide).toBe("LEFT");
      expect(defaults.rightSide).toBe("RIGHT");
      expect(defaults.frontDirection).toBe("+Z");
      expect(defaults.backDirection).toBe("-Z");
      expect(defaults.assemblyContext).toBe(modulePackage.module.tags?.includes("kitchen") ? "kitchen" : defaults.assemblyContext);
      if (modulePackage.module.tags?.includes("kitchen")) {
        expect(defaults.roomCategory).toBe("kitchen");
        if (defaults.kitchenModuleRole !== null) expect(["low", "top", "tall"]).toContain(defaults.kitchenModuleRole);
      } else {
        expect(defaults.roomCategory, modulePackage.module.moduleType).toBeTruthy();
        expect(defaults.roomCategory, modulePackage.module.moduleType).not.toBe("kitchen");
        expect(defaults.kitchenModuleRole, modulePackage.module.moduleType).toBeNull();
      }
    }
  });

  it("keeps the source catalog audit covered by neutral parametric module families", () => {
    const packageTypes = new Set(extendedFurnitureModulePackages.map((entry) => entry.module.moduleType));
    const historicalRuntimeAliases: Record<string, string> = {
      base_corner: "fwm_catalog_base_corner",
      base_doors: "fwm_catalog_base_doors",
      base_drawers: "fwm_catalog_base_drawers",
      base_sink: "fwm_catalog_base_sink",
      base_appliance: "fwm_catalog_base_appliance",
      base_open_end: "fwm_catalog_base_open_end",
      tall_cabinet: "fwm_catalog_tall_cabinet",
      wall_cabinet: "fwm_catalog_wall_cabinet",
      wall_open_end: "fwm_catalog_wall_open_end",
      suspended_unit: "fwm_catalog_suspended_unit",
      worktop_surface: "fwm_catalog_worktop_surface",
      worktop_accessory: "fwm_catalog_worktop_accessory",
      cladding_panel: "fwm_catalog_cladding_panel",
      free_shelf: "fwm_catalog_free_shelf",
      trim_component: "fwm_catalog_trim_component",
      lighting_accessory: "fwm_catalog_lighting_accessory",
      front_component: "fwm_catalog_front_component",
      hardware_accessory: "fwm_catalog_hardware_accessory"
    };
    expect(DELFI_CATALOG_COVERAGE).toHaveLength(18);
    for (const entry of DELFI_CATALOG_COVERAGE) {
      const runtimeType = historicalRuntimeAliases[entry.targetModuleType] ?? entry.targetModuleType;
      expect(packageTypes.has(runtimeType), `${entry.id} missing runtime ${runtimeType}`).toBe(true);
      expect(entry.requiredParameters.length, entry.id).toBeGreaterThan(0);
      expect(entry.pdfPages, entry.id).toBeTruthy();
    }
  });

  it("exposes neutral catalog parameters on every source-catalog FWM family", () => {
    const requiredCatalogParams = [
      "catalogCode",
      "side",
      "endingSide",
      "endingShape",
      "cornerShape",
      "frontType",
      "openingMode",
      "applianceKind",
      "shape",
      "mountingMode",
      "angleDeg",
      "cornerRadiusMm",
      "chamferMm",
      "cutoutWidthMm",
      "cutoutDepthMm"
    ];

    const catalogPackages = extendedFurnitureModulePackages.filter((entry) => entry.module.moduleType.startsWith("fwm_catalog_"));
    expect(catalogPackages).toHaveLength(18);
    for (const modulePackage of catalogPackages) {
      const parameterKeys = new Set(modulePackage.parameters.parameters.map((parameter) => parameter.key));
      const expectedCatalogParams = modulePackage.module.moduleType === "fwm_catalog_wall_open_end"
        ? ["catalogCode", "side", "endingSide", "endingShape", "shape", "mountingMode", "cornerRadiusMm", "chamferMm"]
        : requiredCatalogParams;
      for (const key of expectedCatalogParams) {
        expect(parameterKeys.has(key), `${modulePackage.module.moduleType} missing ${key}`).toBe(true);
      }
      const defaults = normalizeFwmFurnitureParams(createDefaultModulePackageParameters(modulePackage) as FwmFurnitureParams);
      expect(defaults.catalogCode, modulePackage.module.moduleType).toBe("");
      if (modulePackage.module.moduleType !== "fwm_catalog_wall_open_end") {
        expect(defaults.frontType, modulePackage.module.moduleType).toBeTruthy();
      }
      expect(defaults.mountingMode, modulePackage.module.moduleType).toBeTruthy();
    }
  });

  it("validates flat catalog families without carcass clearance rules", () => {
    const flatTypes = new Set([
      "fwm_catalog_worktop_surface",
      "fwm_catalog_worktop_accessory",
      "fwm_catalog_cladding_panel",
      "fwm_catalog_free_shelf",
      "fwm_catalog_trim_component",
      "fwm_catalog_front_component",
      "fwm_catalog_hardware_accessory"
    ]);

    for (const modulePackage of extendedFurnitureModulePackages.filter((entry) => flatTypes.has(entry.module.moduleType))) {
      const defaults = createDefaultModulePackageParameters(modulePackage) as FwmFurnitureParams;
      expect(validateFwmFurniture(defaults), modulePackage.module.moduleType).toEqual([]);
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
    const requiredSlots = ["corpus", "front", "back", "plinth"];

    for (const modulePackage of extendedFurnitureModulePackages) {
      const parameterKeys = new Set(modulePackage.parameters.parameters.map((parameter) => parameter.key));
      const expectedMaterialParams = modulePackage.module.moduleType === "fwm_catalog_wall_open_end"
        ? ["bodyMaterialId"]
        : requiredMaterialParams;
      for (const key of expectedMaterialParams) {
        expect(parameterKeys.has(key), `${modulePackage.module.moduleType} missing ${key}`).toBe(true);
      }
      if (modulePackage.module.moduleType === "fwm_catalog_wall_open_end") {
        for (const key of ["frontMaterialId", "backMaterialId", "shelfMaterialId", "drawerBottomMaterialId", "plinthMaterialId", "worktopMaterialId"]) {
          expect(parameterKeys.has(key), `${modulePackage.module.moduleType} must not own ${key}`).toBe(false);
        }
      }

      const slotIds = new Set(modulePackage.materials.slots.map((slot) => slot.slotId));
      const expectedSlots = modulePackage.module.moduleType === "fwm_catalog_wall_open_end" ? ["corpus"] : requiredSlots;
      for (const slotId of expectedSlots) {
        expect(slotIds.has(slotId), `${modulePackage.module.moduleType} missing material slot ${slotId}`).toBe(true);
      }
      if (modulePackage.module.moduleType === "fwm_catalog_wall_open_end") {
        expect(slotIds).toEqual(new Set(["corpus"]));
      }
      expect(slotIds.has("carcass"), `${modulePackage.module.moduleType} must use canonical corpus slot`).toBe(false);
      expect(slotIds.has("shelf"), `${modulePackage.module.moduleType} shelves must use canonical corpus slot`).toBe(false);
      const supportsDrawers =
        Number(createDefaultModulePackageParameters(modulePackage).drawerCount ?? 0) > 0 ||
        modulePackage.module.moduleType === "fwm_catalog_tall_cabinet";
      expect(slotIds.has("drawer_bottom"), `${modulePackage.module.moduleType} drawer_bottom slot`).toBe(supportsDrawers);
      expect(modulePackage.parameterPresets, `${modulePackage.module.moduleType} parameterPresets`).toBeTruthy();
      expect(Array.isArray(modulePackage.parameterPresets?.freeParameterKeys), `${modulePackage.module.moduleType} freeParameterKeys`).toBe(true);
      expect(Array.isArray(modulePackage.parameterPresets?.presets), `${modulePackage.module.moduleType} presets`).toBe(true);
      expect(modulePackage.internalEditing, `${modulePackage.module.moduleType} internalEditing`).toBeTruthy();
      expect(Array.isArray(modulePackage.internalEditing?.submoduleTools), `${modulePackage.module.moduleType} internal submoduleTools`).toBe(true);
      expect(Array.isArray(modulePackage.internalEditing?.boardOperations), `${modulePackage.module.moduleType} internal boardOperations`).toBe(true);
    }
  });

  it("builds lower and tall open/end niche modules with real shelf and ending geometry", () => {
    const catalog = getSystemSeedCatalog();
    const lowerPackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_open_end");
    const tallPackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_tall_open_end");
    expect(lowerPackage).toBeTruthy();
    expect(tallPackage).toBeTruthy();

    const lowerDefaults = createDefaultModulePackageParameters(lowerPackage!) as FwmFurnitureParams;
    expect(lowerDefaults.requiresWorktop).toBe(true);
    expect(lowerDefaults.shape).toBe("straight");
    expect(lowerDefaults.endingSide).toBe("none");
    const lowerChamfered = buildModulePackageGeometryFromPackage({
      modulePackage: lowerPackage!,
      parameters: {
        ...lowerDefaults,
        shape: "chamfered",
        endingSide: "right",
        shelfCount: 2,
        width: 300,
        depth: 530,
        height: 722,
        heightCarcass: 684
      },
      catalog
    });
    expect(hasMeshNamed(lowerChamfered, /worktop/i)).toBe(false);
    expect(hasMeshNamed(lowerChamfered, /open_niche_chamfered_ending_panel/i)).toBe(true);
    expect(meshes(lowerChamfered).filter((mesh) => /^open_niche_shelf_\d+$/.test(mesh.name))).toHaveLength(2);
    expect(meshes(lowerChamfered).some((mesh) => /door|drawer/i.test(mesh.name))).toBe(false);
    expect(meshes(lowerChamfered).some((mesh) => mesh.userData.edgeBandingStrategy === "explicit_visible_edges")).toBe(true);
    expect(objectBoundsMm(lowerChamfered).width).toBeCloseTo(300, 1);
    expect(objectBoundsMm(lowerChamfered).depth).toBeCloseTo(530, 1);
    expect(objectBoundsMm(lowerChamfered).height).toBeCloseTo(684, 1);
    for (const mesh of meshes(lowerChamfered).filter((entry) => ["corpus", "back", "plinth"].includes(String(entry.userData.materialGroup)))) {
      expect(["corpus", "back", "plinth"]).toContain(mesh.userData.materialSlotId);
      expect(["width", "height", "depth"]).toContain(mesh.userData.grainAlong);
      expect(["body", "carcass", "shelf"]).not.toContain(mesh.userData.materialGroup);
      expect(["body", "carcass", "shelf"]).not.toContain(mesh.userData.materialSlotId);
    }

    const lowerRounded = buildModulePackageGeometryFromPackage({
      modulePackage: lowerPackage!,
      parameters: { ...lowerDefaults, shape: "rounded", endingSide: "left", shelfCount: 1, heightCarcass: 684 },
      catalog
    });
    expect(hasMeshNamed(lowerRounded, /open_niche_rounded_ending_panel/i)).toBe(true);
    expect(meshes(lowerRounded).filter((mesh) => /^open_niche_shelf_\d+$/.test(mesh.name))).toHaveLength(1);

    const tallDefaults = createDefaultModulePackageParameters(tallPackage!) as FwmFurnitureParams;
    expect(tallDefaults.requiresWorktop).toBe(false);
    expect(tallDefaults.height).toBe(1480);
    expect(tallDefaults.shelfCount).toBe(4);
    const tallRounded = buildModulePackageGeometryFromPackage({
      modulePackage: tallPackage!,
      parameters: { ...tallDefaults, shape: "rounded", endingSide: "right", shelfCount: 4 },
      catalog
    });
    expect(hasMeshNamed(tallRounded, /worktop/i)).toBe(false);
    expect(hasMeshNamed(tallRounded, /open_niche_rounded_ending_panel/i)).toBe(true);
    expect(meshes(tallRounded).filter((mesh) => /^open_niche_shelf_\d+$/.test(mesh.name))).toHaveLength(4);
    expect(objectBoundsMm(tallRounded).width).toBeCloseTo(300, 1);
    expect(objectBoundsMm(tallRounded).depth).toBeCloseTo(560, 1);
    expect(objectBoundsMm(tallRounded).height).toBeCloseTo(1480, 0);
  });

  it("syncs open/end module material colors and metadata from the kitchen group", () => {
    const catalog = getSystemSeedCatalog();
    const corpusMaterialId = "mat.demos.142391";
    const backMaterialId = "mat.demos.116884";
    expect(catalog.kitchenDefaults.carcassMaterialId).toBe(corpusMaterialId);
    expect(catalog.kitchenDefaults.plinthMaterialId).toBe(corpusMaterialId);
    expect(catalog.kitchenDefaults.backPanelMaterialId).toBe(backMaterialId);
    expect(catalog.kitchenDefaults.defaultBackPanelThicknessMm).toBe(10);
    expect(catalog.materials.find((material) => material.id === corpusMaterialId)?.boardFamily).toBe("body");
    expect(catalog.materials.find((material) => material.id === backMaterialId)?.boardFamily).toBe("back");
    const ctx = resolveContext({
      ...makeDefaultKitchenContext(catalog),
      corpusMaterialId,
      backMaterialId,
      moduleDepthMm: 590,
      upperDepthMm: 360,
      heightMm: 900,
      moduleHeightMm: 862,
      upperHeightMm: 720,
      plinthHeightMm: 120,
      plinthDepthMm: 70
    });

    for (const moduleType of ["fwm_catalog_base_open_end", "fwm_tall_open_end", "fwm_catalog_wall_open_end"]) {
      const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === moduleType);
      expect(modulePackage).toBeTruthy();
      const params = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
      applyKitchenContextToModuleParams(params, ctx, catalog, modulePackage!);
      const normalized = normalizeFwmFurnitureParams(params);
      const group = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: normalized, catalog });
      const moduleMeshes = meshes(group);

      for (const mesh of moduleMeshes.filter((entry) => entry.userData.materialGroup === "corpus")) {
        expect(mesh.userData.materialSlotId, `${moduleType}:${mesh.name}`).toBe("corpus");
        expect(mesh.userData.catalogMaterialId, `${moduleType}:${mesh.name}`).toBe(corpusMaterialId);
        expect(mesh.userData.renderColorHex, `${moduleType}:${mesh.name}`).toBe("#eeeae0");
      }
      for (const mesh of moduleMeshes.filter((entry) => entry.userData.materialGroup === "back")) {
        expect(mesh.userData.materialSlotId, `${moduleType}:${mesh.name}`).toBe("back");
        expect(mesh.userData.catalogMaterialId, `${moduleType}:${mesh.name}`).toBe(backMaterialId);
        expect(mesh.userData.renderColorHex, `${moduleType}:${mesh.name}`).toBe("#eeeae0");
      }
      expect(moduleMeshes.some((mesh) => ["body", "carcass", "shelf"].includes(String(mesh.userData.materialGroup)))).toBe(false);
      expect(moduleMeshes.some((mesh) => ["body", "carcass", "shelf"].includes(String(mesh.userData.materialSlotId)))).toBe(false);

      if (moduleType === "fwm_catalog_wall_open_end") {
        expect(normalized.height, moduleType).toBe(ctx.upperHeightMm);
        expect(normalized.depth, moduleType).toBe(ctx.upperDepthMm);
        expect(objectBoundsMm(group).height, moduleType).toBeCloseTo(ctx.upperHeightMm, 0);
        expect(objectBoundsMm(group).depth, moduleType).toBeCloseTo(ctx.upperDepthMm, 0);
      }
    }
  });

  it("renders DELFI kitchen modules with canonical material slots and kitchen-synced colors", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = resolveContext({
      ...makeDefaultKitchenContext(catalog),
      corpusMaterialId: materialIdForFamily(catalog, "body"),
      frontsMaterialId: materialIdForFamily(catalog, "front"),
      backMaterialId: materialIdForFamily(catalog, "back"),
      drawerBottomMaterialId: materialIdForFamily(catalog, "drawer_bottom"),
      worktopMaterialId: materialIdForFamily(catalog, "worktop")
    });
    const expectedMaterialBySlot: Record<string, string> = {
      corpus: ctx.corpusMaterialId,
      front: ctx.frontsMaterialId,
      back: ctx.backMaterialId,
      drawer_bottom: ctx.drawerBottomMaterialId,
      plinth: catalog.kitchenDefaults.plinthMaterialId ?? ctx.corpusMaterialId,
      worktop: ctx.worktopMaterialId
    };
    const observedColorBySlot: Record<string, string> = {};
    const packages = extendedFurnitureModulePackages.filter((modulePackage) =>
      delfiActiveRuntimeModuleTypes.includes(modulePackage.module.moduleType as typeof delfiActiveRuntimeModuleTypes[number])
    );

    expect(packages.map((modulePackage) => modulePackage.module.moduleType).sort()).toEqual([...delfiActiveRuntimeModuleTypes].sort());

    for (const modulePackage of packages) {
      const params = createDefaultModulePackageParameters(modulePackage) as FwmFurnitureParams;
      applyKitchenContextToModuleParams(params, ctx, catalog, modulePackage);
      const group = buildModulePackageGeometryFromPackage({
        modulePackage,
        catalog,
        parameters: normalizeFwmFurnitureParams(params)
      });

      for (const mesh of meshes(group)) {
        const materialGroup = String(mesh.userData.materialGroup ?? "");
        const materialSlotId = String(mesh.userData.materialSlotId ?? "");
        expect(materialGroup, `${modulePackage.module.moduleType}:${mesh.name}:materialGroup`).toBeTruthy();
        expect(materialSlotId, `${modulePackage.module.moduleType}:${mesh.name}:materialSlotId`).toBeTruthy();
        expect(legacyMaterialGroups).not.toContain(materialGroup as typeof legacyMaterialGroups[number]);
        expect(legacyMaterialGroups).not.toContain(materialSlotId as typeof legacyMaterialGroups[number]);
        expect(canonicalMeshMaterialGroups, `${modulePackage.module.moduleType}:${mesh.name}:canonical group`).toContain(materialGroup as typeof canonicalMeshMaterialGroups[number]);

        if (materialGroup === "hardware") {
          expect(materialSlotId, `${modulePackage.module.moduleType}:${mesh.name}:hardware slot`).toBe("hardware");
          expect(renderColorHex(mesh), `${modulePackage.module.moduleType}:${mesh.name}:hardware color`).toBeTruthy();
          continue;
        }

        if (materialGroup === "appliance" || materialGroup === "glass" || materialGroup === "soft") continue;

        expect(canonicalBoardMaterialGroups, `${modulePackage.module.moduleType}:${mesh.name}:board group`).toContain(materialGroup as typeof canonicalBoardMaterialGroups[number]);
        expect(materialSlotId, `${modulePackage.module.moduleType}:${mesh.name}:slot follows group`).toBe(materialGroup);
        expect(["width", "height", "depth"], `${modulePackage.module.moduleType}:${mesh.name}:grain`).toContain(mesh.userData.grainAlong);

        const expectedMaterialId = expectedMaterialBySlot[materialSlotId];
        if (expectedMaterialId) {
          expect(mesh.userData.catalogMaterialId, `${modulePackage.module.moduleType}:${mesh.name}:catalog material`).toBe(expectedMaterialId);
          const color = renderColorHex(mesh);
          expect(color, `${modulePackage.module.moduleType}:${mesh.name}:render color`).toBeTruthy();
          if (observedColorBySlot[materialSlotId]) {
            expect(color, `${modulePackage.module.moduleType}:${mesh.name}:shared render color`).toBe(observedColorBySlot[materialSlotId]);
          } else {
            observedColorBySlot[materialSlotId] = color;
          }
        }
      }
    }
  });

  it("has no unapproved board overlaps in active DELFI runtime modules", () => {
    const catalog = getSystemSeedCatalog();
    const packages = extendedFurnitureModulePackages.filter((modulePackage) =>
      delfiActiveRuntimeModuleTypes.includes(modulePackage.module.moduleType as typeof delfiActiveRuntimeModuleTypes[number])
    );

    for (const modulePackage of packages) {
      const params = normalizeFwmFurnitureParams(createDefaultModulePackageParameters(modulePackage) as FwmFurnitureParams);
      const group = buildModulePackageGeometryFromPackage({ modulePackage, catalog, parameters: params });
      expect(unapprovedBoardOverlaps(group), modulePackage.module.moduleType).toEqual([]);
    }
  });

  it("builds the upper open end wall module as chamfered or rounded geometry", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_wall_open_end");
    expect(modulePackage).toBeTruthy();

    const parameterKeys = new Set(modulePackage!.parameters.parameters.map((parameter) => parameter.key));
    for (const key of ["drawerCount", "doorCount", "hasPlinth", "hasWorktop", "frontChamferMm", "backChamferMm", "cutoutWidthMm", "cutoutDepthMm", "powerW", "opened", "drawerSystemPricePerSet", "drawerSystemPriceWithMargin", "shelfGaps", "frontMaterialId", "backMaterialId", "shelfMaterialId", "drawerBottomMaterialId", "plinthMaterialId", "worktopMaterialId", "handleComponentId", "hingeComponentId", "runnerComponentId", "plinthHeight", "plinthSetbackMm", "backThickness", "shelfThickness"]) {
      expect(parameterKeys.has(key), `wall open end must not expose ${key}`).toBe(false);
    }
    expect(parameterKeys.has("shelfCount"), "wall open end must expose shelfCount").toBe(true);
    const userControls = new Set(modulePackage!.ui.controls.map((control) => control.parameterKey));
    expect([...userControls].sort()).toEqual([
      "boardThickness",
      "bodyMaterialId",
      "chamferMm",
      "cornerRadiusMm",
      "depth",
      "endingShape",
      "height",
      "shelfCount",
      "side",
      "width"
    ]);

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    expect(defaults.kitchenModuleRole).toBe("top");
    expect(defaults.requiresWorktop).toBe(false);
    expect(defaults.hasPlinth).toBeUndefined();
    expect(defaults.hasWorktop).toBeUndefined();
    expect(defaults.endingShape).toBe("chamfered");
    expect(defaults.side).toBe("right");
    expect(defaults.shelfCount).toBe(2);

    const slotIds = modulePackage!.materials.slots.map((slot) => slot.slotId);
    expect(slotIds).toEqual(["corpus"]);

    const chamfered = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...defaults, endingShape: "chamfered", side: "right", width: 300, height: 300, depth: 330 },
      catalog
    });
    const rounded = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...defaults, endingShape: "rounded", side: "right", width: 300, height: 300, depth: 330 },
      catalog
    });

    expect(hasMeshNamed(chamfered, /worktop/i)).toBe(false);
    expect(hasMeshNamed(chamfered, /plinth/i)).toBe(false);
    expect(hasMeshNamed(chamfered, /door|drawer/i)).toBe(false);
    expect(meshes(chamfered).map((mesh) => mesh.name).sort()).toEqual([
      "wall_open_end_bottom_shelf",
      "wall_open_end_rear_board",
      "wall_open_end_shelf_1",
      "wall_open_end_shelf_2",
      "wall_open_end_side_rear_board",
      "wall_open_end_top_shelf"
    ]);
    expect(hasMeshNamed(chamfered, /wall_open_end_chamfered_side_panel/i)).toBe(false);
    expect(hasMeshNamed(rounded, /wall_open_end_rounded_side_panel/i)).toBe(false);
    expect(meshes(chamfered).filter((mesh) => /^wall_open_end_shelf_\d+$/.test(mesh.name))).toHaveLength(2);

    const chamferedTop = getMeshNamed(chamfered, "wall_open_end_top_shelf");
    const roundedTop = getMeshNamed(rounded, "wall_open_end_top_shelf");
    expect(chamferedTop?.userData.materialGroup).toBe("corpus");
    expect(chamferedTop?.userData.materialSlotId).toBe("corpus");
    expect(chamferedTop?.userData.grainAlong).toBeTruthy();
    expect(chamferedTop?.userData.edgeBandingStrategy).toBe("explicit_visible_edges");
    expect(Array.isArray(chamferedTop?.userData.edgeBanding)).toBe(true);
    expect(chamferedTop?.userData.revitPlanProfileMm).toEqual([
      { x: -132, y: 0, z: -147 },
      { x: 150, y: 0, z: -147 },
      { x: 150, y: 0, z: 45 },
      { x: 30, y: 0, z: 165 },
      { x: -132, y: 0, z: 165 }
    ]);
    const rearBoardBounds = objectBoundsMm(getMeshNamed(chamfered, "wall_open_end_rear_board")!);
    const sideRearBounds = objectBoundsMm(getMeshNamed(chamfered, "wall_open_end_side_rear_board")!);
    const bottomBounds = objectBoundsMm(getMeshNamed(chamfered, "wall_open_end_bottom_shelf")!);
    expect(sideRearBounds.minZ).toBeGreaterThanOrEqual(rearBoardBounds.maxZ - 0.5);
    expect(bottomBounds.minZ).toBeGreaterThanOrEqual(rearBoardBounds.maxZ - 0.5);
    expect(bottomBounds.minX).toBeGreaterThanOrEqual(sideRearBounds.maxX - 0.5);
    expect(((roundedTop?.userData.revitPlanProfileMm as unknown[]) ?? []).length).toBeGreaterThan(((chamferedTop?.userData.revitPlanProfileMm as unknown[]) ?? []).length);
    expect(meshes(chamfered).every((mesh) => mesh.userData.materialGroup === "corpus")).toBe(true);
    expect(objectBoundsMm(chamfered).height).toBeCloseTo(300, 0);
    expect(objectBoundsMm(chamfered).width).toBeCloseTo(300, 0);
    expect(objectBoundsMm(chamfered).depth).toBeCloseTo(330, 0);
  });

  it("keeps cabinet worktops external to the kitchen group instead of inside FWM modules", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = resolveContext({
      ...makeDefaultKitchenContext(catalog),
      heightMm: 910,
      worktopThicknessMm: 38,
      worktopDepthMm: 660,
      worktopFrontOffsetMm: 30,
      worktopBackOffsetMm: 10,
      plinthHeightMm: 120,
      plinthDepthMm: 70
    });

    for (const modulePackage of extendedFurnitureModulePackages) {
      const spec = FWM_FURNITURE_SPECS.find((entry) => entry.moduleType === modulePackage.module.moduleType);
      const defaults = createDefaultModulePackageParameters(modulePackage) as FwmFurnitureParams;
      const normalizedDefaults = normalizeFwmFurnitureParams(defaults);
      const isExternalWorktopCabinet =
        spec?.geometryKind !== "worktop" &&
        normalizedDefaults.requiresWorktop === true &&
        normalizedDefaults.kitchenModuleRole === "low";

      if (!isExternalWorktopCabinet) continue;

      const slotIds = new Set(modulePackage.materials.slots.map((slot) => slot.slotId));
      expect(slotIds.has("worktop"), modulePackage.module.moduleType).toBe(false);
      expect(normalizedDefaults.hasWorktop, modulePackage.module.moduleType).toBe(false);

      const synced = createDefaultModulePackageParameters(modulePackage) as FwmFurnitureParams;
      applyKitchenContextToModuleParams(synced, ctx, catalog, modulePackage);
      const normalized = normalizeFwmFurnitureParams(synced);
      expect(normalized.requiresWorktop, modulePackage.module.moduleType).toBe(true);
      expect(normalized.hasWorktop, modulePackage.module.moduleType).toBe(false);
      expect(normalized.worktopThicknessMm, modulePackage.module.moduleType).toBe(ctx.worktopThicknessMm);
      expect(normalized.heightCarcass, modulePackage.module.moduleType).toBe(ctx.moduleHeightMm);

      const group = buildModulePackageGeometryFromPackage({ modulePackage, parameters: normalized, catalog });
      expect(hasMeshNamed(group, /worktop/i), modulePackage.module.moduleType).toBe(false);
      if (!["sink", "bathroom", "appliance"].includes(spec?.geometryKind ?? "")) {
        expect(objectBoundsMm(group).height, modulePackage.module.moduleType).toBeLessThanOrEqual(ctx.moduleHeightMm + 1);
      }

      const bom = calculateFwmFurnitureBOM(normalized, ctx, catalog);
      expect(bom.quoteBom.items.some((item) => item.id.toLowerCase().includes("worktop") || item.category === "worktop"), modulePackage.module.moduleType).toBe(false);
      expect(Object.keys(bom.quoteBom.materials ?? {}).includes("worktop"), modulePackage.module.moduleType).toBe(false);
    }
  }, 30_000);

  it("builds upper wall corner variants as real top-corner cabinet geometry", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_wall_cabinet");
    expect(modulePackage).toBeTruthy();
    const defaults = createDefaultModulePackageParameters(modulePackage!);
    const userControls = new Set(modulePackage!.ui.controls.map((control) => control.parameterKey));
    for (const forbiddenTopControl of ["hasPlinth", "plinthHeight", "plinthSetbackMm", "plinthMaterialId", "legComponentId", "clipComponentId", "hasWorktop", "worktopThicknessMm", "worktopMaterialId"]) {
      expect(userControls.has(forbiddenTopControl), `upper wall corner must not expose ${forbiddenTopControl}`).toBe(false);
    }
    const cornerWidth = 600;
    const cornerDepth = 330;
    const cornerChamfer = cornerWidth - cornerDepth;
    expect(defaults.frontChamferMm).toBe(cornerChamfer);

    const chamfered = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      catalog,
      parameters: {
        ...defaults,
        variant: "corner_chamfered",
        width: cornerWidth,
        depth: cornerDepth,
        height: 450,
        shelfCount: 1,
        doorCount: 1,
        frontChamferMm: cornerChamfer,
        isCorner: true,
        cornerShape: "chamfered",
        frontFaceCount: 0,
        backFaceCount: 2,
        requiresWorktop: false,
        hasWorktop: false,
        hasPlinth: false,
        plinthHeight: 0
      }
    });
    const openNiche = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      catalog,
      parameters: {
        ...defaults,
        variant: "corner_open_chamfered",
        width: cornerWidth,
        depth: cornerDepth,
        height: 450,
        shelfCount: 2,
        doorCount: 0,
        frontChamferMm: cornerChamfer,
        isCorner: true,
        cornerShape: "chamfered",
        frontFaceCount: 0,
        backFaceCount: 2,
        requiresWorktop: false,
        hasWorktop: false,
        hasPlinth: false,
        plinthHeight: 0
      }
    });
    const corner90Closed = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      catalog,
      parameters: {
        ...defaults,
        variant: "corner_90",
        width: cornerWidth,
        depth: cornerDepth,
        height: 450,
        shelfCount: 1,
        doorCount: 1,
        isCorner: true,
        cornerShape: "l_shape",
        frontFaceCount: 0,
        backFaceCount: 2,
        requiresWorktop: false,
        hasWorktop: false,
        hasPlinth: false,
        plinthHeight: 0
      }
    });
    const corner90Opened = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      catalog,
      parameters: {
        ...defaults,
        variant: "corner_90",
        width: cornerWidth,
        depth: cornerDepth,
        height: 450,
        shelfCount: 1,
        doorCount: 1,
        opened: true,
        isCorner: true,
        cornerShape: "l_shape",
        frontFaceCount: 0,
        backFaceCount: 2,
        requiresWorktop: false,
        hasWorktop: false,
        hasPlinth: false,
        plinthHeight: 0
      }
    });
    const corner90DepthChanged = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      catalog,
      parameters: {
        ...defaults,
        variant: "corner_90",
        width: cornerWidth,
        depth: 360,
        height: 450,
        shelfCount: 1,
        doorCount: 1,
        isCorner: true,
        cornerShape: "l_shape",
        frontFaceCount: 0,
        backFaceCount: 2,
        requiresWorktop: false,
        hasWorktop: false,
        hasPlinth: false,
        plinthHeight: 0
      }
    });

    for (const group of [chamfered, openNiche, corner90Closed]) {
      const bounds = objectBoundsMm(group);
      expect(bounds.width).toBeCloseTo(cornerWidth, 0);
      expect(bounds.depth).toBeCloseTo(cornerWidth, 0);
      expect(bounds.height).toBeCloseTo(450, 0);
      expect(hasMeshNamed(group, /worktop/i)).toBe(false);
      expect(hasMeshNamed(group, /plinth/i)).toBe(false);
      const meshList = meshes(group);
      expect(meshList.some((mesh) => mesh.userData.materialGroup === "corpus")).toBe(true);
      expect(meshList.some((mesh) => mesh.userData.materialGroup === "back")).toBe(true);
      expect(meshList.every((mesh) => mesh.userData.materialGroup !== "carcass" && mesh.userData.materialGroup !== "shelf")).toBe(true);
      expect(meshList.filter((mesh) => ["corpus", "front", "back"].includes(String(mesh.userData.materialGroup))).every((mesh) => ["width", "height", "depth"].includes(String(mesh.userData.grainAlong)))).toBe(true);
      expect(meshList.some((mesh) => mesh.userData.edgeBandingStrategy === "explicit_visible_edges")).toBe(true);
    }

    expect(getMeshNamed(chamfered, "wall_corner_diagonal_front_door")?.userData.materialGroup).toBe("front");
    expect(getMeshNamed(openNiche, "wall_corner_diagonal_front_door")).toBeNull();
    expect(meshes(openNiche).filter((mesh) => /^wall_corner_shelf_/.test(mesh.name))).toHaveLength(2);

    const closedDoor = objectBoundsMm(getMeshNamed(corner90Closed, "wall_corner_front_leaf_x_door")!);
    const openedDoor = objectBoundsMm(getMeshNamed(corner90Opened, "wall_corner_front_leaf_x_door")!);
    const closedDoorZ = objectBoundsMm(getMeshNamed(corner90Closed, "wall_corner_front_leaf_z_door")!);
    expect(closedDoor.width).toBeCloseTo(cornerDepth, 0);
    expect(closedDoorZ.depth).toBeCloseTo(cornerDepth, 0);
    expect(Math.abs(openedDoor.minZ - closedDoor.minZ)).toBeGreaterThan(80);

    const depthChangedBounds = objectBoundsMm(corner90DepthChanged);
    const depthChangedDoorX = objectBoundsMm(getMeshNamed(corner90DepthChanged, "wall_corner_front_leaf_x_door")!);
    const depthChangedDoorZ = objectBoundsMm(getMeshNamed(corner90DepthChanged, "wall_corner_front_leaf_z_door")!);
    expect(depthChangedBounds.width).toBeCloseTo(cornerWidth, 0);
    expect(depthChangedBounds.depth).toBeCloseTo(cornerWidth, 0);
    expect(depthChangedDoorX.width).toBeCloseTo(360, 0);
    expect(depthChangedDoorZ.depth).toBeCloseTo(360, 0);
  });

  it("declares truthful internal-edit capabilities for composed and sink-capable modules", () => {
    const tallPackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_tall_cabinet");
    const sinkPackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_sink");
    const doorPackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_doors");
    expect(tallPackage?.internalEditing?.enabled).toBe(true);
    expect(tallPackage?.internalEditing?.hostKind).toBe("composed_tall");
    expect(tallPackage?.internalEditing?.submoduleTools.filter((tool) => tool.status === "available").map((tool) => tool.tool)).toEqual([
      "drawer",
      "shelf",
      "oven",
      "sink",
      "microwave",
      "door"
    ]);

    expect(sinkPackage?.internalEditing?.enabled).toBe(true);
    expect(sinkPackage?.internalEditing?.submoduleTools).toEqual([
      expect.objectContaining({
        tool: "sink",
        status: "planned",
        insertionMode: "worktop_cutout"
      })
    ]);
    expect(doorPackage?.internalEditing?.submoduleTools).toEqual([]);
    expect(doorPackage?.internalEditing?.boardOperations.every((operation) => operation.status === "planned")).toBe(true);
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

  it("builds Delfi catalog base doors as one parametric 1D/2D family", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_doors");
    expect(modulePackage).toBeTruthy();

    const parameterByKey = new Map(modulePackage!.parameters.parameters.map((parameter) => [parameter.key, parameter]));
    expect(parameterByKey.get("doorCount")?.uiVisibility).toBe("user");
    expect(parameterByKey.get("doorCount")?.min).toBe(1);
    expect(parameterByKey.get("doorCount")?.max).toBe(2);
    expect(parameterByKey.get("side")?.uiVisibility).toBe("user");

    const defaults = {
      ...(createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams),
      requiresWorktop: false,
      hasWorktop: false,
      worktopThicknessMm: 0,
      heightCarcass: 722
    } as FwmFurnitureParams;
    const oneDoorLeft = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...defaults, variant: "1d", width: 600, depth: 530, height: 722, doorCount: 1, side: "left", opened: true },
      catalog
    });
    const oneDoorRight = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...defaults, variant: "1d", width: 600, depth: 530, height: 722, doorCount: 1, side: "right", opened: true },
      catalog
    });
    const twoDoor = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...defaults, variant: "2d", width: 800, depth: 530, height: 722, doorCount: 2, side: "left" },
      catalog
    });

    expect(getMeshNamed(oneDoorLeft, "door_1")).toBeTruthy();
    expect(getMeshNamed(oneDoorLeft, "door_2")).toBeNull();
    expect(getMeshNamed(oneDoorLeft, "door_1_hinge_lower")?.userData.componentType).toBe("hinge");
    expect(getMeshNamed(oneDoorLeft, "door_1_hinge_upper")?.userData.componentType).toBe("hinge");
    expect(getMeshNamed(oneDoorLeft, "top")).toBeNull();
    expect(getMeshNamed(oneDoorLeft, "top_front_rail")).toBeTruthy();
    expect(getMeshNamed(oneDoorLeft, "top_back_rail")).toBeTruthy();
    expect(objectBoundsMm(getMeshNamed(oneDoorLeft, "top_front_rail")!).depth).toBeLessThan(120);
    expect(objectBoundsMm(getMeshNamed(oneDoorLeft, "top_back_rail")!).depth).toBeLessThan(120);
    expect(getMeshNamed(twoDoor, "door_1")).toBeTruthy();
    expect(getMeshNamed(twoDoor, "door_2")).toBeTruthy();
    expect(getMeshNamed(twoDoor, "door_3")).toBeNull();
    expect(getMeshNamed(twoDoor, "door_1_hinge_lower")?.userData.componentType).toBe("hinge");
    expect(getMeshNamed(twoDoor, "door_1_hinge_upper")?.userData.componentType).toBe("hinge");
    expect(getMeshNamed(twoDoor, "door_2_hinge_lower")?.userData.componentType).toBe("hinge");
    expect(getMeshNamed(twoDoor, "door_2_hinge_upper")?.userData.componentType).toBe("hinge");

    const leftDoorBounds = objectBoundsMm(getMeshNamed(oneDoorLeft, "door_1")!);
    const rightDoorBounds = objectBoundsMm(getMeshNamed(oneDoorRight, "door_1")!);
    expect((leftDoorBounds.minX + leftDoorBounds.maxX) / 2).toBeLessThan(0);
    expect((rightDoorBounds.minX + rightDoorBounds.maxX) / 2).toBeGreaterThan(0);
    expect(objectBoundsMm(twoDoor).width).toBeGreaterThan(objectBoundsMm(oneDoorLeft).width);

    const shelfGapGroup = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        variant: "1d",
        width: 600,
        depth: 530,
        height: 722,
        plinthHeight: 100,
        boardThickness: 18,
        shelfThickness: 18,
        shelfCount: 2,
        shelfGaps: "120, 240, 120"
      },
      catalog
    });
    const shelfOne = objectBoundsMm(getMeshNamed(shelfGapGroup, "shelf_1")!);
    const shelfTwo = objectBoundsMm(getMeshNamed(shelfGapGroup, "shelf_2")!);
    expect(shelfOne.minY).toBeCloseTo(238, 3);
    expect(shelfTwo.minY - shelfOne.maxY).toBeCloseTo(240, 3);

    const bom = calculateFwmFurnitureBOM({ ...defaults, variant: "1d", width: 600, depth: 530, height: 722, doorCount: 1, hasWorktop: false, worktopThicknessMm: 0 }, makeDefaultKitchenContext(catalog), catalog);
    const bomIds = new Set(bom.quoteBom.items.map((item) => item.id));
    expect(bomIds.has("bottom-panel")).toBe(true);
    expect(bomIds.has("top-front-back-rails")).toBe(true);
    expect(bomIds.has("bottom-top-panels")).toBe(false);
  });

  it("declares proportional parameter presets for Delfi catalog base drawers", () => {
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_drawers");
    expect(modulePackage).toBeTruthy();
    const presetSet = modulePackage!.parameterPresets;
    expect(presetSet).toBeTruthy();
    const presets = presetSet!.presets;
    expect(presets.map((preset) => preset.presetId)).toEqual([
      "drawers_1_full_height",
      "drawers_2_equal",
      "drawers_2_top_shallow",
      "drawers_3_equal",
      "drawers_3_top_shallow",
      "drawers_3_top_shallow_two_high",
      "drawers_4_three_shallow_one_high",
      "drawers_5_equal"
    ]);
    expect(new Set(presets.map((preset) => preset.presetId)).size).toBe(presets.length);
    const freeKeys = new Set(presetSet!.freeParameterKeys);
    for (const preset of presets) {
      expect(preset.note.length, preset.presetId).toBeGreaterThan(20);
      for (const key of Object.keys(preset.parameterValues)) {
        expect(freeKeys.has(key), `${preset.presetId} writes free key ${key}`).toBe(false);
      }
    }

    const defaults = createDefaultModulePackageParameters(modulePackage!);
    const current = {
      ...defaults,
      width: 777,
      depth: 531,
      height: 920,
      plinthHeight: 100,
      frontMaterialId: "front-custom",
      drawerBottomMaterialId: "drawer-bottom-custom"
    };
    const oneDrawer = applyModuleParameterPreset({
      modulePackage: modulePackage!,
      parameters: current,
      presetId: "drawers_1_full_height"
    });
    expect(oneDrawer.drawerCount).toBe(1);
    expect(oneDrawer.drawerFrontHeightsMm).toBe("816");
    expect(oneDrawer.drawer1FrontHeightMm).toBe(816);
    expect(oneDrawer.width).toBe(777);
    expect(oneDrawer.height).toBe(920);

    const fourDrawers = applyModuleParameterPreset({
      modulePackage: modulePackage!,
      parameters: current,
      presetId: "drawers_4_three_shallow_one_high"
    });
    expect(fourDrawers.width).toBe(777);
    expect(fourDrawers.depth).toBe(531);
    expect(fourDrawers.height).toBe(920);
    expect(fourDrawers.plinthHeight).toBe(100);
    expect(fourDrawers.frontMaterialId).toBe("front-custom");
    expect(fourDrawers.drawerBottomMaterialId).toBe("drawer-bottom-custom");
    expect(fourDrawers.drawerCount).toBe(4);
    expect(fourDrawers.drawerFrontHeightsMm).toBe("405,135,135,135");
    expect(fourDrawers.drawer1FrontHeightMm).toBe(405);
    expect(fourDrawers.drawer2FrontHeightMm).toBe(135);
    expect(fourDrawers.drawer3FrontHeightMm).toBe(135);
    expect(fourDrawers.drawer4FrontHeightMm).toBe(135);

    const threeEqual = applyModuleParameterPreset({
      modulePackage: modulePackage!,
      parameters: current,
      presetId: "drawers_3_equal"
    });
    expect(threeEqual.drawerCount).toBe(3);
    expect(threeEqual.drawerFrontHeightsMm).toBe("270.667,270.667,270.667");
  });

  it("builds custom tall cabinet as an empty corpus shell by default", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_tall_cabinet");
    expect(modulePackage).toBeTruthy();

    const defaults = {
      ...(createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams),
      requiresWorktop: false,
      hasWorktop: false,
      worktopThicknessMm: 0,
      heightCarcass: 722
    } as FwmFurnitureParams;
    expect(defaults.applianceKind).toBe("none");
    expect(defaults.applianceWidthMm).toBe(0);
    expect(defaults.tallSlotCount).toBe(0);
    expect(modulePackage!.parameterPresets?.presets).toEqual([]);

    const group = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        width: 600,
        depth: 560,
        height: 2080,
        plinthHeight: 100,
        hasWorktop: false,
        worktopThicknessMm: 0
      },
      catalog
    });

    expect(getMeshNamed(group, "tower_left_side")).toBeTruthy();
    expect(getMeshNamed(group, "tower_right_side")).toBeTruthy();
    expect(getMeshNamed(group, "tower_bottom")).toBeTruthy();
    expect(getMeshNamed(group, "tower_top")).toBeTruthy();
    expect(getMeshNamed(group, "tower_back")).toBeTruthy();
    expect(getMeshNamed(group, "tower_drawer_front_1")).toBeNull();
    expect(getMeshNamed(group, "tower_door_1")).toBeNull();
    expect(getMeshNamed(group, "oven_body")).toBeNull();
    expect(getMeshNamed(group, "microwave_body")).toBeNull();
    expect(getMeshNamed(group, "worktop")).toBeNull();
    expect(objectBoundsMm(getMeshNamed(group, "tower_back")!).maxY).toBeCloseTo(2062, 3);
  });

  it("builds a tall oven microwave layout only from explicit bottom-up slot params", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_tall_cabinet");
    expect(modulePackage).toBeTruthy();

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const group = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        width: 600,
        depth: 560,
        height: 2080,
        plinthHeight: 100,
        hasWorktop: false,
        worktopThicknessMm: 0,
        drawerCount: 2,
        doorCount: 1,
        shelfCount: 3,
        tallStackMode: "builder",
        tallSlotCount: 8,
        tallSlot1Type: "drawer",
        tallSlot1HeightMm: 190,
        tallSlot2Type: "drawer",
        tallSlot2HeightMm: 190,
        tallSlot3Type: "shelf",
        tallSlot3HeightMm: 18,
        tallSlot4Type: "oven",
        tallSlot4HeightMm: 600,
        tallSlot5Type: "microwave",
        tallSlot5HeightMm: 390,
        tallSlot6Type: "shelf",
        tallSlot6HeightMm: 18,
        tallSlot7Type: "shelf",
        tallSlot7HeightMm: 18,
        tallSlot8Type: "door",
        tallSlot8HeightMm: 0
      },
      catalog
    });

    expect(getMeshNamed(group, "tower_drawer_front_1")).toBeTruthy();
    expect(getMeshNamed(group, "tower_drawer_front_2")).toBeTruthy();
    expect(getMeshNamed(group, "tower_drawer_system_left_1")?.userData.submoduleKind).toBe("drawer");
    expect(getMeshNamed(group, "tower_drawer_system_left_1")?.userData.selectableSubmoduleId).toBe("tower_drawer_1");
    expect(getMeshNamed(group, "tower_shelf_3")).toBeTruthy();
    expect(getMeshNamed(group, "tower_shelf_3")?.userData.selectableSubmoduleId).toBe("tower_shelf_3");
    expect(getMeshNamed(group, "oven_body")?.userData.submoduleKind).toBe("appliance");
    expect(getMeshNamed(group, "oven_body")?.userData.selectableSubmoduleId).toBe("tower_oven_4");
    expect(getMeshNamed(group, "microwave_body")?.userData.submoduleKind).toBe("appliance");
    expect(getMeshNamed(group, "microwave_body")?.userData.selectableSubmoduleId).toBe("tower_microwave_5");
    expect(getMeshNamed(group, "tower_door_8")).toBeTruthy();
    expect(getMeshNamed(group, "tower_door_8")?.userData.selectableSubmoduleId).toBe("tower_door_8");
    expect(getMeshNamed(group, "worktop")).toBeNull();

    const ovenBounds = objectBoundsMm(getMeshNamed(group, "oven_body")!);
    const microwaveBounds = objectBoundsMm(getMeshNamed(group, "microwave_body")!);
    const firstDrawerBounds = objectBoundsMm(getMeshNamed(group, "tower_drawer_front_1")!);
    const secondDrawerBounds = objectBoundsMm(getMeshNamed(group, "tower_drawer_front_2")!);
    const bottomBounds = objectBoundsMm(getMeshNamed(group, "tower_bottom")!);
    const shelfAboveDrawerBounds = objectBoundsMm(getMeshNamed(group, "tower_shelf_3")!);
    const shelfBelowMicrowaveBounds = objectBoundsMm(getMeshNamed(group, "tower_shelf_5")!);
    const shelfAboveMicrowaveBounds = objectBoundsMm(getMeshNamed(group, "tower_shelf_6")!);
    const topBounds = objectBoundsMm(getMeshNamed(group, "tower_top")!);
    const upperDoorBounds = objectBoundsMm(getMeshNamed(group, "tower_door_8")!);
    const ovenSubmoduleBounds = visibleObjectBoundsMm(getObjectNamed(group, "tower_oven_submodule_4")!);
    const microwaveSubmoduleBounds = visibleObjectBoundsMm(getObjectNamed(group, "tower_microwave_submodule_5")!);
    const drawerSystemBounds = objectBoundsMm(getMeshNamed(group, "tower_drawer_system_left_1")!);
    const drawerBottomBounds = objectBoundsMm(getMeshNamed(group, "tower_drawer_bottom_1")!);
    expect(ovenBounds.height).toBeGreaterThan(500);
    expect(microwaveBounds.height).toBeGreaterThan(300);
    expect(microwaveBounds.height).toBeCloseTo(386, 3);
    expect(microwaveBounds.minY).toBeGreaterThan(ovenBounds.maxY);
    expect(firstDrawerBounds.minY).toBeLessThanOrEqual(bottomBounds.minY + 0.001);
    expect(shelfAboveDrawerBounds.maxY).toBeLessThanOrEqual(secondDrawerBounds.maxY + 0.001);
    expect(shelfAboveDrawerBounds.maxY).toBeGreaterThan(secondDrawerBounds.maxY - 4);
    expect(ovenBounds.minY).toBeCloseTo(shelfAboveDrawerBounds.maxY, 3);
    expect(microwaveBounds.minY).toBeCloseTo(shelfBelowMicrowaveBounds.maxY, 3);
    expect(ovenSubmoduleBounds.minY).toBeCloseTo(shelfAboveDrawerBounds.maxY, 3);
    expect(microwaveSubmoduleBounds.minY).toBeCloseTo(shelfBelowMicrowaveBounds.maxY, 3);
    expect(ovenSubmoduleBounds.minX).toBeGreaterThanOrEqual(-300.1);
    expect(ovenSubmoduleBounds.maxX).toBeLessThanOrEqual(300.1);
    expect(microwaveSubmoduleBounds.minX).toBeGreaterThanOrEqual(-300.1);
    expect(microwaveSubmoduleBounds.maxX).toBeLessThanOrEqual(300.1);
    expect(ovenSubmoduleBounds.maxZ).toBeGreaterThan(280);
    expect(microwaveSubmoduleBounds.maxZ).toBeGreaterThan(280);
    expect(drawerSystemBounds.minZ).toBeCloseTo(-262, 3);
    expect(drawerBottomBounds.width).toBeCloseTo(513, 3);
    expect(upperDoorBounds.minY).toBeLessThan(shelfAboveMicrowaveBounds.maxY);
    expect(upperDoorBounds.maxY).toBeGreaterThanOrEqual(topBounds.maxY - 0.001);
    expect(objectBoundsMm(getMeshNamed(group, "tower_back")!).maxY).toBeCloseTo(2062, 3);
  });

  it("stretches appliance submodule bodies to edited tall slot heights", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_tall_cabinet");
    expect(modulePackage).toBeTruthy();

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const group = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        width: 600,
        depth: 560,
        height: 2080,
        plinthHeight: 100,
        hasWorktop: false,
        worktopThicknessMm: 0,
        tallStackMode: "builder",
        tallSlotCount: 1,
        tallSlot1Type: "microwave",
        tallSlot1HeightMm: 480
      },
      catalog
    });

    expect(objectBoundsMm(getMeshNamed(group, "microwave_body")!).height).toBeCloseTo(476, 3);
  });

  it("renders tall door submodule with per-slot leaf count and opening mode", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_tall_cabinet");
    expect(modulePackage).toBeTruthy();

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const baseParams = {
      ...defaults,
      width: 600,
      depth: 560,
      height: 2080,
      plinthHeight: 100,
      hasWorktop: false,
      worktopThicknessMm: 0,
      tallStackMode: "builder",
      tallSlotCount: 1,
      tallSlot1Type: "door",
      tallSlot1HeightMm: 600,
      tallSlot1DoorLeafCount: 2,
      tallSlot1DoorOpeningMode: "lift_up",
      opened: false
    } as FwmFurnitureParams;
    const closed = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: baseParams,
      catalog
    });
    const opened = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...baseParams, opened: true },
      catalog
    });

    expect(getMeshNamed(closed, "tower_door_1_1")).toBeTruthy();
    expect(getMeshNamed(closed, "tower_door_1_2")).toBeTruthy();
    expect(getMeshNamed(closed, "tower_door_1")).toBeNull();
    expect(getMeshNamed(closed, "tower_door_1_1_hinge_top_left")?.userData.componentType).toBe("hinge");
    expect(getMeshNamed(closed, "tower_door_1_2_hinge_top_right")?.userData.componentType).toBe("hinge");
    expect(getMeshNamed(closed, "tower_door_1_1")?.userData.selectableSubmoduleId).toBe("tower_door_1");
    expect(objectBoundsMm(getMeshNamed(opened, "tower_door_1_1")!).maxZ).toBeGreaterThan(objectBoundsMm(getMeshNamed(closed, "tower_door_1_1")!).maxZ + 100);
  });

  it("renders tall slot offsets without resizing neighboring submodules", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_tall_cabinet");
    expect(modulePackage).toBeTruthy();

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const baseParams = {
      ...defaults,
      width: 600,
      depth: 560,
      height: 2080,
      plinthHeight: 100,
      hasWorktop: false,
      worktopThicknessMm: 0,
      tallStackMode: "builder",
      tallSlotCount: 2,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot2Type: "microwave",
      tallSlot2HeightMm: 480
    } as FwmFurnitureParams;
    const baseline = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: baseParams, catalog });
    const moved = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...baseParams, tallSlot1OffsetMm: 120 },
      catalog
    });

    const baselineDrawer = objectBoundsMm(getMeshNamed(baseline, "tower_drawer_front_1")!);
    const movedDrawer = objectBoundsMm(getMeshNamed(moved, "tower_drawer_front_1")!);
    const baselineMicrowave = objectBoundsMm(getMeshNamed(baseline, "microwave_body")!);
    const movedMicrowave = objectBoundsMm(getMeshNamed(moved, "microwave_body")!);
    expect(movedDrawer.minY).toBeCloseTo(baselineDrawer.minY + 120, 3);
    expect(movedDrawer.height).toBeCloseTo(baselineDrawer.height, 3);
    expect(movedMicrowave.minY).toBeCloseTo(baselineMicrowave.minY, 3);
    expect(movedMicrowave.height).toBeCloseTo(baselineMicrowave.height, 3);
  });

  it("keeps tall drawer system sizes automatic when multiple drawer heights change", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_tall_cabinet");
    expect(modulePackage).toBeTruthy();

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const baseParams = {
      ...defaults,
      width: 600,
      depth: 560,
      height: 2080,
      plinthHeight: 100,
      hasWorktop: false,
      worktopThicknessMm: 0,
      drawerSystemBrand: "merivobox",
      tallStackMode: "builder",
      tallSlotCount: 2,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot1DrawerSystemSize: "",
      tallSlot2Type: "drawer",
      tallSlot2HeightMm: 190,
      tallSlot2DrawerSystemSize: ""
    } as FwmFurnitureParams;
    const lowDrawers = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: baseParams, catalog });
    expect(getMeshNamed(lowDrawers, "tower_drawer_system_left_1")?.userData.drawerSystemSize).toBe("M");
    expect(getMeshNamed(lowDrawers, "tower_drawer_system_left_2")?.userData.drawerSystemSize).toBe("M");

    const highDrawers = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...baseParams, tallSlot1HeightMm: 500, tallSlot2HeightMm: 500 },
      catalog
    });
    expect(getMeshNamed(highDrawers, "tower_drawer_system_left_1")?.userData.drawerSystemSize).toBe("E");
    expect(getMeshNamed(highDrawers, "tower_drawer_system_left_2")?.userData.drawerSystemSize).toBe("E");

    const overridden = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...baseParams, tallSlot1HeightMm: 500, tallSlot2HeightMm: 500, tallSlot1DrawerSystemSize: "M" },
      catalog
    });
    expect(getMeshNamed(overridden, "tower_drawer_system_left_1")?.userData.drawerSystemSize).toBe("M");
    expect(getMeshNamed(overridden, "tower_drawer_system_left_2")?.userData.drawerSystemSize).toBe("E");
  });

  it("builds sink as a selectable appliance submodule inside a custom tall host", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_tall_cabinet");
    expect(modulePackage).toBeTruthy();

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const group = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        width: 700,
        depth: 560,
        height: 2080,
        plinthHeight: 100,
        hasWorktop: false,
        worktopThicknessMm: 0,
        tallSlotCount: 2,
        tallSlot1Type: "shelf",
        tallSlot1HeightMm: 18,
        tallSlot2Type: "sink",
        tallSlot2HeightMm: 220
      },
      catalog
    });

    const sinkSubmodule = getObjectNamed(group, "tower_sink_submodule_2");
    expect(sinkSubmodule).toBeTruthy();
    expect(getMeshNamed(group, "sink_outer_rim")?.userData.submoduleKind).toBe("appliance");
    expect(getMeshNamed(group, "sink_outer_rim")?.userData.selectableSubmoduleId).toBe("tower_sink_2");
    const bounds = visibleObjectBoundsMm(sinkSubmodule!);
    expect(bounds.width).toBeLessThanOrEqual(700);
    expect(bounds.depth).toBeLessThanOrEqual(560);
    expect(bounds.height).toBeGreaterThan(40);
  });

  it("builds Delfi catalog base drawers with metal drawer-system sides", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_drawers");
    expect(modulePackage).toBeTruthy();

    const parameterByKey = new Map(modulePackage!.parameters.parameters.map((parameter) => [parameter.key, parameter]));
    expect(parameterByKey.get("drawerCount")?.uiVisibility).toBe("user");
    expect(parameterByKey.get("drawerCount")?.min).toBe(1);
    expect(parameterByKey.get("drawerCount")?.max).toBe(5);
    expect(parameterByKey.get("drawerSystemBrand")?.uiVisibility).toBe("user");
    expect(parameterByKey.get("drawerSystemBrand")?.type).toBe("select");
    expect(parameterByKey.get("drawerFrontHeightsMm")?.uiVisibility).toBe("technical");
    expect(parameterByKey.get("drawer1FrontHeightMm")?.uiVisibility).toBe("user");
    expect(parameterByKey.get("drawer1FrontHeightMm")?.type).toBe("number");
    expect(parameterByKey.get("drawer1SystemSize")?.uiVisibility).toBe("user");
    expect(parameterByKey.get("drawer1SystemSize")?.type).toBe("select");
    expect(parameterByKey.get("drawer1SystemLabel")?.uiVisibility).toBe("technical");
    expect(parameterByKey.get("drawerSystemSize")?.uiVisibility).toBe("technical");
    expect(parameterByKey.get("drawerSystem")?.uiVisibility).toBe("technical");
    expect(parameterByKey.get("drawerSystemSizes")?.uiVisibility).toBe("technical");
    expect(parameterByKey.get("drawerSystemLabels")?.uiVisibility).toBe("technical");
    expect(parameterByKey.get("drawerBackHeightDeductionMm")?.uiVisibility).toBe("technical");
    expect(parameterByKey.get("drawerSystemPricePerSet")?.uiVisibility).toBe("technical");
    expect(parameterByKey.get("hasCutleryInnerDrawer")?.uiVisibility).toBe("user");
    expect(parameterByKey.get("cutleryInnerDrawerStatus")?.uiVisibility).toBe("technical");
    expect(parameterByKey.get("cutleryInnerDrawerWidthMm")?.uiVisibility).toBe("technical");
    expect(parameterByKey.get("runnerComponentId")?.uiVisibility).toBe("internal");

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const normalizedDefaults = normalizeFwmFurnitureParams(defaults);
    expect(normalizedDefaults.drawerSystemBrand).toBe("merivobox");
    expect(normalizedDefaults.drawerSystemSize).toBe("M");
    expect(normalizedDefaults.drawerSystemSizes).toBe("M,M,M");
    expect(normalizedDefaults.drawerSystemLabels).toBe("MERIVOBOX M,MERIVOBOX M,MERIVOBOX M");
    expect(normalizedDefaults.drawer1FrontHeightMm).toBeCloseTo(204.667, 3);
    expect(normalizedDefaults.drawer1SystemLabel).toBe("MERIVOBOX M");
    expect(normalizedDefaults.drawerSystemDepthMm).toBe(500);
    expect(normalizedDefaults.drawerBottomWidthDeductionMm).toBe(51);
    expect(normalizedDefaults.drawerBackHeightDeductionMm).toBe(83);
    expect(normalizedDefaults.drawerSystemPricePerSet).toBe(669);
    expect(normalizedDefaults.drawerSystemPriceWithMargin).toBe(1338);
    expect(normalizedDefaults.hasCutleryInnerDrawer).toBe(false);
    expect(normalizedDefaults.cutleryInnerDrawerAllowed).toBe(true);
    expect(normalizedDefaults.cutleryInnerDrawerTargetIndex).toBe(3);
    expect(normalizedDefaults.cutleryInnerDrawerWidthMm).toBeCloseTo(561, 3);
    expect(normalizedDefaults.cutleryInnerDrawerDepthMm).toBeCloseTo(456, 3);
    const group = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        variant: "3k",
        width: 600,
        depth: 530,
        height: 722,
        drawerCount: 3,
        drawerSystemBrand: "merivobox",
        hasWorktop: false,
        worktopThicknessMm: 0
      },
      catalog
    });

    expect(getMeshNamed(group, "top")).toBeNull();
    expect(getMeshNamed(group, "top_front_rail")).toBeTruthy();
    expect(getMeshNamed(group, "top_back_rail")).toBeTruthy();
    expect(getMeshNamed(group, "drawer_front_1")).toBeTruthy();
    expect(getMeshNamed(group, "drawer_bottom_1")).toBeTruthy();
    expect(getMeshNamed(group, "cutlery_inner_drawer_front_3")).toBeNull();
    expect(getMeshNamed(group, "drawer_left_side_1")).toBeNull();
    expect(getMeshNamed(group, "drawer_right_side_1")).toBeNull();
    expect(getMeshNamed(group, "drawer_system_left_1")?.userData.materialGroup).toBe("hardware");
    expect(getMeshNamed(group, "drawer_system_right_1")?.userData.materialGroup).toBe("hardware");
    expect(getMeshNamed(group, "drawer_system_left_outer_lower_1")?.userData.materialGroup).toBe("hardware");
    expect(getMeshNamed(group, "drawer_system_left_outer_upper_1")?.userData.materialGroup).toBe("hardware");
    expect(getMeshNamed(group, "drawer_system_back_rail_1")?.userData.materialGroup).toBe("drawer_bottom");
    expect(getMeshNamed(group, "drawer_system_back_rail_1")?.userData.materialSlotId).toBe("drawer_bottom");
    expect(getMeshNamed(group, "drawer_system_back_rail_1")?.userData.componentType).toBeUndefined();
    expect(getMeshNamed(group, "drawer_system_left_1")?.userData.drawerSystem).toBe("MERIVOBOX M");
    expect(getMeshNamed(group, "drawer_system_left_1")?.userData.drawerSystemBrand).toBe("merivobox");
    expect(getMeshNamed(group, "drawer_system_left_1")?.userData.drawerSystemSize).toBe("M");
    expect(getMeshNamed(group, "worktop")).toBeNull();
    const firstFront = objectBoundsMm(getMeshNamed(group, "drawer_front_1")!);
    const secondFront = objectBoundsMm(getMeshNamed(group, "drawer_front_2")!);
    const topFront = objectBoundsMm(getMeshNamed(group, "drawer_front_3")!);
    expect(firstFront.minY).toBeCloseTo(106, 3);
    expect(secondFront.minY).toBeCloseTo(firstFront.maxY, 3);
    expect(topFront.maxY).toBeCloseTo(720, 3);
    expect(objectBoundsMm(getMeshNamed(group, "drawer_system_left_1")!).depth).toBeCloseTo(496, 3);
    expect(objectBoundsMm(getMeshNamed(group, "drawer_system_back_rail_1")!).height).toBeCloseTo(83, 3);
    expect(objectBoundsMm(getMeshNamed(group, "drawer_system_back_rail_1")!).width).toBeCloseTo(513, 3);
    expect(objectBoundsMm(getMeshNamed(group, "drawer_bottom_1")!).height).toBeCloseTo(18, 3);
    expect(objectBoundsMm(getMeshNamed(group, "drawer_bottom_1")!).width).toBeCloseTo(513, 3);
    expect(objectBoundsMm(getMeshNamed(group, "drawer_bottom_1")!).maxZ).toBeCloseTo(firstFront.minZ, 3);

    const withCutlery = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        width: 600,
        depth: 530,
        height: 722,
        drawerCount: 3,
        drawerSystemBrand: "merivobox",
        hasCutleryInnerDrawer: true,
        hasWorktop: false,
        worktopThicknessMm: 0
      },
      catalog
    });
    const cutleryParams = withCutlery.userData.modulePackageBuildParameters as FwmFurnitureParams;
    expect(cutleryParams.cutleryInnerDrawerStatus).toBe("enabled");
    expect(cutleryParams.cutleryInnerDrawerTargetIndex).toBe(3);
    expect(getMeshNamed(withCutlery, "cutlery_inner_drawer_front_1")).toBeNull();
    expect(getMeshNamed(withCutlery, "cutlery_inner_drawer_front_3")?.userData.submoduleKind).toBe("cutlery_inner_drawer");
    expect(getMeshNamed(withCutlery, "cutlery_inner_drawer_front_3")?.userData.parentDrawerIndex).toBe(3);
    expect(getMeshNamed(withCutlery, "cutlery_inner_drawer_front_3")?.userData.materialGroup).toBe("front");
    expect(getMeshNamed(withCutlery, "cutlery_inner_drawer_bottom_3")?.userData.materialGroup).toBe("drawer_bottom");
    expect(getMeshNamed(withCutlery, "cutlery_inner_drawer_cross_rail_3")?.userData.materialSlotId).toBe("drawer_bottom");
    expect(getMeshNamed(withCutlery, "cutlery_inner_drawer_runner_left_3")).toBeNull();
    for (const side of ["left", "right"]) {
      for (const suffix of ["", "_top_flange", "_outer_lower", "_outer_upper"]) {
        const cutlerySystemPart = getMeshNamed(withCutlery, `cutlery_inner_drawer_system_${side}${suffix}_3`);
        const mainSystemPart = getMeshNamed(withCutlery, `drawer_system_${side}${suffix}_3`);
        expect(cutlerySystemPart?.userData.materialGroup).toBe("hardware");
        expect(cutlerySystemPart?.userData.componentId).toBe(mainSystemPart?.userData.componentId);
        expect(cutlerySystemPart?.userData.componentType).toBe(mainSystemPart?.userData.componentType);
        expect(cutlerySystemPart?.userData.drawerSystem).toBe(mainSystemPart?.userData.drawerSystem);
        expect(cutlerySystemPart?.userData.submoduleKind).toBe("cutlery_inner_drawer");
        expect(cutlerySystemPart?.userData.parentDrawerIndex).toBe(3);
      }
    }
    const cutleryBottomBounds = objectBoundsMm(getMeshNamed(withCutlery, "cutlery_inner_drawer_bottom_3")!);
    const cutleryFrontBounds = objectBoundsMm(getMeshNamed(withCutlery, "cutlery_inner_drawer_front_3")!);
    const mainTopDrawerBottomBounds = objectBoundsMm(getMeshNamed(withCutlery, "drawer_bottom_3")!);
    const topDrawerFrontBounds = objectBoundsMm(getMeshNamed(withCutlery, "drawer_front_3")!);
    expect(cutleryBottomBounds.depth).toBeLessThan(mainTopDrawerBottomBounds.depth);
    expect(cutleryBottomBounds.width).toBeCloseTo(561, 3);
    expect(cutleryFrontBounds.width).toBeCloseTo(438, 3);
    expect(cutleryBottomBounds.minY).toBeGreaterThan(mainTopDrawerBottomBounds.maxY + 80);
    expect(topDrawerFrontBounds.maxY - cutleryFrontBounds.maxY).toBeCloseTo(10, 3);

    const legraboxHigh = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        width: 600,
        depth: 530,
        height: 722,
        drawerCount: 1,
        drawerSystemBrand: "legrabox",
        hasWorktop: false,
        worktopThicknessMm: 0
      },
      catalog
    });
    expect(getMeshNamed(legraboxHigh, "drawer_system_left_1")?.userData.drawerSystem).toBe("LEGRABOX F");
    expect(objectBoundsMm(getMeshNamed(legraboxHigh, "drawer_system_back_rail_1")!).height).toBeCloseTo(212, 3);
    expect(objectBoundsMm(getMeshNamed(legraboxHigh, "drawer_system_back_rail_1")!).width).toBeCloseTo(526, 3);
    expect(objectBoundsMm(getMeshNamed(legraboxHigh, "drawer_system_left_1")!).height).toBeCloseTo(107.188, 3);
    expect(objectBoundsMm(getMeshNamed(legraboxHigh, "drawer_bottom_1")!).width).toBeCloseTo(529, 3);

    const mixedMerivobox = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        width: 600,
        depth: 530,
        height: 722,
        drawerCount: 2,
        drawer1FrontHeightMm: 120,
        drawer2FrontHeightMm: 500,
        drawerSystemBrand: "merivobox",
        hasWorktop: false,
        worktopThicknessMm: 0
      },
      catalog
    });
    const mixedParams = mixedMerivobox.userData.modulePackageBuildParameters as FwmFurnitureParams;
    expect(mixedParams.drawerSystemSizes).toBe("M,E");
    expect(mixedParams.drawerSystemLabels).toBe("MERIVOBOX M,MERIVOBOX E");
    expect(mixedParams.drawer1SystemSize).toBe("");
    expect(mixedParams.drawer2SystemSize).toBe("");
    expect(getMeshNamed(mixedMerivobox, "drawer_system_left_1")?.userData.drawerSystem).toBe("MERIVOBOX M");
    expect(getMeshNamed(mixedMerivobox, "drawer_system_left_2")?.userData.drawerSystem).toBe("MERIVOBOX E");
    expect(objectBoundsMm(getMeshNamed(mixedMerivobox, "drawer_system_back_rail_1")!).height).toBeCloseTo(83, 3);
    expect(objectBoundsMm(getMeshNamed(mixedMerivobox, "drawer_system_back_rail_2")!).height).toBeCloseTo(184, 3);

    const overriddenMerivobox = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        width: 600,
        depth: 530,
        height: 722,
        drawerCount: 2,
        drawer1FrontHeightMm: 120,
        drawer2FrontHeightMm: 500,
        drawer1SystemSize: "E",
        drawerSystemBrand: "merivobox",
        hasWorktop: false,
        worktopThicknessMm: 0
      },
      catalog
    });
    const overriddenParams = overriddenMerivobox.userData.modulePackageBuildParameters as FwmFurnitureParams;
    expect(overriddenParams.drawerSystemSizes).toBe("E,E");
    expect(overriddenParams.drawer1SystemSize).toBe("E");
    expect(overriddenParams.drawer2SystemSize).toBe("");
    expect(getMeshNamed(overriddenMerivobox, "drawer_system_left_1")?.userData.drawerSystem).toBe("MERIVOBOX E");
    expect(getMeshNamed(overriddenMerivobox, "drawer_system_left_1")?.userData.drawerSystemSize).toBe("E");
    expect(objectBoundsMm(getMeshNamed(overriddenMerivobox, "drawer_system_back_rail_1")!).height).toBeCloseTo(184, 3);

    const blockedCutlery = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: {
        ...defaults,
        width: 600,
        depth: 530,
        height: 722,
        drawerCount: 2,
        drawer1FrontHeightMm: 120,
        drawer2FrontHeightMm: 500,
        drawerSystemBrand: "merivobox",
        hasCutleryInnerDrawer: true,
        hasWorktop: false,
        worktopThicknessMm: 0
      },
      catalog
    });
    const blockedCutleryParams = blockedCutlery.userData.modulePackageBuildParameters as FwmFurnitureParams;
    expect(blockedCutleryParams.drawerSystemSizes).toBe("M,E");
    expect(blockedCutleryParams.cutleryInnerDrawerStatus).toBe("disabled_top_drawer_not_medium");
    expect(blockedCutleryParams.cutleryInnerDrawerTargetIndex).toBe(0);
    expect(getMeshNamed(blockedCutlery, "cutlery_inner_drawer_front_2")).toBeNull();

    const opened = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...defaults, width: 600, depth: 530, height: 722, drawerCount: 3, opened: true, hasWorktop: false, worktopThicknessMm: 0 },
      catalog
    });
    expect(objectBoundsMm(getMeshNamed(opened, "drawer_front_1")!).maxZ).toBeGreaterThan(objectBoundsMm(getMeshNamed(group, "drawer_front_1")!).maxZ + 100);

    const bom = calculateFwmFurnitureBOM({ ...defaults, width: 600, depth: 530, height: 722, drawerCount: 3, hasWorktop: false, worktopThicknessMm: 0 }, makeDefaultKitchenContext(catalog), catalog);
    const bomIds = new Set(bom.quoteBom.items.map((item) => item.id));
    expect(bomIds.has("drawer-fronts")).toBe(true);
    expect(bomIds.has("drawer-bottoms")).toBe(true);
    expect(bomIds.has("cutlery-inner-drawer-bottom")).toBe(false);
    expect(bomIds.has("drawer-boxes")).toBe(false);
    expect(bomIds.has("runners")).toBe(true);
    const drawerBottomBom = bom.quoteBom.items.find((item) => item.id === "drawer-bottoms");
    expect(drawerBottomBom?.dimensionsMm?.length).toBeCloseTo(474, 3);
    expect(drawerBottomBom?.dimensionsMm?.width).toBeCloseTo(513, 3);

    const cutleryBom = calculateFwmFurnitureBOM({ ...defaults, width: 600, depth: 530, height: 722, drawerCount: 3, hasCutleryInnerDrawer: true, hasWorktop: false, worktopThicknessMm: 0 }, makeDefaultKitchenContext(catalog), catalog);
    const cutleryBomIds = new Set(cutleryBom.quoteBom.items.map((item) => item.id));
    expect(cutleryBomIds.has("cutlery-inner-drawer-front")).toBe(true);
    expect(cutleryBomIds.has("cutlery-inner-drawer-bottom")).toBe(true);
    expect(cutleryBomIds.has("cutlery-inner-drawer-cross-rail")).toBe(true);
  });

  it("builds the catalog base corner as a blind 1D corner cabinet, not as two generic L runs", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_corner");
    expect(modulePackage).toBeTruthy();

    const defaults = {
      ...(createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams),
      requiresWorktop: false,
      hasWorktop: false,
      worktopThicknessMm: 0,
      heightCarcass: 722
    } as FwmFurnitureParams;
    expect(defaults.displayName).toBe("Spodna rohova skrinka");
    const normalizedDefaults = normalizeFwmFurnitureParams({ ...defaults, variant: "corner_1d" });
    expect(normalizedDefaults.cornerShape).toBe("blind");
    expect(defaults.shelfCount).toBe(0);
    const group = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...defaults, variant: "corner_1d", shelfCount: 1, plinthHeight: 100, plinthSetbackMm: 50 }, catalog });
    const allMeshes = meshes(group);
    const meshNames = new Set(allMeshes.map((mesh) => mesh.name));

    expect(meshNames.has("corner_right_door")).toBe(true);
    expect(meshNames.has("corner_blind_divider")).toBe(true);
    expect(meshNames.has("corner_back_panel")).toBe(true);
    expect(meshNames.has("corner_right_shelf_1")).toBe(true);
    expect([...meshNames].some((name) => name.startsWith("run_x_") || name.startsWith("run_z_"))).toBe(false);
    expect([...meshNames].some((name) => name.includes("worktop"))).toBe(false);

    const door = getMeshNamed(group, "corner_right_door");
    const divider = getMeshNamed(group, "corner_blind_divider");
    const backPanel = getMeshNamed(group, "corner_back_panel");
    const leftSide = getMeshNamed(group, "corner_left_side");
    const frontPlinth = getMeshNamed(group, "corner_plinth_front_board");
    const frontLeftLeg = getMeshNamed(group, "corner_leg_front_left");
    const frontMiddleLeg = getMeshNamed(group, "corner_leg_front_middle");
    const frontLeftClipArm = getMeshNamed(group, "corner_kickClip_front_1_arm");
    const frontMiddleClipArm = getMeshNamed(group, "corner_kickClip_front_2_arm");
    const doorHandle = getMeshNamed(group, "corner_right_door_handle");
    const doorHinge = getMeshNamed(group, "corner_hinge_1");
    expect(door?.userData.materialGroup).toBe("front");
    expect(divider?.userData.materialGroup).toBe("front");
    expect(backPanel?.userData.materialGroup).toBe("back");
    expect(leftSide).toBeTruthy();
    expect(frontPlinth).toBeTruthy();
    expect(doorHandle?.userData.componentType).toBe("handle");
    expect(doorHandle?.userData.catalogComponentId).toBeTruthy();
    expect((doorHandle?.material as { userData?: Record<string, unknown> } | undefined)?.userData?.materialSource).toBe("component");
    expect(doorHinge?.userData.componentType).toBe("hinge");
    expect(doorHinge?.userData.catalogComponentId).toBeTruthy();
    expect((doorHinge?.material as { userData?: Record<string, unknown> } | undefined)?.userData?.materialSource).toBe("component");
    expect(frontLeftLeg?.userData.componentType).toBe("leg");
    expect(frontMiddleLeg?.userData.componentType).toBe("leg");
    expect(frontLeftClipArm?.userData.componentType).toBe("plinth_clip");
    expect(frontMiddleClipArm?.userData.componentType).toBe("plinth_clip");

    const doorBounds = objectBoundsMm(door!);
    const fillerBounds = objectBoundsMm(getMeshNamed(group, "corner_blind_front_filler")!);
    const handleBounds = objectBoundsMm(doorHandle!);
    const hingeBounds = objectBoundsMm(doorHinge!);
    expect(doorBounds.maxX).toBeLessThan(fillerBounds.minX);
    expect(doorHandle?.userData.attachedBoardName).toBe("corner_blind_front_filler");
    expect(fillerBounds.maxX - handleBounds.maxX).toBeCloseTo(40, 1);
    expect(handleBounds.minX).toBeGreaterThan(fillerBounds.minX);
    expect(Math.abs(hingeBounds.maxX - doorBounds.maxX)).toBeLessThan(12);

    const rightHanded = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...defaults, variant: "corner_1d", side: "right", shelfCount: 1, plinthHeight: 100, plinthSetbackMm: 50 },
      catalog
    });
    const rightDoorBounds = objectBoundsMm(getMeshNamed(rightHanded, "corner_right_door")!);
    const rightFillerBounds = objectBoundsMm(getMeshNamed(rightHanded, "corner_blind_front_filler")!);
    const rightHandleBounds = objectBoundsMm(getMeshNamed(rightHanded, "corner_right_door_handle")!);
    const rightHingeBounds = objectBoundsMm(getMeshNamed(rightHanded, "corner_hinge_1")!);
    expect(rightDoorBounds.minX).toBeGreaterThan(rightFillerBounds.maxX);
    expect(rightHandleBounds.minX - rightFillerBounds.minX).toBeCloseTo(40, 1);
    expect(rightHandleBounds.maxX).toBeLessThan(rightFillerBounds.maxX);
    expect(Math.abs(rightHingeBounds.minX - rightDoorBounds.minX)).toBeLessThan(12);

    const frontPlinthBounds = meshBoundsMm(frontPlinth!);
    const frontLeftLegBounds = meshBoundsMm(frontLeftLeg!);
    const frontMiddleLegBounds = meshBoundsMm(frontMiddleLeg!);
    const leftClipBounds = meshBoundsMm(frontLeftClipArm!);
    const middleClipBounds = meshBoundsMm(frontMiddleClipArm!);
    expect(frontPlinthBounds.minZ - frontLeftLegBounds.maxZ).toBeGreaterThan(8);
    expect(frontPlinthBounds.minZ - frontLeftLegBounds.maxZ).toBeLessThan(24);
    expect(frontPlinthBounds.minZ - frontMiddleLegBounds.maxZ).toBeGreaterThan(8);
    expect(frontPlinthBounds.minZ - frontMiddleLegBounds.maxZ).toBeLessThan(24);
    expect(leftClipBounds.maxZ).toBeGreaterThan(frontPlinthBounds.minZ);
    expect(leftClipBounds.minZ).toBeLessThan(frontLeftLegBounds.maxZ);
    expect(middleClipBounds.maxZ).toBeGreaterThan(frontPlinthBounds.minZ);
    expect(middleClipBounds.minZ).toBeLessThan(frontMiddleLegBounds.maxZ);

    const backBounds = meshBoundsMm(backPanel!);
    const leftSideBounds = meshBoundsMm(leftSide!);
    expect(backBounds.minZ - leftSideBounds.minZ).toBeGreaterThan(12);
    expect(backBounds.minZ - leftSideBounds.minZ).toBeLessThan(26);
    expect(backBounds.maxZ).toBeLessThan(leftSideBounds.maxZ);

    const bounds = new Box3().setFromObject(group);
    expect((bounds.max.x - bounds.min.x) * 1000).toBeGreaterThan(850);
    expect((bounds.max.z - bounds.min.z) * 1000).toBeGreaterThan(560);

    const depthSynced = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...defaults, variant: "corner_1d", width: 900, depth: 580, height: 722, plinthHeight: 100, plinthSetbackMm: 50 },
      catalog
    });
    const defaultDepth = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...defaults, variant: "corner_1d", width: 900, depth: 900, height: 722, plinthHeight: 100, plinthSetbackMm: 50 },
      catalog
    });
    const depthSyncedBounds = objectBoundsMm(depthSynced);
    const defaultDepthBounds = objectBoundsMm(defaultDepth);
    expect(depthSyncedBounds.width).toBeCloseTo(defaultDepthBounds.width, 1);
    expect(depthSyncedBounds.depth).toBeCloseTo(580, 1);
    expect(objectBoundsMm(getMeshNamed(depthSynced, "corner_right_door")!).width).toBeCloseTo(objectBoundsMm(getMeshNamed(defaultDepth, "corner_right_door")!).width, 1);
    expect(objectBoundsMm(getMeshNamed(depthSynced, "corner_bottom_panel")!).width).toBeCloseTo(objectBoundsMm(getMeshNamed(defaultDepth, "corner_bottom_panel")!).width, 1);
    expect(objectBoundsMm(getMeshNamed(depthSynced, "corner_right_door")!).minY).toBeCloseTo(100, 2);
    expect(objectBoundsMm(getMeshNamed(depthSynced, "corner_right_door")!).maxY).toBeCloseTo(722, 2);
    expect(objectBoundsMm(getMeshNamed(depthSynced, "corner_blind_front_filler")!).minY).toBeCloseTo(100, 2);
    expect(objectBoundsMm(getMeshNamed(depthSynced, "corner_blind_front_filler")!).maxY).toBeCloseTo(722, 2);

    const opened = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...defaults, variant: "corner_1d", opened: true, plinthHeight: 100, plinthSetbackMm: 50 }, catalog });
    const openedDoor = meshBoundsMm(getMeshNamed(opened, "corner_blind_front_filler")!);
    const openedHandle = meshBoundsMm(getMeshNamed(opened, "corner_right_door_handle")!);
    const openedHinge = meshBoundsMm(getMeshNamed(opened, "corner_hinge_1")!);
    const openedDoorBounds = objectBoundsMm(getMeshNamed(opened, "corner_blind_front_filler")!);
    const openedHingeBounds = objectBoundsMm(getMeshNamed(opened, "corner_hinge_1")!);
    expect(openedDoor.maxZ).toBeGreaterThan(meshBoundsMm(getMeshNamed(group, "corner_blind_front_filler")!).maxZ + 60);
    expect(openedHandle.minZ).toBeGreaterThan(meshBoundsMm(getMeshNamed(group, "corner_right_door_handle")!).minZ + 20);
    expect(openedHandle.minZ).toBeGreaterThanOrEqual(openedDoor.minZ - 5);
    expect(openedHandle.maxZ).toBeLessThanOrEqual(openedDoor.maxZ + 5);
    expect(openedHingeBounds.minX).toBeGreaterThanOrEqual(openedDoorBounds.minX - 5);
    expect(openedHingeBounds.maxX).toBeLessThanOrEqual(openedDoorBounds.maxX + 5);
    expect(Math.abs(openedDoorBounds.minZ - openedHingeBounds.minZ)).toBeLessThan(45);

    const recessedPlinth = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...defaults, variant: "corner_1d", plinthHeight: 100, plinthSetbackMm: 120 }, catalog });
    expect(meshBoundsMm(getMeshNamed(group, "corner_plinth_front_board")!).maxZ - meshBoundsMm(getMeshNamed(recessedPlinth, "corner_plinth_front_board")!).maxZ).toBeCloseTo(70, 2);
    expect(meshBoundsMm(getMeshNamed(group, "corner_leg_front_left")!).maxZ - meshBoundsMm(getMeshNamed(recessedPlinth, "corner_leg_front_left")!).maxZ).toBeCloseTo(70, 2);
    expect(meshBoundsMm(getMeshNamed(group, "corner_leg_front_middle")!).maxZ - meshBoundsMm(getMeshNamed(recessedPlinth, "corner_leg_front_middle")!).maxZ).toBeCloseTo(70, 2);
    expect(meshBoundsMm(getMeshNamed(group, "corner_kickClip_front_1_arm")!).maxZ - meshBoundsMm(getMeshNamed(recessedPlinth, "corner_kickClip_front_1_arm")!).maxZ).toBeCloseTo(70, 2);
    expect(meshBoundsMm(getMeshNamed(group, "corner_kickClip_front_2_arm")!).maxZ - meshBoundsMm(getMeshNamed(recessedPlinth, "corner_kickClip_front_2_arm")!).maxZ).toBeCloseTo(70, 2);
    expect(meshBoundsMm(getMeshNamed(recessedPlinth, "corner_leg_rear_left")!).minZ - meshBoundsMm(getMeshNamed(group, "corner_leg_rear_left")!).minZ).toBeCloseTo(70, 2);

    const taller = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...defaults, variant: "corner_1d", height: 920, plinthHeight: 100, plinthSetbackMm: 50 }, catalog });
    expect(objectBoundsMm(getMeshNamed(taller, "corner_plinth_front_board")!).height).toBeCloseTo(100, 3);
    expect(objectBoundsMm(getMeshNamed(taller, "corner_right_door")!).height).toBeGreaterThan(objectBoundsMm(getMeshNamed(group, "corner_right_door")!).height);
  });

  it("applies catalog base corner shelf count to both 3D shelves and BOM pricing", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = makeDefaultKitchenContext(catalog);
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_corner");
    expect(modulePackage).toBeTruthy();

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const oneShelfParams = { ...defaults, shelfCount: 1 };
    const threeShelfParams = { ...defaults, shelfCount: 3 };

    const oneShelfGroup = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: oneShelfParams, catalog });
    const threeShelfGroup = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: threeShelfParams, catalog });
    const oneShelfMeshes = meshes(oneShelfGroup).filter((mesh) => /^corner_right_shelf_\d+$/.test(mesh.name));
    const threeShelfMeshes = meshes(threeShelfGroup).filter((mesh) => /^corner_right_shelf_\d+$/.test(mesh.name));

    expect(oneShelfMeshes).toHaveLength(1);
    expect(threeShelfMeshes).toHaveLength(3);
    expect(threeShelfMeshes.map((mesh) => mesh.name)).toEqual(["corner_right_shelf_1", "corner_right_shelf_2", "corner_right_shelf_3"]);

    const oneShelfBom = calculateFwmFurnitureBOM(oneShelfParams, ctx, catalog);
    const threeShelfBom = calculateFwmFurnitureBOM(threeShelfParams, ctx, catalog);
    const oneShelfItem = oneShelfBom.quoteBom.items.find((item) => item.id === "corner-right-shelves");
    const threeShelfItem = threeShelfBom.quoteBom.items.find((item) => item.id === "corner-right-shelves");

    expect(oneShelfItem?.quantity).toBe(1);
    expect(threeShelfItem?.quantity).toBe(3);
    expect(threeShelfItem?.metrics?.areaM2 ?? 0).toBeGreaterThan((oneShelfItem?.metrics?.areaM2 ?? 0) * 2.5);
    expect(threeShelfBom.pricing.finalPrice).toBeGreaterThan(oneShelfBom.pricing.finalPrice);
  });

  it("builds the catalog base corner chamfered variant from the approved baked Revit ground truth", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = makeDefaultKitchenContext(catalog);
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_corner");
    expect(modulePackage).toBeTruthy();

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const params = {
      ...defaults,
      variant: "corner_chamfered",
      width: 900,
      depth: 900,
      height: 722,
      heightCarcass: 722,
      requiresWorktop: false,
      hasWorktop: false,
      worktopThicknessMm: 0,
      chamferMm: 420,
      frontChamferMm: 420,
      frontChamferReferenceMm: 420,
      backChamferMm: 200,
      shelfCount: 3,
      doorCount: 1,
      hasPlinth: true,
      plinthHeight: 100
    };
    const group = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: params, catalog });
    const meshList = meshes(group);

    expect(group.userData.sourceGeometry).toBe("revit-ground-truth-baked");
    expect(group.userData.groundTruthPackageId).toBe("base_corner_chamfered");
    expect(group.userData.groundTruthPrimitiveCount).toBe(17);
    expect(group.userData.kitchenCornerRotationOffsetRad).toBeCloseTo(Math.PI / 2);
    expect(meshList).toHaveLength(26);

    const materialGroups = meshList.reduce<Record<string, number>>((acc, mesh) => {
      const groupName = String(mesh.userData.materialGroup ?? "unknown");
      acc[groupName] = (acc[groupName] ?? 0) + 1;
      return acc;
    }, {});
    expect(materialGroups).toMatchObject({
      corpus: 9,
      hardware: 14,
      back: 1,
      front: 1,
      plinth: 1
    });
    expect(getMeshByBoardName(group, "diagonal_plinth_clip_left_collar")).toBeTruthy();
    expect(getMeshByBoardName(group, "diagonal_plinth_clip_left_pad")).toBeTruthy();
    expect(getMeshByBoardName(group, "diagonal_plinth_clip_left_arm")).toBeTruthy();
    expect(getMeshByBoardName(group, "diagonal_plinth_clip_right_collar")).toBeTruthy();
    expect(getMeshByBoardName(group, "diagonal_plinth_clip_right_pad")).toBeTruthy();
    expect(getMeshByBoardName(group, "diagonal_plinth_clip_right_arm")).toBeTruthy();

    const shelfMeshes = meshList.filter((mesh) => String(mesh.userData.boardName ?? "").startsWith("shelf_"));
    expect(shelfMeshes).toHaveLength(3);
    expect(shelfMeshes.every((mesh) => mesh.userData.materialGroup === "corpus")).toBe(true);
    expect(shelfMeshes.map((mesh) => mesh.userData.boardName)).toEqual(["shelf_1", "shelf_2", "shelf_3"]);
    expect(meshList.some((mesh) => String(mesh.userData.partName ?? "").includes("Extrusion"))).toBe(false);
    expect(meshList.some((mesh) => String(mesh.userData.partName ?? "").includes("Joined Solid Geometry"))).toBe(false);
    expect(meshList.every((mesh) => typeof mesh.userData.partName === "string" && mesh.userData.partName.length > 0)).toBe(true);

    const bounds = new Box3().setFromObject(group);
    expect((bounds.max.x - bounds.min.x) * 1000).toBeCloseTo(936.02, 1);
    expect((bounds.max.y - bounds.min.y) * 1000).toBeCloseTo(722, 1);
    expect((bounds.max.z - bounds.min.z) * 1000).toBeCloseTo(936, 1);

    const frontMesh = meshList.find((mesh) => mesh.userData.materialGroup === "front");
    expect(frontMesh?.userData.materialSlotId).toBe("front");
    expect(frontMesh?.userData.renderColorHex).toMatch(/^#[0-9a-f]{6}$/i);
    const plinthMesh = meshList.find((mesh) => mesh.userData.materialGroup === "plinth");
    expect(plinthMesh?.userData.materialSlotId).toBe("plinth");

    const bom = calculateFwmFurnitureBOM(params, ctx, catalog);
    expect(bom.quoteBom.items.some((item) => item.id === "corner-chamfered-shelves")).toBe(true);
    expect(bom.quoteBom.items.some((item) => item.id === "corner-chamfered-top-panel")).toBe(true);
    expect(bom.quoteBom.items.some((item) => item.id === "corner-chamfered-back-corner-panel")).toBe(true);
    expect(bom.quoteBom.items.some((item) => item.id === "corner-chamfered-support-diagonal")).toBe(true);
    expect(bom.quoteBom.items.some((item) => item.id === "corner-chamfered-diagonal-front")).toBe(true);
    expect(bom.pricing.finalPrice).toBeGreaterThan(0);
  });

  it("keeps the chamfered corner depth envelope truthful at the DELFI front-chamfer default", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_corner");
    expect(modulePackage).toBeTruthy();

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const params = {
      ...defaults,
      variant: "corner_chamfered",
      width: 900,
      depth: 900,
      height: 722,
      frontChamferMm: 200,
      frontChamferReferenceMm: 200,
      backChamferMm: 0,
      plinthHeight: 100,
      plinthSetbackMm: 60
    };
    const base = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: params, catalog });
    const smaller = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...params, frontChamferMm: 150 }, catalog });
    const legacyParams = { ...params };
    delete (legacyParams as Record<string, unknown>).frontChamferReferenceMm;
    const legacy = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: legacyParams, catalog });
    const legacyChangedFront = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...legacyParams, frontChamferMm: 420 },
      catalog
    });
    const referenceChangedFront = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...params, frontChamferMm: 420 },
      catalog
    });

    const baseBounds = objectBoundsMm(base);
    const smallerBounds = objectBoundsMm(smaller);
    const legacyBounds = objectBoundsMm(legacy);
    const legacyChangedFrontBounds = objectBoundsMm(legacyChangedFront);
    const referenceChangedFrontBounds = objectBoundsMm(referenceChangedFront);
    const baseFrontRight = objectBoundsMm(getMeshByBoardName(base, "front_right_panel")!);
    const smallerFrontRight = objectBoundsMm(getMeshByBoardName(smaller, "front_right_panel")!);
    expect(baseBounds.width).toBeCloseTo(1136.02, 1);
    expect(baseBounds.depth).toBeCloseTo(1136, 1);
    expect(legacyBounds.width).toBeCloseTo(baseBounds.width, 1);
    expect(legacyBounds.depth).toBeCloseTo(baseBounds.depth, 1);
    expect(legacyChangedFrontBounds.width).toBeCloseTo(referenceChangedFrontBounds.width, 1);
    expect(legacyChangedFrontBounds.depth).toBeCloseTo(referenceChangedFrontBounds.depth, 1);
    expect(smallerBounds.width).toBeCloseTo(baseBounds.width - 50, 1);
    expect(smallerBounds.depth).toBeCloseTo(baseBounds.depth - 50, 1);
    expect(baseFrontRight.width).toBeCloseTo(900, 1);
    expect(smallerFrontRight.width).toBeCloseTo(baseFrontRight.width, 1);

    const syncedDepthParams = { ...params, width: 580, depth: 580 };
    const syncedDepth = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: syncedDepthParams, catalog });
    const syncedDepthBounds = objectBoundsMm(syncedDepth);
    const syncedDepthFrontRight = objectBoundsMm(getMeshByBoardName(syncedDepth, "front_right_panel")!);
    const syncedDepthLeftSide = objectBoundsMm(getMeshByBoardName(syncedDepth, "left_side_panel")!);
    const syncedDepthRightSide = objectBoundsMm(getMeshByBoardName(syncedDepth, "right_side_panel")!);
    expect(syncedDepthBounds.width).toBeCloseTo(816, 1);
    expect(syncedDepthBounds.depth).toBeCloseTo(816, 1);
    expect(syncedDepthFrontRight.width).toBeCloseTo(580, 1);
    expect(syncedDepthLeftSide.depth).toBeCloseTo(580, 1);
    expect(syncedDepthFrontRight.maxX).toBeCloseTo(syncedDepthRightSide.maxX, 1);
    expect(syncedDepthFrontRight.minX).toBeCloseTo(syncedDepthRightSide.maxX - 580, 1);
    expect(syncedDepthFrontRight.minZ).toBeCloseTo(780, 1);
    expect(syncedDepthFrontRight.maxZ).toBeCloseTo(798, 1);

    const assertSquareBackJoin = (root: ReturnType<typeof buildModulePackageGeometryFromPackage>) => {
      expect(getMeshByBoardName(root, "back_corner_panel")).toBeNull();
      const backLeft = objectBoundsMm(getMeshByBoardName(root, "back_left_panel")!);
      const rightSide = objectBoundsMm(getMeshByBoardName(root, "right_side_panel")!);
      expect(backLeft.maxX).toBeCloseTo(rightSide.minX, 1);
      expect(backLeft.maxZ).toBeCloseTo(rightSide.minZ, 1);
    };
    assertSquareBackJoin(base);
    assertSquareBackJoin(syncedDepth);

    const assertDiagonalHardwareBehindPlinth = (root: ReturnType<typeof buildModulePackageGeometryFromPackage>) => {
      const plinth = objectBoundsMm(getMeshByBoardName(root, "diagonal_plinth")!);
      const plinthFrontLine = plinth.minZ - plinth.minX;
      for (const boardName of [
        "leg_diagonal_left",
        "leg_diagonal_right",
        "diagonal_plinth_clip_left_collar",
        "diagonal_plinth_clip_right_collar"
      ]) {
        const hardware = objectBoundsMm(getMeshByBoardName(root, boardName)!);
        expect(hardware.maxZ - hardware.minX, boardName).toBeLessThanOrEqual(plinthFrontLine + 2);
      }
      for (const boardName of ["diagonal_plinth_clip_left_arm", "diagonal_plinth_clip_right_arm"]) {
        const arm = objectBoundsMm(getMeshByBoardName(root, boardName)!);
        expect(arm.maxZ - arm.minX, boardName).toBeGreaterThanOrEqual(plinthFrontLine + 25);
      }
    };
    assertDiagonalHardwareBehindPlinth(base);
    assertDiagonalHardwareBehindPlinth(syncedDepth);

    for (const boardName of ["front_right_panel", "left_side_panel", "top_panel", "bottom_panel", "diagonal_front"]) {
      const mesh = getMeshByBoardName(base, boardName);
      expect(mesh?.userData.edgeBandingStrategy, boardName).toBe("explicit_visible_edges");
      expect(mesh?.userData.edgeBanding?.length, boardName).toBeGreaterThan(0);
    }
  });

  it("parametrizes the baked chamfered corner by coordinates without stretching the plinth height", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_corner");
    expect(modulePackage).toBeTruthy();
    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const baseParams = {
      ...defaults,
      variant: "corner_chamfered",
      width: 900,
      depth: 900,
      height: 722,
      heightCarcass: 722,
      requiresWorktop: false,
      hasWorktop: false,
      worktopThicknessMm: 0,
      chamferMm: 420,
      frontChamferMm: 420,
      frontChamferReferenceMm: 420,
      backChamferMm: 200,
      plinthHeight: 100,
      plinthSetbackMm: 60
    };
    const base = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: baseParams, catalog });
    const widthIgnored = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...baseParams, width: 1040 }, catalog });
    const deeper = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...baseParams, depth: 1080 }, catalog });
    const taller = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...baseParams, height: 822 }, catalog });
    const tallerPlinth = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...baseParams, height: 822, plinthHeight: 130 }, catalog });
    const deeperPlinthSetback = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...baseParams, plinthSetbackMm: 100 }, catalog });
    const smallerFrontChamfer = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...baseParams, frontChamferMm: 360 }, catalog });
    const largerFrontChamfer = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...baseParams, frontChamferMm: 520 }, catalog });
    const largerBackChamfer = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...baseParams, backChamferMm: 300 }, catalog });
    const squareBack = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: { ...baseParams, backChamferMm: 0 }, catalog });

    const baseBounds = objectBoundsMm(base);
    const sourceBounds = rawGroundTruthBoundsMm(baseCornerChamferedGroundTruth);
    expect(baseBounds.minX).toBeCloseTo(sourceBounds.minX, 2);
    expect(baseBounds.maxX).toBeCloseTo(sourceBounds.maxX, 2);
    expect(baseBounds.width).toBeCloseTo(sourceBounds.width, 2);
    expect(baseBounds.minZ).toBeCloseTo(sourceBounds.minZ, 2);
    expect(baseBounds.maxZ).toBeCloseTo(sourceBounds.maxZ, 2);
    expect(baseBounds.depth).toBeCloseTo(sourceBounds.depth, 2);
    expect(baseBounds.height).toBeCloseTo(sourceBounds.height, 2);
    const cornerAnchor = base.getObjectByName("__kitchen_corner_anchor");
    const cornerXAnchor = base.getObjectByName("__kitchen_corner_x_anchor");
    const cornerZAnchor = base.getObjectByName("__kitchen_corner_z_anchor");
    expect(cornerAnchor?.position.x ? cornerAnchor.position.x * 1000 : 0).toBeCloseTo(baseBounds.minX, 1);
    expect(cornerAnchor?.position.z ? cornerAnchor.position.z * 1000 : 0).toBeCloseTo(baseBounds.minZ, 1);
    expect(cornerXAnchor?.position.x ? cornerXAnchor.position.x * 1000 : 0).toBeCloseTo(baseBounds.maxX, 1);
    expect(cornerXAnchor?.position.z ? cornerXAnchor.position.z * 1000 : 0).toBeCloseTo(baseBounds.minZ, 1);
    expect(cornerZAnchor?.position.x ? cornerZAnchor.position.x * 1000 : 0).toBeCloseTo(baseBounds.minX, 1);
    expect(cornerZAnchor?.position.z ? cornerZAnchor.position.z * 1000 : 0).toBeCloseTo(baseBounds.maxZ, 1);
    const diagonalHandle = getMeshByBoardName(base, "diagonal_handle");
    const diagonalHinge = getMeshByBoardName(base, "hinge_lower");
    expect(diagonalHandle?.userData.componentType).toBe("handle");
    expect(diagonalHandle?.userData.catalogComponentId).toBeTruthy();
    expect((diagonalHandle?.material as { userData?: Record<string, unknown> } | undefined)?.userData?.materialSource).toBe("component");
    expect(diagonalHinge?.userData.componentType).toBe("hinge");
    expect(diagonalHinge?.userData.catalogComponentId).toBeTruthy();
    expect((diagonalHinge?.material as { userData?: Record<string, unknown> } | undefined)?.userData?.materialSource).toBe("component");

    const widthIgnoredBounds = objectBoundsMm(widthIgnored);
    const deeperBounds = objectBoundsMm(deeper);
    expect(widthIgnoredBounds.width).toBeCloseTo(baseBounds.width, 1);
    expect(widthIgnoredBounds.depth).toBeCloseTo(baseBounds.depth, 1);
    expect(deeperBounds.minZ).toBeCloseTo(baseBounds.minZ, 2);
    expect(deeperBounds.width - baseBounds.width).toBeCloseTo(180, 1);
    expect(deeperBounds.depth - baseBounds.depth).toBeCloseTo(180, 1);

    const baseLeft = objectBoundsMm(getMeshByBoardName(base, "left_side_panel")!);
    const baseRight = objectBoundsMm(getMeshByBoardName(base, "right_side_panel")!);
    const deeperLeft = objectBoundsMm(getMeshByBoardName(deeper, "left_side_panel")!);
    const deeperRight = objectBoundsMm(getMeshByBoardName(deeper, "right_side_panel")!);
    expect(deeperLeft.minX).toBeCloseTo(baseLeft.minX, 2);
    expect(deeperRight.minX - baseRight.minX).toBeCloseTo(180, 1);

    const baseBack = objectBoundsMm(getMeshByBoardName(base, "back_left_panel")!);
    const deeperBack = objectBoundsMm(getMeshByBoardName(deeper, "back_left_panel")!);
    const baseFront = objectBoundsMm(getMeshByBoardName(base, "front_right_panel")!);
    const deeperFront = objectBoundsMm(getMeshByBoardName(deeper, "front_right_panel")!);
    expect(deeperBack.maxZ).toBeCloseTo(baseBack.maxZ, 2);
    expect(deeperFront.minZ - baseFront.minZ).toBeCloseTo(180, 1);

    const baseTop = objectBoundsMm(getMeshByBoardName(base, "top_panel")!);
    const baseBottom = objectBoundsMm(getMeshByBoardName(base, "bottom_panel")!);
    expect(baseTop.minX).toBeCloseTo(baseBottom.minX, 1);
    expect(baseTop.maxX).toBeCloseTo(baseBottom.maxX, 1);
    expect(baseTop.minZ).toBeCloseTo(baseBottom.minZ, 1);
    expect(baseTop.maxZ).toBeCloseTo(baseBottom.maxZ, 1);

    const basePlinth = objectBoundsMm(getMeshByBoardName(base, "diagonal_plinth")!);
    const tallerPlinthSameHeight = objectBoundsMm(getMeshByBoardName(taller, "diagonal_plinth")!);
    const topTaller = objectBoundsMm(getMeshByBoardName(taller, "top_panel")!);
    expect(tallerPlinthSameHeight.height).toBeCloseTo(basePlinth.height, 2);
    expect(topTaller.maxY).toBeCloseTo(822, 1);

    const plinth130 = objectBoundsMm(getMeshByBoardName(tallerPlinth, "diagonal_plinth")!);
    expect(plinth130.height).toBeCloseTo(130, 1);
    expect(objectBoundsMm(tallerPlinth).maxY).toBeCloseTo(822, 1);

    const setbackPlinth = objectBoundsMm(getMeshByBoardName(deeperPlinthSetback, "diagonal_plinth")!);
    expect(setbackPlinth.minX - basePlinth.minX).toBeCloseTo(40, 1);
    expect(setbackPlinth.maxZ - basePlinth.maxZ).toBeCloseTo(-40, 1);
    const baseSetbackDiagonalLeg = objectBoundsMm(getMeshByBoardName(base, "leg_diagonal_left")!);
    const setbackDiagonalLeg = objectBoundsMm(getMeshByBoardName(deeperPlinthSetback, "leg_diagonal_left")!);
    const baseSetbackClip = objectBoundsMm(getMeshByBoardName(base, "diagonal_plinth_clip_left_collar")!);
    const setbackClip = objectBoundsMm(getMeshByBoardName(deeperPlinthSetback, "diagonal_plinth_clip_left_collar")!);
    expect(setbackDiagonalLeg.width).toBeCloseTo(baseSetbackDiagonalLeg.width, 1);
    expect(setbackDiagonalLeg.depth).toBeCloseTo(baseSetbackDiagonalLeg.depth, 1);
    expect(setbackDiagonalLeg.minX).toBeGreaterThan(baseSetbackDiagonalLeg.minX);
    expect(setbackDiagonalLeg.maxZ).toBeLessThan(baseSetbackDiagonalLeg.maxZ);
    expect(setbackClip.width).toBeCloseTo(baseSetbackClip.width, 1);
    expect(setbackClip.depth).toBeCloseTo(baseSetbackClip.depth, 1);
    expect((setbackClip.minX + setbackClip.maxX) / 2).toBeGreaterThan((baseSetbackClip.minX + baseSetbackClip.maxX) / 2);
    expect((setbackClip.minZ + setbackClip.maxZ) / 2).toBeLessThan((baseSetbackClip.minZ + baseSetbackClip.maxZ) / 2);

    const baseBottomForBack = objectBoundsMm(getMeshByBoardName(base, "bottom_panel")!);
    const baseBackForAlignment = objectBoundsMm(getMeshByBoardName(base, "back_left_panel")!);
    expect(baseBackForAlignment.minY).toBeCloseTo(baseBottomForBack.maxY, 1);

    const baseDiagonalFront = objectBoundsMm(getMeshByBoardName(base, "diagonal_front")!);
    const smallerFrontChamferFront = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "diagonal_front")!);
    expect(smallerFrontChamferFront.maxX - baseDiagonalFront.maxX).toBeCloseTo(-60, 1);
    expect(smallerFrontChamferFront.maxZ - baseDiagonalFront.maxZ).toBeCloseTo(-60, 1);
    const largerFrontChamferFront = objectBoundsMm(getMeshByBoardName(largerFrontChamfer, "diagonal_front")!);
    expect(largerFrontChamferFront.maxX - baseDiagonalFront.maxX).toBeCloseTo(100, 1);
    expect(largerFrontChamferFront.maxZ - baseDiagonalFront.maxZ).toBeCloseTo(100, 1);
    expect(largerFrontChamferFront.width).toBeGreaterThan(baseDiagonalFront.width);
    expect(largerFrontChamferFront.depth).toBeGreaterThan(baseDiagonalFront.depth);
    const smallerFrontChamferLeft = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "left_side_panel")!);
    const smallerFrontChamferRightFront = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "front_right_panel")!);
    const largerFrontChamferLeft = objectBoundsMm(getMeshByBoardName(largerFrontChamfer, "left_side_panel")!);
    const largerFrontChamferRightFront = objectBoundsMm(getMeshByBoardName(largerFrontChamfer, "front_right_panel")!);
    const smallerFrontChamferTop = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "top_panel")!);
    const smallerFrontChamferBottom = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "bottom_panel")!);
    const smallerFrontChamferRightSide = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "right_side_panel")!);
    const smallerFrontChamferBackLeft = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "back_left_panel")!);
    const largerFrontChamferTop = objectBoundsMm(getMeshByBoardName(largerFrontChamfer, "top_panel")!);
    const largerFrontChamferBottom = objectBoundsMm(getMeshByBoardName(largerFrontChamfer, "bottom_panel")!);
    const largerFrontChamferRightSide = objectBoundsMm(getMeshByBoardName(largerFrontChamfer, "right_side_panel")!);
    const largerFrontChamferBackLeft = objectBoundsMm(getMeshByBoardName(largerFrontChamfer, "back_left_panel")!);
    const baseHandle = objectBoundsMm(getMeshByBoardName(base, "diagonal_handle")!);
    const smallerFrontChamferHandle = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "diagonal_handle")!);
    const baseHinge = objectBoundsMm(getMeshByBoardName(base, "hinge_lower")!);
    const smallerFrontChamferHinge = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "hinge_lower")!);
    const baseDiagonalLeg = objectBoundsMm(getMeshByBoardName(base, "leg_diagonal_left")!);
    const smallerFrontChamferDiagonalLeg = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "leg_diagonal_left")!);
    const smallerFrontChamferDiagonalLegRight = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "leg_diagonal_right")!);
    const smallerFrontChamferLeftClip = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "diagonal_plinth_clip_left_collar")!);
    const smallerFrontChamferRightClip = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "diagonal_plinth_clip_right_collar")!);
    const smallerFrontChamferLeftClipArm = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "diagonal_plinth_clip_left_arm")!);
    const smallerFrontChamferRightClipArm = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "diagonal_plinth_clip_right_arm")!);
    const smallerFrontChamferPlinth = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "diagonal_plinth")!);
    const baseFrontRightLeg = objectBoundsMm(getMeshByBoardName(base, "leg_front_right")!);
    const smallerFrontChamferFrontRightLeg = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "leg_front_right")!);
    const baseBackRightLeg = objectBoundsMm(getMeshByBoardName(base, "leg_back_right")!);
    const smallerFrontChamferBackRightLeg = objectBoundsMm(getMeshByBoardName(smallerFrontChamfer, "leg_back_right")!);
    expect(smallerFrontChamferLeft.depth).toBeCloseTo(baseLeft.depth, 1);
    expect(largerFrontChamferLeft.depth).toBeCloseTo(baseLeft.depth, 1);
    expect(smallerFrontChamferRightFront.width).toBeCloseTo(baseFront.width, 1);
    expect(largerFrontChamferRightFront.width).toBeCloseTo(baseFront.width, 1);
    expect(smallerFrontChamferRightFront.minX - baseFront.minX).toBeCloseTo(-60, 1);
    expect(smallerFrontChamferRightFront.minZ - baseFront.minZ).toBeCloseTo(-60, 1);
    expect(smallerFrontChamferRightFront.maxZ).toBeCloseTo(smallerFrontChamferFront.maxZ, 1);
    expect(smallerFrontChamferTop.maxZ).toBeCloseTo(smallerFrontChamferFront.maxZ, 1);
    expect(smallerFrontChamferRightFront.maxX).toBeCloseTo(smallerFrontChamferRightSide.maxX, 1);
    expect(smallerFrontChamferTop.maxX).toBeCloseTo(smallerFrontChamferRightSide.maxX, 1);
    expect(smallerFrontChamferBottom.maxZ).toBeCloseTo(smallerFrontChamferFront.maxZ, 1);
    expect(smallerFrontChamferBottom.maxX).toBeCloseTo(smallerFrontChamferRightSide.maxX, 1);
    expect(smallerFrontChamferRightSide.maxZ).toBeCloseTo(smallerFrontChamferRightFront.minZ, 1);
    expect(smallerFrontChamferRightSide.depth).toBeCloseTo(baseRight.depth - 60, 1);
    expect(smallerFrontChamferBackLeft.width).toBeCloseTo(baseBack.width - 60, 1);
    expect(smallerFrontChamferHandle.width).toBeCloseTo(baseHandle.width, 1);
    expect(smallerFrontChamferHandle.depth).toBeCloseTo(baseHandle.depth, 1);
    expect((smallerFrontChamferHandle.minX + smallerFrontChamferHandle.maxX) / 2).toBeLessThan((baseHandle.minX + baseHandle.maxX) / 2 - 10);
    expect((smallerFrontChamferHandle.minZ + smallerFrontChamferHandle.maxZ) / 2).toBeLessThan((baseHandle.minZ + baseHandle.maxZ) / 2 - 10);
    expect(smallerFrontChamferHinge.width).toBeCloseTo(baseHinge.width, 1);
    expect(smallerFrontChamferHinge.depth).toBeCloseTo(baseHinge.depth, 1);
    expect(smallerFrontChamferDiagonalLeg.width).toBeCloseTo(baseDiagonalLeg.width, 1);
    expect(smallerFrontChamferDiagonalLeg.depth).toBeCloseTo(baseDiagonalLeg.depth, 1);
    const plinthFrontLine = smallerFrontChamferPlinth.minZ - smallerFrontChamferPlinth.minX;
    expect(smallerFrontChamferDiagonalLeg.maxZ - smallerFrontChamferDiagonalLeg.minX).toBeLessThanOrEqual(plinthFrontLine + 2);
    expect(smallerFrontChamferDiagonalLegRight.maxZ - smallerFrontChamferDiagonalLegRight.minX).toBeLessThanOrEqual(plinthFrontLine + 2);
    expect(smallerFrontChamferLeftClipArm.maxZ - smallerFrontChamferLeftClipArm.minX).toBeGreaterThanOrEqual(plinthFrontLine + 25);
    expect(smallerFrontChamferRightClipArm.maxZ - smallerFrontChamferRightClipArm.minX).toBeGreaterThanOrEqual(plinthFrontLine + 25);
    expect(Math.abs(((smallerFrontChamferLeftClip.minX + smallerFrontChamferLeftClip.maxX) / 2) - ((smallerFrontChamferDiagonalLeg.minX + smallerFrontChamferDiagonalLeg.maxX) / 2))).toBeLessThan(15);
    expect((smallerFrontChamferLeftClip.minZ + smallerFrontChamferLeftClip.maxZ) / 2).toBeGreaterThan((smallerFrontChamferDiagonalLeg.minZ + smallerFrontChamferDiagonalLeg.maxZ) / 2);
    expect(Math.abs(((smallerFrontChamferRightClip.minX + smallerFrontChamferRightClip.maxX) / 2) - ((smallerFrontChamferDiagonalLegRight.minX + smallerFrontChamferDiagonalLegRight.maxX) / 2))).toBeLessThan(15);
    expect((smallerFrontChamferRightClip.minZ + smallerFrontChamferRightClip.maxZ) / 2).toBeGreaterThan((smallerFrontChamferDiagonalLegRight.minZ + smallerFrontChamferDiagonalLegRight.maxZ) / 2);
    expect(smallerFrontChamferFrontRightLeg.width).toBeCloseTo(baseFrontRightLeg.width, 1);
    expect(smallerFrontChamferFrontRightLeg.depth).toBeCloseTo(baseFrontRightLeg.depth, 1);
    expect(smallerFrontChamferFrontRightLeg.minX - baseFrontRightLeg.minX).toBeCloseTo(-60, 1);
    expect(smallerFrontChamferFrontRightLeg.minZ - baseFrontRightLeg.minZ).toBeCloseTo(-60, 1);
    expect(smallerFrontChamferFrontRightLeg.maxX).toBeLessThanOrEqual(smallerFrontChamferTop.maxX + 1);
    expect(smallerFrontChamferFrontRightLeg.maxZ).toBeLessThanOrEqual(smallerFrontChamferTop.maxZ + 1);
    expect(smallerFrontChamferBackRightLeg.width).toBeCloseTo(baseBackRightLeg.width, 1);
    expect(smallerFrontChamferBackRightLeg.depth).toBeCloseTo(baseBackRightLeg.depth, 1);
    expect(smallerFrontChamferBackRightLeg.minX - baseBackRightLeg.minX).toBeCloseTo(-60, 1);
    expect(smallerFrontChamferBackRightLeg.minZ).toBeCloseTo(baseBackRightLeg.minZ, 1);
    expect(smallerFrontChamferBackRightLeg.maxX).toBeLessThanOrEqual(smallerFrontChamferTop.maxX + 1);
    expect((smallerFrontChamferHandle.minX + smallerFrontChamferHandle.maxX) / 2).toBeLessThan(smallerFrontChamferFront.maxX + 5);
    expect((smallerFrontChamferHandle.minZ + smallerFrontChamferHandle.maxZ) / 2).toBeLessThan(smallerFrontChamferFront.maxZ + 5);
    expect(largerFrontChamferRightFront.minX - baseFront.minX).toBeCloseTo(100, 1);
    expect(largerFrontChamferRightFront.minZ - baseFront.minZ).toBeCloseTo(100, 1);
    expect(largerFrontChamferRightFront.maxZ).toBeCloseTo(largerFrontChamferFront.maxZ, 1);
    expect(largerFrontChamferTop.maxZ).toBeCloseTo(largerFrontChamferFront.maxZ, 1);
    expect(largerFrontChamferRightFront.maxX).toBeCloseTo(largerFrontChamferRightSide.maxX, 1);
    expect(largerFrontChamferTop.maxX).toBeCloseTo(largerFrontChamferRightSide.maxX, 1);
    expect(largerFrontChamferBottom.maxZ).toBeCloseTo(largerFrontChamferFront.maxZ, 1);
    expect(largerFrontChamferBottom.maxX).toBeCloseTo(largerFrontChamferRightSide.maxX, 1);
    expect(largerFrontChamferRightSide.maxZ).toBeCloseTo(largerFrontChamferRightFront.minZ, 1);
    expect(largerFrontChamferRightSide.depth).toBeCloseTo(baseRight.depth + 100, 1);
    expect(largerFrontChamferBackLeft.width).toBeCloseTo(baseBack.width + 100, 1);
    const baseBackCorner = objectBoundsMm(getMeshByBoardName(base, "back_corner_panel")!);
    const frontOnlyBackCorner = objectBoundsMm(getMeshByBoardName(largerFrontChamfer, "back_corner_panel")!);
    expect(frontOnlyBackCorner.minX - baseBackCorner.minX).toBeCloseTo(100, 1);
    expect(frontOnlyBackCorner.maxX - baseBackCorner.maxX).toBeCloseTo(100, 1);
    expect(frontOnlyBackCorner.maxZ).toBeCloseTo(baseBackCorner.maxZ, 1);
    const largerBackChamferBackCorner = objectBoundsMm(getMeshByBoardName(largerBackChamfer, "back_corner_panel")!);
    expect(largerBackChamferBackCorner.minX - baseBackCorner.minX).toBeCloseTo(-100, 1);
    expect(largerBackChamferBackCorner.maxZ - baseBackCorner.maxZ).toBeCloseTo(100, 1);
    const baseBackLeft = objectBoundsMm(getMeshByBoardName(base, "back_left_panel")!);
    const largerBackChamferBackLeft = objectBoundsMm(getMeshByBoardName(largerBackChamfer, "back_left_panel")!);
    expect(largerBackChamferBackLeft.maxX - baseBackLeft.maxX).toBeCloseTo(-100, 1);
    const baseRightSide = objectBoundsMm(getMeshByBoardName(base, "right_side_panel")!);
    const largerBackChamferRightSide = objectBoundsMm(getMeshByBoardName(largerBackChamfer, "right_side_panel")!);
    expect(largerBackChamferRightSide.minZ - baseRightSide.minZ).toBeCloseTo(100, 1);
    const largerFrontChamferPlinth = objectBoundsMm(getMeshByBoardName(largerFrontChamfer, "diagonal_plinth")!);
    expect(largerFrontChamferPlinth.maxX - basePlinth.maxX).toBeCloseTo(100, 1);
    expect(largerFrontChamferPlinth.maxZ - basePlinth.maxZ).toBeCloseTo(100, 1);
    expect(getMeshByBoardName(squareBack, "back_corner_panel")).toBeNull();
    expect(meshes(squareBack)).toHaveLength(22);
    const squareBackBackLeft = objectBoundsMm(getMeshByBoardName(squareBack, "back_left_panel")!);
    const squareBackRightSide = objectBoundsMm(getMeshByBoardName(squareBack, "right_side_panel")!);
    expect(squareBackBackLeft.maxX - baseBackLeft.maxX).toBeCloseTo(200, 1);
    expect(squareBackRightSide.minZ - baseRightSide.minZ).toBeCloseTo(-200, 1);
  });

  it("uses the existing L-corner geometry and BOM when catalog base corner variant is corner_90", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = makeDefaultKitchenContext(catalog);
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_corner");
    expect(modulePackage).toBeTruthy();
    const coverage = DELFI_CATALOG_COVERAGE.find((entry) => entry.id === "base_corner");
    const packageParams = new Set(modulePackage!.parameters.parameters.map((parameter) => parameter.key));
    for (const key of coverage?.requiredParameters ?? []) {
      expect(packageParams.has(key), `base_corner missing catalog parameter ${key}`).toBe(true);
    }

    const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
    const bodyMaterialId = materialIdForFamily(catalog, "body");
    const frontMaterialId = materialIdForFamily(catalog, "front");
    const backMaterialId = materialIdForFamily(catalog, "back");
    const shelfMaterialId = materialIdForFamily(catalog, "body", [bodyMaterialId]) || bodyMaterialId;
    const plinthMaterialId = materialIdForFamily(catalog, "body", [bodyMaterialId, shelfMaterialId]) || bodyMaterialId;
    const params = {
      ...defaults,
      variant: "corner_90",
      width: 900,
      depth: 900,
      height: 722,
      doorCount: 2,
      shelfCount: 4,
      bodyMaterialId,
      frontMaterialId,
      backMaterialId,
      shelfMaterialId,
      plinthMaterialId
    };
    const group = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: params, catalog });
    const meshNames = new Set(meshes(group).map((mesh) => mesh.name));

    expect(meshNames.has("door_front_z")).toBe(true);
    expect(meshNames.has("door_front_x")).toBe(true);
    expect(meshNames.has("shelf_1_x")).toBe(true);
    expect(meshNames.has("shelf_1_z")).toBe(true);
    expect(meshNames.has("hinge_front_z_1_door_plate")).toBe(true);
    expect([...meshNames].some((name) => name.startsWith("corner90_x_run_"))).toBe(false);
    expect([...meshNames].some((name) => name.startsWith("corner90_z_run_"))).toBe(false);
    expect(meshNames.has("corner_right_door")).toBe(false);
    expect(meshNames.has("corner_blind_front_filler")).toBe(false);
    expect(getMeshNamed(group, "kick_x")?.userData.materialGroup).toBe("plinth");
    expect(getMeshNamed(group, "leg_outer_x_front")?.userData.materialGroup).toBe("hardware");
    expect(getMeshNamed(group, "bottom_x")?.userData.catalogMaterialId).toBe(bodyMaterialId);
    expect(getMeshNamed(group, "door_front_z")?.userData.catalogMaterialId).toBe(frontMaterialId);
    expect(getMeshNamed(group, "back_x")?.userData.catalogMaterialId).toBe(backMaterialId);
    expect(getMeshNamed(group, "shelf_1_x")?.userData.catalogMaterialId).toBe(shelfMaterialId);
    expect(getMeshNamed(group, "kick_x")?.userData.catalogMaterialId).toBe(plinthMaterialId);
    expect(getMeshNamed(group, "door_front_z")?.userData.materialRequest).toBeUndefined();
    const copiedHandle = getMeshNamed(group, "doorHandle_front_z");
    const copiedHandleX = getMeshNamed(group, "doorHandle_front_x");
    const copiedHinge = getMeshNamed(group, "hinge_front_z_1_door_plate");
    expect(copiedHandle?.userData.componentType).toBe("handle");
    expect(copiedHandle?.userData.catalogComponentId).toBeTruthy();
    expect((copiedHandle?.material as { userData?: Record<string, unknown> } | undefined)?.userData?.materialSource).toBe("component");
    expect(copiedHandle?.geometry.type).toBe("CylinderGeometry");
    expect(copiedHandleX?.geometry.type).toBe("CylinderGeometry");
    expect(copiedHinge?.userData.componentType).toBe("hinge");
    expect(copiedHinge?.userData.catalogComponentId).toBeTruthy();
    expect((copiedHinge?.material as { userData?: Record<string, unknown> } | undefined)?.userData?.materialSource).toBe("component");

    const bounds = new Box3().setFromObject(group);
    expect((bounds.max.x - bounds.min.x) * 1000).toBeGreaterThan(860);
    expect((bounds.max.z - bounds.min.z) * 1000).toBeGreaterThan(860);

    const worktopDepthGroup = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...params, depth: 580, heightCarcass: 722, requiresWorktop: false, hasWorktop: false, worktopThicknessMm: 0 },
      catalog
    });
    const oversizedDepthGroup = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...params, depth: 900, heightCarcass: 722, requiresWorktop: false, hasWorktop: false, worktopThicknessMm: 0 },
      catalog
    });
    const depth580BottomX = objectBoundsMm(getMeshNamed(worktopDepthGroup, "bottom_x")!);
    const depth900BottomX = objectBoundsMm(getMeshNamed(oversizedDepthGroup, "bottom_x")!);
    const depth580DoorX = objectBoundsMm(getMeshNamed(worktopDepthGroup, "door_front_x")!);
    const depth580DoorZ = objectBoundsMm(getMeshNamed(worktopDepthGroup, "door_front_z")!);
    const depth580SideEndX = objectBoundsMm(getMeshNamed(worktopDepthGroup, "side_end_x")!);
    const depth580SideEndZ = objectBoundsMm(getMeshNamed(worktopDepthGroup, "side_end_z")!);
    const depth900DoorX = objectBoundsMm(getMeshNamed(oversizedDepthGroup, "door_front_x")!);
    const depth900DoorZ = objectBoundsMm(getMeshNamed(oversizedDepthGroup, "door_front_z")!);
    expect(depth580BottomX.width).toBeCloseTo(depth900BottomX.width, 1);
    expect(depth580BottomX.depth).toBeCloseTo(562, 1);
    expect(depth580DoorX.depth).toBeGreaterThan(250);
    expect(depth580DoorZ.width).toBeGreaterThan(250);
    expect(depth580DoorZ.minX).toBeGreaterThanOrEqual(depth580SideEndZ.maxX - 1);
    expect(depth580DoorZ.maxX).toBeLessThanOrEqual(depth580SideEndX.minX + 1);
    expect(depth580DoorX.minZ).toBeGreaterThanOrEqual(depth580SideEndX.maxZ - 1);
    expect(depth580DoorX.maxZ).toBeLessThanOrEqual(depth580SideEndZ.minZ + 1);
    expect(depth580DoorZ.minZ).toBeCloseTo(depth580SideEndX.maxZ + 0.2, 1);
    expect(depth580DoorX.minX).toBeCloseTo(depth580SideEndZ.maxX + 0.2, 1);
    expect(depth900DoorX.depth).toBeGreaterThan(200);
    expect(depth900DoorZ.width).toBeGreaterThan(200);
    expect(depth580DoorX.minY).toBeCloseTo(100, 2);
    expect(depth580DoorX.maxY).toBeCloseTo(722, 2);
    expect(depth580DoorZ.minY).toBeCloseTo(100, 2);
    expect(depth580DoorZ.maxY).toBeCloseTo(722, 2);

    const staleInternalDoorOpen = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...params, opened: false, doorOpen: true, requiresWorktop: false, hasWorktop: false, worktopThicknessMm: 0 },
      catalog
    });
    expect(staleInternalDoorOpen.getObjectByName("__corner_door_pivot_z")).toBeUndefined();
    expect(staleInternalDoorOpen.getObjectByName("__corner_door_pivot_x")).toBeUndefined();
    expect(objectBoundsMm(getMeshNamed(staleInternalDoorOpen, "door_front_z")!).depth).toBeCloseTo(18, 1);
    expect(objectBoundsMm(getMeshNamed(staleInternalDoorOpen, "door_front_x")!).width).toBeCloseTo(18, 1);

    const openedCorner90 = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...params, opened: true, doorOpen: true, requiresWorktop: false, hasWorktop: false, worktopThicknessMm: 0 },
      catalog
    });
    const openedDoorZ = objectBoundsMm(getMeshNamed(openedCorner90, "door_front_z")!);
    const openedHandleZ = objectBoundsMm(getMeshNamed(openedCorner90, "doorHandle_front_z")!);
    const openedDoorX = objectBoundsMm(getMeshNamed(openedCorner90, "door_front_x")!);
    const openedHandleX = objectBoundsMm(getMeshNamed(openedCorner90, "doorHandle_front_x")!);
    expect(Math.abs(openedHandleZ.maxX - openedDoorZ.minX)).toBeLessThan(5);
    expect(Math.abs(openedHandleX.maxZ - openedDoorX.minZ)).toBeLessThan(5);

    const bom = calculateFwmFurnitureBOM(params, ctx, catalog);
    const ids = new Set(bom.quoteBom.items.map((item) => item.id));
    expect(bom.moduleType).toBe("fwm_catalog_base_corner");
    expect(bom.quoteBom.moduleType).toBe("fwm_catalog_base_corner");
    expect(ids.has("door-front-z")).toBe(true);
    expect(ids.has("door-front-x")).toBe(true);
    expect(ids.has("shelves-x")).toBe(true);
    expect(ids.has("shelves-z")).toBe(true);
    expect(ids.has("corner-hinges")).toBe(true);
    expect(ids.has("corner-right-door")).toBe(false);

    const defaultGroup = buildModulePackageGeometryFromPackage({
      modulePackage: modulePackage!,
      parameters: { ...defaults, variant: "corner_90", width: 900, depth: 900, height: 722, shelfCount: 4 },
      catalog
    });
    const defaultBodyMaterialId = getMeshNamed(defaultGroup, "bottom_x")?.userData.catalogMaterialId;
    expect(getMeshNamed(defaultGroup, "back_x")?.userData.catalogMaterialId).toBe(defaultBodyMaterialId);
    expect(getMeshNamed(defaultGroup, "shelf_1_x")?.userData.catalogMaterialId).toBe(defaultBodyMaterialId);
    expect(getMeshNamed(defaultGroup, "kick_x")?.userData.catalogMaterialId).toBe(defaultBodyMaterialId);
  });

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

  it("recalculates catalog board pricing when dimensions change", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = makeDefaultKitchenContext(catalog);
    const dimensionPricedTypes = [
      "fwm_catalog_worktop_surface",
      "fwm_catalog_cladding_panel",
      "fwm_catalog_free_shelf",
      "fwm_catalog_trim_component",
      "fwm_catalog_front_component"
    ];

    for (const moduleType of dimensionPricedTypes) {
      const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === moduleType);
      expect(modulePackage).toBeTruthy();
      const defaults = createDefaultModulePackageParameters(modulePackage!) as FwmFurnitureParams;
      const base = calculateFwmFurnitureBOM(defaults, ctx, catalog);
      const enlarged = calculateFwmFurnitureBOM({
        ...defaults,
        width: (defaults.width as number) * 1.5,
        depth: (defaults.depth as number) * 1.5,
        height: ["fwm_catalog_cladding_panel", "fwm_catalog_trim_component", "fwm_catalog_front_component"].includes(moduleType)
          ? (defaults.height as number) * 1.25
          : defaults.height
      } as FwmFurnitureParams, ctx, catalog);
      const baseBoardArea = base.quoteBom.items
        .filter((item) => item.itemType === "board")
        .reduce((sum, item) => sum + item.pricingQuantity, 0);
      const enlargedBoardArea = enlarged.quoteBom.items
        .filter((item) => item.itemType === "board")
        .reduce((sum, item) => sum + item.pricingQuantity, 0);
      expect(enlargedBoardArea, moduleType).toBeGreaterThan(baseBoardArea);
      expect(enlarged.pricing.finalPrice, moduleType).toBeGreaterThan(base.pricing.finalPrice);
    }
  });

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
        expect(params.bodyMaterialGroup, `${modulePackage.module.moduleType} ${mode}`).toBe("corpus");
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

    for (const modulePackage of extendedFurnitureModulePackages.filter((entry) => entry.behavior?.contextBindings?.length)) {
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
        if (usesKitchenWorktopBinding(normalized)) {
          expect(normalized.worktopThicknessMm, modulePackage.module.moduleType).toBe(ctx.worktopThicknessMm);
        }
      }
      expect(normalized.bodyMaterialId, modulePackage.module.moduleType).toBe(ctx.corpusMaterialId);
      if (modulePackage.module.moduleType === "fwm_catalog_wall_open_end") {
        expect(normalized.frontMaterialId, modulePackage.module.moduleType).toBeUndefined();
        expect(normalized.shelfMaterialId, modulePackage.module.moduleType).toBe(ctx.corpusMaterialId);
        expect(normalized.backMaterialId, modulePackage.module.moduleType).toBeUndefined();
        expect(normalized.drawerBottomMaterialId, modulePackage.module.moduleType).toBeUndefined();
        expect(normalized.plinthMaterialId, modulePackage.module.moduleType).toBeUndefined();
      } else {
        expect(normalized.frontMaterialId, modulePackage.module.moduleType).toBe(ctx.frontsMaterialId);
        expect(normalized.shelfMaterialId, modulePackage.module.moduleType).toBe(ctx.corpusMaterialId);
        if (Number(createDefaultModulePackageParameters(modulePackage).drawerCount ?? 0) > 0) {
          expect(normalized.drawerBottomMaterialId, modulePackage.module.moduleType).toBe(ctx.drawerBottomMaterialId);
        }
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

  it("adds simple drawer boxes and opens drawers and doors outward", () => {
    const catalog = getSystemSeedCatalog();
    const drawerPackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_base_drawer_cabinet");
    const shelfPackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_base_shelf_cabinet");
    expect(drawerPackage).toBeTruthy();
    expect(shelfPackage).toBeTruthy();

    const closedDrawer = buildModulePackageGeometryFromPackage({
      modulePackage: drawerPackage!,
      catalog,
      parameters: normalizeFwmFurnitureParams({
        ...createDefaultModulePackageParameters(drawerPackage!),
        type: "fwm_base_drawer_cabinet",
        width: 600,
        height: 860,
        depth: 560,
        drawerCount: 3,
        opened: false
      } as FwmFurnitureParams)
    });
    const openedDrawer = buildModulePackageGeometryFromPackage({
      modulePackage: drawerPackage!,
      catalog,
      parameters: normalizeFwmFurnitureParams({
        ...createDefaultModulePackageParameters(drawerPackage!),
        type: "fwm_base_drawer_cabinet",
        width: 600,
        height: 860,
        depth: 560,
        drawerCount: 3,
        opened: true
      } as FwmFurnitureParams)
    });
    const closedDoor = buildModulePackageGeometryFromPackage({
      modulePackage: shelfPackage!,
      catalog,
      parameters: normalizeFwmFurnitureParams({
        ...createDefaultModulePackageParameters(shelfPackage!),
        type: "fwm_base_shelf_cabinet",
        width: 600,
        height: 860,
        depth: 560,
        shelfCount: 2,
        doorCount: 2,
        opened: false
      } as FwmFurnitureParams)
    });
    const openedDoor = buildModulePackageGeometryFromPackage({
      modulePackage: shelfPackage!,
      catalog,
      parameters: normalizeFwmFurnitureParams({
        ...createDefaultModulePackageParameters(shelfPackage!),
        type: "fwm_base_shelf_cabinet",
        width: 600,
        height: 860,
        depth: 560,
        shelfCount: 2,
        doorCount: 2,
        opened: true
      } as FwmFurnitureParams)
    });

    expect(getMeshNamed(closedDrawer, "drawer_left_side_1")).toBeTruthy();
    expect(getMeshNamed(closedDrawer, "drawer_right_side_1")).toBeTruthy();
    expect(getMeshNamed(closedDrawer, "drawer_back_1")).toBeTruthy();
    expect(getMeshNamed(closedDrawer, "drawer_front_inner_1")).toBeTruthy();
    expect(getMeshNamed(closedDrawer, "drawer_runner_left_1")).toBeTruthy();
    expect(getMeshNamed(closedDrawer, "drawer_runner_right_1")).toBeTruthy();

    const closedDrawerFront = new Box3().setFromObject(getMeshNamed(closedDrawer, "drawer_front_1")!);
    const openedDrawerFront = new Box3().setFromObject(getMeshNamed(openedDrawer, "drawer_front_1")!);
    const closedDrawerBottom = new Box3().setFromObject(getMeshNamed(closedDrawer, "drawer_bottom_1")!);
    const openedDrawerBottom = new Box3().setFromObject(getMeshNamed(openedDrawer, "drawer_bottom_1")!);
    const closedDoorLeaf = new Box3().setFromObject(getMeshNamed(closedDoor, "door_1")!);
    const openedDoorLeaf = new Box3().setFromObject(getMeshNamed(openedDoor, "door_1")!);

    expect(openedDrawerFront.max.z).toBeGreaterThan(closedDrawerFront.max.z);
    expect(openedDrawerBottom.max.z).toBeGreaterThan(closedDrawerBottom.max.z);
    expect(openedDoorLeaf.max.z).toBeGreaterThan(closedDoorLeaf.max.z);
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
    const kitchenPackages = extendedFurnitureModulePackages.filter((entry) => entry.behavior?.contextBindings?.length);
    expect(kitchenPackages).toHaveLength(27);

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
        expect(normalizedB.depth, modulePackage.module.moduleType).not.toBe(normalizedA.depth);
      } else {
        expect(normalizedB.depth, modulePackage.module.moduleType).toBe(secondCtx.moduleDepthMm);
        expect(normalizedB.depth, modulePackage.module.moduleType).not.toBe(normalizedA.depth);
      }

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
        expect(hasMeshNamed(group, /worktop/i), modulePackage.module.moduleType).toBe(normalizedB.hasWorktop === true);
      }

      const result = calculateFwmFurnitureBOM(normalizedB, secondCtx, catalog);
      expect(result.quoteBom.items.length, modulePackage.module.moduleType).toBeGreaterThan(0);
      expect(Number.isFinite(result.pricing.finalPrice), modulePackage.module.moduleType).toBe(true);
    }
  }, 30_000);
});
