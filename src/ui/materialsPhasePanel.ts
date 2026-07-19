import { MATERIAL_ASSIGNMENT_CATEGORIES } from "../core/project-materials/project-material-business";
import {
  generalProjectMaterialAssignment,
  resolveEffectiveProjectMaterialAssignment,
  topLevelProjectMaterialAssignments
} from "../core/project-materials/project-material-assignment-resolution";
import type {
  MaterialAssignmentCategory,
  ProjectMaterialAssignment,
  ProjectMaterialWarning,
  ProjectMaterialsView
} from "../core/project-materials/project-material-types";
import type { MaterialUsageGroup, ProjectMaterialUsageSummary } from "../layout/bom/materialUsageSummary";
import type { ClientSupplierPortal } from "../core/supplier-configuration/supplier-configuration-types";
import {
  convertPriceCurrency,
  isPriceCurrency,
  type PriceCurrency
} from "../core/pricing/currency";

export type ProjectSupplierId = string;

export type ProjectMaterialIdField = "materialId" | "componentId";

export type ProjectMaterialIdCommitRequest = {
  category: MaterialAssignmentCategory;
  field: ProjectMaterialIdField;
  value: string;
  committedValue: string;
};

export type ProjectMaterialIdCommitResult = {
  ok: boolean;
  error?: string;
};

export type ProjectMaterialsPanelActions = {
  onCommitId: (request: ProjectMaterialIdCommitRequest) => Promise<ProjectMaterialIdCommitResult>;
  onOpenSupplier?: (supplierId: ProjectSupplierId) => Promise<void>;
  onCancelSupplierBridge?: () => Promise<void>;
  onSplitEdge?: (category: "edge_front" | "edge_other") => Promise<void>;
  displayCurrency?: PriceCurrency;
};

export type SupplierBridgePanelState = {
  connection: "checking" | "connected" | "unavailable";
  busy: boolean;
  sessionStatus: string | null;
  processed: number;
  total: number;
  needsConfirmation: number;
  completed: number;
  warnings: string[];
  fallbackInstruction: boolean;
  suppliers: ClientSupplierPortal[];
};

export const EMPTY_SUPPLIER_BRIDGE_PANEL_STATE: SupplierBridgePanelState = {
  connection: "checking",
  busy: false,
  sessionStatus: null,
  processed: 0,
  total: 0,
  needsConfirmation: 0,
  completed: 0,
  warnings: [],
  fallbackInstruction: false,
  suppliers: []
};

export type ProjectMaterialsPanelHandle = {
  update: (view: ProjectMaterialsView) => void;
  setLoading: (loading: boolean, message?: string) => void;
  setInputsDisabled: (disabled: boolean) => void;
  setGlobalError: (message: string | null) => void;
  updateSupplierBridge: (state: SupplierBridgePanelState) => void;
  flushPending: () => Promise<void>;
  destroy: () => void;
};

