import { describe, expect, it } from "vitest";
import {
  createDefaultProjectMarginSettingsState,
  projectMarginTargetId,
  resolveEffectiveProjectMarginPercent,
  type ProjectMarginSettingsState
} from "../../core/project-margins/project-margin-types";
import type { PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";
import type { ProjectPricingView } from "./projectPricing";
import { buildProjectQuoteSummary } from "./projectQuote";
import {
  applyProjectMarginSettingsOperation,
  buildProjectMarginsView,
  projectMarginTargetIds
} from "./projectMargins";

function board(id: string, itemCost: number | null, materialGroup = "body"): PortableQuoteBomItem {
  return {
    id,
    itemType: "board",
    category: "board",
    name: id,
    description: id,
    pricingBasis: "sheet_area",
    pricingUnit: "m2",
    quantity: 1,
    pricingQuantity: 1,
    materialGroup,
    unitPrice: itemCost,
    itemCost,
    pricingGroup: "boards"
  };
}

function pricingEntry(instanceId: string, items: PortableQuoteBomItem[], laborCostFixed = 0): ProjectPricingView {
  const boardsCost = items.reduce((sum, item) => sum + (item.itemCost ?? 0), 0);
  const incomplete = items.some((item) => item.itemCost == null);
  return {
    instanceId,
    kind: "module",
    label: `Module ${instanceId}`,
    result: {
      moduleType: "test",
      displayName: "Test",
      quoteBom: {
        schemaVersion: "module-quote-bom.v1",
        moduleType: "test",
        displayName: "Test",
        generatedAt: "2026-07-18T00:00:00.000Z",
        moduleInstance: { quantity: 1, widthMm: 1, heightMm: 1, depthMm: 1 },
        items
      },
      pricing: {
        schemaVersion: "module-commercial-pricing.v1",
        moduleType: "test",
        displayName: "Test",
        generatedAt: "2026-07-18T00:00:00.000Z",
        pricingStatus: incomplete ? "incomplete" : "ok",
        validationErrors: incomplete ? ["Missing price"] : [],
        moduleInstance: { quantity: 1, widthMm: 1, heightMm: 1, depthMm: 1 },
        items,
        groups: {
          boards: { areaM2: items.length, pricedAreaM2: items.length, cost: boardsCost },
          edge_bands: { lengthLm: 0, cost: 0 },
          hardware: { pieces: 0, cost: 0 }
        },
        priceInputs: { currency: "EUR", boardWasteMultiplier: 1, laborCostFixed, marginPercent: 0 },
        calculationFormulas: {},
        materialCost: boardsCost,
        laborCostFixed,
        subtotalCost: boardsCost + laborCostFixed,
        marginPercent: 0,
        marginAmount: 0,
        finalPrice: boardsCost + laborCostFixed
      },
      materialsSnapshot: null
    }
  };
}

function initialized(overrides: Partial<ProjectMarginSettingsState> = {}): ProjectMarginSettingsState {
  return { ...createDefaultProjectMarginSettingsState(), initialized: true, ...overrides };
}

describe("project margins regression boundaries", () => {
  it("keeps the legacy missing/global quote setting at exactly 20 percent markup", () => {
    const entries = [pricingEntry("legacy", [board("side", 100)])];

    expect(buildProjectQuoteSummary(entries, null)).toMatchObject({
      subtotalBeforeMargin: 100,
      marginPercent: 20,
      marginAmount: 20,
      finalPrice: 120
    });
    expect(buildProjectQuoteSummary(entries, { additionalLaborCost: 0 })).toMatchObject({
      marginPercent: 20,
      marginAmount: 20,
      finalPrice: 120
    });
  });

  it("resets an item to its group and clears a whole group back to the project default", () => {
    const view = buildProjectMarginsView(
      [pricingEntry("base-1", [board("side", 100)])],
      initialized({ groupMargins: { corpus: 15 } })
    );
    const target = view.groups.find((group) => group.category === "corpus")!.items[0]!;
    const overridden = applyProjectMarginSettingsOperation(
      view.settings,
      { type: "set_item", target, marginPercent: 35 },
      projectMarginTargetIds(view),
      "2026-07-18T19:00:00.000Z"
    );
    const resetItem = applyProjectMarginSettingsOperation(
      overridden,
      { type: "reset_item", target },
      projectMarginTargetIds(view),
      "2026-07-18T19:00:01.000Z"
    );
    expect(resolveEffectiveProjectMarginPercent(resetItem, target)).toBe(15);

    const overriddenAgain = applyProjectMarginSettingsOperation(
      resetItem,
      { type: "set_item", target, marginPercent: 35 },
      projectMarginTargetIds(view),
      "2026-07-18T19:00:02.000Z"
    );
    const clearedGroup = applyProjectMarginSettingsOperation(
      overriddenAgain,
      { type: "reset_group", category: "corpus" },
      projectMarginTargetIds(view),
      "2026-07-18T19:00:03.000Z"
    );
    expect(clearedGroup.groupMargins.corpus).toBeUndefined();
    expect(clearedGroup.itemOverrides).toEqual([]);
    expect(resolveEffectiveProjectMarginPercent(clearedGroup, target)).toBe(20);
  });

  it("rejects duplicate item ids inside one module scope", () => {
    expect(() => buildProjectMarginsView([
      pricingEntry("duplicate", [board("side", 10), board("side", 20)])
    ], initialized())).toThrow(/Duplicate project margin target/);
  });

  it("keeps target identities unambiguous when source IDs contain delimiters", () => {
    const view = buildProjectMarginsView([
      pricingEntry("a", [board("x:front:y", 10, "body")]),
      pricingEntry("a:corpus:x", [board("y", 20, "front")])
    ], initialized());
    const targetIds = view.groups.flatMap((group) => group.items.map((item) => item.targetId));

    expect(new Set(targetIds).size).toBe(targetIds.length);
  });

  it("keeps quote, margin table and cent allocation totals identical", () => {
    const firstTarget = { scopeId: "module:a", itemId: "one", category: "corpus" as const };
    const state = initialized({
      defaultMarginPercent: 33.33,
      groupMargins: { front: 12.5 },
      itemOverrides: [{
        ...firstTarget,
        targetId: projectMarginTargetId(firstTarget),
        marginPercent: 66.67
      }]
    });
    const entries = [pricingEntry("a", [
      board("one", 0.01),
      board("two", 0.01),
      board("front", 10.01, "front")
    ], 0.01)];
    const quote = buildProjectQuoteSummary(entries, state);

    expect(quote.subtotalBeforeMargin).toBe(quote.marginView.summary.baseCost);
    expect(quote.marginAmount).toBe(quote.marginView.summary.marginAmount);
    expect(quote.finalPrice).toBe(quote.marginView.summary.finalPrice);
    expect(Math.round(quote.finalPrice * 100)).toBe(
      Math.round((quote.subtotalBeforeMargin + quote.marginAmount) * 100)
    );
  });

  it("treats a real zero price as priced and a null price as visibly incomplete", () => {
    const view = buildProjectMarginsView([
      pricingEntry("prices", [board("free", 0), board("missing", null)])
    ], initialized());
    const corpusItems = view.groups.find((group) => group.category === "corpus")!.items;

    expect(corpusItems.find((item) => item.itemId === "free")).toMatchObject({
      baseCost: 0,
      missingPrice: false,
      finalPrice: 0
    });
    expect(corpusItems.find((item) => item.itemId === "missing")).toMatchObject({
      baseCost: 0,
      missingPrice: true,
      finalPrice: 0
    });
    expect(view.summary.missingPriceCount).toBe(1);
    expect(view.warnings.filter((warning) => warning.code === "missing_price")).toHaveLength(1);
  });
});
