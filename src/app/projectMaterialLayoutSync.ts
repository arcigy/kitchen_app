import type { ClientCatalog } from "../core/catalog/catalog-types";
import {
  resolveEffectiveProjectMaterialAssignment
} from "../core/project-materials/project-material-assignment-resolution";
import type {
  ProjectMaterialAssignmentsState,
  ProjectMaterialScope
} from "../core/project-materials/project-material-types";
import type { KitchenWorktopInstance, LayoutInstance } from "../layout/appState";
import type { CustomFurnitureInstance } from "../layout/customFurnitureTypes";

export type ProjectMaterialLayoutSyncArgs = {
  catalog: ClientCatalog;
  instances: readonly LayoutInstance[];
  worktops: readonly KitchenWorktopInstance[];
  customFurniture: readonly CustomFurnitureInstance[];
  rebuildModule: (instance: LayoutInstance) => boolean;
  rebuildWorktop: (worktop: KitchenWorktopInstance) => void;
  rebuildCustomFurniture: (furniture: CustomFurnitureInstance) => void;
};

type BoardProjection = { materialId: string | null; thicknessMm: number };

function positiveThickness(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function boardProjection(
  assignment: ReturnType<typeof resolveEffectiveProjectMaterialAssignment>["assignment"],
  catalog: ClientCatalog
): BoardProjection | null {
  if (!assignment || assignment.kind !== "material" || !assignment.materialId) return null;
  const material = catalog.materials.find((candidate) => candidate.id === assignment.materialId && candidate.isActive && candidate.materialType === "board");
  const supplierThickness = positiveThickness(assignment.snapshots.material?.definition.metadata?.supplierThicknessMm);
  const thicknessMm = positiveThickness(assignment.thicknessMm)
    ?? (material ? positiveThickness(material.defaultThicknessMm) : supplierThickness);
  if (!thicknessMm) return null;
  // A Supplier Bridge snapshot is not necessarily present in the tenant catalog.
  // Keep the authored colour/material in that case, but still apply its confirmed
  // physical thickness. This prevents a stale old override colour from leaking.
  return { materialId: material?.id ?? null, thicknessMm };
}

function moduleSelections(params: Record<string, unknown>) {
  const existing = params.commercialSelections;
  const selections = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  const materials = selections.boardMaterials;
  const thicknesses = selections.boardThicknesses;
  const boardMaterials = materials && typeof materials === "object" && !Array.isArray(materials)
    ? materials as Record<string, unknown>
    : {};
  const boardThicknesses = thicknesses && typeof thicknesses === "object" && !Array.isArray(thicknesses)
    ? thicknesses as Record<string, unknown>
    : {};
  selections.boardMaterials = boardMaterials;
  selections.boardThicknesses = boardThicknesses;
  params.commercialSelections = selections;
  return { boardMaterials, boardThicknesses };
}

/**
 * Applies the effective (scoped -> general -> authored) board values to domain
 * state. Missing/invalid supplier data never reuses an old override: removing
 * the projection restores the module's authored slot fallback.
 */
export function syncProjectMaterialAssignmentsToLayout(
  args: ProjectMaterialLayoutSyncArgs,
  assignments: ProjectMaterialAssignmentsState,
  scopes: readonly ProjectMaterialScope[]
): { moduleIds: string[]; worktopIds: string[]; customFurnitureIds: string[] } {
  const modules = new Map(args.instances.map((instance) => [instance.id, instance]));
  const worktops = new Map(args.worktops.map((worktop) => [worktop.id, worktop]));
  const furniture = new Map(args.customFurniture.map((item) => [item.id, item]));
  const changedModules = new Set<LayoutInstance>();
  const projectedWorktops = new Map<KitchenWorktopInstance, BoardProjection>();
  const rebuiltWorktops = new Set<KitchenWorktopInstance>();
  const changedFurniture = new Set<CustomFurnitureInstance>();

  for (const scope of scopes) {
    for (const item of scope.items) {
      const target = item.layoutTarget;
      if (!target) continue;
      const effective = resolveEffectiveProjectMaterialAssignment(assignments.assignments, scope.id, item);
      const projection = boardProjection(effective.assignment, args.catalog);

      if (target.kind === "module-board") {
        const instance = modules.get(target.instanceId);
        if (!instance) continue;
        const selections = moduleSelections(instance.params as Record<string, unknown>);
        const previousMaterial = selections.boardMaterials[target.materialSlotId];
        const previousThickness = selections.boardThicknesses[target.materialSlotId];
        if (projection) {
          if (projection.materialId) selections.boardMaterials[target.materialSlotId] = projection.materialId;
          else delete selections.boardMaterials[target.materialSlotId];
          selections.boardThicknesses[target.materialSlotId] = projection.thicknessMm;
        } else {
          delete selections.boardMaterials[target.materialSlotId];
          delete selections.boardThicknesses[target.materialSlotId];
        }
        if (previousMaterial !== selections.boardMaterials[target.materialSlotId] || previousThickness !== selections.boardThicknesses[target.materialSlotId]) {
          changedModules.add(instance);
        }
        continue;
      }

      if (target.kind === "worktop") {
        const worktop = worktops.get(target.worktopId);
        if (!worktop || !projection) continue;
        projectedWorktops.set(worktop, projection);
        continue;
      }

      const itemFurniture = furniture.get(target.furnitureId);
      const board = itemFurniture?.params.boards.find((candidate) => candidate.id === target.boardId);
      if (!itemFurniture || !board || !projection) continue;
      if ((projection.materialId && board.materialId !== projection.materialId) || board.thicknessMm !== projection.thicknessMm) {
        if (projection.materialId) board.materialId = projection.materialId;
        board.thicknessMm = projection.thicknessMm;
        changedFurniture.add(itemFurniture);
      }
    }
  }

  for (const instance of changedModules) args.rebuildModule(instance);
  // A corpus/front module rebuild may reconstruct its kitchen worktop from the
  // kitchen context. Reapply every active project-level worktop assignment
  // afterwards, even when that assignment did not itself change in this update.
  // Otherwise a later Corpus bridge confirmation can erase an already confirmed
  // Worktop colour/thickness.
  const moduleRebuildMayHaveResetWorktops = changedModules.size > 0;
  for (const [worktop, projection] of projectedWorktops) {
    const worktopChanged = (projection.materialId && worktop.params.materialId !== projection.materialId)
      || worktop.params.thicknessMm !== projection.thicknessMm;
    if (!moduleRebuildMayHaveResetWorktops && !worktopChanged) continue;
    if (projection.materialId) worktop.params.materialId = projection.materialId;
    worktop.params.thicknessMm = projection.thicknessMm;
    args.rebuildWorktop(worktop);
    rebuiltWorktops.add(worktop);
  }
  for (const item of changedFurniture) args.rebuildCustomFurniture(item);
  return {
    moduleIds: [...changedModules].map((instance) => instance.id),
    worktopIds: [...rebuiltWorktops].map((worktop) => worktop.id),
    customFurnitureIds: [...changedFurniture].map((item) => item.id)
  };
}
