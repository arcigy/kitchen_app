import { describe, expect, it } from "vitest";
import { BoxGeometry, BufferGeometry, ExtrudeGeometry, ShapeGeometry, Vector3 } from "three";
import {
  cloneKitchenWorktopParams,
  kitchenWorktopOutlineColor,
  makeKitchenWorktopBackGuideGeometry,
  makeKitchenWorktopGeometry,
  makeKitchenWorktopMaterial,
  makeKitchenWorktopOutlineGeometry,
  makeKitchenWorktopPreviewGeometry
} from "./kitchenWorktopVisuals";
import type { KitchenWorktopParams } from "./localTypes";

const sampleWorktop: KitchenWorktopParams = {
  path: [
    { x: 0, z: 0 },
    { x: 2000, z: 0 }
  ],
  justification: "back",
  mirrored: false,
  depthMm: 620,
  thicknessMm: 38,
  heightMm: 820,
  overhangSideMm: 30,
  materialId: "mat.board.worktop.laminate_oak.38"
};

describe("kitchenWorktopVisuals", () => {
  it("clones worktop params without sharing path points", () => {
    const clone = cloneKitchenWorktopParams(sampleWorktop);

    expect(clone).toEqual(sampleWorktop);
    expect(clone).not.toBe(sampleWorktop);
    expect(clone.path).not.toBe(sampleWorktop.path);
    expect(clone.path[0]).not.toBe(sampleWorktop.path[0]);
  });

  it("creates solid and preview materials", () => {
    const solid = makeKitchenWorktopMaterial(sampleWorktop.materialId);
    const preview = makeKitchenWorktopMaterial(sampleWorktop.materialId, { preview: true });

    expect(solid.transparent).toBe(false);
    expect(solid.opacity).toBe(1);
    expect(preview.transparent).toBe(true);
    expect(preview.opacity).toBe(0.52);
    expect(kitchenWorktopOutlineColor(sampleWorktop.materialId)).toBeTypeOf("number");
  });

  it("creates worktop geometry variants", () => {
    expect(makeKitchenWorktopGeometry(sampleWorktop)).toBeInstanceOf(ExtrudeGeometry);
    expect(makeKitchenWorktopPreviewGeometry(sampleWorktop)).toBeInstanceOf(ShapeGeometry);
    expect(makeKitchenWorktopGeometry({ ...sampleWorktop, path: [] })).toBeInstanceOf(BoxGeometry);
  });

  it("creates closed plan outline and empty back guide fallback", () => {
    const outline = makeKitchenWorktopOutlineGeometry(sampleWorktop);
    const guide = makeKitchenWorktopBackGuideGeometry(sampleWorktop, []);
    const positions = outline.getAttribute("position");

    expect(outline).toBeInstanceOf(BufferGeometry);
    expect(positions.count).toBeGreaterThan(2);
    expect(positions.getX(0)).toBe(positions.getX(positions.count - 1));
    expect(positions.getZ(0)).toBe(positions.getZ(positions.count - 1));
    expect(guide.getAttribute("position").count).toBe(2);
  });

  it("creates back guide geometry from provided path", () => {
    const guide = makeKitchenWorktopBackGuideGeometry(sampleWorktop, [new Vector3(0, 0, 0), new Vector3(1, 0, 0)]);

    expect(guide.getAttribute("position").count).toBe(2);
    expect(guide.getAttribute("position").getY(0)).toBeCloseTo(0.018);
  });
});
