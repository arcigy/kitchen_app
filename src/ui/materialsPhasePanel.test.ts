import { describe, expect, it } from "vitest";
import { renderProjectMaterialsPanel } from "./materialsPhasePanel";
import { summarizeMaterialUsage } from "../layout/bom/materialUsageSummary";

describe("materials phase panel", () => {
  it("renders the approved material groups and quantities without pricing controls", () => {
    const summary = summarizeMaterialUsage([
      {
        schemaVersion: "module-quote-bom.v1",
        moduleType: "test_module",
        displayName: "Test module",
        generatedAt: "2026-07-09T00:00:00.000Z",
        moduleInstance: { quantity: 1, widthMm: 600, heightMm: 720, depthMm: 560 },
        items: [
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
            material: { catalogId: "mat.front.oak", displayName: "Dub <matný>" } as never
          }
        ]
      }
    ]);

    const html = renderProjectMaterialsPanel(summary);

    expect(html).toContain("Materiály a komponenty");
    expect(html).toContain("Korpus");
    expect(html).toContain("Fronty");
    expect(html).toContain("Pracovná doska");
    expect(html).toContain("Sokel");
    expect(html).toContain("Chrbát");
    expect(html).toContain("Hrany");
    expect(html).toContain("Úchytky a kovanie");
    expect(html).toContain("0,96 m²");
    expect(html).toContain("Dub &lt;matný&gt;");
    expect(html).not.toContain("Cena");
    expect(html).not.toContain("Cenník");
  });
});
