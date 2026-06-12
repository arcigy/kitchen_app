import "./moduleInspector.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type {
  FurnQuoteModulePackage,
  ModuleMaterialSlot,
  ModuleContextBinding,
  ModuleParameterDefinition
} from "../core/module-package/module-package-types";
import { makeDefaultKitchenContext, resolveContext, type KitchenContext } from "../layout/kitchenContext";
import type { BOMResult } from "../layout/bom/bomTypes";
import { applyKitchenContextToModuleParams } from "../layout/kitchenMaterialSync";
import type { ModuleParams, ModuleType } from "../model/cabinetTypes";
import { normalizeModuleParams } from "../model/cabinetTypes";
import { getModuleDescriptors, type ModuleDescriptor } from "../modules/registry";
import { systemModulePackageTemplates } from "../system/module-packages";
import {
  czkToEur,
  formatCzk,
  formatDisplayCurrency,
  readPriceDisplayCurrency,
  type PriceDisplayCurrency,
  writePriceDisplayCurrency
} from "../ui/currencyDisplay";

type PartInfo = {
  id: string;
  label: string;
  mesh: THREE.Mesh;
  visible: boolean;
};

type BindingInfo = {
  kind: "parameter" | "material" | "component" | "commercial";
  target: string;
  source: string;
  detail: string;
};

type ModuleProbeResult = {
  type: string;
  label: string;
  ok: boolean;
  partCount: number;
  itemCount: number;
  price: number | null;
  error?: string;
};

type BuildSceneOptions = {
  fitCamera?: boolean;
  preserveView?: boolean;
  preserveVisibility?: boolean;
};

type SceneViewSnapshot = {
  cameraPosition: THREE.Vector3;
  cameraQuaternion: THREE.Quaternion;
  cameraZoom: number;
  controlsTarget: THREE.Vector3;
};

type MaterialSlotView = {
  slotId: string;
  label: string;
  groupLabel: string;
  family: MaterialDefinition["boardFamily"];
  materialParamKey: string;
  thicknessParamKey: string | null;
  materialId: string;
  thicknessMm: number;
  material: MaterialDefinition | null;
  options: MaterialDefinition[];
  binding: BindingInfo[];
};

type DemosMaterialLookupState = {
  query: string;
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
  material: DemosMaterial | null;
  colorHex: string | null;
};

type DemosMaterial = {
  query: string;
  source: "demos-cz";
  pageUrl: string;
  productId: string | null;
  assortmentCode: string;
  title: string;
  brand: string | null;
  categoryPath?: string[];
  materialKind?: MaterialDefinition["baseMaterial"];
  availability: {
    label: string;
    inStock: boolean;
    tooltip: string | null;
  };
  price: {
    amountWithoutVat: number | null;
    amountWithVat: number | null;
    pricePerM2WithoutVat: number | null;
    currency: "CZK";
  };
  board: {
    thicknessMm: number | null;
    formatMm: { width: number; height: number } | null;
    decorCode: string | null;
    decorName: string | null;
    structure: string | null;
    colorTone: string | null;
    decorType: string | null;
    materialProperty: string | null;
  };
  image: {
    originalUrl: string | null;
    previewUrl: string | null;
  };
  scrapedAt: string;
};

declare global {
  interface Window {
    __moduleInspectorTestApi?: {
      probeAllModules: () => ModuleProbeResult[];
      readCurrentMaterialProbe: (slotId: string) => Record<string, unknown> | null;
      readSceneSnapshot: () => Record<string, unknown> | null;
    };
  }
}

