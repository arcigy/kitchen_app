import * as THREE from "three";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { createDefaultModulePackageParameters } from "../core/module-package/runtime/module-runtime-adapter";
import type { ProjectActions } from "./project/projectActions";
import { commitHistory } from "../layout/historyManager";
import type {
  AppState,
  ColumnInstance,
  ColumnParams,
  FloorInstance,
  FloorParams,
  KitchenWorktopInstance,
  LayoutInstance,
  SectionInstance,
  SectionParams,
  WallInstance
} from "../layout/appState";
import { normalizeModuleParamsForSource, validateModule, type ModuleParams } from "../model/cabinetTypes";
import type {
  AssistantClientContext,
  AssistantToolCall,
  AssistantToolDefinition,
  AssistantToolResult
} from "../assistant/types";
import { ASSISTANT_TOOL_DEFINITIONS, getAssistantToolDefinition } from "../assistant/toolRegistry";
import { validateAssistantToolCall } from "../assistant/toolValidation";
import { insertAssistantCatalogModule } from "./assistantCatalogInsertion";
import { applyKitchenContextToModuleParams } from "../layout/kitchenMaterialSync";
import { buildProjectPricingViews } from "../layout/bom/projectPricing";
import { buildProjectQuoteSummary } from "../layout/bom/projectQuote";
import type { ProjectMarginSettingsState } from "../core/project-margins/project-margin-types";
import type { DoorInstance, DoorParams, WindowInstance, WindowParams } from "./localTypes";
import { validateOpeningPlacement } from "./openingPlacementValidation";
import {
  createAssistantKitchenController,
  type AssistantKitchenCreateInput
} from "./assistantKitchenController";
import type { KitchenContext } from "../layout/kitchenContext";
import type { KitchenRunDimensionSource } from "../layout/kitchenRunDimensions";
import type { ProjectSaveFile } from "../core/project-save/project-save-types";
import { getKitchenModuleRole } from "../layout/kitchenModuleRules";
import type { CustomFurnitureInstance, CustomFurnitureParams } from "../layout/customFurnitureTypes";

