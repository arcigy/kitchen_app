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
};

export type MaterialsPhaseControllerArgs = {
  container: HTMLElement;
  catalog: ClientCatalog;
  getProjectId?: () => string | null;
  getQuantities: () => readonly ProjectMaterialQuantity[];
  getScopes?: () => readonly ProjectMaterialScope[];
  initialAssignments?: ProjectMaterialAssignmentsState;
  onViewChanged?: (view: ProjectMaterialsView) => void;
  /** Fired only after a user/server mutation, never while merely loading legacy project state. */
  onAssignmentsCommitted?: (assignments: ProjectMaterialAssignmentsState) => void;
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
  removeProjectMaterialAssignment
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
  let supplierBridgeState = { ...EMPTY_SUPPLIER_BRIDGE_PANEL_STATE };
  const commitAborts = new Map<MaterialAssignmentCategory, AbortController>();
  const notifyViewChanged = () => args.onViewChanged?.(structuredClone(view));
  const notifyAssignmentsCommitted = () => args.onAssignmentsCommitted?.(structuredClone(assignments));

  const ensurePanel = () => {
    if (panel) return panel;
    panel = mountProjectMaterialsPanel(args.container, view, {
      onCommitId: commitId,
      onOpenSupplier: args.onOpenSupplier,
      onCancelSupplierBridge: args.onCancelSupplierBridge,
      onSplitEdge: splitEdge,
      onResetCategory: resetCategory,
      onCopyGeneralToScope: copyGeneralToScope,
      onRemoveScopeOverride: removeScopeOverride,
      displayCurrency: args.displayCurrency
    });
    panel.updateSupplierBridge(supplierBridgeState);
    return panel;
  };

  const renderLocalView = () => {
    view = withLiveScopes(createProjectMaterialsView(assignments, args.getQuantities(), args.catalog), args);
    panel?.update(view);
    notifyViewChanged();
  };

  const abortRequests = () => {
    loadAbort?.abort();
    loadAbort = null;
    for (const abort of commitAborts.values()) abort.abort();
    commitAborts.clear();
  };

  const commitId = async (request: ProjectMaterialIdCommitRequest): Promise<ProjectMaterialIdCommitResult> => {
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
      lookup = await lookupWithLocalFallback(args.catalog, api, request.category, value, abort.signal);
    } catch (error) {
      if (isAbortError(error)) return { ok: false, error: "Overenie bolo zrušené." };
      return { ok: false, error: errorMessage(error, "ID sa nepodarilo overiť.") };
    } finally {
      if (commitAborts.get(request.category) === abort) commitAborts.delete(request.category);
    }

    if (!lookup) return { ok: false, error: `ID ${value} sa v tenant katalógu nenašlo. Pôvodná hodnota zostala zachovaná.` };
    const compatibilityError = validateLookupCompatibility(request.category, lookup);
    if (compatibilityError) return { ok: false, error: compatibilityError };
    if (!lookup.definition.isActive) {
      return { ok: false, error: `${lookup.definition.displayName} je neaktívna katalógová položka. Pôvodná hodnota zostala zachovaná.` };
    }

    const changedAt = now();
    const nextAssignment = applyLookup(current, lookup, args.catalog, changedAt);
    const projectId = args.getProjectId?.() ?? null;

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
        const remoteView = await api.updateProjectMaterialAssignment(
          projectId,
          { revision: assignments.revision, assignment: nextAssignment },
          saveAbort.signal
        );
        assignments = initialAssignments(remoteView.assignments, args.catalog, now());
        view = viewFromRemote(assignments, remoteView, args);
        panel?.update(view);
        notifyViewChanged();
        notifyAssignmentsCommitted();
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
      const remoteView = await api.updateProjectMaterialAssignment(projectId, { revision: assignments.revision, assignment: nextAssignment });
      assignments = initialAssignments(remoteView.assignments, args.catalog, nowValue);
      view = viewFromRemote(assignments, remoteView, args);
      panel?.update(view);
      notifyViewChanged();
      notifyAssignmentsCommitted();
      return;
    }
    assignments = { ...assignments, revision: assignments.revision + 1, assignments: [...assignments.assignments, nextAssignment], updatedAt: nowValue };
    renderLocalView();
    notifyAssignmentsCommitted();
  }

  const applyRemoteView = (remoteView: ProjectMaterialsView, changedAt: string) => {
    assignments = initialAssignments(remoteView.assignments, args.catalog, changedAt);
    view = viewFromRemote(assignments, remoteView, args);
    panel?.update(view);
    notifyViewChanged();
    notifyAssignmentsCommitted();
  };

  async function refreshFromServer(): Promise<ProjectMaterialsView> {
    const projectId = args.getProjectId?.() ?? null;
    if (!projectId) return view;
    loadAbort?.abort();
    const abort = new AbortController();
    loadAbort = abort;
    try {
      const remoteView = await api.loadProjectMaterials(projectId, abort.signal);
      if (loadAbort !== abort) return view;
      remoteLoaded = true;
      applyRemoteView(remoteView, now());
    } finally {
      if (loadAbort === abort) loadAbort = null;
    }
    return view;
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
      applyRemoteView(await api.updateProjectMaterialAssignment(projectId, { revision: assignments.revision, assignment: nextAssignment }), changedAt);
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
      applyRemoteView(await api.copyProjectMaterialAssignment(projectId, {
        revision: assignments.revision,
        sourceAssignmentId: source.assignmentId,
        target: { scopeId, itemId, category }
      }), changedAt);
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
      applyRemoteView(await api.removeProjectMaterialAssignment(projectId, { revision: assignments.revision, assignmentId }), changedAt);
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

  return {
    async open(): Promise<ProjectMaterialsView> {
      active = true;
      abortRequests();
      const projectId = args.getProjectId?.() ?? null;
      if (!projectId) {
        remoteLoaded = false;
        renderLocalView();
        const activePanel = ensurePanel();
        activePanel.setInputsDisabled(false);
        activePanel.setGlobalError(null);
        return view;
      }

      panel?.destroy();
      panel = null;
      const loading = mountLoadingSkeleton(args.container, {
        variant: "phase",
        label: "Načítavam materiály projektu"
      });
      const abort = new AbortController();
      loadAbort = abort;
      try {
        const remoteView = await api.loadProjectMaterials(projectId, abort.signal);
        if (!active || loadAbort !== abort) return view;
        remoteLoaded = true;
        assignments = initialAssignments(remoteView.assignments, args.catalog, now());
        view = viewFromRemote(assignments, remoteView, args);
        loading.clear();
        const activePanel = ensurePanel();
        activePanel.update(view);
        activePanel.setInputsDisabled(false);
        notifyViewChanged();
      } catch (error) {
        if (!isAbortError(error) && active && loadAbort === abort) {
          remoteLoaded = false;
          loading.clear();
          view = { ...view, warnings: [] };
          args.container.innerHTML = `<p class="materials-phase__status materials-phase__status--error" role="alert">${escapeHtml(`Project materials could not be loaded safely. Editing is blocked. ${errorMessage(error, "")}`.trim())}</p>`;
          notifyViewChanged();
        }
      } finally {
        if (loadAbort === abort) loadAbort = null;
      }
      return view;
    },
    async close(): Promise<void> {
      await panel?.flushPending();
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
      assignments = initialAssignments(state, args.catalog, now());
      remoteLoaded = false;
      renderLocalView();
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
    assignments: state.assignments.map((current) => current.category === assignment.category ? assignment : current),
    updatedAt
  };
}

function initialAssignments(
  state: ProjectMaterialAssignmentsState | null | undefined,
  catalog: ClientCatalog,
  now: string
): ProjectMaterialAssignmentsState {
  return structuredClone(state?.initialized ? state : createDefaultProjectMaterialAssignments(catalog, now));
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
