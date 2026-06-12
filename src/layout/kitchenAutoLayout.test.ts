import { describe, expect, it } from "vitest";
import { Box3, Mesh } from "three";
import { getSystemSeedCatalog } from "../core/catalog/catalog-repository";
import { createPricingCatalog } from "../core/catalog/pricing-catalog";
import { buildModulePackageGeometryFromPackage } from "../core/module-package/runtime/module-runtime-adapter";
import { calculateFwmFurnitureBOM } from "../modules/fwmFurniture/calculation";
import type { FwmFurnitureParams } from "../modules/fwmFurniture/types";
import { extendedFurnitureModulePackages } from "../system/module-packages/extendedFurniture";
import { getKitchenWorktopAreaM2, getKitchenWorktopBoundsMm } from "./worktopGeometry";
import { createRequestedUKitchenPlan, fitRunModulesToLength, type AutoKitchenPlacedModule } from "./kitchenAutoLayout";
import { makeKitchenWorktopGeometry } from "../app/kitchenWorktopVisuals";

function meshCount(root: { traverse: (visitor: (object: unknown) => void) => void }) {
  let count = 0;
  root.traverse((object) => {
    if ((object as Mesh).isMesh) count += 1;
  });
  return count;
}

function getMesh(root: { traverse: (visitor: (object: unknown) => void) => void }, name: string): Mesh | null {
  let found = null as Mesh | null;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.name === name) found = mesh;
  });
  return found;
}

function meshNames(root: { traverse: (visitor: (object: unknown) => void) => void }) {
  const names: string[] = [];
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh) names.push(mesh.name);
  });
  return names;
}

function meshMaterialIds(root: { traverse: (visitor: (object: unknown) => void) => void }) {
  const ids = new Set<string>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && typeof mesh.userData.catalogMaterialId === "string") ids.add(mesh.userData.catalogMaterialId);
  });
  return ids;
}

function uniqueMaterialObjectCount(root: { traverse: (visitor: (object: unknown) => void) => void }) {
  const materials = new Set<string>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (material?.uuid) materials.add(material.uuid);
  });
  return materials.size;
}

function renderColorHexes(root: { traverse: (visitor: (object: unknown) => void) => void }) {
  const colors = new Set<string>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && typeof mesh.userData.renderColorHex === "string") colors.add(mesh.userData.renderColorHex);
  });
  return colors;
}

function isStructuralMeshName(name: string) {
  const normalized = name.toLowerCase();
  return !normalized.includes("handle") &&
    !normalized.includes("sink_bowl") &&
    !normalized.includes("faucet") &&
    !normalized.includes("appliance");
}

function structuralMaxYmm(root: { traverse: (visitor: (object: unknown) => void) => void }) {
  const box = new Box3();
  let found = false;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !isStructuralMeshName(mesh.name)) return;
    box.expandByObject(mesh);
    found = true;
  });
  return found ? Math.round(box.max.y * 1000) : 0;
}

function boxSignature(root: Parameters<typeof Box3.prototype.setFromObject>[0]) {
  const box = new Box3().setFromObject(root);
  return [
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z
  ].map((value) => Math.round(value * 1000)).join("x");
}

function alternateMaterialId(catalog: ReturnType<typeof getSystemSeedCatalog>, family: string, current: unknown, min: number, max: number) {
  const currentId = typeof current === "string" ? current : "";
  return catalog.materials.find((material) =>
    material.materialType === "board" &&
    material.isActive &&
    material.boardFamily === family &&
    material.defaultThicknessMm >= min &&
    material.defaultThicknessMm <= max &&
    material.id !== currentId
  )?.id ?? currentId;
}

function runAlongMm(module: AutoKitchenPlacedModule) {
  if (module.runId === "right") return module.zMm - 1000;
  if (module.runId === "island") return module.xMm - 725;
  return module.xMm;
}