export function mountProjectMaterialsPanel(container: HTMLElement, summary: ProjectMaterialUsageSummary): void;
export function mountProjectMaterialsPanel(
  container: HTMLElement,
  view: ProjectMaterialsView,
  actions: ProjectMaterialsPanelActions
): ProjectMaterialsPanelHandle;
export function mountProjectMaterialsPanel(
  container: HTMLElement,
  input: ProjectMaterialUsageSummary | ProjectMaterialsView,
  actions?: ProjectMaterialsPanelActions
): void | ProjectMaterialsPanelHandle {
  if (!isProjectMaterialsView(input)) {
    container.innerHTML = renderLegacyProjectMaterialsPanel(input);
    return;
  }
  if (!actions) throw new Error("Interactive project materials panel requires actions.");

  let currentView = input;
  let loadingMessage: string | null = null;
  let globalError: string | null = null;
  let inputsDisabled = false;
  let supplierBridge = { ...EMPTY_SUPPLIER_BRIDGE_PANEL_STATE };
  let activeSettingsTab: "general" | "modules" | "additions" = "general";
  let selectedScopeId: string | null = null;
  let destroyed = false;
  const commitSequence = new WeakMap<HTMLInputElement, number>();
  const pendingCommits = new Set<Promise<void>>();
  const render = () => {
    if (destroyed) return;
    container.innerHTML = renderInteractiveProjectMaterialsPanel(currentView, {
      loadingMessage,
      globalError,
      inputsDisabled,
      supplierBridge,
      activeSettingsTab,
      selectedScopeId,
      displayCurrency: actions.displayCurrency
    });
  };

  const commitInput = async (inputElement: HTMLInputElement) => {
    const category = inputElement.dataset.materialCategory as MaterialAssignmentCategory | undefined;
    const field = inputElement.dataset.materialIdField as ProjectMaterialIdField | undefined;
    if (!category || (field !== "materialId" && field !== "componentId")) return;
    const committedValue = inputElement.dataset.committedValue ?? "";
    const value = inputElement.value.trim();
    if (value === committedValue) {
      setInputError(container, inputElement, null);
      return;
    }

    const sequence = (commitSequence.get(inputElement) ?? 0) + 1;
    commitSequence.set(inputElement, sequence);
    inputElement.disabled = true;
    inputElement.setAttribute("aria-busy", "true");
    setInputError(container, inputElement, null);
    let result: ProjectMaterialIdCommitResult;
    try {
      result = await actions.onCommitId({ category, field, value, committedValue });
    } catch (error) {
      result = { ok: false, error: errorMessage(error) };
    }
    if (destroyed || commitSequence.get(inputElement) !== sequence || !inputElement.isConnected) return;
    inputElement.disabled = false;
    inputElement.removeAttribute("aria-busy");
    if (!result.ok) {
      inputElement.value = committedValue;
      setInputError(container, inputElement, result.error ?? `ID ${value || "(prázdne)"} sa nepodarilo overiť.`);
      return;
    }
    inputElement.dataset.committedValue = value;
    setInputError(container, inputElement, null);
  };

  const onFocusOut = (event: FocusEvent) => {
    const target = event.target as HTMLInputElement | null;
    if (target?.dataset.materialAssignmentInput !== "true") return;
    const pending = commitInput(target);
    pendingCommits.add(pending);
    void pending.finally(() => pendingCommits.delete(pending));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLInputElement | null;
    if (target?.dataset.materialAssignmentInput !== "true") return;
    if (event.key === "Enter") {
      event.preventDefault();
      target.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      target.value = target.dataset.committedValue ?? "";
      setInputError(container, target, null);
      target.blur();
    }
  };

  const onClick = (event: MouseEvent) => {
    const splitEdge = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-material-edge-split]")?.dataset.materialEdgeSplit
      : null;
    if (splitEdge === "edge_front" || splitEdge === "edge_other") {
      void actions.onSplitEdge?.(splitEdge);
      return;
    }
    const settingsTab = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-materials-settings-tab]")?.dataset.materialsSettingsTab : null;
    if (settingsTab === "general" || settingsTab === "modules" || settingsTab === "additions") {
      activeSettingsTab = settingsTab;
      const firstScope = currentView.scopes?.find((scope) => scope.kind === (settingsTab === "modules" ? "module" : "addition"));
      selectedScopeId = firstScope?.id ?? null;
      render();
      return;
    }
    const supplierId = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-supplier-open]")?.dataset.supplierOpen
      : null;
    if (isProjectSupplierId(supplierId)) {
      void actions.onOpenSupplier?.(supplierId);
      return;
    }
    const action = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-supplier-bridge-action]")?.dataset.supplierBridgeAction : null;
    if (action === "cancel") {
      void actions.onCancelSupplierBridge?.();
      return;
    }
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-material-warning-category]") : null;
    const category = element?.dataset.materialWarningCategory;
    if (!category) return;
    container.querySelector<HTMLInputElement>(`[data-material-category="${category}"][data-material-assignment-input="true"]`)?.focus();
  };

  container.addEventListener("focusout", onFocusOut);
  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("click", onClick);
  const onChange = (event: Event) => {
    const select = event.target as HTMLSelectElement | null;
    if (select?.dataset.supplierPicker === "true") {
      if (isProjectSupplierId(select.value)) void actions.onOpenSupplier?.(select.value);
      select.value = "";
      return;
    }
    if (select?.dataset.materialScopeSelect !== "true") return;
    selectedScopeId = select.value || null;
    render();
  };
  container.addEventListener("change", onChange);
  render();

  return {
    update(view) {
      currentView = view;
      loadingMessage = null;
      globalError = null;
      render();
    },
    setLoading(loading, message = "Načítavam materiály projektu…") {
      loadingMessage = loading ? message : null;
      render();
    },
    setInputsDisabled(disabled) {
      inputsDisabled = disabled;
      render();
    },
    setGlobalError(message) {
      globalError = message;
      render();
    },
    updateSupplierBridge(state) {
      supplierBridge = structuredClone(state);
      render();
    },
    async flushPending() {
      while (pendingCommits.size > 0) {
        await Promise.allSettled([...pendingCommits]);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      container.removeEventListener("focusout", onFocusOut);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("click", onClick);
      container.removeEventListener("change", onChange);
    }
  };
}

