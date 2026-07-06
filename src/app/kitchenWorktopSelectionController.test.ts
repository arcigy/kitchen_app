import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createKitchenWorktopSelectionController } from "./kitchenWorktopSelectionController";
import type { KitchenWorktopInstance } from "./localTypes";

const worktop = (id = "wt1", kitchenGroupId = "kg1"): KitchenWorktopInstance => ({
  id,
  kitchenGroupId,
  params: {
    path: [
      { x: 0, z: 0 },
      { x: 2000, z: 0 }
    ],
    justification: "back",
    mirrored: false,
    depthMm: 600,
    thicknessMm: 38,
    heightMm: 900,
    overhangSideMm: 0,
    materialId: "oak"
  },
  root: new THREE.Group(),
  mesh: new THREE.Mesh(),
  outline: new THREE.Line()
});

const marquee = () => ({
  active: false,
  pending: true,
  pointerId: 7,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0,
  additive: false,
  hitSomething: false
});

const marqueeElement = () => ({ style: { display: "" } }) as HTMLElement;

describe("createKitchenWorktopSelectionController", () => {
  it("selects the owning kitchen group from a clicked worktop outside edit mode", () => {
    const selectedGroups: Array<string | null> = [];
    const item = worktop();
    const state = marquee();
    const marqueeEl = marqueeElement();
    const controller = createKitchenWorktopSelectionController({
      kitchenWorktops: [item],
      marquee: state,
      marqueeEl,
      findKitchenWorktop: (id) => (id === item.id ? item : null),
      getActiveKitchenGroupId: () => null,
      getKitchenEditMode: () => false,
      getKitchenMode: () => ({
        findKitchenGroup: (id) => (id === "kg1" ? { id: "kg1" } : null)
      }),
      setSelectedKitchenGroup: (id) => selectedGroups.push(id)
    });

    expect(controller.beginKitchenWorktopSelection("wt1", { pointerId: 7 } as PointerEvent)).toBe(true);
    expect(selectedGroups).toEqual(["kg1"]);
    expect(state.pending).toBe(false);
    expect(marqueeEl.style.display).toBe("none");
  });

  it("finds a floorplan worktop by its polygon when raycast picking misses the mesh", () => {
    const item = worktop();
    const controller = createKitchenWorktopSelectionController({
      kitchenWorktops: [item],
      marquee: marquee(),
      marqueeEl: marqueeElement(),
      findKitchenWorktop: vi.fn(),
      getActiveKitchenGroupId: () => null,
      getKitchenEditMode: () => false,
      getKitchenMode: () => null,
      setSelectedKitchenGroup: vi.fn()
    });

    expect(controller.findSelectableFloorplanWorktopAtPoint({ x: 1000, z: 300 })).toBe("wt1");
    expect(controller.findSelectableFloorplanWorktopAtPoint({ x: 1000, z: 900 })).toBeNull();
  });

  it("does not select a worktop outside the active kitchen group while editing", () => {
    const selectedGroups: Array<string | null> = [];
    const item = worktop("wt1", "kg-other");
    const controller = createKitchenWorktopSelectionController({
      kitchenWorktops: [item],
      marquee: marquee(),
      marqueeEl: marqueeElement(),
      findKitchenWorktop: (id) => (id === item.id ? item : null),
      getActiveKitchenGroupId: () => "kg-active",
      getKitchenEditMode: () => true,
      getKitchenMode: () => null,
      setSelectedKitchenGroup: (id) => selectedGroups.push(id)
    });

    expect(controller.beginKitchenWorktopSelection("wt1", { pointerId: 7 } as PointerEvent)).toBe(false);
    expect(selectedGroups).toEqual([]);
  });
});
