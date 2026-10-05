import { recordCommercialDuration } from "../core/commercialDiagnostics";
import { isPhaseCancellation, runPhaseRequest, PHASE_WRITE_TIMEOUT_MS, type PhaseLoadState } from "./phaseRequest";
import { mountPhaseLoadFailure } from "../ui/phaseLoadFailure";
import { setRuntimeProjectAssignments } from "../core/project-materials/runtimeProjectAssignments";
import { createMaterialAssignmentEditor } from "./materialAssignmentEditor";
import { applyMaterialAssignmentChanges } from "../core/project-materials/project-material-edits";
import { showToast } from "../ui/toast";
import { resolveEffectiveProjectMaterialAssignment } from "../core/project-materials/project-material-assignment-resolution";
import { openProjectComponentDialog, type ProjectComponentEdit } from "./projectComponentDialog";
import { applyProjectComponentOperation, type ProjectComponentOperation } from "../core/project-materials/project-component-operations";
import { updateProjectComponentValues } from "./projectMaterialsApi";
import { repairSupplierMaterialPricing } from "../core/project-materials/supplierMaterialPricingRepair";
import type { ClientCatalog, ComponentDefinition, MaterialDefinition } from "../core/catalog/catalog-types";
import type { PriceCurrency } from "../core/pricing/currency";
import {
  createDefaultProjectMaterialAssignments,
  createProjectMaterialsView,
  getMaterialAssignmentCategoryDefinition,
  isComponentAllowedForCategory,
  isMaterialAllowedForCategory
} from "../core/project-materials/project-material-business";
import type {
  CatalogItemSnapshot,
  MaterialAssignmentCategory,
  ProjectMaterialAssignment,
  ProjectMaterialAssignmentsState,
  ProjectMaterialQuantity,
  ProjectMaterialScope,
  ProjectMaterialsView
} from "../core/project-materials/project-material-types";
import {
  loadProjectMaterials,
  lookupProjectMaterialCatalogItem,
  copyProjectMaterialAssignment,
  removeProjectMaterialAssignment,
  updateProjectMaterialAssignment,
  type ProjectMaterialCatalogLookup,
  type UpdateProjectMaterialAssignmentRequest
} from "./projectMaterialsApi";
import { copyProjectMaterialAssignmentToScope } from "../core/project-materials/project-material-copy";
import {
  generalProjectMaterialAssignment,
  projectMaterialScopeAssignmentId
} from "../core/project-materials/project-material-assignment-resolution";
import {
  mountProjectMaterialsPanel,
  EMPTY_SUPPLIER_BRIDGE_PANEL_STATE,
  type ProjectMaterialIdCommitRequest,
  type ProjectMaterialIdCommitResult,
  type ProjectMaterialsPanelHandle,
  type ProjectSupplierId,
  type SupplierBridgePanelState
} from "../ui/materialsPhasePanel";
import { mountLoadingSkeleton } from "../ui/loadingSkeleton";
import { createMarginsPhaseController, type MarginsPhaseControllerApi } from "./marginsPhaseController";
import type { ProjectMarginsView } from "../layout/bom/projectMargins";

export type MaterialsPhaseControllerApi = {
  loadProjectMaterials: (projectId: string, signal?: AbortSignal) => Promise<ProjectMaterialsView>;
  updateProjectMaterialAssignment: (
    projectId: string,
    request: UpdateProjectMaterialAssignmentRequest,
    signal?: AbortSignal
  ) => Promise<ProjectMaterialsView>;
  lookupCatalogItem: (
    category: MaterialAssignmentCategory,
    id: string,
    signal?: AbortSignal
  ) => Promise<ProjectMaterialCatalogLookup | null>;
  copyProjectMaterialAssignment: typeof copyProjectMaterialAssignment;
  removeProjectMaterialAssignment: typeof removeProjectMaterialAssignment;
  updateProjectComponentValues: typeof updateProjectComponentValues;
};

