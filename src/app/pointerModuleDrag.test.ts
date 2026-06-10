import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { LayoutInstance } from "../layout/appState";
import { updateModuleDragFromGroundHit, type PointerModuleDragState } from "./pointerModuleDrag";

function moduleInstance(id: string, position: THREE.Vector3, kitchenGroupId: string | null = null): LayoutInstance {
  return {
    id,
    params: { type: "base", width: 600, depth: 600, height: 720 },
    kitchenGroupId,
    kitchenPlacement: null,
    root: new THREE.Group(),
    module: new THREE.Group(),
    localBox: new THREE.Box3(),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as unknown as LayoutInstance;
}

function dragState(overrides: Partial<PointerModuleDragState> = {}): PointerModuleDragState {
  return {
    active: true,
    id: "m1",
    offset: new THREE.Vector3(0.25, 0, 0.5),
    lastValid: new THREE.Vector3(1, 0, 1),
    ...overrides
  };
}

describe("pointer module drag", () => {
  it("updates dragged module through constraints, snap, orientation, nudge, and layout refresh", () => {
    const inst = moduleInstance("m1", new THREE.Vector3(1, 0, 1));
    inst.root.position.copy(new THREE.Vector3(1, 0, 1));
    const state = dragState();
    const applyWallConstraints = vi.fn((_instance: LayoutInstance, desired: THREE.Vector3) => desired.clone());
    const snapPosition = vi.fn((_instance: LayoutInstance, desired: THREE.Vector3) => desired.clone().add(new THREE.Vector3(0.1, 0, 0.2)));
    const autoOrientModuleToRoomWallIfSnapped = vi.fn();
    const nudgePinnedModuleChain = vi.fn((_instance: LayoutInstance, _delta: THREE.Vector3) => []);
    const updateLayoutPanel = vi.fn();

    const didUpdate = updateModuleDragFromGroundHit({
      dragState: state,
      hitPoint: new THREE.Vector3(2, 0, 3),
      findInstance: (id) => (id === inst.id ? inst : null),
      applyWallConstraints,
      snapPosition,
      autoOrientModuleToRoomWallIfSnapped,
      nudgePinnedModuleChain,
      anyOverlap: () => false,
      moduleOverlapsWalls: () => false,
      moduleOverlapsKitchenWorktops: () => false,
      kitchenGroups: [],
      defaultWorktopBackOffsetMm: 0,
      inferKitchenPlacementBinding: () => null,
      updateLayoutPanel
    });

    expect(didUpdate).toBe(true);
    expect(inst.root.position.toArray()).toEqual([1.85, 0, 2.7]);
    expect(state.lastValid.toArray()).toEqual([1.85, 0, 2.7]);
    expect(autoOrientModuleToRoomWallIfSnapped).toHaveBeenCalledWith(inst);
    expect(nudgePinnedModuleChain).toHaveBeenCalledTimes(1);
    const pushedDelta = nudgePinnedModuleChain.mock.calls[0][1];
    expect(pushedDelta.x).toBeCloseTo(0.85);
    expect(pushedDelta.y).toBe(0);
    expect(pushedDelta.z).toBeCloseTo(1.7);
    expect(updateLayoutPanel).toHaveBeenCalledTimes(1);
  });

  it("rolls back dragged and pushed modules when overlap validation fails", () => {
    const inst = moduleInstance("m1", new THREE.Vector3(1, 0, 1));
    inst.root.position.copy(new THREE.Vector3(1, 0, 1));
    const neighbor = moduleInstance("m2", new THREE.Vector3(5, 0, 5));
    neighbor.root.position.copy(new THREE.Vector3(9, 0, 9));
    const state = dragState({ lastValid: new THREE.Vector3(0.5, 0, 0.5) });
    const updateLayoutPanel = vi.fn();

    const didUpdate = updateModuleDragFromGroundHit({
      dragState: state,
      hitPoint: new THREE.Vector3(2, 0, 3),
      findInstance: (id) => (id === "m1" ? inst : id === "m2" ? neighbor : null),
      applyWallConstraints: (_instance, desired) => desired.clone(),
      snapPosition: (_instance, desired) => desired.clone(),
      autoOrientModuleToRoomWallIfSnapped: vi.fn(),
      nudgePinnedModuleChain: vi.fn(() => [{ id: "m2", prev: new THREE.Vector3(5, 0, 5) }]),
      anyOverlap: () => true,
      moduleOverlapsWalls: () => false,
      moduleOverlapsKitchenWorktops: () => false,
      kitchenGroups: [],
      defaultWorktopBackOffsetMm: 0,
      inferKitchenPlacementBinding: () => null,
      updateLayoutPanel
    });

    expect(didUpdate).toBe(true);
    expect(inst.root.position.toArray()).toEqual([0.5, 0, 0.5]);
    expect(neighbor.root.position.toArray()).toEqual([5, 0, 5]);
    expect(updateLayoutPanel).not.toHaveBeenCalled();
  });

  it("refreshes kitchen placement for dragged and pushed kitchen modules", () => {
    const inst = moduleInstance("m1", new THREE.Vector3(1, 0, 1), "kg1");
    inst.root.position.copy(new THREE.Vector3(1, 0, 1));
    const neighbor = moduleInstance("m2", new THREE.Vector3(2, 0, 2), "kg2");
    neighbor.root.position.copy(new THREE.Vector3(2, 0, 2));
    const inferKitchenPlacementBinding = vi.fn((instance: LayoutInstance, kitchenGroupId: string, backOffsetMm: number) => ({
      worktopId: `${instance.id}-${kitchenGroupId}-${backOffsetMm}`,
      segmentIndex: 0,
      offsetAlongM: 0
    }));

    updateModuleDragFromGroundHit({
      dragState: dragState(),
      hitPoint: new THREE.Vector3(2, 0, 3),
      findInstance: (id) => (id === "m1" ? inst : id === "m2" ? neighbor : null),
      applyWallConstraints: (_instance, desired) => desired.clone(),
      snapPosition: (_instance, desired) => desired.clone(),
      autoOrientModuleToRoomWallIfSnapped: vi.fn(),
      nudgePinnedModuleChain: vi.fn(() => [{ id: "m2", prev: neighbor.root.position.clone() }]),
      anyOverlap: () => false,
      moduleOverlapsWalls: () => false,
      moduleOverlapsKitchenWorktops: () => false,
      kitchenGroups: [{ id: "kg1", ctx: { worktopBackOffsetMm: 45 } }],
      defaultWorktopBackOffsetMm: 80,
      inferKitchenPlacementBinding,
      updateLayoutPanel: vi.fn()
    });

    expect(inst.kitchenPlacement).toEqual({ worktopId: "m1-kg1-45", segmentIndex: 0, offsetAlongM: 0 });
    expect(neighbor.kitchenPlacement).toEqual({ worktopId: "m2-kg2-80", segmentIndex: 0, offsetAlongM: 0 });
  });

  it("returns false without mutation when hit point or dragged instance is missing", () => {
    const inst = moduleInstance("m1", new THREE.Vector3(1, 0, 1));
    inst.root.position.copy(new THREE.Vector3(1, 0, 1));
    const updateLayoutPanel = vi.fn();

    const withoutHit = updateModuleDragFromGroundHit({
      dragState: dragState(),
      hitPoint: null,
      findInstance: () => inst,
      applyWallConstraints: (_instance, desired) => desired.clone(),
      snapPosition: (_instance, desired) => desired.clone(),
      autoOrientModuleToRoomWallIfSnapped: vi.fn(),
      nudgePinnedModuleChain: vi.fn(() => []),
      anyOverlap: () => false,
      moduleOverlapsWalls: () => false,
      moduleOverlapsKitchenWorktops: () => false,
      kitchenGroups: [],
      defaultWorktopBackOffsetMm: 0,
      inferKitchenPlacementBinding: () => null,
      updateLayoutPanel
    });
    const withoutInstance = updateModuleDragFromGroundHit({
      dragState: dragState(),
      hitPoint: new THREE.Vector3(2, 0, 3),
      findInstance: () => null,
      applyWallConstraints: (_instance, desired) => desired.clone(),
      snapPosition: (_instance, desired) => desired.clone(),
      autoOrientModuleToRoomWallIfSnapped: vi.fn(),
      nudgePinnedModuleChain: vi.fn(() => []),
      anyOverlap: () => false,
      moduleOverlapsWalls: () => false,
      moduleOverlapsKitchenWorktops: () => false,
      kitchenGroups: [],
      defaultWorktopBackOffsetMm: 0,
      inferKitchenPlacementBinding: () => null,
      updateLayoutPanel
    });

    expect(withoutHit).toBe(false);
    expect(withoutInstance).toBe(false);
    expect(inst.root.position.toArray()).toEqual([1, 0, 1]);
    expect(updateLayoutPanel).not.toHaveBeenCalled();
  });
});
