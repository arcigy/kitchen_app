import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { FloorInstance } from "./localTypes";
import { pickFloorplanFloorBoundary, type FloorplanFloorPickContext } from "./pointerFloorplanFloorPick";

const floors = [
  {
    id: "floor-a",
    params: {
      boundary: [
        { x: 0, z: 0 },
        { x: 1000, z: 0 },
        { x: 1000, z: 1000 },
        { x: 0, z: 1000 }
      ]
    }
  },
  {
    id: "floor-b",
    params: {
      boundary: [
        { x: 2000, z: 0 },
        { x: 3000, z: 0 },
        { x: 3000, z: 1000 },
        { x: 2000, z: 1000 }
      ]
    }
  }
] as FloorInstance[];

const distPxPointToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
};

const createContext = (overrides: Partial<FloorplanFloorPickContext> = {}): FloorplanFloorPickContext => ({
  cam: new THREE.PerspectiveCamera(),
  distPxPointToSeg,
  floors,
  floorPointToWorld: (point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000),
  isFloorPickable: () => true,
  mouse: { x: 500, y: 8 },
  rect: { height: 600, width: 800 } as DOMRect,
  snapPx: 12,
  worldToScreen: (point) => ({ x: point.x * 1000, y: point.z * 1000 }),
  ...overrides
});

describe("pickFloorplanFloorBoundary", () => {
  it("picks a floor boundary edge within the current 12px hit threshold", () => {
    const result = pickFloorplanFloorBoundary(createContext());

    expect(result).toBe("floor-a");
  });

  it("uses the current corner distance fallback", () => {
    const result = pickFloorplanFloorBoundary(createContext({ mouse: { x: 1008, y: 1008 } }));

    expect(result).toBe("floor-a");
  });

  it("ignores floor boundaries outside the current hit threshold", () => {
    const result = pickFloorplanFloorBoundary(createContext({ mouse: { x: 500, y: 20 } }));

    expect(result).toBeNull();
  });

  it("ignores floors that are not pickable", () => {
    const isFloorPickable = vi.fn((id: string) => id !== "floor-a" && id !== "floor-b");

    const result = pickFloorplanFloorBoundary(createContext({ isFloorPickable }));

    expect(result).toBeNull();
    expect(isFloorPickable).toHaveBeenCalledWith("floor-a");
    expect(isFloorPickable).toHaveBeenCalledWith("floor-b");
  });
});
