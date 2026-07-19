import {
  collectProjectMaterialCopyCandidates,
  resolveProjectMaterialCopyCandidate,
  type ProjectMaterialCopyCandidate
} from "../core/project-materials/project-material-copy";
import { resolveEffectiveProjectMaterialAssignment } from "../core/project-materials/project-material-assignment-resolution";
import { getMaterialAssignmentCategoryDefinition } from "../core/project-materials/project-material-business";
import type {
  MaterialAssignmentCategory,
  ProjectMaterialAssignment,
  ProjectMaterialScope,
  ProjectMaterialScopeItem,
  ProjectMaterialsView
} from "../core/project-materials/project-material-types";
import { PROJECT_MARGIN_PERCENT_MAX } from "../core/project-margins/project-margin-validation";
import type { ProjectMarginItemView, ProjectMarginsView } from "../layout/bom/projectMargins";
import {
  copyProjectMaterialAssignment,
  loadProjectMaterials,
  type CopyProjectMaterialAssignmentRequest
} from "./projectMaterialsApi";
import {
  loadProjectMargins,
  updateProjectMarginItem,
  type UpdateProjectMarginItemRequest
} from "./projectMarginsApi";

export type ModuleCommercialPropsApi = {
  loadMaterials: (projectId: string, signal?: AbortSignal) => Promise<ProjectMaterialsView>;
  copyMaterial: (
    projectId: string,
    request: CopyProjectMaterialAssignmentRequest,
    signal?: AbortSignal
  ) => Promise<ProjectMaterialsView>;
  loadMargins: (projectId: string, signal?: AbortSignal) => Promise<ProjectMarginsView>;
  updateMargin: (
    projectId: string,
    request: UpdateProjectMarginItemRequest,
    signal?: AbortSignal
  ) => Promise<ProjectMarginsView>;
};

export type ModuleCommercialPropsControllerArgs = {
  getProjectId: () => string | null;
  getModuleScope: (instanceId: string) => ProjectMaterialScope | null;
  ensureProjectSaved?: () => Promise<void>;
  onMaterialsChanged?: (view: ProjectMaterialsView) => void;
  onMarginsChanged?: (view: ProjectMarginsView) => void;
  copyText?: (text: string) => Promise<void>;
  api?: Partial<ModuleCommercialPropsApi>;
};

export type ModuleCommercialPropsHandle = {
  mount: (host: HTMLElement, instanceId: string) => void;
  flushPending: () => Promise<void>;
  destroy: () => void;
};

type PanelState = {
  instanceId: string;
  scope: ProjectMaterialScope | null;
  materials: ProjectMaterialsView | null;
  margins: ProjectMarginsView | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  busyKey: string | null;
};

const DEFAULT_API: ModuleCommercialPropsApi = {
  loadMaterials: loadProjectMaterials,
  copyMaterial: copyProjectMaterialAssignment,
  loadMargins: loadProjectMargins,
  updateMargin: updateProjectMarginItem
};

function assignmentSnapshot(assignment: ProjectMaterialAssignment | null) {
  return assignment?.kind === "material"
    ? assignment.snapshots.material ?? null
    : assignment?.snapshots.component ?? null;
}

function assignmentDisplayName(assignment: ProjectMaterialAssignment | null): string {
  const snapshot = assignmentSnapshot(assignment);
  return snapshot?.definition.displayName || snapshot?.definition.name || "";
}

function itemKey(item: Pick<ProjectMaterialScopeItem, "id" | "category">): string {
  return `${item.category}:${item.id}`;
}

export function findModuleMarginItem(
  view: ProjectMarginsView | null,
  scopeId: string,
  item: Pick<ProjectMaterialScopeItem, "id" | "category">
): ProjectMarginItemView | null {
  if (!view) return null;
  for (const group of view.groups) {
    const match = group.items.find((candidate) =>
      candidate.scopeId === scopeId && candidate.itemId === item.id && candidate.category === item.category
    );
    if (match) return match;
  }
  return null;
}

function moduleScope(
  materials: ProjectMaterialsView | null,
  fallback: ProjectMaterialScope | null,
  instanceId: string
): ProjectMaterialScope | null {
  return materials?.scopes?.find((scope) => scope.id === `module:${instanceId}`) ?? fallback;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function parseMargin(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= PROJECT_MARGIN_PERCENT_MAX ? parsed : null;
}

function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("sk-SK", { maximumFractionDigits: digits }).format(value);
}

