import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState, LayoutInstance } from "../layout/appState";
import { makeDefaultModuleParams } from "../model/cabinetTypes";
import { commitModuleSettingsToLayout } from "./moduleSettingsCommit";

function fixture() {
  const scene = new THREE.Group();
  const makeInstance = (id: string): LayoutInstance => {
    const module = new THREE.Group(); module.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const root = new THREE.Group(); root.add(module); scene.add(root);
    return { id, params: makeDefaultModuleParams("drawer_low"), root, module, localBox: new THREE.Box3().setFromObject(module),
      pick: new THREE.Mesh(), outline: new THREE.LineSegments(), kitchenGroupId: null, kitchenPlacement: null };
  };
  const first = makeInstance("first"); const neighbor = makeInstance("neighbor");
  const state = { instances: [first, neighbor], kitchenWorktops: [], kitchenGroups: [] } as unknown as AppState;
  const commitHistory = vi.fn();
  const findInstance = (id: string) => state.instances.find((instance) => instance.id === id) ?? null;
  return { state, first, neighbor, scene, commitHistory, findInstance };
}

describe("advanced module layout commit", () => {
  afterEach(() => vi.restoreAllMocks());
  it("uses the existing placement rebuild and creates exactly one history step", () => {
    const f = fixture(); const baseline = structuredClone(f.first.params);
    const candidate = { ...baseline, width: 950 };
    const rebuildInstance = vi.fn(() => true);
    const result = commitModuleSettingsToLayout({ ...f, rebuildInstance }, f.first.id, candidate, baseline);
    expect(rebuildInstance).toHaveBeenCalledWith(f.first, { previousParams: baseline, preserveBackAnchor: true });
    expect(result.width).toBe(950); expect(f.commitHistory).toHaveBeenCalledExactlyOnceWith(f.state);
    result.width = 300; expect(f.first.params.width).toBe(950);
  });
  it.each(["collision", "exception"])("rolls back parameters, neighbors and scene after %s", (failure) => {
    const consoleError = vi.spyOn(console, "error");
    const f = fixture(); const baseline = structuredClone(f.first.params);
    const originalModule = f.first.module; const originalChildren = [...originalModule.children];
    const neighborParams = structuredClone(f.neighbor.params);
    const rebuildInstance = () => {
      f.first.module.clear(); f.first.module.add(new THREE.Mesh());
      f.neighbor.root.position.x = 3; f.neighbor.params.width = 1350;
      f.state.instances.pop(); f.neighbor.root.removeFromParent();
      if (failure === "exception") throw new Error("Worktop rebuild failed");
      return false;
    };
    expect(() => commitModuleSettingsToLayout({ ...f, rebuildInstance }, f.first.id, { ...baseline, width: 3900 }, baseline)).toThrow();
    expect(f.first.params).toEqual(baseline); expect(f.first.module).toBe(originalModule);
    expect(originalModule.children).toEqual(originalChildren); expect(f.state.instances).toEqual([f.first, f.neighbor]);
    expect(f.neighbor.root.parent).toBe(f.scene); expect(f.neighbor.root.position.x).toBe(0);
    expect(f.neighbor.params).toEqual(neighborParams); expect(f.commitHistory).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
  it("rejects a stale baseline without overwriting an external change", () => {
    const f = fixture(); const baseline = structuredClone(f.first.params); f.first.params.width = 999;
    const rebuildInstance = vi.fn(() => true);
    expect(() => commitModuleSettingsToLayout({ ...f, rebuildInstance }, f.first.id, baseline, baseline)).toThrow();
    expect(f.first.params.width).toBe(999); expect(rebuildInstance).not.toHaveBeenCalled();
  });
});
