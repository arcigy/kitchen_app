import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { LayoutInstance } from "./localTypes";
import { createModuleSelectionController } from "./moduleSelectionController";
import { createPointerModuleDragState } from "./pointerModuleDrag";

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
  it("picks the active cabinet through an overlapping inactive floorplan footprint", () => {
    const inactive = moduleInstance("lower");
    const active = moduleInstance("upper");
    for (const inst of [inactive, active]) {
      inst.localBox = new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 0.72, 0.3));
      inst.root.updateMatrixWorld(true);
    }
    const controller = createModuleSelectionController({
      instances: [inactive, active], pinnedInstanceIds: new Set(), raycaster: new THREE.Raycaster(), groundPlane: new THREE.Plane(),
      renderer: { domElement: {} } as THREE.WebGLRenderer,
      dragState: { active: false, id: null, offset: new THREE.Vector3(), lastValid: new THREE.Vector3() },
      marquee: { active: false, pending: false, pointerId: null, hitSomething: false }, marqueeEl: { style: { display: "" } } as HTMLElement,
      findInstance: id => [inactive, active].find(inst => inst.id === id) ?? null,
      getCamera: () => new THREE.OrthographicCamera(), getMode: () => "layout", getViewMode: () => "2d",
      getKitchenEditMode: () => true,
      getKitchenMode: () => ({ findKitchenGroup: () => null, filterSelectableInstanceId: id => id === "upper" ? id : null }),
      getModuleLocalBackCenter: () => new THREE.Vector3(), setSelectedKitchenGroup: vi.fn(), setSelectedModule: vi.fn(),
    });
    expect(controller.findSelectableFloorplanModuleAtPoint(
      { x: 1000, z: 2000 }, { x: 100, y: 100 }, { width: 1000, height: 800, left: 0, top: 0 } as DOMRect,
    )).toBe("upper");
  });

  it.each(["2d", "3d"])("arms precise direct drag only for an already selected unlocked module in %s", viewMode => {
    const inst = moduleInstance("m1");
    const dragState = createPointerModuleDragState();
    const setPointerCapture = vi.fn();
    const selected = new Set<string>();
    const pinned = new Set<string>();
    const raycaster = new THREE.Raycaster(new THREE.Vector3(1.2, 5, 2.15), new THREE.Vector3(0, -1, 0));
    const controller = createModuleSelectionController({
      instances: [inst], pinnedInstanceIds: pinned, raycaster, groundPlane: new THREE.Plane(),
      renderer: { domElement: { setPointerCapture } } as unknown as THREE.WebGLRenderer,
      dragState, marquee: { active: false, pending: false, pointerId: null, hitSomething: false },
      marqueeEl: { style: { display: "" } } as HTMLElement,
      findInstance: () => inst, getCamera: () => new THREE.OrthographicCamera(), getMode: () => "layout", getViewMode: () => viewMode,
      getKitchenEditMode: () => false, getKitchenMode: () => null, getModuleLocalBackCenter: () => new THREE.Vector3(),
      setSelectedKitchenGroup: vi.fn(), setSelectedModule: id => { if (id) selected.add(id); },
      isModuleSelected: id => selected.has(id), canBeginDirectDrag: () => true,
    });
    const event = { pointerId: 7, pointerType: "mouse", button: 0, clientX: 100, clientY: 200 } as PointerEvent;
    controller.beginModuleSelection(inst.id, event);
    expect(dragState.gesture).toBeUndefined();
    pinned.add(inst.id);
    controller.beginModuleSelection(inst.id, event);
    expect(dragState.gesture).toBeUndefined();
    pinned.clear();
    controller.beginModuleSelection(inst.id, event);
    expect(dragState.active).toBe(false);
    expect(dragState.gesture?.original.position.toArray()).toEqual([1, 0, 2]);
    expect(dragState.offset.x).toBeCloseTo(.2);
    expect(dragState.offset.z).toBeCloseTo(.15);
    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });
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

  it("consumes the one-shot mobile additive selection after adding a module", () => {
    const inst = moduleInstance("m1");
    const setSelectedModule = vi.fn();
    const consumeMobileAdditiveSelection = vi.fn();
    const controller = createModuleSelectionController({
      instances: [inst], pinnedInstanceIds: new Set(), raycaster: new THREE.Raycaster(), groundPlane: new THREE.Plane(),
      renderer: { domElement: {} } as THREE.WebGLRenderer,
      dragState: { active: false, id: null, offset: new THREE.Vector3(), lastValid: new THREE.Vector3() },
      marquee: { active: false, pending: false, pointerId: null, hitSomething: false }, marqueeEl: { style: { display: "" } } as HTMLElement,
      findInstance: () => inst, getCamera: () => new THREE.OrthographicCamera(), getMode: () => "layout", getViewMode: () => "2d",
      getKitchenEditMode: () => false, getKitchenMode: () => null, getModuleLocalBackCenter: () => new THREE.Vector3(),
      setSelectedKitchenGroup: vi.fn(), setSelectedModule, isMobileAdditiveSelection: () => true, consumeMobileAdditiveSelection
    });

    controller.beginModuleSelection("m1", { pointerId: 7, shiftKey: false, ctrlKey: false, metaKey: false } as PointerEvent);

    expect(setSelectedModule).toHaveBeenCalledWith("m1", { additive: true });
    expect(consumeMobileAdditiveSelection).toHaveBeenCalledOnce();
  });
});
