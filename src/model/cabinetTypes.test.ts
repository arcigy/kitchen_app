import { describe, expect, it } from "vitest";
import { normalizeModuleParams, validateModule, type ModuleParams } from "./cabinetTypes";

describe("Revit corner preview parameter aliases", () => {
  it("maps exported Revit parameter keys to corner runtime parameters", () => {
    const params = {
      type: "corner_shelf_lower",
      modulePackageId: "corner_shelf_lower_revit_fqm2_preview_v1",
      lengthx: 1500,
      lengthz: 1000,
      depth: 560,
      height: 720,
      corpus_height: 717,
      plinth_height: 150,
      hrubka_dosky: 20,
      vyska_policky: 250,
      shelfCount: 4
    } as unknown as ModuleParams;

    const normalized = normalizeModuleParams(params) as Record<string, unknown>;

    expect(normalized.lengthX).toBe(1500);
    expect(normalized.lengthZ).toBe(1000);
    expect(normalized.heightCarcass).toBe(717);
    expect(normalized.worktopThicknessMm).toBe(3);
    expect(normalized.plinthHeight).toBe(150);
    expect(normalized.boardThickness).toBe(20);
    expect(normalized.shelfAutoFit).toBe(false);
    expect(normalized.shelfGaps).toEqual([250, 215, 1, 1]);
    expect(validateModule(params)).toEqual([]);
  });
});