type AssistantBridgeContext = {
  S: AppState;
  catalog: ClientCatalog;
  instances: LayoutInstance[];
  walls: WallInstance[];
  floors: FloorInstance[];
  columns: ColumnInstance[];
  sections: SectionInstance[];
  windows: WindowInstance[];
  doors: DoorInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  modulePackages: readonly FurnQuoteModulePackage[];
  projectActions: ProjectActions;
  layoutRoot: THREE.Group;
  createInstance: (params: ModuleParams) => LayoutInstance;
  deleteInstance: (id: string) => void;
  createKitchenWorktop: (
    params: KitchenWorktopInstance["params"],
    kitchenGroupId: string,
    opts?: { id?: string; skipHistory?: boolean }
  ) => KitchenWorktopInstance;
  removeKitchenWorktop: (id: string, opts?: { skipHistory?: boolean }) => void;
  rebuildKitchenWorktop: (worktop: KitchenWorktopInstance) => void;
  rebuildKitchenGroupLayout: (groupId: string, nextCtx: KitchenContext, prevCtx?: KitchenContext) => void;
  getKitchenGuideSegmentInfo: (
    worktop: KitchenWorktopInstance,
    segmentIndex: number,
    backOffsetMm: number
  ) => { start: THREE.Vector3; dir: THREE.Vector3; frontNormal: THREE.Vector3; length: number } | null;
  getKitchenCornerPlacementInfo: (
    worktop: KitchenWorktopInstance,
    cornerIndex: number,
    backOffsetMm: number,
    instance: LayoutInstance
  ) => { binding: NonNullable<LayoutInstance["kitchenPlacement"]>; valid: boolean } | null;
  getKitchenRunDimensionSources: (groupId: string, role?: "base" | "upper") => KitchenRunDimensionSource[];
  inferKitchenPlacementBinding: (inst: LayoutInstance, groupId: string, backOffsetMm: number) => LayoutInstance["kitchenPlacement"];
  applyKitchenPlacementBinding: (
    inst: LayoutInstance,
    binding: NonNullable<LayoutInstance["kitchenPlacement"]>,
    backOffsetMm: number
  ) => boolean;
  findInstance: (id: string) => LayoutInstance | null;
  rebuildInstance: (
    inst: LayoutInstance,
    opts?: { previousParams?: ModuleParams; preserveBackAnchor?: boolean; sourceKey?: string }
  ) => boolean;
  mountProps: () => void;
  updateLayoutPanel: () => void;
  updateSelectionHighlights: () => void;
  getSelectedKind: () => AppState["selectedKind"];
  getSelectedKitchenGroupId: () => string | null;
  setSelectedKitchenGroup: (id: string | null) => void;
  setSelectedModule: (id: string | null, options?: { additive?: boolean }) => void;
  enterKitchenGroup: (groupId: string, moduleId?: string) => void;
  setSelectedWall: (id: string | null) => void;
  setSelectedFloor: (id: string | null) => void;
  setSelectedColumn: (id: string | null) => void;
  setSelectedSection: (id: string | null) => void;
  clearSelection: () => void;
  deleteSelected: () => boolean;
  duplicateSelected: () => void;
  startTransformFromSelection: (kind: "move" | "rotate") => boolean;
  applyMoveDelta: (delta: THREE.Vector3) => void;
  setRotatePivot: (pivot: THREE.Vector3) => boolean;
  applyRotateAngle: (angleRad: number) => void;
  clearTransform: () => void;
  undo: () => void;
  redo: () => void;
  addWall: (a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number) => WallInstance | null;
  createFloor: (params: FloorParams) => FloorInstance;
  createColumn: (params: Partial<ColumnParams>) => ColumnInstance;
  createSection: (params: SectionParams) => SectionInstance;
  createDoor: (defaultWall?: DoorParams["wall"], wallId?: string | null) => DoorInstance;
  createWindow: (defaultWall?: WindowParams["wall"], wallId?: string | null) => WindowInstance;
  clampDoorParams: (params: DoorParams) => DoorParams;
  clampWindowParams: (params: WindowParams) => WindowParams;
  updateDoorTransform: (inst: DoorInstance) => void;
  updateWindowTransform: (inst: WindowInstance) => void;
  rebuildWall: (wall: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
  setActiveDoor: (inst: DoorInstance | null) => void;
  setActiveWindow: (inst: WindowInstance | null) => void;
  setSelectedDoor: () => void;
  setSelectedWindow: () => void;
  disposeObject3D: (object: THREE.Object3D) => void;
  exportActions: {
    downloadViewportPng: () => void;
    exportLayoutJsonFile: () => Promise<void>;
    exportSceneJsonFile: () => Promise<void>;
    exportWebsiteShowcaseFile: (stage: "initial" | "final") => Promise<void>;
  };
  customFurnitureActions: {
    createCustomFurniture: (params: CustomFurnitureParams) => CustomFurnitureInstance;
    selectFurniture: (furnitureId: string | null, boardId?: string | null) => void;
  };
  getProjectMarginSettings: () => ProjectMarginSettingsState;
  authorizeToolCall: (call: AssistantToolCall) => Promise<void>;
  commitHistory: () => void;
  getActiveViewerTab: () => string;
  getLayoutTool: () => AppState["layoutTool"];
  getViewMode: () => AppState["viewMode"];
  getCamera: () => THREE.Camera;
  getControlsTarget: () => THREE.Vector3 | null;
  getProjection: () => string;
  getRenderMode: () => string;
  getViewerToolMode: () => string;
  focusSelectionView: (
    perspective: "front" | "back" | "left" | "right" | "top" | "isometric",
    padding?: number
  ) => boolean;
};

export type ArcigyAssistantBridge = {
  getContextSnapshot: () => AssistantClientContext;
  getToolDefinitions: () => AssistantToolDefinition[];
  executeToolCall: (call: AssistantToolCall) => Promise<AssistantToolResult>;
};

declare global {
  interface Window {
    __arcigyAssistant?: ArcigyAssistantBridge;
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function selectedInstanceIds(ctx: AssistantBridgeContext): string[] {
  const ids = new Set<string>();
  for (const id of ctx.S.selectedInstanceIds) ids.add(id);
  if (ctx.S.selectedInstanceId) ids.add(ctx.S.selectedInstanceId);
  if (ctx.getSelectedKind() === "kitchenGroup") {
    const groupId = ctx.getSelectedKitchenGroupId();
    for (const inst of ctx.instances) if (inst.kitchenGroupId === groupId) ids.add(inst.id);
  }
  return [...ids];
}

function buildContextSnapshot(ctx: AssistantBridgeContext): AssistantClientContext {
  const project = ctx.projectActions.getState().currentProject;
  const moduleIds = selectedInstanceIds(ctx);
  return {
    projectId: project?.projectId ?? null,
    phaseId: project?.activePhaseId ?? null,
    viewMode: ctx.getViewMode(),
    activeViewerTab: ctx.getActiveViewerTab(),
    layoutTool: ctx.getLayoutTool(),
    selectedKind: ctx.getSelectedKind(),
    selectedKitchenGroupId: ctx.getSelectedKitchenGroupId(),
    activeKitchenGroupId: ctx.S.activeKitchenGroupId,
    selectedInstanceIds: moduleIds,
    selectedWallIds: [...ctx.S.selectedWallIds],
    selectedParams: [
      ...moduleIds.map((id) => {
        const inst = ctx.findInstance(id);
        return inst
          ? { id: inst.id, kind: "module" as const, label: String(inst.params.type), params: cloneJson(inst.params) }
          : null;
      }).filter((item): item is NonNullable<typeof item> => !!item),
      ...[...ctx.S.selectedWallIds].map((id) => {
        const wall = ctx.walls.find((item) => item.id === id) ?? null;
        return wall ? { id: wall.id, kind: "wall" as const, label: "Wall", params: cloneJson(wall.params) } : null;
      }).filter((item): item is NonNullable<typeof item> => !!item),
      ...(ctx.getSelectedKitchenGroupId()
        ? [{
            id: ctx.getSelectedKitchenGroupId()!,
            kind: "kitchenGroup" as const,
            label: ctx.S.kitchenGroups.find((group) => group.id === ctx.getSelectedKitchenGroupId())?.name ?? "Kitchen group",
            params: {
              worktopIds: ctx.kitchenWorktops.filter((item) => item.kitchenGroupId === ctx.getSelectedKitchenGroupId()).map((item) => item.id),
              instanceIds: ctx.instances.filter((item) => item.kitchenGroupId === ctx.getSelectedKitchenGroupId()).map((item) => item.id)
            }
          }]
        : [])
    ],
    catalogSummary: {
      materialCount: ctx.catalog.materials.length,
      componentCount: ctx.catalog.components.length,
      moduleCount: ctx.catalog.modules.length,
      moduleTypes: ctx.catalog.modules.filter((item) => item.enabled).map((item) => item.moduleType)
    }
  };
}

function assertToolAllowed(toolId: string) {
  const definition = getAssistantToolDefinition(toolId);
  if (!definition) throw new Error(`Assistant tool ${toolId} is not registered.`);
  return definition;
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function requireFiniteNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number.`);
  return value;
}

function requirePlanPoint(value: unknown, key: string): { x: number; z: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} must be a point.`);
  const record = value as Record<string, unknown>;
  if (typeof record.x !== "number" || !Number.isFinite(record.x) || typeof record.z !== "number" || !Number.isFinite(record.z)) {
    throw new Error(`${key} must contain finite x and z values.`);
  }
  return { x: record.x, z: record.z };
}

function samePlanPoint(a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  return a.x === b.x && a.z === b.z;
}

function assertCatalogMaterial(ctx: AssistantBridgeContext, materialId: string): void {
  if (!ctx.catalog.materials.some((material) => material.id === materialId)) {
    throw new Error(`Material ${materialId} is not available in the tenant catalog.`);
  }
}

function buildSceneSnapshot(ctx: AssistantBridgeContext) {
  const projectState = ctx.projectActions.getState();
  return {
    project: {
      projectId: projectState.currentProject?.projectId ?? null,
      activePhaseId: projectState.currentProject?.activePhaseId ?? null,
      lastSavedAt: projectState.lastSavedAt,
      saveRevision: projectState.saveRevision
    },
    selection: buildContextSnapshot(ctx),
    walls: ctx.walls.map((wall) => ({ id: wall.id, params: cloneJson(wall.params) })),
    floors: ctx.floors.map((floor) => ({ id: floor.id, params: cloneJson(floor.params) })),
    columns: ctx.columns.map((column) => ({ id: column.id, params: cloneJson(column.params) })),
    sections: ctx.sections.map((section) => ({ id: section.id, params: cloneJson(section.params) })),
    windows: ctx.windows.map((item) => ({ id: item.id, params: cloneJson(item.params) })),
    doors: ctx.doors.map((item) => ({ id: item.id, params: cloneJson(item.params) })),
    kitchenGroups: ctx.S.kitchenGroups.map((group) => ({ id: group.id, name: group.name, ctx: cloneJson(group.ctx), instanceIds: [...group.instanceIds] })),
    worktops: ctx.kitchenWorktops.map((worktop) => ({ id: worktop.id, kitchenGroupId: worktop.kitchenGroupId, params: cloneJson(worktop.params) })),
    modules: ctx.instances.map((inst) => ({
      id: inst.id,
      kitchenGroupId: inst.kitchenGroupId,
      kitchenPlacement: cloneJson(inst.kitchenPlacement),
      params: cloneJson(inst.params),
      positionMm: {
        x: Math.round(inst.root.position.x * 1000),
        y: Math.round(inst.root.position.y * 1000),
        z: Math.round(inst.root.position.z * 1000)
      },
      rotationYDeg: Math.round(THREE.MathUtils.radToDeg(inst.root.rotation.y) * 1000) / 1000
    })),
    customFurniture: ctx.S.customFurniture.map((item) => ({ id: item.id, params: cloneJson(item.params) }))
  };
}

type AssistantObjectKind = "module" | "wall" | "floor" | "column" | "section" | "window" | "door" | "kitchenGroup" | "worktop" | "customFurniture";

function buildQueryableObjects(ctx: AssistantBridgeContext): Array<Record<string, unknown> & { id: string; kind: AssistantObjectKind }> {
  return [
    ...ctx.instances.map((inst) => ({
      id: inst.id,
      kind: "module" as const,
      label: String(inst.params.type),
      kitchenGroupId: inst.kitchenGroupId ?? null,
      kitchenPlacement: cloneJson(inst.kitchenPlacement),
      params: cloneJson(inst.params),
      positionMm: {
        x: Math.round(inst.root.position.x * 1000),
        y: Math.round(inst.root.position.y * 1000),
        z: Math.round(inst.root.position.z * 1000)
      },
      rotationYDeg: Math.round(THREE.MathUtils.radToDeg(inst.root.rotation.y) * 1000) / 1000
    })),
    ...ctx.walls.map((item) => ({ id: item.id, kind: "wall" as const, label: "Wall", params: cloneJson(item.params) })),
    ...ctx.floors.map((item) => ({ id: item.id, kind: "floor" as const, label: item.params.name, params: cloneJson(item.params) })),
    ...ctx.columns.map((item) => ({ id: item.id, kind: "column" as const, label: item.params.name, params: cloneJson(item.params) })),
    ...ctx.sections.map((item) => ({ id: item.id, kind: "section" as const, label: item.params.name, params: cloneJson(item.params) })),
    ...ctx.windows.map((item) => ({ id: item.id, kind: "window" as const, label: "Window", params: cloneJson(item.params) })),
    ...ctx.doors.map((item) => ({ id: item.id, kind: "door" as const, label: "Door", params: cloneJson(item.params) })),
    ...ctx.S.kitchenGroups.map((item) => ({ id: item.id, kind: "kitchenGroup" as const, label: item.name, instanceIds: [...item.instanceIds], ctx: cloneJson(item.ctx) })),
    ...ctx.kitchenWorktops.map((item) => ({ id: item.id, kind: "worktop" as const, label: "Worktop", kitchenGroupId: item.kitchenGroupId, params: cloneJson(item.params) })),
    ...ctx.S.customFurniture.map((item) => ({ id: item.id, kind: "customFurniture" as const, label: "Custom furniture", params: cloneJson(item.params) }))
  ];
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase();
}

function buildCurrentViewState(ctx: AssistantBridgeContext) {
  const camera = ctx.getCamera();
  const projectionCamera = camera as THREE.Camera & { zoom?: number; near?: number; far?: number; fov?: number };
  const target = ctx.getControlsTarget();
  return {
    projection: ctx.getProjection(),
    renderMode: ctx.getRenderMode(),
    viewerToolMode: ctx.getViewerToolMode(),
    camera: {
      type: camera.type,
      positionM: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      rotationDeg: {
        x: THREE.MathUtils.radToDeg(camera.rotation.x),
        y: THREE.MathUtils.radToDeg(camera.rotation.y),
        z: THREE.MathUtils.radToDeg(camera.rotation.z)
      },
      zoom: projectionCamera.zoom ?? 1,
      near: projectionCamera.near ?? 0,
      far: projectionCamera.far ?? 0,
      fov: typeof projectionCamera.fov === "number" ? projectionCamera.fov : null
    },
    targetM: target ? { x: target.x, y: target.y, z: target.z } : null
  };
}

function queryObjects(ctx: AssistantBridgeContext, input: Record<string, unknown>) {
  const kinds = new Set(Array.isArray(input.kinds) ? input.kinds.filter((value): value is string => typeof value === "string") : []);
  const ids = new Set(Array.isArray(input.ids) ? input.ids.filter((value): value is string => typeof value === "string") : []);
  const kitchenGroupId = typeof input.kitchenGroupId === "string" ? input.kitchenGroupId : null;
  const text = typeof input.text === "string" ? normalizeSearchText(input.text) : "";
  const limit = typeof input.limit === "number" ? Math.max(1, Math.min(500, Math.floor(input.limit))) : 100;
  const matches = buildQueryableObjects(ctx).filter((item) => {
    if (kinds.size > 0 && !kinds.has(item.kind)) return false;
    if (ids.size > 0 && !ids.has(item.id)) return false;
    if (kitchenGroupId && item.kitchenGroupId !== kitchenGroupId && item.id !== kitchenGroupId) return false;
    if (text && !normalizeSearchText(item).includes(text) && !normalizeSearchText(JSON.stringify(item)).includes(text)) return false;
    return true;
  });
  return { total: matches.length, truncated: matches.length > limit, objects: matches.slice(0, limit) };
}

function getExactObject(ctx: AssistantBridgeContext, input: Record<string, unknown>) {
  const kind = requireString(input, "kind");
  const id = requireString(input, "id");
  const object = buildQueryableObjects(ctx).find((item) => item.kind === kind && item.id === id) ?? null;
  if (!object) throw new Error(`${kind} ${id} was not found.`);
  return object;
}

function getModuleParameterSchema(ctx: AssistantBridgeContext, input: Record<string, unknown>) {
  const instanceId = typeof input.instanceId === "string" ? input.instanceId : null;
  const requestedPackageId = typeof input.modulePackageId === "string" ? input.modulePackageId : null;
  const instance = instanceId ? ctx.findInstance(instanceId) : null;
  if (instanceId && !instance) throw new Error(`Module ${instanceId} was not found.`);
  const catalogModule = requestedPackageId
    ? ctx.catalog.modules.find((item) => item.enabled && item.modulePackageId === requestedPackageId) ?? null
    : instance
      ? ctx.catalog.modules.find((item) => item.enabled && item.moduleType === instance.params.type) ?? null
      : null;
  const modulePackageId = requestedPackageId ?? catalogModule?.modulePackageId ?? null;
  if (!modulePackageId) throw new Error("instanceId or modulePackageId must resolve to an enabled module package.");
  const modulePackage = ctx.modulePackages.find((item) => item.module.modulePackageId === modulePackageId) ?? null;
  if (!modulePackage) throw new Error(`Runtime module package ${modulePackageId} was not found.`);
  const includeTechnical = input.includeTechnical === true;
  const parameters = modulePackage.parameters.parameters.filter((parameter) => {
    if (parameter.uiVisibility === "internal") return false;
    return includeTechnical || parameter.uiVisibility !== "technical";
  });
  return {
    instanceId,
    modulePackageId,
    moduleType: modulePackage.module.moduleType,
    displayName: modulePackage.module.displayName,
    currentParams: instance ? cloneJson(instance.params) : null,
    parameters: cloneJson(parameters),
    placement: cloneJson(modulePackage.placement),
    constraints: cloneJson(modulePackage.constraints)
  };
}

function searchCatalogModules(ctx: AssistantBridgeContext, input: Record<string, unknown>) {
  const query = typeof input.query === "string" ? normalizeSearchText(input.query) : "";
  const category = typeof input.category === "string" ? normalizeSearchText(input.category) : "";
  const moduleType = typeof input.moduleType === "string" ? input.moduleType : "";
  const tags = Array.isArray(input.tags) ? input.tags.filter((value): value is string => typeof value === "string").map(normalizeSearchText) : [];
  const tolerance = typeof input.toleranceMm === "number" ? input.toleranceMm : 50;
  const limit = typeof input.limit === "number" ? Math.max(1, Math.min(200, Math.floor(input.limit))) : 50;
  const dimensionMatches = (actual: unknown, requested: unknown) => typeof requested !== "number" || (typeof actual === "number" && Math.abs(actual - requested) <= tolerance);
  const candidates = ctx.catalog.modules.filter((item) => {
    if (!item.enabled) return false;
    if (category && !normalizeSearchText(item.category).includes(category)) return false;
    if (moduleType && item.moduleType !== moduleType) return false;
    const itemTags = (item.tags ?? []).map(normalizeSearchText);
    if (tags.some((tag) => !itemTags.some((itemTag) => itemTag.includes(tag)))) return false;
    if (!dimensionMatches(item.defaultWidth, input.widthMm) || !dimensionMatches(item.defaultHeight, input.heightMm) || !dimensionMatches(item.defaultDepth, input.depthMm)) return false;
    if (query) {
      const haystack = normalizeSearchText([item.name, item.description, item.moduleType, item.category, ...(item.tags ?? [])].join(" "));
      if (!query.split(/\s+/u).every((token) => haystack.includes(token))) return false;
    }
    return true;
  });
  return {
    total: candidates.length,
    truncated: candidates.length > limit,
    modules: candidates.slice(0, limit).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? null,
      moduleType: item.moduleType,
      modulePackageId: item.modulePackageId ?? null,
      category: item.category ?? null,
      defaultWidthMm: item.defaultWidth ?? null,
      defaultHeightMm: item.defaultHeight ?? null,
      defaultDepthMm: item.defaultDepth ?? null,
      tags: item.tags ?? []
    }))
  };
}

