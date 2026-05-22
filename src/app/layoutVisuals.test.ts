import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createSelectionHighlights, createWallSnapMarkers } from "./layoutVisuals";
import type { FloorInstance, LayoutInstance, WallInstance } from "./localTypes";

const createWall = (): WallInstance =>
  ({
    id: "wall",
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
    expect(position.count).toBe(7);
    expect(position.getX(0)).toBeCloseTo(-0.075);
    expect(position.getZ(4)).toBeCloseTo(5.18);
  });
});
