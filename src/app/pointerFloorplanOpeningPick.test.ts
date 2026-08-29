import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { WallInstance } from "./localTypes";
import { pickFloorplanOpening, type FloorplanOpeningPickContext } from "./pointerFloorplanOpeningPick";

type TestOpening = {
  id: string;
  params: {
    centerMm: number;
    wallId?: string | null;
    widthMm: number;
  };
};

const wall = {
  id: "wall-1",
  params: {
    aMm: { x: 0, z: 0 },
    bMm: { x: 1000, z: 0 },
    thicknessMm: 100
  }
} as WallInstance;

const distPxPointToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
};

const createContext = (overrides: Partial<FloorplanOpeningPickContext<TestOpening>> = {}): FloorplanOpeningPickContext<TestOpening> => ({
  cam: new THREE.PerspectiveCamera(),
  distPxPointToSeg,
  instances: [
    { id: "opening-a", params: { centerMm: 300, wallId: "wall-1", widthMm: 200 } },
    { id: "opening-b", params: { centerMm: 700, wallId: "wall-1", widthMm: 200 } }
  ],
  isPickable: () => true,
  mouse: { x: 300, y: 0 },
  pMm: { x: 300, z: 0 },
  pointOnWallAxisMm: (_wall, point) => ({ t: point.x / 1000, distMm: Math.abs(point.z) }),
  rect: { height: 600, width: 800 } as DOMRect,
  selectionSnapPx: 20,
  walls: [wall],
  worldToScreen: (point) => ({ x: point.x * 1000, y: point.z * 1000 }),
  ...overrides
});

describe("pickFloorplanOpening", () => {
  it("picks the nearest opening using the current floorplan screen hit behavior", () => {
    const result = pickFloorplanOpening(createContext());

    expect(result?.id).toBe("opening-a");
  });

  it("ignores openings that are not pickable", () => {
    const isPickable = vi.fn((id: string) => id !== "opening-a");

    const result = pickFloorplanOpening(createContext({ isPickable }));

    expect(result).toBeNull();
    expect(isPickable).toHaveBeenCalledWith("opening-a");
    expect(isPickable).toHaveBeenCalledWith("opening-b");
  });

  it("ignores openings whose host wall is missing", () => {
    const result = pickFloorplanOpening(
      createContext({
        instances: [{ id: "opening-a", params: { centerMm: 300, wallId: "missing-wall", widthMm: 200 } }]
      })
    );

    expect(result).toBeNull();
  });
});