export type MaterialsPhaseControllerArgs = {
  onAddBoard?: (draw: boolean) => Promise<void>;
  onCreateBacksplash?: () => Promise<void>;
  container: HTMLElement;
  catalog: ClientCatalog;
  getProjectId?: () => string | null;
  getScopeKey?: () => string;
  getPhaseId?: () => string | undefined;
  prepareRead?: (signal: AbortSignal) => Promise<void>;
  getQuantities: () => readonly ProjectMaterialQuantity[];
  getScopes?: () => readonly ProjectMaterialScope[];
  initialAssignments?: ProjectMaterialAssignmentsState;
  onViewChanged?: (view: ProjectMaterialsView) => void;
  /** Fired only after a user/server mutation, never while merely loading legacy project state. */
  onAssignmentsCommitted?: (assignments: ProjectMaterialAssignmentsState) => void;
  onPricingChanged?: (view: ProjectMarginsView) => void;
  pricingApi?: Partial<Pick<MarginsPhaseControllerApi, "loadProjectMargins" | "setProjectManufacturing">>;
  onOpenModuleProperties?: (instanceId: string) => Promise<void>;
  onOpenSupplier?: (supplierId: ProjectSupplierId) => Promise<void>;
  onCancelSupplierBridge?: () => Promise<void>;
  api?: Partial<MaterialsPhaseControllerApi>;
  now?: () => string;
  displayCurrency?: PriceCurrency;
};

const DEFAULT_API: MaterialsPhaseControllerApi = {
  loadProjectMaterials,
  updateProjectMaterialAssignment,
  lookupCatalogItem: lookupProjectMaterialCatalogItem,
  copyProjectMaterialAssignment,
  removeProjectMaterialAssignment, updateProjectComponentValues
};

