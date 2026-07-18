import { describe, expect, it } from "vitest";
import {
  createDefaultProjectMarginSettingsState,
  projectMarginTargetId,
  type ProjectMarginSettingsState
} from "../../core/project-margins/project-margin-types";
import type { PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";
import { buildProjectPricingPayload, type ProjectPricingView } from "./projectPricing";
import { buildProjectQuoteSummary } from "./projectQuote";
import {
  applyProjectMarginSettingsOperation,
  buildProjectMarginsView,
  projectMarginTargetIds
} from "./projectMargins";

function pricedItem(args: {
  id: string;
  group?: string;
  cost: number | null;
  itemType?: PortableQuoteBomItem["itemType"];
}): PortableQuoteBomItem {
  const itemType = args.itemType ?? "board";
  return {
    id: args.id,
    itemType,
    category: itemType === "hardware" ? "hardware" : "board",
    name: args.id,
    description: args.id,
    pricingBasis: itemType === "hardware" ? "piece" : "sheet_area",
    pricingUnit: itemType === "hardware" ? "pcs" : "m2",
    quantity: 1,
    pricingQuantity: 1,
    materialGroup: args.group ?? "body",
    itemCost: args.cost,
    unitPrice: args.cost,
    pricingGroup: itemType === "hardware" ? "hardware" : "boards"
  };
}

function entry(args: {
  instanceId: string;
  items: PortableQuoteBomItem[];
  labor?: number;
}): ProjectPricingView {
  const boards = args.items.filter((item) => item.pricingGroup === "boards" && item.itemCost != null)
    .reduce((total, item) => total + item.itemCost!, 0);
  const hardware = args.items.filter((item) => item.pricingGroup === "hardware" && item.itemCost != null)
    .reduce((total, item) => total + item.itemCost!, 0);
  return {
    instanceId: args.instanceId,
    kind: "module",
    label: `Module ${args.instanceId}`,
    result: {
      moduleType: "test",
      displayName: "Test",
      quoteBom: {
        schemaVersion: "module-quote-bom.v1",
        moduleType: "test",
        displayName: "Test",
        generatedAt: "2026-07-18T00:00:00.000Z",
        moduleInstance: { quantity: 1, widthMm: 1, heightMm: 1, depthMm: 1 },
        items: args.items
      },
      pricing: {
        schemaVersion: "module-commercial-pricing.v1",
        moduleType: "test",
        displayName: "Test",
        generatedAt: "2026-07-18T00:00:00.000Z",
        pricingStatus: args.items.some((item) => item.itemCost == null) ? "incomplete" : "ok",
        validationErrors: args.items.some((item) => item.itemCost == null) ? ["Missing price"] : [],
        moduleInstance: { quantity: 1, widthMm: 1, heightMm: 1, depthMm: 1 },
        items: args.items,
        groups: {
          boards: { areaM2: 1, pricedAreaM2: 1, cost: boards },
          edge_bands: { lengthLm: 0, cost: 0 },
          hardware: { pieces: hardware > 0 ? 1 : 0, cost: hardware }
        },
        priceInputs: { currency: "EUR", boardWasteMultiplier: 1.1, laborCostFixed: args.labor ?? 0, marginPercent: 0 },
        calculationFormulas: {},
        materialCost: boards + hardware,
        laborCostFixed: args.labor ?? 0,
        subtotalCost: boards + hardware + (args.labor ?? 0),
        marginPercent: 0,
        marginAmount: 0,
        finalPrice: boards + hardware + (args.labor ?? 0)
      },
      materialsSnapshot: null
    }
  };
}

function initializedState(overrides: Partial<ProjectMarginSettingsState> = {}): ProjectMarginSettingsState {
  return {
    ...createDefaultProjectMarginSettingsState(),
    initialized: true,
    ...overrides
  };
}

describe("project margin calculation", () => {
  it("preserves the legacy project-wide markup total exactly", () => {
    const view = buildProjectMarginsView([
      entry({ instanceId: "a", items: [pricedItem({ id: "corpus", cost: 100 })], labor: 25 }),
      entry({ instanceId: "b", items: [pricedItem({ id: "front", group: "front", cost: 200 })], labor: 25 })
    ], initializedState({ defaultMarginPercent: 20, additionalLaborCost: 50 }));

    expect(view.summary).toMatchObject({
      baseCost: 400,
      marginAmount: 80,
      combinedMarginPercent: 20,
      finalPrice: 480
    });
  });

  it("uses item over group over default and reports the weighted combined percent", () => {
    const target = { scopeId: "module:a", itemId: "corpus-a", category: "corpus" as const };
    const state = initializedState({
      defaultMarginPercent: 20,
      groupMargins: { corpus: 15, front: 10, labor: 0 },
      itemOverrides: [{ ...target, targetId: projectMarginTargetId(target), marginPercent: 30 }]
    });
    const view = buildProjectMarginsView([
      entry({
        instanceId: "a",
        items: [
          pricedItem({ id: "corpus-a", cost: 100 }),
          pricedItem({ id: "corpus-b", cost: 100 }),
          pricedItem({ id: "front-a", group: "front", cost: 200 })
        ]
      })
    ], state);

    const corpus = view.groups.find((group) => group.category === "corpus")!;
    expect(corpus.marginPercent).toBe(15);
    expect(corpus.combinedMarginPercent).toBe(22.5);
    expect(corpus.items.map((item) => [item.itemId, item.marginPercent, item.source])).toEqual([
      ["corpus-a", 30, "override"],
      ["corpus-b", 15, "group"]
    ]);
    expect(view.summary).toMatchObject({ baseCost: 400, marginAmount: 65, finalPrice: 465 });
    expect(view.summary.combinedMarginPercent).toBe(16.25);
  });

  it("allocates fractional cents deterministically regardless of BOM order", () => {
    const build = (ids: string[]) => buildProjectMarginsView([
      entry({ instanceId: "a", items: ids.map((id) => pricedItem({ id, cost: 0.01 })) })
    ], initializedState({ defaultMarginPercent: 33.33 }));
    const first = build(["c", "a", "b"]);
    const second = build(["b", "c", "a"]);
    const amounts = (view: ReturnType<typeof build>) => Object.fromEntries(
      view.groups.find((group) => group.category === "corpus")!.items.map((item) => [item.itemId, item.marginAmount])
    );

    expect(first.summary.marginAmount).toBe(0.01);
    expect(amounts(first)).toEqual(amounts(second));
    expect(amounts(first)).toEqual({ c: 0, a: 0.01, b: 0 });
  });

  it("keeps equal item ids in separate module scopes", () => {
    const view = buildProjectMarginsView([
      entry({ instanceId: "a", items: [pricedItem({ id: "side", cost: 10 })] }),
      entry({ instanceId: "b", items: [pricedItem({ id: "side", cost: 10 })] })
    ], initializedState());
    const targets = view.groups.find((group) => group.category === "corpus")!.items.map((item) => item.targetId);
    expect(new Set(targets).size).toBe(2);
  });

  it("rejects duplicate BOM item ids inside one scope", () => {
    expect(() => buildProjectMarginsView([
      entry({
        instanceId: "a",
        items: [pricedItem({ id: "side", cost: 10 }), pricedItem({ id: "side", cost: 20 })]
      })
    ], initializedState())).toThrow("Duplicate project margin target");
  });

  it("surfaces missing purchase prices instead of inventing a priced line", () => {
    const view = buildProjectMarginsView([
      entry({ instanceId: "a", items: [pricedItem({ id: "missing", cost: null })] })
    ], initializedState());
    expect(view.summary.missingPriceCount).toBe(1);
    expect(view.warnings.some((warning) => warning.code === "missing_price")).toBe(true);
  });
});

describe("project margin operations", () => {
  it("applying a whole group clears its item overrides", () => {
    const view = buildProjectMarginsView([
      entry({ instanceId: "a", items: [pricedItem({ id: "side", cost: 10 })] })
    ], initializedState());
    const target = view.groups.find((group) => group.category === "corpus")!.items[0]!;
    const withItem = applyProjectMarginSettingsOperation(
      view.settings,
      { type: "set_item", target, marginPercent: 35 },
      projectMarginTargetIds(view),
      "2026-07-18T00:00:00.000Z"
    );
    const applied = applyProjectMarginSettingsOperation(
      withItem,
      { type: "set_group", category: "corpus", marginPercent: 15 },
      projectMarginTargetIds(view),
      "2026-07-18T00:00:01.000Z"
    );
    expect(applied.groupMargins.corpus).toBe(15);
    expect(applied.itemOverrides).toEqual([]);
  });

  it("rejects item overrides for stale BOM targets", () => {
    const target = { scopeId: "module:gone", itemId: "side", category: "corpus" as const };
    expect(() => applyProjectMarginSettingsOperation(
      initializedState(),
      { type: "set_item", target, marginPercent: 10 },
      new Set()
    )).toThrow("no longer exists");
  });
});

describe("project quote compatibility", () => {
  it("keeps the legacy quote result exact when no overrides exist", () => {
    const entries = [entry({ instanceId: "a", items: [pricedItem({ id: "side", cost: 100 })], labor: 25 })];
    const summary = buildProjectQuoteSummary(entries, { additionalLaborCost: 25, marginPercent: 20 });
    expect(summary).toMatchObject({
      subtotalBeforeMargin: 150,
      marginPercent: 20,
      marginAmount: 30,
      finalPrice: 180
    });
  });

  it("flows mixed group and item margins into the existing summary contract", () => {
    const target = { scopeId: "module:a", itemId: "side", category: "corpus" as const };
    const state = initializedState({
      defaultMarginPercent: 20,
      groupMargins: { labor: 0 },
      additionalLaborCost: 50,
      itemOverrides: [{ ...target, targetId: projectMarginTargetId(target), marginPercent: 30 }]
    });
    const summary = buildProjectQuoteSummary([
      entry({ instanceId: "a", items: [pricedItem({ id: "side", cost: 100 })], labor: 50 })
    ], state);
    expect(summary).toMatchObject({
      subtotalBeforeMargin: 200,
      marginAmount: 30,
      marginPercent: 15,
      finalPrice: 230
    });
    expect(summary.marginView.summary.finalPrice).toBe(230);
  });

  it("versions the hierarchical margin payload as v4 while preserving legacy aliases", () => {
    const target = { scopeId: "module:a", itemId: "side", category: "corpus" as const };
    const state = initializedState({
      defaultMarginPercent: 20,
      groupMargins: { labor: 0 },
      additionalLaborCost: 50,
      itemOverrides: [{ ...target, targetId: projectMarginTargetId(target), marginPercent: 30 }]
    });
    const payload = buildProjectPricingPayload([
      entry({ instanceId: "a", items: [pricedItem({ id: "side", cost: 100 })], labor: 50 })
    ], state);

    expect(payload.schemaVersion).toBe("project-commercial-pricing.v4");
    expect(payload.margin).toBe(payload.summary.marginView);
    expect(payload.settings).toEqual({ additionalLaborCost: 50, marginPercent: 20 });
    expect(payload.totals).toMatchObject({
      subtotalBeforeMargin: 200,
      marginPercent: 15,
      marginAmount: 30,
      finalCost: 230
    });
  });
});