export function renderProjectMaterialsPanel(
  input: ProjectMaterialUsageSummary | ProjectMaterialsView,
  state: {
    activeSettingsTab?: "general" | "modules" | "additions";
    selectedScopeId?: string | null;
    displayCurrency?: PriceCurrency;
  } = {}
): string {
  return isProjectMaterialsView(input)
    ? renderInteractiveProjectMaterialsPanel(input, state)
    : renderLegacyProjectMaterialsPanel(input);
}

export function renderMaterialWarnings(input: ProjectMaterialUsageSummary | readonly ProjectMaterialWarning[]): string {
  if (isStructuredWarningList(input)) return renderStructuredWarnings(input);
  if (input.warnings.length === 0) return `<p class="materials-warning-empty">Bez materiálových varovaní.</p>`;
  return input.warnings
    .slice(0, 4)
    .map((warning) => `<p class="materials-warning"><span aria-hidden="true">&#9888;</span>${escapeHtml(warning)}</p>`)
    .join("");
}

function isStructuredWarningList(
  input: ProjectMaterialUsageSummary | readonly ProjectMaterialWarning[]
): input is readonly ProjectMaterialWarning[] {
  return Array.isArray(input);
}

function renderInteractiveProjectMaterialsPanel(
  view: ProjectMaterialsView,
  state: {
    loadingMessage?: string | null;
    globalError?: string | null;
    inputsDisabled?: boolean;
    supplierBridge?: SupplierBridgePanelState;
    activeSettingsTab?: "general" | "modules" | "additions";
    selectedScopeId?: string | null;
    displayCurrency?: PriceCurrency;
  }
): string {
  const displayCurrency = state.displayCurrency
    ?? (isPriceCurrency(view.priceSource.currency) ? view.priceSource.currency : "EUR");
  const generalAssignments = topLevelProjectMaterialAssignments(view.assignments.assignments);
  const assignmentByCategory = new Map<MaterialAssignmentCategory, ProjectMaterialAssignment>();
  for (const { category } of MATERIAL_ASSIGNMENT_CATEGORIES) {
    const assignment = generalProjectMaterialAssignment(view.assignments.assignments, category);
    if (assignment) assignmentByCategory.set(category, assignment);
  }
  const visibleCategories = MATERIAL_ASSIGNMENT_CATEGORIES;
  const assignedCount = visibleCategories.filter((definition) => hasSupplierAssignment(assignmentByCategory.get(definition.category))).length;

  return `
    <header class="materials-phase__header materials-phase__header--compact">
      <div>
        <h1>Materiály</h1>
        <p>Materiály a ceny priraďte z otvoreného detailu produktu.</p>
      </div>
      <div class="materials-phase__metrics" aria-label="Súhrn priradení">
        ${metric("Priradené", `${assignedCount} / ${visibleCategories.length}`)}
      </div>
    </header>
    ${renderSupplierBridge(state.supplierBridge ?? EMPTY_SUPPLIER_BRIDGE_PANEL_STATE)}
    ${state.loadingMessage ? `<p class="materials-phase__status" role="status">${escapeHtml(state.loadingMessage)}</p>` : ""}
    ${state.globalError ? `<p class="materials-phase__status materials-phase__status--error" role="alert">${escapeHtml(state.globalError)}</p>` : ""}
    ${renderSettingsTabs(state.activeSettingsTab ?? "general")}
    ${state.activeSettingsTab === "modules"
      ? renderScopeSettings(view, "module", state.selectedScopeId, displayCurrency)
      : state.activeSettingsTab === "additions"
        ? renderScopeSettings(view, "addition", state.selectedScopeId, displayCurrency)
        : `<div class="materials-phase__content"><section class="materials-phase__groups" aria-label="General settings">${visibleCategories.map((definition) => renderAssignmentGroup(definition, generalAssignments.filter((assignment) => assignment.category === definition.category), view, displayCurrency)).join("")}</section>${renderMaterialsSidebar(view, visibleCategories, assignmentByCategory)}</div>`}
  `;
}

