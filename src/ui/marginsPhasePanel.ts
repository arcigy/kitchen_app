import { preservePanelRenderState, type PhasePanelState } from "./panelRenderState";
import { recordCommercialTiming } from "../core/commercialDiagnostics";
import { matchesMarginSearch, matchesMarginText, type MarginSearchFilter } from "./marginSearch";
import { createPanelDrafts } from "./panelDrafts";
import type {
  ProjectMarginGroupView,
  ProjectMarginItemView,
  ProjectMarginsView
} from "../layout/bom/projectMargins";
import { t } from "../i18n";
import {
  PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX,
  PROJECT_MARGIN_PERCENT_MAX
} from "../core/project-margins/project-margin-validation";
import {
  normalizeProjectManufacturingSettings,
  type ProjectManufacturingSettings
} from "../core/project-manufacturing/project-manufacturing-types";
import { getAppContextMenuController, type ContextMenuItem } from "./contextMenu";

export type { ProjectMarginsView } from "../layout/bom/projectMargins";

export type ProjectMarginCommitResult = {
  ok: boolean;
  error?: string;
};

export type ProjectMarginGroupCommitRequest = {
  groupId: string;
  marginPercent: number;
  committedValue: number;
};

export type ProjectMarginItemCommitRequest = {
  itemId: string;
  marginPercent: number;
  committedValue: number;
};

export type ProjectMarginDefaultCommitRequest = {
  marginPercent: number;
  committedValue: number;
};

export type ProjectMarginLaborCommitRequest = {
  additionalLaborCost: number;
  committedValue: number;
};

export type ProjectMarginManufacturingCommitRequest = {
  manufacturing: ProjectManufacturingSettings;
};

export type ProjectMarginsPanelActions = {
  onCreateBacksplash?: () => Promise<void>;
  onCommitConstructionLabor?: (percent: number) => Promise<ProjectMarginCommitResult>;
  onCommitDefault: (request: ProjectMarginDefaultCommitRequest) => Promise<ProjectMarginCommitResult>;
  onCommitAdditionalLabor: (request: ProjectMarginLaborCommitRequest) => Promise<ProjectMarginCommitResult>;
  onCommitManufacturing?: (request: ProjectMarginManufacturingCommitRequest) => Promise<ProjectMarginCommitResult>;
  onApplyGroup: (request: ProjectMarginGroupCommitRequest) => Promise<ProjectMarginCommitResult>;
  onResetGroup: (groupId: string) => Promise<ProjectMarginCommitResult>;
  onCommitItem: (request: ProjectMarginItemCommitRequest) => Promise<ProjectMarginCommitResult>;
  onResetItem: (itemId: string) => Promise<ProjectMarginCommitResult>;
  onOpenModuleLabor?: (instanceId: string) => void | Promise<void>;
};

export type ProjectMarginsPanelHandle = {
  update: (view: ProjectMarginsView, state?: PhasePanelState) => void;
  setLoading: (loading: boolean, message?: string) => void;
  setInputsDisabled: (disabled: boolean) => void;
  setGlobalError: (message: string | null) => void;
  flushPending: () => Promise<void>;
  destroy: () => void;
};

type RenderState = {
  activeSettingsTab?: MarginSettingsTab;
  selectedScopeId?: string | null;
  loadingMessage?: string | null;
  globalError?: string | null;
  inputsDisabled?: boolean;
  busyKeys?: ReadonlySet<string>;
  searchQuery?: string;
  searchFilter?: MarginSearchFilter;
  projectControlsOpen?: boolean;
};

type MarginSettingsTab = "general" | "modules" | "additions";
type MarginScopeKind = "module" | "addition";

type MarginScopeView = {
  id: string;
  label: string;
  items: ProjectMarginItemView[];
};

