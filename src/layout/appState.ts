import * as THREE from "three";
import type { ModuleParams } from "../model/cabinetTypes";
export type { ModuleParams };
import type { SsgiPipeline } from "../rendering/ssgiPipeline";
import type { PhotoPathTracer } from "../rendering/photoPathTracer";

export type AppMode = "build" | "layout";
export type LayoutTool = "select" | "wall" | "align" | "trim" | "dimension";
export type RenderMode = "realtime" | "realtime_ssgi" | "photo_pathtrace";
export type SelectedKind = "module" | "window" | "wall" | "underlay" | "dimension" | null;
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

export type LayoutSnapshot = {
  wallCounter: number;
  walls: Array<{ id: string; params: WallParams }>;
  instanceCounter: number;
  instances: Array<{
    id: string;
    params: ModuleParams;
    positionMm: { x: number; z: number };
    rotationYDeg: number;
  }>;
  dimensionCounter: number;
  dimensions: DimensionParams[];
  pinnedWallIds: string[];
  pinnedInstanceIds: string[];
  underlayPinned: boolean;
  selected: {
    kind: SelectedKind;
    wallId: string | null;
    wallIds: string[];
    instId: string | null;
    instIds: string[];
    dimensionId: string | null;
  };
};

export type WallParams = {
  thicknessMm: number;
  materialId: string;
  justification?: "center" | "interior" | "exterior";
  exteriorSign?: 1 | -1;
  aMm: { x: number; z: number };
  bMm: { x: number; z: number };
};

export type WallInstance = {
  id: string;
  params: WallParams;
  root: THREE.Group;
  mesh: THREE.Mesh;
};

export type AlignWallLine = "center" | "exterior" | "interior" | "endA" | "endB";

export type DimensionRef = {
  wallId: string;
  wallLine: AlignWallLine;
  t: number;
};

export type DimensionParams = {
  id: string;
  a: DimensionRef;
  b: DimensionRef;
  offsetM: number;
};

export type DimensionInstance = {
  id: string;
  params: DimensionParams;
  root: THREE.Group;
  pick: THREE.Mesh;
  ext1: THREE.Mesh;
  ext2: THREE.Mesh;
  dim: THREE.Mesh;
  tick1: THREE.Mesh;
  tick2: THREE.Mesh;
  text: THREE.Sprite;
};

export type LayoutInstance = {
  id: string;
  params: ModuleParams;
  root: THREE.Group;
  module: THREE.Group;
  localBox: THREE.Box3;
  pick: THREE.Mesh;
  outline: THREE.Line;
};

export type AlignPickedLine = {
  p: THREE.Vector3;
  dir: THREE.Vector3;
  segA: THREE.Vector3;
  segB: THREE.Vector3;
  label: string;
  wallId: string;
  wallLine: AlignWallLine;
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
  wallUnionPolys: any | null;

  // Layout instances
  instances: LayoutInstance[];
  instanceCounter: number;
  params: ModuleParams;

  // Selection
  layoutTool: LayoutTool;
  selectedKind: SelectedKind;
  selectedInstanceId: string | null;
  selectedWallId: string | null;
  selectedDimensionId: string | null;
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
  // (Left empty or to be populated based on state vars that are related to placement)

  // Dimensions
  dimensions: DimensionInstance[];
  dimensionCounter: number;

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

    instances: [],
    instanceCounter: 1,
    params: defaultParams,

    layoutTool: "select",
    selectedKind: null,
    selectedInstanceId: null,
    selectedWallId: null,
    selectedDimensionId: null,
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

    dimensions: [],
    dimensionCounter: 1,

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