function searchCatalogMaterials(ctx: AssistantBridgeContext, input: Record<string, unknown>) {
  const query = typeof input.query === "string" ? normalizeSearchText(input.query) : "";
  const ids = new Set(Array.isArray(input.ids) ? input.ids.filter((value): value is string => typeof value === "string") : []);
  const boardFamily = typeof input.boardFamily === "string" ? input.boardFamily : "";
  const materialType = typeof input.materialType === "string" ? input.materialType : "";
  const supplierId = typeof input.supplierId === "string" ? input.supplierId : "";
  const limit = typeof input.limit === "number" ? Math.max(1, Math.min(200, Math.floor(input.limit))) : 50;
  const matches = ctx.catalog.materials.filter((material) => {
    if (material.isActive === false) return false;
    if (ids.size > 0 && !ids.has(material.id)) return false;
    if (boardFamily && material.boardFamily !== boardFamily) return false;
    if (materialType && material.materialType !== materialType) return false;
    if (supplierId && material.supplierId !== supplierId) return false;
    if (query) {
      const haystack = normalizeSearchText([
        material.id,
        material.materialCode,
        material.name,
        material.displayName,
        material.decor,
        material.manufacturer,
        material.supplierId,
        material.category,
        material.subcategory,
        material.recommendedUse,
        ...(material.tags ?? [])
      ].join(" "));
      if (!query.split(/\s+/u).every((token) => haystack.includes(token))) return false;
    }
    return true;
  });
  return {
    total: matches.length,
    truncated: matches.length > limit,
    materials: matches.slice(0, limit).map((material) => ({
      id: material.id,
      materialCode: material.materialCode ?? null,
      displayName: material.displayName,
      decor: material.decor,
      manufacturer: material.manufacturer ?? null,
      supplierId: material.supplierId ?? null,
      materialType: material.materialType,
      boardFamily: material.boardFamily ?? null,
      defaultThicknessMm: material.defaultThicknessMm,
      availableThicknessesMm: [...material.availableThicknessesMm],
      recommendedUse: material.recommendedUse ?? null,
      tags: [...material.tags]
    }))
  };
}

function listModulePresets(ctx: AssistantBridgeContext, instanceId: string) {
  const schema = getModuleParameterSchema(ctx, { instanceId });
  const currentParams = schema.currentParams as Record<string, unknown> | null;
  return {
    instanceId,
    modulePackageId: schema.modulePackageId,
    presets: schema.parameters
      .filter((parameter) => parameter.type === "select" && (parameter.options?.length ?? 0) > 0)
      .map((parameter) => ({
        parameterKey: parameter.key,
        label: parameter.label,
        currentValue: currentParams?.[parameter.key] ?? parameter.defaultValue ?? null,
        options: cloneJson(parameter.options ?? []),
        affects: parameter.affects
      }))
  };
}

function selectManyModules(ctx: AssistantBridgeContext, input: Record<string, unknown>) {
  const ids = [...new Set(Array.isArray(input.instanceIds)
    ? input.instanceIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [])];
  if (ids.length === 0) throw new Error("instanceIds must contain at least one module ID.");
  const modules = ids.map((id) => {
    const instance = ctx.findInstance(id);
    if (!instance) throw new Error(`Module ${id} was not found.`);
    return instance;
  });
  const groupIds = new Set(modules.map((instance) => instance.kitchenGroupId ?? "__ungrouped__"));
  if (groupIds.size > 1) throw new Error("Multi-selection modules must belong to the same kitchen group.");
  const roles = new Set(modules.map((instance) => getKitchenModuleRole(instance.params as Record<string, unknown>)));
  if (roles.size > 1) throw new Error("Multi-selection modules must belong to the same kitchen edit layer (lower, upper or tall).");
  const groupId = modules[0]?.kitchenGroupId ?? null;
  // activeKitchenGroupId can already point at the group while the selection
  // controller is still outside kitchen edit mode (for example immediately
  // after semantic kitchen creation). Enter explicitly before additive select.
  if (groupId) ctx.enterKitchenGroup(groupId, ids[0]);
  ctx.clearSelection();
  ctx.setSelectedModule(ids[0]!);
  for (const id of ids.slice(1)) ctx.setSelectedModule(id, { additive: true });
  const selected = selectedInstanceIds(ctx);
  if (selected.length !== ids.length || ids.some((id) => !selected.includes(id))) {
    throw new Error("Selection controller did not accept the exact requested module set.");
  }
  return buildContextSnapshot(ctx);
}

