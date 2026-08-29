import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { LayoutInstance } from "./localTypes";
import { createModuleSelectionController } from "./moduleSelectionController";

function moduleInstance(id: string): LayoutInstance {
  const root = new THREE.Group();
  root.position.set(1, 0, 2);
  return {
    id,
    params: { type: "base", width: 600, depth: 600, height: 720 },
    kitchenGroupId: null,
    kitchenPlacement: null,
    root,
    module: new THREE.Group(),
    localBox: new THREE.Box3(),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as unknown as LayoutInstance;
}

describe("module selection controller", () => {
  it("selects a module without starting direct pointer drag", () => {
    const inst = moduleInstance("m1");
    const setPointerCapture = vi.fn();
    const setSelectedModule = vi.fn();
    const dragState = {
      active: false,
      id: null,
      offset: new THREE.Vector3(),
      lastValid: new THREE.Vector3()
    };
    const controller = createModuleSelectionController({
      instances: [inst],
      pinnedInstanceIds: new Set(),
      raycaster: new THREE.Raycaster(),
      groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      renderer: { domElement: { setPointerCapture } } as unknown as THREE.WebGLRenderer,
      dragState,
      marquee: { active: false, pending: false, pointerId: null, hitSomething: false },
      marqueeEl: { style: { display: "" } } as HTMLElement,
      findInstance: (id) => (id === inst.id ? inst : null),
      getCamera: () => new THREE.OrthographicCamera(),
      getMode: () => "layout",
      getViewMode: () => "2d",
      getKitchenEditMode: () => false,
      getKitchenMode: () => null,
      getModuleLocalBackCenter: () => new THREE.Vector3(),
      setSelectedKitchenGroup: vi.fn(),
      setSelectedModule
    });

    const handled = controller.beginModuleSelection("m1", { pointerId: 7 } as PointerEvent);

    expect(handled).toBe(true);
    expect(setSelectedModule).toHaveBeenCalledExactlyOnceWith("m1", { additive: undefined });
    expect(dragState.active).toBe(false);
    expect(dragState.id).toBeNull();
    expect(setPointerCapture).not.toHaveBeenCalled();
  });
});
