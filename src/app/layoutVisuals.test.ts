import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWallSnapMarkers } from "./layoutVisuals";
import type { WallInstance } from "./localTypes";

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