async function listRelatedProjects(ctx: AssistantBridgeContext, input: Record<string, unknown>) {
  const current = ctx.projectActions.getState().currentProject;
  const sameContactOnly = input.sameContactOnly !== false;
  if (sameContactOnly && !current) throw new Error("Open a project before matching its customer contact.");
  const search = typeof input.search === "string" ? normalizeSearchText(input.search) : "";
  const limit = typeof input.limit === "number" ? Math.max(1, Math.min(200, Math.floor(input.limit))) : 50;
  const currentContactTokens = current
    ? [current.contact.name, current.contact.email, current.contact.phone, current.contact.company]
        .map(normalizeSearchText)
        .filter(Boolean)
    : [];
  const projects = (await ctx.projectActions.list()).filter((project) => {
    const contactTokens = [project.contact.name, project.contact.email, project.contact.phone, project.contact.company]
      .map(normalizeSearchText)
      .filter(Boolean);
    if (sameContactOnly && !contactTokens.some((token) => currentContactTokens.includes(token))) return false;
    if (search) {
      const haystack = normalizeSearchText([project.name, project.location.address, ...contactTokens].join(" "));
      if (!search.split(/\s+/u).every((token) => haystack.includes(token))) return false;
    }
    return true;
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    total: projects.length,
    truncated: projects.length > limit,
    currentProjectId: current?.projectId ?? null,
    projects: projects.slice(0, limit).map((project) => ({
      projectId: project.projectId,
      name: project.name,
      status: project.status,
      updatedAt: project.updatedAt,
      contact: cloneJson(project.contact),
      location: cloneJson(project.location),
      isCurrent: project.projectId === current?.projectId
    }))
  };
}

function inspectMaterialUsageInSave(save: ProjectSaveFile, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const definitions = (Array.isArray(save.catalogSnapshot.materials) ? save.catalogSnapshot.materials : [])
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
    .filter((item) => normalizeSearchText(JSON.stringify(item)).includes(normalizedQuery));
  const materialIds = new Set(definitions
    .map((item) => typeof item.id === "string" ? item.id : null)
    .filter((value): value is string => !!value));
  if (materialIds.size === 0) materialIds.add(query);
  const occurrences: Array<{ path: string; value: string }> = [];
  const walk = (value: unknown, path: string, depth: number) => {
    if (occurrences.length >= 500 || depth > 24) return;
    if (typeof value === "string") {
      if (materialIds.has(value) || normalizeSearchText(value).includes(normalizedQuery)) occurrences.push({ path, value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (materialIds.has(key) || normalizeSearchText(key).includes(normalizedQuery)) occurrences.push({ path: `${path}.${key}`, value: key });
      walk(child, `${path}.${key}`, depth + 1);
    }
  };
  walk(save.appState.kitchen, "appState.kitchen", 0);
  walk(save.appState.modules, "appState.modules", 0);
  walk(save.appState.materialAssignments, "appState.materialAssignments", 0);
  return {
    project: { projectId: save.project.projectId, name: save.project.name, updatedAt: save.project.updatedAt },
    query,
    materialIds: [...materialIds].filter((id) =>
      definitions.length > 0 || occurrences.some((occurrence) => occurrence.value === id)),
    definitions: definitions.map((item) => ({
      id: item.id ?? null,
      materialCode: item.materialCode ?? null,
      displayName: item.displayName ?? item.name ?? null,
      decor: item.decor ?? null,
      manufacturer: item.manufacturer ?? null,
      supplierId: item.supplierId ?? null,
      boardFamily: item.boardFamily ?? null
    })),
    occurrenceCount: occurrences.length,
    truncated: occurrences.length >= 500,
    occurrences
  };
}

function replaceModule(ctx: AssistantBridgeContext, input: Record<string, unknown>) {
  const instanceId = requireString(input, "instanceId");
  const modulePackageId = requireString(input, "modulePackageId");
  const instance = ctx.findInstance(instanceId);
  if (!instance) throw new Error(`Module ${instanceId} was not found.`);
  const catalogModule = ctx.catalog.modules.find((item) => item.enabled && item.modulePackageId === modulePackageId) ?? null;
  const modulePackage = ctx.modulePackages.find((item) => item.module.modulePackageId === modulePackageId) ?? null;
  if (!catalogModule || !modulePackage || catalogModule.moduleType !== modulePackage.module.moduleType) {
    throw new Error(`Module package ${modulePackageId} is not enabled and registered for this tenant.`);
  }
  const group = instance.kitchenGroupId
    ? ctx.S.kitchenGroups.find((item) => item.id === instance.kitchenGroupId) ?? null
    : null;
  const defaults = createDefaultModulePackageParameters(modulePackage) as ModuleParams;
  applyKitchenContextToModuleParams(defaults, group?.ctx ?? ctx.S.kitchenCtx, ctx.catalog, modulePackage);
  const preserved: Record<string, unknown> = {};
  if (input.preserveDimensions === true) {
    for (const key of ["width", "widthMm", "height", "heightMm", "heightCarcass", "depth", "depthMm"] as const) {
      const value = (instance.params as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value)) preserved[key] = value;
    }
  }
  const overrides = input.parameterOverrides && typeof input.parameterOverrides === "object" && !Array.isArray(input.parameterOverrides)
    ? cloneJson(input.parameterOverrides as Record<string, unknown>)
    : {};
  const nextParams = validateModuleParams({
    ...defaults,
    ...preserved,
    ...overrides,
    type: catalogModule.moduleType
  } as ModuleParams, modulePackageId);
  const currentRole = getKitchenModuleRole(instance.params as Record<string, unknown>);
  const nextRole = getKitchenModuleRole(nextParams as Record<string, unknown>);
  if (currentRole !== nextRole) throw new Error(`Replacement role ${nextRole} does not match current role ${currentRole}.`);
  const previousParams = cloneJson(instance.params);
  const previousBinding = instance.kitchenPlacement ? cloneJson(instance.kitchenPlacement) : null;
  instance.params = nextParams;
  const rebuilt = ctx.rebuildInstance(instance, { previousParams, preserveBackAnchor: true });
  const groupCtx = group?.ctx ?? ctx.S.kitchenCtx;
  const placed = !previousBinding || ctx.applyKitchenPlacementBinding(instance, previousBinding, groupCtx.worktopBackOffsetMm);
  if (!rebuilt || !placed) {
    const failedParams = cloneJson(instance.params);
    instance.params = previousParams;
    ctx.rebuildInstance(instance, { previousParams: failedParams, preserveBackAnchor: true });
    if (previousBinding) ctx.applyKitchenPlacementBinding(instance, previousBinding, groupCtx.worktopBackOffsetMm);
    throw new Error(`Replacement of module ${instanceId} failed and was rolled back.`);
  }
  ctx.mountProps();
  ctx.updateLayoutPanel();
  ctx.updateSelectionHighlights();
  ctx.commitHistory();
  return { instanceId, modulePackageId, previousType: previousParams.type, moduleType: nextParams.type, kitchenPlacement: cloneJson(instance.kitchenPlacement) };
}

function inspectProjectValidity(ctx: AssistantBridgeContext) {
  const diagnostics: Array<{ code: string; severity: "error" | "warning"; kind: string; id: string; message: string }> = [];
  const collections = buildQueryableObjects(ctx);
  const seen = new Set<string>();
  for (const item of collections) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) diagnostics.push({ code: "duplicate_id", severity: "error", kind: item.kind, id: item.id, message: `Duplicate ${key}.` });
    seen.add(key);
  }
  const instanceIds = new Set(ctx.instances.map((item) => item.id));
  const groupIds = new Set(ctx.S.kitchenGroups.map((item) => item.id));
  const worktopIds = new Set(ctx.kitchenWorktops.map((item) => item.id));
  for (const inst of ctx.instances) {
    for (const message of validateModule(normalizeModuleParamsForSource(inst.params))) {
      diagnostics.push({ code: "invalid_module_params", severity: "error", kind: "module", id: inst.id, message });
    }
    if (inst.kitchenGroupId && !groupIds.has(inst.kitchenGroupId)) diagnostics.push({ code: "missing_kitchen_group", severity: "error", kind: "module", id: inst.id, message: `Missing kitchen group ${inst.kitchenGroupId}.` });
    const worktopId = inst.kitchenPlacement?.worktopId;
    if (worktopId && !worktopIds.has(worktopId)) diagnostics.push({ code: "missing_worktop", severity: "error", kind: "module", id: inst.id, message: `Missing worktop ${worktopId}.` });
  }
  for (const group of ctx.S.kitchenGroups) {
    for (const id of group.instanceIds) if (!instanceIds.has(id)) diagnostics.push({ code: "missing_group_instance", severity: "error", kind: "kitchenGroup", id: group.id, message: `Missing module ${id}.` });
  }
  for (const worktop of ctx.kitchenWorktops) {
    if (!groupIds.has(worktop.kitchenGroupId)) diagnostics.push({ code: "missing_worktop_group", severity: "error", kind: "worktop", id: worktop.id, message: `Missing kitchen group ${worktop.kitchenGroupId}.` });
  }
  return {
    valid: diagnostics.every((item) => item.severity !== "error"),
    diagnostics,
    checked: {
      objects: collections.length,
      modules: ctx.instances.length,
      kitchenGroups: ctx.S.kitchenGroups.length,
      worktops: ctx.kitchenWorktops.length
    }
  };
}