export function mountProjectMarginsPanel(
  container: HTMLElement,
  initialView: ProjectMarginsView,
  actions: ProjectMarginsPanelActions,
  options: { footerContainer?: HTMLElement } = {}
): ProjectMarginsPanelHandle {
  let view = structuredClone(initialView);
  let loadingMessage: string | null = null;
  let globalError: string | null = null;
  let inputsDisabled = true;
  let destroyed = false;
  let activeSettingsTab: MarginSettingsTab = "general";
  let selectedScopeId: string | null = null;
  let searchQuery = "";
  let searchFilter: MarginSearchFilter = "all";
  let projectControlsOpen = false;
  const drafts = createPanelDrafts(container);
  const busyKeys = new Set<string>();
  const pendingCommits = new Set<Promise<void>>();
  const footerContainer = options.footerContainer;

  const queryPanel = <T extends Element>(selector: string): T | null =>
    footerContainer?.querySelector<T>(selector) ?? container.querySelector<T>(selector);
  const resetScroll = () => {
    const scroll = container.querySelector<HTMLElement>("[data-margin-settings-scroll]");
    if (scroll) scroll.scrollTop = 0;
  };

  const render = () => {
    if (destroyed) return;
    const projectControls = container.querySelector<HTMLDetailsElement>("[data-margin-project-controls]");
    if (projectControls) projectControlsOpen = projectControls.open;
    const startedAt = performance.now();
    drafts.capture();
    const restore = preservePanelRenderState(container, footerContainer);
    container.innerHTML = renderProjectMarginsPanel(view, {
      activeSettingsTab,
      selectedScopeId,
      loadingMessage,
      globalError,
      inputsDisabled,
      busyKeys,
      searchQuery,
      searchFilter,
      projectControlsOpen
    });
    if (footerContainer) {
      footerContainer.replaceChildren();
      const summary = container.querySelector<HTMLElement>("[data-margin-summary]");
      const footer = document.createElement("div");
      footer.className = "margins-footer";
      if (summary) footer.appendChild(summary);
      footerContainer.appendChild(footer);
    }
    restore();
    drafts.restore();
    recordCommercialTiming("render", startedAt, "success");
  };

  const track = (operation: Promise<void>) => {
    pendingCommits.add(operation);
    void operation.finally(() => pendingCommits.delete(operation));
  };

  const runCommit = (
    key: string,
    operation: () => Promise<ProjectMarginCommitResult>,
    input?: HTMLInputElement
  ) => {
    if (busyKeys.has(key) || inputsDisabled || !view.editable) return;
    busyKeys.add(key);
    globalError = null;
    render();
    const pending = (async () => {
      let result: ProjectMarginCommitResult;
      try {
        result = await operation();
      } catch (error) {
        result = { ok: false, error: errorMessage(error, "Maržu sa nepodarilo uložiť.") };
      }
      if (destroyed) return;
      busyKeys.delete(key);
      if (!result.ok) {
        globalError = result.error ?? "Maržu sa nepodarilo uložiť. Pôvodná hodnota zostala zachovaná.";
        // Keep the entered draft so a failed save can be reviewed and retried.
      }
      render();
    })();
    track(pending);
  };

  const contextMenuItems = (target: HTMLElement): ContextMenuItem[] => {
    const itemElement = target.closest<HTMLElement>("[data-margin-item-id]");
    if (itemElement) {
      const itemId = itemElement.dataset.marginItemId;
      if (!itemId) return [];
      const items: ContextMenuItem[] = [{
        id: "margin-item-edit",
        label: "Edit item margin",
        execute: () => queryPanel<HTMLInputElement>(`[data-margin-item-input="${cssEscape(itemId)}"]`)?.focus()
      }];
      if (itemElement.dataset.marginSource === "override") {
        items.push({
          id: "margin-item-reset",
          label: "Use group margin",
          iconId: "resetDefaults",
          disabledReason: inputsDisabled || !view.editable ? "Margin editing is not available for this project." : undefined,
          execute: () => runCommit(`item:${itemId}`, () => actions.onResetItem(itemId))
        });
      }
      return items;
    }
    const groupElement = target.closest<HTMLElement>("[data-margin-group]");
    const groupId = groupElement?.dataset.marginGroup;
    if (groupId) {
      const group = view.groups.find((candidate) => candidate.category === groupId);
      const items: ContextMenuItem[] = [{
        id: "margin-group-edit",
        label: "Edit group margin",
        execute: () => queryPanel<HTMLInputElement>(`[data-margin-group-input="${cssEscape(groupId)}"]`)?.focus()
      }, {
        id: "margin-group-apply",
        label: "Apply to entire group",
        disabledReason: inputsDisabled || !view.editable ? "Margin editing is not available for this project." : undefined,
        execute: () => queryPanel<HTMLButtonElement>(`[data-margin-group-apply-all="${cssEscape(groupId)}"]`)?.click()
      }];
      if (group && (view.settings.groupMargins[group.category] !== undefined || group.overrideCount > 0)) {
        items.push({
          id: "margin-group-reset",
          label: "Reset group margin",
          iconId: "resetDefaults",
          disabledReason: inputsDisabled || !view.editable ? "Margin editing is not available for this project." : undefined,
          execute: () => runCommit(`group:${groupId}`, () => actions.onResetGroup(groupId))
        });
      }
      return items;
    }
    if (target.closest(".margins-project-control")) {
      const isLabor = !!target.closest("[data-margin-additional-labor-input], [data-margin-additional-labor-save]");
      return [{
        id: isLabor ? "margin-labor-edit" : "margin-default-edit",
        label: isLabor ? "Edit additional labor" : "Edit project default margin",
        execute: () => queryPanel<HTMLInputElement>(isLabor ? "[data-margin-additional-labor-input]" : "[data-margin-default-input]")?.focus()
      }];
    }
    return [];
  };

  const onClick = (event: MouseEvent) => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest("[data-margin-create-backsplash]") && !inputsDisabled && !loadingMessage) {
      void actions.onCreateBacksplash?.().catch(error => { globalError = errorMessage(error, "Zástenu sa nepodarilo otvoriť."); render(); }); return;
    }
    if (element?.closest("[data-margin-construction-save]")) {
      const input = queryPanel<HTMLInputElement>("[data-margin-construction-input]");
      if (!input || !actions.onCommitConstructionLabor) return;
      const percent = finiteInputValue(input, PROJECT_MARGIN_PERCENT_MAX);
      if (percent == null) { globalError = "Konštrukčná práca vyžaduje platné percento."; render(); return; }
      runCommit("construction", () => actions.onCommitConstructionLabor!(percent), input);
      return;
    }

    const openLabor = element?.closest<HTMLButtonElement>("[data-open-module-labor]");
    const instanceId = openLabor?.dataset.openModuleLabor;
    if (instanceId) {
      void actions.onOpenModuleLabor?.(instanceId);
      return;
    }

    const settingsTab = element?.closest<HTMLElement>("[data-margin-settings-tab]")?.dataset.marginSettingsTab;
    if (isMarginSettingsTab(settingsTab)) {
      activeSettingsTab = settingsTab;
      const kind = settingsTab === "modules" ? "module" : settingsTab === "additions" ? "addition" : null;
      selectedScopeId = kind ? marginScopes(view, kind)[0]?.id ?? null : null;
      render();
      resetScroll();
      return;
    }

    if (element?.closest("[data-margin-search-clear]")) {
      searchQuery = ""; searchFilter = "all"; render();
      resetScroll();
      queryPanel<HTMLInputElement>("[data-margin-search]")?.focus();
      return;
    }

    const defaultSave = element?.closest<HTMLButtonElement>("[data-margin-default-save]");
    if (defaultSave) {
      const input = queryPanel<HTMLInputElement>("[data-margin-default-input]");
      if (!input) return;
      const marginPercent = finiteInputValue(input, PROJECT_MARGIN_PERCENT_MAX);
      const committedValue = finiteCommittedValue(input);
      if (marginPercent == null) {
        globalError = `Základná marža musí byť číslo od 0 do ${PROJECT_MARGIN_PERCENT_MAX} %.`;
        render();
        return;
      }
      if (marginPercent === committedValue) return;
      runCommit("default", () => actions.onCommitDefault({ marginPercent, committedValue }), input);
      return;
    }

    const laborSave = element?.closest<HTMLButtonElement>("[data-margin-additional-labor-save]");
    if (laborSave) {
      const input = queryPanel<HTMLInputElement>("[data-margin-additional-labor-input]");
      if (!input) return;
      const additionalLaborCost = finiteInputValue(input, PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX);
      const committedValue = finiteCommittedValue(input);
      if (additionalLaborCost == null) {
        globalError = `Dodatočná práca musí byť číslo od 0 do ${formatNumber(PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX, 0)} ${view.currency}.`;
        render();
        return;
      }
      if (additionalLaborCost === committedValue) return;
      runCommit("labor", () => actions.onCommitAdditionalLabor({ additionalLaborCost, committedValue }), input);
      return;
    }

    const manufacturingSave = element?.closest<HTMLButtonElement>("[data-manufacturing-save]");
    if (manufacturingSave) {
      const manufacturing = manufacturingFromPanel(view, container);
      if (!manufacturing) {
        globalError = "Prerez a predmontáž musia byť nezáporné čísla. Prázdna hodnota znamená chýbajúce nastavenie.";
        render();
        return;
      }
      if (!actions.onCommitManufacturing) {
        globalError = "Ukladanie výrobného cenníka nie je v tejto relácii dostupné.";
        render();
        return;
      }
      runCommit("manufacturing", () => actions.onCommitManufacturing!({ manufacturing }));
      return;
    }

    const apply = element?.closest<HTMLButtonElement>("[data-margin-group-apply-all]");
    const groupId = apply?.dataset.marginGroupApplyAll;
    if (groupId) {
      const input = queryPanel<HTMLInputElement>(`[data-margin-group-input="${cssEscape(groupId)}"]`);
      if (!input) return;
      const marginPercent = finiteInputValue(input, PROJECT_MARGIN_PERCENT_MAX);
      const committedValue = finiteCommittedValue(input);
      if (marginPercent == null) {
        globalError = `Marža musí byť číslo od 0 do ${PROJECT_MARGIN_PERCENT_MAX} %.`;
        render();
        return;
      }
      runCommit(`group:${groupId}`, () => actions.onApplyGroup({ groupId, marginPercent, committedValue }), input);
      return;
    }

    const reset = element?.closest<HTMLButtonElement>("[data-margin-item-reset]");
    const itemId = reset?.dataset.marginItemReset;
    if (itemId) runCommit(`item:${itemId}`, () => actions.onResetItem(itemId));

    const resetGroup = element?.closest<HTMLButtonElement>("[data-margin-group-reset]");
    const resetGroupId = resetGroup?.dataset.marginGroupReset;
    if (resetGroupId) runCommit(`group:${resetGroupId}`, () => actions.onResetGroup(resetGroupId));
  };

  const commitItemInput = (input: HTMLInputElement) => {
    const itemId = input.dataset.marginItemInput;
    if (!itemId) return;
    const marginPercent = finiteInputValue(input, PROJECT_MARGIN_PERCENT_MAX);
    const committedValue = finiteCommittedValue(input);
    if (marginPercent == null) {
      globalError = `Marža musí byť číslo od 0 do ${PROJECT_MARGIN_PERCENT_MAX} %.`;
      render();
      return;
    }
    if (marginPercent === committedValue) return;
    runCommit(`item:${itemId}`, () => actions.onCommitItem({ itemId, marginPercent, committedValue }), input);
  };

  const onFocusOut = (event: FocusEvent) => {
    const input = event.target as HTMLInputElement | null;
    if (input?.dataset.marginItemInput) commitItemInput(input);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const input = event.target as HTMLInputElement | null;
    if (!input?.matches("[data-margin-default-input], [data-margin-additional-labor-input], [data-margin-construction-input], [data-margin-group-input], [data-margin-item-input]")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      input.value = input.dataset.committedValue ?? "";
      input.removeAttribute("aria-invalid");
      input.blur();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (input.dataset.marginDefaultInput !== undefined) {
      queryPanel<HTMLButtonElement>("[data-margin-default-save]")?.click();
    } else if (input.dataset.marginConstructionInput !== undefined) {
      queryPanel<HTMLButtonElement>("[data-margin-construction-save]")?.click();
    } else if (input.dataset.marginAdditionalLaborInput !== undefined) {
      queryPanel<HTMLButtonElement>("[data-margin-additional-labor-save]")?.click();
    } else if (input.dataset.marginGroupInput) {
      queryPanel<HTMLButtonElement>(`[data-margin-group-apply-all="${cssEscape(input.dataset.marginGroupInput)}"]`)?.click();
    } else {
      input.blur();
    }
  };

  const onChange = (event: Event) => {
    const select = event.target as HTMLSelectElement | null;
    if (select?.matches("[data-margin-filter]")) {
      if (select.value === "all" || select.value === "missing" || select.value === "override") searchFilter = select.value;
      render(); resetScroll(); return;
    }
    if (select?.dataset.marginScopeSelect !== "true") return;
    selectedScopeId = select.value || null;
    render();
    resetScroll();
  };

  const onInput = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.matches("[data-margin-search]")) return;
    searchQuery = event.target.value;
    render();
    resetScroll();
  };

  container.addEventListener("click", onClick);
  container.addEventListener("focusout", onFocusOut);
  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("change", onChange);
  container.addEventListener("input", onInput);
  footerContainer?.addEventListener("click", onClick);
  footerContainer?.addEventListener("focusout", onFocusOut);
  footerContainer?.addEventListener("keydown", onKeyDown);
  const unregisterContainerContextMenu = typeof document !== "undefined" && typeof HTMLElement !== "undefined" && container instanceof HTMLElement
    ? getAppContextMenuController().register(container, (request) => contextMenuItems(request.target))
    : () => {};
  const unregisterFooterContextMenu = footerContainer && typeof HTMLElement !== "undefined" && footerContainer instanceof HTMLElement
    ? getAppContextMenuController().register(footerContainer, (request) => contextMenuItems(request.target))
    : () => {};
  render();

  return {
    update(nextView, state = {}) {
      view = structuredClone(nextView);
      loadingMessage = state.loadingMessage ?? null;
      globalError = state.error ?? null;
      inputsDisabled = state.disabled ?? !view.editable;
      if (activeSettingsTab !== "general") {
        const kind = activeSettingsTab === "modules" ? "module" : "addition";
        if (!marginScopes(view, kind).some((scope) => scope.id === selectedScopeId)) selectedScopeId = null;
      }
      render();
    },
    setLoading(loading, message = "Načítavam marže projektu…") {
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
    async flushPending() {
      while (pendingCommits.size > 0) await Promise.allSettled([...pendingCommits]);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unregisterContainerContextMenu();
      unregisterFooterContextMenu();
      container.removeEventListener("click", onClick);
      container.removeEventListener("focusout", onFocusOut);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("change", onChange);
      container.removeEventListener("input", onInput);
      footerContainer?.removeEventListener("click", onClick);
      footerContainer?.removeEventListener("focusout", onFocusOut);
      footerContainer?.removeEventListener("keydown", onKeyDown);
    }
  };
}

