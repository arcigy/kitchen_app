import type { ProjectSaveFile } from "../project-save/project-save-types";
import type { ProjectMarginSettingsState } from "./project-margin-types";
import { validateProjectMarginSettingsState } from "./project-margin-validation";

export type PatchProjectMarginSettingsInput = {
  save: ProjectSaveFile;
  phaseId: string;
  nextState: ProjectMarginSettingsState;
  updatedByUserId: string;
  updatedAt?: string;
};

export function patchProjectSaveMarginSettings(input: PatchProjectMarginSettingsInput): ProjectSaveFile {
  validateProjectMarginSettingsState(input.nextState, "next project margin settings");
  if (input.save.activePhaseId !== input.phaseId) {
    throw new Error("Project margin settings can only patch the active project phase.");
  }
  const phaseIndex = input.save.phases.findIndex((phase) => phase.phaseId === input.phaseId);
  if (phaseIndex < 0) throw new Error("Project margin settings phase does not exist in the save.");

  const updatedAt = input.updatedAt ?? input.nextState.updatedAt ?? new Date().toISOString();
  const next = structuredClone(input.save);
  const nextState = structuredClone(input.nextState);
  nextState.updatedAt = updatedAt;
  next.appState.quoteSettings = structuredClone(nextState);
  next.phases[phaseIndex] = {
    ...next.phases[phaseIndex],
    quoteSettings: structuredClone(nextState),
    updatedAt
  };
  next.project = {
    ...next.project,
    updatedAt,
    updatedByUserId: input.updatedByUserId
  };
  const { lastWrite: _lastWrite, ...integrity } = next.integrity;
  next.integrity = {
    ...integrity,
    updatedAt,
    savedAt: updatedAt
  };
  return next;
}
