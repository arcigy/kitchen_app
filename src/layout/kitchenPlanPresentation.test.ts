import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyKitchenPlanOutlineEmphasis,
  captureKitchenPlanOutline,
  restoreKitchenPlanOutline,
} from "./kitchenPlanPresentation";

function createHiddenOutline() {
  const material = new THREE.LineBasicMaterial({
    color: 0xff0000,
    opacity: 0.4,
    transparent: true,
    depthTest: true,
    depthWrite: true,
  });
  material.colorWrite = false;
  material.visible = false;
  const outline = new THREE.LineSegments(new THREE.BufferGeometry(), material);
  outline.visible = false;
  outline.frustumCulled = true;
  outline.renderOrder = 3;
  return { outline, material };
}

describe("kitchen plan presentation", () => {
  it("keeps every outline visible while repeatedly switching active layers", () => {
    const { outline, material } = createHiddenOutline();

    for (let index = 0; index < 10; index += 1) {
      applyKitchenPlanOutlineEmphasis(outline, {
        active: false,
        color: 0xb7bdc7,
        opacity: 1,
        renderOrder: 54,
      });
      expect(outline.visible).toBe(true);
      expect(material.color.getHex()).toBe(0xb7bdc7);

      applyKitchenPlanOutlineEmphasis(outline, {
        active: true,
        color: 0x111111,
        opacity: 1,
        renderOrder: 60,
      });
      expect(outline.visible).toBe(true);
      expect(material.color.getHex()).toBe(0x111111);
    }

    expect(outline.frustumCulled).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(material.colorWrite).toBe(true);
    expect(material.visible).toBe(true);
  });

  it("restores the original outline state when leaving the kitchen floorplan", () => {
    const { outline, material } = createHiddenOutline();
    const snapshot = captureKitchenPlanOutline(outline);

    applyKitchenPlanOutlineEmphasis(outline, {
      active: true,
      color: 0x111111,
      opacity: 1,
      renderOrder: 60,
    });
    restoreKitchenPlanOutline(outline, snapshot);

    expect(outline.visible).toBe(false);
    expect(outline.frustumCulled).toBe(true);
    expect(outline.renderOrder).toBe(3);
    expect(material.color.getHex()).toBe(0xff0000);
    expect(material.opacity).toBe(0.4);
    expect(material.transparent).toBe(true);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.colorWrite).toBe(false);
    expect(material.visible).toBe(false);
  });
});
