import * as THREE from "three";
import type { DoorSwingDirection, DoorSwingSide, FloorBoundaryPoint, OpeningHandleType, WallId } from "../layout/appState";

export type {
  AlignPickedLine,
  ColumnInstance,
  ColumnJustifyX,
  ColumnJustifyY,
  ColumnParams,
  ColumnShape,
  DoorSwingDirection,
  DoorSwingSide,
  FloorBoundaryPoint,
  FloorInstance,
  FloorParams,
  KitchenPlacementBinding,
  KitchenWorktopInstance,
  KitchenWorktopJustification,
  KitchenWorktopParams,
  LayoutInstance,
  LayoutSnapshot,
  OpeningHandleType,
  SectionElevationKey,
  SectionInstance,
  SectionParams,
  SelectedKind,
  WallId,
  WallInstance,
  WallParams,
  WindowInstance,
  WindowParams
} from "../layout/appState";

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

export type AlignTargetKind = "wall" | "module" | "worktop";
export type AlignLineRole = "center" | "exterior" | "interior" | "back" | "front" | "edge" | "endA" | "endB";

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