function selectEntity(ctx: AssistantBridgeContext, input: Record<string, unknown>): AssistantToolResult {
  const kind = requireString(input, "kind");
  const id = requireString(input, "id");
  const exists = kind === "module" ? !!ctx.findInstance(id)
    : kind === "wall" ? ctx.walls.some((item) => item.id === id)
      : kind === "floor" ? ctx.floors.some((item) => item.id === id)
        : kind === "column" ? ctx.columns.some((item) => item.id === id)
          : kind === "section" ? ctx.sections.some((item) => item.id === id)
            : kind === "kitchenGroup" ? ctx.S.kitchenGroups.some((item) => item.id === id)
              : false;
  if (!exists) throw new Error(`${kind} ${id} was not found.`);
  if (kind === "module") {
    const inst = ctx.findInstance(id)!;
    if (inst.kitchenGroupId && !ctx.S.kitchenEditMode) ctx.enterKitchenGroup(inst.kitchenGroupId, inst.id);
    else ctx.setSelectedModule(id);
  }
  else if (kind === "wall") ctx.setSelectedWall(id);
  else if (kind === "floor") ctx.setSelectedFloor(id);
  else if (kind === "column") ctx.setSelectedColumn(id);
  else if (kind === "section") ctx.setSelectedSection(id);
  else if (kind === "kitchenGroup") ctx.setSelectedKitchenGroup(id);
  return { ok: true, toolId: "selection.set", output: buildContextSnapshot(ctx), stateDeltaSummary: `Selected ${kind} ${id}.` };
}

function transformSelection(ctx: AssistantBridgeContext, input: Record<string, unknown>, kind: "move" | "rotate"): AssistantToolResult {
  const before = JSON.stringify(buildSceneSnapshot(ctx));
  if (!ctx.startTransformFromSelection(kind)) throw new Error(`Current selection cannot start ${kind}.`);
  if (kind === "move") {
    const dxMm = requireFiniteNumber(input, "dxMm");
    const dzMm = requireFiniteNumber(input, "dzMm");
    ctx.applyMoveDelta(new THREE.Vector3(dxMm / 1000, 0, dzMm / 1000));
  } else {
    const pivotPoints: THREE.Vector3[] = [];
    for (const id of ctx.S.selectedWallIds) {
      const wall = ctx.walls.find((item) => item.id === id);
      if (!wall) continue;
      pivotPoints.push(
        new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000),
        new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000)
      );
    }
    for (const id of selectedInstanceIds(ctx)) {
      const inst = ctx.findInstance(id);
      if (inst) pivotPoints.push(inst.root.position.clone());
    }
    if (pivotPoints.length === 0) throw new Error("The selected objects do not expose a rotation pivot.");
    const pivot = pivotPoints.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / pivotPoints.length);
    if (!ctx.setRotatePivot(pivot)) throw new Error("The editor could not initialize the rotation pivot.");
    ctx.applyRotateAngle(THREE.MathUtils.degToRad(requireFiniteNumber(input, "angleDeg")));
  }
  const output = buildSceneSnapshot(ctx);
  if (JSON.stringify(output) === before) {
    ctx.clearTransform();
    throw new Error(`The requested ${kind} produced no valid editor change.`);
  }
  ctx.commitHistory();
  ctx.clearTransform();
  ctx.mountProps();
  ctx.updateLayoutPanel();
  ctx.updateSelectionHighlights();
  return {
    ok: true,
    toolId: kind === "move" ? "editor.moveSelection" : "editor.rotateSelection",
    output,
    stateDeltaSummary: kind === "move" ? "Moved the current selection through the transform controller." : "Rotated the current selection through the transform controller."
  };
}

function validateModuleParams(params: ModuleParams, label: string): ModuleParams {
  const normalized = normalizeModuleParamsForSource(params);
  const errors = validateModule(normalized);
  if (errors.length > 0) throw new Error(`Invalid module params for ${label}: ${errors.join("; ")}`);
  return normalized;
}

function insertTenantCatalogModule(ctx: AssistantBridgeContext, input: Record<string, unknown>): LayoutInstance {
  const modulePackageId = requireString(input, "modulePackageId");
  const catalogModule = ctx.catalog.modules.find((item) => item.enabled && item.modulePackageId === modulePackageId) ?? null;
  if (!catalogModule) throw new Error(`Module package ${modulePackageId} is not enabled for this tenant.`);
  const modulePackage = ctx.modulePackages.find((item) => item.module.modulePackageId === modulePackageId) ?? null;
  if (!modulePackage || modulePackage.module.moduleType !== catalogModule.moduleType) {
    throw new Error(`Registered runtime package ${modulePackageId} is not available.`);
  }
  const groupId = typeof input.groupId === "string" ? input.groupId : ctx.S.activeKitchenGroupId ?? ctx.getSelectedKitchenGroupId();
  const group = groupId ? ctx.S.kitchenGroups.find((item) => item.id === groupId) ?? null : null;
  if (!group) throw new Error("A valid target kitchen group is required.");
  const overrides = input.parameterOverrides && typeof input.parameterOverrides === "object" && !Array.isArray(input.parameterOverrides)
    ? cloneJson(input.parameterOverrides as Record<string, unknown>)
    : {};
  const defaults = createDefaultModulePackageParameters(modulePackage) as ModuleParams;
  applyKitchenContextToModuleParams(defaults, group.ctx, ctx.catalog, modulePackage);
  const params = validateModuleParams({ ...defaults, ...overrides, type: catalogModule.moduleType } as ModuleParams, modulePackageId);
  return insertAssistantCatalogModule(ctx, params, group.id);
}

function coerceModulePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...patch };
  if (typeof next.width === "number" && next.widthMm === undefined) {
    next.widthMm = next.width;
    delete next.width;
  }
  return next;
}

async function executePatchSelectedParams(ctx: AssistantBridgeContext, input: Record<string, unknown>): Promise<AssistantToolResult> {
  const rawIds = Array.isArray(input.instanceIds) ? input.instanceIds.filter((id): id is string => typeof id === "string") : [];
  const ids = rawIds.length > 0 ? rawIds : selectedInstanceIds(ctx);
  const patch = input.patch && typeof input.patch === "object" && !Array.isArray(input.patch)
    ? coerceModulePatch(input.patch as Record<string, unknown>)
    : null;
  if (!patch) throw new Error("patch is required.");
  if (ids.length === 0) throw new Error("No selected module to patch.");

  const changed: string[] = [];
  const originals = new Map<string, ModuleParams>();
  try {
    for (const id of ids) {
      const inst = ctx.findInstance(id);
      if (!inst) throw new Error(`Module ${id} not found.`);
      const previousParams = cloneJson(inst.params);
      originals.set(id, previousParams);
      const nextParams = normalizeModuleParamsForSource({
        ...cloneJson(inst.params),
        ...cloneJson(patch)
      } as ModuleParams, typeof input.sourceKey === "string" ? input.sourceKey : undefined);
      const errors = validateModule(nextParams);
      if (errors.length > 0) throw new Error(`Invalid module params for ${id}: ${errors.join("; ")}`);
      inst.params = nextParams;
      const ok = ctx.rebuildInstance(inst, {
        previousParams,
        preserveBackAnchor: true,
        sourceKey: typeof input.sourceKey === "string" ? input.sourceKey : undefined
      });
      if (!ok) throw new Error(`Rebuild failed for module ${id}.`);
      changed.push(id);
    }
  } catch (error) {
    for (const [id, previousParams] of originals) {
      const inst = ctx.findInstance(id);
      if (!inst) continue;
      const failedParams = cloneJson(inst.params);
      inst.params = cloneJson(previousParams);
      ctx.rebuildInstance(inst, { previousParams: failedParams, preserveBackAnchor: true });
    }
    throw error;
  }
  commitHistory(ctx.S);
  ctx.mountProps();
  ctx.updateLayoutPanel();
  ctx.updateSelectionHighlights();
  return {
    ok: true,
    toolId: "module.patchSelectedParams",
    output: { changed, patch },
    stateDeltaSummary: `Updated module params on ${changed.length} module(s).`
  };
}

