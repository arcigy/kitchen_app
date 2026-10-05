// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCurrentLanguage } from "../i18n";
import {
  createDefaultProjectMarginSettingsState,
  projectMarginTargetId
} from "../core/project-margins/project-margin-types";
import type {
  ProjectMarginGroupView,
  ProjectMarginItemView,
  ProjectMarginsView
} from "../layout/bom/projectMargins";
import { mountProjectMarginsPanel, renderProjectMarginsPanel } from "./marginsPhasePanel";

const target = { scopeId: "module:base-1", itemId: "left-side", category: "corpus" as const };

function marginItem(overrides: Partial<ProjectMarginItemView> = {}): ProjectMarginItemView {
  const itemTarget = {
    scopeId: overrides.scopeId ?? target.scopeId,
    itemId: overrides.itemId ?? target.itemId,
    category: overrides.category ?? target.category
  };
  return {
    ...itemTarget,
    targetId: projectMarginTargetId(itemTarget),
    label: "Ľavý bok",
    scopeLabel: "Spodná skrinka <A>",
    resourceLabel: "DTDL biela & matná",
    quantity: 1.25,
    unit: "m2",
    baseCost: 100,
    marginPercent: 30,
    marginAmount: 30,
    finalPrice: 130,
    source: "override",
    missingPrice: false,
    ...overrides
  };
}

function marginGroup(item = marginItem(), overrides: Partial<ProjectMarginGroupView> = {}): ProjectMarginGroupView {
  return {
    category: "corpus",
    label: "Korpus",
    description: "Korpusové dosky",
    baseCost: item.baseCost,
    marginPercent: 15,
    combinedMarginPercent: item.baseCost === 0 ? 0 : 30,
    marginAmount: item.marginAmount,
    finalPrice: item.finalPrice,
    overrideCount: item.source === "override" ? 1 : 0,
    missingPriceCount: item.missingPrice ? 1 : 0,
    items: [item],
    ...overrides
  };
}

function marginsView(overrides: Partial<ProjectMarginsView> = {}): ProjectMarginsView {
  const item = marginItem();
  const group = marginGroup(item);
  const settings = {
    ...createDefaultProjectMarginSettingsState(),
    initialized: true,
    revision: 4,
    groupMargins: { corpus: 15 },
    itemOverrides: [{ ...target, targetId: projectMarginTargetId(target), marginPercent: 30 }]
  };
  return {
    revision: 4,
    editable: true,
    currency: "EUR",
    priceAuthority: "Autoritatívne nákupné ceny",
    settings,
    summary: {
      baseCost: 100,
      marginAmount: 30,
      combinedMarginPercent: 30,
      finalPrice: 130,
      overrideCount: 2,
      missingPriceCount: 0
    },
    groups: [group],
    warnings: [],
    ...overrides
  };
}

