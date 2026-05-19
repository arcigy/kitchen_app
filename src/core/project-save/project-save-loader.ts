import type { ProjectSaveFile } from "./project-save-types";
import { migrateProjectSaveFile } from "./project-save-migrations";
import { validateProjectSaveFile, type ProjectSaveValidationScope } from "./project-save-validation";

export function loadProjectSaveFile(value: ProjectSaveFile, scope: ProjectSaveValidationScope = {}): ProjectSaveFile {
  const migrated = migrateProjectSaveFile(value);
  validateProjectSaveFile(migrated, scope);
  return migrated;
}