function placedMeshBoxes(plan: ReturnType<typeof createRequestedUKitchenPlan>, catalog: ReturnType<typeof getSystemSeedCatalog>) {
  const boxes: Array<{ moduleKey: string; moduleType: string; moduleRole: AutoKitchenPlacedModule["role"]; meshName: string; box: Box3 }> = [];
  for (const module of plan.modules) {
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === module.type);
    expect(modulePackage, module.key).toBeTruthy();
    const group = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: module.params, catalog });
    group.position.set(module.xMm / 1000, module.yMm / 1000, module.zMm / 1000);
    group.rotation.y = (module.rotationYDeg * Math.PI) / 180;
    group.updateMatrixWorld(true);
    group.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      boxes.push({
        moduleKey: module.key,
        moduleType: module.type,
        moduleRole: module.role,
        meshName: mesh.name,
        box: new Box3().setFromObject(mesh)
      });
    });
  }
  return boxes;
}

function placedWorktopBoxes(plan: ReturnType<typeof createRequestedUKitchenPlan>) {
  return plan.worktops.map((worktop, index) => {
    const mesh = new Mesh(makeKitchenWorktopGeometry(worktop));
    mesh.position.y = worktop.heightMm / 1000;
    mesh.updateMatrixWorld(true);
    return {
      worktopKey: `worktop-${index + 1}`,
      box: new Box3().setFromObject(mesh)
    };
  });
}

function boxOverlapMm(a: Box3, b: Box3) {
  const x = (Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x)) * 1000;
  const y = (Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y)) * 1000;
  const z = (Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z)) * 1000;
  return {
    x: Math.round(x),
    y: Math.round(y),
    z: Math.round(z),
    volume: Math.max(0, x) * Math.max(0, y) * Math.max(0, z)
  };
}

function hasPlanarOverlapMm(a: Box3, b: Box3, toleranceMm: number) {
  const overlap = boxOverlapMm(a, b);
  return overlap.x > toleranceMm && overlap.z > toleranceMm;
}