export function renderProjectMarginsPanel(view: ProjectMarginsView, state: RenderState = {}): string {
  const disabled = state.inputsDisabled || !view.editable;
  const busyKeys = state.busyKeys ?? new Set<string>();
  const activeSettingsTab = state.activeSettingsTab ?? "general";
  const query = state.searchQuery ?? "";
  const filter = state.searchFilter ?? "all";
  const phaseState = state.globalError ? "error" : state.loadingMessage ? "refreshing" : disabled ? "readonly" : "ready";
  return `<div class="margins-phase" data-margin-phase-state="${phaseState}" aria-labelledby="margins-phase-title">
    <header class="margins-phase__header">
      <div><h1 id="margins-phase-title">Marže projektu</h1></div>
      <div class="margins-phase__revision">Revízia <strong>${formatNumber(view.revision, 0)}</strong></div>
    </header>
    <div data-phase-load-notice>
    ${state.loadingMessage ? `<p class="margins-phase__status" data-margin-status role="status" aria-live="polite">${escapeHtml(state.loadingMessage)}</p>` : ""}
    ${state.globalError ? `<p class="margins-phase__status margins-phase__status--error" data-margin-error role="alert">${escapeHtml(state.globalError)}</p>` : ""}
    </div>
    ${renderSummary(view)}
    <div class="margins-navigation">
      ${renderMarginSettingsTabs(activeSettingsTab)}
      <div class="margins-search-tools" role="search" aria-label="Vyhľadávanie marží">
        <input type="text" role="searchbox" data-margin-search data-committed-value="${escapeHtml(query)}" value="${escapeHtml(query)}" aria-label="Hľadať v maržiach" placeholder="Názov skrinky, dielca, materiálu alebo kategórie…" />
        <select data-margin-filter aria-label="Filtrovať cenové položky"><option value="all" ${filter === "all" ? "selected" : ""}>Všetky položky</option><option value="missing" ${filter === "missing" ? "selected" : ""}>Bez ceny</option><option value="override" ${filter === "override" ? "selected" : ""}>Vlastná marža</option></select>
        <button type="button" data-margin-search-clear ${!query && filter === "all" ? "disabled" : ""}>Vymazať filtre</button>
      </div>
    </div>
    <div class="margins-settings-scroll" data-margin-settings-scroll>
    ${activeSettingsTab === "general" ? renderProjectControls(view, disabled, busyKeys, state.projectControlsOpen ?? false) : ""}
    ${view.summary.missingPriceCount > 0 ? `<p class="margins-phase__warning" role="alert">${formatNumber(view.summary.missingPriceCount, 0)} položiek nemá cenu. Nie sú zahrnuté do úplného výsledku.</p>` : ""}
    ${renderMarginWarnings(view)}
    ${!view.editable ? `<p class="margins-phase__status">Marže sú iba na čítanie. Na úpravu nemáte oprávnenie.</p>` : ""}
      ${activeSettingsTab === "modules"
        ? renderMarginScopeSettings(view, "module", state.selectedScopeId, disabled, busyKeys, query, filter)
        : activeSettingsTab === "additions"
          ? renderMarginScopeSettings(view, "addition", state.selectedScopeId, disabled, busyKeys, query, filter)
          : renderGeneralMarginSettings(view, disabled, busyKeys, query, filter)}
    </div>
  </div>`;
}

