import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createSelectionHighlights, createWallSnapMarkers } from "./layoutVisuals";
import type { FloorInstance, LayoutInstance, WallInstance } from "./localTypes";

const createWall = (id = "wall"): WallInstance =>
  ({
    id,
    params: {
      thicknessMm: 150,
      heightMm: 2600,
      materialId: "default",
      justification: "center",
      exteriorSign: 1,
      aMm: { x: 0, z: 0 },
      bMm: { x: 0, z: 5000 }
    },
    heightMm: 2600,
    root: new THREE.Group(),
    mesh: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  }) as WallInstance;

describe("createWallSnapMarkers", () => {
  it("shows only endpoint and axis markers, not every solved outline vertex", () => {
    const layoutRoot = new THREE.Group();
    const wall = createWall();
    const solvedOutlines = new Map([
      [
        "wall",
        [
          { x: -0.075, z: 0 },
          { x: 0.075, z: 0 },
          { x: 0.075, z: 5 },
          { x: 0.075, z: 5.03 },
          { x: -0.075, z: 5.18 },
          { x: -0.075, z: 5 }
        ]
      ]
    ]);
    const { wallSnapMarkers, showWallSnapMarkersFor } = createWallSnapMarkers({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [wall],
      getWallSolvedOutlines: () => solvedOutlines
    });

    showWallSnapMarkersFor("wall");

    expect(wallSnapMarkers.visible).toBe(true);
    expect(wallSnapMarkers.children).toHaveLength(3);
    expect(wallSnapMarkers.children.map((child) => child.userData.snapKind).sort()).toEqual(["axis", "endpoint", "endpoint"]);
  });
});

describe("createSelectionHighlights", () => {
  it("highlights selected walls with the wall outline, not a selection box", () => {
    const layoutRoot = new THREE.Group();
    const wall = createWall();
    const selectedWallIds = new Set(["wall"]);
    const solvedOutlines = new Map([
      [
        "wall",
        [
          { x: -0.075, z: 0 },
          { x: 0.075, z: 0 },
          { x: 0.075, z: 5 },
          { x: 0.075, z: 5.03 },
          { x: -0.075, z: 5.18 },
          { x: -0.075, z: 5 }
        ]
      ]
    ]);
    const { selectionHighlights, updateSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [wall],
      getSelectedWallIds: () => selectedWallIds,
      getSelectedInstanceIds: () => new Set<string>(),
      getWallSolvedOutlines: () => solvedOutlines,
      getSelectedKind: () => "wall",
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [] as LayoutInstance[],
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    updateSelectionHighlights();

    expect(selectionHighlights.visible).toBe(true);
    expect(selectionHighlights.children).toHaveLength(1);
    const line = selectionHighlights.children[0] as THREE.Line;
    const position = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    expect(position.count).toBe(12);
    expect(position.getX(0)).toBeCloseTo(-0.075);
    expect(position.getZ(8)).toBeCloseTo(5.18);
  });

  it("does not highlight short internal cap edges that are covered by neighboring walls", () => {
    const layoutRoot = new THREE.Group();
    const diagonal = createWall("diagonal");
    const left = createWall("left");
    const bottom = createWall("bottom");
    const selectedWallIds = new Set(["diagonal"]);
    const solvedOutlines = new Map([
      [
        "left",
        [
          { x: -0.075, z: 0.075 },
          { x: 0.075, z: 0.075 },
          { x: 0.075, z: 3 },
          { x: -0.075, z: 3 }
        ]
      ],
      [
        "bottom",
        [
          { x: -0.075, z: 0.075 },
          { x: -0.075, z: -0.075 },
          { x: 5, z: -0.075 },
          { x: 5, z: 0.075 }
        ]
      ],
      [
        "diagonal",
        [
          { x: 0.075, z: 0.132464 },
          { x: 0.075, z: 0.075 },
          { x: 0.270774, z: 0.075 },
          { x: 5.038587, z: 2.935688 },
          { x: 4.961413, z: 3.064312 }
        ]
      ]
    ]);
    const { selectionHighlights, updateSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [left, bottom, diagonal],
      getSelectedWallIds: () => selectedWallIds,
      getSelectedInstanceIds: () => new Set<string>(),
      getWallSolvedOutlines: () => solvedOutlines,
      getSelectedKind: () => "wall",
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [] as LayoutInstance[],
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    updateSelectionHighlights();

    const line = selectionHighlights.children[0] as THREE.LineSegments;
    const position = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    const segments = Array.from({ length: position.count / 2 }, (_, index) => {
      const i = index * 2;
      return [
        { x: position.getX(i), z: position.getZ(i) },
        { x: position.getX(i + 1), z: position.getZ(i + 1) }
      ];
    });

    expect(
      segments.some(
        ([a, b]) =>
          Math.hypot(a.x - b.x, a.z - b.z) < 0.21 &&
          Math.max(a.x, b.x) <= 0.28 &&
          Math.max(a.z, b.z) <= 0.14
      )
    ).toBe(false);
  });
});
