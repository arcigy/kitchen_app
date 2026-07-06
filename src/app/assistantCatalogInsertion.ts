import { Group } from "three";
import type { AppState, KitchenWorktopInstance, LayoutInstance } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";

type AssistantCatalogInsertionContext = {
  S: AppState;
  layoutRoot: Group;
  instances: LayoutInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  createInstance: (params: ModuleParams) => LayoutInstance;
  inferKitchenPlacementBinding: (inst: LayoutInstance, groupId: string, backOffsetMm: number) => LayoutInstance["kitchenPlacement"];
  applyKitchenPlacementBinding: (
    inst: LayoutInstance,
    binding: NonNullable<LayoutInstance["kitchenPlacement"]>,
    backOffsetMm: number
  ) => boolean;
  getSelectedKitchenGroupId: () => string | null;
  setSelectedKitchenGroup: (id: string | null) => void;
  setSelectedModule: (id: string | null) => void;
  updateLayoutPanel: () => void;
  updateSelectionHighlights: () => void;
  mountProps: () => void;
  commitHistory: () => void;
};

function readWidthMm(params: ModuleParams): number {
  const record = params as Record<string, unknown>;
  const width = record.widthMm ?? record.width;
  return typeof width === "number" && Number.isFinite(width) && width > 0 ? Math.round(width) : 600;
}

function fallbackAppendPosition(groupInstances: LayoutInstance[], widthMm: number) {
  if (groupInstances.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  let maxX = Number.NEGATIVE_INFINITY;
  let anchorZ = 0;
  for (const inst of groupInstances) {
    const halfWidthM = readWidthMm(inst.params) / 2000;
    const rightEdge = inst.root.position.x + halfWidthM;
    if (rightEdge > maxX) {
      maxX = rightEdge;
      anchorZ = inst.root.position.z;
    }
  }
  return {
    x: maxX + widthMm / 2000 + 0.04,
    y: 0,
    z: anchorZ
  };
}

export function insertAssistantCatalogModule(
  ctx: AssistantCatalogInsertionContext,
  params: ModuleParams,
  requestedGroupId?: string | null
): LayoutInstance {
  const groupId = requestedGroupId ?? ctx.S.activeKitchenGroupId ?? ctx.getSelectedKitchenGroupId() ?? null;
  if (!groupId) throw new Error("Najprv otvor alebo označ cieľovú kuchyňu.");
  const group = ctx.S.kitchenGroups.find((item) => item.id === groupId) ?? null;
  if (!group) throw new Error("Vybraná kuchynská skupina neexistuje.");

  const inst = ctx.createInstance(structuredClone(params));
  inst.kitchenGroupId = groupId;

  const backOffsetMm = group.ctx.worktopBackOffsetMm;
  const binding = ctx.inferKitchenPlacementBinding(inst, groupId, backOffsetMm);
  let placed = false;
  if (binding) {
    inst.kitchenPlacement = binding;
    placed = ctx.applyKitchenPlacementBinding(inst, binding, backOffsetMm);
  }
  if (!placed) {
    inst.kitchenPlacement = null;
    const next = fallbackAppendPosition(
      ctx.instances.filter((item) => item.kitchenGroupId === groupId),
      readWidthMm(inst.params)
    );
    inst.root.position.set(next.x, next.y, next.z);
  }

  inst.root.updateMatrixWorld(true);
  ctx.layoutRoot.add(inst.root);
  ctx.instances.push(inst);
  group.instanceIds = ctx.instances.filter((item) => item.kitchenGroupId === groupId).map((item) => item.id);
  ctx.setSelectedKitchenGroup(groupId);
  ctx.setSelectedModule(inst.id);
  ctx.updateLayoutPanel();
  ctx.updateSelectionHighlights();
  ctx.mountProps();
  ctx.commitHistory();
  return inst;
}