beforeEach(() => setCurrentLanguage("sk"));
afterEach(() => {
  setCurrentLanguage("en");
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function searchPanel(view: ProjectMarginsView, footer = document.createElement("section")) {
  const host = document.createElement("section");
  document.body.append(host, footer);
  const onCommitManufacturing = vi.fn(async () => ({ ok: true }));
  const handle = mountProjectMarginsPanel(host, view, {
    onCommitDefault: vi.fn(async () => ({ ok: true })),
    onCommitAdditionalLabor: vi.fn(async () => ({ ok: true })),
    onCommitManufacturing,
    onApplyGroup: vi.fn(async () => ({ ok: true })),
    onResetGroup: vi.fn(async () => ({ ok: true })),
    onCommitItem: vi.fn(async () => ({ ok: true })),
    onResetItem: vi.fn(async () => ({ ok: true }))
  }, { footerContainer: footer });
  handle.setInputsDisabled(false);
  const click = (selector: string) => host.querySelector<HTMLButtonElement>(selector)!.click();
  const search = (query: string) => {
    const input = host.querySelector<HTMLInputElement>("[data-margin-search]")!;
    input.value = query; input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return { host, footer, handle, click, search, onCommitManufacturing };
}

describe("compact searchable margins", () => {
  it("keeps expanded project settings and their draft when searching, updating and switching tabs", () => {
    const panel = searchPanel(marginsView());
    const settings = () => panel.host.querySelector<HTMLDetailsElement>("[data-margin-project-controls]")!;
    expect(settings().open).toBe(false);
    expect(settings().querySelector("summary")?.textContent).toContain("Projektové sadzby");
    settings().open = true;
    panel.host.querySelector<HTMLInputElement>("[data-margin-default-input]")!.value = "42";
    panel.search("Korpus");
    expect(settings().open).toBe(true);
    panel.handle.update(marginsView());
    expect(settings().open).toBe(true);
    panel.click('[data-margin-settings-tab="modules"]');
    panel.click('[data-margin-settings-tab="general"]');
    expect(settings().open).toBe(true);
    expect(panel.host.querySelector<HTMLInputElement>("[data-margin-default-input]")!.value).toBe("42");
    settings().open = false;
    panel.handle.update(marginsView());
    expect(settings().open).toBe(false);
    panel.handle.destroy();
  });
  it("saves visible manufacturing controls with a real external summary footer", async () => {
    const view = marginsView();
    view.settings.manufacturing.boardWastePercent = 11;
    view.settings.manufacturing.edgeWastePercent = 4;
    const panel = searchPanel(view);
    panel.host.querySelector<HTMLInputElement>("[data-manufacturing-enabled]")!.checked = true;
    panel.host.querySelector<HTMLInputElement>("[data-manufacturing-board-waste]")!.value = "22";
    panel.click("[data-manufacturing-save]");
    await panel.handle.flushPending();
    expect(panel.onCommitManufacturing).toHaveBeenCalledWith({ manufacturing: expect.objectContaining({ pricingMode: "configured", boardWastePercent: 22, edgeWastePercent: 4 }) });
    expect(panel.footer.querySelector("[data-manufacturing-settings]")).toBeNull();
    panel.handle.destroy();
  });

  it("keeps navigation before the scroll and renders only the selected cabinet's preassembly", () => {
    const items = Array.from({ length: 100 }, (_, index) => marginItem({ scopeId: `module:scope-${index}`, scopeLabel: `Skrinka ${index + 1}` }));
    const panel = searchPanel(marginsView({ groups: [marginGroup(items[0], { items })] }));
    expect(panel.host.querySelectorAll("[data-preassembly-instance]")).toHaveLength(0);
    expect(panel.host.querySelector("[data-margin-settings-scroll] [data-margin-settings-tab]")).toBeNull();
    panel.click('[data-margin-settings-tab="modules"]');
    expect(panel.host.querySelectorAll("[data-preassembly-instance]")).toHaveLength(1);
    expect(panel.host.querySelectorAll("[data-margin-scope-select] option")).toHaveLength(100);
    panel.search("100");
    expect(panel.host.querySelectorAll("[data-margin-scope-select] option")).toHaveLength(1);
    expect(panel.host.querySelector("[data-preassembly-instance]")?.getAttribute("data-preassembly-instance")).toBe("scope-99");
    panel.handle.destroy();
  });

  it("finds accents, material names and multiword queries; reports empty results and clears filters", () => {
    const item = marginItem({ source: "group", missingPrice: true, scopeId: "module:second", scopeLabel: "Horná skrinka", resourceLabel: "Dub prírodný" });
    const panel = searchPanel(marginsView({ groups: [marginGroup(marginItem(), { items: [marginItem(), item] })] }));
    panel.click('[data-margin-settings-tab="modules"]');
    panel.search("HORNA prirodny");
    expect(panel.host.querySelectorAll("[data-margin-item-id]")).toHaveLength(1);
    expect(panel.host.querySelector("[data-margin-item-id]")?.getAttribute("data-margin-item-id")).toBe(item.targetId);
    const filter = panel.host.querySelector<HTMLSelectElement>("[data-margin-filter]")!;
    filter.value = "override"; filter.dispatchEvent(new Event("change", { bubbles: true }));
    expect(panel.host.textContent).toContain("Nenašli sa žiadne položky");
    panel.click("[data-margin-search-clear]");
    expect(panel.host.querySelector<HTMLInputElement>("[data-margin-search]")!.value).toBe("");
    expect(panel.host.querySelector<HTMLSelectElement>("[data-margin-filter]")!.value).toBe("all");
    panel.handle.destroy();
  });

  it("retains drafts across tabs and saves selected preassembly without clearing project rates or other cabinets", async () => {
    const first = marginItem(), second = marginItem({ scopeId: "module:second" });
    const view = marginsView({ groups: [marginGroup(first, { items: [first, second] })] });
    view.settings.manufacturing.pricingMode = "configured";
    view.settings.manufacturing.boardWastePercent = 12;
    view.settings.manufacturing.edgeWastePercent = 5;
    view.settings.manufacturing.preassemblyByInstanceId = { "base-1": 100, second: 200 };
    const panel = searchPanel(view);
    panel.host.querySelector<HTMLInputElement>("[data-margin-default-input]")!.value = "19";
    panel.click('[data-margin-settings-tab="modules"]');
    panel.host.querySelector<HTMLInputElement>("[data-preassembly-instance]")!.value = "150";
    panel.click('[data-margin-settings-tab="general"]');
    expect(panel.host.querySelector<HTMLInputElement>("[data-margin-default-input]")!.value).toBe("19");
    panel.click('[data-margin-settings-tab="modules"]');
    expect(panel.host.querySelector<HTMLInputElement>("[data-preassembly-instance]")!.value).toBe("150");
    panel.click("[data-manufacturing-save]");
    await panel.handle.flushPending();
    expect(panel.onCommitManufacturing).toHaveBeenCalledWith({ manufacturing: { ...view.settings.manufacturing, preassemblyByInstanceId: { "base-1": 150, second: 200 } } });
    panel.handle.destroy();
  });
});

describe("project margins phase panel", () => {
  it("keeps the numeric margin per area visible with a preliminary label and price warnings", () => {
    const html = renderProjectMarginsPanel(marginsView({
      summary: { ...marginsView().summary, missingPriceCount: 1,
        sheetMaterial: { minimumThicknessMm: 16, areaM2: 3, marginPerM2: 10, unmeasuredBoardCount: 1, preliminary: true } },
      warnings: [{ code: "missing_price", message: "Chýbajúca cena výsuvu" }]
    }));
    const host = document.createElement("div"); host.innerHTML = html;
    const metric = host.querySelector('[data-margin-summary-value="margin-per-m2"]')!;
    expect(metric.querySelector("strong")!.textContent).toContain("10,00");
    expect(metric.querySelector("[data-margin-sheet-preliminary]")!.textContent).toBe("Priebežná hodnota");
    expect(html).toContain("Chýbajúca cena výsuvu");
  });

  it("preserves saved material rates and recipes when re-enabling manufacturing after Materials turned it off", async () => {
    const host = document.createElement("section");
    document.body.append(host);
    const view = marginsView();
    view.settings.manufacturing = {
      ...view.settings.manufacturing,
      pricingMode: "legacy",
      boardWastePercent: 12,
      edgeWastePercent: 5,
      boardWasteByMaterialId: { "special-board": 7 },
      edgeWasteByMaterialId: { "special-edge": 8 },
      preassemblyByModuleType: { base: 22 },
      preassemblyByPreset: { preset: 11 },
      preassemblyByInstanceId: { "base-1": 0 },
      recipeSnapshots: { layered: { id: "layered", version: 1, name: "Layered board", layers: [{ id: "a", materialId: "special-board", thicknessMm: 18, unitPrice: 70 }], operations: [] } }
    };
    const original = structuredClone(view.settings.manufacturing);
    const action = vi.fn(async () => ({ ok: true }));
    const onCommitManufacturing = vi.fn(async () => ({ ok: true }));
    const handle = mountProjectMarginsPanel(host, view, {
      onCommitDefault: action, onCommitAdditionalLabor: action, onApplyGroup: action,
      onResetGroup: action, onCommitItem: action, onResetItem: action, onCommitManufacturing
    });
    handle.setInputsDisabled(false);
    host.querySelector<HTMLInputElement>("[data-manufacturing-enabled]")!.checked = true;
    host.querySelector<HTMLInputElement>("[data-manufacturing-board-waste]")!.value = "30";
    host.querySelector<HTMLButtonElement>("[data-manufacturing-save]")!.click();
    await handle.flushPending();
    expect(onCommitManufacturing).toHaveBeenCalledExactlyOnceWith({
      manufacturing: { ...original, pricingMode: "configured", boardWastePercent: 30 }
    });
    expect(view.settings.manufacturing).toEqual(original);
    handle.destroy();
  });

  it("keeps the original summary for tenants without the Delfi metric", () => {
    const html = renderProjectMarginsPanel(marginsView());
    expect(html).not.toContain('data-margin-summary-value="margin-per-m2"');
    expect(html).not.toContain("margins-summary--sheet-metric");
  });

  it("shows margin per physical square meter with its denominator and updates the mounted footer", () => {
    const host = document.createElement("section");
    const footer = document.createElement("section");
    document.body.append(host, footer);
    const action = vi.fn(async () => ({ ok: true }));
    const delfiSummary = { ...marginsView().summary, sheetMaterial: { minimumThicknessMm: 16, areaM2: 1.25, marginPerM2: 24, unmeasuredBoardCount: 0 } };
    const handle = mountProjectMarginsPanel(host, marginsView({ summary: delfiSummary }), {
      onCommitDefault: action, onCommitAdditionalLabor: action, onApplyGroup: action,
      onResetGroup: action, onCommitItem: action, onResetItem: action
    }, { footerContainer: footer });
    const metric = () => footer.querySelector('[data-margin-summary-value="margin-per-m2"]')!;
    expect(metric().textContent).toContain("24,00");
    expect(metric().textContent).toContain("1,25 m²");
    expect(metric().textContent).toContain("16 mm");
    expect(metric().textContent).toContain("vrátane doplnkov a spotrebičov");
    handle.update(marginsView({ currency: "CZK", summary: { ...delfiSummary, sheetMaterial: { ...delfiSummary.sheetMaterial, marginPerM2: 100, areaM2: 2 } } }));
    expect(metric().textContent).toContain("100,00");
    expect(metric().textContent).toContain("Kč");
    expect(metric().textContent).toContain("2 m²");
    expect(action).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("explains empty and incomplete measurements without displaying NaN or Infinity", () => {
    const summary = { ...marginsView().summary, sheetMaterial: { minimumThicknessMm: 16, areaM2: 0, marginPerM2: null, unmeasuredBoardCount: 0 } };
    const empty = renderProjectMarginsPanel(marginsView({ summary }));
    expect(empty).toContain("Projekt neobsahuje dosky");
    const incomplete = renderProjectMarginsPanel(marginsView({ summary: { ...summary, sheetMaterial: { ...summary.sheetMaterial, unmeasuredBoardCount: 1 } } }));
    expect(incomplete).toContain("chýba platná hrúbka alebo plocha");
    expect(incomplete).not.toMatch(/NaN|Infinity/);
  });

  it("renders all client-profile CZK monetary values and the labor input in CZK", () => {
    const html = renderProjectMarginsPanel(marginsView({ currency: "CZK" }));

    expect(html).toContain("100,00");
    expect(html).toContain("Kč");
    expect(html).toContain(">CZK</span>");
    expect(html).not.toContain("€");
  });

  it("renders the same General, Module and Additions hierarchy used by Materials", () => {
    const html = renderProjectMarginsPanel(marginsView());

    expect(html).toContain('data-margin-summary-value="base-cost"');
    expect(html).toContain('data-margin-summary-value="margin-amount"');
    expect(html).toContain('data-margin-summary-value="combined-margin-percent"');
    expect(html).toContain('data-margin-summary-value="final-price"');
    expect(html).toContain('data-margin-settings-tab="general"');
    expect(html).toContain('data-margin-settings-tab="modules"');
    expect(html).toContain('data-margin-settings-tab="additions"');
    expect(html).toContain('data-margin-settings-scroll');
    expect(html).toContain('class="materials-settings-tab materials-settings-tab--active"');
    expect(html).toContain('data-margin-settings-panel="general"');
    expect(html).toContain('data-margin-group="corpus"');
    expect(html).not.toContain('data-margin-item-id=');
  });

  it("renders a selected module in material-style category groups and escapes tenant-controlled labels", () => {
    const html = renderProjectMarginsPanel(marginsView(), {
      activeSettingsTab: "modules",
      selectedScopeId: "module:base-1"
    });

    expect(html).toContain(`data-margin-item-id="${projectMarginTargetId(target)}"`);
    expect(html).toContain('data-margin-source="override"');
    expect(html).toContain('data-margin-settings-panel="modules"');
    expect(html).toContain('data-margin-scope-select="true"');
    expect(html).toContain('class="materials-scope-group margins-scope-group"');
    expect(html).toContain('data-margin-item-input=');
    expect(html).toContain('data-margin-item-reset=');
    expect(html).toContain("Spodná skrinka &lt;A&gt;");
    expect(html).toContain("DTDL biela &amp; matná");
    expect(html).not.toContain("Spodná skrinka <A>");
  });

  it("keeps modules and additions separated and selects one scope at a time", () => {
    const first = marginItem();
    const second = marginItem({ scopeId: "module:base-2", scopeLabel: "Horná skrinka", itemId: "top" });
    const addition = marginItem({ scopeId: "addition:worktop-1", scopeLabel: "Pracovná doska", itemId: "worktop", category: "worktop" });
    const view = marginsView({
      groups: [
        marginGroup(first, { items: [first, second] }),
        marginGroup(addition, { category: "worktop", label: "Pracovná doska", items: [addition] })
      ]
    });

    const moduleHtml = renderProjectMarginsPanel(view, { activeSettingsTab: "modules", selectedScopeId: "module:base-2" });
    expect(moduleHtml).toContain("Horná skrinka");
    expect(moduleHtml).toContain(`data-margin-item-id="${second.targetId}"`);
    expect(moduleHtml).not.toContain(`data-margin-item-id="${first.targetId}"`);
    expect(moduleHtml).not.toContain(`data-margin-item-id="${addition.targetId}"`);

    const additionHtml = renderProjectMarginsPanel(view, { activeSettingsTab: "additions", selectedScopeId: "addition:worktop-1" });
    expect(additionHtml).toContain('data-margin-settings-panel="additions"');
    expect(additionHtml).toContain("Pracovná doska");
    expect(additionHtml).toContain(`data-margin-item-id="${addition.targetId}"`);
    expect(additionHtml).not.toContain(`data-margin-item-id="${first.targetId}"`);
  });

  it("shows the known subtotal and an exclamation mark for partially assigned runner heights", () => {
    const priced = marginItem({ category: "runner", baseCost: 100, marginAmount: 30, finalPrice: 130, missingPrice: false });
    const missing = marginItem({ category: "runner", itemId: "runner-unassigned", baseCost: 0, marginAmount: 0, finalPrice: 0, missingPrice: true });
    const view = marginsView({ groups: [marginGroup(priced, { category: "runner", items: [priced, missing], missingPriceCount: 1 })] });
    const host = document.createElement("div"); host.innerHTML = renderProjectMarginsPanel(view);
    const group = host.querySelector('[data-margin-group="runner"]')!;
    expect(group.textContent).toContain("100,00");
    expect(group.textContent).toContain("130,00");
    expect(group.querySelectorAll('[aria-label="Neúplná cena"]')).toHaveLength(2);
    expect(group.querySelector('[aria-label="Neúplná cena"]')?.textContent).toBe("!");
  });

  it("shows missing-price state and disables every edit control for read-only users", () => {
    const missing = marginItem({ baseCost: 0, marginAmount: 0, finalPrice: 0, missingPrice: true });
    const view = marginsView({
      editable: false,
      summary: { ...marginsView().summary, missingPriceCount: 1 },
      groups: [marginGroup(missing, { missingPriceCount: 1 })]
    });
    const generalHtml = renderProjectMarginsPanel(view);
    const moduleHtml = renderProjectMarginsPanel(view, {
      activeSettingsTab: "modules",
      selectedScopeId: "module:base-1"
    });

    expect(generalHtml).toContain('role="alert"');
    expect(generalHtml).toContain("1 položiek nemá cenu");
    expect(generalHtml).toContain("iba na čítanie");
    expect(generalHtml).toMatch(/data-margin-group-input="corpus"[^>]*disabled/);
    expect(moduleHtml).toMatch(/data-margin-item-input="[^"]+"[^>]*disabled/);
  });

  it("commits project, group and item edits and resets overrides through stable IDs", async () => {
    const host = document.createElement("section");
    const footer = document.createElement("section");
    document.body.append(host, footer);
    const actions = {
      onCommitDefault: vi.fn(async () => ({ ok: true })),
      onCommitAdditionalLabor: vi.fn(async () => ({ ok: true })),
      onApplyGroup: vi.fn(async () => ({ ok: true })),
      onResetGroup: vi.fn(async () => ({ ok: true })),
      onCommitItem: vi.fn(async () => ({ ok: true })),
      onResetItem: vi.fn(async () => ({ ok: true }))
    };
    const handle = mountProjectMarginsPanel(host, marginsView({ currency: "CZK" }), actions, { footerContainer: footer });
    handle.setInputsDisabled(false);

    expect(host.querySelector("[data-margin-summary]")).toBeNull();
    expect(host.querySelector(".margins-project-controls")).not.toBeNull();
    expect(footer.querySelector("[data-margin-summary]")?.textContent).toContain("Kč");
    expect(footer.querySelector(".margins-project-controls")).toBeNull();

    const defaultInput = host.querySelector<HTMLInputElement>("[data-margin-default-input]")!;
    defaultInput.value = "22.5";
    defaultInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await handle.flushPending();
    expect(actions.onCommitDefault).toHaveBeenCalledWith({ marginPercent: 22.5, committedValue: 20 });

    const laborInput = host.querySelector<HTMLInputElement>("[data-margin-additional-labor-input]")!;
    laborInput.value = "125.75";
    host.querySelector<HTMLButtonElement>("[data-margin-additional-labor-save]")!.click();
    await handle.flushPending();
    expect(actions.onCommitAdditionalLabor).toHaveBeenCalledWith({ additionalLaborCost: 125.75, committedValue: 0 });

    const groupInput = host.querySelector<HTMLInputElement>('[data-margin-group-input="corpus"]')!;
    groupInput.value = "18.5";
    host.querySelector<HTMLButtonElement>('[data-margin-group-apply-all="corpus"]')!.click();
    await handle.flushPending();
    expect(actions.onApplyGroup).toHaveBeenCalledWith({ groupId: "corpus", marginPercent: 18.5, committedValue: 15 });

    host.querySelector<HTMLButtonElement>('[data-margin-group-reset="corpus"]')!.click();
    await handle.flushPending();
    expect(actions.onResetGroup).toHaveBeenCalledWith("corpus");

    host.querySelector<HTMLButtonElement>('[data-margin-settings-tab="modules"]')!.click();
    const itemInput = host.querySelector<HTMLInputElement>(`[data-margin-item-input="${projectMarginTargetId(target)}"]`)!;
    itemInput.value = "33.25";
    itemInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await handle.flushPending();
    expect(actions.onCommitItem).toHaveBeenCalledWith({
      itemId: projectMarginTargetId(target),
      marginPercent: 33.25,
      committedValue: 30
    });

    host.querySelector<HTMLButtonElement>(`[data-margin-item-reset="${projectMarginTargetId(target)}"]`)!.click();
    await handle.flushPending();
    expect(actions.onResetItem).toHaveBeenCalledWith(projectMarginTargetId(target));
    handle.destroy();
  });

  it("offers real group and item margin actions on right click while inputs keep the native menu", async () => {
    const host = document.createElement("section");
    document.body.append(host);
    const actions = {
      onCommitDefault: vi.fn(async () => ({ ok: true })),
      onCommitAdditionalLabor: vi.fn(async () => ({ ok: true })),
      onApplyGroup: vi.fn(async () => ({ ok: true })),
      onResetGroup: vi.fn(async () => ({ ok: true })),
      onCommitItem: vi.fn(async () => ({ ok: true })),
      onResetItem: vi.fn(async () => ({ ok: true }))
    };
    const handle = mountProjectMarginsPanel(host, marginsView(), actions);
    handle.setInputsDisabled(false);

    const group = host.querySelector<HTMLElement>('[data-margin-group="corpus"]')!;
    const groupEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    group.dispatchEvent(groupEvent);
    expect(groupEvent.defaultPrevented).toBe(true);
    expect(document.querySelector("[data-context-menu-action='margin-group-apply']")).not.toBeNull();
    document.querySelector<HTMLButtonElement>("[data-context-menu-action='margin-group-reset']")?.click();
    await handle.flushPending();
    expect(actions.onResetGroup).toHaveBeenCalledWith("corpus");

    const input = host.querySelector<HTMLInputElement>('[data-margin-group-input="corpus"]')!;
    const inputEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    input.dispatchEvent(inputEvent);
    expect(inputEvent.defaultPrevented).toBe(false);

    host.querySelector<HTMLButtonElement>('[data-margin-settings-tab="modules"]')!.click();
    const item = host.querySelector<HTMLElement>(`[data-margin-item-id="${projectMarginTargetId(target)}"]`)!;
    item.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    document.querySelector<HTMLButtonElement>("[data-context-menu-action='margin-item-reset']")?.click();
    await handle.flushPending();
    expect(actions.onResetItem).toHaveBeenCalledWith(projectMarginTargetId(target));
    handle.destroy();
  });
});


it("preserves the scroll owner, draft, checkbox and focus during an authoritative update", () => {
  const container = document.createElement("section");
  document.body.append(container);
  const handle = mountProjectMarginsPanel(container, marginsView(), {
    onCommitDefault: vi.fn(), onCommitAdditionalLabor: vi.fn(), onApplyGroup: vi.fn(), onResetGroup: vi.fn(), onCommitItem: vi.fn(), onResetItem: vi.fn()
  });
  handle.update(marginsView());
  const selector = "[data-manufacturing-board-waste]";
  const input = container.querySelector<HTMLInputElement>(selector)!;
  input.value = "37"; input.focus();
  const checkbox = container.querySelector<HTMLInputElement>("[data-manufacturing-enabled]")!;
  checkbox.checked = true;
  container.querySelector<HTMLElement>("[data-margin-settings-scroll]")!.scrollTop = 123;
  handle.update(marginsView({ revision: 5 }));
  expect(container.querySelector<HTMLInputElement>(selector)!.value).toBe("37");
  expect(document.activeElement).toBe(container.querySelector(selector));
  expect(container.querySelector<HTMLInputElement>("[data-manufacturing-enabled]")!.checked).toBe(true);
  expect(container.querySelector<HTMLElement>("[data-margin-settings-scroll]")!.scrollTop).toBe(123);
  handle.destroy();
});


it("accepts a server checkbox change when the user has no checkbox draft", () => {
  const container = document.createElement("section");
  document.body.append(container);
  const action = vi.fn(async () => ({ ok: true }));
  const handle = mountProjectMarginsPanel(container, marginsView(), { onCommitDefault: action, onCommitAdditionalLabor: action, onApplyGroup: action, onResetGroup: action, onCommitItem: action, onResetItem: action });
  handle.update(marginsView());
  const next = marginsView();
  next.settings.manufacturing.pricingMode = "configured";
  handle.update(next);
  expect(container.querySelector<HTMLInputElement>("[data-manufacturing-enabled]")!.checked).toBe(true);
  handle.destroy();
});
