import { getMaterialAssignmentCategoryDefinition, isComponentAllowedForCategory, isMaterialAllowedForCategory } from "./project-material-business";
import { resolveEffectiveProjectMaterialAssignment } from "./project-material-assignment-resolution";
import { validateProjectMaterialAssignmentsState } from "./project-material-validation";
import type { ProjectMaterialAssignment, ProjectMaterialAssignmentsState, ProjectMaterialsView, MaterialAssignmentCategory } from "./project-material-types";

export type MaterialEditTarget =
  | { kind: "assignment"; assignmentId: string }
  | { kind: "scope"; scopeId: string; itemId: string; category: MaterialAssignmentCategory };

export type MaterialAssignmentChange = {
  assignmentId: string;
  before: ProjectMaterialAssignment | null;
  after: ProjectMaterialAssignment | null;
};

export type MaterialEditOperation = { type: "edit_assignments"; changes: MaterialAssignmentChange[] };

export function resolveMaterialEditTarget(view: ProjectMaterialsView, target: MaterialEditTarget) {
  if (target.kind === "assignment") {
    const assignment = view.assignments.assignments.find(item => item.assignmentId === target.assignmentId);
    if (!assignment) throw new Error("Vybraná položka už neexistuje.");
    return { assignmentId: assignment.assignmentId, assignment, template: assignment };
  }
  const item = view.scopes?.find(scope => scope.id === target.scopeId)?.items.find(item => item.id === target.itemId && item.category === target.category);
  if (!item) throw new Error("Vybraná položka už neexistuje.");
  const effective = resolveEffectiveProjectMaterialAssignment(view.assignments.assignments, target.scopeId, item);
  const assignment = view.assignments.assignments.find(item => item.assignmentId === effective.assignmentId) ?? null;
  const template: ProjectMaterialAssignment = assignment ?? {
    assignmentId: effective.assignmentId, category: item.category,
    kind: getMaterialAssignmentCategoryDefinition(item.category).kind,
    ...(item.variantKey ? { variantKey: item.variantKey } : {}),
    customValues: {}, snapshots: {}, source: "user", updatedAt: view.assignments.updatedAt ?? new Date().toISOString()
  };
  return { assignmentId: effective.assignmentId, assignment: effective.assignment, template };
}

export function copyMaterialToTarget(source: ProjectMaterialAssignment, target: ProjectMaterialAssignment, now: string): ProjectMaterialAssignment {
  const definition = source.kind === "material" ? source.snapshots.material?.definition : source.snapshots.component?.definition;
  const compatible = definition?.isActive && (definition.entityType === "material"
    ? isMaterialAllowedForCategory(definition, target.category, true)
    : isComponentAllowedForCategory(definition, target.category));
  if (!compatible) throw new Error("Tieto dve kategórie nie sú kompatibilné. Materiál nie je možné vložiť.");
  const copied = structuredClone(source);
  const result: ProjectMaterialAssignment = {
    ...structuredClone(target), kind: copied.kind,
    materialId: copied.materialId, componentId: copied.componentId,
    edgeFrontId: copied.edgeFrontId, edgeOtherId: copied.edgeOtherId,
    thicknessMm: copied.thicknessMm, snapshots: copied.snapshots,
    customValues: { ...target.customValues }, source: "user", updatedAt: now
  };
  // Product provenance travels with the product. Demand, edge-group identity and
  // per-cabinet quantities belong to the destination.
  delete result.customValues.supplierBridge;
  if (copied.customValues.supplierBridge) result.customValues.supplierBridge = copied.customValues.supplierBridge;
  delete result.projectValues;
  if (copied.projectValues) {
    const { quantity: _quantity, excludeFromConstructionLabor: _exclude, ...priceValues } = copied.projectValues;
    result.projectValues = { ...priceValues };
  }
  if (target.projectValues?.quantity !== undefined) {
    result.projectValues = { ...result.projectValues, quantity: target.projectValues.quantity };
  }
  if (target.projectValues?.excludeFromConstructionLabor !== undefined) result.projectValues = { ...result.projectValues, excludeFromConstructionLabor: target.projectValues.excludeFromConstructionLabor };
  return result;
}