type InspectorState = {
  catalog: ClientCatalog;
  ctx: KitchenContext;
  descriptor: ModuleDescriptor;
  modulePackage: FurnQuoteModulePackage | null;
  params: ModuleParams;
  selectedPartId: string | null;
  parts: PartInfo[];
  bom: BOMResult | null;
  pricingVisible: boolean;
  priceDisplayCurrency: PriceDisplayCurrency;
  bindings: Map<string, BindingInfo[]>;
  demosLookups: Record<string, DemosMaterialLookupState>;
  lastError: string | null;
  section: {
    enabled: boolean;
    showBox: boolean;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
};

const mmToM = 1 / 1000;
const moduleDescriptors = [...getModuleDescriptors()].sort((left, right) => left.label.localeCompare(right.label));
const packageByType = new Map(systemModulePackageTemplates.map((modulePackage) => [modulePackage.module.moduleType, modulePackage]));

export async function startModuleInspectorApp(root: HTMLElement): Promise<void> {
  const seed = createSystemCatalogSeed();
  const catalog: ClientCatalog = { clientId: "module-inspector", ...seed };
  const firstDescriptor = moduleDescriptors.find((descriptor) => descriptor.type === "drawer_low") ?? moduleDescriptors[0];
  if (!firstDescriptor) throw new Error("No module descriptors registered.");

  const state: InspectorState = {
    catalog,
    ctx: resolveContext(makeDefaultKitchenContext(catalog)),
    descriptor: firstDescriptor,
    modulePackage: getPackage(firstDescriptor.type),
    params: firstDescriptor.defaultParams(),
    selectedPartId: null,
    parts: [],
    bom: null,
    pricingVisible: true,
    priceDisplayCurrency: readPriceDisplayCurrency(),
    bindings: new Map(),
    demosLookups: {},
    lastError: null,
    section: {
      enabled: false,
      showBox: true,
      minX: -500,
      maxX: 500,
      minY: 0,
      maxY: 900,
      minZ: -400,
      maxZ: 400
    }
  };

  applyContextBindings(state);

  root.className = "module-inspector-root";
  root.innerHTML = renderShell(state);

  const viewHost = mustQuery<HTMLElement>(root, "[data-mi-view]");
  const scene = createScene(viewHost);
  const rerenderUi = () => {
    state.bindings = collectBindings(state.modulePackage);
    state.bom = calculateBom(state);
    renderControls(root, state);
    renderRightPanel(root, state);
  };
  const rebuildScene = (options: BuildSceneOptions = {}) => {
    buildSceneModule(scene, state, options);
    rerenderUi();
  };

  installUiEvents(root, state, rebuildScene, rerenderUi);
  window.__moduleInspectorTestApi = {
    probeAllModules: () => probeAllModules(state),
    readCurrentMaterialProbe: (slotId: string) => readCurrentMaterialProbe(state, slotId),
    readSceneSnapshot: () => readSceneSnapshot(scene, state)
  };
  rebuildScene({ fitCamera: true, preserveView: false, preserveVisibility: false });
}

function renderShell(state: InspectorState): string {
  return `
    <main class="mi-app">
      <header class="mi-header">
        <div>
          <span>FWM Module Inspector</span>
          <strong>Single module runtime check</strong>
        </div>
        <a href="/">Back to app</a>
      </header>
      <section class="mi-layout">
        <aside class="mi-sidebar" data-mi-controls>${renderControlsMarkup(state)}</aside>
        <section class="mi-viewport">
          <div class="mi-toolbar">
            <select data-mi-module>${renderModuleOptions(state.descriptor.type)}</select>
            <label class="mi-currency-toggle">
              <span>Prices</span>
              <select data-mi-price-currency>
                <option value="CZK" ${state.priceDisplayCurrency === "CZK" ? "selected" : ""}>CZK</option>
                <option value="EUR" ${state.priceDisplayCurrency === "EUR" ? "selected" : ""}>EUR</option>
              </select>
            </label>
            <button type="button" data-mi-apply-context>Apply kitchen bindings</button>
            <button type="button" data-mi-fit>Fit</button>
          </div>
          <div class="mi-view" data-mi-view></div>
          <div class="mi-status" data-mi-status></div>
        </section>
        <aside class="mi-details" data-mi-details>${renderRightPanelMarkup(state)}</aside>
      </section>
    </main>
  `;
}

function renderModuleOptions(selected: ModuleType) {
  return moduleDescriptors.map((descriptor) => {
    const packageMarker = packageByType.has(descriptor.type) ? "FWM" : "legacy";
    return `<option value="${escapeAttr(descriptor.type)}" ${descriptor.type === selected ? "selected" : ""}>${escapeHtml(descriptor.label)} (${packageMarker})</option>`;
  }).join("");
}

function renderControls(root: HTMLElement, state: InspectorState) {
  mustQuery<HTMLElement>(root, "[data-mi-controls]").innerHTML = renderControlsMarkup(state);
}

function renderControlsMarkup(state: InspectorState): string {
  const definitions = getParameterDefinitions(state);
  const groups = groupParameterDefinitions(definitions);
  const materialSlots = getMaterialSlotViews(state);
  const ctxRows = [
    ["heightMm", state.ctx.heightMm],
    ["moduleHeightMm", state.ctx.moduleHeightMm],
    ["worktopThicknessMm", state.ctx.worktopThicknessMm],
    ["moduleDepthMm", state.ctx.moduleDepthMm],
    ["plinthHeightMm", state.ctx.plinthHeightMm],
    ["upperHeightMm", state.ctx.upperHeightMm],
    ["upperDepthMm", state.ctx.upperDepthMm]
  ] as const;

  return `
    <section class="mi-panel">
      <h2>Kitchen source context</h2>
      <div class="mi-context-grid">
        ${ctxRows.map(([key, value]) => `
          <label>
            <span>${escapeHtml(key)}</span>
            <input data-mi-context="${escapeAttr(key)}" type="number" value="${String(value)}" step="1" />
          </label>
        `).join("")}
      </div>
    </section>
    ${materialSlots.length > 0 ? `
      <section class="mi-panel mi-material-panel">
        <h2>Material groups</h2>
        <div class="mi-material-groups">
          ${materialSlots.map((slot) => renderMaterialSlotControl(state, slot)).join("")}
        </div>
      </section>
    ` : ""}
    ${groups.map((group) => `
      <section class="mi-panel">
        <h2>${escapeHtml(group.label)}</h2>
        <div class="mi-param-list">
          ${group.params.map((definition) => renderParamControl(state, definition)).join("")}
        </div>
      </section>
    `).join("")}
    <section class="mi-panel">
      <h2>Section box</h2>
      <label class="mi-check"><input data-mi-section-enabled type="checkbox" ${state.section.enabled ? "checked" : ""} /> Clip module</label>
      <label class="mi-check"><input data-mi-section-show type="checkbox" ${state.section.showBox ? "checked" : ""} /> Show box</label>
      <div class="mi-section-grid">
        ${(["minX", "maxX", "minY", "maxY", "minZ", "maxZ"] as const).map((key) => `
          <label><span>${key}</span><input data-mi-section="${key}" type="number" value="${state.section[key]}" step="10" /></label>
        `).join("")}
      </div>
    </section>
  `;
}

function renderMaterialSlotControl(state: InspectorState, slot: MaterialSlotView): string {
  const bindingTitle = slot.binding.length > 0
    ? slot.binding.map((item) => `${item.target} <- ${item.source}: ${item.detail}`).join("\n")
    : "No context binding";
  const swatch = slot.material?.preview.colorHex ?? "#b8bcc7";
  const lookup = state.demosLookups[slot.slotId] ?? null;
  return `
    <article class="mi-material-slot" data-mi-material-slot-card="${escapeAttr(slot.slotId)}">
      <header>
        <span class="mi-material-swatch" style="background:${escapeAttr(swatch)}"></span>
        <div>
          <strong>${escapeHtml(slot.groupLabel)}</strong>
          <code>${escapeHtml(slot.slotId)} / ${escapeHtml(String(slot.family))}</code>
        </div>
        <button type="button" class="mi-fx ${slot.binding.length > 0 ? "active" : ""}" data-mi-binding="${escapeAttr(slot.materialParamKey)}" title="${escapeAttr(bindingTitle)}">fx</button>
      </header>
      <dl class="mi-material-readonly">
        <div><dt>Material</dt><dd>${escapeHtml(slot.material?.displayName ?? "No material assigned")}</dd></div>
        <div><dt>Thickness</dt><dd>${slot.thicknessMm} mm</dd></div>
        <div><dt>Catalog ID</dt><dd>${escapeHtml(slot.material?.id ?? (slot.materialId || "No material selected"))}</dd></div>
      </dl>
      <label class="mi-demos-lookup">
        <span>Demos CZ assortment code / material name</span>
        <input data-mi-demos-lookup="${escapeAttr(slot.slotId)}" type="text" value="${escapeAttr(lookup?.query ?? "")}" placeholder="494911 or DTDL K536 RW" />
      </label>
      ${renderDemosLookupResult(lookup)}
    </article>
  `;
}

function renderDemosLookupResult(lookup: DemosMaterialLookupState | null): string {
  if (!lookup || lookup.status === "idle") return "";
  if (lookup.status === "loading") return `<p class="mi-demos-status">Scraping Demos CZ...</p>`;
  if (lookup.status === "error") return `<p class="mi-demos-status error">${escapeHtml(lookup.error ?? "Demos lookup failed.")}</p>`;
  const material = lookup.material;
  if (!material) return "";
  const format = material.board.formatMm ? `${material.board.formatMm.width} x ${material.board.formatMm.height} mm` : "unknown";
  const image = material.image.previewUrl || material.image.originalUrl;
  const proxiedImage = image ? `/api/demos/material-image?url=${encodeURIComponent(image)}` : "";
  const color = lookup.colorHex ?? "#b8bcc7";
  return `
    <article class="mi-demos-result">
      ${proxiedImage ? `<img src="${escapeAttr(proxiedImage)}" alt="${escapeAttr(material.title)}" />` : ""}
      <div>
        <strong>${escapeHtml(material.title)}</strong>
        <dl>
          <div><dt>Kód</dt><dd>${escapeHtml(material.assortmentCode)}</dd></div>
          <div><dt>Cena ks</dt><dd>${formatCzk(material.price.amountWithoutVat)} bez DPH / ${formatCzk(material.price.amountWithVat)} s DPH</dd></div>
          <div><dt>Cena m2</dt><dd>${formatCzk(material.price.pricePerM2WithoutVat)} bez DPH</dd></div>
          <div><dt>Hrúbka</dt><dd>${material.board.thicknessMm ?? "unknown"} mm</dd></div>
          <div><dt>Formát</dt><dd>${escapeHtml(format)}</dd></div>
          <div><dt>Sklad</dt><dd>${escapeHtml(material.availability.label || "unknown")}</dd></div>
          <div><dt>Farba z fotky</dt><dd><span class="mi-demos-color" style="background:${escapeAttr(color)}"></span>${escapeHtml(color)}</dd></div>
        </dl>
        <a href="${escapeAttr(material.pageUrl)}" target="_blank" rel="noreferrer">Demos detail</a>
      </div>
    </article>
  `;
}

function renderParamControl(state: InspectorState, definition: ModuleParameterDefinition): string {
  const record = state.params as unknown as Record<string, unknown>;
  const value = record[definition.key] ?? definition.defaultValue ?? "";
  const binding = state.bindings.get(definition.key) ?? [];
  const boundClass = binding.length > 0 ? "bound" : "";
  const bindingTitle = binding.length > 0 ? binding.map((item) => `${item.target} <- ${item.source}: ${item.detail}`).join("\n") : "No context binding";
  const unit = definition.unit ? `<small>${escapeHtml(definition.unit)}</small>` : "";
  return `
    <label class="mi-param ${boundClass}">
      <span>
        <b>${escapeHtml(definition.label || definition.key)}</b>
        <code>${escapeHtml(definition.key)}</code>
      </span>
      ${renderInput(state, definition, value)}
      ${unit}
      <button type="button" class="mi-fx" data-mi-binding="${escapeAttr(definition.key)}" title="${escapeAttr(bindingTitle)}">fx</button>
    </label>
  `;
}

function renderInput(state: InspectorState, definition: ModuleParameterDefinition, value: unknown) {
  const key = escapeAttr(definition.key);
  if (definition.type === "boolean" || typeof value === "boolean") {
    return `<input data-mi-param="${key}" type="checkbox" ${value === true ? "checked" : ""} />`;
  }
  if (definition.type === "select" && definition.options?.length) {
    return `<select data-mi-param="${key}">${definition.options.map((option) => `<option value="${escapeAttr(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
  }
  if (definition.type === "material") {
    return `<select data-mi-param="${key}">${state.catalog.materials.filter((material) => material.isActive).map((material) => `<option value="${escapeAttr(material.id)}" ${material.id === value ? "selected" : ""}>${escapeHtml(material.displayName)}</option>`).join("")}</select>`;
  }
  if (definition.type === "component") {
    return `<select data-mi-param="${key}">${state.catalog.components.filter((component) => component.isActive).map((component) => `<option value="${escapeAttr(component.id)}" ${component.id === value ? "selected" : ""}>${escapeHtml(component.displayName)}</option>`).join("")}</select>`;
  }
  if (definition.type === "number" || typeof value === "number") {
    const min = definition.min != null ? ` min="${definition.min}"` : "";
    const max = definition.max != null ? ` max="${definition.max}"` : "";
    const step = definition.step != null ? definition.step : 1;
    return `<input data-mi-param="${key}" type="number" value="${escapeAttr(String(value))}" step="${step}"${min}${max} />`;
  }
  if (value && typeof value === "object") {
    return `<textarea data-mi-param="${key}" rows="3">${escapeHtml(JSON.stringify(value))}</textarea>`;
  }
  return `<input data-mi-param="${key}" type="text" value="${escapeAttr(String(value ?? ""))}" />`;
}

function renderRightPanel(root: HTMLElement, state: InspectorState) {
  mustQuery<HTMLElement>(root, "[data-mi-details]").innerHTML = renderRightPanelMarkup(state);
  const status = root.querySelector<HTMLElement>("[data-mi-status]");
  if (status) status.textContent = state.lastError ? `Error: ${state.lastError}` : `${state.parts.length} objects, ${state.bom?.quoteBom.items.length ?? 0} BOM items`;
}

function renderRightPanelMarkup(state: InspectorState): string {
  const selected = state.parts.find((part) => part.id === state.selectedPartId) ?? null;
  return `
    <section class="mi-panel">
      <h2>Selected object</h2>
      ${selected ? renderSelectedPart(selected) : `<p class="mi-empty">Select a board or part in 3D.</p>`}
    </section>
    <section class="mi-panel">
      <h2>Objects</h2>
      <div class="mi-part-list">
        ${state.parts.map((part) => renderPartRow(state, part)).join("")}
      </div>
    </section>
    <section class="mi-panel">
      <div class="mi-panel-head">
        <h2>Quote</h2>
        <button type="button" data-mi-toggle-pricing>${state.pricingVisible ? "Hide calculation" : "Show calculation"}</button>
      </div>
      ${state.pricingVisible ? renderPricing(state.bom, state.priceDisplayCurrency) : `<p class="mi-empty">Calculation hidden.</p>`}
    </section>
  `;
}

function renderSelectedPart(part: PartInfo) {
  const data = part.mesh.userData as Record<string, unknown>;
  return `
    <div class="mi-selected">
      <strong>${escapeHtml(part.label)}</strong>
      <dl>
        <div><dt>dimensions</dt><dd>${escapeHtml(formatDimensions(data.dimensionsMm))}</dd></div>
        <div><dt>material</dt><dd>${escapeHtml(formatMaterial(data))}</dd></div>
        <div><dt>params</dt><dd>${escapeHtml(formatParamKeys(data.paramKeys))}</dd></div>
      </dl>
    </div>
  `;
}

function renderPartRow(state: InspectorState, part: PartInfo) {
  const selected = state.selectedPartId === part.id ? "selected" : "";
  const disabled = part.visible ? "" : "disabled";
  return `
    <label class="mi-part ${selected}">
      <input data-mi-part-visible="${escapeAttr(part.id)}" type="checkbox" ${part.visible ? "checked" : ""} />
      <button type="button" data-mi-part-select="${escapeAttr(part.id)}" ${disabled}>${escapeHtml(part.label)}</button>
    </label>
  `;
}

function renderPricing(bom: BOMResult | null, currency: PriceDisplayCurrency) {
  if (!bom) return `<p class="mi-empty">Pricing unavailable.</p>`;
  const pricing = bom.pricing;
  return `
    <div class="mi-price-total">
      <span>${escapeHtml(currency)}</span>
      <strong>${escapeHtml(formatDisplayCurrency(pricing.finalPrice, currency))}</strong>
    </div>
    <dl class="mi-price-breakdown">
      <div><dt>Boards</dt><dd>${pricing.groups.boards.pricedAreaM2.toFixed(3)} m2 = ${escapeHtml(formatDisplayCurrency(pricing.groups.boards.cost, currency))}</dd></div>
      <div><dt>Edges</dt><dd>${pricing.groups.edge_bands.lengthLm.toFixed(2)} lm = ${escapeHtml(formatDisplayCurrency(pricing.groups.edge_bands.cost, currency))}</dd></div>
      <div><dt>Hardware</dt><dd>${pricing.groups.hardware.pieces.toFixed(0)} pcs = ${escapeHtml(formatDisplayCurrency(pricing.groups.hardware.cost, currency))}</dd></div>
      <div><dt>Labor</dt><dd>${escapeHtml(formatDisplayCurrency(pricing.laborCostFixed, currency))}</dd></div>
      <div><dt>Margin</dt><dd>${pricing.marginPercent}% = ${escapeHtml(formatDisplayCurrency(pricing.marginAmount, currency))}</dd></div>
    </dl>
    <div class="mi-formulas">
      ${pricing.items.slice(0, 18).map((item) => `
        <article>
          <strong>${escapeHtml(item.name)}</strong>
          <code>${escapeHtml(makeItemFormula(item))}</code>
        </article>
      `).join("")}
    </div>
  `;
}

function installUiEvents(root: HTMLElement, state: InspectorState, rebuildScene: (options?: BuildSceneOptions) => void, rerenderUi: () => void) {
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const slotId = target.dataset.miDemosLookup;
    if (!slotId) return;
    event.preventDefault();
    void runDemosMaterialLookup(state, slotId, target.value, rebuildScene, rerenderUi);
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    const moduleSelect = target.closest("[data-mi-module]") as HTMLSelectElement | null;
    if (moduleSelect) {
      const next = moduleDescriptors.find((descriptor) => descriptor.type === moduleSelect.value);
      if (!next) return;
      state.descriptor = next;
      state.modulePackage = getPackage(next.type);
      state.params = next.defaultParams();
      state.selectedPartId = null;
      applyContextBindings(state);
      rebuildScene({ fitCamera: true, preserveView: false, preserveVisibility: false });
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.miPriceCurrency != null) {
      const currency = target.value === "EUR" ? "EUR" : "CZK";
      state.priceDisplayCurrency = currency;
      writePriceDisplayCurrency(currency);
      rerenderUi();
      return;
    }

    const contextKey = target.dataset.miContext;
    if (contextKey) {
      (state.ctx as unknown as Record<string, unknown>)[contextKey] = Number(target.value);
      state.ctx = resolveContext(state.ctx);
      rerenderUi();
      return;
    }

    const paramKey = target.dataset.miParam;
    if (paramKey) {
      updateParamFromInput(state, paramKey, target);
      rebuildScene();
      return;
    }

    const sectionKey = target.dataset.miSection as keyof InspectorState["section"] | undefined;
    if (sectionKey) {
      state.section[sectionKey] = Number(target.value) as never;
      rebuildScene();
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.miSectionEnabled != null) {
      state.section.enabled = target.checked;
      rebuildScene();
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.miSectionShow != null) {
      state.section.showBox = target.checked;
      rebuildScene();
      return;
    }

    const partVisible = target.dataset.miPartVisible;
    if (target instanceof HTMLInputElement && partVisible) {
      const part = state.parts.find((candidate) => candidate.id === partVisible);
      if (part) {
        part.visible = target.checked;
        part.mesh.visible = part.visible;
        if (!part.visible && state.selectedPartId === part.id) {
          state.selectedPartId = null;
          window.dispatchEvent(new CustomEvent("module-inspector-clear-selection"));
        }
      }
      rerenderUi();
    }
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches("[data-mi-apply-context]")) {
      applyContextBindings(state);
      rebuildScene({ preserveView: true, preserveVisibility: true });
      return;
    }
    const bindingKey = target.dataset.miBinding;
    if (bindingKey) {
      const infos = state.bindings.get(bindingKey) ?? [];
      window.alert(infos.length ? infos.map((info) => `${info.target} <- ${info.source}\n${info.detail}`).join("\n\n") : "No context binding for this parameter.");
      return;
    }
    const partId = target.dataset.miPartSelect;
    if (partId) {
      const part = state.parts.find((candidate) => candidate.id === partId);
      if (!part?.visible) return;
      state.selectedPartId = partId;
      rerenderUi();
    }
    if (target.matches("[data-mi-toggle-pricing]")) {
      state.pricingVisible = !state.pricingVisible;
      rerenderUi();
    }
    if (target.matches("[data-mi-fit]")) {
      window.dispatchEvent(new CustomEvent("module-inspector-fit"));
    }
  });
}

