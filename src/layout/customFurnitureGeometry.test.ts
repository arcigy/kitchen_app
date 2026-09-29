import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  makeCustomFurnitureBoardGeometry,
  makeCustomFurnitureBoardOutlineGeometry,
  nearestBoardProfileEdge,
  polygonAreaMm2,
  polygonBoundsMm,
  polygonEdgeLengthMm,
  sanitizeCustomFurnitureProfile
} from "./customFurnitureGeometry";
import type { CustomFurnitureBoardParams } from "./customFurnitureTypes";
import { customBoardNetAreaMm2 } from "./customBoardProfile";

const horizontalBoard: CustomFurnitureBoardParams = {
  id: "b1",
  name: "Horizontal",
  kind: "horizontal",
  workplane: { type: "horizontal", elevationMm: 720 },
  profile: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 500 },
    { x: 0, y: 500 }
  ],
  thicknessMm: 18,
  materialId: "mat.board.body.dtd.grey.18",
  baseConstraint: "furnitureBase",
  baseOffsetMm: 0,
  topConstraint: "furnitureTop",
  topOffsetMm: 0,
  justification: "positive",
  edgeBanding: []
};

describe("customFurnitureGeometry", () => {
  it("sanitizes repeated profile points", () => {
    expect(sanitizeCustomFurnitureProfile([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ]);
  });

  it("calculates board area and edge lengths", () => {
    expect(polygonAreaMm2(horizontalBoard.profile)).toBe(500000);
    expect(polygonEdgeLengthMm(horizontalBoard.profile, 0)).toBe(1000);
    expect(polygonEdgeLengthMm(horizontalBoard.profile, 1)).toBe(500);
    expect(polygonBoundsMm(horizontalBoard.profile)).toMatchObject({ widthMm: 1000, heightMm: 500 });
  });

  it("builds horizontal board extrusion dimensions", () => {
    const geometry = makeCustomFurnitureBoardGeometry(horizontalBoard);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;

    expect(Math.round((box.max.x - box.min.x) * 1000)).toBe(1000);
    expect(Math.round((box.max.y - box.min.y) * 1000)).toBe(18);
    expect(Math.round((box.max.z - box.min.z) * 1000)).toBe(500);
  });

  it("builds one vertical board mesh along a curved plan path", () => {
    const curvedBoard: CustomFurnitureBoardParams = {
      ...horizontalBoard,
      id: "curved",
      name: "Curved vertical",
      kind: "vertical",
      workplane: {
        type: "vertical",
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 1000 },
        pathMm: [
          { x: 0, z: 0 },
          { x: 500, z: 120 },
          { x: 1000, z: 1000 }
        ],
        mirrored: false
      },
      profile: [
        { x: 0, y: 0 },
        { x: 1510, y: 0 },
        { x: 1510, y: 720 },
        { x: 0, y: 720 }
      ],
      justification: "center"
    };
    const geometry = makeCustomFurnitureBoardGeometry(curvedBoard);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;

    expect(Math.round((box.max.y - box.min.y) * 1000)).toBe(720);
    expect(Math.round((box.max.x - box.min.x) * 1000)).toBeGreaterThan(990);
    expect(Math.round((box.max.z - box.min.z) * 1000)).toBeGreaterThan(990);
  });

  it("omits internal rib lines from curved vertical board outlines", () => {
    const curvedBoard: CustomFurnitureBoardParams = {
      ...horizontalBoard,
      id: "curved-outline",
      name: "Curved outline",
      kind: "vertical",
      workplane: {
        type: "vertical",
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 1000 },
        pathMm: [
          { x: 0, z: 0 },
          { x: 250, z: 40 },
          { x: 700, z: 360 },
          { x: 1000, z: 1000 }
        ],
        mirrored: false
      },
      profile: [
        { x: 0, y: 0 },
        { x: 1800, y: 0 },
        { x: 1800, y: 720 },
        { x: 0, y: 720 }
      ],
      justification: "center"
    };
    const meshGeometry = makeCustomFurnitureBoardGeometry(curvedBoard);
    const rawEdges = new THREE.EdgesGeometry(meshGeometry);
    const cleanOutline = makeCustomFurnitureBoardOutlineGeometry(curvedBoard, meshGeometry);
    const rawLineVertexCount = rawEdges.getAttribute("position").count;
    const cleanLineVertexCount = cleanOutline.getAttribute("position").count;

    expect(cleanLineVertexCount).toBe(40);
    expect(cleanLineVertexCount).toBeLessThan(rawLineVertexCount);
  });

  it("finds nearest board edge in workplane space", () => {
    expect(nearestBoardProfileEdge(horizontalBoard, new THREE.Vector3(0.45, 0.72, 0.02))).toBe(0);
    expect(nearestBoardProfileEdge(horizontalBoard, new THREE.Vector3(0.98, 0.72, 0.25))).toBe(1);
  });

  it("keeps a cutout open across both arms of a bent vertical board", () => {
    const board: CustomFurnitureBoardParams = {
      ...horizontalBoard, kind: "vertical", justification: "center",
      profile: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 720 }, { x: 0, y: 720 }],
      workplane: { type: "vertical", aMm: { x: 0, z: 0 }, bMm: { x: 1000, z: 1000 }, mirrored: false,
        pathMm: [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 }] },
      cutouts: [{ id: "across-bend", profile: [{ x: 800, y: 200 }, { x: 1200, y: 200 }, { x: 1200, y: 500 }, { x: 800, y: 500 }] }]
    };
    const geometry = makeCustomFurnitureBoardGeometry(board);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    const hit = (origin: THREE.Vector3, direction: THREE.Vector3) => new THREE.Raycaster(origin, direction).intersectObject(mesh).length > 0;
    expect(hit(new THREE.Vector3(0.9, 0.3, -1), new THREE.Vector3(0, 0, 1))).toBe(false);
    expect(hit(new THREE.Vector3(2, 0.3, 0.1), new THREE.Vector3(-1, 0, 0))).toBe(false);
    expect(hit(new THREE.Vector3(0.6, 0.3, -1), new THREE.Vector3(0, 0, 1))).toBe(true);
    expect(hit(new THREE.Vector3(2, 0.3, 0.4), new THREE.Vector3(-1, 0, 0))).toBe(true);
    expect(customBoardNetAreaMm2(board)).toBe(1320000);
    expect(makeCustomFurnitureBoardOutlineGeometry(board, geometry).getAttribute("position").count).toBeGreaterThan(0);
    geometry.dispose(); material.dispose();
  });

  it("renders a fully removed board as an empty, valid geometry", () => {
    const board = { ...horizontalBoard, cutouts: [{ id: "whole", profile: horizontalBoard.profile }] };
    const geometry = makeCustomFurnitureBoardGeometry(board);
    expect(customBoardNetAreaMm2(board)).toBe(0);
    expect(geometry.getAttribute("position").count).toBe(0);
    expect(makeCustomFurnitureBoardOutlineGeometry(board, geometry).getAttribute("position").count).toBe(0);
    geometry.dispose();
  });
});
