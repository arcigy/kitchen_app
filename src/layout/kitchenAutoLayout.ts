import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { createDefaultModulePackageParameters } from "../core/module-package/runtime/module-runtime-adapter";
import { getEnabledModulePackageDefinitions } from "../core/catalog/module-catalog";
import { findModulePackageForParams } from "../core/module-package/runtime/module-package-controls";
import type { FloorBoundaryPoint, KitchenWorktopParams } from "./appState";
import type { KitchenContext } from "./kitchenContext";
import { makeDefaultKitchenContext, resolveContext } from "./kitchenContext";
import { applyKitchenContextToModuleParams } from "./kitchenMaterialSync";
import { normalizeModuleParamsForSource, type ModuleParams } from "../model/cabinetTypes";
import type { MaterialDefinition } from "../core/catalog/catalog-types";

type RunId = "back" | "right" | "left" | "island";

export type AutoKitchenModuleRequest = {
  key: string;
  type: ModuleParams["type"];
  runId: RunId;
  requestedWidthMm: number;
  minWidthMm?: number;
  depthMm?: number;
  role: "base" | "top" | "tall" | "island";
  label: string;
  paramsPatch?: Record<string, unknown>;
};

export type AutoKitchenPlacedModule = AutoKitchenModuleRequest & {
  widthMm: number;
  xMm: number;
  yMm: number;
  zMm: number;
  rotationYDeg: number;
  params: ModuleParams;
  resizedByMm: number;
};

export type AutoKitchenRunValidation = {
  runId: string;
  spanMm: number;
  usedMm: number;
  gapMm: number;
  overlapMm: number;
  moduleKeys: string[];
};

export type AutoKitchenPlan = {
  groupName: string;
  ctx: KitchenContext;
  worktop: KitchenWorktopParams;
  worktops: KitchenWorktopParams[];
  modules: AutoKitchenPlacedModule[];
  validation: AutoKitchenRunValidation[];
  missingTools: string[];
};

type RunGeometry = {
  runId: RunId;
  start: { x: number; z: number };
  dir: { x: number; z: number };
  front: { x: number; z: number };
  lengthMm: number;
};
type PlacementLayer = "floor" | "top";

const RUNS: Record<RunId, RunGeometry> = {
  back: {
    runId: "back",
    start: { x: 0, z: 0 },
    dir: { x: 1, z: 0 },
    front: { x: 0, z: 1 },
    lengthMm: 3050
  },
  right: {
    runId: "right",
    start: { x: 3050, z: 1000 },
    dir: { x: 0, z: 1 },
    front: { x: -1, z: 0 },
    lengthMm: 2550
  },
  left: {
    runId: "left",
    start: { x: 0, z: 3550 },
    dir: { x: 1, z: 0 },
    front: { x: 0, z: -1 },
    lengthMm: 2050
  },
  island: {
    runId: "island",
    start: { x: 725, z: 5000 },
    dir: { x: 1, z: 0 },
    front: { x: 0, z: 1 },
    lengthMm: 1600
  }
};

type ThicknessPreference = {
  preferred: number;
  min: number;
  max: number;
};

function boardMaterialsByFamily(catalog: ClientCatalog, family: string, preference?: ThicknessPreference) {
  const materials = catalog.materials.filter((material): material is MaterialDefinition =>
    material.materialType === "board" &&
    material.isActive &&
    material.boardFamily === family &&
    (!preference || (material.defaultThicknessMm >= preference.min && material.defaultThicknessMm <= preference.max))
  );
  if (!preference) return materials;
  return [...materials].sort((left, right) =>
    Math.abs(left.defaultThicknessMm - preference.preferred) - Math.abs(right.defaultThicknessMm - preference.preferred)
  );
}

function pickBoardMaterial(catalog: ClientCatalog, family: string, fallbackId: string | undefined, preference: ThicknessPreference, index = 0) {
  const preferred = boardMaterialsByFamily(catalog, family, preference);
  const fallback = fallbackId ? catalog.materials.find((material) => material.id === fallbackId) : null;
  const pool = preferred.length > 0 ? preferred : boardMaterialsByFamily(catalog, family);
  return pool.length > 0 ? pool[Math.abs(index) % pool.length]! : fallback;
}

function materialId(catalog: ClientCatalog, family: string, fallbackId: string | undefined, preference: ThicknessPreference, index = 0) {
  return pickBoardMaterial(catalog, family, fallbackId, preference, index)?.id ?? fallbackId ?? "";
}