export function clearMaterialAssignment(target: ProjectMaterialAssignment, now: string): ProjectMaterialAssignment {
  const cleared = structuredClone(target);
  delete cleared.materialId; delete cleared.componentId; delete cleared.edgeFrontId; delete cleared.edgeOtherId;
  delete cleared.thicknessMm; delete cleared.projectValues;
  if (target.projectValues?.quantity !== undefined || target.projectValues?.excludeFromConstructionLabor !== undefined) {
    const { quantity, unit, excludeFromConstructionLabor } = target.projectValues;
    cleared.projectValues = { ...(quantity !== undefined ? { quantity } : {}), ...(unit ? { unit } : {}), ...(excludeFromConstructionLabor !== undefined ? { excludeFromConstructionLabor } : {}) };
  }
  delete cleared.customValues.supplierBridge;
  cleared.snapshots = {}; cleared.source = "user"; cleared.updatedAt = now;
  return cleared;
}

export function applyMaterialAssignmentChanges(current: ProjectMaterialAssignmentsState, changes: readonly MaterialAssignmentChange[], revision: number, now: string): ProjectMaterialAssignmentsState {
  if (current.revision !== revision) throw new Error("Materiály sa zmenili v inej relácii. Obnovte Materiály a skúste znova.");
  const assignments = structuredClone(current.assignments);
  const seen = new Set<string>();
  for (const change of changes) {
    if (seen.has(change.assignmentId)) throw new Error("Položka sa v zmene opakuje.");
    seen.add(change.assignmentId);
    const index = assignments.findIndex(item => item.assignmentId === change.assignmentId);
    if (JSON.stringify(assignments[index] ?? null) !== JSON.stringify(change.before)) throw new Error("Vybraná položka sa medzičasom zmenila. Obnovte Materiály a skúste znova.");
    if (change.after) {
      if (change.after.assignmentId !== change.assignmentId) throw new Error("Neplatný cieľ priradenia.");
      const category = getMaterialAssignmentCategoryDefinition(change.after.category);
      if (category.kind !== change.after.kind || (change.before && change.before.category !== change.after.category)) throw new Error("Neplatná kategória priradenia.");
      if (change.after.materialId || change.after.componentId) copyMaterialToTarget(change.after, change.after, now);
    }
    if (index >= 0) assignments.splice(index, 1);
    if (change.after) assignments.push(structuredClone(change.after));
  }
  const state = { ...current, initialized: true, revision: current.revision + 1, assignments, updatedAt: now };
  validateProjectMaterialAssignmentsState(state);
  return state;
}

export function parseMaterialEditOperation(value: unknown): MaterialEditOperation {
  if (!value || typeof value !== "object" || !("type" in value) || value.type !== "edit_assignments" || !("changes" in value) || !Array.isArray(value.changes) || value.changes.length !== 1) throw new Error("Neplatná zmena materiálu.");
  const changes = value.changes.map((change: unknown): MaterialAssignmentChange => {
    if (!change || typeof change !== "object" || !("assignmentId" in change) || typeof change.assignmentId !== "string" || !("before" in change) || !("after" in change)) throw new Error("Neplatná zmena materiálu.");
    const parse = (assignment: unknown): ProjectMaterialAssignment | null => {
      if (assignment === null) return null;
      const state = { schemaVersion: 2, initialized: true, revision: 0, assignments: [assignment] };
      validateProjectMaterialAssignmentsState(state);
      return state.assignments[0]!;
    };
    return { assignmentId: change.assignmentId, before: parse(change.before), after: parse(change.after) };
  });
  return { type: "edit_assignments", changes };
}