export function createMaterialsPhaseController(args: MaterialsPhaseControllerArgs) {
  const api: MaterialsPhaseControllerApi = { ...DEFAULT_API, ...args.api };
  const now = args.now ?? (() => new Date().toISOString());
  let assignments = initialAssignments(args.initialAssignments, args.catalog, now());
  let view = createProjectMaterialsView(assignments, args.getQuantities(), args.catalog);
  let panel: ProjectMaterialsPanelHandle | null = null;
  let loadAbort: AbortController | null = null;
  let remoteLoaded = false;
  let active = false;
  let cachedScope: string | null = null;
  let loadState: PhaseLoadState = { kind: "closed" };
  const validateSource = (remoteView: ProjectMaterialsView) => {
    if (remoteView.source && (remoteView.source.projectId !== args.getProjectId?.() || (args.getPhaseId?.() && remoteView.source.phaseId !== args.getPhaseId()))) throw new Error("Odpoveď patrí inému projektu alebo fáze. Obnovte materiály.");
    if (remoteView.calculationMs !== undefined) recordCommercialDuration("calculation", remoteView.calculationMs, "success");
  };
  const scopeKey = () => args.getScopeKey?.() ?? args.getProjectId?.() ?? "";
  const pendingWrites = new Set<Promise<void>>();
  const writeAborts = new Set<AbortController>();
  let lifetime = 0;
  const writeRemote = async (operation: (signal: AbortSignal) => Promise<ProjectMaterialsView>): Promise<ProjectMaterialsView> => {
    const scope = scopeKey();
    const generation = lifetime;
    const abort = new AbortController();
    writeAborts.add(abort);
    const pending = runPhaseRequest(operation, { signal: abort.signal, timeoutMs: PHASE_WRITE_TIMEOUT_MS });
    let finish!: () => void;
    const completed = new Promise<void>(resolve => { finish = resolve; });
    pendingWrites.add(completed);
    try {
      const result = await pending;
      if (generation !== lifetime || scope !== scopeKey()) throw new DOMException("Projekt sa zmenil.", "AbortError");
      return result;
    } catch (error) {
      if (generation === lifetime && scope === scopeKey() && !isPhaseCancellation(error)) {
        remoteLoaded = false;
        panel?.setInputsDisabled(true);
        // A failed response does not prove that the server rejected the write.
        // Read it back once; never resubmit the mutation automatically.
        try {
          const id = args.getProjectId?.();
          if (id) {
            const current = await runPhaseRequest(signal => api.loadProjectMaterials(id, signal), { stage: "materials-read" });
            if (generation === lifetime && scope === scopeKey()) {
              remoteLoaded = active && !loadAbort;
              applyRemoteView(current, now());
            }
          }
        } catch { /* Keep editing blocked until an explicit successful refresh. */ }
      }
      throw error;
    } finally { finish(); pendingWrites.delete(completed); writeAborts.delete(abort); }
  };
  let supplierBridgeState = { ...EMPTY_SUPPLIER_BRIDGE_PANEL_STATE };
  const wasteHost = args.onPricingChanged ? document.createElement("div") : undefined;
  const wasteController = wasteHost ? createMarginsPhaseController({
    container: wasteHost,
    presentation: "material-waste",
    getProjectId: () => args.getProjectId?.() ?? null,
    getScopeKey: scopeKey,
    getPhaseId: args.getPhaseId,
    onViewChanged: args.onPricingChanged,
    api: args.pricingApi
  }) : null;
  const openWasteControls = async () => {
    if (!wasteController || !wasteHost || !active) return;
    if (!args.getProjectId?.()) {
      wasteHost.innerHTML = '<section class="material-waste"><h2>Prerezy</h2><p>Vytvorte alebo otvorte uložený projekt. Potom tu nastavíte prerez dosiek a hrán.</p></section>';
      return;
    }
    // The shared owner renders a blocked error state if loading fails. Material
    // assignment controls remain usable independently of pricing availability.
    await wasteController.open().catch(() => undefined);
  };
  const commitAborts = new Map<MaterialAssignmentCategory, AbortController>();
  const notifyViewChanged = () => args.onViewChanged?.(structuredClone(view));
  const notifyAssignmentsCommitted = () => args.onAssignmentsCommitted?.(structuredClone(assignments));
  let materialEditGeneration = 0;
  const materialEditor = createMaterialAssignmentEditor({
    getView: () => view,
    now,
    notify: (message, tone) => showToast(message, tone, "top"),
    commit: async (changes) => {
      const generation = materialEditGeneration;
      const projectId = args.getProjectId?.() ?? null;
      if (projectId) {
        if (!remoteLoaded) throw new Error("Serverové priradenia nie sú načítané. Obnovte Materiály.");
        const nextView = await writeRemote(signal => api.updateProjectComponentValues(projectId, assignments.revision, { type: "edit_assignments", changes }, signal));
        if (generation !== materialEditGeneration || projectId !== args.getProjectId?.()) return;
        applyRemoteView(nextView, now());
      } else {
        assignments = applyMaterialAssignmentChanges(assignments, changes, assignments.revision, now());
        renderLocalView(); notifyAssignmentsCommitted();
      }
    }
  });

  const ensurePanel = () => {
    if (panel) return panel;
    panel = mountProjectMaterialsPanel(args.container, view, {
      wasteControls: wasteHost,
      onMaterialCommand: materialEditor.execute,
      onAddBoard: args.onAddBoard,
      onCreateBacksplash: args.onCreateBacksplash,
      onEditComponent: editComponent,
      onOpenModuleProperties: args.onOpenModuleProperties,
      onAddComponent: addComponent,
      onRemoveComponent: removeComponent,
      onCommitId: commitId,
      onOpenSupplier: args.onOpenSupplier,
      onCancelSupplierBridge: args.onCancelSupplierBridge,
      onSplitEdge: splitEdge,
      onEditEdgeGroup: editEdgeGroup,
      onResetCategory: resetCategory,
      onCopyGeneralToScope: copyGeneralToScope,
      onRemoveScopeOverride: removeScopeOverride,
      displayCurrency: args.displayCurrency
    });
    panel.updateSupplierBridge(supplierBridgeState);
    return panel;
  };

  const renderLocalView = () => {
    setRuntimeProjectAssignments(args.catalog, assignments);
    view = withLiveScopes(createProjectMaterialsView(assignments, args.getQuantities(), args.catalog), args);
    panel?.update(view, { disabled: Boolean(args.getProjectId?.()) && (!remoteLoaded || Boolean(loadAbort)) });
    notifyViewChanged();
  };

  const cancelLoad = () => { loadAbort?.abort(); loadAbort = null; };
  const abortRequests = () => {
    cancelLoad();
    for (const abort of writeAborts) abort.abort();
    writeAborts.clear();
    for (const abort of commitAborts.values()) abort.abort();
    commitAborts.clear();
  };

  const commitId = async (request: ProjectMaterialIdCommitRequest): Promise<ProjectMaterialIdCommitResult> => {
    const requestedScope = scopeKey();
    const projectId = args.getProjectId?.() ?? null;
    const generation = lifetime;
    const definition = getMaterialAssignmentCategoryDefinition(request.category);
    if (definition.idField !== request.field) return { ok: false, error: "Pole nepatrí do zvolenej kategórie." };
    const value = request.value.trim();
    if (!value) return { ok: false, error: "Katalógové ID nesmie byť prázdne." };

    const current = assignments.assignments.find((assignment) => assignment.category === request.category);
    if (!current) return { ok: false, error: "Priradenie kategórie sa nenašlo." };

    commitAborts.get(request.category)?.abort();
    const abort = new AbortController();
    commitAborts.set(request.category, abort);
    let lookup: ProjectMaterialCatalogLookup | null;
    try {
      lookup = await runPhaseRequest(signal => lookupWithLocalFallback(args.catalog, api, request.category, value, signal), { signal: abort.signal });
    } catch (error) {
      if (isAbortError(error)) return { ok: false, error: "Overenie bolo zrušené." };
      return { ok: false, error: errorMessage(error, "ID sa nepodarilo overiť.") };
    } finally {
      if (commitAborts.get(request.category) === abort) commitAborts.delete(request.category);
    }

    if (generation !== lifetime || requestedScope !== scopeKey()) return { ok: false, error: "Projekt sa zmenil. Úprava nebola odoslaná." };
    if (!lookup) return { ok: false, error: `ID ${value} sa v tenant katalógu nenašlo. Pôvodná hodnota zostala zachovaná.` };
    const compatibilityError = validateLookupCompatibility(request.category, lookup);
    if (compatibilityError) return { ok: false, error: compatibilityError };
    if (!lookup.definition.isActive) {
      return { ok: false, error: `${lookup.definition.displayName} je neaktívna katalógová položka. Pôvodná hodnota zostala zachovaná.` };
    }

    const changedAt = now();
    const nextAssignment = applyLookup(current, lookup, args.catalog, changedAt);

    if (projectId && !remoteLoaded) {
      return {
        ok: false,
        error: "Serverové priradenia nie sú načítané. Obnovte Materiály a skúste zmenu znova."
      };
    }

    if (projectId && remoteLoaded) {
      const saveAbort = new AbortController();
      commitAborts.set(request.category, saveAbort);
      try {
        const remoteView = await writeRemote(signal => api.updateProjectMaterialAssignment(
          projectId,
          { revision: assignments.revision, assignment: nextAssignment },
          signal
        ));
        applyRemoteView(remoteView, now());
        return { ok: true };
      } catch (error) {
        if (isAbortError(error)) return { ok: false, error: "Uloženie bolo zrušené." };
        return { ok: false, error: `${errorMessage(error, "Priradenie sa nepodarilo uložiť.")} Pôvodná hodnota zostala zachovaná.` };
      } finally {
        if (commitAborts.get(request.category) === saveAbort) commitAborts.delete(request.category);
      }
    }

    assignments = replaceAssignment(assignments, nextAssignment, changedAt);
    renderLocalView();
    notifyAssignmentsCommitted();
    return { ok: true };
  };

  async function editEdgeGroup(assignmentId?: string): Promise<void> {
    const { openEdgeGroupDialog } = await import("./edgeGroupDialog");
    const baseline = JSON.stringify(assignments);
    const next = await openEdgeGroupDialog(assignments, args.catalog, assignmentId);
    if (!next) return;
    if (baseline !== JSON.stringify(assignments)) throw new Error("Materiály sa medzitým zmenili. Zopakujte úpravu skupiny.");
    const projectId = args.getProjectId?.();
    if (projectId) {
      if (!remoteLoaded) throw new Error("Najprv obnovte materiály projektu.");
      applyRemoteView(await writeRemote(signal => api.updateProjectMaterialAssignment(projectId, { revision: assignments.revision, assignment: next }, signal)), now());
    } else {
      if (assignments.assignments.some(a => a.assignmentId === next.assignmentId)) assignments = replaceAssignment(assignments, next, now());
      else assignments = { ...assignments, revision: assignments.revision + 1, assignments: [...assignments.assignments, next], updatedAt: now() };
      renderLocalView(); notifyAssignmentsCommitted();
    }
  }

  async function commitComponent(operation: ProjectComponentOperation): Promise<void> {
    const projectId = args.getProjectId?.();
    if (projectId) {
      if (!remoteLoaded) throw new Error("Najprv obnovte materiály projektu.");
      applyRemoteView(await writeRemote(signal => api.updateProjectComponentValues(projectId, assignments.revision, operation, signal)), now());
    } else {
      assignments = applyProjectComponentOperation(assignments, operation, view.scopes ?? [], args.catalog, now());
      renderLocalView(); notifyAssignmentsCommitted();
    }
  }
  async function editComponent(request: ProjectComponentEdit): Promise<void> {
    const target = request.target;
    const item = target ? view.scopes?.find(scope => scope.id === target.scopeId)?.items.find(item => item.id === target.itemId) : undefined;
    const assignment = target && item ? resolveEffectiveProjectMaterialAssignment(assignments.assignments, target.scopeId, item).assignment
      : assignments.assignments.find(item => item.assignmentId === (request.assignmentId ?? target?.itemId));
    await openProjectComponentDialog({ catalog: args.catalog, currency: args.displayCurrency ?? "EUR", assignment, target, item, commit: commitComponent });
  }
  async function addComponent(scopeId: string): Promise<void> {
    await openProjectComponentDialog({ catalog: args.catalog, currency: args.displayCurrency ?? "EUR", addScopeId: scopeId, commit: commitComponent });
  }
  async function removeComponent(assignmentId: string): Promise<void> {
    if (!assignments.assignments.some(item => item.assignmentId === assignmentId && item.extraComponent)) return;
    const projectId = args.getProjectId?.();
    if (projectId) applyRemoteView(await writeRemote(signal => api.removeProjectMaterialAssignment(projectId, { revision: assignments.revision, assignmentId }, signal)), now());
    else { assignments = { ...assignments, revision: assignments.revision + 1, assignments: assignments.assignments.filter(item => item.assignmentId !== assignmentId) }; renderLocalView(); notifyAssignmentsCommitted(); }
  }

  async function splitEdge(category: "edge_front" | "edge_other"): Promise<void> {
    const matches = assignments.assignments.filter((assignment) => assignment.category === category && assignment.assignmentId.startsWith(`material-assignment:${category}`));
    if (matches.length >= 2 || !matches[0]) return;
    const nowValue = now();
    const nextAssignment: ProjectMaterialAssignment = {
      ...structuredClone(matches[0]),
      assignmentId: `material-assignment:${category}:split:2`,
      customValues: { ...structuredClone(matches[0].customValues), splitIndex: 2, edgeOwner: category === "edge_front" ? "front" : "corpus" },
      updatedAt: nowValue
    };
    const projectId = args.getProjectId?.() ?? null;
    if (projectId && remoteLoaded) {
      const remoteView = await writeRemote(signal => api.updateProjectMaterialAssignment(projectId, { revision: assignments.revision, assignment: nextAssignment }, signal));
      applyRemoteView(remoteView, nowValue);
      return;
    }
    assignments = { ...assignments, revision: assignments.revision + 1, assignments: [...assignments.assignments, nextAssignment], updatedAt: nowValue };
    renderLocalView();
    notifyAssignmentsCommitted();
  }

  const applyRemoteView = (remoteView: ProjectMaterialsView, changedAt: string) => {
    validateSource(remoteView);
    assignments = initialAssignments(remoteView.assignments, args.catalog, changedAt);
    view = viewFromRemote(assignments, remoteView, args);
    cachedScope = scopeKey();
    panel?.update(view, { disabled: Boolean(args.getProjectId?.()) && (!remoteLoaded || Boolean(loadAbort)) });
    notifyViewChanged();
    notifyAssignmentsCommitted();
  };

  async function refreshFromServer(): Promise<ProjectMaterialsView> {
    const result = await open();
    notifyAssignmentsCommitted();
    return result;
  }

  async function resetCategory(category: MaterialAssignmentCategory): Promise<void> {
    const changedAt = now();
    const defaults = createDefaultProjectMaterialAssignments(args.catalog, changedAt);
    const defaultAssignment = generalProjectMaterialAssignment(defaults.assignments, category);
    if (!defaultAssignment) throw new Error("Tenant default for this material category is not available.");
    const nextAssignment = { ...structuredClone(defaultAssignment), source: "user" as const, updatedAt: changedAt };
    const projectId = args.getProjectId?.() ?? null;
    if (projectId) {
      if (!remoteLoaded) throw new Error("Reload Materials before changing an assignment.");
      applyRemoteView(await writeRemote(signal => api.updateProjectMaterialAssignment(projectId, { revision: assignments.revision, assignment: nextAssignment }, signal)), changedAt);
      return;
    }
    assignments = replaceAssignment(assignments, nextAssignment, changedAt);
    renderLocalView();
    notifyAssignmentsCommitted();
  }

  async function copyGeneralToScope(scopeId: string, itemId: string, category: MaterialAssignmentCategory): Promise<void> {
    const scope = (view.scopes ?? []).find((candidate) => candidate.id === scopeId);
    const item = scope?.items.find((candidate) => candidate.id === itemId && candidate.category === category);
    if (!scope || !item) throw new Error("The selected module or addition item no longer exists.");
    const source = generalProjectMaterialAssignment(assignments.assignments, category, item.variantKey);
    if (!source) throw new Error("No compatible General settings assignment exists for this item.");
    const changedAt = now();
    const projectId = args.getProjectId?.() ?? null;
    if (projectId) {
      if (!remoteLoaded) throw new Error("Reload Materials before creating an override.");
      applyRemoteView(await writeRemote(signal => api.copyProjectMaterialAssignment(projectId, {
        revision: assignments.revision,
        sourceAssignmentId: source.assignmentId,
        target: { scopeId, itemId, category }
      }, signal)), changedAt);
      return;
    }
    const copied = copyProjectMaterialAssignmentToScope(source, scopeId, item, changedAt);
    assignments = {
      ...assignments,
      revision: assignments.revision + 1,
      assignments: [...assignments.assignments.filter((candidate) => candidate.assignmentId !== copied.assignmentId), copied],
      updatedAt: changedAt
    };
    renderLocalView();
    notifyAssignmentsCommitted();
  }

  async function removeScopeOverride(scopeId: string, itemId: string, category: MaterialAssignmentCategory): Promise<void> {
    const scope = (view.scopes ?? []).find((candidate) => candidate.id === scopeId);
    const item = scope?.items.find((candidate) => candidate.id === itemId && candidate.category === category);
    if (!scope || !item) throw new Error("The selected module or addition item no longer exists.");
    const assignmentId = projectMaterialScopeAssignmentId(scopeId, item);
    if (!assignments.assignments.some((candidate) => candidate.assignmentId === assignmentId)) return;
    const changedAt = now();
    const projectId = args.getProjectId?.() ?? null;
    if (projectId) {
      if (!remoteLoaded) throw new Error("Reload Materials before removing an override.");
      applyRemoteView(await writeRemote(signal => api.removeProjectMaterialAssignment(projectId, { revision: assignments.revision, assignmentId }, signal)), changedAt);
      return;
    }
    assignments = {
      ...assignments,
      revision: assignments.revision + 1,
      assignments: assignments.assignments.filter((candidate) => candidate.assignmentId !== assignmentId),
      updatedAt: changedAt
    };
    renderLocalView();
    notifyAssignmentsCommitted();
  }

  const open = async (): Promise<ProjectMaterialsView> => {
    active = true;
    remoteLoaded = false;
    cancelLoad();
    const projectId = args.getProjectId?.() ?? null;
    if (!projectId) {
      renderLocalView();
      ensurePanel().update(view);
      void openWasteControls();
      return view;
    }
    const scope = scopeKey();
    const abort = new AbortController();
    loadAbort = abort;
    const cached = cachedScope === scope;
    loadState = { kind: cached ? "refreshing" : "loading", scope };
    if (!cached) { panel?.destroy(); panel = null; }
    const loading = cached ? null : mountLoadingSkeleton(args.container, { variant: "phase", label: "Načítavam materiály projektu" });
    if (cached) ensurePanel().update(view, { disabled: true, loadingMessage: "Obnovujem aktuálne hodnoty. Zobrazené sú posledné načítané údaje." });
    try {
      const remoteView = await runPhaseRequest(async signal => {
        await Promise.allSettled([...pendingWrites]);
        signal.throwIfAborted();
        await args.prepareRead?.(signal);
        signal.throwIfAborted();
        return api.loadProjectMaterials(projectId, signal);
      }, { signal: abort.signal, stage: "materials-read" });
      if (!active || loadAbort !== abort || scope !== scopeKey()) throw new DOMException("Načítanie bolo zrušené.", "AbortError");
      validateSource(remoteView);
      remoteLoaded = true;
      cachedScope = scope;
      loadState = { kind: "ready", scope };
      assignments = initialAssignments(remoteView.assignments, args.catalog, now());
      view = viewFromRemote(assignments, remoteView, args);
      loading?.clear();
      ensurePanel().update(view);
      notifyViewChanged();
      // Materials may normalize persisted assignments. Only start pricing after
      // that response, and do not make Materials wait for pricing to finish.
      void openWasteControls();
      return structuredClone(view);
    } catch (error) {
      if (!isPhaseCancellation(error) && active && loadAbort === abort && scope === scopeKey()) {
        const message = `Materiály sa nepodarilo načítať. Úpravy sú dočasne vypnuté. ${errorMessage(error, "")}`;
        loadState = { kind: "error", scope, message };
        loading?.clear();
        if (cached && panel) panel.update(view, { disabled: true, error: message });
        else args.container.replaceChildren();
        mountPhaseLoadFailure(args.container, message, open);
      }
      throw error;
    } finally { if (loadAbort === abort) loadAbort = null; }
  };

  return {
    open,
    getLoadState: (): PhaseLoadState => ({ ...loadState }),
    async close(): Promise<void> {
      active = false;
      remoteLoaded = false;
      loadState = { kind: "closed" };
      cancelLoad();
      void wasteController?.close();
    },
    destroy(): void {
      lifetime += 1;
      cachedScope = null;
      loadState = { kind: "closed" };
      materialEditGeneration += 1;
      materialEditor.reset();
      wasteController?.destroy();
      active = false;
      remoteLoaded = false;
      abortRequests();
      panel?.destroy();
      panel = null;
    },
    refreshQuantities(): ProjectMaterialsView {
      if (remoteLoaded) return structuredClone(view);
      renderLocalView();
      return view;
    },
    getView(): ProjectMaterialsView {
      return structuredClone(view);
    },
    refreshFromServer,
    setSupplierBridgeState(state: SupplierBridgePanelState): void {
      supplierBridgeState = structuredClone(state);
      panel?.updateSupplierBridge(supplierBridgeState);
    },
    getSaveState(): ProjectMaterialAssignmentsState {
      return structuredClone(assignments);
    },
    restoreSaveState(state: ProjectMaterialAssignmentsState | null | undefined): ProjectMaterialsView {
      cachedScope = null;
      materialEditGeneration += 1;
      materialEditor.reset();
      assignments = initialAssignments(state, args.catalog, now());
      remoteLoaded = false;
      renderLocalView();
      // Properties can refresh assignments while the phase read is pending.
      // That is not a project replacement and must not strand its skeleton.
      if (active && !loadAbort) void open().catch(() => undefined);
      return view;
    },
    commitId,
    resetCategory,
    copyGeneralToScope,
    removeScopeOverride
  };
}

