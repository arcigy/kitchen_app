import { describe, expect, it } from "vitest";
import {
  applyWallTypeToParams,
  CUSTOM_WALL_TYPE_ID,
  DEFAULT_WALL_TYPE_ID,
  getWallTypeName,
  resolveWallTypeId,
  type WallTypeAssignable
} from "./wallTypes";

describe("wall type presets", () => {
  it("applies a preset as construction parameters and IFC type metadata source", () => {
    const params: WallTypeAssignable = {
      thicknessMm: 150,
      heightMm: 2600,
      materialId: "default",
      justification: "center" as const,
      exteriorSign: 1 as const
    };

    const preset = applyWallTypeToParams(params, "external_300");

    expect(preset?.name).toBe("Obvodova 300");
    expect(params.typeId).toBe("external_300");
    expect(params.thicknessMm).toBe(300);
    expect(params.heightMm).toBe(2800);
    expect(params.materialId).toBe("default");
  });

  it("infers known legacy wall dimensions and preserves custom overrides", () => {
    expect(resolveWallTypeId({ thicknessMm: 150, heightMm: 2600, materialId: "default" })).toBe(DEFAULT_WALL_TYPE_ID);
    expect(resolveWallTypeId({ typeId: CUSTOM_WALL_TYPE_ID, thicknessMm: 173, heightMm: 2600 })).toBe(CUSTOM_WALL_TYPE_ID);
    expect(getWallTypeName(CUSTOM_WALL_TYPE_ID)).toBe("Vlastna");
  });
});
