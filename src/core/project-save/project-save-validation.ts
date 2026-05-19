import type { ProjectSaveFile } from "./project-save-types";
import { CURRENT_PROJECT_SAVE_VERSION } from "./project-save-types";
import { assertValidProjectMetadata } from "../project/project-validation";
import { assertNoMissingCriticalProjectSerializers } from "./project-save-serializers";

export type ProjectSaveValidationScope = {
  clientId?: string;
  projectId?: string;
};

function assertPlainSerializable(value: unknown, path = "save"): void {
  const stack = new WeakSet<object>();
  const walk = (next: unknown, key: string) => {
    if (typeof next === "function") throw new Error(`${key} contains a function.`);
    if (typeof Element !== "undefined" && next instanceof Element) throw new Error(`${key} contains a DOM element.`);
    if (!next || typeof next !== "object") return;
    if (stack.has(next)) throw new Error(`${key} contains circular references.`);
    stack.add(next);
    if (Array.isArray(next)) {
      next.forEach((item, index) => walk(item, `${key}[${index}]`));
      stack.delete(next);
      return;
    }
    for (const [childKey, childValue] of Object.entries(next as Record<string, unknown>)) {
      walk(childValue, `${key}.${childKey}`);
    }
    stack.delete(next);
  };
  walk(value, path);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validateProjectSaveFile(save: ProjectSaveFile, scope: ProjectSaveValidationScope = {}): void {
  assertNoMissingCriticalProjectSerializers();
  if (!isObject(save)) throw new Error("Project save must be an object.");
  if (save.format !== "kitchen-app-project") throw new Error("Unsupported project save format.");
  if (save.saveFormatVersion > CURRENT_PROJECT_SAVE_VERSION) throw new Error("Project save version is newer than this app supports.");
  if (save.saveFormatVersion < 1) throw new Error("Project save version is invalid.");
  if (scope.clientId && save.clientId !== scope.clientId) throw new Error("Project save belongs to a different client.");
  if (scope.projectId && save.projectId !== scope.projectId) throw new Error("Project save projectId does not match route.");
  if (save.project.clientId !== save.clientId || save.project.projectId !== save.projectId) throw new Error("Project save metadata does not match save scope.");
  assertValidProjectMetadata(save.project);
  if (!Array.isArray(save.phases) || save.phases.length === 0) throw new Error("Project save must include phases.");
  const phaseIds = new Set<string>();
  for (const phase of save.phases) {
    if (!phase.phaseId) throw new Error("Project phase id is required.");
    if (phaseIds.has(phase.phaseId)) throw new Error("Project phase ids must be unique.");
    phaseIds.add(phase.phaseId);
    if (!Array.isArray(phase.moduleInstances)) throw new Error("Project phase moduleInstances must be an array.");
  }
  if (!phaseIds.has(save.activePhaseId)) throw new Error("activePhaseId must exist in phases.");
  if (!save.catalogSnapshot || !Array.isArray(save.catalogSnapshot.usedMaterialIds)) throw new Error("Project save must include catalogSnapshot.");
  const layout = save.appState?.layout;
  if (!isObject(layout)) throw new Error("Project save must include layout serializer data.");
  if (!("windows" in layout) || !Array.isArray(layout.windows)) throw new Error("Project save must include windows serializer data.");
  if (!("doors" in layout) || !Array.isArray(layout.doors)) throw new Error("Project save must include doors serializer data.");
  assertPlainSerializable(save);
}