function componentId(catalog: ClientCatalog, componentType: ClientCatalog["components"][number]["componentType"], preferredId: string) {
  const preferred = catalog.components.find((component) => component.id === preferredId && component.isActive && component.componentType === componentType);
  return preferred?.id ?? catalog.components.find((component) => component.isActive && component.componentType === componentType)?.id ?? "";
}

function realModulePatch(
  catalog: ClientCatalog,
  ctx: KitchenContext,
  request: AutoKitchenModuleRequest,
  index: number
): Record<string, unknown> {
  const defaults = catalog.kitchenDefaults;
  const body = pickBoardMaterial(catalog, "body", defaults.carcassMaterialId, { preferred: 18, min: 16, max: 22 }, index);
  const front = pickBoardMaterial(catalog, "front", defaults.frontMaterialId, { preferred: 18, min: 16, max: 22 }, index + 3);
  const back = pickBoardMaterial(catalog, "back", defaults.backPanelMaterialId, { preferred: 10, min: 6, max: 12 }, index + 5);
  const shelf = pickBoardMaterial(catalog, "body", defaults.carcassMaterialId, { preferred: 18, min: 16, max: 22 }, index + 7);
  const drawerBottom = pickBoardMaterial(catalog, "drawer_bottom", defaults.drawerBottomMaterialId, { preferred: 8, min: 2, max: 10 }, index + 11);
  const plinth = pickBoardMaterial(catalog, "body", defaults.plinthMaterialId ?? defaults.carcassMaterialId, { preferred: 18, min: 16, max: 22 }, index + 13);
  const worktop = pickBoardMaterial(catalog, "worktop", defaults.worktopMaterialId, { preferred: 38, min: 28, max: 40 }, index + 17);
  const handleLengthMm = request.role === "top" ? 96 : Math.min(320, Math.max(128, Math.round(request.requestedWidthMm * 0.28)));
  const hasWorktop = request.role === "island";
  const fittedHeightMm =
    request.role === "base" || request.role === "island" ? ctx.moduleHeightMm :
    request.role === "top" ? ctx.upperHeightMm :
    undefined;

  return {
    ...(fittedHeightMm ? { height: fittedHeightMm, heightCarcass: fittedHeightMm } : {}),
    bodyMaterialId: body?.id ?? defaults.carcassMaterialId,
    boardThickness: body?.defaultThicknessMm ?? 18,
    frontMaterialId: front?.id ?? defaults.frontMaterialId,
    frontThicknessMm: front?.defaultThicknessMm ?? 18,
    backMaterialId: back?.id ?? defaults.backPanelMaterialId,
    backThickness: back?.defaultThicknessMm ?? 8,
    shelfMaterialId: shelf?.id ?? body?.id ?? defaults.carcassMaterialId,
    shelfThickness: shelf?.defaultThicknessMm ?? body?.defaultThicknessMm ?? 18,
    drawerBottomMaterialId: drawerBottom?.id ?? defaults.drawerBottomMaterialId,
    drawerBottomThickness: drawerBottom?.defaultThicknessMm ?? 8,
    plinthMaterialId: plinth?.id ?? defaults.plinthMaterialId ?? defaults.carcassMaterialId,
    requiresWorktop: hasWorktop,
    worktopMaterialId: worktop?.id ?? defaults.worktopMaterialId,
    worktopThicknessMm: hasWorktop ? (worktop?.defaultThicknessMm ?? defaults.defaultWorktopThicknessMm ?? 38) : 0,
    frontGap: request.role === "top" ? 2 : 3,
    sideGap: request.role === "top" ? 2 : 3,
    handleLengthMm,
    handleProjectionMm: request.role === "top" ? 22 : 28,
    handleSizeMm: request.role === "top" ? 12 : 16,
    legComponentId: request.role === "top" ? "" : componentId(catalog, "leg", "cmp.leg.adjustable.100.black"),
    clipComponentId: request.role === "top" ? "" : componentId(catalog, "plinth_clip", "cmp.clip.plinth.standard"),
    plinthSetbackMm: request.role === "top" ? 0 : 70
  };
}

