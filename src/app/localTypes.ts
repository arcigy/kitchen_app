import * as THREE from "three";
import type { ModuleParams } from "../model/cabinetTypes";

export type LayoutInstance = {
  id: string;
  params: ModuleParams;
  kitchenGroupId: string | null;
  kitchenPlacement: KitchenPlacementBinding | null;
  root: THREE.Group;
  module: THREE.Group;
  localBox: THREE.Box3;
  pick: THREE.Mesh;
  outline: THREE.LineSegments;
};

export type WallId = "back" | "left" | "right";

export type WindowParams = {
  wall: WallId;
  widthMm: number;
  heightMm: number;
  sillHeightMm: number;
  centerMm: number;
};

export type WindowInstance = {
  params: WindowParams;
  root: THREE.Group;
  pick: THREE.Mesh;
  outline: THREE.Line;
};

export type SectionParams = {
  name: string;
  aMm: FloorBoundaryPoint;
  bMm: FloorBoundaryPoint;
  mirrored: boolean;
};

export type SectionInstance = {
  id: string;
  params: SectionParams;
  root: THREE.Group;
  line: THREE.LineSegments;
  arrows: THREE.LineSegments;
  pick: THREE.Mesh;
};

export type SectionElevationKey = "north" | "east" | "south" | "west";

export type SelectedKind = "module" | "kitchenGroup" | "window" | "wall" | "floor" | "underlay" | "section" | null;

export type WallParams = {
  thicknessMm: number;
  heightMm: number;
  materialId: string;
  justification?: "center" | "interior" | "exterior";
  exteriorSign?: 1 | -1;
  aMm: { x: number; z: number };
  bMm: { x: number; z: number };
};

export type WallInstance = {
  id: string;
  params: WallParams;
  heightMm: number;
  root: THREE.Group;
  mesh: THREE.Mesh;
  outline: THREE.LineSegments;
};

export type FloorBoundaryPoint = { x: number; z: number };

export type FloorParams = {
  name: string;
  heightMm: number;
  thicknessMm: number;
  materialId: string;
  boundary: FloorBoundaryPoint[];
};

export type FloorInstance = {
  id: string;
  params: FloorParams;
  root: THREE.Group;
  mesh: THREE.Mesh;
  outline: THREE.Line;
};

export type KitchenWorktopJustification = "center" | "back" | "front";

export type KitchenWorktopParams = {
  path: FloorBoundaryPoint[];
  justification: KitchenWorktopJustification;
  mirrored: boolean;
  depthMm: number;
  thicknessMm: number;
  heightMm: number;
  overhangSideMm: number;
  materialId: string;
};

export type KitchenWorktopInstance = {
  id: string;
  kitchenGroupId: string;
  params: KitchenWorktopParams;
  root: THREE.Group;
  mesh: THREE.Mesh;
  outline: THREE.Line;
};

export type KitchenPlacementBinding = {
  worktopId: string;
  kind?: "segment" | "corner";
  segmentIndex: number;
  offsetAlongM: number;
  cornerIndex?: number | null;
};

export type AlignTargetKind = "wall" | "module" | "worktop";
export type AlignLineRole = "center" | "exterior" | "interior" | "back" | "front" | "edge" | "endA" | "endB";

export type LayoutSnapshot = {
  wallCounter: number;
  walls: Array<{ id: string; params: WallParams }>;
  floorCounter?: number;
  floors?: Array<{ id: string; params: FloorParams }>;
  sectionCounter?: number;
  sections?: Array<{ id: string; params: SectionParams }>;
  worktopCounter?: number;
  worktops?: Array<{ id: string; kitchenGroupId: string; params: KitchenWorktopParams }>;
  instanceCounter: number;
  instances: Array<{
    id: string;
    params: ModuleParams;
    kitchenGroupId: string | null;
    kitchenPlacement?: KitchenPlacementBinding | null;
    positionMm: { x: number; z: number };
    rotationYDeg: number;
  }>;
  pinnedWallIds: string[];
  pinnedInstanceIds: string[];
  underlayPinned: boolean;
  selected: {
    kind: SelectedKind;
    wallId: string | null;
    wallIds: string[];
    floorId?: string | null;
    sectionId?: string | null;
    instId: string | null;
    instIds: string[];
  };
};

export type AlignPickedLine = {
  p: THREE.Vector3;
  dir: THREE.Vector3;
  segA: THREE.Vector3;
  segB: THREE.Vector3;
  label: string;
  targetKind: AlignTargetKind;
  lineRole: AlignLineRole;
  wallId?: string;
  instanceId?: string;
  worktopId?: string;
  segmentIndex?: number;
};

export type PickedLine2D = {
  wallId: string;
  kind: "center" | "face" | "end";
  a: THREE.Vector3;
  b: THREE.Vector3;
  p: THREE.Vector3;
  dir: THREE.Vector3;
  label: string;
};

export type FloorBoundaryTool = "line" | "rectangle" | "circle" | "pickLines";
export type FloorBoundarySegment = { a: FloorBoundaryPoint; b: FloorBoundaryPoint };
export type FloorEditVertexRef = { segmentIndex: number; endpoint: "a" | "b" };
export type FloorEditDrag =
  | { pointerId: number; kind: "vertex"; startPoint: FloorBoundaryPoint; startSegments: FloorBoundarySegment[] }
  | { pointerId: number; kind: "segment"; segmentIndex: number; startWorld: FloorBoundaryPoint; startSegments: FloorBoundarySegment[] };
