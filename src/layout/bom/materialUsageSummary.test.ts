import { describe, expect, it } from "vitest";
import type { PortableQuoteBomPayload } from "../../modules/runtime/portableCommercial";
import { summarizeMaterialUsage } from "./materialUsageSummary";

function quoteBom(items: PortableQuoteBomPayload["items"]): PortableQuoteBomPayload {
  return {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "test_module",
    displayName: "Test module",
    generatedAt: "2026-07-09T00:00:00.000Z",
    moduleInstance: { quantity: 1, widthMm: 600, heightMm: 720, depthMm: 560 },
    items
  };
}

describe("material usage summary", () => {
  it("keeps real board, edge and hardware quantities separated by material group without prices", () => {
    const summary = summarizeMaterialUsage([
      quoteBom([
        {
          id: "corpus-side",
          itemType: "board",
          category: "board",
          name: "Corpus side",
          description: "Corpus side",
          pricingBasis: "sheet_area",
          pricingUnit: "m2",
          quantity: 2,
          pricingQuantity: 1.2,
          pricingQuantityBase: 1.2,
          metrics: { areaM2: 1.2 },
          dimensionsMm: { length: 720, width: 560, thickness: 18 },
          materialGroup: "carcass",
          material: { catalogId: "mat.corpus.white", displayName: "DTDL biela" } as never
        },
        {
          id: "front",
          itemType: "board",
          category: "board",
          name: "Front",
          description: "Front",
          pricingBasis: "sheet_area",
          pricingUnit: "m2",
          quantity: 2,
          pricingQuantity: 0.96,
          pricingQuantityBase: 0.96,
          metrics: { areaM2: 0.96 },
          dimensionsMm: { length: 720, width: 400, thickness: 19 },
          materialGroup: "front",
          material: { catalogId: "mat.front.oak", displayName: "Dubový front" } as never
        },
        {
          id: "drawer-bottom",
          itemType: "board",
          category: "board",
          name: "Drawer bottom",
          description: "Drawer bottom",
          pricingBasis: "sheet_area",
          pricingUnit: "m2",
          quantity: 1,
          pricingQuantity: 0.48,
          pricingQuantityBase: 0.48,
          metrics: { areaM2: 0.48 },
          dimensionsMm: { length: 600, width: 800, thickness: 8 },
          materialGroup: "drawer_bottom",
          material: { catalogId: "mat.drawer.hdf", displayName: "HDF biela" } as never
        },
        {
          id: "front-edge",
          itemType: "edge_band",
          category: "edge",
          name: "Front edge",
          description: "Front edge",
          pricingBasis: "linear_length",
          pricingUnit: "lm",
          quantity: 4,
          pricingQuantity: 3.4,
          pricingQuantityBase: 3.4,
          metrics: { edgeLengthLm: 3.4 },
          material: { catalogId: "mat.edge.white", displayName: "ABS biela" } as never
        },
        {
          id: "handle",
          itemType: "hardware",
          category: "handle",
          name: "Handle",
          description: "Handle",
          pricingBasis: "piece",
          pricingUnit: "pcs",
          quantity: 2,
          pricingQuantity: 2,
          pricingQuantityBase: 2,
          component: { catalogId: "cmp.handle.black", displayName: "Úchytka čierna", componentType: "handle" } as never
        }
      ])
    ]);

    const corpus = summary.groups.find((group) => group.id === "corpus")!;
    const front = summary.groups.find((group) => group.id === "front")!;
    const drawerBottom = summary.groups.find((group) => group.id === "drawer_bottom")!;
    const edges = summary.groups.find((group) => group.id === "edge")!;
    const hardware = summary.groups.find((group) => group.id === "hardware")!;

    expect(corpus.quantity).toBe(1.2);
    expect(corpus.pieces).toBe(2);
    expect(front.quantity).toBe(0.96);
    expect(drawerBottom.quantity).toBe(0.48);
    expect(edges.quantity).toBe(3.4);
    expect(hardware.quantity).toBe(2);
    expect(summary.boardAreaM2).toBe(2.64);
    expect(summary.boardPieces).toBe(5);
    expect(summary.edgeLengthLm).toBe(3.4);
    expect(summary.hardwarePieces).toBe(2);
    expect(summary.warnings).toEqual([]);
  });

  it("keeps incomplete assignments visible and reports only material-data warnings", () => {
    const summary = summarizeMaterialUsage([
      quoteBom([
        {
          id: "missing-material",
          itemType: "board",
          category: "board",
          name: "Missing material",
          description: "Missing material",
          pricingBasis: "sheet_area",
          pricingUnit: "m2",
          quantity: 1,
          pricingQuantity: 0.5,
          pricingQuantityBase: 0.5,
          metrics: { areaM2: 0.5 },
          dimensionsMm: { length: 1000, width: 500, thickness: 18 },
          materialGroup: "front"
        },
        {
          id: "unknown-group",
          itemType: "board",
          category: "board",
          name: "Unknown",
          description: "Unknown",
          pricingBasis: "sheet_area",
          pricingUnit: "m2",
          quantity: 1,
          pricingQuantity: 0.5,
          materialGroup: "special_board"
        }
      ])
    ]);

    const front = summary.groups.find((group) => group.id === "front")!;
    expect(front.items[0]?.catalogId).toBeNull();
    expect(summary.warnings.join(" ")).toContain("nemá priradený materiál alebo komponent");
    expect(summary.warnings.join(" ")).toContain("neznámu materiálovú skupinu");
    expect(summary.warnings.join(" ")).not.toContain("cena");
  });
});