export function makeRequestedUKitchenContext(catalog: ClientCatalog): KitchenContext {
  const defaults = catalog.kitchenDefaults;
  return resolveContext({
    ...makeDefaultKitchenContext(catalog),
    name: "U kuchyna 2800",
    wallHeightMm: 2800,
    heightMm: 900,
    worktopDepthMm: 640,
    worktopFrontOffsetMm: 30,
    worktopBackOffsetMm: 20,
    worktopThicknessMm: 38,
    worktopCornerCutMm: 45,
    worktopOverhangSideMm: 25,
    plinthHeightMm: 120,
    plinthDepthMm: 70,
    upperStartHeightMm: 1350,
    upperDepthMm: 340,
    upperHeightMm: 720,
    frontsMaterialId: materialId(catalog, "front", defaults.frontMaterialId ?? "mat.board.front.veneer.oak_natural.19", { preferred: 18, min: 16, max: 22 }, 0),
    corpusMaterialId: materialId(catalog, "body", defaults.carcassMaterialId ?? "mat.board.body.dtd.grey.18", { preferred: 18, min: 16, max: 22 }, 0),
    backMaterialId: materialId(catalog, "back", defaults.backPanelMaterialId ?? "mat.board.back.hdf.grey.6", { preferred: 10, min: 6, max: 12 }, 0),
    drawerBottomMaterialId: materialId(catalog, "drawer_bottom", defaults.drawerBottomMaterialId ?? "mat.board.drawer_bottom.hdf.white.8", { preferred: 8, min: 2, max: 10 }, 0),
    worktopMaterialId: materialId(catalog, "worktop", defaults.worktopMaterialId ?? "mat.board.worktop.laminate_oak.38", { preferred: 38, min: 28, max: 40 }, 0),
    handleComponentId: defaults.defaultHandleComponentId ?? "cmp.handle.bar.160.black",
    fillerStrategy: "auto",
    gapWarningMm: 0,
    overlapErrorMm: 0
  });
}

export function fitRunModulesToLength(
  modules: AutoKitchenModuleRequest[],
  spanMm: number
): Array<AutoKitchenModuleRequest & { widthMm: number; resizedByMm: number }> {
  const fitted = modules.map((module) => ({ ...module, widthMm: Math.round(module.requestedWidthMm), resizedByMm: 0 }));
  const total = fitted.reduce((sum, module) => sum + module.widthMm, 0);
  const delta = Math.round(spanMm - total);
  if (delta === 0 || fitted.length === 0) return fitted;

  if (delta > 0) {
    const targets = fitted;
    const base = Math.floor(delta / targets.length);
    let rest = delta - base * targets.length;
    for (const module of targets) {
      const add = base + (rest > 0 ? 1 : 0);
      rest -= rest > 0 ? 1 : 0;
      module.widthMm += add;
      module.resizedByMm += add;
    }
    return fitted;
  }

  let remainingShrink = -delta;
  const shrinkable = fitted
    .map((module) => ({ module, capacity: Math.max(0, module.widthMm - (module.minWidthMm ?? 300)) }))
    .filter((entry) => entry.capacity > 0);
  const totalCapacity = shrinkable.reduce((sum, entry) => sum + entry.capacity, 0);
  if (remainingShrink > totalCapacity) {
    throw new Error(`Run cannot fit: needs ${remainingShrink}mm shrink, only ${totalCapacity}mm available.`);
  }
  for (let index = 0; index < shrinkable.length; index += 1) {
    const entry = shrinkable[index]!;
    const proportional = index === shrinkable.length - 1
      ? remainingShrink
      : Math.min(entry.capacity, Math.round((-delta * entry.capacity) / totalCapacity));
    const shrink = Math.min(entry.capacity, proportional, remainingShrink);
    entry.module.widthMm -= shrink;
    entry.module.resizedByMm -= shrink;
    remainingShrink -= shrink;
  }
  return fitted;
}

function rotationYDegForRun(run: RunGeometry) {
  return Math.round((Math.atan2(run.front.x, run.front.z) * 180) / Math.PI);
}

function placeRunModules(
  requests: AutoKitchenModuleRequest[],
  run: RunGeometry,
  ctx: KitchenContext,
  catalog: ClientCatalog,
  modulePackages: readonly FurnQuoteModulePackage[]
) {
  const fitted = fitRunModulesToLength(requests, run.lengthMm);
  const placed: AutoKitchenPlacedModule[] = [];
  let cursor = 0;
  for (const [index, request] of fitted.entries()) {
    const depthMm = request.depthMm ?? (request.role === "top" ? ctx.upperDepthMm : request.role === "island" ? 900 : ctx.moduleDepthMm);
    const centerAlong = cursor + request.widthMm / 2;
    const modulePackage = findModulePackageForParams(modulePackages, { type: request.type });
    if (!modulePackage) throw new Error(`Missing module package for ${request.type}.`);
    const params = {
      ...createDefaultModulePackageParameters(modulePackage),
      type: request.type,
      width: request.widthMm,
      depth: depthMm,
      ...request.paramsPatch
    } as ModuleParams;
    applyKitchenContextToModuleParams(params, ctx, catalog, modulePackage);
    Object.assign(params, realModulePatch(catalog, ctx, request, index), request.paramsPatch ?? {}, { width: request.widthMm, depth: depthMm });
    const normalized = normalizeModuleParamsForSource(params, request.type);
    const xMm = run.start.x + run.dir.x * centerAlong + run.front.x * (depthMm / 2);
    const zMm = run.start.z + run.dir.z * centerAlong + run.front.z * (depthMm / 2);
    placed.push({
      ...request,
      widthMm: request.widthMm,
      xMm: Math.round(xMm),
      yMm: request.role === "top" ? ctx.upperStartHeightMm : 0,
      zMm: Math.round(zMm),
      rotationYDeg: rotationYDegForRun(run),
      params: normalized,
      resizedByMm: request.resizedByMm
    });
    cursor += request.widthMm;
  }
  return placed;
}

