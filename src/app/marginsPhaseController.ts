import { recordCommercialDuration } from "../core/commercialDiagnostics";
import { isPhaseCancellation, runPhaseRequest, PHASE_WRITE_TIMEOUT_MS, type PhaseLoadState } from "./phaseRequest";
import { mountPhaseLoadFailure } from "../ui/phaseLoadFailure";
import type {
  ProjectMarginCategory,
  ProjectMarginTarget
} from "../core/project-margins/project-margin-types";
import type { ProjectManufacturingSettings } from "../core/project-manufacturing/project-manufacturing-types";
import type { ProjectMarginsView } from "../layout/bom/projectMargins";
import {
  applyProjectMarginGroup,
  loadProjectMargins,
  resetProjectMarginGroup,
  resetProjectMarginItem,
  setProjectAdditionalLabor,
  setProjectConstructionLabor,
  setProjectManufacturing,
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
  type ProjectMarginManufacturingCommitRequest,
  type ProjectMarginsPanelHandle
} from "../ui/marginsPhasePanel";
import { mountLoadingSkeleton } from "../ui/loadingSkeleton";
import { mountMaterialWastePanel, type ProjectWasteRates } from "../ui/materialWastePanel";
import { normalizeProjectManufacturingSettings } from "../core/project-manufacturing/project-manufacturing-types";