async function runDemosMaterialLookup(
  state: InspectorState,
  slotId: string,
  rawQuery: string,
  rebuildScene: (options?: BuildSceneOptions) => void,
  rerenderUi: () => void
) {
  const query = rawQuery.trim();
  if (query.length < 2) return;
  state.demosLookups[slotId] = { query, status: "loading", error: null, material: null, colorHex: null };
  rerenderUi();
  try {
    const response = await fetch(`/api/demos/material-lookup?q=${encodeURIComponent(query)}`, { headers: { "accept": "application/json" } });
    const payload = await response.json() as { ok?: boolean; material?: DemosMaterial; error?: string };
    if (!response.ok || !payload.ok || !payload.material) throw new Error(payload.error || `Demos lookup failed: ${response.status}`);
    const imageUrl = payload.material.image.previewUrl || payload.material.image.originalUrl;
    const colorHex = imageUrl ? await deriveDemosImageColor(imageUrl) : "#b8bcc7";
    state.demosLookups[slotId] = { query, status: "loaded", error: null, material: payload.material, colorHex };
    applyDemosMaterialToSlot(state, slotId, payload.material, colorHex);
    rebuildScene();
  } catch (error) {
    state.demosLookups[slotId] = {
      query,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      material: null,
      colorHex: null
    };
    rerenderUi();
  }
}