describe("requested U kitchen auto layout", () => {
  it("fits an oversized module into a 450mm gap by resizing it", () => {
    const [fitted] = fitRunModulesToLength(
      [{ key: "drawer", type: "fwm_base_drawer_cabinet", runId: "back", requestedWidthMm: 650, minWidthMm: 450, role: "base", label: "drawer" }],
      450
    );

    expect(fitted?.widthMm).toBe(450);
    expect(fitted?.resizedByMm).toBe(-200);
  });

  it("creates the exact requested full U kitchen with no run gaps or overlaps", () => {
    const catalog = getSystemSeedCatalog();
    const plan = createRequestedUKitchenPlan(catalog, extendedFurnitureModulePackages);

    expect(plan.ctx.wallHeightMm).toBe(2800);
    expect(plan.modules.length).toBeGreaterThanOrEqual(20);
    expect(plan.worktops).toHaveLength(2);
    expect(plan.worktops.every((worktop) => worktop.heightMm === 900 && worktop.thicknessMm === 38)).toBe(true);
    expect(plan.worktops.reduce((sum, worktop) => sum + getKitchenWorktopAreaM2(worktop), 0)).toBeGreaterThan(3);
    expect(getKitchenWorktopBoundsMm(plan.worktops[0]!)).toEqual({ widthMm: 3050, depthMm: 1720 });
    expect(getKitchenWorktopBoundsMm(plan.worktops[1]!)).toEqual({ widthMm: 2050, depthMm: 640 });
    expect(plan.ctx.upperStartHeightMm).toBe(1350);
    expect(plan.ctx.upperStartHeightMm - plan.ctx.heightMm).toBe(450);
    expect(plan.ctx.upperStartHeightMm + plan.ctx.upperHeightMm).toBeLessThanOrEqual(2100);

    for (const run of plan.validation) {
      expect(run.gapMm, run.runId).toBe(0);
      expect(run.overlapMm, run.runId).toBe(0);
      expect(run.usedMm, run.runId).toBe(run.spanMm);

      const intervals = plan.modules
        .filter((module) => run.moduleKeys.includes(module.key))
        .map((module) => ({
          key: module.key,
          start: Math.round(runAlongMm(module) - module.widthMm / 2),
          end: Math.round(runAlongMm(module) + module.widthMm / 2)
        }))
        .sort((a, b) => a.start - b.start);

      expect(Math.abs((intervals[0]?.start ?? 0) - 0), run.runId).toBeLessThanOrEqual(1);
      expect(Math.abs((intervals[intervals.length - 1]?.end ?? 0) - run.spanMm), run.runId).toBeLessThanOrEqual(1);
      for (let index = 1; index < intervals.length; index += 1) {
        expect(Math.abs(intervals[index]!.start - intervals[index - 1]!.end), `${run.runId}:${intervals[index - 1]!.key}->${intervals[index]!.key}`).toBeLessThanOrEqual(1);
      }
    }

    const rightFloor = plan.validation.find((run) => run.runId === "right:floor");
    expect(rightFloor?.moduleKeys).toEqual(["drawer-4-equal", "oven-micro-tall", "fridge-tall", "tall-pantry-fill"]);
    const rightFloorWidths = plan.modules
      .filter((module) => rightFloor?.moduleKeys.includes(module.key))
      .map((module) => module.widthMm);
    expect(rightFloorWidths).toEqual([720, 650, 650, 530]);

    const firstDrawer = plan.modules.find((module) => module.key === "base-drawer-650");
    expect(firstDrawer?.widthMm).toBe(650);
    expect(firstDrawer?.params.drawerCount).toBe(3);
    expect(firstDrawer?.params.drawerFrontHeightsMm).toBe("100,317,317");

    const tower = plan.modules.find((module) => module.key === "oven-micro-tall");
    expect(tower?.params.height).toBe(2800);
    expect(tower?.params.drawerCount).toBe(3);
    expect(tower?.params.plinthHeight).toBe(plan.ctx.plinthHeightMm);
    expect(tower?.params.plinthSetbackMm).toBe(plan.ctx.plinthDepthMm);

    const fridge = plan.modules.find((module) => module.key === "fridge-tall");
    expect(fridge?.params.height).toBe(2800);
    expect(fridge?.params.plinthHeight).toBe(plan.ctx.plinthHeightMm);
    expect(fridge?.params.plinthSetbackMm).toBe(plan.ctx.plinthDepthMm);

    const island = plan.modules.find((module) => module.key === "island");
    expect(island?.params.variant).toBe("mixed");
    expect(island?.params.depth).toBe(900);

    const dishwasher = plan.modules.find((module) => module.key === "left-dishwasher");
    expect(dishwasher?.type).toBe("fwm_built_in_dishwasher");
    expect(dishwasher?.params.worktopThicknessMm).toBe(0);

    for (const module of plan.modules) {
      const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === module.type);
      expect(modulePackage, module.key).toBeTruthy();
      const group = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: module.params, catalog });
      expect(meshCount(group), module.key).toBeGreaterThan(0);
      const box = new Box3().setFromObject(group);
      expect(Number.isFinite(box.max.x - box.min.x), module.key).toBe(true);
      if (module.role === "base") {
        expect(structuralMaxYmm(group), module.key).toBe(plan.ctx.moduleHeightMm);
      }

      const bom = calculateFwmFurnitureBOM(module.params as FwmFurnitureParams, plan.ctx, catalog);
      expect(bom.quoteBom.items.length, module.key).toBeGreaterThan(0);
      expect(Number.isFinite(bom.pricing.finalPrice), module.key).toBe(true);
      expect(bom.pricing.finalPrice, module.key).toBeGreaterThan(0);
      expect(typeof module.params.bodyMaterialId, module.key).toBe("string");
      expect(typeof module.params.frontMaterialId, module.key).toBe("string");
      expect(typeof module.params.backMaterialId, module.key).toBe("string");
      expect(typeof module.params.shelfMaterialId, module.key).toBe("string");
      expect(typeof module.params.drawerBottomMaterialId, module.key).toBe("string");
      expect(typeof module.params.plinthMaterialId, module.key).toBe("string");
      expect(Number(module.params.boardThickness), module.key).toBeGreaterThanOrEqual(16);
      expect(Number(module.params.frontThicknessMm), module.key).toBeGreaterThanOrEqual(16);
      expect(Number(module.params.backThickness), module.key).toBeGreaterThanOrEqual(6);
      expect(Number(module.params.backThickness), module.key).toBeLessThanOrEqual(12);
      expect(Number(module.params.shelfThickness), module.key).toBeGreaterThanOrEqual(16);
      expect(Number(module.params.drawerBottomThickness), module.key).toBeGreaterThan(0);
      expect(Number(module.params.handleLengthMm), module.key).toBeGreaterThan(0);

      const names = meshNames(group);
      if (module.key === "left-dishwasher") {
        const panel = getMesh(group, "dishwasher_front_panel");
        expect(panel, module.key).toBeTruthy();
        expect(panel?.userData.materialRole, module.key).toBe("front");
        expect(panel?.userData.catalogMaterialId, module.key).toBe(module.params.frontMaterialId);
        expect(bom.quoteBom.items.some((item) => item.id === "dishwasher-front-panel"), module.key).toBe(true);
      }
      if (module.role === "top") {
        expect(module.params.worktopThicknessMm, module.key).toBe(0);
        expect(names.some((name) => name.includes("worktop")), module.key).toBe(false);
      }
      if (module.role === "base" || module.role === "tall") {
        expect(module.params.worktopThicknessMm, module.key).toBe(0);
        expect(names.some((name) => name.includes("worktop")), module.key).toBe(false);
        const plinthName = names.find((name) => name.endsWith("plinth_front_board"));
        const legName = names.find((name) => name.endsWith("leg_front_1"));
        const clipName = names.find((name) => name.endsWith("kickClip_front_1_collar"));
        expect(plinthName, module.key).toBeTruthy();
        expect(legName, module.key).toBeTruthy();
        expect(clipName, module.key).toBeTruthy();
        expect(getMesh(group, legName!)?.userData.componentId, module.key).toBe(module.params.legComponentId);
        expect(getMesh(group, clipName!)?.userData.componentId, module.key).toBe(module.params.clipComponentId);
        expect(bom.quoteBom.items.find((item) => item.id === "adjustable-legs")?.component?.catalogId, module.key).toBe(module.params.legComponentId);
        expect(bom.quoteBom.items.find((item) => item.id === "plinth-clips")?.component?.catalogId, module.key).toBe(module.params.clipComponentId);
      }
    }

    const bodyMaterials = new Set(plan.modules.map((module) => module.params.bodyMaterialId));
    const frontMaterials = new Set(plan.modules.map((module) => module.params.frontMaterialId));
    const worktopMaterials = new Set(plan.modules.filter((module) => module.role !== "top").map((module) => module.params.worktopMaterialId));
    expect(bodyMaterials.size).toBeGreaterThan(3);
    expect(frontMaterials.size).toBeGreaterThan(3);
    expect(worktopMaterials.size).toBeGreaterThan(1);

    const worktopAreaM2 = plan.worktops.reduce((sum, worktop) => sum + getKitchenWorktopAreaM2(worktop), 0);
    const worktopUnitPrice = createPricingCatalog(catalog).getUnitPriceForCatalogId(plan.worktops[0]!.materialId);
    expect(worktopAreaM2).toBeGreaterThan(3.9);
    expect(worktopUnitPrice).not.toBeNull();
    expect(worktopAreaM2 * (worktopUnitPrice ?? 0)).toBeGreaterThan(0);
  }, 30_000);

  it("keeps global worktops seated on modules without cutting through module geometry", () => {
    const catalog = getSystemSeedCatalog();
    const plan = createRequestedUKitchenPlan(catalog, extendedFurnitureModulePackages);
    const worktopBoxes = placedWorktopBoxes(plan);
    const moduleBoxes = placedMeshBoxes(plan, catalog).filter((entry) => {
      return entry.moduleRole !== "top" &&
        entry.moduleRole !== "island" &&
        isStructuralMeshName(entry.meshName);
    });
    const overlapErrors: string[] = [];
    const unsupportedErrors: string[] = [];
    const toleranceMm = 2;

    for (const worktop of worktopBoxes) {
      const worktopMinY = Math.round(worktop.box.min.y * 1000);
      const worktopMaxY = Math.round(worktop.box.max.y * 1000);
      expect(worktopMinY, worktop.worktopKey).toBe(plan.ctx.moduleHeightMm);
      expect(worktopMaxY, worktop.worktopKey).toBe(plan.ctx.heightMm);

      let hasSeatedSupport = false;
      for (const moduleBox of moduleBoxes) {
        if (!hasPlanarOverlapMm(worktop.box, moduleBox.box, toleranceMm)) continue;
        const moduleTopMm = Math.round(moduleBox.box.max.y * 1000);
        if (moduleTopMm > worktopMinY + toleranceMm) {
          const overlap = boxOverlapMm(worktop.box, moduleBox.box);
          overlapErrors.push(`${worktop.worktopKey} cuts ${moduleBox.moduleKey}:${moduleBox.meshName} top=${moduleTopMm}mm worktop=${worktopMinY}-${worktopMaxY}mm xz=${overlap.x}x${overlap.z}mm`);
        }
        if (Math.abs(moduleTopMm - worktopMinY) <= toleranceMm) hasSeatedSupport = true;
      }
      if (!hasSeatedSupport) unsupportedErrors.push(`${worktop.worktopKey} has no structural support at ${worktopMinY}mm`);
    }

    expect(overlapErrors.slice(0, 20), overlapErrors.join("\n")).toEqual([]);
    expect(unsupportedErrors, unsupportedErrors.join("\n")).toEqual([]);
  }, 30_000);

  it("does not create measurable 3D object overlaps between placed modules", () => {
    const catalog = getSystemSeedCatalog();
    const plan = createRequestedUKitchenPlan(catalog, extendedFurnitureModulePackages);
    const boxes = placedMeshBoxes(plan, catalog);
    const overlaps: string[] = [];
    const toleranceMm = 5;

    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const left = boxes[leftIndex]!;
        const right = boxes[rightIndex]!;
        if (left.moduleKey === right.moduleKey) continue;
        const overlap = boxOverlapMm(left.box, right.box);
        if (overlap.x <= toleranceMm || overlap.y <= toleranceMm || overlap.z <= toleranceMm) continue;
        overlaps.push(`${left.moduleKey}:${left.meshName} overlaps ${right.moduleKey}:${right.meshName} by ${overlap.x}x${overlap.y}x${overlap.z}mm`);
      }
    }

    expect(overlaps.slice(0, 30), overlaps.join("\n")).toEqual([]);
  }, 30_000);

  it("models the 100mm top drawer front visibly in geometry", () => {
    const catalog = getSystemSeedCatalog();
    const plan = createRequestedUKitchenPlan(catalog, extendedFurnitureModulePackages);
    const module = plan.modules.find((entry) => entry.key === "base-drawer-650");
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === module?.type);
    expect(module).toBeTruthy();
    expect(modulePackage).toBeTruthy();

    const group = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: module!.params, catalog });
    const topDrawer = getMesh(group, "drawer_front_1");
    const lowerDrawer = getMesh(group, "drawer_front_2");
    expect(topDrawer).toBeTruthy();
    expect(lowerDrawer).toBeTruthy();
    const topHeight = topDrawer!.userData.dimensionsMm.height as number;
    const lowerHeight = lowerDrawer!.userData.dimensionsMm.height as number;
    expect(topHeight).toBeLessThan(lowerHeight);
    expect(Math.round(topHeight)).toBe(100);
  });

  it("builds the requested U kitchen with reusable per-module materials and visible material colors", () => {
    const catalog = getSystemSeedCatalog();
    const plan = createRequestedUKitchenPlan(catalog, extendedFurnitureModulePackages);
    let totalMeshes = 0;
    let totalMaterialObjects = 0;
    const renderColors = new Set<string>();
    const startedAt = performance.now();

    for (const module of plan.modules) {
      const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === module.type);
      expect(modulePackage, module.key).toBeTruthy();
      const group = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: module.params, catalog });
      const meshesInModule = meshCount(group);
      totalMeshes += meshesInModule;
      totalMaterialObjects += uniqueMaterialObjectCount(group);
      for (const color of renderColorHexes(group)) renderColors.add(color);
    }

    const elapsedMs = performance.now() - startedAt;
    expect(plan.modules.length).toBeGreaterThanOrEqual(20);
    expect(totalMeshes).toBeGreaterThan(120);
    expect(totalMaterialObjects).toBeLessThan(totalMeshes * 0.55);
    expect(renderColors.size).toBeGreaterThanOrEqual(5);
    expect(elapsedMs).toBeLessThan(3000);
  }, 10_000);

  it("rebuilds geometry and BOM after changing every placed module dimension and material", () => {
    const catalog = getSystemSeedCatalog();
    const plan = createRequestedUKitchenPlan(catalog, extendedFurnitureModulePackages);

    for (const module of plan.modules) {
      const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === module.type);
      expect(modulePackage, module.key).toBeTruthy();
      const beforeGroup = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: module.params, catalog });
      const beforeSignature = boxSignature(beforeGroup);
      const beforeMaterials = meshMaterialIds(beforeGroup);

      const changedParams = {
        ...module.params,
        width: Math.max(120, Number(module.params.width) - 10),
        bodyMaterialId: alternateMaterialId(catalog, "body", module.params.bodyMaterialId, 16, 22),
        frontMaterialId: alternateMaterialId(catalog, "front", module.params.frontMaterialId, 16, 22),
        backMaterialId: alternateMaterialId(catalog, "back", module.params.backMaterialId, 6, 12),
        shelfMaterialId: alternateMaterialId(catalog, "body", module.params.shelfMaterialId, 16, 22),
        drawerBottomMaterialId: alternateMaterialId(catalog, "drawer_bottom", module.params.drawerBottomMaterialId, 2, 10),
        plinthMaterialId: alternateMaterialId(catalog, "body", module.params.plinthMaterialId, 16, 22),
        worktopMaterialId: module.role === "top"
          ? module.params.worktopMaterialId
          : alternateMaterialId(catalog, "worktop", module.params.worktopMaterialId, 28, 40)
      };

      const afterGroup = buildModulePackageGeometryFromPackage({ modulePackage: modulePackage!, parameters: changedParams, catalog });
      const afterSignature = boxSignature(afterGroup);
      const afterMaterials = meshMaterialIds(afterGroup);
      expect(afterSignature, module.key).not.toBe(beforeSignature);
      expect([...afterMaterials].some((materialId) => !beforeMaterials.has(materialId)), module.key).toBe(true);

      const afterBom = calculateFwmFurnitureBOM(changedParams as FwmFurnitureParams, plan.ctx, catalog);
      expect(afterBom.quoteBom.items.length, module.key).toBeGreaterThan(0);
      expect(Number.isFinite(afterBom.pricing.finalPrice), module.key).toBe(true);
      expect(afterBom.pricing.finalPrice, module.key).toBeGreaterThan(0);
      expect(afterBom.quoteBom.items.some((item) => item.material?.catalogId === changedParams.bodyMaterialId || item.material?.catalogId === changedParams.frontMaterialId), module.key).toBe(true);
    }
  }, 30_000);
});
