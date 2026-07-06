import * as THREE from "three";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ProjectActions } from "./project/projectActions";
import { commitHistory } from "../layout/historyManager";
import type { AppState, KitchenWorktopInstance, LayoutInstance, WallInstance } from "../layout/appState";
import { normalizeModuleParamsForSource, validateModule, type ModuleParams } from "../model/cabinetTypes";
import type {
  AssistantClientContext,
  AssistantToolCall,
  AssistantToolDefinition,
  AssistantToolResult
} from "../assistant/types";
import { ASSISTANT_TOOL_DEFINITIONS, getAssistantToolDefinition } from "../assistant/toolRegistry";
import { insertAssistantCatalogModule } from "./assistantCatalogInsertion";

type AssistantBridgeContext = {
  S: AppState;
  catalog: ClientCatalog;
  instances: LayoutInstance[];
  walls: WallInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  projectActions: ProjectActions;
  layoutRoot: THREE.Group;
  createInstance: (params: ModuleParams) => LayoutInstance;
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
  setSelectedModule: (id: string | null) => void;
  commitHistory: () => void;
  getActiveViewerTab: () => string;
  getLayoutTool: () => AppState["layoutTool"];
  getViewMode: () => AppState["viewMode"];
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
  for (const id of ids) {
    const inst = ctx.findInstance(id);
    if (!inst) throw new Error(`Module ${id} not found.`);
    const previousParams = cloneJson(inst.params);
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
    if (!ok) {
      inst.params = previousParams;
      ctx.rebuildInstance(inst, { previousParams: nextParams, preserveBackAnchor: true });
      throw new Error(`Rebuild failed for module ${id}.`);
    }
    changed.push(id);
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

async function executeToolCall(ctx: AssistantBridgeContext, call: AssistantToolCall): Promise<AssistantToolResult> {
  try {
    const definition = assertToolAllowed(call.toolId);
    if (definition.id === "context.getSelection") {
      return { ok: true, toolId: call.toolId, output: buildContextSnapshot(ctx), stateDeltaSummary: "Read live editor context." };
    }
    if (definition.id === "module.patchSelectedParams") {
      return await executePatchSelectedParams(ctx, call.input);
    }
    if (definition.id === "vendorCatalog.insertResolvedModule") {
      const initialParams = call.input.initialParams;
      if (!initialParams || typeof initialParams !== "object" || Array.isArray(initialParams)) {
        throw new Error("initialParams are required.");
      }
      const inst = insertAssistantCatalogModule(ctx, initialParams as ModuleParams, typeof call.input.groupId === "string" ? call.input.groupId : null);
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
    throw new Error(`Assistant tool ${call.toolId} has no executor.`);
  } catch (error) {
    return {
      ok: false,
      toolId: call.toolId,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function installAssistantBridge(ctx: AssistantBridgeContext): ArcigyAssistantBridge {
  const bridge: ArcigyAssistantBridge = {
    getContextSnapshot: () => buildContextSnapshot(ctx),
    getToolDefinitions: () => ASSISTANT_TOOL_DEFINITIONS.map((tool) => ({ ...tool })),
    executeToolCall: (call) => executeToolCall(ctx, call)
  };
  window.__arcigyAssistant = bridge;
  return bridge;
}