async function deriveDemosImageColor(imageUrl: string): Promise<string> {
  const proxied = `/api/demos/material-image?url=${encodeURIComponent(imageUrl)}`;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Demos image could not be loaded."));
    img.src = proxied;
  });
  const canvas = document.createElement("canvas");
  const size = 24;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#b8bcc7";
  ctx.drawImage(image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 0;
    if (alpha < 240) continue;
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max > 246 && min > 235) continue;
    r += red;
    g += green;
    b += blue;
    count += 1;
  }
  if (count === 0) return "#b8bcc7";
  return rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function applyDemosMaterialToSlot(state: InspectorState, slotId: string, material: DemosMaterial, colorHex: string) {
  const slot = getMaterialSlotViews(state).find((candidate) => candidate.slotId === slotId);
  if (!slot) return;
  const catalogMaterial = createDemosCatalogMaterial(slot, material, colorHex);
  const existingIndex = state.catalog.materials.findIndex((candidate) => candidate.id === catalogMaterial.id);
  if (existingIndex >= 0) state.catalog.materials[existingIndex] = catalogMaterial;
  else state.catalog.materials.push(catalogMaterial);
  if (material.price.pricePerM2WithoutVat != null) {
    state.catalog.priceList.prices[catalogMaterial.id] = czkToEur(material.price.pricePerM2WithoutVat);
  }
  updateMaterialSlot(state, slotId, catalogMaterial.id, catalogMaterial.defaultThicknessMm);
}

function createDemosCatalogMaterial(slot: MaterialSlotView, material: DemosMaterial, colorHex: string): MaterialDefinition {
  const thickness = (material.board.thicknessMm ?? slot.thicknessMm) || 18;
  const code = material.assortmentCode || material.productId || material.title;
  const id = `demos.cz.${slugId(code)}`;
  return {
    id,
    entityType: "material",
    materialType: "board",
    name: material.title,
    displayName: material.title,
    category: "Demos CZ scraped board",
    baseMaterial: inferDemosBaseMaterial(material),
    decor: [material.board.decorCode, material.board.decorName].filter(Boolean).join(" "),
    color: colorHex,
    finish: material.board.structure ?? "",
    pricingBasis: "sheet_area",
    pricingUnit: "m2",
    availableThicknessesMm: [thickness],
    defaultThicknessMm: thickness,
    isActive: true,
    tags: ["demos-cz", "scraped", slot.slotId],
    preview: {
      colorHex,
      roughness: 0.64,
      metalness: 0
    },
    boardFamily: slot.family,
    recommendedUse: slot.groupLabel,
    grainDirectionRelevant: material.board.decorType?.toLowerCase().includes("dřevo") ?? true,
    supplierSource: {
      supplier: "demos-cz",
      supplierProductId: material.assortmentCode,
      url: material.pageUrl,
      imageUrl: material.image.originalUrl ?? material.image.previewUrl ?? undefined,
      usageCategory: "board",
      rawUnit: "m2"
    }
  };
}

function inferDemosBaseMaterial(material: DemosMaterial): MaterialDefinition["baseMaterial"] {
  const known: MaterialDefinition["baseMaterial"][] = [
    "dtd",
    "mdf",
    "hdf",
    "plywood",
    "multiplex",
    "solid_wood",
    "laminate",
    "compact",
    "veneer",
    "acrylic",
    "abs"
  ];
  if (material.materialKind && known.includes(material.materialKind)) return material.materialKind;
  const text = [
    material.title,
    ...(material.categoryPath ?? []),
    material.board.materialProperty ?? "",
    material.board.decorType ?? ""
  ].join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\bmdfl?\b|\bmdf\b/.test(text)) return "mdf";
  if (/\bhdf\b/.test(text)) return "hdf";
  if (/\bdtdl?\b|drevotris|drevotries/.test(text)) return "dtd";
  if (/multiplex/.test(text)) return "multiplex";
  if (/prekliz|preglej|plywood/.test(text)) return "plywood";
  if (/masiv|solid wood/.test(text)) return "solid_wood";
  if (/kompakt|compact/.test(text)) return "compact";
  if (/dyh|veneer/.test(text)) return "veneer";
  if (/akryl|acryl/.test(text)) return "acrylic";
  if (/\babs\b|hrana|hranovaci/.test(text)) return "abs";
  if (/laminat|lamino/.test(text)) return "laminate";
  return "dtd";
}

function slugId(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "material";
}

function createScene(host: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f4ef);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(1.6, 1.15, 1.8);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.localClippingEnabled = true;
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.45, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9b9282, 1.8));
  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(3, 4, 2);
  scene.add(light);
  const grid = new THREE.GridHelper(3, 30, 0xc8c0b2, 0xe0d9cf);
  scene.add(grid);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const selectedBox = new THREE.BoxHelper(new THREE.Object3D(), 0x1f7a8c);
  selectedBox.visible = false;
  scene.add(selectedBox);

  const api = {
    scene,
    camera,
    renderer,
    controls,
    moduleRoot: null as THREE.Group | null,
    sectionHelper: null as THREE.Box3Helper | null,
    selectedBox,
    onPartSelect: null as ((mesh: THREE.Mesh) => void) | null,
    fit() {
      if (!api.moduleRoot) return;
      fitCamera(camera, controls, api.moduleRoot);
    }
  };

  function resize() {
    const rect = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  renderer.domElement.addEventListener("pointerdown", (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(api.moduleRoot ? [api.moduleRoot] : [], true);
    const mesh = hits.find((hit) => hit.object instanceof THREE.Mesh && isObjectVisibleInHierarchy(hit.object))?.object as THREE.Mesh | undefined;
    if (mesh && api.onPartSelect) api.onPartSelect(mesh);
  });

  window.addEventListener("module-inspector-fit", () => api.fit());
  window.addEventListener("module-inspector-clear-selection", () => {
    api.selectedBox.visible = false;
  });

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  return api;
}