async function lookupWithLocalFallback(
  catalog: ClientCatalog,
  api: MaterialsPhaseControllerApi,
  category: MaterialAssignmentCategory,
  id: string,
  signal: AbortSignal
): Promise<ProjectMaterialCatalogLookup | null> {
  try {
    return await api.lookupCatalogItem(category, id, signal);
  } catch (error) {
    if (isAbortError(error)) throw error;
    const definition = getMaterialAssignmentCategoryDefinition(category);
    if (definition.kind === "material") {
      const material = catalog.materials.find((candidate) => candidate.id === id);
      return material
        ? { kind: "material", definition: material, unitPrice: finitePrice(catalog.priceList.prices[id]) }
        : null;
    }
    const component = catalog.components.find((candidate) => candidate.id === id);
    return component
      ? { kind: "component", definition: component, unitPrice: finitePrice(catalog.priceList.prices[id]) }
      : null;
  }
}

function validateLookupCompatibility(category: MaterialAssignmentCategory, lookup: ProjectMaterialCatalogLookup): string | null {
  const definition = getMaterialAssignmentCategoryDefinition(category);
  if (definition.kind !== lookup.kind) return `ID nepatrí do kategórie ${definition.label}.`;
  if (lookup.kind === "material" && !isMaterialAllowedForCategory(lookup.definition, category)) {
    return `${lookup.definition.displayName} nemožno použiť pre ${definition.label}. Pôvodná hodnota zostala zachovaná.`;
  }
  if (lookup.kind === "component" && !isComponentAllowedForCategory(lookup.definition, category)) {
    return `${lookup.definition.displayName} nemožno použiť pre ${definition.label}. Pôvodná hodnota zostala zachovaná.`;
  }
  return null;
}

