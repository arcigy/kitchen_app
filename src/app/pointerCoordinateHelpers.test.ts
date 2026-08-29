import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  pointerClientPointInRect,
  pointerNdcFromClientPoint,
  pointerNdcFromEvent,
  setPointerNdcFromClientPoint,
  setPointerNdcFromEvent
} from "./pointerCoordinateHelpers";

describe("pointer coordinate helpers", () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 } as DOMRect;

  it("converts pointer client coordinates to rect-local coordinates", () => {
    expect(pointerClientPointInRect({ clientX: 60, clientY: 45 }, rect)).toEqual({ x: 50, y: 25 });
  });

  it("converts rect-local coordinates to current normalized device coordinates", () => {
    expect(pointerNdcFromClientPoint({ x: 50, y: 25 }, rect)).toEqual(new THREE.Vector2(-0.5, 0.5));
  });

  it("writes normalized device coordinates into an existing vector", () => {
    const target = new THREE.Vector2(9, 9);

    expect(setPointerNdcFromClientPoint(target, { x: 50, y: 25 }, rect)).toBe(target);
    expect(target).toEqual(new THREE.Vector2(-0.5, 0.5));
  });

  it("converts pointer client coordinates directly to current normalized device coordinates", () => {
    expect(pointerNdcFromEvent({ clientX: 210, clientY: 120 }, rect)).toEqual(new THREE.Vector2(1, -1));
  });

  it("writes event normalized device coordinates into an existing vector", () => {
    const target = new THREE.Vector2(9, 9);

    expect(setPointerNdcFromEvent(target, { clientX: 210, clientY: 120 }, rect)).toBe(target);
    expect(target).toEqual(new THREE.Vector2(1, -1));
  });
});
