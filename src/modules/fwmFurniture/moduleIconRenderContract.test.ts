import { describe, expect, it } from "vitest";
import {
  ARCIGY_MODULE_ICON_RELEASE_ROOT,
  ARCIGY_MODULE_ICON_STYLE,
  ARCIGY_MODULE_ICON_TARGETS,
  resolveArcigyModuleIconTargets
} from "./moduleIconRenderContract";

describe("Arcigy module icon rendering contract", () => {
  it("keeps one thick outline and a stable diagonal camera contract for every icon", () => {
    expect(ARCIGY_MODULE_ICON_STYLE.edgeWidthPx).toBe(12);
    expect(ARCIGY_MODULE_ICON_STYLE.edgeThresholdAngleDeg).toBeGreaterThanOrEqual(25);
    expect(ARCIGY_MODULE_ICON_STYLE.cameraAzimuthDeg).toBe(45);
    expect(ARCIGY_MODULE_ICON_STYLE.outputSizePx).toBe(640);
    expect(ARCIGY_MODULE_ICON_RELEASE_ROOT).toBe("public/module-icons/furniture/v3/variants");
    expect(ARCIGY_MODULE_ICON_TARGETS.every((target) => target.outputPath.startsWith(`${ARCIGY_MODULE_ICON_RELEASE_ROOT}/`))).toBe(true);
    expect(new Set(ARCIGY_MODULE_ICON_TARGETS.map((target) => target.outputPath)).size)
      .toBe(ARCIGY_MODULE_ICON_TARGETS.length);
    const openNiche = resolveArcigyModuleIconTargets(["wall-corner-open-chamfered"])[0]!;
    expect(openNiche.cameraAzimuthDeg).toBe(-30);
  });

  it("renders the approved lower chamfered geometry instead of the widened legacy default", () => {
    const target = resolveArcigyModuleIconTargets(["base-corner-chamfered"])[0]!;
    expect(target.parameters).toMatchObject({
      depth: 900,
      frontChamferMm: 420,
      frontChamferReferenceMm: 420,
      backChamferMm: 200
    });
  });

  it("fails closed for unknown icon targets", () => {
    expect(() => resolveArcigyModuleIconTargets(["missing-icon"])).toThrow(/Unknown Arcigy module icon target/);
  });
});
