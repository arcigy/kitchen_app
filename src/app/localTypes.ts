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
export type DoorSwingDirection = "left" | "right";
export type DoorSwingSide = "inward" | "outward";
export type OpeningHandleType = "lever" | "knob" | "bar" | "none";

export type WindowParams = {
  wall: WallId;
  wallId?: string | null;
  widthMm: number;
  heightMm: number;
  sillHeightMm: number;
  centerMm: number;
  frameWidthMm: number;
  offsetFromInteriorMm: number;
  sashWidthMm: number;
  sashProfileDepthMm: number;
  frameProfileDepthMm: number;
  swingDirection: DoorSwingDirection;
  swingSide: DoorSwingSide;
  swingAngleDeg: number;
  handleType: OpeningHandleType;
  handleOffsetMm: number;
  handleHeightMm: number;
  materialId: string;
};

export type WindowInstance = {
  id: string;
  params: WindowParams;
  root: THREE.Group;
  frame: THREE.Group;
  plan: THREE.Group;
  selection: THREE.Group;
  pick: THREE.Mesh;
  outline: THREE.Line;
};

export type DoorParams = {
  wall: WallId;
  wallId?: string | null;
  widthMm: number;
  heightMm: number;
  centerMm: number;
  frameWidthMm: number;
  offsetFromInteriorMm: number;
  panelThicknessMm: number;
  swingDirection: DoorSwingDirection;
  swingSide: DoorSwingSide;
  swingAngleDeg: number;
  handleType: OpeningHandleType;
  handleOffsetMm: number;
  handleHeightMm: number;
  materialId: string;
};

export type DoorInstance = {
  id: string;
  params: DoorParams;
  root: THREE.Group;
  frame: THREE.Group;
  plan: THREE.Group;
  selection: THREE.Group;
  pick: THREE.Mesh;
  outline: THREE.Line;
};

export type ColumnShape = "square" | "rectangular" | "round";
export type ColumnJustifyX = "left" | "center" | "right";
export type ColumnJustifyY = "up" | "center" | "down";

export type ColumnParams = {
  name: string;
  shape: ColumnShape;
  xMm: number;
  zMm: number;
  justifyX: ColumnJustifyX;
  justifyY: ColumnJustifyY;
  widthMm: number;
  depthMm: number;
  diameterMm: number;
  heightMm: number;
  materialId: string;
};

export type ColumnInstance = {
  id: string;
  params: ColumnParams;
  root: THREE.Group;
  mesh: THREE.Mesh;
  outline: THREE.LineSegments;
  pick: THREE.Mesh;
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

export type SelectedKind = "module" | "kitchenGroup" | "window" | "door" | "wall" | "floor" | "underlay" | "section" | "column" | null;

export type WallParams = {
  typeId?: string | null;
  thicknessMm: number;
  heightMm: number;
  materialId: string;
  justification?: "center" | "interior" | "exterior";
  exteriorSign?: 1 | -1;
  joinEnds?: {
    a?: { enabled?: boolean; priority?: number };
    b?: { enabled?: boolean; priority?: number };
  };
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
  columnCounter?: number;
  columns?: Array<{ id: string; params: ColumnParams }>;
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
    positionMm: { x: number; y?: number; z: number };
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
    columnId?: string | null;
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
