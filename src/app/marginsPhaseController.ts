import type {
  ProjectMarginCategory,
  ProjectMarginTarget
} from "../core/project-margins/project-margin-types";
import type { ProjectMarginsView } from "../layout/bom/projectMargins";
import {
  applyProjectMarginGroup,
  loadProjectMargins,
  resetProjectMarginGroup,
  resetProjectMarginItem,
  setProjectAdditionalLabor,
  updateProjectMarginDefault,
  updateProjectMarginItem
} from "./projectMarginsApi";
import {
  mountProjectMarginsPanel,
  type ProjectMarginCommitResult,
  type ProjectMarginDefaultCommitRequest,
  type ProjectMarginGroupCommitRequest,
  type ProjectMarginItemCommitRequest,
  type ProjectMarginLaborCommitRequest,
  type ProjectMarginsPanelHandle
} from "../ui/marginsPhasePanel";

export type MarginsPhaseControllerApi = {
  loadProjectMargins: (projectId: string, signal?: AbortSignal) => Promise<ProjectMarginsView>;
  updateProjectMarginDefault: (
    projectId: string,
    request: { revision: number; marginPercent: number },
    signal?: AbortSignal
  ) => Promise<ProjectMarginsView>;
  setProjectAdditionalLabor: (
    projectId: string,
    request: { revision: number; additionalLaborCost: number },
    signal?: AbortSignal
  ) => Promise<ProjectMarginsView>;
  applyProjectMarginGroup: (
    projectId: string,
    request: { revision: number; category: ProjectMarginCategory; marginPercent: number },
    signal?: AbortSignal
  ) => Promise<ProjectMarginsView>;
  resetProjectMarginGroup: (
    projectId: string,
    request: { revision: number; category: ProjectMarginCategory },
    signal?: AbortSignal
  ) => Promise<ProjectMarginsView>;
  updateProjectMarginItem: (
    projectId: string,
    request: { revision: number; target: ProjectMarginTarget; marginPercent: number },
    signal?: AbortSignal
  ) => Promise<ProjectMarginsView>;
  resetProjectMarginItem: (
    projectId: string,
    request: { revision: number; target: ProjectMarginTarget },
    signal?: AbortSignal
  ) => Promise<ProjectMarginsView>;
};

export type MarginsPhaseControllerArgs = {
  container: HTMLElement;
  getProjectId: () => string | null;
  onViewChanged?: (view: ProjectMarginsView) => void;
  api?: Partial<MarginsPhaseControllerApi>;
};

const DEFAULT_API: MarginsPhaseControllerApi = {
  loadProjectMargins,
  updateProjectMarginDefault,
  setProjectAdditionalLabor,
  applyProjectMarginGroup,
  resetProjectMarginGroup,
  updateProjectMarginItem,
  resetProjectMarginItem
};