function buildSceneModule(sceneApi: ReturnType<typeof createScene>, state: InspectorState, options: BuildSceneOptions = {}) {
  const preserveView = options.preserveView !== false && !options.fitCamera;
  const preserveVisibility = options.preserveVisibility !== false;
  const viewSnapshot = preserveView ? captureSceneView(sceneApi) : null;
  const previousVisibility = preserveVisibility ? new Map(state.parts.map((part) => [part.label, part.visible])) : new Map<string, boolean>();
  const selectedLabel = state.parts.find((part) => part.id === state.selectedPartId)?.label ?? null;
  state.lastError = null;
  if (sceneApi.moduleRoot) {
    sceneApi.scene.remove(sceneApi.moduleRoot);
    disposeObject(sceneApi.moduleRoot);
    sceneApi.moduleRoot = null;
  }
  if (sceneApi.sectionHelper) {
    sceneApi.scene.remove(sceneApi.sectionHelper);
    sceneApi.sectionHelper = null;
  }

  try {
    state.params = normalizeModuleParams(state.params) as ModuleParams;
    const group = state.descriptor.build(state.params, state.catalog);
    sceneApi.moduleRoot = group;
    sceneApi.scene.add(group);
    state.parts = collectParts(group);
    applyPreviousPartVisibility(state, previousVisibility);
    applySection(sceneApi, state);
    sceneApi.onPartSelect = (mesh) => {
      const part = state.parts.find((candidate) => candidate.mesh === mesh);
      if (!part?.visible) return;
      state.selectedPartId = part?.id ?? null;
      updateSelectedBox(sceneApi, mesh);
      const details = document.querySelector<HTMLElement>("[data-mi-details]");
      if (details) details.innerHTML = renderRightPanelMarkup(state);
    };
    restoreSelectedPart(sceneApi, state, selectedLabel);
    if (options.fitCamera) {
      fitCamera(sceneApi.camera, sceneApi.controls, group);
    } else if (viewSnapshot) {
      restoreSceneView(sceneApi, viewSnapshot);
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    state.parts = [];
    sceneApi.selectedBox.visible = false;
  }
}

function captureSceneView(sceneApi: ReturnType<typeof createScene>): SceneViewSnapshot {
  return {
    cameraPosition: sceneApi.camera.position.clone(),
    cameraQuaternion: sceneApi.camera.quaternion.clone(),
    cameraZoom: sceneApi.camera.zoom,
    controlsTarget: sceneApi.controls.target.clone()
  };
}

function restoreSceneView(sceneApi: ReturnType<typeof createScene>, snapshot: SceneViewSnapshot) {
  sceneApi.camera.position.copy(snapshot.cameraPosition);
  sceneApi.camera.quaternion.copy(snapshot.cameraQuaternion);
  sceneApi.camera.zoom = snapshot.cameraZoom;
  sceneApi.camera.updateProjectionMatrix();
  sceneApi.controls.target.copy(snapshot.controlsTarget);
  sceneApi.controls.update();
}

function applyPreviousPartVisibility(state: InspectorState, previousVisibility: Map<string, boolean>) {
  for (const part of state.parts) {
    const visible = previousVisibility.get(part.label);
    if (visible === undefined) continue;
    part.visible = visible;
    part.mesh.visible = visible;
  }
}

function restoreSelectedPart(sceneApi: ReturnType<typeof createScene>, state: InspectorState, selectedLabel: string | null) {
  if (!selectedLabel) {
    sceneApi.selectedBox.visible = false;
    return;
  }
  const selectedPart = state.parts.find((part) => part.label === selectedLabel && part.visible);
  if (!selectedPart) {
    state.selectedPartId = null;
    sceneApi.selectedBox.visible = false;
    return;
  }
  state.selectedPartId = selectedPart.id;
  updateSelectedBox(sceneApi, selectedPart.mesh);
}

function isObjectVisibleInHierarchy(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function applySection(sceneApi: ReturnType<typeof createScene>, state: InspectorState) {
  const s = state.section;
  if (!s.enabled) {
    sceneApi.renderer.clippingPlanes = [];
    return;
  }
  sceneApi.renderer.clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -s.minX * mmToM),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), s.maxX * mmToM),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -s.minY * mmToM),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), s.maxY * mmToM),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -s.minZ * mmToM),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), s.maxZ * mmToM)
  ];
  const box = new THREE.Box3(
    new THREE.Vector3(s.minX * mmToM, s.minY * mmToM, s.minZ * mmToM),
    new THREE.Vector3(s.maxX * mmToM, s.maxY * mmToM, s.maxZ * mmToM)
  );
  sceneApi.sectionHelper = new THREE.Box3Helper(box, 0xf59e0b);
  sceneApi.sectionHelper.visible = s.showBox;
  sceneApi.scene.add(sceneApi.sectionHelper);
}

function updateSelectedBox(sceneApi: ReturnType<typeof createScene>, mesh: THREE.Mesh) {
  sceneApi.selectedBox.setFromObject(mesh);
  sceneApi.selectedBox.visible = true;
}

function collectParts(root: THREE.Object3D): PartInfo[] {
  const parts: PartInfo[] = [];
  let index = 1;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const label = object.name || String(object.userData.partName ?? object.userData.id ?? `Object ${index}`);
    parts.push({ id: `part-${index}`, label, mesh: object, visible: object.visible });
    index += 1;
  });
  return parts;
}

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.4);
  const distance = maxDim / (2 * Math.tan((Math.PI * camera.fov) / 360));
  camera.position.copy(center).add(new THREE.Vector3(distance * 0.9, distance * 0.7, distance * 1.05));
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(10, distance * 100);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function applyContextBindings(state: InspectorState) {
  applyKitchenContextToModuleParams(state.params, state.ctx, state.catalog, state.modulePackage);
  state.bindings = collectBindings(state.modulePackage);
  syncMaterialSlotsToValidOptions(state);
}

function calculateBom(state: InspectorState): BOMResult | null {
  try {
    return state.descriptor.calculateBOM(state.params, state.ctx, state.catalog);
  } catch {
    return null;
  }
}

function getMaterialSlotViews(state: InspectorState): MaterialSlotView[] {
  const params = state.params as unknown as Record<string, unknown>;
  return getInspectorMaterialSlots(state)
    .map((slot) => {
      const meta = materialSlotMeta(slot);
      if (!meta) return null;
      const explicitMaterial = typeof params[meta.materialParamKey] === "string" ? params[meta.materialParamKey] as string : "";
      const assignments = ensureNestedRecord(params, "materialAssignments");
      const commercialSelections = ensureNestedRecord(params, "commercialSelections");
      const boardMaterials = ensureNestedRecord(commercialSelections, "boardMaterials");
      const boardThicknesses = ensureNestedRecord(commercialSelections, "boardThicknesses");
      const assignedMaterial = typeof assignments[slot.slotId] === "string" ? assignments[slot.slotId] as string : "";
      const commercialMaterial = typeof boardMaterials[slot.slotId] === "string" ? boardMaterials[slot.slotId] as string : "";
      const options = getMaterialOptionsForSlot(state.catalog, slot.slotId, meta.family);
      const rawMaterialId = explicitMaterial || assignedMaterial || commercialMaterial || getDefaultMaterialIdForSlot(state, slot, meta.family);
      const materialId = options.some((option) => option.id === rawMaterialId) ? rawMaterialId : options[0]?.id ?? rawMaterialId;
      const material = getMaterialById(state.catalog, materialId);
      const fallbackThickness = material?.defaultThicknessMm ?? 18;
      const explicitThickness = meta.thicknessParamKey && typeof params[meta.thicknessParamKey] === "number" ? params[meta.thicknessParamKey] as number : null;
      const commercialThickness = typeof boardThicknesses[slot.slotId] === "number" ? boardThicknesses[slot.slotId] as number : null;
      const thicknessMm = pickAllowedThickness(material, explicitThickness ?? commercialThickness ?? fallbackThickness);
      return {
        slotId: slot.slotId,
        label: slot.label,
        groupLabel: materialGroupLabel(slot.slotId),
        family: meta.family,
        materialParamKey: meta.materialParamKey,
        thicknessParamKey: meta.thicknessParamKey,
        materialId,
        thicknessMm,
        material,
        options,
        binding: [
          ...(state.bindings.get(meta.materialParamKey) ?? []),
          ...(meta.thicknessParamKey ? state.bindings.get(meta.thicknessParamKey) ?? [] : [])
        ]
      };
    })
    .filter((slot): slot is MaterialSlotView => slot !== null);
}