function renderMarginSettingsTabs(active: MarginSettingsTab): string {
  const tab = (id: MarginSettingsTab, label: string) => `<button type="button" class="materials-settings-tab ${active === id ? "materials-settings-tab--active" : ""}" data-margin-settings-tab="${id}" aria-pressed="${active === id}">${label}</button>`;
  return `<nav class="materials-settings-tabs" aria-label="Nastavenia marží">${tab("general", "Projekt a kategórie")}${tab("modules", "Skrinky")}${tab("additions", "Dielce a doplnky")}</nav>`;
}

function renderMarginWarnings(view: ProjectMarginsView): string {
  if (!view.warnings.length) return "";
  const messages = new Map<string, number>();
  for (const warning of view.warnings) messages.set(warning.message, (messages.get(warning.message) ?? 0) + 1);
  return `<details class="margins-phase__warnings"><summary>${formatNumber(view.warnings.length, 0)} cenových upozornení</summary><ul>${[...messages].map(([message, count]) => `<li>${escapeHtml(message)}${count > 1 ? ` <span>(${count}×)</span>` : ""}</li>`).join("")}</ul></details>`;
}

function renderGeneralMarginSettings(
  view: ProjectMarginsView,
  disabled: boolean,
  busyKeys: ReadonlySet<string>,
  query: string,
  filter: MarginSearchFilter
): string {
  const groups = view.groups.filter(group => {
    if (filter === "missing" && !group.missingPriceCount) return false;
    if (filter === "override" && !group.overrideCount) return false;
    return matchesMarginText(query, group.label, group.description) || group.items.some(item => matchesMarginSearch(item, query, filter, group.label));
  });
  return `<section class="materials-phase__groups margins-general-groups" data-margin-groups data-margin-settings-panel="general" aria-label="General settings">
    <p class="margins-results" role="status">${groups.length} z ${view.groups.length} kategórií${query || filter !== "all" ? " · Filtre obmedzujú zobrazenie. Sadzba sa ukladá pre celú kategóriu." : " · Skupinová sadzba platí pre všetky jej položky."}</p>
    ${groups.length ? groups.map((group) => renderGroup(view, group, disabled, busyKeys)).join("") : renderSearchEmpty()}
  </section>`;
}

