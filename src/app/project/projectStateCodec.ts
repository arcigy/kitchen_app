import { validateProjectAppState } from "../../core/project-save/project-app-state-validation";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import type { ProjectInteractionCheckpoint } from "./projectRecoveryTypes";

export type RecoveryContributor<T> = {
  capture(): T;
  validate(value: unknown): value is T;
  restore(value: T): void | Promise<void>;
  clear(): void;
};

export type ProjectRecoveryCapture = {
  appState: ProjectSaveFile["appState"];
  interaction: ProjectInteractionCheckpoint | null;
  historyTail: unknown[];
};

export type ProjectStateCodec = {
  captureServer(): ProjectSaveFile["appState"];
  captureRecovery(): ProjectRecoveryCapture;
  restoreServer(appState: ProjectSaveFile["appState"]): Promise<void>;
  restoreRecovery(capture: ProjectRecoveryCapture): Promise<void>;
  clearInteraction(): void;
};

export function createProjectStateCodec(args: {
  captureAppState(options: { commitDraft: boolean; syncActivity: boolean; includePreview: boolean }): ProjectSaveFile["appState"];
  restoreAppState(appState: ProjectSaveFile["appState"], options: { recovery: boolean; historyTail: unknown[]; notice?: string | null }): void | Promise<void>;
  interaction: RecoveryContributor<ProjectInteractionCheckpoint | null>;
  captureHistoryTail(): unknown[];
  prepareAppStateForRestore?: (appState: ProjectSaveFile["appState"]) => { appState: ProjectSaveFile["appState"]; notice?: string | null };
}): ProjectStateCodec {
  const validateAppState = (appState: ProjectSaveFile["appState"]) => {
    validateProjectAppState(appState);
    return appState;
  };
  return {
    captureServer() {
      return validateAppState(args.captureAppState({ commitDraft: true, syncActivity: true, includePreview: true }));
    },
    captureRecovery() {
      return {
        appState: validateAppState(args.captureAppState({ commitDraft: false, syncActivity: false, includePreview: false })),
        interaction: args.interaction.capture(),
        historyTail: args.captureHistoryTail()
      };
    },
    async restoreServer(appState) {
      const prepared = args.prepareAppStateForRestore?.(appState) ?? { appState };
      validateAppState(prepared.appState);
      args.interaction.clear();
      const options: { recovery: false; historyTail: unknown[]; notice?: string | null } = { recovery: false, historyTail: [] };
      if (prepared.notice !== undefined) options.notice = prepared.notice;
      await args.restoreAppState(prepared.appState, options);
    },
    async restoreRecovery(capture) {
      const prepared = args.prepareAppStateForRestore?.(capture.appState) ?? { appState: capture.appState };
      validateAppState(prepared.appState);
      const options: { recovery: true; historyTail: unknown[]; notice?: string | null } = { recovery: true, historyTail: capture.historyTail };
      if (prepared.notice !== undefined) options.notice = prepared.notice;
      await args.restoreAppState(prepared.appState, options);
      if (capture.interaction && args.interaction.validate(capture.interaction)) {
        await args.interaction.restore(capture.interaction);
      }
    },
    clearInteraction: args.interaction.clear
  };
}
