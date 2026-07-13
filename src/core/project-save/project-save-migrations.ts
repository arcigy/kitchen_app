import type { ProjectSaveFile } from "./project-save-types";
import { CURRENT_PROJECT_SAVE_VERSION } from "./project-save-types";
import { createEmptyProjectMaterialAssignmentsState } from "../project-materials/project-material-types";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
  if (version === CURRENT_PROJECT_SAVE_VERSION) return value as ProjectSaveFile;
  if ((version as number) > CURRENT_PROJECT_SAVE_VERSION) {
    throw new Error("Project save version is newer than this app supports.");
  }
  if (version === 1) return migrateV1ToV2(value);
  throw new Error(`No migration exists for project save version ${String(version)}.`);
}
