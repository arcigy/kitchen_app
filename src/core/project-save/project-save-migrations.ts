import type { ProjectSaveFile } from "./project-save-types";
import { CURRENT_PROJECT_SAVE_VERSION } from "./project-save-types";
import { createEmptyProjectMaterialAssignmentsState } from "../project-materials/project-material-types";
import { PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION } from "../project-materials/project-material-types";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function migrateMaterialAssignments(value: unknown): unknown {
  if (!isObject(value)) return createEmptyProjectMaterialAssignmentsState();
  if (value.schemaVersion === PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION) return value;
  if (value.schemaVersion !== 1) return value;
  const assignments = Array.isArray(value.assignments)
    ? value.assignments.filter((assignment) => !isObject(assignment) || assignment.category !== "runner")
    : [];
  return { ...value, schemaVersion: PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION, assignments };
}

function migrateMaterialAssignmentsInSave(save: ProjectSaveFile): ProjectSaveFile {
  const appState: Record<string, unknown> = isObject(save.appState) ? save.appState : {};
  const materialAssignments = migrateMaterialAssignments(appState.materialAssignments);
  return {
    ...save,
    appState: { ...appState, materialAssignments },
    phases: save.phases.map((phase) => ({
      ...phase,
      materialAssignments: migrateMaterialAssignments(phase.materialAssignments ?? materialAssignments)
    }))
  } as ProjectSaveFile;
}

function migrateV1ToV2(save: Record<string, unknown>): ProjectSaveFile {
  const appState = isObject(save.appState) ? save.appState : {};
  const appMaterialAssignments = isObject(appState.materialAssignments)
    ? appState.materialAssignments
    : createEmptyProjectMaterialAssignmentsState();
  const phases = Array.isArray(save.phases)
    ? save.phases.map((phase) => {
      if (!isObject(phase)) return phase;
      return {
        ...phase,
        materialAssignments: isObject(phase.materialAssignments)
          ? phase.materialAssignments
          : structuredClone(appMaterialAssignments)
      };
    })
    : save.phases;

  return {
    ...save,
    saveFormatVersion: 2,
    phases,
    appState: {
      ...appState,
      materialAssignments: appMaterialAssignments
    }
  } as ProjectSaveFile;
}

export function migrateProjectSaveFile(value: unknown): ProjectSaveFile {
  if (!isObject(value)) throw new Error("Project save must be an object.");
  const version = value.saveFormatVersion;
  if (!Number.isInteger(version)) throw new Error("Project save version is invalid.");
  if (version === CURRENT_PROJECT_SAVE_VERSION) return migrateMaterialAssignmentsInSave(value as ProjectSaveFile);
  if ((version as number) > CURRENT_PROJECT_SAVE_VERSION) {
    throw new Error("Project save version is newer than this app supports.");
  }
  if (version === 1) return migrateMaterialAssignmentsInSave(migrateV1ToV2(value));
  throw new Error(`No migration exists for project save version ${String(version)}.`);
}