export type MarginsPhaseControllerApi = {
  setProjectConstructionLabor: typeof setProjectConstructionLabor;
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
  setProjectManufacturing: (
    projectId: string,
    request: { revision: number; manufacturing: ProjectManufacturingSettings },
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
  onCreateBacksplash?: () => Promise<void>;
  container: HTMLElement;
  presentation?: "margins" | "material-waste";
  footerContainer?: HTMLElement;
  getProjectId: () => string | null;
  getScopeKey?: () => string;
  getPhaseId?: () => string | undefined;
  prepareRead?: (signal: AbortSignal) => Promise<void>;
  onViewChanged?: (view: ProjectMarginsView) => void;
  onOpenModuleLabor?: (instanceId: string) => void | Promise<void>;
  api?: Partial<MarginsPhaseControllerApi>;
};

const DEFAULT_API: MarginsPhaseControllerApi = {
  setProjectConstructionLabor,
  loadProjectMargins,
  updateProjectMarginDefault,
  setProjectAdditionalLabor,
  setProjectManufacturing,
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
  let lifetime = 0;
  let cachedScope: string | null = null;
  let state: PhaseLoadState = { kind: "closed" };
  const scopeKey = () => args.getScopeKey?.() ?? args.getProjectId() ?? "";

  const notifyViewChanged = () => {
    if (view) args.onViewChanged?.(structuredClone(view));
  };

  const validateSource = (nextView: ProjectMarginsView) => {
    if (nextView.source && (nextView.source.projectId !== args.getProjectId() || (args.getPhaseId?.() && nextView.source.phaseId !== args.getPhaseId()))) throw new Error("Odpoveď patrí inému projektu alebo fáze. Obnovte marže.");
  };
  const setAuthoritativeView = (nextView: ProjectMarginsView) => {
    validateSource(nextView);
    if (nextView.calculationMs !== undefined) recordCommercialDuration("calculation", nextView.calculationMs, "success");
    view = structuredClone(nextView);
    cachedScope = scopeKey();
    if (active) {
      state = { kind: loadAbort ? "refreshing" : "ready", scope: cachedScope };
      panel?.update(view, { disabled: Boolean(loadAbort) || !view.editable, loadingMessage: loadAbort ? "Obnovujem aktuálne hodnoty." : null });
    }
    notifyViewChanged();
  };

  const ensurePanel = (initialView: ProjectMarginsView) => {
    if (panel) return panel;
    if (args.presentation === "material-waste") {
      panel = mountMaterialWastePanel(args.container, initialView, commitWaste);
      return panel;
    }
    panel = mountProjectMarginsPanel(args.container, initialView, {
      onCommitDefault: commitDefault,
      onCommitAdditionalLabor: commitAdditionalLabor,
      onCreateBacksplash: args.onCreateBacksplash,
      onCommitConstructionLabor: (percent) => runMutation((projectId, currentView, signal) => api.setProjectConstructionLabor(projectId, { revision: currentView.revision, percent }, signal)),
      onCommitManufacturing: commitManufacturing,
      onApplyGroup: commitGroup,
      onResetGroup: resetGroup,
      onCommitItem: commitItem,
      onResetItem: resetItem,
      onOpenModuleLabor: args.onOpenModuleLabor
    }, { footerContainer: args.footerContainer });
    return panel;
  };

  const reloadAfterConflict = async (projectId: string, scope: string, generation: number): Promise<void> => {
    if (scopeKey() !== scope || generation !== lifetime) return;
    remoteLoaded = false;
    panel?.setInputsDisabled(true);
    try {
      const nextView = await runPhaseRequest(signal => api.loadProjectMargins(projectId, signal), { stage: "margins-read" });
      if (scopeKey() !== scope || generation !== lifetime) return;
      remoteLoaded = active;
      setAuthoritativeView(nextView);
    } catch (error) {
      if (scopeKey() !== scope || generation !== lifetime) return;
      panel?.setGlobalError(`Aktuálne marže sa nepodarilo overiť. ${errorMessage(error, "")}`.trim());
    }
  };

  const enqueueMutation = (operation: () => Promise<ProjectMarginCommitResult>): Promise<ProjectMarginCommitResult> => {
    const queued = mutationTail.then(operation, operation);
    mutationTail = queued.then(() => undefined, () => undefined);
    return queued;
  };

  const runMutation = (
    operation: (projectId: string, currentView: ProjectMarginsView, signal: AbortSignal) => Promise<ProjectMarginsView>
  ): Promise<ProjectMarginCommitResult> => {
    const requestedScope = scopeKey();
    const generation = lifetime;
    if (!active || !remoteLoaded || !view) return Promise.resolve({ ok: false, error: "Serverové marže nie sú načítané. Úprava bola bezpečne zablokovaná." });
    return enqueueMutation(async () => {
    const projectId = args.getProjectId();
    if (scopeKey() !== requestedScope || generation !== lifetime) return { ok: false, error: "Projekt sa zmenil. Úprava nebola odoslaná." };
    if (!projectId) return { ok: false, error: "Nie je otvorený žiadny projekt." };
    if (!view || cachedScope !== requestedScope) {
      return { ok: false, error: "Serverové marže nie sú načítané. Úprava bola bezpečne zablokovaná." };
    }
    if (!view.editable) return { ok: false, error: "Na úpravu marží nemáte oprávnenie." };

    const abort = new AbortController();
    mutationAbort = abort;
    try {
      const currentView = view;
      const nextView = await runPhaseRequest(signal => operation(projectId, currentView, signal), { signal: abort.signal, timeoutMs: PHASE_WRITE_TIMEOUT_MS });
      if (scopeKey() !== requestedScope || generation !== lifetime || mutationAbort !== abort) return { ok: false, error: "Uloženie bolo zrušené." };
      setAuthoritativeView(nextView);
      return { ok: true };
    } catch (error) {
      if (isPhaseCancellation(error)) return { ok: false, error: "Uloženie bolo zrušené." };
      if (isRevisionConflict(error)) {
        await reloadAfterConflict(projectId, requestedScope, generation);
        return {
          ok: false,
          error: "Projekt sa medzičasom zmenil. Načítal som aktuálne marže; skontrolujte hodnotu a skúste úpravu znova."
        };
      }
      await reloadAfterConflict(projectId, requestedScope, generation);
      return { ok: false, error: `${errorMessage(error, "Maržu sa nepodarilo uložiť.")} Skontrolujte aktuálnu hodnotu. Rozpracovaný vstup zostal zachovaný.` };
    } finally {
      if (mutationAbort === abort) mutationAbort = null;
    }
    });
  };

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

  function commitManufacturing(request: ProjectMarginManufacturingCommitRequest): Promise<ProjectMarginCommitResult> {
    return runMutation((projectId, currentView, signal) => api.setProjectManufacturing(projectId, {
      revision: currentView.revision,
      manufacturing: request.manufacturing
    }, signal));
  }

  function commitWaste(rates: ProjectWasteRates): Promise<ProjectMarginCommitResult> {
    return runMutation((projectId, currentView, signal) => api.setProjectManufacturing(projectId, {
      revision: currentView.revision,
      manufacturing: { ...normalizeProjectManufacturingSettings(currentView.settings.manufacturing), ...rates }
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

  const cancelLoad = () => {
    loadAbort?.abort();
    loadAbort = null;
  };

  const open = async (): Promise<ProjectMarginsView> => {
    active = true;
    remoteLoaded = false;
    cancelLoad();
    const projectId = args.getProjectId();
    if (!projectId) throw new Error("Nie je otvorený žiadny projekt.");
    const scope = scopeKey();
    const abort = new AbortController();
    loadAbort = abort;
    const cached = cachedScope === scope && view !== null;
    state = { kind: cached ? "refreshing" : "loading", scope };
    if (!cached) {
      panel?.destroy();
      panel = null;
      view = null;
    }
    const loading = cached ? null : mountLoadingSkeleton(args.container, {
      variant: "phase", label: args.presentation === "material-waste" ? "Načítavam prerezy projektu" : "Načítavam marže projektu"
    });
    const footerLoading = !cached && args.footerContainer
      ? mountLoadingSkeleton(args.footerContainer, { variant: "phase", label: "Načítavam súhrn marží" }) : null;
    if (cached && view) ensurePanel(view).update(view, { disabled: true, loadingMessage: "Obnovujem aktuálne hodnoty. Zobrazené sú posledné načítané údaje." });
    try {
      await runPhaseRequest(async signal => {
        await mutationTail;
        signal.throwIfAborted();
        await args.prepareRead?.(signal);
      }, { signal: abort.signal, timeoutMs: PHASE_WRITE_TIMEOUT_MS });
      const loaded = await runPhaseRequest(signal => api.loadProjectMargins(projectId, signal), { signal: abort.signal, stage: "margins-read" });
      if (!active || loadAbort !== abort || scopeKey() !== scope) throw new DOMException("Načítanie bolo zrušené.", "AbortError");
      validateSource(loaded);
      loading?.clear();
      footerLoading?.clear();
      loadAbort = null;
      remoteLoaded = true;
      view = structuredClone(loaded);
      ensurePanel(view);
      setAuthoritativeView(view);
      return structuredClone(view);
    } catch (error) {
      if (!isPhaseCancellation(error) && active && loadAbort === abort && scopeKey() === scope) {
        remoteLoaded = false;
        const message = `Marže sa nepodarilo načítať. Úpravy sú dočasne vypnuté. ${errorMessage(error, "")}`.trim();
        state = { kind: "error", scope, message };
        loading?.clear();
        footerLoading?.clear();
        if (panel && view) panel.update(view, { disabled: true, error: message });
        else args.container.replaceChildren();
        mountPhaseLoadFailure(args.container, message, open);
      }
      throw error;
    } finally {
      if (loadAbort === abort) loadAbort = null;
    }
  };

  return {
    open,
    async close(): Promise<void> {
      active = false;
      remoteLoaded = false;
      state = { kind: "closed" };
      cancelLoad();
      // Writes finish independently; leaving the screen must never await a network response.
    },
    destroy(): void {
      lifetime += 1;
      active = false;
      remoteLoaded = false;
      state = { kind: "closed" };
      cancelLoad();
      mutationAbort?.abort();
      mutationAbort = null;
      panel?.destroy();
      panel = null;
      view = null;
      cachedScope = null;
    },
    getLoadState: (): PhaseLoadState => ({ ...state }),
    getView(): ProjectMarginsView | null {
      return cachedScope === scopeKey() && view ? structuredClone(view) : null;
    },
    reload: open,
    commitGroup,
    commitDefault,
    commitAdditionalLabor,
    commitManufacturing,
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
