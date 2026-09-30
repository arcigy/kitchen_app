import type { AppState } from "../layout/appState";
import type { ProjectMaterialAssignmentsState } from "../core/project-materials/project-material-types";
const publishers = new WeakMap<AppState, (state: ProjectMaterialAssignmentsState) => void>();
/** Connects transactional edge edits to the same material runtime/save state as Materials. */
export function connectProjectEdgeMaterials(state: AppState, publish: (next: ProjectMaterialAssignmentsState) => void) { publishers.set(state, publish); }
export function publishProjectEdgeMaterials(state: AppState) {
  if (state.projectMaterialAssignments) publishers.get(state)?.(structuredClone(state.projectMaterialAssignments));
}
