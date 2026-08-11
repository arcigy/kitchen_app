import * as THREE from "three";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { createDefaultModulePackageParameters } from "../core/module-package/runtime/module-runtime-adapter";
import type {
  AppState,
  KitchenPlacementBinding,
  KitchenWorktopInstance,
  KitchenWorktopParams,
  LayoutInstance
} from "../layout/appState";
import {
  makeDefaultKitchenContext,
  resolveContext,
  validateContext,
  type KitchenContext
} from "../layout/kitchenContext";
import { applyKitchenContextToModuleParams } from "../layout/kitchenMaterialSync";
import { getKitchenModuleRole, isKitchenCornerModule, type KitchenModuleEditLayer } from "../layout/kitchenModuleRules";
import type { KitchenRunDimensionSource } from "../layout/kitchenRunDimensions";
import { normalizeModuleParamsForSource, validateModule, type ModuleParams } from "../model/cabinetTypes";
import {
  buildSemanticKitchenPath,
  inspectKitchenRunOverlaps,
  placeOnKitchenRun,
  validateSemanticKitchenLayout,
  type KitchenPlacementAnchor,
  type SemanticKitchenLayout
} from "../assistant/kitchenSemanticLayout";

export type AssistantKitchenModuleSpec = {
  modulePackageId: string;
  zone: "lower" | "upper";
  runIndex?: number;
  cornerIndex?: number;
  anchor?: KitchenPlacementAnchor;
  offsetAlongMm?: number;
  gapMm?: number;
  parameterOverrides?: Record<string, unknown>;
};

export type AssistantKitchenCreateInput = {
  name: string;
  source?: { kind: "text" | "photo"; scaleConfirmed?: boolean };
  layout: SemanticKitchenLayout;
  contextPatch?: Partial<KitchenContext>;
  worktop?: Partial<Pick<KitchenWorktopParams, "depthMm" | "thicknessMm" | "heightMm" | "overhangSideMm" | "materialId" | "justification" | "mirrored" | "segmentDepthsMm">>;
  modules?: AssistantKitchenModuleSpec[];
};

type GuideSegmentInfo = {
  start: THREE.Vector3;
  dir: THREE.Vector3;
  frontNormal: THREE.Vector3;
  length: number;
};

type CornerPlacementInfo = {
  binding: KitchenPlacementBinding;
  valid: boolean;
};

export type AssistantKitchenControllerContext = {
  S: AppState;
  catalog: ClientCatalog;
  modulePackages: readonly FurnQuoteModulePackage[];
  instances: LayoutInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  layoutRoot: THREE.Group;
  createInstance: (params: ModuleParams) => LayoutInstance;
  deleteInstance: (id: string) => void;
  createKitchenWorktop: (
    params: KitchenWorktopParams,
    kitchenGroupId: string,
    opts?: { id?: string; skipHistory?: boolean }
  ) => KitchenWorktopInstance;
  removeKitchenWorktop: (id: string, opts?: { skipHistory?: boolean }) => void;
  rebuildKitchenWorktop: (worktop: KitchenWorktopInstance) => void;
  rebuildKitchenGroupLayout: (groupId: string, nextCtx: KitchenContext, prevCtx?: KitchenContext) => void;
  getKitchenGuideSegmentInfo: (worktop: KitchenWorktopInstance, segmentIndex: number, backOffsetMm: number) => GuideSegmentInfo | null;
  getKitchenCornerPlacementInfo: (
    worktop: KitchenWorktopInstance,
    cornerIndex: number,
    backOffsetMm: number,
    instance: LayoutInstance
  ) => CornerPlacementInfo | null;
  applyKitchenPlacementBinding: (instance: LayoutInstance, binding: KitchenPlacementBinding, backOffsetMm: number) => boolean;
  getKitchenRunDimensionSources: (groupId: string, role?: KitchenModuleEditLayer) => KitchenRunDimensionSource[];
  setSelectedKitchenGroup: (id: string | null) => void;
  setSelectedModule: (id: string | null) => void;
  updateLayoutPanel: () => void;
  updateSelectionHighlights: () => void;
  mountProps: () => void;
  commitHistory: () => void;
};

