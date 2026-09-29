import type { ProjectMaterialAssignmentsState } from "../../core/project-materials/project-material-types";
import { edgeGroupChangesBetween } from "../../core/edge-banding/edgeGroupTransaction";
import { createEmptyProjectMaterialAssignmentsState } from "../../core/project-materials/project-material-types";
// Only server acknowledgements advance this baseline. Local undo/redo changes
// the candidate, making the inverse group edit part of the next atomic save.
const confirmed = new Map<string, ProjectMaterialAssignmentsState>();
export function confirmProjectEdgeGroups(projectId: string, state: ProjectMaterialAssignmentsState): void {
  confirmed.set(projectId, structuredClone(state));
}
export function pendingProjectEdgeGroups(projectId: string, candidate: ProjectMaterialAssignmentsState) {
  const baseline = confirmed.get(projectId);
  if (baseline) return edgeGroupChangesBetween(baseline, candidate);
  // A new project's default categories are initialized by the server. Explicit
  // user groups/choices must be retained even before its first save.
  return edgeGroupChangesBetween(createEmptyProjectMaterialAssignmentsState(), {...candidate, assignments: candidate.assignments.filter(g => g.source === "user")});
}

export function confirmedProjectEdgeGroups(projectId:string) { const value=confirmed.get(projectId);return value?structuredClone(value):undefined; }
