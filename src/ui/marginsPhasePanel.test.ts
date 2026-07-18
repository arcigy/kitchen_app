// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
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
  return {
    ...target,
    targetId: projectMarginTargetId(target),
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

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("project margins phase panel", () => {
  it("renders stable summary, group and collapsed disclosure selectors", () => {
    const html = renderProjectMarginsPanel(marginsView());

    expect(html).toContain('data-margin-summary-value="base-cost"');
    expect(html).toContain('data-margin-summary-value="margin-amount"');
    expect(html).toContain('data-margin-summary-value="combined-margin-percent"');
    expect(html).toContain('data-margin-summary-value="final-price"');
    expect(html).toContain('data-margin-group="corpus"');
    expect(html).toContain('data-margin-group-toggle="corpus"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-margin-item-id=');
  });

  it("expands individual rows, marks overrides and escapes tenant-controlled labels", () => {
    const html = renderProjectMarginsPanel(marginsView(), { expandedGroups: new Set(["corpus"]) });

    expect(html).toContain(`data-margin-item-id="${projectMarginTargetId(target)}"`);
    expect(html).toContain('data-margin-source="override"');
    expect(html).toContain('data-margin-item-input=');
    expect(html).toContain('data-margin-item-reset=');
    expect(html).toContain("Spodná skrinka &lt;A&gt;");
    expect(html).toContain("DTDL biela &amp; matná");
    expect(html).not.toContain("Spodná skrinka <A>");
  });

  it("shows missing-price state and disables every edit control for read-only users", () => {
    const missing = marginItem({ baseCost: 0, marginAmount: 0, finalPrice: 0, missingPrice: true });
    const view = marginsView({
      editable: false,
      summary: { ...marginsView().summary, missingPriceCount: 1 },
      groups: [marginGroup(missing, { missingPriceCount: 1 })]
    });
    const html = renderProjectMarginsPanel(view, { expandedGroups: new Set(["corpus"]) });

    expect(html).toContain('role="alert"');
    expect(html).toContain("1 položiek nemá cenu");
    expect(html).toContain("iba na čítanie");
    expect(html).toMatch(/data-margin-group-input="corpus"[^>]*disabled/);
    expect(html).toMatch(/data-margin-item-input="[^"]+"[^>]*disabled/);
  });

  it("commits project, group and item edits and resets overrides through stable IDs", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
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

    host.querySelector<HTMLButtonElement>('[data-margin-group-toggle="corpus"]')!.click();

    const groupInput = host.querySelector<HTMLInputElement>('[data-margin-group-input="corpus"]')!;
    groupInput.value = "18.5";
    host.querySelector<HTMLButtonElement>('[data-margin-group-apply-all="corpus"]')!.click();
    await handle.flushPending();
    expect(actions.onApplyGroup).toHaveBeenCalledWith({ groupId: "corpus", marginPercent: 18.5, committedValue: 15 });

    host.querySelector<HTMLButtonElement>('[data-margin-group-reset="corpus"]')!.click();
    await handle.flushPending();
    expect(actions.onResetGroup).toHaveBeenCalledWith("corpus");

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
});
