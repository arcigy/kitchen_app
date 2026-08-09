import * as THREE from "three";
import type { ModuleParams } from "../model/cabinetTypes";
export type { ModuleParams };
import type { SsgiPipeline } from "../rendering/ssgiPipeline";
import type { PhotoPathTracer } from "../rendering/photoPathTracer";
import { makeDefaultKitchenContext, resolveContext, type KitchenContext } from "./kitchenContext";
import type { CustomFurnitureInstance, CustomFurnitureParams } from "./customFurnitureTypes";
import type { WardrobeEditSaveState } from "./wardrobeEditMode";
import type { LedStripGroup } from "./ledStripTypes";

export type AppMode = "build" | "layout";
export type LayoutTool = "select" | "wall" | "led" | "align" | "trim" | "measure" | "section" | "dimension";
export type RenderMode = "realtime" | "realtime_ssgi" | "photo_pathtrace";
export type SelectedKind = "module" | "kitchenGroup" | "window" | "door" | "wall" | "floor" | "underlay" | "section" | "column" | null;
export type WallId = "back" | "left" | "right";
export type DoorSwingDirection = "left" | "right";
export type DoorSwingSide = "inward" | "outward";
export type OpeningHandleType = "lever" | "knob" | "bar" | "none";
export type PolygonClipPoint = [number, number];
export type PolygonClipRing = PolygonClipPoint[];
export type PolygonClipPolygon = PolygonClipRing[];
export type PolygonClipMultiPolygon = PolygonClipPolygon[];

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
  alignLockCounter?: number;
  alignLocks?: AlignLock[];
  customFurnitureCounter?: number;
  customFurniture?: Array<{ id: string; params: CustomFurnitureParams }>;
  /** Optional for backwards compatibility with project files saved before LED strips existed. */
  ledStripCounter?: number;
  ledStripGroups?: LedStripGroup[];
  wardrobe?: WardrobeEditSaveState | null;
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

export type FloorBoundaryPoint = {
  x: number;
  z: number;
};

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
  line: THREE.Line;
  arrows: THREE.LineSegments;
  pick: THREE.Mesh;
};

export type SectionElevationKey = "north" | "east" | "south" | "west";

export type KitchenWorktopJustification = "center" | "back" | "front";