const CONTEXT_PATCH_KEYS = new Set<keyof KitchenContext>([
  "name",
  "wallHeightMm",
  "heightMm",
  "worktopDepthMm",
  "worktopFrontOffsetMm",
  "worktopBackOffsetMm",
  "worktopThicknessMm",
  "worktopCornerCutMm",
  "worktopOverhangSideMm",
  "plinthHeightMm",
  "plinthDepthMm",
  "upperStartHeightMm",
  "upperDepthMm",
  "upperHeightMm",
  "tallDepthMm",
  "tallHeightMm",
  "doorOverlayMm",
  "backPanelThicknessMm",
  "endPanelThicknessMm",
  "frontsMaterialId",
  "corpusMaterialId",
  "backMaterialId",
  "drawerBottomMaterialId",
  "worktopMaterialId",
  "handleComponentId",
  "fillerStrategy",
  "gapWarningMm",
  "overlapErrorMm"
]);

const clone = <T>(value: T): T => structuredClone(value);

const activeMaterial = (catalog: ClientCatalog, materialId: string) =>
  catalog.materials.find((material) => material.id === materialId && material.isActive !== false) ?? null;

function validateContextPatch(patch: Partial<KitchenContext> | undefined) {
  for (const key of Object.keys(patch ?? {})) {
    if (!CONTEXT_PATCH_KEYS.has(key as keyof KitchenContext)) {
      throw new Error(`Kitchen context key ${key} is derived or not editable.`);
    }
  }
}

function validateContextCatalogReferences(ctx: KitchenContext, catalog: ClientCatalog) {
  for (const [key, materialId] of [
    ["frontsMaterialId", ctx.frontsMaterialId],
    ["corpusMaterialId", ctx.corpusMaterialId],
    ["backMaterialId", ctx.backMaterialId],
    ["drawerBottomMaterialId", ctx.drawerBottomMaterialId],
    ["worktopMaterialId", ctx.worktopMaterialId]
  ] as const) {
    if (!activeMaterial(catalog, materialId)) throw new Error(`${key} ${materialId} is not active in the tenant catalog.`);
  }
  if (!catalog.components.some((component) => component.id === ctx.handleComponentId && component.isActive !== false)) {
    throw new Error(`handleComponentId ${ctx.handleComponentId} is not active in the tenant catalog.`);
  }
}

function modulePackageForSpec(ctx: AssistantKitchenControllerContext, spec: AssistantKitchenModuleSpec) {
  const catalogModule = ctx.catalog.modules.find((item) => item.enabled && item.modulePackageId === spec.modulePackageId) ?? null;
  if (!catalogModule) throw new Error(`Module package ${spec.modulePackageId} is not enabled for this tenant.`);
  const modulePackage = ctx.modulePackages.find((item) => item.module.modulePackageId === spec.modulePackageId) ?? null;
  if (!modulePackage || modulePackage.module.moduleType !== catalogModule.moduleType) {
    throw new Error(`Runtime package ${spec.modulePackageId} is not registered.`);
  }
  return { catalogModule, modulePackage };
}

function paramsForSpec(
  ctx: AssistantKitchenControllerContext,
  kitchenCtx: KitchenContext,
  spec: AssistantKitchenModuleSpec
) {
  const { catalogModule, modulePackage } = modulePackageForSpec(ctx, spec);
  const defaults = createDefaultModulePackageParameters(modulePackage) as ModuleParams;
  applyKitchenContextToModuleParams(defaults, kitchenCtx, ctx.catalog, modulePackage);
  const params = normalizeModuleParamsForSource({
    ...defaults,
    ...(spec.parameterOverrides ? clone(spec.parameterOverrides) : {}),
    type: catalogModule.moduleType
  } as ModuleParams);
  const errors = validateModule(params);
  if (errors.length > 0) throw new Error(`Invalid module ${spec.modulePackageId}: ${errors.join("; ")}`);
  const role = getKitchenModuleRole(params as Record<string, unknown>);
  const requestedRole = spec.zone === "upper" ? "upper" : "base";
  if (role !== requestedRole) {
    throw new Error(`Module ${spec.modulePackageId} is a ${role} module, not ${spec.zone}.`);
  }
  return params;
}