function materialSlotMeta(slot: ModuleMaterialSlot): {
  family: MaterialDefinition["boardFamily"];
  materialParamKey: string;
  thicknessParamKey: string | null;
} | null {
  if (slot.slotId === "carcass") return { family: "body", materialParamKey: "bodyMaterialId", thicknessParamKey: "boardThickness" };
  if (slot.slotId === "front") return { family: "front", materialParamKey: "frontMaterialId", thicknessParamKey: "frontThicknessMm" };
  if (slot.slotId === "back") return { family: "back", materialParamKey: "backMaterialId", thicknessParamKey: "backThickness" };
  if (slot.slotId === "shelf") return { family: "body", materialParamKey: "shelfMaterialId", thicknessParamKey: "shelfThickness" };
  if (slot.slotId === "drawer_bottom" || slot.slotId === "drawerBottom") return { family: "drawer_bottom", materialParamKey: "drawerBottomMaterialId", thicknessParamKey: "drawerBottomThickness" };
  if (slot.slotId === "plinth") return { family: "body", materialParamKey: "plinthMaterialId", thicknessParamKey: "plinthThickness" };
  if (slot.slotId === "worktop") return { family: "worktop", materialParamKey: "worktopMaterialId", thicknessParamKey: "worktopThicknessMm" };
  return null;
}

function materialGroupLabel(slotId: string): string {
  if (slotId === "carcass") return "Corpus";
  if (slotId === "front") return "Fronts";
  if (slotId === "back") return "Back";
  if (slotId === "shelf") return "Inner shelves";
  if (slotId === "drawer_bottom" || slotId === "drawerBottom") return "Drawer bottoms";
  if (slotId === "plinth") return "Plinth";
  if (slotId === "worktop") return "Worktop";
  return slotId;
}

function getInspectorMaterialSlots(state: InspectorState): ModuleMaterialSlot[] {
  const params = state.params as unknown as Record<string, unknown>;
  const slots = [...(state.modulePackage?.materials.slots ?? [])];
  const slotIds = new Set(slots.map((slot) => slot.slotId));
  if (!slotIds.has("back") && typeof params.backThickness === "number" && params.backThickness > 0) {
    slots.push({
      slotId: "back",
      label: "Back panel",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.backPanelMaterialId",
      allowedMaterialTags: ["back", "board"],
      affects: ["geometry", "visual", "bom", "pricing"]
    });
  }
  return slots;
}

function getDefaultMaterialIdForSlot(state: InspectorState, slot: ModuleMaterialSlot, family: MaterialDefinition["boardFamily"]): string {
  const defaults = state.catalog.kitchenDefaults;
  const fromDefault =
    slot.defaultFrom === "catalog.kitchenDefaults.frontMaterialId" ? defaults.frontMaterialId :
    slot.defaultFrom === "catalog.kitchenDefaults.worktopMaterialId" ? defaults.worktopMaterialId :
    slot.defaultFrom === "catalog.kitchenDefaults.backPanelMaterialId" ? defaults.backPanelMaterialId :
    slot.defaultFrom === "catalog.kitchenDefaults.drawerBottomMaterialId" ? defaults.drawerBottomMaterialId :
    slot.defaultFrom === "catalog.kitchenDefaults.plinthMaterialId" ? defaults.plinthMaterialId :
    slot.defaultFrom === "catalog.kitchenDefaults.carcassMaterialId" ? defaults.carcassMaterialId :
    undefined;
  const material = fromDefault ? getMaterialById(state.catalog, fromDefault) : null;
  if (material?.materialType === "board" && matchesMaterialFamily(material, family)) return material.id;
  return getMaterialOptionsForSlot(state.catalog, slot.slotId, family)[0]?.id ?? "";
}

function updateMaterialSlot(state: InspectorState, slotId: string, materialId: string | null, thicknessMm: number | null) {
  const slot = getInspectorMaterialSlots(state).find((candidate) => candidate.slotId === slotId);
  if (!slot) return;
  const meta = materialSlotMeta(slot);
  if (!meta) return;
  const params = state.params as unknown as Record<string, unknown>;
  const assignments = ensureNestedRecord(params, "materialAssignments");
  const commercialSelections = ensureNestedRecord(params, "commercialSelections");
  const boardMaterials = ensureNestedRecord(commercialSelections, "boardMaterials");
  const boardThicknesses = ensureNestedRecord(commercialSelections, "boardThicknesses");
  const currentMaterialId = materialId ?? String(params[meta.materialParamKey] ?? assignments[slotId] ?? boardMaterials[slotId] ?? "");
  const material = getMaterialById(state.catalog, currentMaterialId) ?? getMaterialOptionsForSlot(state.catalog, slotId, meta.family)[0] ?? null;
  if (!material) return;

  const resolvedThickness = pickAllowedThickness(material, thicknessMm ?? material.defaultThicknessMm);
  params[meta.materialParamKey] = material.id;
  assignments[slotId] = material.id;
  boardMaterials[slotId] = material.id;
  boardThicknesses[slotId] = resolvedThickness;
  syncCommercialPartSlots(slotId, boardMaterials, boardThicknesses, material.id, resolvedThickness);
  if (meta.thicknessParamKey) params[meta.thicknessParamKey] = resolvedThickness;
  applyMaterialAliases(params, slotId, material);
}

function syncCommercialPartSlots(
  slotId: string,
  boardMaterials: Record<string, unknown>,
  boardThicknesses: Record<string, unknown>,
  materialId: string,
  thicknessMm: number
) {
  for (const key of Object.keys(boardMaterials)) {
    if (!commercialSlotMatchesGroup(key, slotId)) continue;
    boardMaterials[key] = materialId;
    boardThicknesses[key] = thicknessMm;
  }
}

function commercialSlotMatchesGroup(slotKey: string, groupSlotId: string): boolean {
  const key = slotKey.toLowerCase();
  if (groupSlotId === "front") return key.includes("front") || key.includes("door");
  if (groupSlotId === "carcass") return key.includes("side") || key.includes("bottom") || key.includes("top") || key.includes("rail") || key.includes("carcass");
  if (groupSlotId === "back") return key.includes("back") && !key.includes("drawer");
  if (groupSlotId === "shelf") return key.includes("shelf");
  if (groupSlotId === "drawer_bottom") return key.includes("drawer") && key.includes("bottom");
  if (groupSlotId === "plinth") return key.includes("plinth") || key.includes("kick");
  if (groupSlotId === "worktop") return key.includes("worktop") || key.includes("table-top");
  return key === groupSlotId;
}