function renderSettingsTabs(active: "general" | "modules" | "additions"): string {
  const tab = (id: "general" | "modules" | "additions", label: string) => `<button type="button" class="materials-settings-tab ${active === id ? "materials-settings-tab--active" : ""}" data-materials-settings-tab="${id}" aria-pressed="${active === id}">${label}</button>`;
  return `<nav class="materials-settings-tabs" aria-label="Nastavenia materiálov">${tab("general", "General settings")}${tab("modules", "Module settings")}${tab("additions", "Additions")}</nav>`;
}

function renderScopeSettings(
  view: ProjectMaterialsView,
  kind: "module" | "addition",
  selectedScopeId: string | null | undefined,
  displayCurrency: PriceCurrency
): string {
  const scopes = (view.scopes ?? []).filter((scope) => scope.kind === kind);
  const selected = scopes.find((scope) => scope.id === selectedScopeId) ?? scopes[0];
  if (!selected) return `<section class="materials-scope-empty"><strong>${kind === "module" ? "V layoute zatiaľ nie je modul." : "V projekte zatiaľ nie sú additions."}</strong><p>Po vložení položky sa tu zobrazia jej dosky a komponenty.</p></section>`;
  const categories = [...new Set(selected.items.map((item) => item.category))];
  return `<section class="materials-scope-settings" aria-label="${escapeHtml(selected.label)}">
    <header><div><span>${kind === "module" ? "MODULE" : "ADDITION"}</span><h2>${escapeHtml(selected.label)}</h2><p>Dosky a komponenty dedia materiál z General settings.</p></div>
    <label>Vybrať ${kind === "module" ? "modul" : "addition"}<select data-material-scope-select="true">${scopes.map((scope) => `<option value="${escapeHtml(scope.id)}" ${scope.id === selected.id ? "selected" : ""}>${escapeHtml(scope.label)}</option>`).join("")}</select></label></header>
    <div class="materials-scope-groups">${categories.map((category) => `<section class="materials-scope-group"><h3>${escapeHtml(MATERIAL_ASSIGNMENT_CATEGORIES.find((definition) => definition.category === category)?.label ?? category)}</h3>${selected.items.filter((item) => item.category === category).map((item) => {
      const effective = resolveEffectiveProjectMaterialAssignment(view.assignments.assignments, selected.id, item);
      return renderScopeItem(item, effective.assignment, effective.source, displayCurrency);
    }).join("")}</section>`).join("")}</div>
  </section>`;
}

function renderScopeItem(
  item: NonNullable<ProjectMaterialsView["scopes"]>[number]["items"][number],
  assignment: ProjectMaterialAssignment | null,
  source: "override" | "general" | null,
  displayCurrency: PriceCurrency
): string {
  const supplier = supplierAssignmentDetails(assignment);
  const snapshot = assignmentSnapshot(assignment);
  const sourceLabel = source === "override" ? "Vlastné priradenie" : source === "general" ? "Zdedené z General settings" : "Nepriradené";
  const product = supplier ? `${escapeHtml(snapshot?.definition.displayName ?? "Produkt")} · ${escapeHtml(supplier.productCode)}` : snapshot?.definition.displayName ? escapeHtml(snapshot.definition.displayName) : "Nepriradené";
  return `<article class="materials-scope-item" data-material-scope-item="${escapeHtml(item.id)}" data-material-assignment-source="${source ?? "none"}"><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)} · ${formatQuantity(item.quantity, item.unit)}</small></div><div class="materials-scope-item__assignment"><small>${product} · ${sourceLabel}</small><strong>${snapshot ? formatUnitPrice(snapshot.unitPrice ?? null, snapshot.currency ?? "EUR", snapshot.definition.pricingUnit, displayCurrency) : "Nepriradené"}</strong></div></article>`;
}

