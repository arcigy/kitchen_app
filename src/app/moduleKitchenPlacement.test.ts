import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { LayoutInstance } from "./localTypes";
import { findKitchenPlacementGroup, refreshModuleKitchenPlacement, resolveKitchenPlacementBackOffset } from "./moduleKitchenPlacement";

function moduleInstance(id: string, kitchenGroupId: string | null = null): LayoutInstance {
  return {
    id,
    params: {} as LayoutInstance["params"],
    kitchenGroupId,
    kitchenPlacement: null,
    root: new THREE.Group(),
    module: new THREE.Group(),
    localBox: new THREE.Box3(),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as LayoutInstance;
}

describe("module kitchen placement helpers", () => {
  it("finds kitchen placement groups without applying default fallback", () => {
    const kitchenGroups = [{ id: "kg1", ctx: { worktopBackOffsetMm: 45 } }];

    expect(findKitchenPlacementGroup({ kitchenGroupId: "kg1", kitchenGroups })).toBe(kitchenGroups[0]);
    expect(findKitchenPlacementGroup({ kitchenGroupId: "missing", kitchenGroups })).toBeNull();
    expect(findKitchenPlacementGroup({ kitchenGroupId: null, kitchenGroups })).toBeNull();
  });

  it("resolves group-specific or default kitchen placement back offset", () => {
    expect(
      resolveKitchenPlacementBackOffset({
        kitchenGroupId: "kg1",
        kitchenGroups: [{ id: "kg1", ctx: { worktopBackOffsetMm: 45 } }],
        defaultWorktopBackOffsetMm: 80
      })
    ).toBe(45);
    expect(
      resolveKitchenPlacementBackOffset({
        kitchenGroupId: "missing",
        kitchenGroups: [{ id: "kg1", ctx: { worktopBackOffsetMm: 45 } }],
        defaultWorktopBackOffsetMm: 80
      })
    ).toBe(80);
  });

  it("refreshes kitchen placement from group-specific or default back offset", () => {
    const grouped = moduleInstance("m1", "kg1");
    const fallback = moduleInstance("m2", "missing");
    const inferKitchenPlacementBinding = vi.fn((instance: LayoutInstance, kitchenGroupId: string, backOffsetMm: number) => ({
      worktopId: `${instance.id}-${kitchenGroupId}-${backOffsetMm}`,
      segmentIndex: 0,
      offsetAlongM: 0
    }));

    expect(
      refreshModuleKitchenPlacement({
        instance: grouped,
        kitchenGroups: [{ id: "kg1", ctx: { worktopBackOffsetMm: 45 } }],
        defaultWorktopBackOffsetMm: 80,
        inferKitchenPlacementBinding
      })
    ).toBe(true);
    expect(
      refreshModuleKitchenPlacement({
        instance: fallback,
        kitchenGroups: [{ id: "kg1", ctx: { worktopBackOffsetMm: 45 } }],
        defaultWorktopBackOffsetMm: 80,
        inferKitchenPlacementBinding
      })
    ).toBe(true);

    expect(grouped.kitchenPlacement).toEqual({ worktopId: "m1-kg1-45", segmentIndex: 0, offsetAlongM: 0 });
    expect(fallback.kitchenPlacement).toEqual({ worktopId: "m2-missing-80", segmentIndex: 0, offsetAlongM: 0 });
  });

  it("leaves modules without a kitchen group unchanged", () => {
    const loose = moduleInstance("m1");
    const inferKitchenPlacementBinding = vi.fn();

    expect(
      refreshModuleKitchenPlacement({
        instance: loose,
        kitchenGroups: [],
        defaultWorktopBackOffsetMm: 80,
        inferKitchenPlacementBinding
      })
    ).toBe(false);

    expect(loose.kitchenPlacement).toBeNull();
    expect(inferKitchenPlacementBinding).not.toHaveBeenCalled();
  });
});