function addPlacedInstance(ctx: AssistantKitchenControllerContext, groupId: string, instance: LayoutInstance) {
  instance.kitchenGroupId = groupId;
  instance.root.updateMatrixWorld(true);
  ctx.layoutRoot.add(instance.root);
  ctx.instances.push(instance);
  const group = ctx.S.kitchenGroups.find((item) => item.id === groupId);
  if (group) group.instanceIds = ctx.instances.filter((item) => item.kitchenGroupId === groupId).map((item) => item.id);
}

function makeUniqueGroupId(ctx: AssistantKitchenControllerContext) {
  let id = `kg_ai_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  while (ctx.S.kitchenGroups.some((item) => item.id === id)) id = `kg_ai_${crypto.randomUUID()}`;
  return id;
}

function buildKitchenContext(ctx: AssistantKitchenControllerContext, input: AssistantKitchenCreateInput) {
  validateContextPatch(input.contextPatch);
  const worktopContextPatch: Partial<KitchenContext> = {
    ...(input.worktop?.depthMm != null ? { worktopDepthMm: input.worktop.depthMm } : {}),
    ...(input.worktop?.thicknessMm != null ? { worktopThicknessMm: input.worktop.thicknessMm } : {}),
    ...(input.worktop?.heightMm != null ? { heightMm: input.worktop.heightMm } : {}),
    ...(input.worktop?.overhangSideMm != null ? { worktopOverhangSideMm: input.worktop.overhangSideMm } : {}),
    ...(input.worktop?.materialId ? { worktopMaterialId: input.worktop.materialId } : {})
  };
  const next = resolveContext({
    ...makeDefaultKitchenContext(ctx.catalog),
    ...(input.contextPatch ?? {}),
    ...worktopContextPatch,
    name: input.name.trim()
  });
  const errors = validateContext(next);
  if (errors.length > 0) throw new Error(`Invalid kitchen context: ${errors.join("; ")}`);
  validateContextCatalogReferences(next, ctx.catalog);
  return next;
}

function validateWorktopOverrides(ctx: AssistantKitchenControllerContext, input: AssistantKitchenCreateInput) {
  const worktop = input.worktop;
  if (!worktop) return;
  if (worktop.materialId && !activeMaterial(ctx.catalog, worktop.materialId)) {
    throw new Error(`Worktop material ${worktop.materialId} is not active in the tenant catalog.`);
  }
  if (worktop.segmentDepthsMm && worktop.segmentDepthsMm.length !== input.layout.runsMm.length) {
    throw new Error("worktop.segmentDepthsMm must contain one depth for every run.");
  }
}

function validateModuleSpecs(ctx: AssistantKitchenControllerContext, kitchenCtx: KitchenContext, input: AssistantKitchenCreateInput) {
  for (const [index, spec] of (input.modules ?? []).entries()) {
    paramsForSpec(ctx, kitchenCtx, spec);
    if (spec.runIndex != null && (!Number.isInteger(spec.runIndex) || spec.runIndex < 0 || spec.runIndex >= input.layout.runsMm.length)) {
      throw new Error(`modules[${index}].runIndex is outside the kitchen runs.`);
    }
    if (spec.cornerIndex != null && (!Number.isInteger(spec.cornerIndex) || spec.cornerIndex < 1 || spec.cornerIndex >= input.layout.runsMm.length)) {
      throw new Error(`modules[${index}].cornerIndex is outside the kitchen corners.`);
    }
    if ((spec.cornerIndex == null) === (spec.runIndex == null)) {
      throw new Error(`modules[${index}] requires exactly one of runIndex or cornerIndex.`);
    }
  }
}

export function createAssistantKitchenController(ctx: AssistantKitchenControllerContext) {
  const validateCreate = (input: AssistantKitchenCreateInput) => {
    if (!input.name?.trim()) throw new Error("Kitchen name is required.");
    if (input.source?.kind === "photo" && input.source.scaleConfirmed !== true) {
      throw new Error("A photo can define the layout shape, but exact creation requires confirmed real-world dimensions.");
    }
    const layoutErrors = validateSemanticKitchenLayout(input.layout);
    if (layoutErrors.length > 0) throw new Error(layoutErrors.join(" "));
    const kitchenCtx = buildKitchenContext(ctx, input);
    validateWorktopOverrides(ctx, input);
    validateModuleSpecs(ctx, kitchenCtx, input);
    return {
      valid: true,
      path: buildSemanticKitchenPath(input.layout),
      context: clone(kitchenCtx),
      moduleCount: input.modules?.length ?? 0,
      rules: {
        geometryOwnedBy: "worktop-controller/kitchen-placement-controller",
        exactPhotoScaleRequired: true,
        overlapPolicy: "reject-entire-command",
        coordinateInputRequiredFromAI: false
      }
    };
  };

  const create = (input: AssistantKitchenCreateInput) => {
    const validation = validateCreate(input);
    if (ctx.S.mode !== "layout") throw new Error("Kitchen creation is only available in layout mode.");
    const kitchenCtx = resolveContext(clone(validation.context));
    const groupId = makeUniqueGroupId(ctx);
    const createdInstanceIds: string[] = [];
    let worktop: KitchenWorktopInstance | null = null;
    ctx.S.kitchenGroups.push({ id: groupId, name: input.name.trim(), ctx: clone(kitchenCtx), instanceIds: [] });

    try {
      const worktopInput = input.worktop ?? {};
      worktop = ctx.createKitchenWorktop({
        path: validation.path,
        segmentDepthsMm: worktopInput.segmentDepthsMm ? [...worktopInput.segmentDepthsMm] : undefined,
        justification: worktopInput.justification ?? "back",
        mirrored: worktopInput.mirrored === true,
        depthMm: worktopInput.depthMm ?? kitchenCtx.worktopDepthMm,
        thicknessMm: worktopInput.thicknessMm ?? kitchenCtx.worktopThicknessMm,
        heightMm: worktopInput.heightMm ?? kitchenCtx.heightMm,
        overhangSideMm: worktopInput.overhangSideMm ?? kitchenCtx.worktopOverhangSideMm,
        materialId: worktopInput.materialId ?? kitchenCtx.worktopMaterialId
      }, groupId, { skipHistory: true });

      const cornerSpecs = (input.modules ?? []).filter((spec) => spec.cornerIndex != null);
      const runSpecs = (input.modules ?? []).filter((spec) => spec.cornerIndex == null);

      for (const spec of cornerSpecs) {
        const params = paramsForSpec(ctx, kitchenCtx, spec);
        if (!isKitchenCornerModule(params as Record<string, unknown>, modulePackageForSpec(ctx, spec).modulePackage)) {
          throw new Error(`Module ${spec.modulePackageId} is not a corner module.`);
        }
        const instance = ctx.createInstance(params);
        instance.kitchenGroupId = groupId;
        const info = ctx.getKitchenCornerPlacementInfo(worktop, spec.cornerIndex!, kitchenCtx.worktopBackOffsetMm, instance);
        if (!info?.valid || !ctx.applyKitchenPlacementBinding(instance, info.binding, kitchenCtx.worktopBackOffsetMm)) {
          throw new Error(`Corner module ${spec.modulePackageId} does not fit corner ${spec.cornerIndex}.`);
        }
        addPlacedInstance(ctx, groupId, instance);
        createdInstanceIds.push(instance.id);
      }

      for (const spec of runSpecs) {
        const params = paramsForSpec(ctx, kitchenCtx, spec);
        if (isKitchenCornerModule(params as Record<string, unknown>, modulePackageForSpec(ctx, spec).modulePackage)) {
          throw new Error(`Corner module ${spec.modulePackageId} requires cornerIndex.`);
        }
        const instance = ctx.createInstance(params);
        instance.kitchenGroupId = groupId;
        const role: KitchenModuleEditLayer = spec.zone === "upper" ? "upper" : "base";
        const source = ctx.getKitchenRunDimensionSources(groupId, role)
          .find((run) => run.worktopId === worktop!.id && run.segmentIndex === spec.runIndex) ?? null;
        if (!source) throw new Error(`Kitchen run ${spec.runIndex} is not available for ${spec.zone} modules.`);
        const widthMm = Math.max(1, (instance.localBox.max.x - instance.localBox.min.x) * 1000);
        const placement = placeOnKitchenRun({
          runLengthMm: source.lengthMm,
          reservedStartMm: source.reservedStartMm,
          reservedEndMm: source.reservedEndMm,
          occupants: source.modules,
          request: {
            widthMm,
            anchor: spec.anchor,
            offsetAlongMm: spec.offsetAlongMm,
            gapMm: spec.gapMm
          }
        });
        if (!placement.ok) throw new Error(`Module ${spec.modulePackageId} cannot fit run ${spec.runIndex}: ${placement.reason}.`);
        const binding: KitchenPlacementBinding = {
          kind: "segment",
          worktopId: worktop.id,
          segmentIndex: spec.runIndex!,
          offsetAlongM: placement.centerMm / 1000
        };
        if (!ctx.applyKitchenPlacementBinding(instance, binding, kitchenCtx.worktopBackOffsetMm)) {
          throw new Error(`Placement controller rejected module ${spec.modulePackageId}.`);
        }
        addPlacedInstance(ctx, groupId, instance);
        createdInstanceIds.push(instance.id);
      }

      const summary = getSummary(groupId);
      if (!summary.validation.valid) {
        throw new Error("Created kitchen failed final placement validation.");
      }

      ctx.setSelectedKitchenGroup(groupId);
      ctx.setSelectedModule(createdInstanceIds.at(-1) ?? null);
      ctx.updateLayoutPanel();
      ctx.updateSelectionHighlights();
      ctx.mountProps();
      ctx.commitHistory();
      return {
        groupId,
        worktopId: worktop.id,
        instanceIds: createdInstanceIds,
        shape: input.layout.shape,
        path: validation.path,
        validation: summary.validation
      };
    } catch (error) {
      for (const id of [...createdInstanceIds].reverse()) ctx.deleteInstance(id);
      if (worktop) ctx.removeKitchenWorktop(worktop.id, { skipHistory: true });
      const groupIndex = ctx.S.kitchenGroups.findIndex((item) => item.id === groupId);
      if (groupIndex >= 0) ctx.S.kitchenGroups.splice(groupIndex, 1);
      throw error;
    }
  };

  const getSummary = (groupId: string) => {
    const group = ctx.S.kitchenGroups.find((item) => item.id === groupId) ?? null;
    if (!group) throw new Error(`Kitchen group ${groupId} was not found.`);
    const modules = ctx.instances.filter((item) => item.kitchenGroupId === groupId);
    const byRole = { lower: 0, upper: 0, tall: 0 };
    for (const module of modules) {
      const role = getKitchenModuleRole(module.params as Record<string, unknown>);
      if (role === "base") byRole.lower += 1;
      else byRole[role] += 1;
    }
    const runSources = [
      ...ctx.getKitchenRunDimensionSources(groupId, "base").map((run) => ({ role: "lower" as const, run })),
      ...ctx.getKitchenRunDimensionSources(groupId, "upper").map((run) => ({ role: "upper" as const, run }))
    ];
    const overlaps = runSources.flatMap(({ role, run }) =>
      inspectKitchenRunOverlaps(run.modules).map((overlap) => ({ role, runId: run.id, ...overlap }))
    );
    const unboundModuleIds = modules
      .filter((item) => getKitchenModuleRole(item.params as Record<string, unknown>) !== "tall" && !item.kitchenPlacement)
      .map((item) => item.id);
    return {
      group: { id: group.id, name: group.name },
      counts: { total: modules.length, ...byRole, worktops: ctx.kitchenWorktops.filter((item) => item.kitchenGroupId === groupId).length },
      materials: {
        corpus: group.ctx.corpusMaterialId,
        fronts: group.ctx.frontsMaterialId,
        backs: group.ctx.backMaterialId,
        drawerBottoms: group.ctx.drawerBottomMaterialId,
        worktop: group.ctx.worktopMaterialId
      },
      runs: runSources.map(({ role, run }) => ({
        id: run.id,
        role,
        runIndex: run.segmentIndex,
        lengthMm: run.lengthMm,
        reservedStartMm: run.reservedStartMm,
        reservedEndMm: run.reservedEndMm,
        modules: clone(run.modules)
      })),
      validation: {
        valid: overlaps.every((item) => item.overlapMm <= group.ctx.overlapErrorMm) && unboundModuleIds.length === 0,
        overlapToleranceMm: group.ctx.overlapErrorMm,
        overlaps,
        unboundModuleIds
      }
    };
  };

  const updateParameters = (groupId: string, patch: Partial<KitchenContext>) => {
    const group = ctx.S.kitchenGroups.find((item) => item.id === groupId) ?? null;
    if (!group) throw new Error(`Kitchen group ${groupId} was not found.`);
    validateContextPatch(patch);
    const previous = resolveContext(clone(group.ctx));
    const next = resolveContext({ ...clone(previous), ...clone(patch) });
    const errors = validateContext(next);
    if (errors.length > 0) throw new Error(`Invalid kitchen context: ${errors.join("; ")}`);
    validateContextCatalogReferences(next, ctx.catalog);
    try {
      group.ctx = clone(next);
      if (ctx.S.activeKitchenGroupId === groupId) ctx.S.kitchenCtx = clone(next);
      ctx.rebuildKitchenGroupLayout(groupId, next, previous);
      for (const worktop of ctx.kitchenWorktops.filter((item) => item.kitchenGroupId === groupId)) {
        worktop.params.materialId = next.worktopMaterialId;
        ctx.rebuildKitchenWorktop(worktop);
      }
      const summary = getSummary(groupId);
      if (!summary.validation.valid) throw new Error("Kitchen parameter update would leave invalid placement bindings or overlaps.");
      ctx.mountProps();
      ctx.updateSelectionHighlights();
      ctx.commitHistory();
      return summary;
    } catch (error) {
      group.ctx = clone(previous);
      if (ctx.S.activeKitchenGroupId === groupId) ctx.S.kitchenCtx = clone(previous);
      ctx.rebuildKitchenGroupLayout(groupId, previous, next);
      for (const worktop of ctx.kitchenWorktops.filter((item) => item.kitchenGroupId === groupId)) {
        worktop.params.materialId = previous.worktopMaterialId;
        ctx.rebuildKitchenWorktop(worktop);
      }
      throw error;
    }
  };

  const applyMaterial = (
    groupId: string,
    materialId: string,
    scopes: Array<"corpus" | "fronts" | "backs" | "drawerBottoms" | "worktop">
  ) => {
    if (!activeMaterial(ctx.catalog, materialId)) throw new Error(`Material ${materialId} is not active in the tenant catalog.`);
    if (scopes.length === 0) throw new Error("At least one material scope is required.");
    const patch: Partial<KitchenContext> = {};
    for (const scope of new Set(scopes)) {
      if (scope === "corpus") patch.corpusMaterialId = materialId;
      else if (scope === "fronts") patch.frontsMaterialId = materialId;
      else if (scope === "backs") patch.backMaterialId = materialId;
      else if (scope === "drawerBottoms") patch.drawerBottomMaterialId = materialId;
      else patch.worktopMaterialId = materialId;
    }
    return updateParameters(groupId, patch);
  };

  return { validateCreate, create, getSummary, updateParameters, applyMaterial };
}