function applyMaterialAliases(params: Record<string, unknown>, slotId: string, material: MaterialDefinition) {
  const materials = ensureNestedRecord(params, "materials");
  const colorHex = material.preview.colorHex;
  if (slotId === "front") {
    params.frontColor = colorHex;
    materials.frontKey = material.id;
    materials.frontMaterialId = material.id;
    materials.frontName = material.displayName;
    materials.frontColor = colorHex;
  } else if (slotId === "back") {
    params.backColor = colorHex;
    materials.backKey = material.id;
    materials.backMaterialId = material.id;
    materials.backName = material.displayName;
    materials.backColor = colorHex;
  } else if (slotId === "shelf") {
    params.shelfColor = colorHex;
    materials.shelfMaterialId = material.id;
    materials.shelfName = material.displayName;
    materials.shelfColor = colorHex;
  } else if (slotId === "drawer_bottom") {
    params.drawerColor = colorHex;
    materials.drawerKey = material.id;
    materials.drawerMaterialId = material.id;
    materials.drawerName = material.displayName;
    materials.drawerColor = colorHex;
  } else if (slotId === "worktop") {
    materials.worktopMaterialId = material.id;
    materials.worktopName = material.displayName;
  } else {
    params.bodyColor = colorHex;
    materials.bodyKey = material.id;
    materials.bodyMaterialId = material.id;
    materials.bodyName = material.displayName;
    materials.bodyColor = colorHex;
    materials.backInsideColor = colorHex;
  }
}

function getMaterialById(catalog: ClientCatalog, materialId: string): MaterialDefinition | null {
  return catalog.materials.find((material) => material.id === materialId && material.materialType === "board") ?? null;
}

function getMaterialOptionsForSlot(catalog: ClientCatalog, slotId: string, family: MaterialDefinition["boardFamily"]): MaterialDefinition[] {
  return catalog.materials
    .filter((material): material is MaterialDefinition => material.materialType === "board" && material.isActive && matchesMaterialFamily(material, family))
    .filter((material) => isUsableMaterialForSlot(material, slotId))
    .sort((left, right) => materialOptionScore(left, slotId) - materialOptionScore(right, slotId) || left.displayName.localeCompare(right.displayName));
}

function matchesMaterialFamily(material: MaterialDefinition, family: MaterialDefinition["boardFamily"]) {
  if (family === "body") return material.boardFamily === "body";
  return material.boardFamily === family;
}

function isUsableMaterialForSlot(material: MaterialDefinition, slotId: string): boolean {
  if (slotId === "front") return material.defaultThicknessMm >= 12;
  if (slotId === "carcass" || slotId === "shelf" || slotId === "plinth") return material.defaultThicknessMm >= 8;
  return true;
}

function materialOptionScore(material: MaterialDefinition, slotId: string): number {
  const thickness = material.defaultThicknessMm;
  if (slotId === "front") return thickness >= 16 && thickness <= 22 ? 0 : thickness >= 12 && thickness <= 26 ? 10 : 100 + Math.abs(thickness - 18);
  if (slotId === "carcass" || slotId === "shelf") return Math.abs(thickness - 18);
  if (slotId === "back" || slotId === "drawer_bottom") return Math.abs(thickness - 8);
  if (slotId === "worktop") return Math.abs(thickness - 38);
  return Math.abs(thickness - 18);
}

function syncMaterialSlotsToValidOptions(state: InspectorState) {
  for (const slot of getInspectorMaterialSlots(state)) {
    const meta = materialSlotMeta(slot);
    if (!meta) continue;
    const params = state.params as unknown as Record<string, unknown>;
    const assignments = ensureNestedRecord(params, "materialAssignments");
    const selected = String(params[meta.materialParamKey] ?? assignments[slot.slotId] ?? "");
    const options = getMaterialOptionsForSlot(state.catalog, slot.slotId, meta.family);
    if (options.length === 0 || options.some((option) => option.id === selected)) continue;
    updateMaterialSlot(state, slot.slotId, options[0]!.id, options[0]!.defaultThicknessMm);
  }
}

function getThicknessOptions(material: MaterialDefinition | null, selected: number): number[] {
  const options = material?.availableThicknessesMm?.filter((value) => Number.isFinite(value) && value > 0) ?? [];
  return [...new Set([...options, selected, material?.defaultThicknessMm ?? selected])]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
}

function pickAllowedThickness(material: MaterialDefinition | null, requested: number): number {
  const options = getThicknessOptions(material, requested);
  if (options.includes(requested)) return requested;
  return [...options].sort((left, right) => Math.abs(left - requested) - Math.abs(right - requested))[0] ?? requested;
}