function applyLookup(
  assignment: ProjectMaterialAssignment,
  lookup: ProjectMaterialCatalogLookup,
  catalog: ClientCatalog,
  capturedAt: string
): ProjectMaterialAssignment {
  if (lookup.kind === "material") {
    const snapshot: CatalogItemSnapshot<MaterialDefinition> = {
      definition: structuredClone(lookup.definition),
      unitPrice: lookup.unitPrice,
      currency: catalog.priceList.currency,
      priceListId: catalog.priceList.id,
      capturedAt
    };
    return {
      ...assignment,
      kind: "material",
      materialId: lookup.definition.id,
      componentId: undefined,
      thicknessMm: lookup.definition.defaultThicknessMm,
      source: "user",
      snapshots: { ...assignment.snapshots, material: snapshot, component: undefined },
      updatedAt: capturedAt
    };
  }

  const snapshot: CatalogItemSnapshot<ComponentDefinition> = {
    definition: structuredClone(lookup.definition),
    unitPrice: lookup.unitPrice,
    currency: catalog.priceList.currency,
    priceListId: catalog.priceList.id,
    capturedAt
  };
  return {
    ...assignment,
    kind: "component",
    componentId: lookup.definition.id,
    materialId: undefined,
    thicknessMm: undefined,
    source: "user",
    snapshots: { ...assignment.snapshots, component: snapshot, material: undefined },
    updatedAt: capturedAt
  };
}

