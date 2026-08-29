import * as THREE from "three";

export type CustomFurnitureConstraint = "projectBase" | "furnitureBase" | "furnitureTop" | "absolute";
export type CustomFurnitureBoardKind = "horizontal" | "vertical" | "worktop" | "custom";
export type CustomFurnitureBoardJustification = "center" | "negative" | "positive";

export type CustomFurniturePlanPoint = { x: number; z: number };
export type CustomFurnitureProfilePoint = { x: number; y: number };
export type CustomFurnitureBoundarySegmentParams = {
  a: CustomFurniturePlanPoint;
  b: CustomFurniturePlanPoint;
  arcPoints?: CustomFurniturePlanPoint[];
};

export type CustomFurnitureVerticalWorkplane = {
  type: "vertical";
  aMm: CustomFurniturePlanPoint;
  bMm: CustomFurniturePlanPoint;
  pathMm?: CustomFurniturePlanPoint[];
  mirrored: boolean;
};

export type CustomFurnitureHorizontalWorkplane = {
  type: "horizontal";
  elevationMm: number;
};

export type CustomFurnitureBoardWorkplane = CustomFurnitureHorizontalWorkplane | CustomFurnitureVerticalWorkplane;

export type CustomFurnitureEdgeBand = {
  edgeIndex: number;
  materialId: string;
};

export type CustomFurnitureBoardParams = {
  id: string;
  name: string;
  kind: CustomFurnitureBoardKind;
  workplane: CustomFurnitureBoardWorkplane;
  profile: CustomFurnitureProfilePoint[];
  thicknessMm: number;
  materialId: string;
  baseConstraint: CustomFurnitureConstraint;
  baseOffsetMm: number;
  topConstraint: CustomFurnitureConstraint;
  topOffsetMm: number;
  justification: CustomFurnitureBoardJustification;
  edgeBanding: CustomFurnitureEdgeBand[];
};

export type CustomFurnitureParams = {
  name: string;
  baseConstraint: CustomFurnitureConstraint;
  baseOffsetMm: number;
  topConstraint: CustomFurnitureConstraint;
  topOffsetMm: number;
  boundary: CustomFurniturePlanPoint[];
  boundarySegments?: CustomFurnitureBoundarySegmentParams[];
  boards: CustomFurnitureBoardParams[];
};

export type CustomFurnitureBoardObject = {
  boardId: string;
  root: THREE.Group;
  mesh: THREE.Mesh;
  outline: THREE.LineSegments;
  edgeBandLines: THREE.LineSegments;
};

export type CustomFurnitureInstance = {
  id: string;
  params: CustomFurnitureParams;
  root: THREE.Group;
  boundaryLine: THREE.Line;
  boardsRoot: THREE.Group;
  boardObjects: CustomFurnitureBoardObject[];
};

export type CustomFurnitureSnapshotItem = {
  id: string;
  params: CustomFurnitureParams;
};