export function createMarginsPhaseController(args: MarginsPhaseControllerArgs) {
  const api: MarginsPhaseControllerApi = { ...DEFAULT_API, ...args.api };
  let panel: ProjectMarginsPanelHandle | null = null;
  let view: ProjectMarginsView | null = null;
  let loadAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  let mutationTail: Promise<unknown> = Promise.resolve();
  let active = false;
  let remoteLoaded = false;

  const notifyViewChanged = () => {
    if (view) args.onViewChanged?.(structuredClone(view));
  };

  const setAuthoritativeView = (nextView: ProjectMarginsView) => {
    view = structuredClone(nextView);
    panel?.update(view);
    panel?.setInputsDisabled(!view.editable);
    notifyViewChanged();
  };

  const ensurePanel = (initialView: ProjectMarginsView) => {
    if (panel) return panel;
    panel = mountProjectMarginsPanel(args.container, initialView, {
      onCommitDefault: commitDefault,
      onCommitAdditionalLabor: commitAdditionalLabor,
      onApplyGroup: commitGroup,
      onResetGroup: resetGroup,
      onCommitItem: commitItem,
      onResetItem: resetItem
    });
    return panel;
  };

  const loadRemoteView = async (projectId: string, signal?: AbortSignal): Promise<ProjectMarginsView> => {
    const nextView = await api.loadProjectMargins(projectId, signal);
    if (!active) return nextView;
    remoteLoaded = true;
    setAuthoritativeView(nextView);
    return nextView;
  };

  const reloadAfterConflict = async (projectId: string): Promise<void> => {
    try {
      const nextView = await api.loadProjectMargins(projectId);
      if (!active) return;
      remoteLoaded = true;
      setAuthoritativeView(nextView);
    } catch (error) {
      remoteLoaded = false;
      panel?.setInputsDisabled(true);
      panel?.setGlobalError(`Projekt sa medzičasom zmenil a aktuálne marže sa nepodarilo obnoviť. ${errorMessage(error, "")}`.trim());
    }
  };

  const enqueueMutation = (operation: () => Promise<ProjectMarginCommitResult>): Promise<ProjectMarginCommitResult> => {
    const queued = mutationTail.then(operation, operation);
    mutationTail = queued.then(() => undefined, () => undefined);
    return queued;
  };

  const runMutation = (
    operation: (projectId: string, currentView: ProjectMarginsView, signal: AbortSignal) => Promise<ProjectMarginsView>
  ): Promise<ProjectMarginCommitResult> => enqueueMutation(async () => {
    const projectId = args.getProjectId();
    if (!projectId) return { ok: false, error: "Nie je otvorený žiadny projekt." };
    if (!active || !remoteLoaded || !view) {
      return { ok: false, error: "Serverové marže nie sú načítané. Úprava bola bezpečne zablokovaná." };
    }
    if (!view.editable) return { ok: false, error: "Na úpravu marží nemáte oprávnenie." };

    const abort = new AbortController();
    mutationAbort = abort;
    try {
      const nextView = await operation(projectId, view, abort.signal);
      if (!active || mutationAbort !== abort) return { ok: false, error: "Uloženie bolo zrušené." };
      setAuthoritativeView(nextView);
      return { ok: true };
    } catch (error) {
      if (isAbortError(error)) return { ok: false, error: "Uloženie bolo zrušené." };
      if (isRevisionConflict(error)) {
        await reloadAfterConflict(projectId);
        return {
          ok: false,
          error: "Projekt sa medzičasom zmenil. Načítal som aktuálne marže; skontrolujte hodnotu a skúste úpravu znova."
        };
      }
      return { ok: false, error: `${errorMessage(error, "Maržu sa nepodarilo uložiť.")} Pôvodná hodnota zostala zachovaná.` };
    } finally {
      if (mutationAbort === abort) mutationAbort = null;
    }
  });

  function commitGroup(request: ProjectMarginGroupCommitRequest): Promise<ProjectMarginCommitResult> {
    return runMutation((projectId, currentView, signal) => {
      const group = currentView.groups.find((candidate) => candidate.category === request.groupId);
      if (!group) return Promise.reject(new Error("Skupina marže už v projekte neexistuje."));
      return api.applyProjectMarginGroup(projectId, {
        revision: currentView.revision,
        category: group.category,
        marginPercent: request.marginPercent
      }, signal);
    });
  }

  function commitDefault(request: ProjectMarginDefaultCommitRequest): Promise<ProjectMarginCommitResult> {
    return runMutation((projectId, currentView, signal) => api.updateProjectMarginDefault(projectId, {
      revision: currentView.revision,
      marginPercent: request.marginPercent
    }, signal));
  }

  function resetGroup(groupId: string): Promise<ProjectMarginCommitResult> {
    return runMutation((projectId, currentView, signal) => {
      const group = currentView.groups.find((candidate) => candidate.category === groupId);
      if (!group) return Promise.reject(new Error("Skupina marže už v projekte neexistuje."));
      return api.resetProjectMarginGroup(projectId, {
        revision: currentView.revision,
        category: group.category
      }, signal);
    });
  }

  function commitAdditionalLabor(request: ProjectMarginLaborCommitRequest): Promise<ProjectMarginCommitResult> {
    return runMutation((projectId, currentView, signal) => api.setProjectAdditionalLabor(projectId, {
      revision: currentView.revision,
      additionalLaborCost: request.additionalLaborCost
    }, signal));
  }

  function commitItem(request: ProjectMarginItemCommitRequest): Promise<ProjectMarginCommitResult> {
    return runMutation((projectId, currentView, signal) => {
      const target = findTarget(currentView, request.itemId);
      if (!target) return Promise.reject(new Error("Položka marže už v aktuálnom BOM neexistuje."));
      return api.updateProjectMarginItem(projectId, {
        revision: currentView.revision,
        target,
        marginPercent: request.marginPercent
      }, signal);
    });
  }

  function resetItem(itemId: string): Promise<ProjectMarginCommitResult> {
    return runMutation((projectId, currentView, signal) => {
      const target = findTarget(currentView, itemId);
      if (!target) return Promise.reject(new Error("Položka marže už v aktuálnom BOM neexistuje."));
      return api.resetProjectMarginItem(projectId, { revision: currentView.revision, target }, signal);
    });
  }

  const abortRequests = () => {
    loadAbort?.abort();
    loadAbort = null;
    mutationAbort?.abort();
    mutationAbort = null;
  };

  return {
    async open(): Promise<ProjectMarginsView> {
      active = true;
      remoteLoaded = false;
      abortRequests();
      const projectId = args.getProjectId();
      if (!projectId) throw new Error("Nie je otvorený žiadny projekt.");

      if (panel) {
        panel.setInputsDisabled(true);
        panel.setGlobalError(null);
        panel.setLoading(true);
      } else {
        args.container.innerHTML = `<div class="margins-phase"><p class="margins-phase__status" data-margin-status role="status" aria-live="polite">Načítavam marže projektu…</p></div>`;
      }

      const abort = new AbortController();
      loadAbort = abort;
      try {
        const loaded = await api.loadProjectMargins(projectId, abort.signal);
        if (!active || loadAbort !== abort) return view ?? loaded;
        remoteLoaded = true;
        view = structuredClone(loaded);
        const activePanel = ensurePanel(view);
        activePanel.update(view);
        activePanel.setInputsDisabled(!view.editable);
        notifyViewChanged();
        return structuredClone(view);
      } catch (error) {
        if (!isAbortError(error) && active && loadAbort === abort) {
          remoteLoaded = false;
          panel?.setLoading(false);
          panel?.setInputsDisabled(true);
          panel?.setGlobalError(`Serverové marže sa nepodarilo načítať. Úpravy sú zablokované, aby sa ceny nerozišli so serverom. ${errorMessage(error, "")}`.trim());
        }
        throw error;
      } finally {
        if (loadAbort === abort) loadAbort = null;
      }
    },
    async close(): Promise<void> {
      await panel?.flushPending();
      await mutationTail;
      active = false;
      remoteLoaded = false;
      abortRequests();
      panel?.destroy();
      panel = null;
    },
    destroy(): void {
      active = false;
      remoteLoaded = false;
      abortRequests();
      panel?.destroy();
      panel = null;
    },
    getView(): ProjectMarginsView | null {
      return view ? structuredClone(view) : null;
    },
    reload(): Promise<ProjectMarginsView> {
      const projectId = args.getProjectId();
      if (!projectId) return Promise.reject(new Error("Nie je otvorený žiadny projekt."));
      return loadRemoteView(projectId);
    },
    commitGroup,
    commitDefault,
    commitAdditionalLabor,
    resetGroup,
    commitItem,
    resetItem
  };
}

function findTarget(view: ProjectMarginsView, targetId: string): ProjectMarginTarget | null {
  for (const group of view.groups) {
    const item = group.items.find((candidate) => candidate.targetId === targetId);
    if (item) return { scopeId: item.scopeId, itemId: item.itemId, category: item.category };
  }
  return null;
}

function isRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; code?: unknown };
  return candidate.status === 409 || candidate.code === "REVISION_CONFLICT" || candidate.code === "PROJECT_MARGIN_REVISION_CONFLICT";
}

function isAbortError(error: unknown): boolean {
  return !!error && typeof error === "object" && "name" in error && (error as { name?: unknown }).name === "AbortError";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