function formatMoney(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(currency === "CZK" ? "cs-CZ" : "sk-SK", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${formatNumber(value)} ${currency}`;
  }
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character] ?? character);
}

function renderCandidateOptions(candidates: readonly ProjectMaterialCopyCandidate[]): string {
  return candidates.map((candidate) =>
    `<option value="${escapeHtml(candidate.searchLabel)}">${escapeHtml(candidate.catalogCode)}</option>`
  ).join("");
}

export function renderModuleCommercialProps(state: PanelState): string {
  const scope = state.scope;
  const status = state.loading
    ? `<p class="module-commercial-props__status" role="status">Načítavam projektové materiály a marže…</p>`
    : state.error
      ? `<p class="module-commercial-props__status module-commercial-props__status--error" role="alert">${escapeHtml(state.error)}</p>`
      : state.notice
        ? `<p class="module-commercial-props__status module-commercial-props__status--ok" role="status">${escapeHtml(state.notice)}</p>`
        : "";
  if (!scope) {
    return `<section class="module-commercial-props" data-module-commercial-props>
      <header><h3>Materiály a marže</h3><p>Projektové materiály, nákupná cena a marža vybraného modulu.</p></header>
      ${status || '<p class="module-commercial-props__status">Modul nemá dostupný cenový BOM.</p>'}
    </section>`;
  }

  const categories = [...new Set(scope.items.map((item) => item.category))];
  return `<section class="module-commercial-props" data-module-commercial-props data-module-commercial-scope="${escapeHtml(scope.id)}">
    <header><h3>Materiály a marže</h3><p>Vyberte materiál použitý v tomto projekte a upravte maržu konkrétnej časti.</p></header>
    ${status}
    <div class="module-commercial-props__groups">
      ${categories.map((category, categoryIndex) => {
        const definition = getMaterialAssignmentCategoryDefinition(category);
        const items = scope.items.filter((item) => item.category === category);
        return `<details class="module-commercial-props__group" ${categoryIndex === 0 ? "open" : ""}>
          <summary>${escapeHtml(definition.label)} <span>${items.length}</span></summary>
          ${items.map((item, index) => renderCommercialItem(state, scope, item, index)).join("")}
        </details>`;
      }).join("")}
    </div>
  </section>`;
}

function renderCommercialItem(
  state: PanelState,
  scope: ProjectMaterialScope,
  item: ProjectMaterialScopeItem,
  index: number
): string {
  const effective = state.materials
    ? resolveEffectiveProjectMaterialAssignment(state.materials.assignments.assignments, scope.id, item)
    : { assignmentId: "", assignment: null, source: null };
  const snapshot = assignmentSnapshot(effective.assignment);
  const displayName = assignmentDisplayName(effective.assignment);
  const candidates = state.materials
    ? collectProjectMaterialCopyCandidates(state.materials.assignments.assignments, item.category)
    : [];
  const margin = findModuleMarginItem(state.margins, scope.id, item);
  const key = itemKey(item);
  const materialBusy = state.busyKey === `material:${key}`;
  const marginBusy = state.busyKey === `margin:${key}`;
  const listId = `module-material-options-${safeDomId(scope.id)}-${safeDomId(key)}-${index}`;
  const sourceLabel = effective.source === "override" ? "Vlastné" : effective.source === "general" ? "Zdedené" : "Nepriradené";
  const materialDisabled = state.loading || !!state.busyKey || !state.materials || candidates.length === 0;
  const marginDisabled = state.loading || !!state.busyKey || !margin || !state.margins?.editable;
  return `<article class="module-commercial-props__item" data-module-commercial-item="${escapeHtml(key)}">
    <div class="module-commercial-props__identity"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)} · ${formatNumber(item.quantity, 3)} ${escapeHtml(item.unit)}</small></div>
    <div class="module-commercial-props__material">
      <label for="${listId}-input">Materiál / komponent</label>
      <div class="module-commercial-props__material-editor">
        <input id="${listId}-input" type="search" autocomplete="off" list="${listId}" value="${escapeHtml(displayName)}" data-committed-value="${escapeHtml(displayName)}" data-module-commercial-material-input="${escapeHtml(key)}" data-item-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}" ${materialDisabled ? "disabled" : ""} />
        <datalist id="${listId}">${renderCandidateOptions(candidates)}</datalist>
        <button type="button" data-module-commercial-copy="${escapeHtml(key)}" data-item-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}" ${displayName ? "" : "disabled"}>Kopírovať</button>
        <button type="button" data-module-commercial-material-save="${escapeHtml(key)}" data-item-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}" ${materialDisabled ? "disabled" : ""}>${materialBusy ? "Ukladám…" : "Použiť"}</button>
      </div>
      <small>${escapeHtml(sourceLabel)} · ${escapeHtml(snapshot?.definition.entityType === "material" ? snapshot.definition.materialCode ?? snapshot.definition.id : snapshot?.definition.componentCode ?? snapshot?.definition.id ?? "bez kódu")} · ${formatMoney(snapshot?.unitPrice, snapshot?.currency ?? state.margins?.currency ?? "EUR")}</small>
    </div>
    <div class="module-commercial-props__margin">
      <label for="${listId}-margin">Marža</label>
      <div><input id="${listId}-margin" type="number" min="0" max="${PROJECT_MARGIN_PERCENT_MAX}" step="0.01" inputmode="decimal" value="${margin ? String(margin.marginPercent) : ""}" data-committed-value="${margin ? String(margin.marginPercent) : ""}" data-module-commercial-margin-input="${escapeHtml(key)}" data-item-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}" ${marginDisabled ? "disabled" : ""} /><span>%</span><button type="button" data-module-commercial-margin-save="${escapeHtml(key)}" data-item-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}" ${marginDisabled ? "disabled" : ""}>${marginBusy ? "Ukladám…" : "Uložiť"}</button></div>
      <small>${margin ? `Náklad ${formatMoney(margin.baseCost, state.margins?.currency ?? "EUR")} · predaj ${formatMoney(margin.finalPrice, state.margins?.currency ?? "EUR")}` : "Cenová položka nie je dostupná"}</small>
    </div>
  </article>`;
}

async function defaultCopyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Kopírovanie nie je v tomto prehliadači dostupné.");
}

export function createModuleCommercialPropsController(
  args: ModuleCommercialPropsControllerArgs
): ModuleCommercialPropsHandle {
  const api: ModuleCommercialPropsApi = { ...DEFAULT_API, ...args.api };
  const copyText = args.copyText ?? defaultCopyText;
  let generation = 0;
  let loadAbort: AbortController | null = null;
  let destroyed = false;
  let mutationTail: Promise<void> = Promise.resolve();
  const pending = new Set<Promise<void>>();

  const track = (operation: Promise<void>) => {
    pending.add(operation);
    void operation.finally(() => pending.delete(operation));
  };

  const mount = (host: HTMLElement, instanceId: string) => {
    generation += 1;
    const ownGeneration = generation;
    loadAbort?.abort();
    const state: PanelState = {
      instanceId,
      scope: args.getModuleScope(instanceId),
      materials: null,
      margins: null,
      loading: true,
      error: null,
      notice: null,
      busyKey: null
    };
    const isCurrent = () => !destroyed && generation === ownGeneration && host.isConnected;
    const render = () => {
      if (isCurrent()) host.innerHTML = renderModuleCommercialProps(state);
    };
    render();

    const reload = async (message: string | null = null) => {
      const projectId = args.getProjectId();
      if (!projectId) {
        state.loading = false;
        state.error = "Nie je otvorený žiadny projekt.";
        render();
        return;
      }
      loadAbort?.abort();
      const abort = new AbortController();
      loadAbort = abort;
      state.loading = true;
      state.error = null;
      state.notice = message;
      render();
      const [materialsResult, marginsResult] = await Promise.allSettled([
        api.loadMaterials(projectId, abort.signal),
        api.loadMargins(projectId, abort.signal)
      ]);
      if (!isCurrent() || abort.signal.aborted) return;
      state.loading = false;
      const errors: string[] = [];
      if (materialsResult.status === "fulfilled") {
        state.materials = materialsResult.value;
        state.scope = moduleScope(state.materials, args.getModuleScope(instanceId), instanceId);
        args.onMaterialsChanged?.(materialsResult.value);
      } else if (!isAbortError(materialsResult.reason)) {
        errors.push(errorMessage(materialsResult.reason, "Materiály sa nepodarilo načítať."));
      }
      if (marginsResult.status === "fulfilled") {
        state.margins = marginsResult.value;
        args.onMarginsChanged?.(marginsResult.value);
      } else if (!isAbortError(marginsResult.reason)) {
        errors.push(errorMessage(marginsResult.reason, "Marže sa nepodarilo načítať."));
      }
      state.error = errors.length > 0 ? errors.join(" ") : null;
      render();
    };

    const enqueue = (operation: () => Promise<void>) => {
      const queued = mutationTail.then(operation, operation);
      mutationTail = queued.catch(() => undefined);
      track(queued);
    };

    const findScopeItem = (itemId: string, category: MaterialAssignmentCategory): ProjectMaterialScopeItem | null =>
      state.scope?.items.find((item) => item.id === itemId && item.category === category) ?? null;

    const commitMaterial = (input: HTMLInputElement) => {
      const itemId = input.dataset.itemId ?? "";
      const category = input.dataset.category as MaterialAssignmentCategory | undefined;
      if (!category || !itemId || state.busyKey || !state.materials || !state.scope) return;
      if (input.value.trim() === (input.dataset.committedValue ?? "").trim()) return;
      const item = findScopeItem(itemId, category);
      if (!item) return;
      const candidates = collectProjectMaterialCopyCandidates(state.materials.assignments.assignments, category);
      const resolution = resolveProjectMaterialCopyCandidate(candidates, input.value);
      if (!resolution.ok) {
        state.error = resolution.reason === "ambiguous"
          ? "Viac projektových materiálov má rovnaký názov. Vyberte položku aj s kódom zo zoznamu."
          : resolution.reason === "empty"
            ? "Názov materiálu nesmie byť prázdny."
            : "Takýto kompatibilný materiál sa v aktuálnom projekte nenachádza.";
        input.value = input.dataset.committedValue ?? "";
        render();
        return;
      }
      enqueue(async () => {
        const projectId = args.getProjectId();
        if (!projectId) return;
        state.busyKey = `material:${itemKey(item)}`;
        state.error = null;
        state.notice = null;
        render();
        try {
          await args.ensureProjectSaved?.();
          const fresh = await api.loadMaterials(projectId);
          const freshCandidates = collectProjectMaterialCopyCandidates(fresh.assignments.assignments, category);
          const selected = freshCandidates.find((candidate) => candidate.key === resolution.candidate.key);
          if (!selected) throw new Error("Vybraný materiál už v projekte nie je dostupný. Zoznam bol obnovený.");
          const updated = await api.copyMaterial(projectId, {
            revision: fresh.assignments.revision,
            sourceAssignmentId: selected.assignment.assignmentId,
            target: { scopeId: state.scope!.id, itemId: item.id, category: item.category }
          });
          state.materials = updated;
          state.scope = moduleScope(updated, args.getModuleScope(instanceId), instanceId);
          args.onMaterialsChanged?.(updated);
          try {
            state.margins = await api.loadMargins(projectId);
            args.onMarginsChanged?.(state.margins);
            state.notice = `Materiál ${selected.displayName} bol uložený a cena prepočítaná.`;
          } catch (error) {
            state.notice = `Materiál ${selected.displayName} bol uložený.`;
            state.error = `Aktuálnu cenu a maržu sa nepodarilo obnoviť. ${errorMessage(error, "")}`.trim();
          }
        } catch (error) {
          const failure = `${errorMessage(error, "Materiál sa nepodarilo uložiť.")} Pôvodné priradenie zostalo zachované.`;
          await reload().catch(() => undefined);
          state.error = failure;
          state.notice = null;
        } finally {
          state.busyKey = null;
          render();
        }
      });
    };

    const commitMargin = (input: HTMLInputElement) => {
      const itemId = input.dataset.itemId ?? "";
      const category = input.dataset.category as MaterialAssignmentCategory | undefined;
      if (!category || !itemId || state.busyKey || !state.scope) return;
      const marginPercent = parseMargin(input.value);
      if (marginPercent == null) {
        state.error = `Marža musí byť číslo od 0 do ${PROJECT_MARGIN_PERCENT_MAX} %.`;
        input.value = input.dataset.committedValue ?? "";
        render();
        return;
      }
      if (marginPercent === parseMargin(input.dataset.committedValue ?? "")) return;
      const item = findScopeItem(itemId, category);
      if (!item) return;
      enqueue(async () => {
        const projectId = args.getProjectId();
        if (!projectId) return;
        state.busyKey = `margin:${itemKey(item)}`;
        state.error = null;
        state.notice = null;
        render();
        try {
          await args.ensureProjectSaved?.();
          const fresh = await api.loadMargins(projectId);
          const marginItem = findModuleMarginItem(fresh, state.scope!.id, item);
          if (!marginItem) throw new Error("Cenová položka už v aktuálnom BOM neexistuje.");
          const updated = await api.updateMargin(projectId, {
            revision: fresh.revision,
            target: { scopeId: marginItem.scopeId, itemId: marginItem.itemId, category: marginItem.category },
            marginPercent
          });
          state.margins = updated;
          args.onMarginsChanged?.(updated);
          state.notice = `Marža ${formatNumber(marginPercent)} % bola uložená.`;
        } catch (error) {
          const failure = `${errorMessage(error, "Maržu sa nepodarilo uložiť.")} Pôvodná hodnota zostala zachovaná.`;
          await reload().catch(() => undefined);
          state.error = failure;
          state.notice = null;
        } finally {
          state.busyKey = null;
          render();
        }
      });
    };

    host.addEventListener("click", (event) => {
      const element = event.target instanceof Element ? event.target : null;
      const copyButton = element?.closest<HTMLButtonElement>("[data-module-commercial-copy]");
      if (copyButton) {
        const itemId = copyButton.dataset.itemId ?? "";
        const category = copyButton.dataset.category as MaterialAssignmentCategory | undefined;
        const item = category ? findScopeItem(itemId, category) : null;
        const assignment = item && state.materials && state.scope
          ? resolveEffectiveProjectMaterialAssignment(state.materials.assignments.assignments, state.scope.id, item).assignment
          : null;
        const name = assignmentDisplayName(assignment);
        if (!name) return;
        const operation = copyText(name).then(() => {
          state.notice = `Názov „${name}“ je skopírovaný. Po vložení sa znovu pripoja celé projektové dáta materiálu.`;
          state.error = null;
          render();
        }).catch((error) => {
          state.error = errorMessage(error, "Názov sa nepodarilo skopírovať.");
          render();
        });
        track(operation);
        return;
      }
      const materialButton = element?.closest<HTMLButtonElement>("[data-module-commercial-material-save]");
      if (materialButton) {
        const key = materialButton.dataset.moduleCommercialMaterialSave;
        const input = key ? host.querySelector<HTMLInputElement>(`[data-module-commercial-material-input="${cssEscape(key)}"]`) : null;
        if (input) commitMaterial(input);
        return;
      }
      const marginButton = element?.closest<HTMLButtonElement>("[data-module-commercial-margin-save]");
      if (marginButton) {
        const key = marginButton.dataset.moduleCommercialMarginSave;
        const input = key ? host.querySelector<HTMLInputElement>(`[data-module-commercial-margin-input="${cssEscape(key)}"]`) : null;
        if (input) commitMargin(input);
      }
    });

    host.addEventListener("change", (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (input?.dataset.moduleCommercialMaterialInput) commitMaterial(input);
      else if (input?.dataset.moduleCommercialMarginInput) commitMargin(input);
    });

    host.addEventListener("keydown", (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input) return;
      if (event.key === "Escape") {
        input.value = input.dataset.committedValue ?? "";
        input.blur();
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (input.dataset.moduleCommercialMaterialInput) commitMaterial(input);
      else if (input.dataset.moduleCommercialMarginInput) commitMargin(input);
    });

    const initialLoad = reload();
    track(initialLoad);
  };

  return {
    mount,
    async flushPending() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
      await mutationTail;
    },
    destroy() {
      destroyed = true;
      generation += 1;
      loadAbort?.abort();
      loadAbort = null;
    }
  };
}

function cssEscape(value: string): string {
  const escape = globalThis.CSS?.escape;
  return escape ? escape(value) : value.replace(/["\\]/g, "\\$&");
}