function renderProjectControls(
  view: ProjectMarginsView,
  disabled: boolean,
  busyKeys: ReadonlySet<string>,
  open: boolean
): string {
  const defaultBusy = busyKeys.has("default");
  const laborBusy = busyKeys.has("labor");
  const defaultDisabled = disabled || defaultBusy;
  const laborDisabled = disabled || laborBusy;
  const constructionBusy = busyKeys.has("construction");
  const constructionDisabled = disabled || constructionBusy;
  const manufacturingBusy = busyKeys.has("manufacturing");
  const manufacturingDisabled = disabled || manufacturingBusy;
  const manufacturing = normalizeProjectManufacturingSettings(view.settings.manufacturing);
  return `<details class="margins-project-settings" data-margin-project-controls ${open ? "open" : ""}>
    <summary><strong>Projektové sadzby</strong><span>Základná marža <b>${formatPercent(view.settings.defaultMarginPercent)}</b></span><span>Dodatočná práca <b>${formatCurrency(view.settings.additionalLaborCost, view.currency)}</b></span><span>Konštrukcia <b>${formatPercent(view.settings.constructionLaborPercent ?? 0)}</b></span><span>Prerez dosiek / hrán <b>${manufacturing.pricingMode === "configured" ? `${optionalNumberInputValue(manufacturing.boardWastePercent) || "—"} / ${optionalNumberInputValue(manufacturing.edgeWastePercent) || "—"} %` : "Podľa cenníka"}</b></span><span class="margins-project-settings__action">Upraviť</span></summary>
    <section class="margins-project-controls" aria-label="Základné nastavenia marže">
    <div class="margins-project-control">
      <label for="margin-default-input"><strong>Základná marža projektu</strong><small>Pre položky bez vlastnej alebo skupinovej sadzby.</small></label>
      <div class="margins-project-control__editor"><div><input id="margin-default-input" type="number" min="0" max="${PROJECT_MARGIN_PERCENT_MAX}" step="0.01" inputmode="decimal" value="${numberInputValue(view.settings.defaultMarginPercent)}" data-committed-value="${numberInputValue(view.settings.defaultMarginPercent)}" data-margin-default-input ${defaultDisabled ? "disabled" : ""} /><span aria-hidden="true">%</span></div><button type="button" data-margin-default-save ${defaultDisabled ? "disabled" : ""}>${defaultBusy ? "Ukladám…" : "Uložiť"}</button></div>
    </div>
    <div class="margins-project-control">
      <label for="margin-additional-labor-input"><strong>Dodatočná práca</strong><small>Účtovaná suma navyše za celý projekt, bez ďalšej prirážky.</small></label>
      <div class="margins-project-control__editor"><div><input id="margin-additional-labor-input" type="number" min="0" max="${PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX}" step="0.01" inputmode="decimal" value="${numberInputValue(view.settings.additionalLaborCost)}" data-committed-value="${numberInputValue(view.settings.additionalLaborCost)}" data-margin-additional-labor-input ${laborDisabled ? "disabled" : ""} /><span aria-hidden="true">${escapeHtml(view.currency)}</span></div><button type="button" data-margin-additional-labor-save ${laborDisabled ? "disabled" : ""}>${laborBusy ? "Ukladám…" : "Uložiť"}</button></div>
    </div>
    <div class="margins-project-control">
      <label for="margin-construction-input"><strong>Konštrukčná práca</strong><small title="Z predajnej ceny kuchyne bez spotrebičov, pred dodatočnou a konštrukčnou prácou. Spotrebiče označte pri úprave komponentu.">Percento z ceny kuchyne bez spotrebičov.</small></label>
      <div class="margins-project-control__editor"><div><input id="margin-construction-input" type="number" min="0" max="${PROJECT_MARGIN_PERCENT_MAX}" step="0.01" value="${numberInputValue(view.settings.constructionLaborPercent ?? 0)}" data-committed-value="${numberInputValue(view.settings.constructionLaborPercent ?? 0)}" data-margin-construction-input ${constructionDisabled ? "disabled" : ""} /><span>%</span></div><button type="button" data-margin-construction-save ${constructionDisabled ? "disabled" : ""}>${constructionBusy ? "Ukladám…" : "Uložiť"}</button></div>
      ${view.constructionLabor ? `<small>${view.constructionLabor.preliminary ? "Predbežný základ" : "Základ"}: ${formatCurrency(view.constructionLabor.baseAmount, view.currency)} · konštrukčná práca: ${formatCurrency(view.constructionLabor.amount, view.currency)}</small>` : ""}
    </div>
    <div class="margins-project-control" data-manufacturing-settings>
      <label><strong>Prerez materiálov</strong><small>Pripočíta sa raz k čistému množstvu. Predmontáž nastavíte pri vybranej skrinke.</small></label>
      <label><input type="checkbox" data-manufacturing-enabled ${manufacturing.pricingMode === "configured" ? "checked" : ""} ${manufacturingDisabled ? "disabled" : ""} /> Použiť explicitné sadzby</label>
      <div class="margins-project-control__editor"><div><label for="margin-board-waste">Dosky</label><input id="margin-board-waste" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Prerez dosiek %" value="${optionalNumberInputValue(manufacturing.boardWastePercent)}" data-manufacturing-board-waste ${manufacturingDisabled ? "disabled" : ""} /><span aria-hidden="true">%</span></div><div><label for="margin-edge-waste">Hrany</label><input id="margin-edge-waste" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Prerez hrán %" value="${optionalNumberInputValue(manufacturing.edgeWastePercent)}" data-manufacturing-edge-waste ${manufacturingDisabled ? "disabled" : ""} /><span aria-hidden="true">%</span></div><label class="margins-manufacturing-packaging">Baliaci materiál / m² <span><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Vypnuté" value="${optionalNumberInputValue(manufacturing.packagingRatePerM2?.currency === view.currency ? manufacturing.packagingRatePerM2.amount : undefined)}" data-manufacturing-packaging-rate ${manufacturingDisabled ? "disabled" : ""} /><span data-manufacturing-packaging-currency>${escapeHtml(view.currency)}</span></span>${manufacturing.packagingRatePerM2 && manufacturing.packagingRatePerM2.currency !== view.currency ? `<small>Uložená sadzba používa inú menu. Bez nového zadania zostane zachovaná. Novú sumu zadajte v ${escapeHtml(view.currency)}.</small>` : ""}</label><button type="button" data-manufacturing-save ${manufacturingDisabled ? "disabled" : ""}>${manufacturingBusy ? "Ukladám…" : "Uložiť výrobu"}</button></div>
      <small>Bez vyplnenej sadzby zostane cena označená ako neúplná. Hodnota 0 je platná sadzba.</small>
    </div>
    </section>
  </details>`;
}