function renderSupplierBridge(state: SupplierBridgePanelState): string {
  const connectionLabel = state.connection === "connected" ? "Rozšírenie pripojené" : state.connection === "unavailable" ? "Rozšírenie nenájdené" : "Kontrolujem rozšírenie";
  return `<section class="materials-supplier-launcher" aria-label="Dodávateľ">
    ${state.suppliers.length > 0
      ? `<select class="materials-supplier-picker" data-supplier-picker="true" ${state.busy ? "disabled" : ""}><option value="">Vybrať dodávateľa</option>${state.suppliers.map((supplier) => `<option value="${escapeHtml(supplier.supplierId)}">${escapeHtml(supplier.displayName)}</option>`).join("")}</select>`
      : `<span class="materials-supplier-bridge__empty">Pre klienta nie je povolený žiadny dodávateľ.</span>`}
    <small class="materials-supplier-launcher__status">${escapeHtml(connectionLabel)}${state.sessionStatus ? ` · ${formatNumber(state.completed)} priradené` : ""}</small>
    ${state.fallbackInstruction ? `<small class="materials-supplier-launcher__warning">Side Panel otvorte cez ikonu Arcigy Supplier Bridge v Chrome.</small>` : ""}
    ${state.warnings.map((warning) => `<small class="materials-supplier-launcher__warning">${escapeHtml(warning)}</small>`).join("")}
  </section>`;
}

function renderAssignmentGroup(
  definition: (typeof MATERIAL_ASSIGNMENT_CATEGORIES)[number],
  categoryAssignments: readonly ProjectMaterialAssignment[],
  view: ProjectMaterialsView,
  displayCurrency: PriceCurrency
): string {
  const quantity = quantityFor(view, definition.category);
  return `
    <article class="materials-group materials-group--${definition.category}" data-material-assignment-category="${definition.category}">
      <div class="materials-group__icon" aria-hidden="true">${categoryIcon(definition.category)}</div>
      <div class="materials-group__body">
        <header>
          <div><h2>${escapeHtml(definition.label)}</h2><p>${escapeHtml(definition.description)}</p></div>
          <div class="materials-group__quantity"><strong>${formatQuantity(quantity.quantity, quantity.unit)}</strong>${quantity.pieces ? `<small>${formatNumber(quantity.pieces)} dosiek / ks</small>` : ""}</div>
        </header>
        ${categoryAssignments.map((current, index) => renderAssignmentSelection(definition, current, view, index, displayCurrency)).join("")}
        ${(definition.category === "edge_front" || definition.category === "edge_other") && categoryAssignments.length < 2
          ? `<button type="button" class="materials-edge-split" data-material-edge-split="${definition.category}">Split · pridať druhé ohranenie</button>`
          : ""}
      </div>
    </article>
  `;
}