function probeAllModules(state: InspectorState): ModuleProbeResult[] {
  return moduleDescriptors.map((descriptor) => {
    const modulePackage = getPackage(descriptor.type);
    const params = descriptor.defaultParams();
    try {
      applyKitchenContextToModuleParams(params, state.ctx, state.catalog, modulePackage);
      normalizeModuleParams(params);
      const group = descriptor.build(params, state.catalog);
      const partCount = collectParts(group).length;
      const bom = descriptor.calculateBOM(params, state.ctx, state.catalog);
      disposeObject(group);
      return {
        type: descriptor.type,
        label: descriptor.label,
        ok: partCount > 0 && Number.isFinite(bom.pricing.finalPrice),
        partCount,
        itemCount: bom.pricing.items.length,
        price: bom.pricing.finalPrice
      };
    } catch (error) {
      return {
        type: descriptor.type,
        label: descriptor.label,
        ok: false,
        partCount: 0,
        itemCount: 0,
        price: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

function readCurrentMaterialProbe(state: InspectorState, slotId: string): Record<string, unknown> | null {
  const slot = state.modulePackage?.materials.slots.find((candidate) => candidate.slotId === slotId);
  if (!slot) return null;
  const meta = materialSlotMeta(slot);
  if (!meta) return null;
  const params = state.params as unknown as Record<string, unknown>;
  const assignments = ensureNestedRecord(params, "materialAssignments");
  const commercialSelections = ensureNestedRecord(params, "commercialSelections");
  const boardMaterials = ensureNestedRecord(commercialSelections, "boardMaterials");
  const boardThicknesses = ensureNestedRecord(commercialSelections, "boardThicknesses");
  const currentMaterialId = String(params[meta.materialParamKey] ?? assignments[slotId] ?? boardMaterials[slotId] ?? "");
  const candidateMeshes = state.parts.map((part) => part.mesh).filter((mesh) => isMeshForMaterialSlot(mesh, slotId, meta));
  const mesh =
    candidateMeshes.find((candidate) => candidate.userData.catalogMaterialId === currentMaterialId || firstMeshMaterial(candidate)?.userData.catalogMaterialId === currentMaterialId) ??
    candidateMeshes[0] ??
    null;
  const material = mesh ? firstMeshMaterial(mesh) : null;
  return {
    slotId,
    paramMaterialId: params[meta.materialParamKey] ?? null,
    assignmentMaterialId: assignments[slotId] ?? null,
    commercialMaterialId: boardMaterials[slotId] ?? null,
    thicknessMm: meta.thicknessParamKey ? params[meta.thicknessParamKey] ?? null : boardThicknesses[slotId] ?? null,
    meshName: mesh?.name ?? null,
    meshDimensionsMm: mesh?.userData.dimensionsMm ?? null,
    catalogMaterialId: mesh?.userData.catalogMaterialId ?? material?.userData.catalogMaterialId ?? null,
    catalogMaterialName: mesh?.userData.catalogMaterialName ?? material?.userData.catalogMaterialName ?? null,
    renderColorHex: mesh?.userData.renderColorHex ?? material?.userData.renderColorHex ?? materialColorHex(material)
  };
}

function readSceneSnapshot(sceneApi: ReturnType<typeof createScene>, state: InspectorState): Record<string, unknown> | null {
  return {
    cameraPosition: sceneApi.camera.position.toArray(),
    cameraQuaternion: sceneApi.camera.quaternion.toArray(),
    cameraZoom: sceneApi.camera.zoom,
    controlsTarget: sceneApi.controls.target.toArray(),
    hiddenLabels: state.parts.filter((part) => !part.visible).map((part) => part.label),
    selectedLabel: state.parts.find((part) => part.id === state.selectedPartId)?.label ?? null
  };
}

function firstMeshMaterial(mesh: THREE.Mesh): THREE.Material | null {
  if (Array.isArray(mesh.material)) return mesh.material[0] ?? null;
  return mesh.material ?? null;
}

function materialColorHex(material: THREE.Material | null): string | null {
  const withColor = material as THREE.Material & { color?: THREE.Color };
  return withColor.color ? `#${withColor.color.getHexString()}` : null;
}

function roleForSlot(slotId: string): string {
  if (slotId === "carcass") return "body";
  if (slotId === "drawer_bottom") return "drawer_bottom";
  return slotId;
}

function isMeshForMaterialSlot(
  mesh: THREE.Mesh,
  slotId: string,
  meta: NonNullable<ReturnType<typeof materialSlotMeta>>
): boolean {
  const materialGroup = String(mesh.userData.materialGroup ?? "");
  const materialRole = String(mesh.userData.materialRole ?? "");
  const name = mesh.name.toLowerCase();
  const paramKeys = Array.isArray(mesh.userData.paramKeys) ? mesh.userData.paramKeys.map(String) : [];
  if (materialGroup === slotId || materialRole === roleForSlot(slotId)) return true;
  if (paramKeys.includes(meta.materialParamKey) || (meta.thicknessParamKey && paramKeys.includes(meta.thicknessParamKey))) return true;
  if (slotId === "front") return /front|drawer|door|headboard|cladding|relief/.test(name);
  if (slotId === "back") return /back/.test(name);
  if (slotId === "shelf") return /shelf/.test(name);
  if (slotId === "worktop") return /worktop|table_top|top/.test(name);
  if (slotId === "drawer_bottom") return /drawer.*bottom/.test(name);
  if (slotId === "plinth") return /plinth|kick/.test(name);
  if (slotId === "carcass") return materialGroup === "body" || materialRole === "body" || /side|bottom|top|rail|body/.test(name);
  return false;
}

function collectBindings(modulePackage: FurnQuoteModulePackage | null): Map<string, BindingInfo[]> {
  const result = new Map<string, BindingInfo[]>();
  for (const binding of modulePackage?.behavior?.contextBindings ?? []) {
    for (const rule of binding.parameterSync ?? []) {
      addBinding(result, rule.targetParameter, {
        kind: "parameter",
        target: rule.targetParameter,
        source: rule.source,
        detail: `parameter sync${rule.transform ? `, transform ${rule.transform}` : ""}`
      });
    }
    for (const rule of binding.materialSync ?? []) {
      const target = rule.targetParameter ?? rule.targetSlot ?? rule.family;
      addBinding(result, target, {
        kind: "material",
        target,
        source: rule.source,
        detail: `material family ${rule.family}${rule.thicknessParameter ? `, thickness -> ${rule.thicknessParameter}` : ""}`
      });
      if (rule.thicknessParameter) addBinding(result, rule.thicknessParameter, {
        kind: "material",
        target: rule.thicknessParameter,
        source: `${rule.source}.defaultThicknessMm`,
        detail: `thickness from selected ${rule.family} material`
      });
    }
    for (const rule of binding.componentSync ?? []) {
      addBinding(result, rule.targetParameter, {
        kind: "component",
        target: rule.targetParameter,
        source: rule.source,
        detail: `component sync${rule.transforms?.length ? `, transforms ${rule.transforms.join(", ")}` : ""}`
      });
    }
    for (const rule of binding.commercialSelectionSync ?? []) {
      addBinding(result, "commercialSelections", {
        kind: "commercial",
        target: "commercialSelections",
        source: rule.source,
        detail: `updates material slots${rule.dynamicSlots?.length ? " including dynamic slots" : ""}`
      });
    }
  }
  return result;
}

function addBinding(map: Map<string, BindingInfo[]>, key: string, value: BindingInfo) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

function getParameterDefinitions(state: InspectorState): ModuleParameterDefinition[] {
  const params = state.params as unknown as Record<string, unknown>;
  const definitions = new Map<string, ModuleParameterDefinition>();
  const materialKeys = new Set(getMaterialSlotViews(state).flatMap((slot) => [
    slot.materialParamKey,
    slot.thicknessParamKey,
    "materials",
    "materialAssignments",
    "commercialSelections",
    "bodyMaterialGroup",
    "frontMaterialGroup",
    "backMaterialGroup",
    "shelfMaterialGroup",
    "worktopMaterialGroup",
    "drawerBoxMaterialGroup"
  ].filter((key): key is string => typeof key === "string")));
  for (const definition of state.modulePackage?.parameters.parameters ?? []) definitions.set(definition.key, definition);
  for (const [key, value] of Object.entries(params)) {
    if (definitions.has(key)) continue;
    definitions.set(key, {
      key,
      label: key,
      type: inferParameterType(key, value),
      group: key === "type" ? "system" : "runtime",
      affects: "all"
    });
  }
  return [...definitions.values()]
    .filter((definition) => !materialKeys.has(definition.key))
    .sort((left, right) => (left.group ?? "").localeCompare(right.group ?? "") || left.key.localeCompare(right.key));
}

function groupParameterDefinitions(definitions: ModuleParameterDefinition[]) {
  const groups = new Map<string, { label: string; params: ModuleParameterDefinition[] }>();
  for (const definition of definitions) {
    const groupId = definition.group ?? "parameters";
    const group = groups.get(groupId) ?? { label: groupId, params: [] };
    group.params.push(definition);
    groups.set(groupId, group);
  }
  return [...groups.values()];
}

function inferParameterType(key: string, value: unknown): ModuleParameterDefinition["type"] {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (key.toLowerCase().includes("materialid")) return "material";
  if (key.toLowerCase().includes("componentid")) return "component";
  return "string";
}

function updateParamFromInput(state: InspectorState, key: string, input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const params = state.params as unknown as Record<string, unknown>;
  const current = params[key];
  if (input instanceof HTMLInputElement && input.type === "checkbox") {
    params[key] = input.checked;
  } else if (input instanceof HTMLInputElement && input.type === "number") {
    params[key] = Number(input.value);
  } else if (input instanceof HTMLTextAreaElement) {
    try {
      params[key] = JSON.parse(input.value);
    } catch {
      params[key] = input.value;
    }
  } else if (typeof current === "number") {
    params[key] = Number(input.value);
  } else {
    params[key] = input.value;
  }
}

function getPackage(type: ModuleType): FurnQuoteModulePackage | null {
  return packageByType.get(type) ?? null;
}

function ensureNestedRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function formatDimensions(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const record = value as Record<string, unknown>;
  const length = record.length ?? record.widthMm ?? record.width;
  const width = record.width ?? record.depthMm ?? record.depth;
  const thickness = record.thickness ?? record.thicknessMm;
  return [length, width, thickness].filter((item) => item != null).join(" x ") + " mm";
}

function formatMaterial(data: Record<string, unknown>): string {
  return String(data.catalogMaterialName ?? data.materialName ?? data.catalogMaterialId ?? data.materialGroup ?? "unknown");
}

function formatParamKeys(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "unknown";
}

function makeItemFormula(item: NonNullable<BOMResult["pricing"]>["items"][number]): string {
  if (item.itemType === "board" && item.dimensionsMm) {
    return `${item.dimensionsMm.length} x ${item.dimensionsMm.width} / 1000000 x ${item.quantity} = ${(item.metrics?.areaM2 ?? 0).toFixed(4)} m2; ${item.pricingQuantity.toFixed(4)} x ${item.unitPrice ?? 0} = ${(item.itemCost ?? 0).toFixed(2)}`;
  }
  if (item.itemType === "edge_band") {
    return `${(item.metrics?.edgeLengthLm ?? item.pricingQuantity).toFixed(3)} lm x ${item.unitPrice ?? 0} = ${(item.itemCost ?? 0).toFixed(2)}`;
  }
  return `${item.quantity} pcs x ${item.unitPrice ?? 0} = ${(item.itemCost ?? 0).toFixed(2)}`;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}

function mustQuery<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char));
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
