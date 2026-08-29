import { isDeepStrictEqual } from "node:util";
import { ProjectMaterialAssignmentAuthorityError } from "./project-material-errors";
import type { ProjectMaterialAssignmentsState } from "./project-material-types";
import type { ProjectWriteConsistencyOptions } from "../project/project-write-consistency";
import type { ProjectSnapshotMarginSettingsMode } from "../project-margins/project-margin-save-authority";

export type ProjectSnapshotMaterialAssignmentsMode = "preserve" | "initialize" | "restore-version";

export type ProjectSnapshotSaveOptions = ProjectWriteConsistencyOptions & {
  materialAssignmentsMode?: ProjectSnapshotMaterialAssignmentsMode;
  marginSettingsMode?: ProjectSnapshotMarginSettingsMode;
};

export function assertFullSaveMaterialAssignmentsAllowed(
  stored: ProjectMaterialAssignmentsState,
  incoming: ProjectMaterialAssignmentsState,
  mode: ProjectSnapshotMaterialAssignmentsMode = "preserve"
): void {
  if (mode === "restore-version") return;

  if (mode === "initialize") {
    const isControlledInitialization =
      !stored.initialized &&
      stored.revision === 0 &&
      incoming.initialized &&
      incoming.revision === 0;
    if (isControlledInitialization) return;
  } else if (isDeepStrictEqual(stored, incoming)) {
    return;
  }

  throw new ProjectMaterialAssignmentAuthorityError(incoming.revision, stored.revision);
}