function renderAssignmentSelection(
  definition: (typeof MATERIAL_ASSIGNMENT_CATEGORIES)[number],
  assignment: ProjectMaterialAssignment | undefined,
  view: ProjectMaterialsView,
  index: number,
  displayCurrency: PriceCurrency
): string {
  const snapshot = assignmentSnapshot(assignment);
  const supplier = supplierAssignmentDetails(assignment);
  const thickness = assignment?.kind === "material" ? assignment.thicknessMm ?? assignment.snapshots.material?.definition.defaultThicknessMm : undefined;
  const productName = supplier ? snapshot?.definition.displayName ?? "Zachytený produkt" : "Produkt zatiaľ nevybraný";
  const price = supplier ? formatUnitPrice(snapshot?.unitPrice ?? null, snapshot?.currency ?? view.priceSource.currency, snapshot?.definition.pricingUnit, displayCurrency) : "—";
  const bridge = assignment?.customValues.supplierBridge;
  const bridgeValues = bridge && typeof bridge === "object" && !Array.isArray(bridge) ? bridge as Record<string, unknown> : {};
  const edgeWidth = typeof bridgeValues.edgeWidthMm === "number" ? bridgeValues.edgeWidthMm : null;
  const edgeThickness = typeof bridgeValues.edgeThicknessMm === "number" ? bridgeValues.edgeThicknessMm : null;
  const edgeVariant = (definition.category === "edge_front" || definition.category === "edge_other") && (edgeWidth != null || edgeThickness != null)
    ? `<span><small>Rozmer hrany</small><strong>${edgeWidth == null ? "—" : formatNumber(edgeWidth)} × ${edgeThickness == null ? "—" : formatNumber(edgeThickness)} mm</strong></span>`
    : "";
  return `<div class="materials-group__selection ${supplier ? "materials-group__selection--assigned" : ""}" data-material-assignment-id="${escapeHtml(assignment?.assignmentId ?? "")}">
    <div>${index > 0 ? `<small>Ohranenie ${index + 1}</small>` : ""}<strong>${escapeHtml(productName)}</strong><small>${supplier ? `${escapeHtml(supplier.label)} · ${escapeHtml(supplier.productCode)}` : "Vyberte produkt na stránke dodávateľa"}</small></div>
    ${definition.kind === "material" ? `<span><small>Hrúbka</small><strong>${thickness == null ? "—" : `${formatNumber(thickness)} mm`}</strong></span>` : ""}
    ${edgeVariant}
    <span><small>Cena</small><strong>${escapeHtml(price)}</strong></span>
  </div>`;
}

function supplierAssignmentDetails(assignment: ProjectMaterialAssignment | null | undefined): { label: string; productCode: string } | null {
  const bridge = assignment?.customValues?.supplierBridge;
  const value = bridge && typeof bridge === "object" && !Array.isArray(bridge) ? bridge as Record<string, unknown> : {};
  if (typeof value.supplierProductCode !== "string" || !value.supplierProductCode) return null;
  const supplierId = typeof value.supplierId === "string" ? value.supplierId : "";
  const label = supplierId === "demos" ? "Démos" : supplierId === "jaf_holz" ? "JAF Holz" : supplierId === "schachermayer" ? "Schachermayer" : supplierId === "hranipex" ? "Hranipex" : "Dodávateľ";
  return { label, productCode: value.supplierProductCode };
}

function hasSupplierAssignment(assignment: ProjectMaterialAssignment | undefined): boolean {
  return supplierAssignmentDetails(assignment) !== null;
}

function isProjectSupplierId(value: unknown): value is ProjectSupplierId {
  return typeof value === "string" && value.length > 0 && value.length <= 120;
}

function renderMaterialsSidebar(
  view: ProjectMaterialsView,
  definitions: readonly (typeof MATERIAL_ASSIGNMENT_CATEGORIES)[number][],
  assignments: Map<MaterialAssignmentCategory, ProjectMaterialAssignment>
): string {
  return `
    <aside class="materials-phase__sidebar" aria-label="Prehľad materiálov">
      <section class="materials-sidebar-card materials-sidebar-card--warnings">
        <h2>Varovania <span>${formatNumber(view.warnings.length)}</span></h2>
        <div class="materials-sidebar-warnings">${renderStructuredWarnings(view.warnings, true)}</div>
      </section>
      <section class="materials-sidebar-card materials-sidebar-card--overview">
        <h2>Prehľad materiálov</h2>
        <dl>
          ${definitions.map((definition) => {
            const quantity = quantityFor(view, definition.category);
            const assignment = assignments.get(definition.category);
            const supplier = supplierAssignmentDetails(assignment);
            return `<div><dt>${escapeHtml(definition.label)}</dt><dd>${formatQuantity(quantity.quantity, quantity.unit)}<small>${supplier ? `${escapeHtml(supplier.label)} · ${escapeHtml(supplier.productCode)}` : "Nepriradené"}</small></dd></div>`;
          }).join("")}
        </dl>
      </section>
    </aside>
  `;
}

