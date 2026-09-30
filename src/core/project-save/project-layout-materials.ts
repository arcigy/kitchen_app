import type { ProjectMaterialAssignmentsState } from "../project-materials/project-material-types";
import type { ProjectSaveFile } from "./project-save-types";
function record(value: unknown): value is Record<string,unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
/** A layout history snapshot must not overwrite the canonical project materials
 * while restoring a saved project. History itself keeps its own past snapshots. */
export function synchronizeLayoutMaterials(layout: unknown, materials: ProjectMaterialAssignmentsState): unknown {
  if (!record(layout) || !record(layout.snapshot) || !Object.hasOwn(layout.snapshot,"materialAssignments")) return layout;
  return {...layout,snapshot:{...layout.snapshot,materialAssignments:structuredClone(materials)}};
}
export function synchronizeAppStateMaterials(state: ProjectSaveFile["appState"]): ProjectSaveFile["appState"] {
  return {...state,layout:synchronizeLayoutMaterials(state.layout,state.materialAssignments)};
}
