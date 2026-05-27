import type { ProjectActions } from "./projectActions";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { showToast } from "../../ui/toast";

type AutosaveOptions = {
  actions: ProjectActions;
  getChangeToken: () => string;
  intervalMs?: number;
  openPollMs?: number;
  toast?: typeof showToast;
  formatSavedMessage?: (save: ProjectSaveFile) => string;
};

function runWhenIdle(task: () => void): void {
  const requestIdle = (window as unknown as {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  }).requestIdleCallback;
  if (requestIdle) {
    requestIdle(task, { timeout: 5000 });
    return;
  }
  window.setTimeout(task, 0);
}

export function createProjectAutosaveController(options: AutosaveOptions) {
  const intervalMs = options.intervalMs ?? 10 * 60 * 1000;
  const openPollMs = options.openPollMs ?? 1000;
  const toast = options.toast ?? showToast;
  let saveTimer: number | null = null;
  let openPollTimer: number | null = null;
  let started = false;
  let inFlight = false;
  let activeProjectId: string | null = null;
  let lastSavedToken: string | null = null;

  const clearSaveTimer = () => {
    if (!saveTimer) return;
    window.clearTimeout(saveTimer);
    saveTimer = null;
  };

  const scheduleSave = () => {
    clearSaveTimer();
    if (!started) return;
    saveTimer = window.setTimeout(() => {
      runWhenIdle(() => {
        void autosave();
      });
    }, intervalMs);
  };

  const syncOpenProject = () => {
    const project = options.actions.getState().currentProject;
    const nextProjectId = project?.projectId ?? null;
    if (nextProjectId === activeProjectId) return;
    activeProjectId = nextProjectId;
    lastSavedToken = nextProjectId ? options.getChangeToken() : null;
    if (nextProjectId) {
      toast("Autosave je zapnuty. Uklada sa kazdych 10 min.", "info");
    }
    scheduleSave();
  };

  const autosave = async () => {
    if (!started || inFlight) {
      scheduleSave();
      return;
    }
    syncOpenProject();
    const project = options.actions.getState().currentProject;
    if (!project) {
      scheduleSave();
      return;
    }
    const token = options.getChangeToken();
    if (lastSavedToken === token) {
      scheduleSave();
      return;
    }
    inFlight = true;
    try {
      const save = await options.actions.save();
      activeProjectId = options.actions.getState().currentProject?.projectId ?? project.projectId;
      lastSavedToken = options.getChangeToken();
      toast(options.formatSavedMessage?.(save) ?? "Autosave: projekt je ulozeny.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(`Autosave zlyhal: ${message}`, "error");
    } finally {
      inFlight = false;
      scheduleSave();
    }
  };

  return {
    start() {
      if (started) return;
      started = true;
      syncOpenProject();
      openPollTimer = window.setInterval(syncOpenProject, openPollMs);
      scheduleSave();
    },
    stop() {
      started = false;
      clearSaveTimer();
      if (openPollTimer) {
        window.clearInterval(openPollTimer);
        openPollTimer = null;
      }
    },
    triggerNowForTest: autosave
  };
}
