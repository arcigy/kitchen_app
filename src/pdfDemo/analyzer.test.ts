import { describe, expect, it } from "vitest";
import { analyzePdfKitchenDemo, extractLikelyModuleWidths } from "./analyzer";

describe("PDF kitchen demo analyzer", () => {
  it("extracts cabinet-sized dimensions in millimeters", () => {
    expect(extractLikelyModuleWidths("modules 600 mm, 800mm, 45 cm and room 4200 mm")).toEqual([
      600,
      800,
      450
    ]);
  });

  it("places detected modules next to each other", () => {
    const result = analyzePdfKitchenDemo([
      {
        id: "source-1",
        name: "plan.pdf",
        description: "base cabinets 600 800 450",
        text: ""
      }
    ]);

    expect(result.modules.map((module) => module.xMm)).toEqual([0, 600, 1400]);
    expect(result.modules.map((module) => module.widthMm)).toEqual([600, 800, 450]);
  });

  it("falls back to a demo layout when no PDF dimensions are found", () => {
    const result = analyzePdfKitchenDemo([]);

    expect(result.modules).toHaveLength(4);
    expect(result.modules[0].widthMm).toBe(600);
  });
});
