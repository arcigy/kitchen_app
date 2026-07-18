import type {
  ProjectMarginGroupView,
  ProjectMarginItemView,
  ProjectMarginsView
} from "../layout/bom/projectMargins";
import {
  PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX,
  PROJECT_MARGIN_PERCENT_MAX
} from "../core/project-margins/project-margin-validation";

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
  expandedGroups?: ReadonlySet<string>;
  loadingMessage?: string | null;
  globalError?: string | null;
  inputsDisabled?: boolean;
  busyKeys?: ReadonlySet<string>;
};

export function mountProjectMarginsPanel(
  container: HTMLElement,
  initialView: ProjectMarginsView,
  actions: ProjectMarginsPanelActions
): ProjectMarginsPanelHandle {
  let view = structuredClone(initialView);
  let loadingMessage: string | null = null;
  let globalError: string | null = null;
  let inputsDisabled = true;
  let destroyed = false;
  const expandedGroups = new Set<string>();
  const busyKeys = new Set<string>();
  const pendingCommits = new Set<Promise<void>>();

  const render = () => {
    if (destroyed) return;
    const scrollTop = container.scrollTop;
    container.innerHTML = renderProjectMarginsPanel(view, {
      expandedGroups,
      loadingMessage,
      globalError,
      inputsDisabled,
      busyKeys
    });
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

  const onClick = (event: MouseEvent) => {
    const element = event.target instanceof Element ? event.target : null;

    const defaultSave = element?.closest<HTMLButtonElement>("[data-margin-default-save]");
    if (defaultSave) {
      const input = container.querySelector<HTMLInputElement>("[data-margin-default-input]");
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
      const input = container.querySelector<HTMLInputElement>("[data-margin-additional-labor-input]");
      if (!input) return;
      const additionalLaborCost = finiteInputValue(input, PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX);
      const committedValue = finiteCommittedValue(input);
      if (additionalLaborCost == null) {
        globalError = `Dodatočná práca musí byť číslo od 0 do ${formatNumber(PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX, 0)} €.`;
        render();
        return;
      }
      if (additionalLaborCost === committedValue) return;
      runCommit("labor", () => actions.onCommitAdditionalLabor({ additionalLaborCost, committedValue }), input);
      return;
    }

    const toggle = element?.closest<HTMLElement>("[data-margin-group-toggle]");
    if (toggle?.dataset.marginGroupToggle) {
      const groupId = toggle.dataset.marginGroupToggle;
      if (expandedGroups.has(groupId)) expandedGroups.delete(groupId);
      else expandedGroups.add(groupId);
      render();
      return;
    }

    const apply = element?.closest<HTMLButtonElement>("[data-margin-group-apply-all]");
    const groupId = apply?.dataset.marginGroupApplyAll;
    if (groupId) {
      const input = container.querySelector<HTMLInputElement>(`[data-margin-group-input="${cssEscape(groupId)}"]`);
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
      container.querySelector<HTMLButtonElement>("[data-margin-default-save]")?.click();
    } else if (input.dataset.marginAdditionalLaborInput !== undefined) {
      container.querySelector<HTMLButtonElement>("[data-margin-additional-labor-save]")?.click();
    } else if (input.dataset.marginGroupInput) {
      container.querySelector<HTMLButtonElement>(`[data-margin-group-apply-all="${cssEscape(input.dataset.marginGroupInput)}"]`)?.click();
    } else {
      input.blur();
    }
  };

  container.addEventListener("click", onClick);
  container.addEventListener("focusout", onFocusOut);
  container.addEventListener("keydown", onKeyDown);
  render();

  return {
    update(nextView) {
      view = structuredClone(nextView);
      loadingMessage = null;
      globalError = null;
      for (const groupId of [...expandedGroups]) {
        if (!view.groups.some((group) => group.category === groupId)) expandedGroups.delete(groupId);
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
      container.removeEventListener("click", onClick);
      container.removeEventListener("focusout", onFocusOut);
      container.removeEventListener("keydown", onKeyDown);
    }
  };
}

export function renderProjectMarginsPanel(view: ProjectMarginsView, state: RenderState = {}): string {
  const disabled = state.inputsDisabled || !view.editable;
  const busyKeys = state.busyKeys ?? new Set<string>();
  const expanded = state.expandedGroups ?? new Set<string>();
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
    <div class="margins-table-wrap" data-margin-groups>
      <table class="margins-table">
        <caption class="sr-only">Marže podľa materiálových a cenových skupín</caption>
        <thead><tr><th scope="col">Skupina</th><th scope="col">Náklad</th><th scope="col">Skupinová marža</th><th scope="col">Suma marže</th><th scope="col">Predajná cena</th><th scope="col">Stav</th></tr></thead>
        ${view.groups.map((group) => renderGroup(view, group, expanded.has(group.category), disabled, busyKeys)).join("")}
      </table>
    </div>
  </div>`;
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
      <div class="margins-project-control__editor"><div><input id="margin-additional-labor-input" type="number" min="0" max="${PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX}" step="0.01" inputmode="decimal" value="${numberInputValue(view.settings.additionalLaborCost)}" data-committed-value="${numberInputValue(view.settings.additionalLaborCost)}" data-margin-additional-labor-input ${laborDisabled ? "disabled" : ""} /><span aria-hidden="true">€</span></div><button type="button" data-margin-additional-labor-save ${laborDisabled ? "disabled" : ""}>${laborBusy ? "Ukladám…" : "Uložiť"}</button></div>
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
  expanded: boolean,
  disabled: boolean,
  busyKeys: ReadonlySet<string>
): string {
  const groupId = group.category;
  const controlsId = `margin-items-${safeDomId(groupId)}`;
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
  return `<tbody data-margin-group="${escapeHtml(groupId)}">
    <tr class="margins-group-row${group.missingPriceCount > 0 ? " margins-group-row--warning" : ""}">
      <th scope="row"><button type="button" class="margins-group-toggle" data-margin-group-toggle="${escapeHtml(groupId)}" aria-expanded="${expanded}" aria-controls="${controlsId}"><span class="margins-group-toggle__icon" aria-hidden="true">${expanded ? "−" : "+"}</span><span><strong>${escapeHtml(group.label)}</strong><small>${escapeHtml(group.description)} · ${formatNumber(group.items.length, 0)} položiek</small></span></button></th>
      <td>${formatCurrency(group.baseCost, view.currency)}</td>
      <td><div class="margins-group-control"><label class="sr-only" for="${inputId}">Skupinová marža ${escapeHtml(group.label)}</label><div><input id="${inputId}" type="number" min="0" max="${PROJECT_MARGIN_PERCENT_MAX}" step="0.01" inputmode="decimal" value="${numberInputValue(group.marginPercent)}" data-committed-value="${numberInputValue(group.marginPercent)}" data-margin-group-input="${escapeHtml(groupId)}" ${groupDisabled ? "disabled" : ""} /><span aria-hidden="true">%</span></div><div class="margins-group-control__actions"><button type="button" data-margin-group-apply-all="${escapeHtml(groupId)}" ${groupDisabled ? "disabled" : ""}>${busy ? "Ukladám…" : "Použiť na celú skupinu"}</button><button type="button" class="margins-group-reset" data-margin-group-reset="${escapeHtml(groupId)}" ${groupDisabled || !hasGroupOrItemOverride ? "disabled" : ""}>Obnoviť základnú</button></div>${group.overrideCount > 0 ? `<small>Prepíše aj ${formatNumber(group.overrideCount, 0)} vlastné marže.</small>` : ""}</div></td>
      <td>${formatCurrency(group.marginAmount, view.currency)}</td>
      <td><strong>${formatCurrency(group.finalPrice, view.currency)}</strong></td>
      <td><span class="margin-source margin-source--${group.missingPriceCount > 0 ? "missing" : group.overrideCount > 0 ? "override" : "group"}">${escapeHtml(stateLabel)}</span></td>
    </tr>
    ${expanded ? `<tr class="margins-group-details"><td colspan="6"><div id="${controlsId}" data-margin-group-items="${escapeHtml(groupId)}">${renderItemsTable(view, group, disabled, busyKeys)}</div></td></tr>` : ""}
  </tbody>`;
}

function renderItemsTable(
  view: ProjectMarginsView,
  group: ProjectMarginGroupView,
  disabled: boolean,
  busyKeys: ReadonlySet<string>
): string {
  if (group.items.length === 0) return `<p class="margins-items-empty">V tejto skupine zatiaľ nie sú žiadne položky.</p>`;
  return `<div class="margins-items-wrap"><table class="margins-items-table"><caption class="sr-only">Jednotlivé položky skupiny ${escapeHtml(group.label)}</caption><thead><tr><th scope="col">Položka</th><th scope="col">Modul / rozsah</th><th scope="col">Materiál / komponent</th><th scope="col">Množstvo</th><th scope="col">Náklad</th><th scope="col">Marža</th><th scope="col">Suma marže</th><th scope="col">Predajná cena</th><th scope="col">Zdroj</th></tr></thead><tbody>${group.items.map((item) => renderItem(view, item, disabled, busyKeys)).join("")}</tbody></table></div>`;
}

function renderItem(
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
  return `<tr data-margin-item-id="${escapeHtml(itemId)}" class="${item.missingPrice ? "margins-item--missing" : ""}">
    <th scope="row"><strong>${escapeHtml(item.label)}</strong></th>
    <td>${escapeHtml(item.scopeLabel)}</td>
    <td>${escapeHtml(item.resourceLabel)}</td>
    <td>${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</td>
    <td>${item.baseCost == null ? "—" : formatCurrency(item.baseCost, view.currency)}</td>
    <td><div class="margins-item-control"><label class="sr-only" for="${inputId}">Marža ${escapeHtml(item.label)}</label><div><input id="${inputId}" type="number" min="0" max="${PROJECT_MARGIN_PERCENT_MAX}" step="0.01" inputmode="decimal" value="${numberInputValue(item.marginPercent)}" data-committed-value="${numberInputValue(item.marginPercent)}" data-margin-item-input="${escapeHtml(itemId)}" ${itemDisabled ? "disabled" : ""} /><span aria-hidden="true">%</span></div><button type="button" data-margin-item-reset="${escapeHtml(itemId)}" aria-label="Obnoviť skupinovú maržu pre ${escapeHtml(item.label)}" ${itemDisabled || item.source !== "override" ? "disabled" : ""}>${busy ? "Ukladám…" : "Obnoviť"}</button></div></td>
    <td>${item.marginAmount == null ? "—" : formatCurrency(item.marginAmount, view.currency)}</td>
    <td>${item.finalPrice == null ? "—" : formatCurrency(item.finalPrice, view.currency)}</td>
    <td><span class="margin-source margin-source--${item.missingPrice ? "missing" : item.source}" data-margin-source="${item.source}">${escapeHtml(sourceLabel)}</span></td>
  </tr>`;
}

function summarySelector(key: keyof ProjectMarginsView["summary"]): string {
  if (key === "baseCost") return "base-cost";
  if (key === "marginAmount") return "margin-amount";
  if (key === "combinedMarginPercent") return "combined-margin-percent";
  if (key === "finalPrice") return "final-price";
  return key;
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("sk-SK", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
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
