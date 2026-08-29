import type { ProjectActions } from "../../app/project/projectActions";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { openCreateProjectDialog } from "./createProjectDialog";
import { openProjectFilePicker, openProjectListDialog } from "./projectLoadDialog";
import { createProjectExitGuard } from "./projectExitGuard";
import { showToast } from "../toast";
import { clearLastWorkspacePointer } from "../../app/project/projectRecoveryStore";

export type ProjectMenuActions = {
  newProject: () => void;
  saveProject: () => Promise<void>;
  downloadProject: () => Promise<void>;
  loadProjectFile: () => void;
  openProject: () => void;
  openProjectManager: () => void;
};

export function createProjectMenuActions(
  actions: ProjectActions,
  options: {
    openProjectManager?: () => void;
    formatSavedMessage?: (save: ProjectSaveFile, fallback: string) => string;
    currentUserName?: string;
    onDiscard?: () => void | Promise<void>;
    onLeave?: (choice: "save" | "discard") => void | Promise<void>;
  } = {}
): ProjectMenuActions {
  const openManager = () => {
    if (options.openProjectManager) {
      options.openProjectManager();
      return;
    }
    window.localStorage.removeItem("arcigy.kitchen.autostartWorkspace");
    clearLastWorkspacePointer();
    const url = new URL(window.location.href);
    url.searchParams.delete("workspace");
    window.location.href = `${url.pathname}${url.search}${url.hash}`;
  };
  const exitGuard = createProjectExitGuard(actions, openManager, {
    formatSavedMessage: options.formatSavedMessage,
    onDiscard: options.onDiscard,
    onLeave: options.onLeave
  });
  const withToast = async (task: Promise<unknown>, success: string) => {
    try {
      await task;
      showToast(success, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error");
    }
  };

  return {
    newProject: () => openCreateProjectDialog({
      onCreate: async (input) => {
        await withToast(actions.create(input), `Projekt vytvoril: ${options.currentUserName ?? "aktualny pouzivatel"}.`);
      }
    }),
    saveProject: () => exitGuard.saveWithLock("Projekt je ulozeny.").then(() => undefined),
    downloadProject: () => withToast(actions.download(), "Projektovy subor je pripraveny."),
    openProject: () => {
      void openProjectListDialog({
        listProjects: actions.list,
        onLoad: async (projectId) => {
          await withToast(actions.loadById(projectId), "Projekt bol nacitany.");
        }
      });
    },
    loadProjectFile: () => openProjectFilePicker(async (file) => {
      await withToast(actions.importFile(file), "Projektovy subor bol importovany.");
    }),
    openProjectManager: () => {
      void exitGuard.leaveProject();
    }
  };
}
