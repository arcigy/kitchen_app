import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { LayoutInstance } from "../layout/appState";
import {
  refreshPointerModuleDragKitchenPlacement,
  resolvePointerModuleDragFinalPosition,
  rollbackPointerModuleDragOverlap,
  updateModuleDragFromGroundHit,
  beginPointerModuleDrag,
  activatePointerModuleDrag,
  createPointerModuleDragState,
  finishModuleDragGesture,
  type PointerModuleDragState
} from "./pointerModuleDrag";

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
  it.each(["click", "valid", "invalid"])("finishes %s exactly once without reprojecting the final preview", outcome => {
    const inst = moduleInstance("m1", new THREE.Vector3());
    inst.root.position.set(1, 1.4, 2);
    const state = createPointerModuleDragState();
    beginPointerModuleDrag({ state, instance: inst, ray: new THREE.Ray(new THREE.Vector3(1, 4, 2), new THREE.Vector3(0, -1, 0)),
      pointerId: 1, clientX: 0, clientY: 0, grabHeight: 1.4 });
    if (outcome !== "click") {
      activatePointerModuleDrag(state, { pointerId: 1, clientX: 20, clientY: 0 });
      inst.root.position.x = 1.23456789;
      state.gesture!.valid = outcome === "valid";
    }
    expect(finishModuleDragGesture(state, inst)).toEqual({ handled: true, changed: outcome === "valid" });
    expect(inst.root.position.toArray()).toEqual([outcome === "valid" ? 1.23456789 : 1, 1.4, 2]);
    expect(finishModuleDragGesture(state, inst)).toEqual({ handled: false, changed: false });
  });
  it("retains the grabbed point on the same elevated plane and waits for the drag threshold", () => {
    const inst = moduleInstance("m1", new THREE.Vector3());
    inst.root.position.set(1, 1.4, 2);
    const state = createPointerModuleDragState();
    const ray = new THREE.Ray(new THREE.Vector3(4, 5, 8), new THREE.Vector3(-2.75, -3, -5.8).normalize());
    expect(beginPointerModuleDrag({ state, instance: inst, ray, pointerId: 7, clientX: 100, clientY: 200, grabHeight: 2 })).toBe(true);
    expect(activatePointerModuleDrag(state, { pointerId: 7, clientX: 105, clientY: 201 })).toBe(false);
    expect(activatePointerModuleDrag(state, { pointerId: 8, clientX: 200, clientY: 200 })).toBe(false);
    expect(activatePointerModuleDrag(state, { pointerId: 7, clientX: 106, clientY: 201 })).toBe(true);
    const hit = ray.intersectPlane(state.gesture!.plane, new THREE.Vector3())!;
    const position = resolvePointerModuleDragFinalPosition({ dragState: state, instance: inst, hitPoint: hit,
      applyWallConstraints: (_inst, point) => point, snapPosition: (_inst, point) => point });
    expect(position.distanceTo(inst.root.position)).toBeLessThan(1e-9);
    const shifted = resolvePointerModuleDragFinalPosition({ dragState: state, instance: inst, hitPoint: hit.clone().add(new THREE.Vector3(0.2, 0, 0.3)),
      applyWallConstraints: (_inst, point) => point, snapPosition: (_inst, point) => point });
    expect(shifted.toArray()).toEqual([1.2, 1.4, 2.3]);
  });

  it("restores original position, rotation and kitchen binding on cancellation without a history change", () => {
    const inst = moduleInstance("m1", new THREE.Vector3(), "kitchen");
    inst.root.position.set(1, 1.4, 2);
    inst.root.rotation.y = Math.PI / 2;
    inst.kitchenPlacement = { worktopId: "worktop", segmentIndex: 1, offsetAlongM: 0.8 };
    const state = createPointerModuleDragState();
    beginPointerModuleDrag({ state, instance: inst, ray: new THREE.Ray(new THREE.Vector3(1, 4, 2), new THREE.Vector3(0, -1, 0)),
      pointerId: 1, clientX: 0, clientY: 0, grabHeight: 1.4 });
    activatePointerModuleDrag(state, { pointerId: 1, clientX: 20, clientY: 0 });
    inst.root.position.set(9, 1.4, 9);
    inst.root.rotation.y = 0;
    inst.kitchenPlacement.offsetAlongM = 8;
    expect(finishModuleDragGesture(state, inst, true)).toEqual({ handled: true, changed: false });
    expect(inst.root.position.toArray()).toEqual([1, 1.4, 2]);
    expect(inst.root.rotation.y).toBe(Math.PI / 2);
    expect(inst.kitchenPlacement.offsetAlongM).toBe(0.8);
    expect(state.gesture).toBeUndefined();
    expect(state.active).toBe(false);
  });
  it("resolves final position through hit offset, wall constraints, snap, and wall constraints", () => {
    const inst = moduleInstance("m1", new THREE.Vector3(1, 0.4, 1));
    inst.root.position.copy(new THREE.Vector3(1, 0.4, 1));
    const calls: string[] = [];
    const applyWallConstraints = vi.fn((_instance: LayoutInstance, desired: THREE.Vector3) => {
      calls.push(`constraint:${desired.x.toFixed(2)},${desired.y.toFixed(2)},${desired.z.toFixed(2)}`);
      return desired.clone().add(new THREE.Vector3(0.1, 0, 0.2));
    });
    const snapPosition = vi.fn((_instance: LayoutInstance, desired: THREE.Vector3) => {
      calls.push(`snap:${desired.x.toFixed(2)},${desired.y.toFixed(2)},${desired.z.toFixed(2)}`);
      return desired.clone().add(new THREE.Vector3(0.3, 0, 0.4));
    });

    const finalPos = resolvePointerModuleDragFinalPosition({
      dragState: dragState(),
      hitPoint: new THREE.Vector3(2, 0, 3),
      instance: inst,
      applyWallConstraints,
      snapPosition
    });

    expect(finalPos.x).toBeCloseTo(2.25);
    expect(finalPos.y).toBeCloseTo(0.4);
    expect(finalPos.z).toBeCloseTo(3.3);
    expect(calls).toEqual([
      "constraint:1.75,0.40,2.50",
      "snap:1.85,0.40,2.70",
      "constraint:2.15,0.40,3.10"
    ]);
  });

  it("rolls back dragged module and existing pushed neighbors after overlap", () => {
    const inst = moduleInstance("m1", new THREE.Vector3(9, 0, 9));
    inst.root.position.copy(new THREE.Vector3(9, 0, 9));
    const neighbor = moduleInstance("m2", new THREE.Vector3(8, 0, 8));
    neighbor.root.position.copy(new THREE.Vector3(8, 0, 8));

    rollbackPointerModuleDragOverlap({
      instance: inst,
      lastValid: new THREE.Vector3(1, 0, 1),
      pushed: [
        { id: "m2", prev: new THREE.Vector3(2, 0, 2) },
        { id: "missing", prev: new THREE.Vector3(3, 0, 3) }
      ],
      findInstance: (id) => (id === "m2" ? neighbor : null)
    });

    expect(inst.root.position.toArray()).toEqual([1, 0, 1]);
    expect(neighbor.root.position.toArray()).toEqual([2, 0, 2]);
  });

  it("refreshes dragged and existing pushed module kitchen placement", () => {
    const inst = moduleInstance("m1", new THREE.Vector3(1, 0, 1), "kg1");
    const neighbor = moduleInstance("m2", new THREE.Vector3(2, 0, 2), "kg2");
    inst.kitchenPlacement = { worktopId: "old-1", segmentIndex: 0, offsetAlongM: 0 };
    neighbor.kitchenPlacement = { worktopId: "old-2", segmentIndex: 0, offsetAlongM: 0 };
    const inferKitchenPlacementBinding = vi.fn((instance: LayoutInstance, kitchenGroupId: string, backOffsetMm: number) => ({
      worktopId: `${instance.id}-${kitchenGroupId}-${backOffsetMm}`,
      segmentIndex: 0,
      offsetAlongM: 0
    }));

    refreshPointerModuleDragKitchenPlacement({
      instance: inst,
      pushed: [
        { id: "m2", prev: new THREE.Vector3(2, 0, 2) },
        { id: "missing", prev: new THREE.Vector3(3, 0, 3) }
      ],
      findInstance: (id) => (id === "m2" ? neighbor : null),
      kitchenGroups: [{ id: "kg1", ctx: { worktopBackOffsetMm: 45 } }],
      defaultWorktopBackOffsetMm: 80,
      inferKitchenPlacementBinding
    });

    expect(inst.kitchenPlacement).toEqual({ worktopId: "m1-kg1-45", segmentIndex: 0, offsetAlongM: 0 });
    expect(neighbor.kitchenPlacement).toEqual({ worktopId: "m2-kg2-80", segmentIndex: 0, offsetAlongM: 0 });
    expect(inferKitchenPlacementBinding).toHaveBeenCalledTimes(2);
  });

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

  it("does not move a dragged module while it is locked by align", () => {
    const inst = moduleInstance("m1", new THREE.Vector3(1, 0, 1));
    inst.root.position.copy(new THREE.Vector3(1, 0, 1));
    const updateLayoutPanel = vi.fn();
    const nudgePinnedModuleChain = vi.fn();

    const didUpdate = updateModuleDragFromGroundHit({
      dragState: dragState(),
      hitPoint: new THREE.Vector3(2, 0, 3),
      findInstance: (id) => (id === inst.id ? inst : null),
      applyWallConstraints: (_instance, desired) => desired.clone(),
      snapPosition: (_instance, desired) => desired.clone(),
      autoOrientModuleToRoomWallIfSnapped: vi.fn(),
      nudgePinnedModuleChain,
      anyOverlap: () => false,
      moduleOverlapsWalls: () => false,
      moduleOverlapsKitchenWorktops: () => false,
      kitchenGroups: [],
      defaultWorktopBackOffsetMm: 0,
      inferKitchenPlacementBinding: () => null,
      updateLayoutPanel,
      isModuleAlignLocked: () => true
    });

    expect(didUpdate).toBe(true);
    expect(inst.root.position.toArray()).toEqual([1, 0, 1]);
    expect(nudgePinnedModuleChain).not.toHaveBeenCalled();
    expect(updateLayoutPanel).not.toHaveBeenCalled();
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
    inst.kitchenPlacement = { worktopId: "old-1", segmentIndex: 0, offsetAlongM: 0 };
    const neighbor = moduleInstance("m2", new THREE.Vector3(2, 0, 2), "kg2");
    neighbor.root.position.copy(new THREE.Vector3(2, 0, 2));
    neighbor.kitchenPlacement = { worktopId: "old-2", segmentIndex: 0, offsetAlongM: 0 };
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

  it("does not rebind unpinned kitchen modules during pointer drag refresh", () => {
    const inst = moduleInstance("m1", new THREE.Vector3(1, 0, 1), "kg1");
    const neighbor = moduleInstance("m2", new THREE.Vector3(2, 0, 2), "kg2");
    const inferKitchenPlacementBinding = vi.fn(() => ({ worktopId: "new", segmentIndex: 0, offsetAlongM: 0 }));

    refreshPointerModuleDragKitchenPlacement({
      instance: inst,
      pushed: [{ id: "m2", prev: new THREE.Vector3(2, 0, 2) }],
      findInstance: (id) => (id === "m2" ? neighbor : null),
      kitchenGroups: [{ id: "kg1", ctx: { worktopBackOffsetMm: 45 } }],
      defaultWorktopBackOffsetMm: 80,
      inferKitchenPlacementBinding
    });

    expect(inst.kitchenPlacement).toBeNull();
    expect(neighbor.kitchenPlacement).toBeNull();
    expect(inferKitchenPlacementBinding).not.toHaveBeenCalled();
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
