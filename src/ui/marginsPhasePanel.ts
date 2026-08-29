import type {
  ProjectMarginGroupView,
  ProjectMarginItemView,
  ProjectMarginsView
} from "../layout/bom/projectMargins";
import {
  PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX,
  PROJECT_MARGIN_PERCENT_MAX
} from "../core/project-margins/project-margin-validation";
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

export type ProjectMarginsPanelActions = {
  onCommitDefault: (request: ProjectMarginDefaultCommitRequest) => Promise<ProjectMarginCommitResult>;
  onCommitAdditionalLabor: (request: ProjectMarginLaborCommitRequest) => Promise<ProjectMarginCommitResult>;
  onApplyGroup: (request: ProjectMarginGroupCommitRequest) => Promise<ProjectMarginCommitResult>;
  onResetGroup: (groupId: string) => Promise<ProjectMarginCommitResult>;
  onCommitItem: (request: ProjectMarginItemCommitRequest) => Promise<ProjectMarginCommitResult>;
  onResetItem: (itemId: string) => Promise<ProjectMarginCommitResult>;
};

export type ProjectMarginsPanelHandle = {
  update: (view: ProjectMarginsView) => void;
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
  const busyKeys = new Set<string>();
  const pendingCommits = new Set<Promise<void>>();
  const footerContainer = options.footerContainer;

  const queryPanel = <T extends Element>(selector: string): T | null =>
    footerContainer?.querySelector<T>(selector) ?? container.querySelector<T>(selector);

  const render = () => {
    if (destroyed) return;
    const scrollTop = container.scrollTop;
    container.innerHTML = renderProjectMarginsPanel(view, {
      activeSettingsTab,
      selectedScopeId,
      loadingMessage,
      globalError,
      inputsDisabled,
      busyKeys
    });
    if (footerContainer) {
      footerContainer.replaceChildren();
      const summary = container.querySelector<HTMLElement>("[data-margin-summary]");
      const controls = container.querySelector<HTMLElement>(".margins-project-controls");
      const footer = document.createElement("div");
      footer.className = "margins-footer";
      if (summary) footer.appendChild(summary);
      if (controls) footer.appendChild(controls);
      footerContainer.appendChild(footer);
    }
    container.scrollTop = scrollTop;
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
    const committedValue = input?.dataset.committedValue ?? "";
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
        if (input?.isConnected) input.value = committedValue;
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

    const settingsTab = element?.closest<HTMLElement>("[data-margin-settings-tab]")?.dataset.marginSettingsTab;
    if (isMarginSettingsTab(settingsTab)) {
      activeSettingsTab = settingsTab;
      const kind = settingsTab === "modules" ? "module" : settingsTab === "additions" ? "addition" : null;
      selectedScopeId = kind ? marginScopes(view, kind)[0]?.id ?? null : null;
      render();
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
    if (!input?.matches("[data-margin-default-input], [data-margin-additional-labor-input], [data-margin-group-input], [data-margin-item-input]")) return;
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
    if (select?.dataset.marginScopeSelect !== "true") return;
    selectedScopeId = select.value || null;
    render();
  };

  container.addEventListener("click", onClick);
  container.addEventListener("focusout", onFocusOut);
  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("change", onChange);
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
    update(nextView) {
      view = structuredClone(nextView);
      loadingMessage = null;
      globalError = null;
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
  const phaseState = state.globalError ? "error" : state.loadingMessage ? "loading" : disabled ? "readonly" : "ready";
  return `<div class="margins-phase" data-margin-phase-state="${phaseState}" aria-labelledby="margins-phase-title">
    <header class="margins-phase__header">
      <div><span class="margins-phase__eyebrow">CENOVÁ PONUKA</span><h1 id="margins-phase-title">Marže projektu</h1><p>Skupinová marža platí pre celú kategóriu. Jednotlivé položky môžete následne upraviť samostatne.</p><small class="margins-phase__authority">${escapeHtml(view.priceAuthority)}</small></div>
      <div class="margins-phase__revision">Revízia <strong>${formatNumber(view.revision, 0)}</strong></div>
    </header>
    ${renderSummary(view)}
    ${renderProjectControls(view, disabled, busyKeys)}
    ${view.summary.missingPriceCount > 0 ? `<p class="margins-phase__warning" role="alert">${formatNumber(view.summary.missingPriceCount, 0)} položiek nemá cenu. Nie sú zahrnuté do úplného výsledku.</p>` : ""}
    ${view.warnings.length > 0 ? `<details class="margins-phase__warnings"><summary>${formatNumber(view.warnings.length, 0)} cenových upozornení</summary><ul>${view.warnings.map((warning) => `<li>${escapeHtml(warning.message)}</li>`).join("")}</ul></details>` : ""}
    ${state.loadingMessage ? `<p class="margins-phase__status" data-margin-status role="status" aria-live="polite">${escapeHtml(state.loadingMessage)}</p>` : ""}
    ${state.globalError ? `<p class="margins-phase__status margins-phase__status--error" data-margin-error role="alert">${escapeHtml(state.globalError)}</p>` : ""}
    ${!view.editable ? `<p class="margins-phase__status">Marže sú iba na čítanie. Na úpravu nemáte oprávnenie.</p>` : ""}
    <div class="margins-settings-scroll" data-margin-settings-scroll>
      ${renderMarginSettingsTabs(activeSettingsTab)}
      ${activeSettingsTab === "modules"
        ? renderMarginScopeSettings(view, "module", state.selectedScopeId, disabled, busyKeys)
        : activeSettingsTab === "additions"
          ? renderMarginScopeSettings(view, "addition", state.selectedScopeId, disabled, busyKeys)
          : renderGeneralMarginSettings(view, disabled, busyKeys)}
    </div>
  </div>`;
}

function renderMarginSettingsTabs(active: MarginSettingsTab): string {
  const tab = (id: MarginSettingsTab, label: string) => `<button type="button" class="materials-settings-tab ${active === id ? "materials-settings-tab--active" : ""}" data-margin-settings-tab="${id}" aria-pressed="${active === id}">${label}</button>`;
  return `<nav class="materials-settings-tabs" aria-label="Nastavenia marží">${tab("general", "General settings")}${tab("modules", "Module settings")}${tab("additions", "Additions")}</nav>`;
}

function renderGeneralMarginSettings(
  view: ProjectMarginsView,
  disabled: boolean,
  busyKeys: ReadonlySet<string>
): string {
  return `<section class="materials-phase__groups margins-general-groups" data-margin-groups data-margin-settings-panel="general" aria-label="General settings">
    ${view.groups.map((group) => renderGroup(view, group, disabled, busyKeys)).join("")}
  </section>`;
}

function renderProjectControls(
  view: ProjectMarginsView,
  disabled: boolean,
  busyKeys: ReadonlySet<string>
): string {
  const defaultBusy = busyKeys.has("default");
  const laborBusy = busyKeys.has("labor");
  const defaultDisabled = disabled || defaultBusy;
  const laborDisabled = disabled || laborBusy;
  return `<section class="margins-project-controls" aria-label="Základné nastavenia marže">
    <div class="margins-project-control">
      <label for="margin-default-input"><strong>Základná marža projektu</strong><small>Fallback pre skupiny a položky bez vlastnej marže.</small></label>
      <div class="margins-project-control__editor"><div><input id="margin-default-input" type="number" min="0" max="${PROJECT_MARGIN_PERCENT_MAX}" step="0.01" inputmode="decimal" value="${numberInputValue(view.settings.defaultMarginPercent)}" data-committed-value="${numberInputValue(view.settings.defaultMarginPercent)}" data-margin-default-input ${defaultDisabled ? "disabled" : ""} /><span aria-hidden="true">%</span></div><button type="button" data-margin-default-save ${defaultDisabled ? "disabled" : ""}>${defaultBusy ? "Ukladám…" : "Uložiť"}</button></div>
    </div>
    <div class="margins-project-control">
      <label for="margin-additional-labor-input"><strong>Dodatočná práca</strong><small>Projektová práca navyše mimo práce vypočítanej z modulov.</small></label>
      <div class="margins-project-control__editor"><div><input id="margin-additional-labor-input" type="number" min="0" max="${PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX}" step="0.01" inputmode="decimal" value="${numberInputValue(view.settings.additionalLaborCost)}" data-committed-value="${numberInputValue(view.settings.additionalLaborCost)}" data-margin-additional-labor-input ${laborDisabled ? "disabled" : ""} /><span aria-hidden="true">${escapeHtml(view.currency)}</span></div><button type="button" data-margin-additional-labor-save ${laborDisabled ? "disabled" : ""}>${laborBusy ? "Ukladám…" : "Uložiť"}</button></div>
    </div>
  </section>`;
}

function renderSummary(view: ProjectMarginsView): string {
  const metrics: Array<[keyof ProjectMarginsView["summary"], string, string, boolean]> = [
    ["baseCost", "Náklady", formatCurrency(view.summary.baseCost, view.currency), false],
    ["marginAmount", "Suma marže", formatCurrency(view.summary.marginAmount, view.currency), false],
    ["combinedMarginPercent", "Kombinovaná marža", formatPercent(view.summary.combinedMarginPercent), false],
    ["finalPrice", "Predajná cena", formatCurrency(view.summary.finalPrice, view.currency), true]
  ];
  return `<section class="margins-summary" data-margin-summary aria-label="Cenový súhrn">
    ${metrics.map(([key, label, value, accent]) => `<div class="margins-summary__card${accent ? " margins-summary__card--accent" : ""}" data-margin-summary-value="${summarySelector(key)}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    <div class="margins-summary__card margins-summary__card--status" data-margin-summary-value="status"><span>Vlastné / bez ceny</span><strong>${formatNumber(view.summary.overrideCount, 0)} / ${formatNumber(view.summary.missingPriceCount, 0)}</strong></div>
  </section>`;
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
  return `<article class="materials-group margins-general-group materials-group--${escapeHtml(groupId)}${group.missingPriceCount > 0 ? " margins-general-group--warning" : ""}" data-margin-group="${escapeHtml(groupId)}">
    <div class="materials-group__icon" aria-hidden="true">${marginCategoryIcon(group.category)}</div>
    <div class="materials-group__body">
      <header><div><h2>${escapeHtml(group.label)}</h2><p>${escapeHtml(group.description)}</p></div><div class="materials-group__quantity"><strong>${formatCurrency(group.baseCost, view.currency)}</strong><small>${formatNumber(group.items.length, 0)} položiek</small></div></header>
      <div class="materials-group__selection margins-general-group__summary">
        <div><small>Stav</small><strong><span class="margin-source margin-source--${group.missingPriceCount > 0 ? "missing" : group.overrideCount > 0 ? "override" : "group"}">${escapeHtml(stateLabel)}</span></strong></div>
        <span><small>Suma marže</small><strong>${formatCurrency(group.marginAmount, view.currency)}</strong></span>
        <span><small>Predajná cena</small><strong>${formatCurrency(group.finalPrice, view.currency)}</strong></span>
      </div>
      <div class="margins-group-control margins-general-group__control"><label class="sr-only" for="${inputId}">Skupinová marža ${escapeHtml(group.label)}</label><div><input id="${inputId}" type="number" min="0" max="${PROJECT_MARGIN_PERCENT_MAX}" step="0.01" inputmode="decimal" value="${numberInputValue(group.marginPercent)}" data-committed-value="${numberInputValue(group.marginPercent)}" data-margin-group-input="${escapeHtml(groupId)}" ${groupDisabled ? "disabled" : ""} /><span aria-hidden="true">%</span></div><div class="margins-group-control__actions"><button type="button" data-margin-group-apply-all="${escapeHtml(groupId)}" ${groupDisabled ? "disabled" : ""}>${busy ? "Ukladám…" : "Použiť na celú skupinu"}</button><button type="button" class="margins-group-reset" data-margin-group-reset="${escapeHtml(groupId)}" ${groupDisabled || !hasGroupOrItemOverride ? "disabled" : ""}>Obnoviť základnú</button></div>${group.overrideCount > 0 ? `<small>Prepíše aj ${formatNumber(group.overrideCount, 0)} vlastné marže.</small>` : ""}</div>
    </div>
  </article>`;
}

function renderMarginScopeSettings(
  view: ProjectMarginsView,
  kind: MarginScopeKind,
  selectedScopeId: string | null | undefined,
  disabled: boolean,
  busyKeys: ReadonlySet<string>
): string {
  const scopes = marginScopes(view, kind);
  const selected = scopes.find((scope) => scope.id === selectedScopeId) ?? scopes[0];
  if (!selected) {
    return `<section class="materials-scope-empty" data-margin-settings-panel="${kind === "module" ? "modules" : "additions"}"><strong>${kind === "module" ? "V layoute zatiaľ nie je modul." : "V projekte zatiaľ nie sú additions."}</strong><p>Po vložení položky sa tu zobrazia jej cenové skupiny a marže.</p></section>`;
  }
  const groups = view.groups
    .map((group) => ({ group, items: selected.items.filter((item) => item.category === group.category) }))
    .filter(({ items }) => items.length > 0);
  return `<section class="materials-scope-settings margins-scope-settings" data-margin-settings-panel="${kind === "module" ? "modules" : "additions"}" aria-label="${escapeHtml(selected.label)}">
    <header><div><span>${kind === "module" ? "MODULE" : "ADDITION"}</span><h2>${escapeHtml(selected.label)}</h2><p>Položky dedia maržu z General settings. Každú môžete prepísať samostatne.</p></div>
    <label>Vybrať ${kind === "module" ? "modul" : "addition"}<select data-margin-scope-select="true">${scopes.map((scope) => `<option value="${escapeHtml(scope.id)}" ${scope.id === selected.id ? "selected" : ""}>${escapeHtml(scope.label)}</option>`).join("")}</select></label></header>
    <div class="materials-scope-groups">${groups.map(({ group, items }) => `<section class="materials-scope-group margins-scope-group" data-margin-scope-group="${escapeHtml(group.category)}"><h3>${escapeHtml(group.label)}</h3>${items.map((item) => renderScopeItem(view, item, disabled, busyKeys)).join("")}</section>`).join("")}</div>
  </section>`;
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
    <div class="margins-scope-item__price"><small>Náklad ${item.baseCost == null ? "—" : formatCurrency(item.baseCost, view.currency)} · marža ${item.marginAmount == null ? "—" : formatCurrency(item.marginAmount, view.currency)}</small><strong>Predajná cena ${item.finalPrice == null ? "—" : formatCurrency(item.finalPrice, view.currency)}</strong><span class="margin-source margin-source--${item.missingPrice ? "missing" : item.source}">${escapeHtml(sourceLabel)}</span></div>
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
