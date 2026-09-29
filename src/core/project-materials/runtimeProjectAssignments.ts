import type { ClientCatalog } from "../catalog/catalog-types";
import type { ProjectMaterialAssignment, ProjectMaterialAssignmentsState } from "./project-material-types";

const runtimeAssignments = new WeakMap<ClientCatalog, readonly ProjectMaterialAssignment[]>();

/** Project snapshots belong to an assignment, not to a mutable catalogue price. */
export function setRuntimeProjectAssignments(catalog: ClientCatalog, state: ProjectMaterialAssignmentsState): void {
  runtimeAssignments.set(catalog, structuredClone(state.assignments));
}

export function getRuntimeProjectAssignments(catalog: ClientCatalog): readonly ProjectMaterialAssignment[] {
  return runtimeAssignments.get(catalog) ?? [];
}