export type KitchenWorktopParams = {
  path: FloorBoundaryPoint[];
  segmentDepthsMm?: number[];
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

export type KitchenGroup = {
  id: string;
  name: string;
  ctx: KitchenContext;
  instanceIds: string[];
};

export type AlignPickedLine = {
  p: THREE.Vector3;
  dir: THREE.Vector3;
  segA: THREE.Vector3;
  segB: THREE.Vector3;
  label: string;
  targetKind: "wall" | "module" | "worktop";
  lineRole: "center" | "exterior" | "interior" | "back" | "front" | "edge" | "endA" | "endB";
  wallId?: string;
  instanceId?: string;
  worktopId?: string;
  segmentIndex?: number;
};

export type AlignLockModuleSide = "left" | "right" | "front" | "back";

export type AlignLockEndpoint = {
  targetKind: AlignPickedLine["targetKind"];
  targetId: string;
  lineRole: AlignPickedLine["lineRole"];
  segmentIndex?: number;
  moduleSide?: AlignLockModuleSide;
};

export type AlignLock = {
  id: string;
  locked: boolean;
  a: AlignLockEndpoint;
  b: AlignLockEndpoint;
  pointMm: { x: number; z: number };
};

export interface AppState {
  // Scene & rendering
  mode: AppMode;
  viewMode: "3d" | "2d";
  renderMode: RenderMode;
  ssgi: SsgiPipeline | null;
  ssgiCameraUuid: string | null;
  photo: PhotoPathTracer | null;
  photoCameraUuid: string | null;
  photoLastLightingRevision: number;

  // Wall system
  walls: WallInstance[];
  wallCounter: number;
  wallPlanUnionMesh: THREE.Mesh | null;
  wallDebugEnabled: boolean;
  wallSolvedJoinPolys: Array<Array<{ x: number; z: number }>>;
  wallUnionPolys: PolygonClipMultiPolygon | null;
  floors: FloorInstance[];
  floorCounter: number;
  columns: ColumnInstance[];
  columnCounter: number;
  sections: SectionInstance[];
  sectionCounter: number;
  kitchenWorktops: KitchenWorktopInstance[];
  worktopCounter: number;
  customFurniture: CustomFurnitureInstance[];
  customFurnitureCounter: number;
  ledStripGroups: LedStripGroup[];
  ledStripCounter: number;
  wardrobeHistory: { getSaveState: () => WardrobeEditSaveState | null } | null;

  // Layout instances
  instances: LayoutInstance[];
  instanceCounter: number;
  params: ModuleParams;
  kitchenCtx: KitchenContext;
  kitchenEditMode: boolean;
  activeKitchenGroupId: string | null;
  kitchenGroups: KitchenGroup[];
  alignLocks: AlignLock[];
  alignLockCounter: number;

  // Selection
  layoutTool: LayoutTool;
  selectedKind: SelectedKind;
  selectedInstanceId: string | null;
  selectedWallId: string | null;
  selectedFloorId: string | null;
  selectedColumnId: string | null;
  selectedSectionId: string | null;
  selectedWallIds: Set<string>;
  selectedInstanceIds: Set<string>;
  pinnedWallIds: Set<string>;
  pinnedInstanceIds: Set<string>;
  underlayState: { pinned: boolean };
  windowInst: WindowInstance | null;
  selectedMesh: THREE.Mesh | null;
  selectedBox: THREE.BoxHelper | null;
  overlapBoxes: Array<{ mesh: THREE.Mesh; helper: THREE.BoxHelper }>;
  cabinetGroup: THREE.Group | null;
  grainArrow: THREE.ArrowHelper | null;

  // Placement
  placement: {
    active: boolean;
    params: ModuleParams | null;
    ghost: LayoutInstance | null;
    ghostValid: boolean;
    lastCursor: THREE.Vector3;
    pendingCursor: THREE.Vector3 | null;
    ghostFrame: number | null;
    lastGhostCursor: THREE.Vector3 | null;
  };

  // UI elements
  undoBtnEl: HTMLButtonElement | null;
  redoBtnEl: HTMLButtonElement | null;
  underlayStatusEl: HTMLDivElement | null;
  underlayScaleEl: HTMLInputElement | null;
  underlayOffXEl: HTMLInputElement | null;
  underlayOffZEl: HTMLInputElement | null;
  underlayRotEl: HTMLInputElement | null;
  underlayOpacityEl: HTMLInputElement | null;

  // History
  history: {
    past: LayoutSnapshot[];
    future: LayoutSnapshot[];
    current: LayoutSnapshot | null;
    max: number;
  };

  // Navigation
  // (Left empty or populated if we find navigation variables)
}

export function makeAppState(defaultParams: ModuleParams): AppState {
  return {
    mode: "build",
    viewMode: "3d",
    renderMode: "realtime",
    ssgi: null,
    ssgiCameraUuid: null,
    photo: null,
    photoCameraUuid: null,
    photoLastLightingRevision: -1,

    walls: [],
    wallCounter: 1,
    wallPlanUnionMesh: null,
    wallDebugEnabled: false,
    wallSolvedJoinPolys: [],
    wallUnionPolys: null,
    floors: [],
    floorCounter: 1,
    columns: [],
    columnCounter: 1,
    sections: [],
    sectionCounter: 1,
    kitchenWorktops: [],
    worktopCounter: 1,
    customFurniture: [],
    customFurnitureCounter: 1,
    ledStripGroups: [],
    ledStripCounter: 1,
    wardrobeHistory: null,

    instances: [],
    instanceCounter: 1,
    params: defaultParams,
    kitchenCtx: resolveContext(makeDefaultKitchenContext()),
    kitchenEditMode: false,
    activeKitchenGroupId: null,
    kitchenGroups: [],
    alignLocks: [],
    alignLockCounter: 1,

    layoutTool: "select",
    selectedKind: null,
    selectedInstanceId: null,
    selectedWallId: null,
    selectedFloorId: null,
    selectedColumnId: null,
    selectedSectionId: null,
    selectedWallIds: new Set(),
    selectedInstanceIds: new Set(),
    pinnedWallIds: new Set(),
    pinnedInstanceIds: new Set(),
    underlayState: { pinned: false },
    windowInst: null,
    selectedMesh: null,
    selectedBox: null,
    overlapBoxes: [],
    cabinetGroup: null,
    grainArrow: null,

    placement: {
      active: false,
      params: null,
      ghost: null,
      ghostValid: false,
      lastCursor: new THREE.Vector3(0, 0, 0),
      pendingCursor: null,
      ghostFrame: null,
      lastGhostCursor: null
    },

    undoBtnEl: null,
    redoBtnEl: null,
    underlayStatusEl: null,
    underlayScaleEl: null,
    underlayOffXEl: null,
    underlayOffZEl: null,
    underlayRotEl: null,
    underlayOpacityEl: null,

    history: {
      past: [],
      future: [],
      current: null,
      max: 80
    },
  };
}
