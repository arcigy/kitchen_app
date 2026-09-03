import type { ClientCatalog } from "../core/catalog/catalog-types";
import { generalProjectMaterialAssignment } from "../core/project-materials/project-material-assignment-resolution";
import type {
  MaterialAssignmentCategory,
  ProjectMaterialAssignmentsState
} from "../core/project-materials/project-material-types";
import type { KitchenGroup } from "../layout/appState";
import { resolveContext, type KitchenContext } from "../layout/kitchenContext";

type ContextMaterialCategory = Extract<
  MaterialAssignmentCategory,
  "corpus" | "front" | "back" | "drawer_bottom" | "worktop"
>;

const contextFieldByCategory: Record<ContextMaterialCategory, keyof Pick<
  KitchenContext,
  "corpusMaterialId" | "frontsMaterialId" | "backMaterialId" | "drawerBottomMaterialId" | "worktopMaterialId"
>> = {
  corpus: "corpusMaterialId",
  front: "frontsMaterialId",
  back: "backMaterialId",
  drawer_bottom: "drawerBottomMaterialId",
  worktop: "worktopMaterialId"
};

const contextMaterialCategories = Object.keys(contextFieldByCategory) as ContextMaterialCategory[];

function positiveThickness(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function syncContext(
  context: KitchenContext,
  catalog: ClientCatalog,
  assignments: ProjectMaterialAssignmentsState
): boolean {
  const next = { ...context };
  let changed = false;

  for (const category of contextMaterialCategories) {
    const assignment = generalProjectMaterialAssignment(assignments.assignments, category);
    if (!assignment || assignment.kind !== "material" || !assignment.materialId) continue;
    const material = catalog.materials.find((candidate) =>
      candidate.id === assignment.materialId && candidate.isActive && candidate.materialType === "board"
    );
    if (!material) continue;

    const field = contextFieldByCategory[category];
    if (next[field] !== material.id) {
      next[field] = material.id;
      changed = true;
    }
    if (category === "worktop") {
      const thicknessMm = positiveThickness(assignment.thicknessMm) ?? positiveThickness(material.defaultThicknessMm);
      if (thicknessMm && next.worktopThicknessMm !== thicknessMm) {
        next.worktopThicknessMm = thicknessMm;
        changed = true;
      }
    }
  }

  if (!changed) return false;
  Object.assign(context, resolveContext(next));
  return true;
}

/**
 * General board assignments are kitchen-wide defaults. Rebuilds resolve their
 * final geometry from KitchenContext, so this must run before rebuilding any
 * kitchen module. Scoped module assignments remain handled by the layout sync.
 */
export function syncProjectMaterialAssignmentsToKitchenContexts(args: {
  catalog: ClientCatalog;
  assignments: ProjectMaterialAssignmentsState;
  kitchenContext: KitchenContext;
  kitchenGroups: readonly KitchenGroup[];
}): { changed: boolean } {
  const contexts = new Set<KitchenContext>([
    args.kitchenContext,
    ...args.kitchenGroups.map((group) => group.ctx)
  ]);
  let changed = false;
  for (const context of contexts) {
    changed = syncContext(context, args.catalog, args.assignments) || changed;
  }
  return { changed };
}