function hostedWall(ctx: AssistantBridgeContext, wallId: string): WallInstance {
  const wall = ctx.walls.find((item) => item.id === wallId);
  if (!wall) throw new Error(`Wall ${wallId} was not found.`);
  const { aMm, bMm } = wall.params;
  if (Math.hypot(bMm.x - aMm.x, bMm.z - aMm.z) <= 0) throw new Error(`Wall ${wallId} has no usable length.`);
  return wall;
}

function validateHostedOpening(ctx: AssistantBridgeContext, opening: DoorInstance | WindowInstance, excludedId?: string): WallInstance {
  const wallId = opening.params.wallId;
  if (!wallId) throw new Error("A wall-hosted opening requires wallId.");
  const wall = hostedWall(ctx, wallId);
  const lengthMm = Math.hypot(wall.params.bMm.x - wall.params.aMm.x, wall.params.bMm.z - wall.params.aMm.z);
  const validation = validateOpeningPlacement({
    wallId,
    lengthMm,
    centerMm: opening.params.centerMm,
    widthMm: opening.params.widthMm,
    existingOpenings: [...ctx.doors, ...ctx.windows].filter((item) => item.id !== excludedId)
  });
  if (!validation.valid) {
    const conflict = validation.conflictingOpeningId ? ` (${validation.conflictingOpeningId})` : "";
    throw new Error(`Opening placement is ${validation.reason}${conflict}.`);
  }
  return wall;
}

function refreshOpeningUi(ctx: AssistantBridgeContext, wall: WallInstance) {
  ctx.rebuildWall(wall);
  ctx.rebuildWallPlanMesh();
  ctx.mountProps();
  ctx.updateLayoutPanel();
  ctx.updateSelectionHighlights();
}

function createDoorOpening(ctx: AssistantBridgeContext, input: Record<string, unknown>): AssistantToolResult {
  const wallId = requireString(input, "wallId");
  const inst = ctx.createDoor("back", wallId);
  const candidate = ctx.clampDoorParams({ ...inst.params, ...cloneJson(input), wall: "back", wallId });
  inst.params = candidate;
  const wall = validateHostedOpening(ctx, inst);
  ctx.doors.push(inst);
  ctx.layoutRoot.add(inst.root);
  ctx.updateDoorTransform(inst);
  ctx.setActiveDoor(inst);
  ctx.setSelectedDoor();
  refreshOpeningUi(ctx, wall);
  ctx.commitHistory();
  return { ok: true, toolId: "opening.createDoor", output: { id: inst.id, params: cloneJson(inst.params) }, stateDeltaSummary: `Created door ${inst.id} on wall ${wall.id}.` };
}

function createWindowOpening(ctx: AssistantBridgeContext, input: Record<string, unknown>): AssistantToolResult {
  const wallId = requireString(input, "wallId");
  const inst = ctx.createWindow("back", wallId);
  const candidate = ctx.clampWindowParams({ ...inst.params, ...cloneJson(input), wall: "back", wallId });
  inst.params = candidate;
  const wall = validateHostedOpening(ctx, inst);
  ctx.windows.push(inst);
  ctx.layoutRoot.add(inst.root);
  ctx.updateWindowTransform(inst);
  ctx.setActiveWindow(inst);
  ctx.setSelectedWindow();
  refreshOpeningUi(ctx, wall);
  ctx.commitHistory();
  return { ok: true, toolId: "opening.createWindow", output: { id: inst.id, params: cloneJson(inst.params) }, stateDeltaSummary: `Created window ${inst.id} on wall ${wall.id}.` };
}

function updateDoorOpening(ctx: AssistantBridgeContext, input: Record<string, unknown>): AssistantToolResult {
  const id = requireString(input, "id");
  const inst = ctx.doors.find((item) => item.id === id);
  if (!inst) throw new Error(`Door ${id} was not found.`);
  const patch = input.patch as Record<string, unknown>;
  const previous = cloneJson(inst.params);
  const candidate = ctx.clampDoorParams({ ...previous, ...cloneJson(patch), wall: "back" });
  inst.params = candidate;
  try {
    const wall = validateHostedOpening(ctx, inst, id);
    ctx.updateDoorTransform(inst);
    ctx.setActiveDoor(inst);
    ctx.setSelectedDoor();
    refreshOpeningUi(ctx, wall);
    if (previous.wallId && previous.wallId !== wall.id) refreshOpeningUi(ctx, hostedWall(ctx, previous.wallId));
    ctx.commitHistory();
    return { ok: true, toolId: "opening.updateDoor", output: { id, params: cloneJson(inst.params) }, stateDeltaSummary: `Updated door ${id}.` };
  } catch (error) {
    inst.params = previous;
    throw error;
  }
}

function updateWindowOpening(ctx: AssistantBridgeContext, input: Record<string, unknown>): AssistantToolResult {
  const id = requireString(input, "id");
  const inst = ctx.windows.find((item) => item.id === id);
  if (!inst) throw new Error(`Window ${id} was not found.`);
  const patch = input.patch as Record<string, unknown>;
  const previous = cloneJson(inst.params);
  const candidate = ctx.clampWindowParams({ ...previous, ...cloneJson(patch), wall: "back" });
  inst.params = candidate;
  try {
    const wall = validateHostedOpening(ctx, inst, id);
    ctx.updateWindowTransform(inst);
    ctx.setActiveWindow(inst);
    ctx.setSelectedWindow();
    refreshOpeningUi(ctx, wall);
    if (previous.wallId && previous.wallId !== wall.id) refreshOpeningUi(ctx, hostedWall(ctx, previous.wallId));
    ctx.commitHistory();
    return { ok: true, toolId: "opening.updateWindow", output: { id, params: cloneJson(inst.params) }, stateDeltaSummary: `Updated window ${id}.` };
  } catch (error) {
    inst.params = previous;
    throw error;
  }
}

function deleteOpening(ctx: AssistantBridgeContext, input: Record<string, unknown>): AssistantToolResult {
  const kind = requireString(input, "kind");
  const id = requireString(input, "id");
  const collection = kind === "door" ? ctx.doors : kind === "window" ? ctx.windows : null;
  if (!collection) throw new Error("Opening kind is invalid.");
  const index = collection.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`${kind === "door" ? "Door" : "Window"} ${id} was not found.`);
  const inst = collection[index];
  const wall = inst.params.wallId ? hostedWall(ctx, inst.params.wallId) : null;
  collection.splice(index, 1);
  inst.root.parent?.remove(inst.root);
  ctx.disposeObject3D(inst.root);
  if (kind === "door") {
    ctx.setActiveDoor(ctx.doors.at(-1) ?? null);
    if (ctx.doors.length > 0) ctx.setSelectedDoor(); else ctx.clearSelection();
  } else {
    ctx.setActiveWindow(ctx.windows.at(-1) ?? null);
    if (ctx.windows.length > 0) ctx.setSelectedWindow(); else ctx.clearSelection();
  }
  if (wall) refreshOpeningUi(ctx, wall);
  ctx.commitHistory();
  return { ok: true, toolId: "opening.delete", output: { kind, id }, stateDeltaSummary: `Deleted ${kind} ${id}.` };
}

async function downloadExport(ctx: AssistantBridgeContext, input: Record<string, unknown>): Promise<AssistantToolResult> {
  const format = requireString(input, "format");
  if (format === "layout-json") await ctx.exportActions.exportLayoutJsonFile();
  else if (format === "scene-json") await ctx.exportActions.exportSceneJsonFile();
  else if (format === "website-initial-json") await ctx.exportActions.exportWebsiteShowcaseFile("initial");
  else if (format === "website-final-json") await ctx.exportActions.exportWebsiteShowcaseFile("final");
  else if (format === "viewport-png") ctx.exportActions.downloadViewportPng();
  else throw new Error("Export format is invalid.");
  return {
    ok: true,
    toolId: "export.download",
    output: { format, downloadStarted: true },
    stateDeltaSummary: `Started ${format} download.`
  };
}

function createCustomFurniture(ctx: AssistantBridgeContext, input: Record<string, unknown>): AssistantToolResult {
  const boundary = Array.isArray(input.boundary)
    ? input.boundary.map((point, index) => requirePlanPoint(point, `boundary[${index}]`))
    : [];
  if (boundary.length < 3 || new Set(boundary.map((point) => `${point.x}:${point.z}`)).size < 3) {
    throw new Error("Custom furniture boundary must contain at least three distinct points.");
  }
  const constraint = (value: unknown, fallback: "projectBase" | "furnitureTop") =>
    value === "projectBase" || value === "furnitureBase" || value === "furnitureTop" || value === "absolute" ? value : fallback;
  const furniture = ctx.customFurnitureActions.createCustomFurniture({
    name: requireString(input, "name"),
    boundary,
    boards: [],
    baseConstraint: constraint(input.baseConstraint, "projectBase"),
    baseOffsetMm: typeof input.baseOffsetMm === "number" ? input.baseOffsetMm : 0,
    topConstraint: constraint(input.topConstraint, "furnitureTop"),
    topOffsetMm: typeof input.topOffsetMm === "number" ? input.topOffsetMm : 0
  });
  ctx.customFurnitureActions.selectFurniture(furniture.id);
  return { ok: true, toolId: "customFurniture.create", output: { id: furniture.id, params: cloneJson(furniture.params) }, stateDeltaSummary: `Created custom furniture ${furniture.id}.` };
}

