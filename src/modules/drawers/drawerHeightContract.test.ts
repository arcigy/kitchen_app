import { describe, expect, it } from "vitest";
import {
  drawerCorpusThicknessFromVariantKey,
  drawerFrontHeightFromVariantKey,
  drawerRunnerVariantKey,
  drawerRunnerVariantLabel
} from "./drawerHeightContract";

describe("drawer runner variant contract", () => {
  it("keeps runner assignments distinct by front height and corpus thickness", () => {
    const eighteenMillimetres = drawerRunnerVariantKey(180, 18);
    const nineteenMillimetres = drawerRunnerVariantKey(180, 19);

    expect(eighteenMillimetres).not.toBe(nineteenMillimetres);
    expect(drawerFrontHeightFromVariantKey(eighteenMillimetres)).toBe(180);
    expect(drawerCorpusThicknessFromVariantKey(eighteenMillimetres)).toBe(18);
    expect(drawerRunnerVariantLabel(180, 18)).toBe("Čelo 180 mm · Korpus 18 mm");
  });

  it("continues to read saved height-only runner assignments", () => {
    expect(drawerFrontHeightFromVariantKey("front-height:180")).toBe(180);
    expect(drawerCorpusThicknessFromVariantKey("front-height:180")).toBeNull();
  });
});
