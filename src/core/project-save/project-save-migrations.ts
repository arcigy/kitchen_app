import type { ProjectSaveFile } from "./project-save-types";
import { CURRENT_PROJECT_SAVE_VERSION } from "./project-save-types";

export function migrateProjectSaveFile(save: ProjectSaveFile): ProjectSaveFile {
  if (save.saveFormatVersion === CURRENT_PROJECT_SAVE_VERSION) return save;
  if (save.saveFormatVersion > CURRENT_PROJECT_SAVE_VERSION) {
    throw new Error("Project save version is newer than this app supports.");
  }
  throw new Error(`No migration exists for project save version ${save.saveFormatVersion}.`);
}