function replaceAssignment(
  state: ProjectMaterialAssignmentsState,
  assignment: ProjectMaterialAssignment,
  updatedAt: string
): ProjectMaterialAssignmentsState {
  return {
    ...state,
    initialized: true,
    revision: state.revision + 1,
    assignments: state.assignments.map((current) => current.assignmentId === assignment.assignmentId ? assignment : current),
    updatedAt
  };
}

function initialAssignments(
  state: ProjectMaterialAssignmentsState | null | undefined,
  catalog: ClientCatalog,
  now: string
): ProjectMaterialAssignmentsState {
  return repairSupplierMaterialPricing(structuredClone(state?.initialized ? state : createDefaultProjectMaterialAssignments(catalog, now)));
}

function viewFromRemote(
  state: ProjectMaterialAssignmentsState,
  remote: ProjectMaterialsView,
  args: Pick<MaterialsPhaseControllerArgs, "catalog" | "getQuantities" | "getScopes">
): ProjectMaterialsView {
  return withLiveScopes({
    assignments: structuredClone(state),
    quantities: structuredClone(remote.quantities),
    warnings: structuredClone(remote.warnings),
    priceSource: structuredClone(remote.priceSource),
    source: remote.source ? { ...remote.source } : undefined,
    calculationMs: remote.calculationMs,
    scopes: structuredClone(remote.scopes ?? [])
  }, args);
}

function withLiveScopes(
  view: ProjectMaterialsView,
  args: Pick<MaterialsPhaseControllerArgs, "getScopes">
): ProjectMaterialsView {
  return args.getScopes ? { ...view, scopes: structuredClone([...args.getScopes()]) } : view;
}

function finitePrice(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isAbortError(error: unknown): boolean {
  return !!error && typeof error === "object" && "name" in error && (error as { name?: unknown }).name === "AbortError";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}
