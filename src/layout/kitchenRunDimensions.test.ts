import { describe, expect, it } from "vitest";
import {
  reflowKitchenRunModules,
  requestedKitchenRunCenterForGap,
  resolveKitchenRunDimensionChain,
  type KitchenRunDimensionModule
} from "./kitchenRunDimensions";

const module = (id: string, centerMm: number, widthMm = 600): KitchenRunDimensionModule => ({
  id,
  centerMm,
  widthMm,
  minWidthMm: 200,
  maxWidthMm: 1200
});

describe("kitchen run dimensions", () => {
  it("covers the whole worktop run with module and gap dimensions", () => {
    const chain = resolveKitchenRunDimensionChain({
      lengthMm: 2400,
      modules: [module("a", 300), module("b", 900), module("c", 1800)]
    });

    expect(chain.segments.map((segment) => [segment.kind, Math.round(segment.valueMm)])).toEqual([
      ["module", 600],
      ["module", 600],
      ["gap", 300],
      ["module", 600],
      ["gap", 300]
    ]);
    expect(chain.segments.reduce((sum, segment) => sum + segment.valueMm, 0)).toBe(2400);
  });

  it("makes all widths editable without selection and only the selected width and adjacent gaps editable with one selection", () => {
    const modules = [module("a", 400), module("b", 1200)];
    const none = resolveKitchenRunDimensionChain({ lengthMm: 2000, modules });
    expect(none.segments.filter((segment) => segment.kind === "module").map((segment) => segment.editable)).toEqual(["width", "width"]);

    const one = resolveKitchenRunDimensionChain({ lengthMm: 2000, modules, selectedModuleIds: ["b"] });
    expect(one.segments.filter((segment) => segment.kind === "module").map((segment) => segment.editable)).toEqual([null, "width"]);
    expect(one.segments.filter((segment) => segment.kind === "gap" && segment.editable).map((segment) => segment.editable)).toEqual(["gap-before", "gap-after"]);

    const many = resolveKitchenRunDimensionChain({ lengthMm: 2000, modules, selectedModuleIds: ["a", "b"] });
    expect(many.segments.every((segment) => segment.editable == null)).toBe(true);
  });

  it("expands a module and cascades its neighbors without leaving the worktop", () => {
    const result = reflowKitchenRunModules({
      lengthMm: 2400,
      modules: [module("a", 300), module("b", 900), module("c", 1500)],
      selectedModuleId: "b",
      requestedWidthMm: 900
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selectedWidthMm).toBe(900);
    expect(result.centersMm.get("a")).toBe(300);
    expect(result.centersMm.get("b")).toBe(1050);
    expect(result.centersMm.get("c")).toBe(1800);
    expect((result.centersMm.get("c") ?? 0) + 300).toBeLessThanOrEqual(2400);
  });

  it("clamps an impossible width before any module can leave the worktop", () => {
    const result = reflowKitchenRunModules({
      lengthMm: 1800,
      modules: [module("a", 300), module("b", 900), module("c", 1500)],
      selectedModuleId: "b",
      requestedWidthMm: 1000
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selectedWidthMm).toBe(600);
    expect(result.clamped).toBe(true);
    expect(result.centersMm.get("a")).toBe(300);
    expect(result.centersMm.get("b")).toBe(900);
    expect(result.centersMm.get("c")).toBe(1500);
  });

  it("respects corner reservations when reflowing a run", () => {
    const result = reflowKitchenRunModules({
      lengthMm: 2600,
      reservedStartMm: 500,
      reservedEndMm: 300,
      modules: [module("a", 800), module("b", 1500)],
      selectedModuleId: "a",
      requestedWidthMm: 900
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.centersMm.get("a") ?? 0) - 450).toBeGreaterThanOrEqual(500);
    expect((result.centersMm.get("b") ?? 0) + 300).toBeLessThanOrEqual(2300);
  });

  it("makes each reserved corner arm editable from its own run dimension", () => {
    const chain = resolveKitchenRunDimensionChain({
      lengthMm: 2400,
      reservedStartMm: 900,
      reservedStartArm: { moduleId: "corner", axis: "z", lengthMm: 900 },
      modules: [module("straight", 1500)],
      selectedModuleIds: ["corner"]
    });
    expect(chain.segments[0]).toMatchObject({
      kind: "reserved",
      moduleId: "corner",
      valueMm: 900,
      editable: "corner-arm",
      cornerAxis: "z"
    });
  });

  it("turns an adjacent gap edit into a selected module center and reflows neighbors", () => {
    const modules = [module("a", 300), module("b", 1100), module("c", 1900)];
    const centerMm = requestedKitchenRunCenterForGap({
      side: "before",
      gapMm: 50,
      selectedModuleId: "b",
      lengthMm: 2400,
      modules
    });
    expect(centerMm).toBe(950);
    const result = reflowKitchenRunModules({
      lengthMm: 2400,
      modules,
      selectedModuleId: "b",
      requestedCenterMm: centerMm ?? 0
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selectedCenterMm).toBe(950);
    expect(result.centersMm.get("c")).toBeGreaterThanOrEqual(1550);
  });
});