function renderStructuredWarnings(warnings: readonly ProjectMaterialWarning[], buttons = false): string {
  if (warnings.length === 0) return `<p class="materials-warning-empty">Bez materiálových varovaní.</p>`;
  return warnings.map((warning) => {
    const content = `<span class="materials-warning__icon" aria-hidden="true">${warning.severity === "error" ? "!" : warning.severity === "info" ? "i" : "&#9888;"}</span><span><strong>${escapeHtml(warning.title)}</strong><small>${escapeHtml(warning.description)}</small></span>`;
    if (buttons && warning.affectedCategory) {
      return `<button type="button" class="materials-warning materials-warning--${warning.severity}" data-material-warning-category="${warning.affectedCategory}">${content}</button>`;
    }
    return `<div class="materials-warning materials-warning--${warning.severity}">${content}</div>`;
  }).join("");
}

function setInputError(container: HTMLElement, input: HTMLInputElement, message: string | null): void {
  const category = input.dataset.materialCategory;
  const field = input.dataset.materialIdField;
  if (!category || !field) return;
  const target = container.querySelector<HTMLElement>(`[data-material-field-error="${category}:${field}"]`);
  if (target) target.textContent = message ?? "";
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function assignmentSnapshot(assignment: ProjectMaterialAssignment | null | undefined) {
  if (!assignment) return undefined;
  return assignment.kind === "material" ? assignment.snapshots.material : assignment.snapshots.component;
}

function quantityFor(view: ProjectMaterialsView, category: MaterialAssignmentCategory) {
  const definition = MATERIAL_ASSIGNMENT_CATEGORIES.find((candidate) => candidate.category === category)!;
  const matching = view.quantities.filter((quantity) => quantity.category === category);
  return {
    quantity: matching.reduce((total, quantity) => total + (Number.isFinite(quantity.quantity) ? quantity.quantity : 0), 0),
    pieces: matching.reduce((total, quantity) => total + (Number.isFinite(quantity.pieces) ? quantity.pieces ?? 0 : 0), 0),
    unit: matching[0]?.unit ?? definition.quantityUnit
  };
}

function formatQuantity(value: number, unit: string): string {
  const suffix = unit === "m2" ? "m²" : unit === "lm" ? "bm" : unit === "pcs" ? "ks" : unit;
  return `${formatNumber(value)} ${escapeHtml(suffix)}`.trim();
}

function formatUnitPrice(
  value: number | null,
  currency: string,
  unit?: string,
  displayCurrency?: PriceCurrency
): string {
  if (value == null) return "Cena nezadaná";
  const suffix = unit === "m2" ? "m²" : unit === "lm" ? "bm" : unit === "pcs" ? "ks" : unit ?? "jedn.";
  const targetCurrency = displayCurrency ?? (isPriceCurrency(currency) ? currency : null);
  if (!targetCurrency || !isPriceCurrency(currency)) return `${formatNumber(value)} ${currency} / ${suffix}`;
  return `${formatNumber(convertPriceCurrency(value, currency, targetCurrency))} ${targetCurrency} / ${suffix}`;
}

function categoryIcon(category: MaterialAssignmentCategory): string {
  if (["corpus", "front", "worktop", "plinth", "back", "drawer_bottom"].includes(category)) return "&#9635;";
  if (category === "edge_front" || category === "edge_other") return "&#9673;";
  return "&#9881;";
}

function isProjectMaterialsView(input: ProjectMaterialUsageSummary | ProjectMaterialsView): input is ProjectMaterialsView {
  return "assignments" in input && "priceSource" in input;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Materiál sa nepodarilo uložiť.";
}

/* Legacy read-only renderer kept until workspace navigation is wired to the interactive controller. */
function renderLegacyProjectMaterialsPanel(summary: ProjectMaterialUsageSummary): string {
  const visibleGroups = summary.groups.filter((group) => group.alwaysVisible || group.items.length > 0);
  return `
    <header class="materials-phase__header">
      <div>
        <h1>Materiály a komponenty</h1>
        <p>Reálny súhrn spotreby z aktuálneho projektu. Ceny a cenníky sa v tejto fáze nezobrazujú.</p>
      </div>
      <div class="materials-phase__metrics" aria-label="Súhrn projektu">
        ${metric("Dosky", `${formatNumber(summary.boardPieces)} ks`)}
        ${metric("Plocha dosiek", `${formatNumber(summary.boardAreaM2)} m²`)}
        ${metric("Hrany", `${formatNumber(summary.edgeLengthLm)} bm`)}
        ${metric("Kovanie", `${formatNumber(summary.hardwarePieces)} ks`)}
      </div>
    </header>
    <p class="materials-phase__notice">Množstvá vychádzajú z kusovníka projektu a obnovia sa pri ďalšom otvorení Materiálov.</p>
    <div class="materials-phase__content">
      <section class="materials-phase__groups" aria-label="Materiálové skupiny">
        ${summary.isEmpty ? emptyProject() : visibleGroups.map(renderLegacyGroup).join("")}
      </section>
      <aside class="materials-phase__overview" aria-label="Prehľad materiálov">
        <h2>Prehľad materiálov</h2>
        <p>Rozdelenie podľa výrobných skupín.</p>
        <dl>${visibleGroups.map(renderLegacyOverviewRow).join("")}</dl>
      </aside>
    </div>
  `;
}

function renderLegacyGroup(group: MaterialUsageGroup): string {
  const quantity = formatQuantity(group.quantity, group.unit);
  return `
    <article class="materials-group materials-group--${group.id}">
      <div class="materials-group__icon" aria-hidden="true">${categoryIcon(group.id === "edge" ? "edge_other" : group.id === "hardware" ? "other_component" : group.id)}</div>
      <div class="materials-group__body">
        <header>
          <div><h2>${escapeHtml(group.label)}</h2><p>${formatPieceLabel(group.pieces, group.itemLabel)} · ${quantity}</p></div>
          <strong>${quantity}</strong>
        </header>
        ${group.items.length ? `<div class="materials-group__rows">${group.items.map((item) => renderLegacyGroupItem(group, item)).join("")}</div>` : `<p class="materials-group__empty">V projekte zatiaľ nie sú žiadne položky.</p>`}
      </div>
    </article>
  `;
}

function renderLegacyGroupItem(group: MaterialUsageGroup, item: MaterialUsageGroup["items"][number]): string {
  const quantity = formatQuantity(item.quantity, group.unit);
  return `
    <div class="materials-group__row">
      <span class="materials-group__swatch" aria-hidden="true"></span>
      <div><strong>${escapeHtml(item.displayName)}</strong><small>${escapeHtml(item.catalogId ?? "Materiál nie je priradený")} · ${escapeHtml(item.detail)}</small></div>
      <span>${formatNumber(item.pieces)} ks</span>
      <b>${quantity}</b>
    </div>
  `;
}

function renderLegacyOverviewRow(group: MaterialUsageGroup): string {
  return `<div><dt>${escapeHtml(group.label)}</dt><dd>${formatQuantity(group.quantity, group.unit)}<small>${formatMaterialCount(group.items.length)}</small></dd></div>`;
}

function metric(label: string, value: string): string {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function emptyProject(): string {
  return `<div class="materials-phase__empty"><strong>Projekt zatiaľ neobsahuje materiálové položky.</strong><p>Vlož modul alebo pracovnú dosku a po otvorení Materiálov sa tu zobrazí reálna spotreba.</p></div>`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 2 }).format(value);
}

function formatPieceLabel(count: number, label: string): string {
  const rounded = Math.round(count);
  if (label === "ks") return `${formatNumber(count)} ks`;
  if (label === "doska") return `${formatNumber(count)} ${slovakPlural(rounded, "doska", "dosky", "dosiek")}`;
  return `${formatNumber(count)} ${slovakPlural(rounded, "hrana", "hrany", "hrán")}`;
}

function formatMaterialCount(count: number): string {
  return `${formatNumber(count)} ${slovakPlural(count, "materiál", "materiály", "materiálov")}`;
}

function slovakPlural(count: number, singular: string, few: string, many: string): string {
  return count === 1 ? singular : count >= 2 && count <= 4 ? few : many;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