async function executeToolCall(ctx: AssistantBridgeContext, call: AssistantToolCall): Promise<AssistantToolResult> {
  try {
    const definition = assertToolAllowed(call.toolId);
    const validation = validateAssistantToolCall(call);
    if (validation.errors.length > 0) throw new Error(validation.errors.join(" "));
    if (definition.requiresConfirmation && call.confirmed !== true) {
      throw new Error(`Assistant tool ${definition.id} requires explicit user confirmation.`);
    }
    if ((definition.operation ?? (definition.readOnly ? "read" : "write")) === "write") {
      await ctx.authorizeToolCall?.(call);
    }
    if (definition.id === "context.getSelection") {
      return { ok: true, toolId: call.toolId, output: buildContextSnapshot(ctx), stateDeltaSummary: "Read live editor context." };
    }
    if (definition.id === "context.getScene") {
      return { ok: true, toolId: call.toolId, output: buildSceneSnapshot(ctx), stateDeltaSummary: "Read live editable scene." };
    }
    if (definition.id === "context.getCurrentView") {
      return {
        ok: true,
        toolId: call.toolId,
        output: {
          activeViewerTab: ctx.getActiveViewerTab(),
          viewMode: ctx.getViewMode(),
          layoutTool: ctx.getLayoutTool(),
          ...buildCurrentViewState(ctx)
        },
        stateDeltaSummary: "Read current viewer and camera state."
      };
    }
    if (definition.id === "view.focusObjects") {
      const selection = selectManyModules(ctx, call.input);
      const perspective = call.input.perspective;
      if (perspective !== "front" && perspective !== "back" && perspective !== "left" && perspective !== "right" && perspective !== "top" && perspective !== "isometric") {
        throw new Error("perspective is invalid.");
      }
      if (!ctx.focusSelectionView(perspective, typeof call.input.padding === "number" ? call.input.padding : undefined)) {
        throw new Error("The selected object bounds could not be framed.");
      }
      return {
        ok: true,
        toolId: call.toolId,
        output: { selection, view: buildCurrentViewState(ctx) },
        stateDeltaSummary: `Focused ${selection.selectedInstanceIds.length} module(s) from the ${perspective} view.`
      };
    }
    if (definition.id === "context.queryObjects") {
      return { ok: true, toolId: call.toolId, output: queryObjects(ctx, call.input), stateDeltaSummary: "Queried live project objects." };
    }
    if (definition.id === "context.getObject") {
      return { ok: true, toolId: call.toolId, output: getExactObject(ctx, call.input), stateDeltaSummary: "Read one live project object." };
    }
    if (definition.id === "project.getMetadata") {
      const state = ctx.projectActions.getState();
      return {
        ok: true,
        toolId: call.toolId,
        output: {
          project: cloneJson(state.currentProject),
          projectId: state.currentProject?.projectId ?? null,
          activePhaseId: state.currentProject?.activePhaseId ?? null,
          lastSavedAt: state.lastSavedAt,
          saveRevision: state.saveRevision,
          editingSessionId: state.editingSessionId
        },
        stateDeltaSummary: "Read current project metadata."
      };
    }
    if (definition.id === "project.listRelated") {
      return { ok: true, toolId: call.toolId, output: await listRelatedProjects(ctx, call.input), stateDeltaSummary: "Listed related tenant projects without loading them." };
    }
    if (definition.id === "project.inspectMaterialUsage") {
      const save = await ctx.projectActions.inspectById(requireString(call.input, "projectId"));
      return {
        ok: true,
        toolId: call.toolId,
        output: inspectMaterialUsageInSave(save, requireString(call.input, "query")),
        stateDeltaSummary: "Inspected material usage without replacing the open project."
      };
    }
    if (definition.id === "module.getParameterSchema") {
      return { ok: true, toolId: call.toolId, output: getModuleParameterSchema(ctx, call.input), stateDeltaSummary: "Read module parameter schema." };
    }
    if (definition.id === "module.listPresets") {
      return { ok: true, toolId: call.toolId, output: listModulePresets(ctx, requireString(call.input, "instanceId")), stateDeltaSummary: "Listed authoritative module presets." };
    }
    if (definition.id === "module.applyPreset") {
      const instanceId = requireString(call.input, "instanceId");
      const parameterKey = requireString(call.input, "parameterKey");
      const value = typeof call.input.value === "string" ? call.input.value : "";
      const presets = listModulePresets(ctx, instanceId).presets;
      const preset = presets.find((item) => item.parameterKey === parameterKey) ?? null;
      if (!preset || !preset.options.some((option) => option.value === value)) {
        throw new Error(`Preset ${parameterKey}=${value} is not allowed for module ${instanceId}.`);
      }
      const result = await executePatchSelectedParams(ctx, { instanceIds: [instanceId], patch: { [parameterKey]: value }, sourceKey: parameterKey });
      return { ...result, toolId: call.toolId, stateDeltaSummary: `Applied preset ${parameterKey}=${value} to ${instanceId}.` };
    }
    if (definition.id === "module.replace") {
      return { ok: true, toolId: call.toolId, output: replaceModule(ctx, call.input), stateDeltaSummary: "Replaced module package while preserving its stable placement." };
    }
    if (definition.id === "catalog.searchModules") {
      return { ok: true, toolId: call.toolId, output: searchCatalogModules(ctx, call.input), stateDeltaSummary: "Searched enabled tenant modules." };
    }
    if (definition.id === "catalog.searchMaterials") {
      return { ok: true, toolId: call.toolId, output: searchCatalogMaterials(ctx, call.input), stateDeltaSummary: "Searched active tenant materials." };
    }
    if (definition.id === "kitchen.validateCreate") {
      const controller = createAssistantKitchenController(ctx);
      return {
        ok: true,
        toolId: call.toolId,
        output: controller.validateCreate(call.input as unknown as AssistantKitchenCreateInput),
        stateDeltaSummary: "Validated semantic kitchen JSON without changing the project."
      };
    }
    if (definition.id === "kitchen.create") {
      const controller = createAssistantKitchenController(ctx);
      const output = controller.create(call.input as unknown as AssistantKitchenCreateInput);
      return { ok: true, toolId: call.toolId, output, stateDeltaSummary: `Created kitchen ${output.groupId} transactionally.` };
    }
    if (definition.id === "kitchen.getSummary") {
      const output = createAssistantKitchenController(ctx).getSummary(requireString(call.input, "groupId"));
      return { ok: true, toolId: call.toolId, output, stateDeltaSummary: "Inspected kitchen counts, runs, materials and overlaps." };
    }
    if (definition.id === "kitchen.updateParameters") {
      const patch = call.input.patch && typeof call.input.patch === "object" && !Array.isArray(call.input.patch)
        ? call.input.patch as Partial<KitchenContext>
        : {};
      const output = createAssistantKitchenController(ctx).updateParameters(requireString(call.input, "groupId"), patch);
      return { ok: true, toolId: call.toolId, output, stateDeltaSummary: "Updated kitchen parameters and rebuilt affected geometry." };
    }
    if (definition.id === "kitchen.applyMaterial") {
      const scopes = Array.isArray(call.input.scopes)
        ? call.input.scopes.filter((scope): scope is "corpus" | "fronts" | "backs" | "drawerBottoms" | "worktop" =>
            scope === "corpus" || scope === "fronts" || scope === "backs" || scope === "drawerBottoms" || scope === "worktop")
        : [];
      const output = createAssistantKitchenController(ctx).applyMaterial(
        requireString(call.input, "groupId"),
        requireString(call.input, "materialId"),
        scopes
      );
      return { ok: true, toolId: call.toolId, output, stateDeltaSummary: "Applied material across requested kitchen scopes." };
    }
    if (definition.id === "validation.inspectProject") {
      return { ok: true, toolId: call.toolId, output: inspectProjectValidity(ctx), stateDeltaSummary: "Inspected live project validity." };
    }
    if (definition.id === "catalog.listModules") {
      return {
        ok: true,
        toolId: call.toolId,
        output: ctx.catalog.modules.filter((item) => item.enabled).map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description ?? null,
          moduleType: item.moduleType,
          modulePackageId: item.modulePackageId ?? null,
          category: item.category ?? null,
          defaultWidthMm: item.defaultWidth ?? null,
          defaultHeightMm: item.defaultHeight ?? null,
          defaultDepthMm: item.defaultDepth ?? null,
          tags: item.tags ?? []
        })),
        stateDeltaSummary: "Listed enabled tenant modules."
      };
    }
    if (definition.id === "pricing.getSummary") {
      const entries = buildProjectPricingViews(ctx.instances, ctx.kitchenWorktops, ctx.S.customFurniture, ctx.S.kitchenCtx, ctx.catalog);
      return {
        ok: true,
        toolId: call.toolId,
        output: {
          quote: buildProjectQuoteSummary(entries, ctx.getProjectMarginSettings()),
          entities: entries.map((entry) => ({
            id: entry.instanceId,
            kind: entry.kind,
            label: entry.label,
            pricingStatus: entry.result.pricing.pricingStatus,
            validationErrors: entry.result.pricing.validationErrors,
            finalPrice: entry.result.pricing.finalPrice
          }))
        },
        stateDeltaSummary: "Calculated the current BOM-backed project price."
      };
    }
    if (definition.id === "selection.set") return selectEntity(ctx, call.input);
    if (definition.id === "selection.setMany") {
      return { ok: true, toolId: call.toolId, output: selectManyModules(ctx, call.input), stateDeltaSummary: "Selected the exact requested module set." };
    }
    if (definition.id === "selection.clear") {
      ctx.clearSelection();
      return { ok: true, toolId: call.toolId, output: buildContextSnapshot(ctx), stateDeltaSummary: "Cleared editor selection." };
    }
    if (definition.id === "module.patchSelectedParams") {
      return await executePatchSelectedParams(ctx, call.input);
    }
    if (definition.id === "editor.moveSelection") return transformSelection(ctx, call.input, "move");
    if (definition.id === "editor.rotateSelection") return transformSelection(ctx, call.input, "rotate");
    if (definition.id === "editor.duplicateSelection") {
      const before = JSON.stringify(buildSceneSnapshot(ctx));
      ctx.duplicateSelected();
      const output = buildSceneSnapshot(ctx);
      if (JSON.stringify(output) === before) throw new Error("The current selection could not be duplicated.");
      return { ok: true, toolId: call.toolId, output, stateDeltaSummary: "Duplicated the current selection." };
    }
    if (definition.id === "editor.deleteSelection") {
      if (!ctx.deleteSelected()) throw new Error("The current selection could not be deleted.");
      return { ok: true, toolId: call.toolId, output: buildContextSnapshot(ctx), stateDeltaSummary: "Deleted the current selection." };
    }
    if (definition.id === "history.undo" || definition.id === "history.redo") {
      const before = JSON.stringify(buildSceneSnapshot(ctx));
      if (definition.id === "history.undo") ctx.undo();
      else ctx.redo();
      const output = buildSceneSnapshot(ctx);
      if (JSON.stringify(output) === before) throw new Error(`No ${definition.id === "history.undo" ? "undo" : "redo"} snapshot is available.`);
      return { ok: true, toolId: call.toolId, output, stateDeltaSummary: definition.id === "history.undo" ? "Undid the previous editor mutation." : "Redid the next editor mutation." };
    }
    if (definition.id === "wall.create") {
      const aMm = requirePlanPoint(call.input.aMm, "aMm");
      const bMm = requirePlanPoint(call.input.bMm, "bMm");
      if (samePlanPoint(aMm, bMm)) throw new Error("Wall endpoints must be distinct.");
      const wall = ctx.addWall(
        new THREE.Vector3(aMm.x / 1000, 0, aMm.z / 1000),
        new THREE.Vector3(bMm.x / 1000, 0, bMm.z / 1000),
        typeof call.input.thicknessMm === "number" ? call.input.thicknessMm : 150
      );
      if (!wall) throw new Error("Wall creation was blocked by editor constraints.");
      return { ok: true, toolId: call.toolId, output: { id: wall.id, params: cloneJson(wall.params) }, stateDeltaSummary: `Created wall ${wall.id}.` };
    }
    if (definition.id === "opening.createDoor") return createDoorOpening(ctx, call.input);
    if (definition.id === "opening.createWindow") return createWindowOpening(ctx, call.input);
    if (definition.id === "opening.updateDoor") return updateDoorOpening(ctx, call.input);
    if (definition.id === "opening.updateWindow") return updateWindowOpening(ctx, call.input);
    if (definition.id === "opening.delete") return deleteOpening(ctx, call.input);
    if (definition.id === "floor.create") {
      const materialId = requireString(call.input, "materialId");
      assertCatalogMaterial(ctx, materialId);
      const boundary = (call.input.boundary as unknown[]).map((point, index) => requirePlanPoint(point, `boundary[${index}]`));
      if (new Set(boundary.map((point) => `${point.x}:${point.z}`)).size < 3) throw new Error("Floor boundary must contain at least three distinct points.");
      const floor = ctx.createFloor({
        name: requireString(call.input, "name"),
        heightMm: requireFiniteNumber(call.input, "heightMm"),
        thicknessMm: requireFiniteNumber(call.input, "thicknessMm"),
        materialId,
        boundary
      });
      return { ok: true, toolId: call.toolId, output: { id: floor.id, params: cloneJson(floor.params) }, stateDeltaSummary: `Created floor ${floor.id}.` };
    }
    if (definition.id === "column.create") {
      const materialId = requireString(call.input, "materialId");
      assertCatalogMaterial(ctx, materialId);
      const column = ctx.createColumn(call.input as Partial<ColumnParams>);
      return { ok: true, toolId: call.toolId, output: { id: column.id, params: cloneJson(column.params) }, stateDeltaSummary: `Created column ${column.id}.` };
    }
    if (definition.id === "section.create") {
      const aMm = requirePlanPoint(call.input.aMm, "aMm");
      const bMm = requirePlanPoint(call.input.bMm, "bMm");
      if (samePlanPoint(aMm, bMm)) throw new Error("Section endpoints must be distinct.");
      const section = ctx.createSection({ name: requireString(call.input, "name"), aMm, bMm, mirrored: call.input.mirrored === true });
      return { ok: true, toolId: call.toolId, output: { id: section.id, params: cloneJson(section.params) }, stateDeltaSummary: `Created section ${section.id}.` };
    }
    if (definition.id === "catalog.insertModule") {
      const inst = insertTenantCatalogModule(ctx, call.input);
      return { ok: true, toolId: call.toolId, output: { instanceId: inst.id, moduleType: inst.params.type }, stateDeltaSummary: `Inserted tenant module ${inst.params.type}.` };
    }
    if (definition.id === "vendorCatalog.insertResolvedModule") {
      const catalogKey = requireString(call.input, "catalogKey");
      const productTemplateId = requireString(call.input, "productTemplateId");
      const moduleType = requireString(call.input, "moduleType");
      const modulePackageId = requireString(call.input, "modulePackageId");
      const moduleMatch = ctx.catalog.modules.some((item) => item.enabled && item.moduleType === moduleType && item.modulePackageId === modulePackageId);
      if (!moduleMatch) throw new Error("Resolved vendor module package is not available in the browser tenant catalog.");
      const initialParams = call.input.initialParams;
      if (!initialParams || typeof initialParams !== "object" || Array.isArray(initialParams)) {
        throw new Error("initialParams are required.");
      }
      const params = validateModuleParams({ ...(cloneJson(initialParams) as ModuleParams), type: moduleType }, catalogKey);
      const inst = insertAssistantCatalogModule(ctx, params, typeof call.input.groupId === "string" ? call.input.groupId : null);
      return {
        ok: true,
        toolId: call.toolId,
        output: {
          instanceId: inst.id,
          moduleType: inst.params.type,
          catalogKey: typeof (inst.params as Record<string, unknown>).catalogKey === "string" ? (inst.params as Record<string, unknown>).catalogKey : null
        },
        stateDeltaSummary: `Inserted PINO module ${(call.input.productTemplateName as string | undefined) ?? inst.params.type}.`
      };
    }
    if (definition.id === "project.save") {
      const save = await ctx.projectActions.save();
      return {
        ok: true,
        toolId: call.toolId,
        output: { projectId: save.project.projectId, savedAt: save.integrity.savedAt, saveRevision: save.integrity.saveRevision },
        stateDeltaSummary: `Saved project revision ${save.integrity.saveRevision}.`
      };
    }
    if (definition.id === "export.download") return await downloadExport(ctx, call.input);
    if (definition.id === "customFurniture.create") return createCustomFurniture(ctx, call.input);
    throw new Error(`Assistant tool ${call.toolId} has no executor.`);
  } catch (error) {
    return {
      ok: false,
      toolId: call.toolId,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function createAssistantBridge(ctx: AssistantBridgeContext): ArcigyAssistantBridge {
  return {
    getContextSnapshot: () => buildContextSnapshot(ctx),
    getToolDefinitions: () => ASSISTANT_TOOL_DEFINITIONS.map((tool) => ({ ...tool })),
    executeToolCall: async (call) => ({ ...(await executeToolCall(ctx, call)), callId: call.id })
  };
}

export function installAssistantBridge(ctx: AssistantBridgeContext): ArcigyAssistantBridge {
  const bridge = createAssistantBridge(ctx);
  window.__arcigyAssistant = bridge;
  return bridge;
}