function validateRun(runId: string, modules: AutoKitchenPlacedModule[], spanMm: number): AutoKitchenRunValidation {
  const usedMm = Math.round(modules.reduce((sum, module) => sum + module.widthMm, 0));
  const gapMm = Math.max(0, spanMm - usedMm);
  const overlapMm = Math.max(0, usedMm - spanMm);
  return {
    runId,
    spanMm,
    usedMm,
    gapMm,
    overlapMm,
    moduleKeys: modules.map((module) => module.key)
  };
}

function placementLayer(request: Pick<AutoKitchenModuleRequest, "role">): PlacementLayer {
  return request.role === "top" ? "top" : "floor";
}

export function createRequestedUKitchenPlan(catalog: ClientCatalog, packages: readonly FurnQuoteModulePackage[]): AutoKitchenPlan {
  const ctx = makeRequestedUKitchenContext(catalog);
  const modulePackages = getEnabledModulePackageDefinitions(catalog, packages);
  const baseRequests: AutoKitchenModuleRequest[] = [
    { key: "base-drawer-650", type: "fwm_base_drawer_cabinet", runId: "back", requestedWidthMm: 650, minWidthMm: 450, role: "base", label: "3 drawer base 650", paramsPatch: { drawerCount: 3, drawerFrontHeightsMm: "100,317,317", frontGap: 2 } },
    { key: "base-shelves-800", type: "fwm_base_shelf_cabinet", runId: "back", requestedWidthMm: 800, minWidthMm: 450, role: "base", label: "shelf base 800", paramsPatch: { shelfCount: 2, doorCount: 2 } },
    { key: "sink-600", type: "fwm_sink_base_module", runId: "back", requestedWidthMm: 600, minWidthMm: 500, role: "base", label: "sink 600", paramsPatch: { sinkBowlWidthMm: 500, sinkBowlDepthMm: 400, doorCount: 2 } },
    { key: "corner-base", type: "fwm_corner_base_module_1", runId: "back", requestedWidthMm: 1000, minWidthMm: 900, role: "base", label: "corner base" },
    { key: "drawer-4-equal", type: "fwm_base_drawer_cabinet", runId: "right", requestedWidthMm: 720, minWidthMm: 450, role: "base", label: "4 equal drawer base", paramsPatch: { drawerCount: 4, drawerFrontHeightsMm: "" } },
    { key: "oven-micro-tall", type: "fwm_oven_tower_module", runId: "right", requestedWidthMm: 650, minWidthMm: 600, role: "tall", label: "drawer oven microwave shelves", paramsPatch: { height: ctx.wallHeightMm, heightCarcass: ctx.wallHeightMm, drawerCount: 3, shelfCount: 3, applianceWidthMm: 560 } },
    { key: "fridge-tall", type: "fwm_built_in_fridge", runId: "right", requestedWidthMm: 650, minWidthMm: 600, role: "tall", label: "built in fridge", paramsPatch: { height: ctx.wallHeightMm, heightCarcass: ctx.wallHeightMm, applianceWidthMm: 560 } },
    { key: "tall-pantry-fill", type: "fwm_base_shelf_cabinet", runId: "right", requestedWidthMm: 530, minWidthMm: 450, role: "base", label: "right run fitted shelf", paramsPatch: { doorCount: 1, shelfCount: 3 } },
    { key: "left-drawer", type: "fwm_base_drawer_cabinet", runId: "left", requestedWidthMm: 760, minWidthMm: 450, role: "base", label: "left drawer", paramsPatch: { drawerCount: 3 } },
    { key: "left-shelves-a", type: "fwm_base_shelf_cabinet", runId: "left", requestedWidthMm: 760, minWidthMm: 450, role: "base", label: "left shelves A" },
    { key: "left-shelves-b", type: "fwm_base_shelf_cabinet", runId: "left", requestedWidthMm: 760, minWidthMm: 450, role: "base", label: "left shelves B" },
    { key: "left-dishwasher", type: "fwm_built_in_dishwasher", runId: "left", requestedWidthMm: 770, minWidthMm: 600, role: "base", label: "left dishwasher" },
    { key: "island", type: "fwm_kitchen_island", runId: "island", requestedWidthMm: 1600, minWidthMm: 1200, depthMm: 900, role: "island", label: "kitchen island", paramsPatch: { drawerCount: 3, doorCount: 2, shelfCount: 2, variant: "mixed" } }
  ];

  const topRequests: AutoKitchenModuleRequest[] = [
    ...Array.from({ length: 5 }, (_, index) => ({ key: `upper-back-${index + 1}`, type: "fwm_wall_shelf_module" as ModuleParams["type"], runId: "back" as const, requestedWidthMm: 610, minWidthMm: 360, role: "top" as const, label: `back upper ${index + 1}`, paramsPatch: { shelfCount: 4, height: ctx.upperHeightMm } })),
    { key: "upper-right-drawer-zone", type: "fwm_wall_shelf_module" as ModuleParams["type"], runId: "right", requestedWidthMm: 720, minWidthMm: 360, role: "top", label: "right upper above drawer zone", paramsPatch: { shelfCount: 3, height: ctx.upperHeightMm } },
    ...Array.from({ length: 5 }, (_, index) => ({ key: `upper-left-${index + 1}`, type: "fwm_wall_shelf_module" as ModuleParams["type"], runId: "left" as const, requestedWidthMm: 610, minWidthMm: 360, role: "top" as const, label: `left upper ${index + 1}`, paramsPatch: { shelfCount: 4, height: ctx.upperHeightMm } }))
  ];

  const allRequests = [...baseRequests, ...topRequests];
  const modules = (Object.keys(RUNS) as RunId[]).flatMap((runId) => {
    const run = RUNS[runId];
    const layers = Array.from(new Set(allRequests.filter((request) => request.runId === runId).map(placementLayer)));
    return layers.flatMap((layer) => {
      const layerRequests = allRequests.filter((request) => request.runId === runId && placementLayer(request) === layer);
      const requestedSpanMm = Math.round(layerRequests.reduce((sum, request) => sum + request.requestedWidthMm, 0));
      const layerRun = layer === "top" ? { ...run, lengthMm: Math.min(run.lengthMm, requestedSpanMm) } : run;
      return placeRunModules(layerRequests, layerRun, ctx, catalog, modulePackages);
    });
  });
  const validation = (Object.keys(RUNS) as RunId[]).flatMap((runId) => {
    const layers = Array.from(new Set(modules.filter((module) => module.runId === runId).map(placementLayer)));
    return layers.map((layer) => {
      const layerModules = modules.filter((module) => module.runId === runId && placementLayer(module) === layer);
      const spanMm = layer === "top"
        ? Math.round(layerModules.reduce((sum, module) => sum + module.widthMm, 0))
        : RUNS[runId].lengthMm;
      return validateRun(`${runId}:${layer}`, layerModules, spanMm);
    });
  });

  const worktops: KitchenWorktopParams[] = [
    {
      path: [
        { x: 0, z: 0 },
        { x: 3050, z: 0 },
        { x: 3050, z: 1720 }
      ] satisfies FloorBoundaryPoint[],
      justification: "back",
      mirrored: false,
      depthMm: ctx.worktopDepthMm,
      thicknessMm: ctx.worktopThicknessMm,
      heightMm: ctx.heightMm,
      overhangSideMm: ctx.worktopOverhangSideMm,
      materialId: ctx.worktopMaterialId
    },
    {
      path: [
        { x: 0, z: 3550 },
        { x: 2050, z: 3550 }
      ] satisfies FloorBoundaryPoint[],
      justification: "front",
      mirrored: false,
      depthMm: ctx.worktopDepthMm,
      thicknessMm: ctx.worktopThicknessMm,
      heightMm: ctx.heightMm,
      overhangSideMm: ctx.worktopOverhangSideMm,
      materialId: ctx.worktopMaterialId
    }
  ];

  return {
    groupName: "Presna U kuchyna 2800",
    ctx,
    worktop: worktops[0]!,
    worktops,
    modules,
    validation,
    missingTools: []
  };
}