function renderPreassemblyInputs(view: ProjectMarginsView, manufacturing: ProjectManufacturingSettings, disabled: boolean, scopeId: string): string {
  const modules = marginScopes(view, "module").filter(scope => scope.id === scopeId);
  if (modules.length === 0) return "";
  return `<div class="margins-preassembly-rates"><strong>Predmontáž vybranej skrinky</strong><small>Práca sa účtuje bez ďalšej prirážky. Pri pôvodných nastaveniach ide o sumu za všetky kusy.</small>${modules.map((scope) => {
    const instanceId = scope.id.replace(/^module:/, "");
    const labor = view.groups.find(group => group.category === "labor")?.items.find(item => item.scopeId === scope.id && item.itemId === "labor");
    if (labor?.laborManaged) return `<div>${escapeHtml(scope.label)} · ${formatCurrency(labor.baseCost / Math.max(1, labor.quantity), view.currency)} / skrinka × ${labor.quantity}. Sadzbu a preset upravíte vo vlastnostiach skrinky → Práca za modul.</div>`;
    const value = Object.prototype.hasOwnProperty.call(manufacturing.preassemblyByInstanceId, instanceId)
      ? manufacturing.preassemblyByInstanceId[instanceId]
      : null;
    return `<label>Predmontáž (${escapeHtml(view.currency)})<input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Zdediť z presetu alebo typu" value="${optionalNumberInputValue(value)}" data-preassembly-instance="${escapeHtml(instanceId)}" ${disabled ? "disabled" : ""} /></label><button type="button" data-manufacturing-save ${disabled ? "disabled" : ""}>Uložiť predmontáž</button>`;
  }).join("")}</div>`;
}

function optionalNumberInputValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? numberInputValue(value) : "";
}

function optionalRate(input: HTMLInputElement | null): number | null | "invalid" {
  if (!input || !input.value.trim()) return null;
  const parsed = Number(input.value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "invalid";
}

function manufacturingFromPanel(view: ProjectMarginsView, root: HTMLElement): ProjectManufacturingSettings | null {
  const current = normalizeProjectManufacturingSettings(view.settings.manufacturing);
  const boardInput = root.querySelector<HTMLInputElement>("[data-manufacturing-board-waste]");
  const edgeInput = root.querySelector<HTMLInputElement>("[data-manufacturing-edge-waste]");
  const boardWastePercent = boardInput ? optionalRate(boardInput) : current.boardWastePercent;
  const edgeWastePercent = edgeInput ? optionalRate(edgeInput) : current.edgeWastePercent;
  if (boardWastePercent === "invalid" || edgeWastePercent === "invalid") return null;
  const next = structuredClone(current);
  const enabled = root.querySelector<HTMLInputElement>("[data-manufacturing-enabled]");
  if (enabled) next.pricingMode = enabled.checked ? "configured" : "legacy";
  next.boardWastePercent = boardWastePercent;
  next.edgeWastePercent = edgeWastePercent;
  const packagingInput = root.querySelector<HTMLInputElement>("[data-manufacturing-packaging-rate]");
  if (packagingInput) {
    const packagingAmount = optionalRate(packagingInput);
    if (packagingAmount === "invalid") return null;
    if (packagingAmount === null) {
      if (!current.packagingRatePerM2 || current.packagingRatePerM2.currency === view.currency) delete next.packagingRatePerM2;
    } else next.packagingRatePerM2 = { amount: packagingAmount, currency: view.currency };
  }
  next.preassemblyByInstanceId = { ...current.preassemblyByInstanceId };
  for (const input of root.querySelectorAll<HTMLInputElement>("[data-preassembly-instance]")) {
    const rate = optionalRate(input);
    const id = input.dataset.preassemblyInstance;
    if (rate === "invalid" || !id) return null;
    if (rate !== null) next.preassemblyByInstanceId[id] = rate;
    else delete next.preassemblyByInstanceId[id];
  }
  return next;
}

function renderSummary(view: ProjectMarginsView): string {
  const contribution = view.summary.contribution;
  const metrics: Array<[keyof ProjectMarginsView["summary"], string, string, boolean]> = [
    ["baseCost", "Náklady", formatCurrency(contribution?.purchaseCost ?? view.summary.baseCost, view.currency), false],
    ["marginAmount", "Suma marže", formatCurrency(contribution?.contributionAmount ?? view.summary.marginAmount, view.currency), false],
    ["combinedMarginPercent", "Marža / nákupné náklady", contribution ? contribution.contributionPercent == null ? "— (bez nákupných nákladov)" : formatPercent(contribution.contributionPercent) : formatPercent(view.summary.combinedMarginPercent), false],
    ["finalPrice", "Predajná cena", formatCurrency(view.summary.finalPrice, view.currency), true]
  ];
  return `<section class="margins-summary${view.summary.sheetMaterial ? " margins-summary--sheet-metric" : ""}" data-margin-summary aria-label="Cenový súhrn">
    ${metrics.map(([key, label, value, accent]) => `<div class="margins-summary__card${accent ? " margins-summary__card--accent" : ""}" data-margin-summary-value="${summarySelector(key)}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    ${renderMarginPerM2(view)}
    <div class="margins-summary__card margins-summary__card--status" data-margin-summary-value="status"><span>Vlastné / bez ceny</span><strong>${formatNumber(view.summary.overrideCount, 0)} / ${formatNumber(view.summary.missingPriceCount, 0)}</strong></div>
  </section>`;
}

function renderMarginPerM2(view: ProjectMarginsView): string {
  if (!view.summary.sheetMaterial) return "";
  const { areaM2: sheetMaterialAreaM2, marginPerM2, unmeasuredBoardCount, minimumThicknessMm, preliminary } = view.summary.sheetMaterial;
  const areaKnown = Number.isFinite(sheetMaterialAreaM2);
  const value = marginPerM2 != null && Number.isFinite(marginPerM2)
    ? `${formatCurrency(marginPerM2, view.currency)} / m²` : "—";
  const area = areaKnown ? `${formatNumber(sheetMaterialAreaM2, 4)} m²` : "—";
  const explanation = marginPerM2 != null && preliminary
    ? t("Current calculated margin divided by known board area. Missing prices and measurements can change this value.")
    : !areaKnown || unmeasuredBoardCount > 0
    ? t("Some boards have no valid thickness or area. The result cannot be determined yet.")
    : sheetMaterialAreaM2 === 0 ? t("The project contains no boards at or above this thickness.")
    : marginPerM2 == null ? t("The result will be available after missing prices and pricing warnings are resolved.")
    : t("Total project margin, including additions and appliances, divided by board area at the stated minimum thickness. Purchasing waste is excluded.");
  return `<div class="margins-summary__card margins-summary__card--area" data-margin-summary-value="margin-per-m2" title="${escapeHtml(explanation)}">
    <span>${t("Margin per 1 m²")}</span><strong>${escapeHtml(value)}</strong>
    ${preliminary && marginPerM2 != null ? `<small data-margin-sheet-preliminary>${t("Preliminary value")}</small>` : ""}
    <small data-margin-sheet-area>${t("Board area")} ≥ ${formatNumber(minimumThicknessMm)} mm: ${escapeHtml(area)}</small>
    <small data-margin-sheet-explanation${marginPerM2 != null ? ' class="sr-only"' : ""}>${escapeHtml(explanation)}</small>
  </div>`;
}

function renderGroup(
  view: ProjectMarginsView,
  group: ProjectMarginGroupView,
  disabled: boolean,
  busyKeys: ReadonlySet<string>
): string {
  const groupId = group.category;
  const inputId = `margin-group-input-${safeDomId(groupId)}`;
  const busy = busyKeys.has(`group:${groupId}`);
  const groupDisabled = disabled || busy;
  const hasGroupOrItemOverride = view.settings.groupMargins[group.category] !== undefined || group.overrideCount > 0;
  const effectivePercent = group.combinedMarginPercent;
  const stateLabel = group.missingPriceCount > 0
    ? `${formatNumber(group.missingPriceCount, 0)} bez ceny`
    : group.overrideCount > 0
      ? `${formatNumber(group.overrideCount, 0)} vlastné · efektívne ${formatPercent(effectivePercent)}`
      : "Skupinová marža";
  const incompletePrice = group.missingPriceCount > 0 ? `<span class="material-price-warning" role="img" aria-label="Neúplná cena" title="Suma obsahuje iba ocenené položky. ${formatNumber(group.missingPriceCount, 0)} položiek nemá cenu.">!</span>` : "";
  return `<article class="materials-group margins-general-group materials-group--${escapeHtml(groupId)}${group.missingPriceCount > 0 ? " margins-general-group--warning" : ""}" data-margin-group="${escapeHtml(groupId)}">
    <div class="materials-group__icon" aria-hidden="true">${marginCategoryIcon(group.category)}</div>
    <div class="materials-group__body">
      <header><h2 title="${escapeHtml(group.description)}">${escapeHtml(group.label)}</h2><span class="margin-source margin-source--${group.missingPriceCount > 0 ? "missing" : group.overrideCount > 0 ? "override" : "group"}" title="${escapeHtml(stateLabel)}">${group.missingPriceCount > 0 || group.overrideCount > 0 ? escapeHtml(stateLabel) : `${formatNumber(group.items.length, 0)} položiek`}</span>${group.category === "backsplash" && group.items.length === 0 ? `<button type="button" data-margin-create-backsplash aria-label="Vytvoriť zástenu" title="Zástena nemá vytvorené dielce. Vytvoriť zástenu." ${disabled ? "disabled" : ""}>+</button>` : ""}</header>
      <div class="materials-group__selection margins-general-group__summary">
        <span><small>${group.category === "labor" ? "Sadzba práce" : "Náklady"}</small><strong>${formatCurrency(group.baseCost, view.currency)} ${incompletePrice}</strong></span>
        <span><small>Suma marže</small><strong>${formatCurrency(group.contribution?.contributionAmount ?? group.marginAmount, view.currency)}</strong></span>
        <span><small>Predajná cena</small><strong>${formatCurrency(group.finalPrice, view.currency)} ${incompletePrice}</strong></span>
      </div>
      <div class="margins-group-control margins-general-group__control"><label for="${inputId}">${group.category === "labor" ? "Prirážka" : "Marža"}<span class="sr-only"> ${escapeHtml(group.label)}</span></label><div><input id="${inputId}" type="number" min="0" max="${PROJECT_MARGIN_PERCENT_MAX}" step="0.01" inputmode="decimal" value="${numberInputValue(group.marginPercent)}" data-committed-value="${numberInputValue(group.marginPercent)}" data-margin-group-input="${escapeHtml(groupId)}" ${groupDisabled ? "disabled" : ""} /><span aria-hidden="true">%</span></div><div class="margins-group-control__actions"><button type="button" data-margin-group-apply-all="${escapeHtml(groupId)}" aria-label="Použiť na celú skupinu ${escapeHtml(group.label)}" title="Použiť na celú skupinu ${escapeHtml(group.label)}" ${groupDisabled ? "disabled" : ""}>${busy ? "Ukladám…" : "Použiť"}</button><button type="button" class="margins-group-reset" data-margin-group-reset="${escapeHtml(groupId)}" aria-label="Obnoviť základnú maržu ${escapeHtml(group.label)}" title="Obnoviť základnú maržu ${escapeHtml(group.label)}" ${groupDisabled || !hasGroupOrItemOverride ? "disabled" : ""}>↺</button></div>${group.overrideCount > 0 ? `<small>Prepíše aj ${formatNumber(group.overrideCount, 0)} vlastné marže.</small>` : ""}</div>
      ${group.category === "labor" ? "<small class=\"margins-general-group__note\">Práca patrí do marže pred mzdami a réžiou. Prirážka je navyše k sadzbe.</small>" : ""}
    </div>
  </article>`;
}

function renderMarginScopeSettings(
  view: ProjectMarginsView,
  kind: MarginScopeKind,
  selectedScopeId: string | null | undefined,
  disabled: boolean,
  busyKeys: ReadonlySet<string>,
  query: string,
  filter: MarginSearchFilter
): string {
  const allScopes = marginScopes(view, kind);
  const categories = new Map(view.groups.map(group => [group.category, group.label]));
  const scopes = allScopes.filter((scope, index) => scope.items.some(item => matchesMarginSearch(item, query, filter, categories.get(item.category), String(index + 1))));
  const selected = scopes.find((scope) => scope.id === selectedScopeId) ?? scopes[0];
  if (!selected) {
    return `<section class="materials-scope-empty" data-margin-settings-panel="${kind === "module" ? "modules" : "additions"}">${allScopes.length ? renderSearchEmpty() : `<strong>${kind === "module" ? "V layoute zatiaľ nie je skrinka." : "V projekte zatiaľ nie sú dielce ani doplnky."}</strong><p>Po vložení položky sa tu zobrazia jej cenové skupiny a marže.</p>`}</section>`;
  }
  const scopeNumber = allScopes.findIndex(scope => scope.id === selected.id) + 1;
  const groups = view.groups
    .map((group) => ({ group, items: selected.items.filter((item) => item.category === group.category && matchesMarginSearch(item, query, filter, group.label, String(scopeNumber))) }))
    .filter(({ items }) => items.length > 0);
  const selectedInstanceId = kind === "module" ? selected.id.replace(/^module:/, "") : null;
  return `<section class="materials-scope-settings margins-scope-settings" data-margin-settings-panel="${kind === "module" ? "modules" : "additions"}" aria-label="${escapeHtml(selected.label)}">
    <header><div><h2>${scopeNumber}. ${escapeHtml(selected.label)}</h2><p>Položky dedia maržu kategórie. Vlastnú maržu uložíte klávesom Enter alebo odchodom z poľa.</p></div>
    <label>Vybrať ${kind === "module" ? "skrinku" : "dielec alebo doplnok"}<select data-margin-scope-select="true">${scopes.map((scope) => `<option value="${escapeHtml(scope.id)}" ${scope.id === selected.id ? "selected" : ""}>${allScopes.indexOf(scope) + 1}. ${escapeHtml(scope.label)}</option>`).join("")}</select></label>${selectedInstanceId ? `<button type="button" data-open-module-labor="${escapeHtml(selectedInstanceId)}">Upraviť prácu za modul</button>` : ""}</header>
    <p class="margins-results" role="status">${scopes.length} z ${allScopes.length} ${kind === "module" ? "skriniek" : "dielcov a doplnkov"} · ${groups.reduce((count, group) => count + group.items.length, 0)} z ${selected.items.length} položiek vybraného objektu</p>
    ${kind === "module" ? renderPreassemblyInputs(view, normalizeProjectManufacturingSettings(view.settings.manufacturing), disabled || busyKeys.has("manufacturing"), selected.id) : ""}
    <div class="materials-scope-groups">${groups.map(({ group, items }) => `<section class="materials-scope-group margins-scope-group" data-margin-scope-group="${escapeHtml(group.category)}"><h3>${escapeHtml(group.label)}</h3>${items.map((item) => renderScopeItem(view, item, disabled, busyKeys)).join("")}</section>`).join("")}</div>
  </section>`;
}

function renderSearchEmpty(): string {
  return `<div class="margins-search-empty"><strong>Nenašli sa žiadne položky.</strong><p>Skúste kratší názov alebo odstráňte filter stavu.</p><button type="button" data-margin-search-clear>Vymazať filtre</button></div>`;
}

function renderScopeItem(
  view: ProjectMarginsView,
  item: ProjectMarginItemView,
  disabled: boolean,
  busyKeys: ReadonlySet<string>
): string {
  const itemId = item.targetId;
  const busy = busyKeys.has(`item:${itemId}`);
  const itemDisabled = disabled || busy;
  const inputId = `margin-item-input-${safeDomId(itemId)}`;
  const sourceLabel = item.missingPrice ? "Chýba cena" : item.source === "override" ? "Vlastná marža" : item.source === "group" ? "Zo skupiny" : "Predvolená";
  return `<article class="materials-scope-item margins-scope-item${item.missingPrice ? " margins-item--missing" : ""}" data-margin-item-id="${escapeHtml(itemId)}" data-margin-source="${item.source}">
    <div class="margins-scope-item__identity"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.resourceLabel)} · ${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</small></div>
    <div class="margins-scope-item__price"><small>Náklad ${item.baseCost == null ? "—" : formatCurrency(item.contribution?.purchaseCost ?? item.baseCost, view.currency)} · marža ${item.marginAmount == null ? "—" : formatCurrency(item.contribution?.contributionAmount ?? item.marginAmount, view.currency)}</small><strong>Predajná cena ${item.finalPrice == null ? "—" : formatCurrency(item.finalPrice, view.currency)}</strong><span class="margin-source margin-source--${item.missingPrice ? "missing" : item.source}">${escapeHtml(sourceLabel)}</span></div>
    <div class="margins-item-control"><label class="sr-only" for="${inputId}">Marža ${escapeHtml(item.label)}</label><div><input id="${inputId}" type="number" min="0" max="${PROJECT_MARGIN_PERCENT_MAX}" step="0.01" inputmode="decimal" value="${numberInputValue(item.marginPercent)}" data-committed-value="${numberInputValue(item.marginPercent)}" data-margin-item-input="${escapeHtml(itemId)}" ${itemDisabled ? "disabled" : ""} /><span aria-hidden="true">%</span></div><button type="button" data-margin-item-reset="${escapeHtml(itemId)}" aria-label="Obnoviť skupinovú maržu pre ${escapeHtml(item.label)}" ${itemDisabled || item.source !== "override" ? "disabled" : ""}>${busy ? "Ukladám…" : "Obnoviť"}</button></div>
  </article>`;
}

function marginScopes(view: ProjectMarginsView, kind: MarginScopeKind): MarginScopeView[] {
  const scopes = new Map<string, MarginScopeView>();
  for (const group of view.groups) {
    for (const item of group.items) {
      if (marginScopeKind(item.scopeId) !== kind) continue;
      const scope = scopes.get(item.scopeId) ?? { id: item.scopeId, label: item.scopeLabel, items: [] };
      scope.items.push(item);
      scopes.set(item.scopeId, scope);
    }
  }
  return [...scopes.values()];
}

function marginScopeKind(scopeId: string): MarginScopeKind | null {
  if (scopeId.startsWith("module:")) return "module";
  if (scopeId.startsWith("addition:")) return "addition";
  return null;
}

function isMarginSettingsTab(value: string | undefined): value is MarginSettingsTab {
  return value === "general" || value === "modules" || value === "additions";
}

function marginCategoryIcon(category: ProjectMarginGroupView["category"]): string {
  if (["corpus", "front", "worktop", "plinth", "back", "drawer_bottom"].includes(category)) return "&#9635;";
  if (category === "edge_front" || category === "edge_other") return "&#9673;";
  if (category === "labor") return "&#9638;";
  return "&#9881;";
}

function summarySelector(key: keyof ProjectMarginsView["summary"]): string {
  if (key === "baseCost") return "base-cost";
  if (key === "marginAmount") return "margin-amount";
  if (key === "combinedMarginPercent") return "combined-margin-percent";
  if (key === "finalPrice") return "final-price";
  return key;
}

function formatCurrency(value: number, currency: ProjectMarginsView["currency"]): string {
  try {
    return new Intl.NumberFormat(currency === "CZK" ? "cs-CZ" : "sk-SK", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${formatNumber(value, 2)} ${currency}`;
  }
}

function formatPercent(value: number): string {
  return `${formatNumber(value, 2)} %`;
}

function formatNumber(value: number, digits = 3): string {
  return new Intl.NumberFormat("sk-SK", { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
}

function numberInputValue(value: number): string {
  return String(Number.isFinite(value) && value >= 0 ? value : 0);
}

function finiteInputValue(input: HTMLInputElement, maximum: number): number | null {
  if (!input.value.trim()) return null;
  const value = Number(input.value);
  return Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
}

function finiteCommittedValue(input: HTMLInputElement): number {
  const value = Number(input.dataset.committedValue);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function cssEscape(value: string): string {
  const escape = globalThis.CSS?.escape;
  return escape ? escape(value) : value.replace(/["\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
