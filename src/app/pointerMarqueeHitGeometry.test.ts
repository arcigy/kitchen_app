import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModuleMarqueeScreenBounds, buildWallMarqueeScreenPolygon, collectMarqueeHitIds } from "./pointerMarqueeHitGeometry";

function screenPoint(point: THREE.Vector3) {
  return {
    x: Math.round(point.x * 1000),
    y: Math.round(point.z * 1000)
  };
}

describe("pointer marquee hit geometry", () => {
  it("uses solved wall outline when it has at least three points", () => {
    const wall = {
      id: "w1",
      params: {
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 0 },
        thicknessMm: 100
      }
    };

    const polygon = buildWallMarqueeScreenPolygon({
      fromMmPoint: (point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000),
      solvedOutline: [{ x: 1, z: 2 }, { x: 3, z: 4 }, { x: 5, z: 6 }],
      wall,
      worldToScreen: screenPoint
    });

    expect(polygon).toEqual([{ x: 1000, y: 2000 }, { x: 3000, y: 4000 }, { x: 5000, y: 6000 }]);
  });

  it("builds fallback wall polygon from endpoints and wall thickness", () => {
    const wall = {
      id: "w1",
      params: {
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 0 },
        thicknessMm: 100
      }
    };

    const polygon = buildWallMarqueeScreenPolygon({
      fromMmPoint: (point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000),
      solvedOutline: null,
      wall,
      worldToScreen: screenPoint
    });

    expect(polygon).toEqual([{ x: 0, y: 50 }, { x: 0, y: -50 }, { x: 1000, y: -50 }, { x: 1000, y: 50 }]);
  });

  it("returns one screen point for degenerate wall fallback polygon", () => {
    const wall = {
      id: "w1",
      params: {
        aMm: { x: 250, z: 500 },
        bMm: { x: 250, z: 500 },
        thicknessMm: 100
      }
    };

    const polygon = buildWallMarqueeScreenPolygon({
      fromMmPoint: (point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000),
      solvedOutline: [],
      wall,
      worldToScreen: screenPoint
    });

    expect(polygon).toEqual([{ x: 250, y: 500 }]);
  });

  it("builds module screen bounds from geometry meshes", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4));
    mesh.position.set(3, 0, 5);
    mesh.updateMatrixWorld(true);

    expect(
      buildModuleMarqueeScreenBounds({
        meshes: [mesh],
        worldToScreen: screenPoint
      })
    ).toEqual({
      minX: 2000,
      maxX: 4000,
      minY: 3000,
      maxY: 7000
    });
  });

  it("returns null when module has no geometry meshes", () => {
    expect(
      buildModuleMarqueeScreenBounds({
        meshes: [],
        worldToScreen: screenPoint
      })
    ).toBeNull();
  });

  it("collects marquee wall hits with pinned and pickable filtering", () => {
    const hits = collectMarqueeHitIds({
      getModuleBounds: () => null,
      getWallPolygon: (wall) => (wall.id === "empty" ? [] : [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }]),
      isModuleSelectable: () => true,
      isWallPickable: (wall) => wall.id !== "hidden",
      marqueeMode: "contain",
      modules: [],
      pinnedInstanceIds: new Set(),
      pinnedWallIds: new Set(["pinned"]),
      selectionRect: { x0: 0, y0: 0, x1: 40, y1: 40 },
      walls: [{ id: "w1" }, { id: "pinned" }, { id: "hidden" }, { id: "empty" }, { id: "outside" }]
    });

    expect(hits).toEqual({ hitInstanceIds: [], hitWallIds: ["w1", "outside"] });
  });

  it("collects contained module hits and filters pinned and unselectable modules", () => {
    const hits = collectMarqueeHitIds({
      getModuleBounds: (module) =>
        module.id === "partial"
          ? { minX: 30, minY: 30, maxX: 60, maxY: 60 }
          : module.id === "empty"
            ? null
            : { minX: 10, minY: 10, maxX: 20, maxY: 20 },
      getWallPolygon: () => [],
      isModuleSelectable: (module) => module.id !== "blocked",
      isWallPickable: () => true,
      marqueeMode: "contain",
      modules: [{ id: "m1" }, { id: "pinned" }, { id: "blocked" }, { id: "partial" }, { id: "empty" }],
      pinnedInstanceIds: new Set(["pinned"]),
      pinnedWallIds: new Set(),
      selectionRect: { x0: 0, y0: 0, x1: 40, y1: 40 },
      walls: []
    });

    expect(hits).toEqual({ hitInstanceIds: ["m1"], hitWallIds: [] });
  });

  it("collects overlapping module hits in touch marquee mode", () => {
    const hits = collectMarqueeHitIds({
      getModuleBounds: (module) =>
        module.id === "partial"
          ? { minX: 30, minY: 30, maxX: 60, maxY: 60 }
          : { minX: 50, minY: 50, maxX: 60, maxY: 60 },
      getWallPolygon: () => [],
      isModuleSelectable: () => true,
      isWallPickable: () => true,
      marqueeMode: "touch",
      modules: [{ id: "partial" }, { id: "outside" }],
      pinnedInstanceIds: new Set(),
      pinnedWallIds: new Set(),
      selectionRect: { x0: 0, y0: 0, x1: 40, y1: 40 },
      walls: []
    });

    expect(hits).toEqual({ hitInstanceIds: ["partial"], hitWallIds: [] });
  });
});
