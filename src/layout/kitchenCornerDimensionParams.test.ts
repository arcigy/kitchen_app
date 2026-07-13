import { describe, expect, it } from "vitest";
import {
  requestedKitchenCornerParamValue,
  resolveKitchenCornerDimensionParam
} from "./kitchenCornerDimensionParams";

describe("kitchen corner dimension parameters", () => {
  it("maps native corner arms to independent length parameters", () => {
    expect(resolveKitchenCornerDimensionParam({ lengthX: 900, lengthZ: 1100 }, "x")?.key).toBe("lengthX");
    expect(resolveKitchenCornerDimensionParam({ lengthX: 900, lengthZ: 1100 }, "z")?.key).toBe("lengthZ");
  });

  it("maps catalog 90 corner arms to width and an independent Z length", () => {
    const params = { type: "fwm_catalog_base_corner", variant: "corner_90", width: 900 };
    expect(resolveKitchenCornerDimensionParam(params, "x")).toMatchObject({ key: "width", currentValueMm: 900 });
    expect(resolveKitchenCornerDimensionParam(params, "z")).toMatchObject({ key: "cornerLengthZMm", currentValueMm: 900 });
  });

  it("applies the measured geometry delta instead of assuming the parameter equals the visible arm", () => {
    const param = resolveKitchenCornerDimensionParam({ lengthX: 900, lengthZ: 1100 }, "x")!;
    expect(requestedKitchenCornerParamValue({
      param,
      currentArmLengthMm: 918,
      requestedArmLengthMm: 1000
    })).toBe(982);
  });
});
