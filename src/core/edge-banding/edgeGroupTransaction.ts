import { createEmptyProjectMaterialAssignmentsState } from "../project-materials/project-material-types";
import type { ProjectMaterialAssignment, ProjectMaterialAssignmentsState } from "../project-materials/project-material-types";
import { ProjectMaterialRevisionConflictError } from "../project-materials/project-material-errors";
import { validateProjectMaterialAssignmentsState } from "../project-materials/project-material-validation";
import { edgeGroups } from "./edgeGroups";
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>`${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
export type EdgeGroupChange = { before: ProjectMaterialAssignment | null; after: ProjectMaterialAssignment | null };
export function edgeGroupChangesBetween(before: ProjectMaterialAssignmentsState, after: ProjectMaterialAssignmentsState): EdgeGroupChange[] {
  const previous = new Map(edgeGroups(before).map(g => [g.assignmentId, g]));
  const current = new Map(edgeGroups(after).map(g => [g.assignmentId, g]));
  return [...new Set([...previous.keys(), ...current.keys()])].flatMap(id => {
    const a = previous.get(id) ?? null, b = current.get(id) ?? null;
    return canonical(a) === canonical(b) ? [] : [{ before: a, after: b }];
  });
}
export function parseEdgeGroupChanges(value: unknown): EdgeGroupChange[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error("Invalid edge group changes.");
  const ids = new Set<string>();
  return value.map(change => {
    if (!change || typeof change !== "object") throw new Error("Invalid edge group change.");
    const groups = [change.before, change.after].filter(g => g !== null);
    for (const group of groups) {
      const state = {...createEmptyProjectMaterialAssignmentsState(), initialized: true, assignments: [group]};
      validateProjectMaterialAssignmentsState(state);
      if (edgeGroups(state).length !== 1 || group.kind !== "material" || (group.snapshots.material && (group.snapshots.material.definition.materialType !== "edge" || group.snapshots.material.definition.pricingUnit !== "lm"))) throw new Error("Only edge groups may change with edge bindings.");
    }
    const id = change.after?.assignmentId ?? change.before?.assignmentId;
    if (!id || ids.has(id) || (change.before && change.after && change.before.assignmentId !== change.after.assignmentId)) throw new Error("Invalid edge group identity.");
    ids.add(id);
    return {before: change.before, after: change.after};
  });
}
/** Changes carry their original group, so unrelated concurrent material edits
 * survive. Layout and groups are persisted in the same repository transaction. */
export function applyEdgeGroupChanges(current: ProjectMaterialAssignmentsState, changes: readonly EdgeGroupChange[]): ProjectMaterialAssignmentsState {
  const next = structuredClone(current);
  let changed = false;
  for (const change of changes) {
    const id = change.after?.assignmentId ?? change.before!.assignmentId;
    const index = next.assignments.findIndex(a => a.assignmentId === id);
    const existing = index < 0 ? null : next.assignments[index];
    if (canonical(existing) === canonical(change.after)) continue;
    if (canonical(existing) !== canonical(change.before)) {
      const error = new ProjectMaterialRevisionConflictError(current.revision, current.revision);
      error.message = "Skupina olepenia sa medzitým zmenila. Obnovte projekt pred uložením.";
      throw error;
    }
    if (change.after === null) next.assignments.splice(index, 1);
    else if (index < 0) next.assignments.push(structuredClone(change.after));
    else next.assignments[index] = structuredClone(change.after);
    changed = true;
  }
  if (changed) { next.revision++; next.updatedAt = new Date().toISOString(); }
  return next;
}
export function mergeEdgeGroupChanges(current: ProjectMaterialAssignmentsState | undefined, baseline: ProjectMaterialAssignmentsState, candidate: ProjectMaterialAssignmentsState): ProjectMaterialAssignmentsState {
  return applyEdgeGroupChanges(current?.initialized ? current : baseline, edgeGroupChangesBetween(baseline, candidate));
}
