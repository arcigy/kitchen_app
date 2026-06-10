import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { WallInstance } from "./localTypes";
import { pickFloorplanWallId, resolveFloorplanWallPick, type FloorplanWallPickContext } from "./pointerFloorplanWallPick";

const walls = [
  {
    id: "wall-a",
    params: {
      aMm: { x: 0, z: 0 },
      bMm: { x: 1000, z: 0 },
      thicknessMm: 100
    }
  },
  {
    id: "wall-b",
    params: {
      aMm: { x: 0, z: 500 },
      bMm: { x: 1000, z: 500 },
      thicknessMm: 100
    }
  }
] as WallInstance[];

const createContext = (overrides: Partial<FloorplanWallPickContext> = {}): FloorplanWallPickContext => ({
  axisSnapPx: 10,
  cam: new THREE.PerspectiveCamera(),
  isWallPickable: () => true,
  mouse: { x: 500, y: 0 },
  pMm: { x: 500, z: 0 },
  pointInPolygonXZ: () => false,
  pointOnWallAxisMm: (wall, point) => ({
    closest: { x: point.x, z: wall.params.aMm.z },
    distMm: Math.abs(point.z - wall.params.aMm.z)
  }),
  rect: { height: 600, width: 800 } as DOMRect,
  wallSolvedOutlines: new Map(),
  walls,
  worldToScreen: (point) => ({ x: point.x * 1000, y: point.z * 1000 }),
  ...overrides
});

describe("resolveFloorplanWallPick", () => {
  it("returns polygon and axis wall candidates using current floorplan rules", () => {
    const result = resolveFloorplanWallPick(
      createContext({
        pointInPolygonXZ: (_point, polygon) => polygon.length === 4,
        wallSolvedOutlines: new Map([["wall-b", [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 1 }]]])
      })
    );

    expect(result).toEqual({ polygonWallId: "wall-b", axisWallId: "wall-a" });
  });

  it("keeps placement wall pick priority on polygon before axis fallback", () => {
    const result = pickFloorplanWallId(
      createContext({
        axisSnapPx: 34,
        pointInPolygonXZ: () => true,
        wallSolvedOutlines: new Map([["wall-b", [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }]]])
      })
    );

    expect(result).toBe("wall-b");
  });

  it("filters axis wall candidates by the provided threshold", () => {
    const result = resolveFloorplanWallPick(
      createContext({
        axisSnapPx: 5,
        mouse: { x: 514, y: 0 }
      })
    );

    expect(result.axisWallId).toBeNull();
  });

  it("ignores walls that are not pickable", () => {
    const isWallPickable = vi.fn((id: string) => id !== "wall-a" && id !== "wall-b");

    const result = resolveFloorplanWallPick(createContext({ isWallPickable }));

    expect(result).toEqual({ polygonWallId: null, axisWallId: null });
    expect(isWallPickable).toHaveBeenCalledWith("wall-a");
    expect(isWallPickable).toHaveBeenCalledWith("wall-b");
  });
});
