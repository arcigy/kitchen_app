import * as THREE from "three";
import type {
  AlignPickedLine,
  ColumnInstance,
  DoorInstance,
  FloorInstance,
  FloorBoundaryPoint,
  FloorBoundarySegment,
  LayoutInstance,
  KitchenPlacementBinding,
  PickedLine2D,
  WallInstance,
  WindowInstance
} from "./localTypes";
import type { PlanSnapBinding, PlanSnapOwner, PlanSnapResult } from "./planSnap";
import type { KitchenContext } from "../layout/kitchenContext";
import type { AppState, ColumnParams, LayoutTool, SelectedKind, WallParams } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";
import type { MeasureState, MarqueeState, WallEditHud } from "./measureTools";
import type { AssociativeMeasureKind } from "./measureAssociative";
import type { TechnicalDimensionRecord } from "./technicalDimensions";
import type { PointerTransformState, StartTransformOptions, TransformClearOptions, TransformKind } from "./transformStateTypes";
import { continueMoveAfterObjectSelection } from "./moveToolSelectionFlow";
import { pointerClientPointInRect, setPointerNdcFromEvent } from "./pointerCoordinateHelpers";
import type { CanvasContextTarget } from "./editorContextMenuController";
import {
  finishTrimNoChange,
  finishTrimSuccess,
  handleAlignToolClick,
  handleDimensionToolClick,
  handleMissingTrimTarget,
  handlePinnedTrimTarget,
  handleTrimNoPick,
  handleTrimTargetPick
} from "./pointerEditorToolClickHelpers";
import { updateAlignTrimToolPointerMoveHover, updateDimensionToolPointerMoveHover } from "./pointerEditorToolHoverHelpers";
import { intersectRayPlane } from "./pointerRaycastHelpers";
import { updatePointerTypedHud } from "./pointerTypedHudHelpers";
import { resolveTrimCornerEdit, resolveTrimSingleWallEdit } from "./pointerTrimGeometryHelpers";
import { createDimensionEditInput, parseDimensionMillimeters, showDimensionInputForPointerEvent } from "./pointerDimensionInputControls";
import {
  SNAP_DISTANCE_PX,
  SNAP_KIND_SCORE,
  SNAP_PRIORITY_MOVE_OBJECT_LINES,
  SNAP_PRIORITY_MOVE_OBJECT_POINTS,
  SNAP_PRIORITY_MOVE_TARGET
} from "./snapToolProfiles";
import {
  collectLineMoveKeypoints,
  collectModuleMoveKeypoints,
  collectMoveObjectSnapResults,
  collectOpeningMoveKeypointsForWall,
  constrainMoveDeltaToAxis,
  isOpeningMoveWithinSmartSnapBounds,
  isSelectedMoveSnapBinding,
  openingMoveBoundsForWall,
  prepareMoveDeltaForSnapMode,
  snapBindingWallId
} from "./pointerMoveSnapHelpers";
import { applyOpeningSwingControlEdit, handleOpeningSelectionControlClick } from "./pointerOpeningSwingControls";
import {
  beginPointerMarquee,
  boundsContainedInRect,
  boundsOverlapsRect,
  cancelPendingPointerMarqueeHit,
  finishActivePointerMarquee,
  finishPendingPointerMarquee,
  type ScreenRect,
  updatePointerMarqueePointerMove
} from "./pointerMarqueeSelection";
import {
  executeFallbackPickSelection,
  handleFloorplanSelection,
  handleEmptyFallbackPickSelection,
  resolveFloorplanModulePickCandidates,
} from "./pointerFloorplanSelection";
import { pickVisibleSelectionUserDataValue } from "./pointerSelectionVisibility";
import { pickFloorplanFloorBoundary } from "./pointerFloorplanFloorPick";
import { pickFloorplanOpening } from "./pointerFloorplanOpeningPick";
import { pickFloorplanWallId as pickResolvedFloorplanWallId, resolveFloorplanWallPick } from "./pointerFloorplanWallPick";
import {
  handleLegacySurfaceMeasurePointClick,
  handleMeasurePointClick,
  updateLegacySurfaceMeasurePointerMoveHover,
  updateMeasure2DPointerMoveHover,
  updateMeasure3DPointerMoveHover
} from "./pointerMeasureClickHelpers";
import { handleSectionDrawPointClick, updateSectionDrawPointerMoveHover } from "./pointerSectionDrawClickHelpers";
import { handleKitchenWorktopDrawPointClick, updateKitchenWorktopDrawPointerMoveHover } from "./pointerKitchenWorktopDrawClickHelpers";
import { handleWallDrawEndClick, handleWallDrawStartClick, updateActiveWallDrawPointerMoveHover, updateWallToolPointerMoveHover } from "./pointerWallDrawClickHelpers";
import type { createLedStripDrawController } from "./ledStripDrawController";
import type { SelectionHighlightTarget } from "./layoutVisuals";
import {
  finishWallEditHudDragPointerUp,
  updateWallEditHudDragPointerMove
} from "./wallEditDragController";
import { finishFloorBoundaryEditDragPointerUp, handleFloorBoundaryEditPointerDown, updateFloorBoundaryEditPointerMove } from "./floorBoundaryEdit";
import { handleUnderlayCalibrationPointerDown } from "./pointerUnderlayCalibration";
import { beginUnderlayDragPointerDown, finishUnderlayDragPointerUp, updateUnderlayDragPointerMove } from "./pointerUnderlayDrag";
import {
  handleColumnPlacementPreviewPointerMove,
  handleFloorplanPlacementClick,
  handlePlacementCommitPointerDown,
  handlePlacementPreviewPointerMove,
  handleSelectOpeningPlacementPreviewPointerMove
} from "./pointerPlacementFlow";
import { handleTransformClickPointerDown } from "./pointerTransformClickFlow";
import { handleTransformPointerMovePreview } from "./pointerTransformPreviewFlow";
import {
  beginDoorDragFromPick,
  beginWindowDragFromPick,
  handleOpeningDragPointerMove,
  type PointerOpeningDragState
} from "./pointerOpeningDragBegin";
import { updateModuleDragFromGroundHit, type PointerModuleDragState } from "./pointerModuleDrag";
import { finishPointerDragState } from "./pointerDragFinish";
import { buildModuleMarqueeScreenBounds, buildWallMarqueeScreenPolygon, collectMarqueeHitIds } from "./pointerMarqueeHitGeometry";
import { clearNonFloorplanFloorSelection } from "./selectionController";

export type KitchenGroupEditTarget = {
  groupId: string;
  focusInstanceId: string | null;
};

export type KitchenDoubleClickAction =
  | { type: "open-group"; target: KitchenGroupEditTarget }
  | { type: "open-module-editor"; instanceId: string }
  | null;

export function resolveKitchenGroupEditTarget(args: {
  moduleGroupId: string | null | undefined;
  moduleInstanceId: string | null | undefined;
  worktopGroupId: string | null | undefined;
  isKnownGroup: (groupId: string) => boolean;
}): KitchenGroupEditTarget | null {
  const moduleGroupId = args.moduleGroupId ?? null;
  const moduleInstanceId = args.moduleInstanceId ?? null;
  if (moduleGroupId && moduleInstanceId && args.isKnownGroup(moduleGroupId)) {
    return { groupId: moduleGroupId, focusInstanceId: moduleInstanceId };
  }
  const worktopGroupId = args.worktopGroupId ?? null;
  if (worktopGroupId && args.isKnownGroup(worktopGroupId)) {
    return { groupId: worktopGroupId, focusInstanceId: null };
  }
  return null;
}

export function resolveKitchenDoubleClickAction(args: {
  target: KitchenGroupEditTarget | null;
  kitchenEditMode: boolean;
  activeKitchenGroupId: string | null | undefined;
  moduleEditorActive: boolean;
}): KitchenDoubleClickAction {
  if (!args.target) return null;
  if (!args.kitchenEditMode) return { type: "open-group", target: args.target };
  if (args.moduleEditorActive) return null;
  if (args.target.groupId !== args.activeKitchenGroupId) return null;
  if (!args.target.focusInstanceId) return null;
  return { type: "open-module-editor", instanceId: args.target.focusInstanceId };
}

export function shouldStartLayoutMarqueeSelection(args: {
  button: number;
  floorEditActive: boolean;
  isColumnPlacementActive: boolean;
  isDoorPlacementActive: boolean;
  isWindowPlacementActive: boolean;
  layoutTool: string;
  measureEnabled: boolean;
  mode: string;
  placementActive: boolean;
  transformActive: boolean;
}) {
  return (
    args.mode === "layout" &&
    args.layoutTool === "select" &&
    !args.isWindowPlacementActive &&
    !args.isDoorPlacementActive &&
    !args.isColumnPlacementActive &&
    !args.floorEditActive &&
    !args.transformActive &&
    !args.placementActive &&
    !args.measureEnabled &&
    args.button === 0
  );
}

type FloorEditState = {
  active: boolean;
  drag:
    | null
    | { pointerId: number; kind: "vertex"; startPoint: { x: number; z: number }; startSegments: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }> }
    | { pointerId: number; kind: "segment"; segmentIndex: number; startWorld: { x: number; z: number }; startSegments: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }> };
  error: string;
  first: { x: number; z: number } | null;
  hover: { x: number; z: number } | null;
  ortho: boolean;
  selectedSegmentIndex: number | null;
  selectedVertex: { segmentIndex: number; endpoint: "a" | "b" } | null;
  segments: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }>;
  tool: "line" | "rectangle" | "circle" | "pickLines";
};

type PointerDrawSnapOverlay = {
  hide: () => void;
  showWorld: (
    point: THREE.Vector3,
    camera: THREE.Camera,
    rect: DOMRect,
    kind: Exclude<PlanSnapResult["kind"], "none">,
    opts?: { stable?: boolean }
  ) => void;
};

type PointerDimensionState = {
  hover: AlignPickedLine | null;
  picked: AlignPickedLine[];
  preview: unknown[];
};

type PickedFloorEditElement =
  | { kind: "vertex"; ref: { segmentIndex: number; endpoint: "a" | "b" } }
  | { kind: "segment"; segmentIndex: number };

type PointerPlanSnapOptions = {
  perpendicularFrom?: THREE.Vector3 | null;
  kindPriority?: Array<Exclude<PlanSnapResult["kind"], "none">>;
  sticky?: PlanSnapResult | null;
  stickyThresholdPx?: number;
  preferNearest?: boolean;
  cycleIndex?: number;
  ignoreBinding?: (binding: PlanSnapBinding | null | undefined, owner?: PlanSnapOwner) => boolean;
};

type PointerMeasureAxisAssist = { point: THREE.Vector3; distancePx: number };
type PointerMeasureAxisAssist3D = { axis: "x" | "y" | "z"; point: THREE.Vector3; distancePx: number };
type PointerMeasure3DSnap = { point: THREE.Vector3; kind: "free" | "edge" | "corner" };
type PointerPointSnapXZ = { point: THREE.Vector3; kind: "free" | "edge" | "corner" };
type PointerSurfacePick = { point: THREE.Vector3; object: THREE.Mesh };
type PointerWallAxisPoint = { t: number; closest: FloorBoundaryPoint; distMm: number };
type PointerSectionDrawPoint = {
  point: THREE.Vector3;
  kind: PlanSnapResult["kind"];
  axisLocked: boolean;
};

type PointerInputHandlersDataContext = {
  renderer: THREE.WebGLRenderer;
  walls: WallInstance[];
  windows: WindowInstance[];
  doors: DoorInstance[];
  columns: ColumnInstance[];
  instances: LayoutInstance[];
  floors: FloorInstance[];
  S: AppState & {
    activeKitchenGroupId: string | null;
    kitchenCtx: KitchenContext;
    kitchenGroups: Array<{ id: string; ctx: KitchenContext }>;
    kitchenEditMode: boolean;
  };
  activeViewerTab: string;
  addFloorEditSegment: (a: FloorBoundaryPoint, b: FloorBoundaryPoint) => void;
  addMeasurement: (
    a: THREE.Vector3,
    b: THREE.Vector3,
    aBinding: PlanSnapBinding,
    bBinding: PlanSnapBinding,
    options?: { kind?: AssociativeMeasureKind; distanceMm?: number }
  ) => unknown;
  addWall: (a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number) => WallInstance | null;
  alignState: { ref: AlignPickedLine | null; hover: AlignPickedLine | null; lastA: AlignPickedLine | null; lastB: AlignPickedLine | null; lastUntilMs: number };
  anyOverlap: (moving: LayoutInstance, ignoreId: string | null) => boolean;
  appendKitchenWorktopPoint: (point: FloorBoundaryPoint) => boolean;
  applyAlignBetweenPickedLines: (ref: AlignPickedLine, picked: AlignPickedLine) => { ok: boolean; reason: string };
  args: { viewerEl: HTMLElement; measureReadoutEl: HTMLElement };
  cabinetGroup: THREE.Object3D | null;
  applyMeasureAxisAssist: (
    firstPoint: THREE.Vector3 | null,
    point: THREE.Vector3,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx?: number
  ) => PointerMeasureAxisAssist | null;
  applyMeasureAxisAssist3D: (
    firstPoint: THREE.Vector3 | null,
    point: THREE.Vector3,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx?: number
  ) => PointerMeasureAxisAssist3D | null;
  applyWallConstraints: (moving: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
  applyMoveDelta: (delta: THREE.Vector3) => void;
  applyRotateAngle: (angleRad: number) => void;
  areAlignLinesParallel: (a: AlignPickedLine, b: AlignPickedLine) => boolean;
  axisLockPoint3D: (a: THREE.Vector3, b: THREE.Vector3) => THREE.Vector3;
  axisLockXZ: (a: THREE.Vector3, b: THREE.Vector3) => THREE.Vector3;
  autoOrientModuleToRoomWallIfSnapped: (instance: LayoutInstance, ignoreIds?: Set<string>) => void;
  autoJoinAtMmPoint: (point: FloorBoundaryPoint) => void;
  beginKitchenWorktopSelection: (worktopId: string, ev: PointerEvent, pointMm?: { x: number; z: number }) => boolean;
  findSelectableFloorplanWorktopAtPoint: (pointMm: { x: number; z: number }) => string | null;
  beginModuleSelection: (selectableId: string, ev: PointerEvent) => boolean;
  updateSelectionHover: (target: SelectionHighlightTarget | null) => void;
  bindingFromPlanSnap: (snapped: PlanSnapResult | null, fallbackPoint: THREE.Vector3) => PlanSnapBinding;
  cam: () => THREE.Camera;
  clearDoorPlacementPreview: () => void;
  clearTransform: (options?: TransformClearOptions) => void;
  clearWindowLightIfMissing: () => void;
  clearWindowPlacementPreview: () => void;
  cloneFloorSegments: (segments: FloorBoundarySegment[]) => FloorBoundarySegment[];
  commitHistory: (state: AppState) => void;
  commitPlacement: (state: AppState, helpers: PlacementHelpers) => boolean;
  commitSectionDraw: (bMm: FloorBoundaryPoint) => boolean;
  dimensionState: PointerDimensionState;
  doorDragState: PointerOpeningDragState;
  doorInst: DoorInstance | null;
  dragState: PointerModuleDragState;
  drawOrthoEnabled: boolean;
  drawSnapOverlay: PointerDrawSnapOverlay;
  floorEdit: FloorEditState;
  distance3dMm: (a: THREE.Vector3, b: THREE.Vector3) => number;
  distPxPointToSeg: (px: number, py: number, ax: number, ay: number, bx: number, by: number) => number;
  floorOrthoPoint: (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => FloorBoundaryPoint;
  floorPointEq: (a: FloorBoundaryPoint, b: FloorBoundaryPoint, tolMm?: number) => boolean;
  floorPointToWorld: (point: FloorBoundaryPoint, y?: number) => THREE.Vector3;
  formatMm: (value: THREE.Vector3) => string;
  findInstance: (id: string) => LayoutInstance | null;
  findKitchenWorktop: (id: string) => { id: string; kitchenGroupId: string } | null;
  findSelectableFloorplanModuleAtPoint: (pointMm: { x: number; z: number }, mousePx: { x: number; y: number }, rect: DOMRect) => string | null;
  fromMmPoint: (point: FloorBoundaryPoint) => THREE.Vector3;
  groundPlane: THREE.Plane;
  hudHoverLine: THREE.Mesh;
  hudWallEndAlignmentGuide: THREE.Line;
  hudPickLine1: THREE.Mesh;
  hudPickLine2: THREE.Mesh;
  kitchenMode: {
    enterExisting?: (groupId: string, focusInstanceId?: string | null) => void;
    enterModuleEditor?: (instanceId: string) => boolean;
    filterSelectableInstanceId: (id: string | null) => string | null;
    findKitchenGroup?: (groupId: string) => { id: string } | null;
    isTallModuleEditorActive?: () => boolean;
    getActiveTallEditorInstanceId?: () => string | null;
    selectTallSubmoduleFromObject?: (instanceId: string | null, object: THREE.Object3D | null | undefined, options?: { additive?: boolean }) => boolean;
    selectTallSubmodulesFromObjects?: (instanceId: string | null, objects: THREE.Object3D[], options?: { additive?: boolean }) => boolean;
    getTallSubmoduleHighlightTargetFromObject?: (instanceId: string, object: THREE.Object3D | null | undefined) => SelectionHighlightTarget | null;
    clearTallSubmoduleSelection?: () => void;
  } | null;
  getLayoutMeasureMeshes3d: () => THREE.Mesh[];
  getSelectableMeshes: (root: THREE.Object3D) => THREE.Mesh[];
  getAllInstanceGeometryMeshes: () => THREE.Mesh[];
  getColumnIdFromObject: (object: THREE.Object3D | null | undefined) => string | null;
  getDoorIdFromObject: (object: THREE.Object3D | null | undefined) => string | null;
  getColumnPickMeshes: () => THREE.Mesh[];
  getInstanceGeometryMeshes: (instance: LayoutInstance) => THREE.Mesh[];
  getInstanceIdFromObject: (object: THREE.Object3D | null | undefined) => string | null;
  getKitchenWorktopGeometryMeshes: () => THREE.Mesh[];
  getMeasure3DSnapTargetObject: (object: THREE.Object3D | null | undefined) => THREE.Object3D | null;
  getSectionIdFromObject: (object: THREE.Object3D | null | undefined) => string | null;
  getSectionPickMeshes: () => THREE.Mesh[];
  getWorktopIdFromObject: (object: THREE.Object3D | null | undefined) => string | null;
  hasUnderlaySource?: () => boolean;
  kitchenWorktopDraw: {
    active: boolean;
    typedMm: string;
    hoverPoint: FloorBoundaryPoint | null;
    lastPointerPx: { x: number; y: number };
    points: FloorBoundaryPoint[];
    previewRoot: unknown;
  };
  layoutRoot: THREE.Object3D;
  ledStripDrawController?: ReturnType<typeof createLedStripDrawController>;
  layoutTool: LayoutTool;
  marquee: MarqueeState;
  marqueeEl: HTMLElement;
  measureState: MeasureState;
  mode: AppState["mode"];
  openQuickActionMenu?: (x: number, y: number) => void;
  hudLineThicknessM: (rect: DOMRect) => number;
  isColumnPlacementActive: () => boolean;
  isModuleAlignLocked: (id: string) => boolean;
  isDoorPlacementActive: () => boolean;
  isObjectPickable: (object: THREE.Object3D | null | undefined) => boolean;
  isVisibilityTargetPickable: (key: string | null | undefined) => boolean;
  isWindowPlacementActive: () => boolean;
  inferKitchenPlacementBinding: (instance: LayoutInstance, groupId: string, backOffsetMm: number) => KitchenPlacementBinding | null;
  syncKitchenRunEndClosures?: (groupId: string, backOffsetMm?: number) => boolean;
  insertColumnAtPoint: (pointMm: FloorBoundaryPoint) => boolean;
  insertDoorAtWallPoint: (wallId: string, pointMm: FloorBoundaryPoint) => boolean;
  insertWindowAtWallPoint: (wallId: string, pointMm: FloorBoundaryPoint) => boolean;
  lineLineIntersectionXZ: (p1: THREE.Vector3, d1: THREE.Vector3, p2: THREE.Vector3, d2: THREE.Vector3) => THREE.Vector3 | null;
  keepStickyPlanSnap: (
    rawPoint: THREE.Vector3,
    sticky: PlanSnapResult | null,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx?: number
  ) => PlanSnapResult | null;
  makeWallPreviewMesh: (a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number) => THREE.Mesh;
  makeFloorCirclePoints: (center: FloorBoundaryPoint, edge: FloorBoundaryPoint, segments?: number) => FloorBoundaryPoint[];
  moveFloorEditSegment: (
    startSegments: FloorBoundarySegment[],
    segmentIndex: number,
    startWorld: FloorBoundaryPoint,
    nextWorld: FloorBoundaryPoint
  ) => void;
  moveFloorEditVertex: (startSegments: FloorBoundarySegment[], startPoint: FloorBoundaryPoint, nextPoint: FloorBoundaryPoint) => void;
  moduleOverlapsKitchenWorktops: (instance: LayoutInstance) => boolean;
  moduleOverlapsWalls: (instance: LayoutInstance) => boolean;
  mountWindowControls: () => void;
  moveWallEndpointAndConnected: (wall: WallInstance, which: "a" | "b", dxMm: number, dzMm: number) => boolean;
  nudgePinnedModuleChain: (instance: LayoutInstance, delta: THREE.Vector3) => Array<{ id: string; prev: THREE.Vector3 }>;
  planarDistanceMm: (a: THREE.Vector3, b: THREE.Vector3) => number;
  pinnedInstanceIds: Set<string>;
  pinnedWallIds: Set<string>;
  placement: AppState["placement"];
  placementHelpers: PlacementHelpers;
  pointerNdc: THREE.Vector2;
  raycaster: THREE.Raycaster;
  sectionDraw: { active?: boolean; a: unknown; axisLocked: boolean; hoverPoint: unknown; previewRoot?: unknown };
  selectPlanSnap: PlanSnapResult | null;
  selectedColumnId: string | null;
  selectedFloorId: string | null;
  selectedInstanceId: string | null;
  selectedInstanceIds: Set<string>;
  selectedKind: SelectedKind;
  selectedKitchenGroupId: string | null;
  selectedSectionId: string | null;
  selectedUnderlayBox: THREE.BoxHelper | null;
  selectedWallId: string | null;
  selectedWallIds: Set<string>;
  clearPreview: () => void;
  clearToolHud: () => void;
  clearWallDrawState: () => void;
  hideHoverCursor: () => void;
  mountProps: () => void;
  rebuildGhost: (state: AppState, helpers: PlacementHelpers, point: THREE.Vector3) => void;
  scheduleRebuildGhost: (state: AppState, helpers: PlacementHelpers, point: THREE.Vector3) => void;
  rebuildWall: (wall: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
  pickDimensionLineAt?: (hitPoint: THREE.Vector3, mousePx: { x: number; y: number }, rect: DOMRect) => AlignPickedLine | null;
  pickSurfacePoint: (raycaster: THREE.Raycaster, meshes: THREE.Mesh[]) => PointerSurfacePick | null;
  pickWallLine2D: (raw: THREE.Vector3, rect: DOMRect, camera: THREE.Camera, maxPx?: number) => PickedLine2D | null;
  pointInPolygonXZ: (point: FloorBoundaryPoint, polygon: FloorBoundaryPoint[]) => boolean;
  pointOnWallAxisMm: (wall: WallInstance, point: FloorBoundaryPoint) => PointerWallAxisPoint;
  renderFloorBoundaryEdit: () => void;
  resolveKitchenWorktopDrawSnap: (rawPoint: THREE.Vector3, rect: DOMRect) => PlanSnapResult | null;
  resolveMeasurePlanSnap: (hitPoint: THREE.Vector3, rect: DOMRect, normalMode: boolean) => PlanSnapResult;
  resolveSectionDrawPoint: (rawPoint: THREE.Vector3, rect: DOMRect, allowAxis?: boolean) => PointerSectionDrawPoint;
  scheduleKitchenWorktopPreviewUpdate: () => void;
  setFirstPointMarker: (point: THREE.Vector3 | null) => void;
  setInstanceSelected: (id: string | null) => void;
  setSelectedColumn: (id: string | null) => void;
  setSelectedDoor: () => void;
  setSelectedFloor: (id: string | null) => void;
  setSelectedModule: (id: string | null) => void;
  setSelectedSection: (id: string | null) => void;
  setSelectedUnderlay: () => void;
  setSelectedWall: (id: string | null) => void;
  setToolSelect: () => void;
  setSelectedWindow: () => void;
  setUnderlayStatus: (message: string) => void;
  selectMesh: (mesh: THREE.Mesh | null) => void;
  setWallEndpointAndConnectedMm: (wall: WallInstance, which: "a" | "b", nextPoint: FloorBoundaryPoint) => boolean;
  setWallEndpointsAndConnectedMm: (edits: Array<{ wall: WallInstance; which: "a" | "b"; next: FloorBoundaryPoint }>) => boolean;
  showWallSnapMarkersFor: (wallId: string | null) => void;
  snapAxisXZ: (a: THREE.Vector3, b: THREE.Vector3, enabled: boolean) => THREE.Vector3;
  snapPoint2D: (
    raw: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
    maxPx?: number,
    options?: PointerPlanSnapOptions
  ) => PlanSnapResult;
  snapPoint3D: (
    point: THREE.Vector3,
    target: THREE.Object3D,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx?: number
  ) => PointerMeasure3DSnap;
  snapPointXZ: (point: THREE.Vector3, mesh: THREE.Mesh, threshold?: number) => PointerPointSnapXZ;
  snapPosition: (moving: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
  startTransformFromSelection: (kind: TransformKind, opts?: StartTransformOptions) => boolean;
  syncSelectionState: () => void;
  updateAllSectionVisuals: () => void;
  updateColumnPlacementPreview: (pointMm: { x: number; z: number } | null) => boolean;
  updateDoorPlacementPreview: (wallId: string | null, pointMm: { x: number; z: number } | null) => boolean;
  updateDoorTransform: (door: DoorInstance) => void;
  updateHoverCursor: (point: THREE.Vector2, kind: MeasureState["hoverSnap"]) => void;
  updateHudDashedLine: (line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) => void;
  updateHudLine: (mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, thicknessM: number) => void;
  updateLayoutPanel: () => void;
  updateMeasureHoverFromPlanPoint: (hitPoint: THREE.Vector3, rect: DOMRect, normalMode: boolean) => void;
  updatePreview: (
    a: THREE.Vector3,
    b: THREE.Vector3,
    rect: DOMRect,
    distanceMm?: number,
    options?: { kind?: AssociativeMeasureKind }
  ) => void;
  updateSectionDrawPreview: () => void;
  updateSelectionHighlights: () => void;
  toFreePlanBinding: (point: THREE.Vector3) => PlanSnapBinding;
  toMmPoint: (point: THREE.Vector3) => FloorBoundaryPoint;
  updateUnderlayTransform: () => void;
  updateWallMeshWithJustification: (
    mesh: THREE.Mesh,
    refA: THREE.Vector3 | null,
    refB: THREE.Vector3 | null,
    thicknessMm: number,
    justification: "center" | "interior" | "exterior",
    exteriorSign: 1 | -1,
    heightMm?: number
  ) => void;
  updateWindowPlacementPreview: (wallId: string | null, pointMm: { x: number; z: number } | null) => boolean;
  updateWindowTransform: (window: WindowInstance) => void;
  worldToFloorPoint: (point: THREE.Vector3) => FloorBoundaryPoint;
  worldToScreen: (world: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) => THREE.Vector2;
  technicalDimensions: {
    buildFromPickedLines: (picked: AlignPickedLine[], hitPoint: THREE.Vector3, mode: string) => TechnicalDimensionRecord[];
    commitDimensions: (dimensions: TechnicalDimensionRecord[]) => void;
    isLinePicked: (line: AlignPickedLine) => boolean;
    resetDraft: () => void;
  };
  pickAlignLineAt: (hitPoint: THREE.Vector3, mousePx: { x: number; y: number }, rect: DOMRect) => AlignPickedLine | null;
  pickCompatibleAlignLineAt: (reference: AlignPickedLine, hitPoint: THREE.Vector3, mousePx: { x: number; y: number }, rect: DOMRect) => AlignPickedLine | null;
  pickFloorEditElement: (mouse: { x: number; y: number }, rect: DOMRect) => PickedFloorEditElement | null;
  transformState: PointerTransformState;
  trimState: {
    hover: AlignPickedLine | null;
    lastCutter: AlignPickedLine | null;
    lastTarget: AlignPickedLine | null;
    lastUntilMs: number;
    step: string;
    targetClick: THREE.Vector3 | null;
    targetPick: AlignPickedLine | null;
    targetWallId: string | null;
  };
  underlayCal: { active: boolean; first: THREE.Vector3 | null; knownMm: number; mode: "calibrate" | "reference" };
  underlayDragState: { active: boolean; pointerId: number | null; startOffsetMm: { x: number; z: number }; startWorld: THREE.Vector3 };
  underlayMesh: THREE.Object3D & { visible: boolean };
  underlayOffXEl: HTMLInputElement | null;
  underlayOffZEl: HTMLInputElement | null;
  underlayScaleEl: HTMLInputElement | null;
  underlayState: { offsetMm: { x: number; z: number }; pinned: boolean; scale: number };
  viewMode: AppState["viewMode"];
  viewNavigation: {
    handlePointerDown: (ev: PointerEvent) => boolean;
    handlePointerMove: (ev: PointerEvent) => boolean;
    handlePointerUp: (ev: PointerEvent) => boolean;
  };
  wallDefault: Pick<WallParams, "exteriorSign" | "heightMm" | "justification" | "thicknessMm">;
  wallDefs: Record<string, { axis: "x" | "z"; plane: THREE.Plane }>;
  wallDraw: {
    active: boolean;
    a: THREE.Vector3 | null;
    chainStart: THREE.Vector3 | null;
    freeMm?: boolean;
    hoverB: THREE.Vector3 | null;
    lastPointerPx: { x: number; y: number };
    preview: THREE.Mesh | null;
    segments: number;
    typedMm: string;
  };
  wallDrawSnap: PlanSnapResult | null;
  wallEditHud: WallEditHud;
  wallSolvedOutlines: Map<string, Array<{ x: number; z: number }>>;
  wallTypedHud: HTMLElement;
  windowDragState: PointerOpeningDragState;
  windowInst: WindowInstance | null;
};

type PointerInputHandlersContext = PointerInputHandlersDataContext;

const isWallDrawFreeMm = (wallDraw: { freeMm?: boolean }) => wallDraw.freeMm === true;

type WindowDimensionParam = "widthMm" | "heightMm" | "sillHeightMm";
type DoorDimensionParam = "widthMm" | "heightMm";
type DoorSwingControlAction = "toggleHandedness" | "toggleSwingSide";
type WindowSwingControlAction = "toggleHandedness" | "toggleSwingSide";

type MoveKeyPoint = {
  point: THREE.Vector3;
  label: string;
  axis?: THREE.Vector3 | null;
  hostWallId?: string | null;
};

type MoveObjectSnap = {
  delta: THREE.Vector3;
  snap: PlanSnapResult;
  source: THREE.Vector3;
  target: THREE.Vector3;
  label: string;
};

export function installPointerInputHandlers(ctx: PointerInputHandlersContext) {
  const isPickableObject = (object: THREE.Object3D | null | undefined) =>
    !ctx.isObjectPickable || ctx.isObjectPickable(object);
  const isPickableKey = (key: string | null | undefined) =>
    !ctx.isVisibilityTargetPickable || ctx.isVisibilityTargetPickable(key);
  const hasLoadedUnderlay = () => !ctx.hasUnderlaySource || ctx.hasUnderlaySource();
  const pickableObjects = <T extends THREE.Object3D>(objects: T[]) => objects.filter((object) => isPickableObject(object));
  const hasTallSubmodulePickData = (object: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = object;
    while (current) {
      if (typeof current.userData?.selectableSubmoduleId === "string" && current.userData.selectableSubmoduleId.trim()) return true;
      current = current.parent;
    }
    return false;
  };
  const makeNoSnapResult = (point: THREE.Vector3) => ({ point, kind: "none" } satisfies PlanSnapResult);
  const syncKitchenDragBindings = (instanceId: string | null) => {
    if (!instanceId) return;
    const moved = ctx.findInstance(instanceId);
    const groupId = moved?.kitchenGroupId ?? null;
    if (!groupId) return;
    const group = ctx.S.kitchenGroups.find((item: { id: string }) => item.id === groupId) ?? null;
    const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? ctx.S.kitchenCtx.worktopBackOffsetMm;
    for (const inst of ctx.instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      inst.kitchenPlacement = ctx.inferKitchenPlacementBinding(inst, groupId, backOffsetMm);
    }
    ctx.syncKitchenRunEndClosures?.(groupId, backOffsetMm);
  };
  const updateRaycasterFromPointer = (ev: Pick<PointerEvent, "clientX" | "clientY">, rect: DOMRect) => {
    setPointerNdcFromEvent(ctx.pointerNdc, ev, rect);
    ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
  };
  const resolveMoveSnap = (raw: THREE.Vector3, rect: DOMRect, perpendicularFrom?: THREE.Vector3 | null) => {
    if (ctx.transformState.moveSnapDisabled) {
      ctx.selectPlanSnap = null;
      return makeNoSnapResult(raw);
    }
    const snapped = ctx.snapPoint2D(raw, rect, ctx.cam(), SNAP_DISTANCE_PX.moveTarget, {
      perpendicularFrom: perpendicularFrom ?? null,
      kindPriority: SNAP_PRIORITY_MOVE_TARGET,
      sticky: ctx.selectPlanSnap,
      ignoreBinding: isIgnoredMoveSnapBinding
    });
    const stickySnap = ctx.keepStickyPlanSnap(raw, ctx.selectPlanSnap, ctx.cam(), rect, SNAP_DISTANCE_PX.moveSticky);
    const activeSnap =
      snapped.kind !== "none"
        ? snapped
        : stickySnap && !isIgnoredMoveSnapBinding(stickySnap.binding)
          ? stickySnap
          : null;
    ctx.selectPlanSnap = activeSnap;
    return activeSnap;
  };
  const updateMoveSnapFeedback = (snap: PlanSnapResult | null, point: THREE.Vector3, rect: DOMRect) => {
    if (snap?.kind && snap.kind !== "none") {
      ctx.updateHoverCursor(ctx.worldToScreen(point, ctx.cam(), rect), snap.kind);
      ctx.drawSnapOverlay.showWorld(point, ctx.cam(), rect, snap.kind);
      if (snap.a && snap.b && ["edge", "axis", "midpoint", "perpendicular"].includes(snap.kind)) {
        ctx.updateHudLine(ctx.hudHoverLine, snap.a, snap.b, ctx.hudLineThicknessM(rect) * 1.75);
      } else {
        ctx.hudHoverLine.visible = false;
      }
      return;
    }
    ctx.hideHoverCursor();
    ctx.drawSnapOverlay.hide();
    ctx.hudHoverLine.visible = false;
  };
  const isIgnoredMoveSnapBinding = (binding: PlanSnapBinding | null | undefined) => {
    return isSelectedMoveSnapBinding(binding, {
      wallIds: ctx.transformState.selectedWallIds,
      instanceIds: ctx.transformState.selectedInstanceIds,
      sectionIds: ctx.transformState.selectedSectionIds,
      windowIds: ctx.transformState.selectedWindowIds,
      doorIds: ctx.transformState.selectedDoorIds
    });
  };
  const openingMoveBounds = (
    params: { wallId?: string | null; centerMm: number; widthMm: number; frameWidthMm?: number },
    delta: THREE.Vector3
  ) => {
    if (!params.wallId) return null;
    const wall = ctx.walls.find((item) => item.id === params.wallId) ?? null;
    return openingMoveBoundsForWall(params, delta, wall);
  };
  const isOpeningSmartSnapDeltaValid = (delta: THREE.Vector3) => {
    const checkOpening = (params: { wallId?: string | null; centerMm: number; widthMm: number; frameWidthMm?: number }) => {
      const bounds = openingMoveBounds(params, delta);
      if (!bounds) return true;
      return isOpeningMoveWithinSmartSnapBounds(params, bounds);
    };

    for (const id of ctx.transformState.selectedWindowIds as string[]) {
      const start = ctx.transformState.startWindows.get(id);
      if (start && !checkOpening(start)) return false;
    }
    for (const id of ctx.transformState.selectedDoorIds as string[]) {
      const start = ctx.transformState.startDoors.get(id);
      if (start && !checkOpening(start)) return false;
    }
    return true;
  };
  const collectMoveObjectSnapResultsForPoint = (
    point: THREE.Vector3,
    rect: DOMRect,
    searchPx: number,
    kindPriority: Array<Exclude<PlanSnapResult["kind"], "none">>
  ) => {
    return collectMoveObjectSnapResults((cycleIndex) => {
      const options: {
        kindPriority: Array<Exclude<PlanSnapResult["kind"], "none">>;
        cycleIndex?: number;
        ignoreBinding: (binding: PlanSnapBinding | null | undefined) => boolean;
      } = {
        kindPriority,
        ignoreBinding: isIgnoredMoveSnapBinding
      };
      if (cycleIndex != null) options.cycleIndex = cycleIndex;
      return ctx.snapPoint2D(point, rect, ctx.cam(), searchPx, options) as PlanSnapResult;
    });
  };
  const collectOpeningMoveKeypoints = (
    keypoints: MoveKeyPoint[],
    params: { wallId?: string | null; centerMm: number; widthMm: number },
    delta: THREE.Vector3,
    label: string
  ) => {
    if (!params.wallId) return;
    const wall = ctx.walls.find((item) => item.id === params.wallId) ?? null;
    keypoints.push(...collectOpeningMoveKeypointsForWall(params, delta, label, wall));
  };
  const collectMoveKeypoints = (delta: THREE.Vector3) => {
    const keypoints: MoveKeyPoint[] = [];

    for (const id of ctx.transformState.selectedWallIds as string[]) {
      const start = ctx.transformState.startWalls.get(id);
      if (!start) continue;
      keypoints.push(...collectLineMoveKeypoints(start, delta, `wall ${id}`));
    }

    for (const id of ctx.transformState.selectedInstanceIds as string[]) {
      const inst = ctx.findInstance?.(id) ?? ctx.instances.find((item) => item.id === id) ?? null;
      const start = ctx.transformState.startInstances.get(id);
      if (!inst || !start) continue;
      keypoints.push(...collectModuleMoveKeypoints(inst.localBox, start, delta, `module ${id}`));
    }

    for (const id of ctx.transformState.selectedWindowIds as string[]) {
      const start = ctx.transformState.startWindows.get(id);
      if (start) collectOpeningMoveKeypoints(keypoints, start, delta, `window ${id}`);
    }
    for (const id of ctx.transformState.selectedDoorIds as string[]) {
      const start = ctx.transformState.startDoors.get(id);
      if (start) collectOpeningMoveKeypoints(keypoints, start, delta, `door ${id}`);
    }
    for (const id of ctx.transformState.selectedSectionIds as string[]) {
      const start = ctx.transformState.startSections.get(id);
      if (!start) continue;
      keypoints.push(...collectLineMoveKeypoints(start, delta, `section ${id}`));
    }

    return keypoints;
  };
  const resolveMoveObjectSnap = (delta: THREE.Vector3, rect: DOMRect): MoveObjectSnap | null => {
    const keypoints = collectMoveKeypoints(delta);
    if (keypoints.length === 0) return null;
    const maxPx = ctx.transformState.moveSnapDisabled ? SNAP_DISTANCE_PX.moveObjectFree : SNAP_DISTANCE_PX.moveObject;
    let best: { snap: MoveObjectSnap; score: number } | null = null;
    const priorityGroups = [SNAP_PRIORITY_MOVE_OBJECT_POINTS, SNAP_PRIORITY_MOVE_OBJECT_LINES];

    for (const keypoint of keypoints) {
      for (const kindPriority of priorityGroups) {
        const axis = keypoint.axis?.clone().setY(0) ?? null;
        const axisSnap = !!axis && axis.lengthSq() > 1e-10;
        const searchPx = axisSnap ? Math.max(maxPx * 2.25, maxPx + 24) : maxPx;
        const snaps = collectMoveObjectSnapResultsForPoint(keypoint.point, rect, searchPx, kindPriority);

        for (const snap of snaps) {
          let adjustment = snap.point.clone().sub(keypoint.point).setY(0);
          if (axisSnap && axis) {
            const normalizedAxis = axis.clone().normalize();
            adjustment = normalizedAxis.multiplyScalar(adjustment.dot(normalizedAxis));
          }
          if (adjustment.lengthSq() < 1e-8) continue;

          const target = keypoint.point.clone().add(adjustment);
          const sourceScreen = ctx.worldToScreen(keypoint.point, ctx.cam(), rect);
          const targetScreen = ctx.worldToScreen(target, ctx.cam(), rect);
          const snapScreen = ctx.worldToScreen(snap.point, ctx.cam(), rect);
          const distancePx = Math.hypot(sourceScreen.x - targetScreen.x, sourceScreen.y - targetScreen.y);
          if (distancePx > maxPx) continue;

          const perpendicularPx = Math.hypot(targetScreen.x - snapScreen.x, targetScreen.y - snapScreen.y);
          const sameHostWall = !!keypoint.hostWallId && snapBindingWallId(snap.binding) === keypoint.hostWallId;
          const score =
            distancePx * (SNAP_KIND_SCORE[snap.kind as Exclude<PlanSnapResult["kind"], "none">] ?? 1) +
            (axisSnap ? perpendicularPx * (sameHostWall ? 0.08 : 0.2) : 0) +
            (keypoint.hostWallId && !sameHostWall ? 2 : 0);
          const candidate = {
            delta: delta.clone().add(adjustment),
            snap,
            source: keypoint.point.clone(),
            target,
            label: keypoint.label
          };
          if (!isOpeningSmartSnapDeltaValid(candidate.delta)) continue;
          if (!best || score < best.score) best = { snap: candidate, score };
        }
      }
    }

    return best?.snap ?? null;
  };
  const resolveMoveDeltaWithObjectSnap = (delta: THREE.Vector3, rect: DOMRect) => {
    const objectSnap = resolveMoveObjectSnap(delta, rect);
    if (!objectSnap) return { delta: prepareMoveDeltaForSnapMode(delta, ctx.transformState.moveSnapDisabled), objectSnap: null };
    const snappedDelta = prepareMoveDeltaForSnapMode(objectSnap.delta, ctx.transformState.moveSnapDisabled);
    return { delta: snappedDelta, objectSnap: { ...objectSnap, delta: snappedDelta } };
  };
  const armMoveTargetFromBase = (basePoint?: THREE.Vector3) => {
    if (!basePoint || ctx.transformState.kind !== "move" || ctx.transformState.step !== "pickBase") return;
    ctx.transformState.base = basePoint.clone();
    ctx.transformState.step = "pickTarget";
    ctx.transformState.typed = "";
    ctx.transformState.lastValidDelta.set(0, 0, 0);
    ctx.setUnderlayStatus("Move: zvol cielovy bod, alebo namier smer a napis vzdialenost v mm. Shift = os, N = volny pohyb.");
  };
  const continueMoveAfterSelection = (basePoint?: THREE.Vector3) => {
    void basePoint;
    return continueMoveAfterObjectSelection(ctx);
  };
  const hasMoveSelection = () =>
    (ctx.selectedWallIds?.size ?? 0) > 0 ||
    (ctx.selectedInstanceIds?.size ?? 0) > 0 ||
    (ctx.selectedKind === "wall" && !!ctx.selectedWallId) ||
    (ctx.selectedKind === "module" && !!ctx.selectedInstanceId) ||
    (ctx.selectedKind === "section" && !!ctx.selectedSectionId) ||
    (ctx.selectedKind === "window" && !!ctx.windowInst) ||
    (ctx.selectedKind === "door" && !!ctx.doorInst);
  const continueMoveWithCurrentSelection = (basePoint?: THREE.Vector3) => {
    if (ctx.transformState.kind !== "move" || ctx.transformState.step !== "selectElements" || !ctx.transformState.stickyMove) return false;
    if (!hasMoveSelection()) return false;
    if (!ctx.startTransformFromSelection("move", { sticky: true })) return false;
    armMoveTargetFromBase(basePoint);
    return true;
  };
  const constrainMoveDelta = (delta: THREE.Vector3) => {
    const firstWallId = ctx.transformState.selectedWallIds[0] as string | undefined;
    const firstWall = firstWallId ? ctx.transformState.startWalls.get(firstWallId) : null;
    return constrainMoveDeltaToAxis(delta, firstWall);
  };
  const windowPlacementWallSnapPx = 34;
  const floorplanWallHoverSnapPx = 6;
  const windowSelectionSnapPx = 20;
  const pickFloorplanWallId = (
    pMm: { x: number; z: number },
    mouse: { x: number; y: number },
    rect: DOMRect,
    axisSnapPx = windowPlacementWallSnapPx
  ) =>
    pickResolvedFloorplanWallId({
      axisSnapPx,
      cam: ctx.cam(),
      isWallPickable: (id) => isPickableKey(`wall:${id}`),
      mouse,
      pMm,
      pointInPolygonXZ: ctx.pointInPolygonXZ,
      pointOnWallAxisMm: ctx.pointOnWallAxisMm,
      rect,
      wallSolvedOutlines: ctx.wallSolvedOutlines,
      walls: ctx.walls,
      worldToScreen: ctx.worldToScreen
    });
  const pickFloorplanWindow = (pMm: { x: number; z: number }, mouse: { x: number; y: number }, rect: DOMRect) =>
    pickFloorplanOpening({
      cam: ctx.cam(),
      distPxPointToSeg: ctx.distPxPointToSeg,
      instances: ctx.windows,
      isPickable: (id) => isPickableKey(`window:${id}`),
      mouse,
      pMm,
      pointOnWallAxisMm: ctx.pointOnWallAxisMm,
      rect,
      selectionSnapPx: windowSelectionSnapPx,
      walls: ctx.walls,
      worldToScreen: ctx.worldToScreen
    });

  const pickFloorplanDoor = (pMm: { x: number; z: number }, mouse: { x: number; y: number }, rect: DOMRect) =>
    pickFloorplanOpening({
      cam: ctx.cam(),
      distPxPointToSeg: ctx.distPxPointToSeg,
      instances: ctx.doors,
      isPickable: (id) => isPickableKey(`door:${id}`),
      mouse,
      pMm,
      pointOnWallAxisMm: ctx.pointOnWallAxisMm,
      rect,
      selectionSnapPx: windowSelectionSnapPx,
      walls: ctx.walls,
      worldToScreen: ctx.worldToScreen
    });

  const moduleHoverTarget = (id: string | null): SelectionHighlightTarget | null => {
    if (!id) return null;
    const selectableId = ctx.kitchenMode ? ctx.kitchenMode.filterSelectableInstanceId(id) : id;
    if (!selectableId) return null;
    const inst = ctx.findInstance(selectableId);
    if (!ctx.S.kitchenEditMode && inst?.kitchenGroupId && ctx.S.kitchenGroups.some((group) => group.id === inst.kitchenGroupId)) {
      return { kind: "kitchenGroup", id: inst.kitchenGroupId };
    }
    return { kind: "module", id: selectableId };
  };

  const worktopHoverTarget = (id: string | null): SelectionHighlightTarget | null => {
    if (!id) return null;
    const worktop = ctx.findKitchenWorktop(id);
    if (!worktop) return null;
    if (ctx.S.kitchenEditMode && worktop.kitchenGroupId !== ctx.S.activeKitchenGroupId) return null;
    return worktop.kitchenGroupId && ctx.S.kitchenGroups.some((group) => group.id === worktop.kitchenGroupId)
      ? { kind: "kitchenGroup", id: worktop.kitchenGroupId }
      : { kind: "worktop", id };
  };

  const isKnownKitchenGroup = (groupId: string | null | undefined) => {
    return !!groupId && !!(ctx.kitchenMode?.findKitchenGroup?.(groupId) ?? ctx.S.kitchenGroups.find((group) => group.id === groupId) ?? null);
  };

  const kitchenGroupIdForModule = (id: string | null | undefined) => {
    if (!id) return null;
    const groupId = ctx.findInstance(id)?.kitchenGroupId ?? null;
    return isKnownKitchenGroup(groupId) ? groupId : null;
  };

  const kitchenGroupIdForWorktop = (id: string | null | undefined) => {
    if (!id) return null;
    const groupId = ctx.findKitchenWorktop(id)?.kitchenGroupId ?? null;
    return isKnownKitchenGroup(groupId) ? groupId : null;
  };

  const kitchenGroupTargetForModule = (id: string | null | undefined) => {
    return resolveKitchenGroupEditTarget({
      moduleGroupId: kitchenGroupIdForModule(id),
      moduleInstanceId: id,
      worktopGroupId: null,
      isKnownGroup: isKnownKitchenGroup
    });
  };

  const kitchenGroupTargetForWorktop = (id: string | null | undefined) => {
    return resolveKitchenGroupEditTarget({
      moduleGroupId: null,
      moduleInstanceId: null,
      worktopGroupId: kitchenGroupIdForWorktop(id),
      isKnownGroup: isKnownKitchenGroup
    });
  };

  const targetFromPickedObject = (object: THREE.Object3D | null | undefined): SelectionHighlightTarget | null => {
    if (!object) return null;
    const windowId = getWindowIdFromObject(object);
    if (windowId) return { kind: "window", id: windowId };
    const doorId = getDoorIdFromObject(object);
    if (doorId) return { kind: "door", id: doorId };
    const directModuleId = ctx.getInstanceIdFromObject(object);
    if (directModuleId) {
      const submoduleTarget = ctx.kitchenMode?.getTallSubmoduleHighlightTargetFromObject?.(directModuleId, object) ?? null;
      if (submoduleTarget) return submoduleTarget;
    }
    const moduleTarget = moduleHoverTarget(directModuleId);
    if (moduleTarget) return moduleTarget;
    const worktopTarget = worktopHoverTarget(ctx.getWorktopIdFromObject(object));
    if (worktopTarget) return worktopTarget;
    const columnId = ctx.getColumnIdFromObject(object);
    if (columnId) return { kind: "column", id: columnId };
    const sectionId = ctx.getSectionIdFromObject(object);
    if (sectionId) return { kind: "section", id: sectionId };
    const wallId = (object.userData?.wallId as string | undefined) ?? null;
    if (wallId) return { kind: "wall", id: wallId };
    const floorId = (object.userData?.floorId as string | undefined) ?? null;
    if (floorId) return { kind: "floor", id: floorId };
    return null;
  };

  const getProjectedObjectBounds = (objects: THREE.Object3D[], rect: DOMRect) => {
    const box = new THREE.Box3();
    for (const object of objects) box.expandByObject(object);
    if (box.isEmpty()) return null;
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z)
    ].map((point) => ctx.worldToScreen(point, ctx.cam(), rect));
    return {
      minX: Math.min(...corners.map((point) => point.x)),
      maxX: Math.max(...corners.map((point) => point.x)),
      minY: Math.min(...corners.map((point) => point.y)),
      maxY: Math.max(...corners.map((point) => point.y))
    };
  };

  const collectTallSubmoduleObjectsInMarquee = (selectionRect: ScreenRect, rect: DOMRect) => {
    const activeHostId = ctx.kitchenMode?.getActiveTallEditorInstanceId?.() ?? null;
    const inst = activeHostId ? ctx.findInstance(activeHostId) : null;
    if (!inst) return null;

    const hits: THREE.Object3D[] = [];
    const seenSlots = new Set<number>();
    inst.module.traverse((object) => {
      const rawId = object.userData?.selectableSubmoduleId;
      if (typeof rawId !== "string" || !rawId.trim()) return;
      if (object.parent?.userData?.selectableSubmoduleId === rawId) return;

      const rawSlotIndex = object.userData?.hostSlotIndex;
      const slotIndex = typeof rawSlotIndex === "number" && Number.isFinite(rawSlotIndex) ? Math.round(rawSlotIndex) : 0;
      if (slotIndex <= 0 || seenSlots.has(slotIndex)) return;

      const bounds = getProjectedObjectBounds([object], rect);
      if (!bounds) return;
      const isHit = ctx.marquee.mode === "contain"
        ? boundsContainedInRect(bounds, selectionRect)
        : boundsOverlapsRect(bounds, selectionRect);
      if (!isHit) return;

      seenSlots.add(slotIndex);
      hits.push(object);
    });

    return { activeHostId, hits };
  };

  const resolveDetailModuleIdFromScreenBounds = (mouse: { x: number; y: number }, rect: DOMRect) => {
    if (!(ctx.viewMode === "2d" && ctx.activeViewerTab !== "floorplan")) return null;
    let best: { id: string; area: number; centerDistance: number } | null = null;
    const tolerancePx = 4;

    for (const inst of ctx.instances) {
      if (!isPickableKey(`module:${inst.id}`)) continue;
      if (ctx.kitchenMode && !ctx.kitchenMode.filterSelectableInstanceId(inst.id)) continue;
      const bounds = getProjectedObjectBounds(ctx.getInstanceGeometryMeshes(inst), rect);
      if (!bounds) continue;
      if (
        mouse.x < bounds.minX - tolerancePx ||
        mouse.x > bounds.maxX + tolerancePx ||
        mouse.y < bounds.minY - tolerancePx ||
        mouse.y > bounds.maxY + tolerancePx
      ) continue;
      const area = Math.max(1, (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY));
      const centerDistance = Math.hypot(mouse.x - (bounds.minX + bounds.maxX) / 2, mouse.y - (bounds.minY + bounds.maxY) / 2);
      if (!best || area < best.area || (area === best.area && centerDistance < best.centerDistance)) {
        best = { id: inst.id, area, centerDistance };
      }
    }

    return best?.id ?? null;
  };

  const resolveFloorplanHoverTarget = (ev: PointerEvent): SelectionHighlightTarget | null => {
    const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
    if (!hitPoint) return null;
    const pMm = ctx.toMmPoint(hitPoint);
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const mouse = pointerClientPointInRect(ev, rect);
    if (ctx.S.kitchenEditMode) {
      const moduleHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getAllInstanceGeometryMeshes()), false)[0]?.object;
      const fallbackModuleId = ctx.findSelectableFloorplanModuleAtPoint(pMm, mouse, rect);
      const directModuleId = ctx.getInstanceIdFromObject(moduleHit);
      if (directModuleId) {
        const submoduleTarget = ctx.kitchenMode?.getTallSubmoduleHighlightTargetFromObject?.(directModuleId, moduleHit) ?? null;
        if (submoduleTarget) return submoduleTarget;
      }
      const moduleTarget = moduleHoverTarget(directModuleId ?? (fallbackModuleId && isPickableKey(`module:${fallbackModuleId}`) ? fallbackModuleId : null));
      if (moduleTarget) return moduleTarget;
      const worktopHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getKitchenWorktopGeometryMeshes()), false)[0]?.object;
      const fallbackWorktopId = ctx.findSelectableFloorplanWorktopAtPoint(pMm);
      return worktopHoverTarget(ctx.getWorktopIdFromObject(worktopHit) ?? (fallbackWorktopId && isPickableKey(`worktop:${fallbackWorktopId}`) ? fallbackWorktopId : null));
    }
    const pickedWindow = pickFloorplanWindow(pMm, mouse, rect);
    if (pickedWindow) return { kind: "window", id: pickedWindow.id };
    const pickedDoor = pickFloorplanDoor(pMm, mouse, rect);
    if (pickedDoor) return { kind: "door", id: pickedDoor.id };
    const sectionHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getSectionPickMeshes()), false)[0]?.object;
    const sectionId = ctx.getSectionIdFromObject(sectionHit);
    if (sectionId) return { kind: "section", id: sectionId };
    const columnHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getColumnPickMeshes()), false)[0]?.object;
    const columnId = ctx.getColumnIdFromObject(columnHit);
    if (columnId) return { kind: "column", id: columnId };
    const moduleHits = ctx.raycaster.intersectObjects(pickableObjects(ctx.getAllInstanceGeometryMeshes()), false);
    const moduleHit = moduleHits[0]?.object;
    const tallSubmoduleModuleHit = ctx.S.kitchenEditMode && ctx.kitchenMode?.isTallModuleEditorActive?.()
      ? moduleHits.find((hit) => hasTallSubmodulePickData(hit.object))?.object
      : null;
    const fallbackModuleId = ctx.findSelectableFloorplanModuleAtPoint(pMm, mouse, rect);
    const moduleTarget = moduleHoverTarget(ctx.getInstanceIdFromObject(moduleHit) ?? (fallbackModuleId && isPickableKey(`module:${fallbackModuleId}`) ? fallbackModuleId : null));
    if (moduleTarget) return moduleTarget;
    const worktopHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getKitchenWorktopGeometryMeshes()), false)[0]?.object;
    const fallbackWorktopId = ctx.findSelectableFloorplanWorktopAtPoint(pMm);
    const worktopTarget = worktopHoverTarget(ctx.getWorktopIdFromObject(worktopHit) ?? (fallbackWorktopId && isPickableKey(`worktop:${fallbackWorktopId}`) ? fallbackWorktopId : null));
    if (worktopTarget) return worktopTarget;
    const floorId = pickFloorplanFloorBoundary({
      cam: ctx.cam(),
      distPxPointToSeg: ctx.distPxPointToSeg,
      floors: ctx.floors,
      floorPointToWorld: ctx.floorPointToWorld,
      isFloorPickable: (id) => isPickableKey(`floor:${id}`),
      mouse,
      rect,
      snapPx: 12,
      worldToScreen: ctx.worldToScreen
    });
    if (floorId) return { kind: "floor", id: floorId };
    const wallId = pickFloorplanWallId(pMm, mouse, rect, floorplanWallHoverSnapPx);
    return wallId ? { kind: "wall", id: wallId } : null;
  };

  const resolveKitchenGroupTargetFromPointer = (ev: Pick<PointerEvent, "clientX" | "clientY">): KitchenGroupEditTarget | null => {
    if (ctx.S.kitchenEditMode) return null;
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const mouse = pointerClientPointInRect(ev, rect);

    if (ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan") {
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      if (!hitPoint) return null;
      const pMm = ctx.toMmPoint(hitPoint);
      const moduleHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getAllInstanceGeometryMeshes()), false)[0]?.object;
      const moduleId = ctx.getInstanceIdFromObject(moduleHit) ?? ctx.findSelectableFloorplanModuleAtPoint(pMm, mouse, rect);
      const moduleTarget = kitchenGroupTargetForModule(moduleId);
      if (moduleTarget) return moduleTarget;

      const worktopHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getKitchenWorktopGeometryMeshes()), false)[0]?.object;
      return kitchenGroupTargetForWorktop(ctx.getWorktopIdFromObject(worktopHit) ?? ctx.findSelectableFloorplanWorktopAtPoint(pMm));
    }

    updateRaycasterFromPointer(ev, rect);
    const picks: THREE.Object3D[] = [];
    picks.push(...ctx.getAllInstanceGeometryMeshes());
    picks.push(...ctx.getKitchenWorktopGeometryMeshes());
    const first = ctx.raycaster.intersectObjects(pickableObjects(picks), false)[0]?.object;
    const moduleId = ctx.getInstanceIdFromObject(first) ?? resolveDetailModuleIdFromScreenBounds(mouse, rect);
    const moduleTarget = kitchenGroupTargetForModule(moduleId);
    if (moduleTarget) return moduleTarget;
    return kitchenGroupTargetForWorktop(ctx.getWorktopIdFromObject(first));
  };

  const resolve3dHoverTarget = (ev: PointerEvent): SelectionHighlightTarget | null => {
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const mouse = pointerClientPointInRect(ev, rect);
    const picks: THREE.Object3D[] = [];
    picks.push(...ctx.getAllInstanceGeometryMeshes());
    picks.push(...ctx.getKitchenWorktopGeometryMeshes());
    picks.push(...ctx.windows.map((inst) => inst.pick));
    picks.push(...ctx.doors.map((inst) => inst.pick));
    picks.push(...ctx.getColumnPickMeshes());
    picks.push(...ctx.getSectionPickMeshes());
    for (const wall of ctx.walls) picks.push(wall.mesh);
    for (const floor of ctx.floors) picks.push(floor.mesh);
    const first = ctx.raycaster.intersectObjects(pickableObjects(picks), false)[0]?.object;
    const directTarget = targetFromPickedObject(first);
    if (ctx.S.kitchenEditMode) {
      if (ctx.kitchenMode?.isTallModuleEditorActive?.()) {
        return directTarget?.kind === "submodule" ? directTarget : null;
      }
      const detailModuleTarget = moduleHoverTarget(resolveDetailModuleIdFromScreenBounds(mouse, rect));
      if (directTarget?.kind === "submodule") return directTarget;
      if (directTarget?.kind === "module" || directTarget?.kind === "kitchenGroup" || directTarget?.kind === "worktop") return directTarget;
      return detailModuleTarget;
    }
    if (directTarget && directTarget.kind !== "wall" && directTarget.kind !== "floor") return directTarget;
    return moduleHoverTarget(resolveDetailModuleIdFromScreenBounds(mouse, rect)) ?? directTarget;
  };

  const resolveColumnPlacementPoint = (raw: THREE.Vector3, rect: DOMRect) => {
    const snapped = ctx.snapPoint2D(raw, rect, ctx.cam(), SNAP_DISTANCE_PX.columnPlacement, {
      sticky: ctx.selectPlanSnap
    });
    const activeSnap =
      snapped.kind !== "none" ? snapped : ctx.keepStickyPlanSnap(raw, ctx.selectPlanSnap, ctx.cam(), rect, SNAP_DISTANCE_PX.columnPlacementSticky);
    ctx.selectPlanSnap = activeSnap;
    if (activeSnap && activeSnap.kind !== "none") {
      ctx.updateHoverCursor(ctx.worldToScreen(activeSnap.point, ctx.cam(), rect), activeSnap.kind);
      ctx.drawSnapOverlay.showWorld(activeSnap.point, ctx.cam(), rect, activeSnap.kind);
      return activeSnap.point;
    }
    ctx.hideHoverCursor();
    ctx.drawSnapOverlay.hide();
    return raw;
  };

  const getWindowIdFromObject = (obj: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.windowId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  };

  const findWindowFromObject = (obj: THREE.Object3D | null | undefined) => {
    const id = getWindowIdFromObject(obj);
    return id ? ctx.windows.find((item) => item.id === id) ?? null : null;
  };

  const getDoorIdFromObject = (obj: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.doorId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  };

  const findDoorFromObject = (obj: THREE.Object3D | null | undefined) => {
    const id = getDoorIdFromObject(obj);
    return id ? ctx.doors.find((item) => item.id === id) ?? null : null;
  };

  let windowDimensionInput: HTMLInputElement | null = null;
  let activeWindowDimensionParam: WindowDimensionParam | null = null;
  let doorDimensionInput: HTMLInputElement | null = null;
  let activeDoorDimensionParam: DoorDimensionParam | null = null;

  const ensureWindowDimensionInput = () => {
    if (windowDimensionInput) return windowDimensionInput;
    const host = ctx.args?.viewerEl ?? ctx.renderer.domElement.parentElement ?? document.body;
    const input = createDimensionEditInput(document, host, {
      id: "window-dimension-edit",
      ariaLabel: "Window dimension in millimeters",
      onHide: () => {
        activeWindowDimensionParam = null;
      },
      onCommit: () => {
        const inst = ctx.windowInst;
        const param = activeWindowDimensionParam;
        if (!inst || !param) return;
        const parsed = parseDimensionMillimeters(input.value);
        if (parsed == null) return;
        inst.params[param] = param === "sillHeightMm" ? Math.max(0, parsed) : Math.max(1, parsed);
        ctx.updateWindowTransform(inst);
        ctx.setSelectedWindow();
        ctx.mountProps();
        ctx.commitHistory(ctx.S);
      }
    });
    windowDimensionInput = input;
    return input;
  };

  const ensureDoorDimensionInput = () => {
    if (doorDimensionInput) return doorDimensionInput;
    const host = ctx.args?.viewerEl ?? ctx.renderer.domElement.parentElement ?? document.body;
    const input = createDimensionEditInput(document, host, {
      id: "door-dimension-edit",
      ariaLabel: "Door dimension in millimeters",
      onHide: () => {
        activeDoorDimensionParam = null;
      },
      onCommit: () => {
        const inst = ctx.doorInst;
        const param = activeDoorDimensionParam;
        if (!inst || !param) return;
        const parsed = parseDimensionMillimeters(input.value);
        if (parsed == null) return;
        inst.params[param] = Math.max(1, parsed);
        ctx.updateDoorTransform(inst);
        ctx.setSelectedDoor();
        ctx.mountProps();
        ctx.commitHistory(ctx.S);
      }
    });
    doorDimensionInput = input;
    return input;
  };

  const cancelPendingMarquee = (pointerId: number) => {
    cancelPendingPointerMarqueeHit(ctx.marquee, ctx.marqueeEl, pointerId);
  };

  const markPendingMarqueeHit = (pointerId: number) => {
    if (!ctx.marquee.pending || ctx.marquee.pointerId !== pointerId) return false;
    ctx.marquee.hitSomething = true;
    return true;
  };

  const pickWindowDimensionParam = (): WindowDimensionParam | null => {
    const inst = ctx.windowInst;
    if (!inst || ctx.selectedKind !== "window" || !inst.selection.visible) return null;
    const hits = ctx.raycaster.intersectObject(inst.selection, true);
    return pickVisibleSelectionUserDataValue<WindowDimensionParam>(hits, inst.selection, {
      kind: "windowDimensionEdit",
      valueKey: "windowDimensionParam"
    });
  };

  const pickDoorDimensionParam = (): DoorDimensionParam | null => {
    const inst = ctx.doorInst;
    if (!inst || ctx.selectedKind !== "door" || !inst.selection.visible) return null;
    const hits = ctx.raycaster.intersectObject(inst.selection, true);
    return pickVisibleSelectionUserDataValue<DoorDimensionParam>(hits, inst.selection, {
      kind: "doorDimensionEdit",
      valueKey: "doorDimensionParam"
    });
  };

  const pickWindowSwingControlAction = (): WindowSwingControlAction | null => {
    const inst = ctx.windowInst;
    if (!inst || ctx.selectedKind !== "window" || !inst.selection.visible) return null;
    const hits = ctx.raycaster.intersectObject(inst.selection, true);
    return pickVisibleSelectionUserDataValue<WindowSwingControlAction>(hits, inst.selection, {
      kind: "windowSwingControl",
      valueKey: "windowSwingAction"
    });
  };

  const applyWindowSwingControlAction = (action: WindowSwingControlAction) => {
    return applyOpeningSwingControlEdit({
      action,
      instance: ctx.windowInst,
      updateTransform: ctx.updateWindowTransform,
      selectOpening: ctx.setSelectedWindow,
      mountProps: ctx.mountProps,
      commitHistory: () => ctx.commitHistory(ctx.S)
    });
  };

  const pickDoorSwingControlAction = (): DoorSwingControlAction | null => {
    const inst = ctx.doorInst;
    if (!inst || ctx.selectedKind !== "door" || !inst.selection.visible) return null;
    const hits = ctx.raycaster.intersectObject(inst.selection, true);
    return pickVisibleSelectionUserDataValue<DoorSwingControlAction>(hits, inst.selection, {
      kind: "doorSwingControl",
      valueKey: "doorSwingAction"
    });
  };

  const applyDoorSwingControlAction = (action: DoorSwingControlAction) => {
    return applyOpeningSwingControlEdit({
      action,
      instance: ctx.doorInst,
      updateTransform: ctx.updateDoorTransform,
      selectOpening: ctx.setSelectedDoor,
      mountProps: ctx.mountProps,
      commitHistory: () => ctx.commitHistory(ctx.S)
    });
  };

  const beginWindowDimensionEdit = (param: WindowDimensionParam, ev: PointerEvent) => {
    const inst = ctx.windowInst;
    if (!inst) return false;
    const input = ensureWindowDimensionInput();
    activeWindowDimensionParam = param;
    showDimensionInputForPointerEvent(input, {
      event: ev,
      host: ctx.args?.viewerEl ?? ctx.renderer.domElement,
      value: String(Math.round(inst.params[param]))
    });
    return true;
  };

  const beginDoorDimensionEdit = (param: DoorDimensionParam, ev: PointerEvent) => {
    const inst = ctx.doorInst;
    if (!inst) return false;
    const input = ensureDoorDimensionInput();
    activeDoorDimensionParam = param;
    showDimensionInputForPointerEvent(input, {
      event: ev,
      host: ctx.args?.viewerEl ?? ctx.renderer.domElement,
      value: String(Math.round(inst.params[param]))
    });
    return true;
  };

  const isFloorplanSelectPointerDown = (ev: PointerEvent) =>
    ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ctx.layoutTool === "select" && ev.button === 0;

  const handleFloorplanSelectPointerDown = (ev: PointerEvent) => {
    if (!isFloorplanSelectPointerDown(ev)) return false;
    const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
    if (!hitPoint) return true;

    const pMm = ctx.toMmPoint(hitPoint);
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const mouse = pointerClientPointInRect(ev, rect);

    if (
      handleFloorplanPlacementClick({
        cancelPendingMarquee: () => cancelPendingMarquee(ev.pointerId),
        insertColumnAtPoint: () => {
          const placementPoint = resolveColumnPlacementPoint(hitPoint, rect);
          ctx.insertColumnAtPoint?.(ctx.toMmPoint(placementPoint));
        },
        insertDoorAtWallPoint: (wallId) => ctx.insertDoorAtWallPoint?.(wallId, pMm),
        insertWindowAtWallPoint: (wallId) => ctx.insertWindowAtWallPoint?.(wallId, pMm),
        isColumnPlacementActive: !!ctx.isColumnPlacementActive?.(),
        isDoorPlacementActive: !!ctx.isDoorPlacementActive?.(),
        isWindowPlacementActive: !!ctx.isWindowPlacementActive?.(),
        pickWallId: () => pickFloorplanWallId(pMm, mouse, rect),
        preventDefault: () => ev.preventDefault(),
        setStatus: ctx.setUnderlayStatus,
        stopPropagation: () => ev.stopPropagation()
      })
    ) {
      return true;
    }

    const pickedWindow = pickFloorplanWindow(pMm, mouse, rect);
    const pickedDoor = pickFloorplanDoor(pMm, mouse, rect);

    const sectionHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getSectionPickMeshes()), false)[0]?.object;
    const sectionId = ctx.getSectionIdFromObject(sectionHit);

    const columnHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getColumnPickMeshes()), false)[0]?.object;
    const columnId = ctx.getColumnIdFromObject(columnHit);

    const moduleHits = ctx.raycaster.intersectObjects(pickableObjects(ctx.getAllInstanceGeometryMeshes()), false);
    const moduleHit = moduleHits[0]?.object;
    const tallSubmoduleModuleHit = ctx.S.kitchenEditMode && ctx.kitchenMode?.isTallModuleEditorActive?.()
      ? moduleHits.find((hit) => hasTallSubmodulePickData(hit.object))?.object
      : null;
    const moduleId = ctx.getInstanceIdFromObject(moduleHit);
    const rawFallbackModuleId = ctx.findSelectableFloorplanModuleAtPoint(pMm, mouse, rect);
    const fallbackModuleId = ctx.kitchenMode ? ctx.kitchenMode.filterSelectableInstanceId(rawFallbackModuleId) : rawFallbackModuleId;
    const modulePick = resolveFloorplanModulePickCandidates({
      directModuleId: moduleId,
      fallbackModuleId,
      filterSelectableModuleId: ctx.kitchenMode ? ctx.kitchenMode.filterSelectableInstanceId : undefined,
      isFallbackModulePickable: (id) => isPickableKey(`module:${id}`)
    });

    const worktopHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getKitchenWorktopGeometryMeshes()), false)[0]?.object;
    const worktopId = ctx.getWorktopIdFromObject(worktopHit) ?? ctx.findSelectableFloorplanWorktopAtPoint(pMm);

    if (ctx.S.kitchenEditMode) {
      const directSelectableModuleId = modulePick.selectableModuleId ?? null;
      if (ctx.kitchenMode?.isTallModuleEditorActive?.()) {
        if (ctx.kitchenMode?.selectTallSubmoduleFromObject?.(directSelectableModuleId, tallSubmoduleModuleHit ?? moduleHit, { additive: ev.shiftKey || ev.ctrlKey || ev.metaKey })) {
          markPendingMarqueeHit(ev.pointerId);
          ev.preventDefault();
          ev.stopPropagation();
          return true;
        }
        ctx.kitchenMode?.clearTallSubmoduleSelection?.();
        ev.preventDefault();
        ev.stopPropagation();
        return true;
      }
      if (directSelectableModuleId && ctx.kitchenMode?.selectTallSubmoduleFromObject?.(directSelectableModuleId, moduleHit, { additive: ev.shiftKey || ev.ctrlKey || ev.metaKey })) {
        cancelPendingMarquee(ev.pointerId);
        ev.preventDefault();
        ev.stopPropagation();
        return true;
      }
      if (modulePick.selectableModuleId || modulePick.fallbackModuleId) ctx.kitchenMode?.clearTallSubmoduleSelection?.();
      handleFloorplanSelection({
        execution: {
          beginModuleSelection: (id) => ctx.beginModuleSelection(id, ev),
          beginWorktopSelection: (id) => ctx.beginKitchenWorktopSelection(id, ev, pMm),
          cancelPendingMarquee: () => cancelPendingMarquee(ev.pointerId),
          continueMoveAfterSelection,
          hitPoint,
          pickedDoor: null,
          pickedWindow: null,
          selectColumn: ctx.setSelectedColumn,
          selectDoor: (door) => {
            ctx.doorInst = door;
            ctx.setSelectedDoor();
          },
          selectFloor: ctx.setSelectedFloor,
          selectModule: ctx.setSelectedModule,
          selectSection: ctx.setSelectedSection,
          selectWall: ctx.setSelectedWall,
          selectWindow: (window) => {
            ctx.windowInst = window;
            ctx.setSelectedWindow();
          }
        },
        selection: {
          axisWallId: null,
          columnId: null,
          fallbackModuleId: modulePick.fallbackModuleId,
          fallbackModulePickable: modulePick.fallbackModulePickable,
          floorId: null,
          pickedDoor: false,
          pickedWindow: false,
          polygonWallId: null,
          sectionId: null,
          selectableModuleId: modulePick.selectableModuleId,
          transformSelectElements: ctx.transformState.kind === "move" && ctx.transformState.step === "selectElements",
          worktopId
        }
      });
      return true;
    }

    const floorId = pickFloorplanFloorBoundary({
      cam: ctx.cam(),
      distPxPointToSeg: ctx.distPxPointToSeg,
      floors: ctx.floors,
      floorPointToWorld: ctx.floorPointToWorld,
      isFloorPickable: (id) => isPickableKey(`floor:${id}`),
      mouse,
      rect,
      snapPx: 12,
      worldToScreen: ctx.worldToScreen
    });

    const wallPick = resolveFloorplanWallPick({
      axisSnapPx: 10,
      cam: ctx.cam(),
      isWallPickable: (id) => isPickableKey(`wall:${id}`),
      mouse,
      pMm,
      pointInPolygonXZ: ctx.pointInPolygonXZ,
      pointOnWallAxisMm: ctx.pointOnWallAxisMm,
      rect,
      wallSolvedOutlines: ctx.wallSolvedOutlines,
      walls: ctx.walls,
      worldToScreen: ctx.worldToScreen
    });

    return handleFloorplanSelection({
      execution: {
        beginModuleSelection: (id) => ctx.beginModuleSelection(id, ev),
        beginWorktopSelection: (id) => ctx.beginKitchenWorktopSelection(id, ev, pMm),
        cancelPendingMarquee: () => cancelPendingMarquee(ev.pointerId),
        continueMoveAfterSelection,
        hitPoint,
        pickedDoor,
        pickedWindow,
        selectColumn: ctx.setSelectedColumn,
        selectDoor: (door) => {
          ctx.doorInst = door;
          ctx.setSelectedDoor();
        },
        selectFloor: ctx.setSelectedFloor,
        selectModule: ctx.setSelectedModule,
        selectSection: ctx.setSelectedSection,
        selectWall: ctx.setSelectedWall,
        selectWindow: (window) => {
          ctx.windowInst = window;
          ctx.setSelectedWindow();
        }
      },
      selection: {
        axisWallId: wallPick.axisWallId,
        columnId,
        fallbackModuleId: modulePick.fallbackModuleId,
        fallbackModulePickable: modulePick.fallbackModulePickable,
        floorId,
        pickedDoor: !!pickedDoor,
        pickedWindow: !!pickedWindow,
        polygonWallId: wallPick.polygonWallId,
        sectionId,
        selectableModuleId: modulePick.selectableModuleId,
        transformSelectElements: ctx.transformState.kind === "move" && ctx.transformState.step === "selectElements",
        worktopId
      }
    });
  };

  const currentCanvasContextTarget = (): CanvasContextTarget | null => {
    if (!ctx.selectedKind) return null;
    if (ctx.selectedKind === "module") return { kind: "module", id: ctx.selectedInstanceId };
    if (ctx.selectedKind === "kitchenGroup") return { kind: "kitchenGroup", id: ctx.selectedKitchenGroupId };
    if (ctx.selectedKind === "wall") return { kind: "wall", id: ctx.selectedWallId };
    if (ctx.selectedKind === "floor") return { kind: "floor", id: ctx.selectedFloorId };
    if (ctx.selectedKind === "column") return { kind: "column", id: ctx.selectedColumnId };
    if (ctx.selectedKind === "section") return { kind: "section", id: ctx.selectedSectionId };
    if (ctx.selectedKind === "window") return { kind: "window", id: ctx.windowInst?.id ?? null };
    if (ctx.selectedKind === "door") return { kind: "door", id: ctx.doorInst?.id ?? null };
    return { kind: "underlay", id: "main" };
  };

  const contextPointerEvent = (ev: MouseEvent): PointerEvent => ev as PointerEvent;

  const selectCanvasContextTarget = (target: CanvasContextTarget, ev: MouseEvent, pointMm?: { x: number; z: number }) => {
    if (target.kind === "module" && target.id) {
      if (!ctx.selectedInstanceIds.has(target.id)) ctx.beginModuleSelection(target.id, contextPointerEvent(ev));
      return currentCanvasContextTarget() ?? target;
    }
    if (target.kind === "kitchenGroup") return currentCanvasContextTarget() ?? target;
    if (target.kind === "wall" && target.id) {
      if (!ctx.selectedWallIds.has(target.id)) ctx.setSelectedWall(target.id);
    } else if (target.kind === "floor" && target.id) {
      if (!(ctx.selectedKind === "floor" && ctx.selectedFloorId === target.id)) ctx.setSelectedFloor(target.id);
    } else if (target.kind === "column" && target.id) {
      if (!(ctx.selectedKind === "column" && ctx.selectedColumnId === target.id)) ctx.setSelectedColumn(target.id);
    } else if (target.kind === "section" && target.id) {
      if (!(ctx.selectedKind === "section" && ctx.selectedSectionId === target.id)) ctx.setSelectedSection(target.id);
    } else if (target.kind === "window" && target.id) {
      if (!(ctx.selectedKind === "window" && ctx.windowInst?.id === target.id)) {
        const picked = ctx.windows.find((item) => item.id === target.id) ?? null;
        if (picked) {
          ctx.windowInst = picked;
          ctx.setSelectedWindow();
        }
      }
    } else if (target.kind === "door" && target.id) {
      if (!(ctx.selectedKind === "door" && ctx.doorInst?.id === target.id)) {
        const picked = ctx.doors.find((item) => item.id === target.id) ?? null;
        if (picked) {
          ctx.doorInst = picked;
          ctx.setSelectedDoor();
        }
      }
    } else if (target.kind === "underlay") {
      if (ctx.selectedKind !== "underlay") ctx.setSelectedUnderlay();
    }
    return currentCanvasContextTarget() ?? target;
  };

  const resolveFloorplanContextTarget = (ev: MouseEvent, rect: DOMRect): CanvasContextTarget | null => {
    const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
    if (!hitPoint) return null;
    const pMm = ctx.toMmPoint(hitPoint);
    const mouse = pointerClientPointInRect(ev, rect);
    const pickedWindow = pickFloorplanWindow(pMm, mouse, rect);
    if (pickedWindow) return selectCanvasContextTarget({ kind: "window", id: pickedWindow.id }, ev);
    const pickedDoor = pickFloorplanDoor(pMm, mouse, rect);
    if (pickedDoor) return selectCanvasContextTarget({ kind: "door", id: pickedDoor.id }, ev);

    const sectionHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getSectionPickMeshes()), false)[0]?.object;
    const sectionId = ctx.getSectionIdFromObject(sectionHit);
    if (sectionId) return selectCanvasContextTarget({ kind: "section", id: sectionId }, ev);
    const columnHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getColumnPickMeshes()), false)[0]?.object;
    const columnId = ctx.getColumnIdFromObject(columnHit);
    if (columnId) return selectCanvasContextTarget({ kind: "column", id: columnId }, ev);

    const moduleHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getAllInstanceGeometryMeshes()), false)[0]?.object;
    const directModuleId = ctx.getInstanceIdFromObject(moduleHit);
    const fallbackModuleId = ctx.findSelectableFloorplanModuleAtPoint(pMm, mouse, rect);
    const rawModuleId = directModuleId ?? fallbackModuleId;
    const moduleId = rawModuleId && ctx.kitchenMode ? ctx.kitchenMode.filterSelectableInstanceId(rawModuleId) : rawModuleId;
    if (moduleId && isPickableKey(`module:${moduleId}`)) return selectCanvasContextTarget({ kind: "module", id: moduleId }, ev);

    const worktopHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getKitchenWorktopGeometryMeshes()), false)[0]?.object;
    const worktopId = ctx.getWorktopIdFromObject(worktopHit) ?? ctx.findSelectableFloorplanWorktopAtPoint(pMm);
    if (worktopId && ctx.beginKitchenWorktopSelection(worktopId, contextPointerEvent(ev), pMm)) return currentCanvasContextTarget();

    const floorId = pickFloorplanFloorBoundary({
      cam: ctx.cam(),
      distPxPointToSeg: ctx.distPxPointToSeg,
      floors: ctx.floors,
      floorPointToWorld: ctx.floorPointToWorld,
      isFloorPickable: (id) => isPickableKey(`floor:${id}`),
      mouse,
      rect,
      snapPx: 12,
      worldToScreen: ctx.worldToScreen
    });
    if (floorId) return selectCanvasContextTarget({ kind: "floor", id: floorId }, ev);

    const wallPick = resolveFloorplanWallPick({
      axisSnapPx: 10,
      cam: ctx.cam(),
      isWallPickable: (id) => isPickableKey(`wall:${id}`),
      mouse,
      pMm,
      pointInPolygonXZ: ctx.pointInPolygonXZ,
      pointOnWallAxisMm: ctx.pointOnWallAxisMm,
      rect,
      wallSolvedOutlines: ctx.wallSolvedOutlines,
      walls: ctx.walls,
      worldToScreen: ctx.worldToScreen
    });
    const wallId = wallPick.polygonWallId ?? wallPick.axisWallId;
    if (wallId) return selectCanvasContextTarget({ kind: "wall", id: wallId }, ev);
    if (ctx.underlayMesh.visible && hasLoadedUnderlay() && isPickableKey("underlay:main") && ctx.raycaster.intersectObject(ctx.underlayMesh, false)[0]) {
      return selectCanvasContextTarget({ kind: "underlay", id: "main" }, ev);
    }
    return null;
  };

  const resolve3dContextTarget = (ev: MouseEvent): CanvasContextTarget | null => {
    const picks: THREE.Object3D[] = ctx.getAllInstanceGeometryMeshes();
    const windowPicks = ctx.windows.map((item) => item.pick);
    const doorPicks = ctx.doors.map((item) => item.pick);
    picks.push(...windowPicks, ...doorPicks, ...ctx.getColumnPickMeshes());
    for (const wall of ctx.walls) picks.push(wall.mesh);
    for (const floor of ctx.floors) picks.push(floor.mesh, floor.outline);
    const hits = ctx.raycaster.intersectObjects(pickableObjects(picks), false);
    const windowHit = ctx.raycaster.intersectObjects(pickableObjects(windowPicks), false)[0] ?? null;
    const doorHit = ctx.raycaster.intersectObjects(pickableObjects(doorPicks), false)[0] ?? null;
    const openingHit = doorHit && windowHit ? (doorHit.distance <= windowHit.distance ? doorHit : windowHit) : doorHit ?? windowHit;
    const firstHit = openingHit && (!hits[0] || openingHit.distance <= hits[0].distance + 0.25) ? openingHit : hits[0];
    const first = firstHit?.object as THREE.Mesh | undefined;
    if (first) {
      const kind = (first.userData?.kind as string | undefined) ?? "module";
      if (kind === "window") {
        const item = findWindowFromObject(first);
        if (item) return selectCanvasContextTarget({ kind: "window", id: item.id }, ev);
      }
      if (kind === "door") {
        const item = findDoorFromObject(first);
        if (item) return selectCanvasContextTarget({ kind: "door", id: item.id }, ev);
      }
      const moduleId = ctx.getInstanceIdFromObject(first);
      const selectableModuleId = moduleId && ctx.kitchenMode ? ctx.kitchenMode.filterSelectableInstanceId(moduleId) : moduleId;
      if (selectableModuleId) return selectCanvasContextTarget({ kind: "module", id: selectableModuleId }, ev);
      const columnId = ctx.getColumnIdFromObject(first);
      if (columnId) return selectCanvasContextTarget({ kind: "column", id: columnId }, ev);
      const floorId = (first.userData?.floorId as string | undefined) ?? null;
      if (floorId) return selectCanvasContextTarget({ kind: "floor", id: floorId }, ev);
      const wallId = (first.userData?.wallId as string | undefined) ?? null;
      if (wallId) return selectCanvasContextTarget({ kind: "wall", id: wallId }, ev);
    }
    const worktopHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getKitchenWorktopGeometryMeshes()), false)[0]?.object;
    const worktopId = ctx.getWorktopIdFromObject(worktopHit);
    if (worktopId && ctx.beginKitchenWorktopSelection(worktopId, contextPointerEvent(ev))) return currentCanvasContextTarget();
    return null;
  };

  const resolveContextTarget = (ev: MouseEvent | KeyboardEvent): CanvasContextTarget | null => {
    if (!(ev instanceof MouseEvent) || ctx.mode !== "layout" || ctx.layoutTool !== "select") return currentCanvasContextTarget();
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    updateRaycasterFromPointer(ev, rect);
    if (ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan") return resolveFloorplanContextTarget(ev, rect);
    return resolve3dContextTarget(ev);
  };

  ctx.renderer.domElement.addEventListener("dblclick", (ev) => {
    if (ctx.mode !== "layout" || ctx.layoutTool !== "select") return;
    const target = resolveKitchenGroupTargetFromPointer(ev);
    const action = resolveKitchenDoubleClickAction({
      target,
      kitchenEditMode: !!ctx.S.kitchenEditMode,
      activeKitchenGroupId: ctx.S.activeKitchenGroupId,
      moduleEditorActive: !!ctx.kitchenMode?.isTallModuleEditorActive?.()
    });
    if (!action) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (action.type === "open-group") {
      ctx.kitchenMode?.enterExisting?.(action.target.groupId, action.target.focusInstanceId);
    } else {
      ctx.kitchenMode?.enterModuleEditor?.(action.instanceId);
    }
  });

  ctx.renderer.domElement.addEventListener("pointerdown", (ev) => {
    if (ctx.viewNavigation.handlePointerDown(ev)) {
      return;
    }

    // Marquee selection in layout select tool uses the primary button in every layout view.
    const startsMarquee = shouldStartLayoutMarqueeSelection({
      button: ev.button,
      floorEditActive: ctx.floorEdit.active,
      isColumnPlacementActive: !!ctx.isColumnPlacementActive?.(),
      isDoorPlacementActive: !!ctx.isDoorPlacementActive?.(),
      isWindowPlacementActive: !!ctx.isWindowPlacementActive?.(),
      layoutTool: ctx.layoutTool,
      measureEnabled: ctx.measureState.enabled,
      mode: ctx.mode,
      placementActive: ctx.placement.active,
      transformActive: !!ctx.transformState.kind
    });
    if (
      startsMarquee
    ) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const point = pointerClientPointInRect(ev, rect);
      beginPointerMarquee(ctx.marquee, ctx.marqueeEl, {
        pointerId: ev.pointerId,
        x: point.x,
        y: point.y
      });
      try {
        ctx.renderer.domElement.setPointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      // do not return; we still want click selection / dragging to work
    }

    const rect = ctx.renderer.domElement.getBoundingClientRect();
    updateRaycasterFromPointer(ev, rect);

    if (ctx.mode === "layout") {
      if (handleOpeningSelectionControlClick({
        button: ev.button,
        pickWindowSwingControlAction,
        applyWindowSwingControlAction,
        pickDoorSwingControlAction,
        applyDoorSwingControlAction,
        pickWindowDimensionParam,
        beginWindowDimensionEdit: (param) => beginWindowDimensionEdit(param, ev),
        pickDoorDimensionParam,
        beginDoorDimensionEdit: (param) => beginDoorDimensionEdit(param, ev),
        cancelPendingMarquee: () => cancelPendingMarquee(ev.pointerId),
        preventDefault: () => ev.preventDefault(),
        stopPropagation: () => ev.stopPropagation()
      })) {
        return;
      }

      if (ctx.floorEdit.active) {
        const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
        const point = hitPoint ? ctx.worldToFloorPoint(hitPoint) : null;
        const mouse = pointerClientPointInRect(ev, rect);
        const pickedEdit = ctx.pickFloorEditElement(mouse, rect);

        handleFloorBoundaryEditPointerDown({
          addFloorEditSegment: ctx.addFloorEditSegment,
          button: ev.button,
          cloneFloorSegments: ctx.cloneFloorSegments,
          floorEdit: ctx.floorEdit,
          floorOrthoPoint: ctx.floorOrthoPoint,
          floorPointEq: ctx.floorPointEq,
          makeFloorCirclePoints: ctx.makeFloorCirclePoints,
          mountProps: ctx.mountProps,
          pickedEdit,
          point,
          pointerId: ev.pointerId,
          renderFloorBoundaryEdit: ctx.renderFloorBoundaryEdit,
          resolvePickedLineSegment: () => {
            if (!hitPoint) return null;
            const picked = ctx.pickWallLine2D(hitPoint, rect, ctx.cam(), 14);
            const alignPicked = ctx.pickAlignLineAt(hitPoint, mouse, rect);
            const a = picked?.a ?? alignPicked?.segA ?? null;
            const b = picked?.b ?? alignPicked?.segB ?? null;
            return a && b ? { a: ctx.worldToFloorPoint(a), b: ctx.worldToFloorPoint(b) } : null;
          },
          setPointerCapture: (pointerId) => ctx.renderer.domElement.setPointerCapture(pointerId),
          setUnderlayStatus: ctx.setUnderlayStatus
        });
        return;
      }

      if (ctx.underlayCal.active) {
        handleUnderlayCalibrationPointerDown({
          getHitPoint: () => ctx.raycaster.intersectObject(ctx.underlayMesh, false)[0]?.point.clone() ?? null,
          hasLoadedUnderlay: hasLoadedUnderlay(),
          promptReferenceDistanceMm: (measuredMm) => window.prompt("Real distance (mm)", String(measuredMm)),
          setScaleInputValue: (value) => {
            if (ctx.underlayScaleEl) ctx.underlayScaleEl.value = value;
          },
          setUnderlayStatus: ctx.setUnderlayStatus,
          underlayCal: ctx.underlayCal,
          underlayPinned: ctx.underlayState.pinned,
          underlayScale: {
            get value() {
              return ctx.underlayState.scale;
            },
            set value(value) {
              ctx.underlayState.scale = value;
            }
          },
          underlayVisible: ctx.underlayMesh.visible,
          updateUnderlayTransform: ctx.updateUnderlayTransform
        });
        return;
      }

      if (
        handlePlacementCommitPointerDown({
          button: ev.button,
          commitPlacement: ctx.commitPlacement,
          getHitPoint: () => intersectRayPlane(ctx.raycaster, ctx.groundPlane),
          helpers: ctx.placementHelpers,
          isActive: ctx.placement.active && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ctx.layoutTool === "select",
          preventDefault: () => ev.preventDefault(),
          rebuildGhost: ctx.rebuildGhost,
          state: ctx.S,
          stopPropagation: () => ev.stopPropagation()
        })
      ) {
        return;
      }

      if (ctx.layoutTool === "select" && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ctx.transformState.kind) {
        if (ev.button !== 0) return;
        const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
        if (!hitPoint) return;
        const moveSnap =
          ctx.transformState.kind === "move"
            ? resolveMoveSnap(hitPoint, rect, ctx.transformState.step === "pickTarget" ? ctx.transformState.base : null)
            : null;
        const snapped =
          ctx.transformState.kind === "move"
            ? (moveSnap ?? makeNoSnapResult(hitPoint))
            : ctx.snapPoint2D(hitPoint, rect, ctx.cam(), SNAP_DISTANCE_PX.transformRotate);
        const p = snapped.kind !== "none" ? snapped.point : hitPoint;

        if (
          handleTransformClickPointerDown({
            applyMoveDelta: ctx.applyMoveDelta,
            clearMoveHud: () => {
              ctx.selectPlanSnap = null;
              ctx.drawSnapOverlay.hide();
              ctx.hideHoverCursor();
              ctx.clearToolHud();
            },
            clearTransform: ctx.clearTransform,
            commitHistory: () => ctx.commitHistory(ctx.S),
            constrainMoveDelta,
            hitPoint,
            mountProps: ctx.mountProps,
            pickedPoint: p,
            resolveMoveDelta: (delta) => resolveMoveDeltaWithObjectSnap(prepareMoveDeltaForSnapMode(delta, ctx.transformState.moveSnapDisabled), rect).delta,
            setStatus: ctx.setUnderlayStatus,
            shiftKey: ev.shiftKey,
            transformState: ctx.transformState
          })
        ) {
          return;
        }
      }

      if (ctx.layoutTool === "dimension") {
        if (ctx.viewMode !== "2d") return;
        if (ev.button !== 0) return;

        const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
        if (!hitPoint) return;

        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const mouse = pointerClientPointInRect(ev, rect2);
        const picked = ctx.pickDimensionLineAt?.(hitPoint, mouse, rect2) ?? ctx.pickAlignLineAt(hitPoint, mouse, rect2);

        handleDimensionToolClick({
          picked,
          hitPoint,
          dimensionState: ctx.dimensionState,
          areAlignLinesParallel: ctx.areAlignLinesParallel,
          isLinePicked: ctx.technicalDimensions.isLinePicked,
          buildDimensions: (lines, point) => ctx.technicalDimensions.buildFromPickedLines(lines, point, "dimension"),
          commitDimensions: ctx.technicalDimensions.commitDimensions,
          resetDraft: ctx.technicalDimensions.resetDraft,
          setStatus: ctx.setUnderlayStatus,
          mountProps: ctx.mountProps
        });
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }

      if (ctx.layoutTool === "align") {
        if (ctx.viewMode !== "2d") return;
        if (ev.button !== 0) return;

        const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
        if (!hitPoint) return;

        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const mouse = pointerClientPointInRect(ev, rect2);
        const picked = ctx.alignState.ref
          ? ctx.pickCompatibleAlignLineAt(ctx.alignState.ref, hitPoint, mouse, rect2)
          : ctx.pickAlignLineAt(hitPoint, mouse, rect2);

        handleAlignToolClick({
          picked,
          alignState: ctx.alignState,
          applyAlignBetweenPickedLines: ctx.applyAlignBetweenPickedLines,
          updateSelectionHighlights: ctx.updateSelectionHighlights,
          commitHistory: () => ctx.commitHistory(ctx.S),
          setStatus: ctx.setUnderlayStatus,
          mountProps: ctx.mountProps,
          finishAlignTool: () => {
            ctx.alignState.ref = null;
            ctx.alignState.hover = null;
            ctx.alignState.lastA = null;
            ctx.alignState.lastB = null;
            ctx.alignState.lastUntilMs = 0;
            ctx.clearToolHud();
            ctx.setToolSelect();
          },
          now: performance.now()
        });
        return;
      }

      if (ctx.layoutTool === "trim") {
        if (ctx.viewMode !== "2d") return;
        if (ev.button !== 0) return;

        const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
        if (!hitPoint) return;

        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const mouse = pointerClientPointInRect(ev, rect2);
        const picked = ctx.pickAlignLineAt(hitPoint, mouse, rect2);
        if (!picked) {
          handleTrimNoPick({ trimState: ctx.trimState, setStatus: ctx.setUnderlayStatus });
          return;
        }

        if (handleTrimTargetPick({ picked, hitPoint, trimState: ctx.trimState, setStatus: ctx.setUnderlayStatus, mountProps: ctx.mountProps })) return;

        const cutterClick = hitPoint.clone();

        const wallId = ctx.trimState.targetWallId;
        const w = wallId ? (ctx.walls.find((x) => x.id === wallId) ?? null) : null;
        if (!w) {
          handleMissingTrimTarget({ trimState: ctx.trimState, setStatus: ctx.setUnderlayStatus, mountProps: ctx.mountProps });
          return;
        }
        if (ctx.pinnedWallIds.has(w.id)) {
          handlePinnedTrimTarget({ trimState: ctx.trimState, setStatus: ctx.setUnderlayStatus, mountProps: ctx.mountProps });
          return;
        }

        // Wall-to-wall Trim/Extend to Corner: if second click hits another wall line, extend/trim both walls to their intersection.
        if (picked.wallId !== w.id && ctx.trimState.targetPick && ctx.trimState.targetClick) {
          const w2 = ctx.walls.find((x) => x.id === picked.wallId) ?? null;
          if (w2 && !ctx.pinnedWallIds.has(w2.id)) {
            const result = resolveTrimCornerEdit({
              targetWall: w,
              cutterWall: w2,
              targetPick: ctx.trimState.targetPick,
              cutterPick: picked,
              targetClick: ctx.trimState.targetClick,
              cutterClick,
              geometry: { lineLineIntersectionXZ: ctx.lineLineIntersectionXZ, toMmPoint: ctx.toMmPoint }
            });
            if (result.kind === "parallel") {
              ctx.setUnderlayStatus("Trim: walls must not be parallel.");
              return;
            }
            if (result.kind === "noChange") {
              finishTrimNoChange({ trimState: ctx.trimState, setStatus: ctx.setUnderlayStatus, mountProps: ctx.mountProps });
              return;
            }

            const moved = ctx.setWallEndpointsAndConnectedMm(result.edits);
            if (!moved) {
              ctx.mountProps();
              return;
            }
            ctx.commitHistory(ctx.S);

            finishTrimSuccess({
              trimState: ctx.trimState,
              lastTarget: ctx.trimState.targetPick,
              lastCutter: picked,
              now: performance.now(),
              status: "Trim: corner done. Click target wall...",
              setStatus: ctx.setUnderlayStatus,
              mountProps: ctx.mountProps
            });
            return;
          }
        }

        const result = resolveTrimSingleWallEdit({
          wall: w,
          picked,
          hitPoint,
          cutterClick,
          geometry: { lineLineIntersectionXZ: ctx.lineLineIntersectionXZ, toMmPoint: ctx.toMmPoint }
        });
        if (result.kind === "tooSmall") {
          ctx.setUnderlayStatus("Trim: wall too small.");
          return;
        }
        if (result.kind === "parallel") {
          ctx.setUnderlayStatus("Trim: cutter must not be parallel.");
          return;
        }
        if (result.kind === "noChange") {
          finishTrimNoChange({ trimState: ctx.trimState, setStatus: ctx.setUnderlayStatus, mountProps: ctx.mountProps });
          return;
        }

        const moved = ctx.setWallEndpointAndConnectedMm(result.edit.wall, result.edit.which, result.edit.next);
        if (!moved) {
          ctx.mountProps();
          return;
        }
        ctx.commitHistory(ctx.S);

        finishTrimSuccess({
          trimState: ctx.trimState,
          lastTarget: ctx.trimState.targetPick ?? picked,
          lastCutter: picked,
          now: performance.now(),
          status: "Trim: done. Click target wall...",
          setStatus: ctx.setUnderlayStatus,
          mountProps: ctx.mountProps
        });
        return;
      }

      if (ctx.layoutTool === "measure") {
        if (ev.button !== 0) return;
        let kind: string = "none";
        let point: THREE.Vector3 | null = null;
        let binding: PlanSnapBinding | null = null;
        const normalMode = ctx.viewMode === "2d" && ev.shiftKey;

        if (ctx.viewMode === "2d") {
          const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
          if (!hitPoint) return;
          const snapped = ctx.resolveMeasurePlanSnap(hitPoint, rect, normalMode);
          kind = snapped.kind;
          point = snapped.kind !== "none" ? snapped.point : hitPoint;
          binding = ctx.bindingFromPlanSnap(snapped, point);
          if (!ctx.measureState.axisLock && (snapped.kind === "none" || snapped.kind === "axis")) {
            const axisAssist = ctx.applyMeasureAxisAssist(ctx.measureState.firstPoint, point, ctx.cam(), rect, SNAP_DISTANCE_PX.measure2dAxis);
            if (axisAssist) {
              point = axisAssist.point;
              kind = "axis";
              binding = ctx.toFreePlanBinding(point);
            }
          }
        } else {
          const hit = ctx.pickSurfacePoint(ctx.raycaster, ctx.getLayoutMeasureMeshes3d());
          if (!hit) return;
          const snapTarget = ctx.getMeasure3DSnapTargetObject(hit.object);
          const snapped = ctx.snapPoint3D(hit.point, snapTarget ?? hit.object, ctx.cam(), rect, SNAP_DISTANCE_PX.measure3d);
          kind = snapped.kind;
          point = snapped.point;
          binding = ctx.toFreePlanBinding(point);
          if (!ctx.measureState.axisLock && snapped.kind === "free") {
            const axisAssist = ctx.applyMeasureAxisAssist3D(ctx.measureState.firstPoint, point, ctx.cam(), rect, SNAP_DISTANCE_PX.measure3dAxis);
            if (axisAssist) {
              point = axisAssist.point;
              kind = "axis";
              binding = ctx.toFreePlanBinding(point);
            }
          }
        }
        if (!point) return;

        handleMeasurePointClick({
          point,
          kind,
          binding,
          normalMode,
          viewMode: ctx.viewMode,
          measureState: ctx.measureState,
          formatMm: ctx.formatMm,
          toFreePlanBinding: ctx.toFreePlanBinding,
          axisLockXZ: ctx.axisLockXZ,
          axisLockPoint3D: ctx.axisLockPoint3D,
          planarDistanceMm: ctx.planarDistanceMm,
          distance3dMm: ctx.distance3dMm,
          addMeasurement: ctx.addMeasurement,
          setFirstPointMarker: ctx.setFirstPointMarker,
          setReadout: (message) => { ctx.args.measureReadoutEl.textContent = message; },
          setStatus: ctx.setUnderlayStatus,
          clearPreview: ctx.clearPreview,
          clearToolHud: ctx.clearToolHud,
          mountProps: ctx.mountProps
        });
        return;
      }

      if (ctx.layoutTool === "section") {
        if (ctx.viewMode !== "2d" || ctx.activeViewerTab !== "floorplan" || ev.button !== 0) return;
        const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
        if (!hitPoint) return;
        const resolved = ctx.resolveSectionDrawPoint(hitPoint, rect, !ev.shiftKey);
        const sectionResult = handleSectionDrawPointClick({
          resolved,
          sectionDraw: ctx.sectionDraw,
          updateSectionDrawPreview: ctx.updateSectionDrawPreview,
          setStatus: ctx.setUnderlayStatus,
          mountProps: ctx.mountProps,
          commitSectionDraw: ctx.commitSectionDraw
        });
        if (sectionResult.preventDefault) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        return;
      }

      if (ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active) {
        if (ctx.viewMode !== "2d" || ev.button !== 0) return;
        const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
        if (!hitPoint) return;
        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const activeSnap = ctx.resolveKitchenWorktopDrawSnap(hitPoint, rect2);
        handleKitchenWorktopDrawPointClick({
          hitPoint,
          activeSnap,
          kitchenWorktopDraw: ctx.kitchenWorktopDraw,
          floorOrthoPoint: ctx.floorOrthoPoint,
          appendKitchenWorktopPoint: ctx.appendKitchenWorktopPoint
        });
        return;
      }

      if (ctx.layoutTool === "led") {
        if (ev.button !== 0 || ctx.viewMode !== "2d" || !ctx.ledStripDrawController) return;
        const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
        if (!hitPoint) return;
        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const snapped = ctx.snapPoint2D(hitPoint, rect2, ctx.cam());
        ctx.ledStripDrawController.point(snapped.kind === "none" ? hitPoint : snapped.point);
        return;
      }

      if (ctx.layoutTool === "wall") {
        if (ev.button !== 0) return;
        // Place wall by 2 clicks on ground (XZ).
        const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
        if (!hitPoint) return;
        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const snapped = ctx.snapPoint2D(hitPoint, rect2, ctx.cam());
        const shouldAxisSnap = ctx.drawOrthoEnabled && !ev.shiftKey && snapped.kind === "none";

        if (!ctx.wallDraw.active) {
          handleWallDrawStartClick({
            hitPoint,
            snapped,
            wallDraw: ctx.wallDraw,
            wallDefault: ctx.wallDefault,
            wallTypedHud: ctx.wallTypedHud,
            makeWallPreviewMesh: ctx.makeWallPreviewMesh,
            addPreviewToLayout: (preview) => ctx.layoutRoot.add(preview),
            updateWallMeshWithJustification: ctx.updateWallMeshWithJustification,
            setStatus: ctx.setUnderlayStatus
          });
          return;
        }

        handleWallDrawEndClick({
          hitPoint,
          snapped,
          shouldAxisSnap,
          rect: rect2,
          camera: ctx.cam(),
          precisionMm: isWallDrawFreeMm(ctx.wallDraw),
          walls: ctx.walls,
          hudWallEndAlignmentGuide: ctx.hudWallEndAlignmentGuide,
          updateHudDashedLine: ctx.updateHudDashedLine,
          wallDraw: ctx.wallDraw,
          wallDefault: ctx.wallDefault,
          wallTypedHud: ctx.wallTypedHud,
          snapAxisXZ: ctx.snapAxisXZ,
          addWall: ctx.addWall,
          autoJoinAtMmPoint: ctx.autoJoinAtMmPoint,
          clearWallDrawState: ctx.clearWallDrawState,
          updateWallMeshWithJustification: ctx.updateWallMeshWithJustification,
          setStatus: ctx.setUnderlayStatus,
          selectWall: (id) => {
            ctx.selectedKind = "wall";
            ctx.selectedWallId = id;
            ctx.mountProps();
          }
        });
        return;
      }

      if (ctx.measureState.enabled) return;

      if (handleFloorplanSelectPointerDown(ev)) return;

      const pointerRect = ctx.renderer.domElement.getBoundingClientRect();
      const pointerMouse = pointerClientPointInRect(ev, pointerRect);
      const picks: THREE.Object3D[] = ctx.getAllInstanceGeometryMeshes();
      const windowPicks = ctx.windows.map((inst) => inst.pick);
      const doorPicks = ctx.doors.map((inst) => inst.pick);
      picks.push(...windowPicks);
      picks.push(...doorPicks);
      picks.push(...ctx.getColumnPickMeshes());
      for (const w of ctx.walls) picks.push(w.mesh);
      for (const floor of ctx.floors) picks.push(floor.mesh, floor.outline);
      const hits = ctx.raycaster.intersectObjects(pickableObjects(picks), false);
      const windowHit = ctx.raycaster.intersectObjects(pickableObjects(windowPicks), false)[0] ?? null;
      const doorHit = ctx.raycaster.intersectObjects(pickableObjects(doorPicks), false)[0] ?? null;
      const openingHit =
        doorHit && windowHit
          ? (doorHit.distance <= windowHit.distance ? doorHit : windowHit)
          : doorHit ?? windowHit;
      const firstHit = openingHit && (!hits[0] || openingHit.distance <= hits[0].distance + 0.25) ? openingHit : hits[0];
      const first = firstHit?.object as THREE.Mesh | undefined;
      const tallSubmoduleHit = ctx.S.kitchenEditMode && ctx.kitchenMode?.isTallModuleEditorActive?.()
        ? hits.find((hit) => hasTallSubmodulePickData(hit.object)) ?? null
        : null;
      const tallSubmoduleObject = tallSubmoduleHit?.object as THREE.Mesh | undefined;
      const worktopHit3d = ctx.raycaster.intersectObjects(pickableObjects(ctx.getKitchenWorktopGeometryMeshes()), false)[0]?.object as THREE.Mesh | undefined;
      const pickedKind = (first?.userData?.kind as string | undefined) ?? "module";
      const detailFallbackModuleId = resolveDetailModuleIdFromScreenBounds(pointerMouse, pointerRect);
      const directModuleId = ctx.getInstanceIdFromObject(first);
      const shouldUseDetailModuleFallback = !!detailFallbackModuleId && (!first || pickedKind === "wall" || pickedKind === "floor");
      const id = directModuleId ?? (shouldUseDetailModuleFallback ? detailFallbackModuleId : null);
      const kind = id ? "module" : pickedKind;

      if (ctx.S.kitchenEditMode && ctx.kitchenMode?.isTallModuleEditorActive?.()) {
        const activeHostId = ctx.getInstanceIdFromObject(tallSubmoduleObject) ?? directModuleId ?? detailFallbackModuleId ?? null;
        if (tallSubmoduleObject && ctx.kitchenMode.selectTallSubmoduleFromObject?.(activeHostId, tallSubmoduleObject, { additive: ev.shiftKey || ev.ctrlKey || ev.metaKey })) {
          markPendingMarqueeHit(ev.pointerId);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        ctx.kitchenMode.clearTallSubmoduleSelection?.();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }

      if (kind === "window") {
        const pickedWindow = findWindowFromObject(first);
        if (!pickedWindow) return;
        beginWindowDragFromPick({
          cancelPendingMarquee: () => cancelPendingMarquee(ev.pointerId),
          continueMoveAfterSelection: () => continueMoveAfterSelection(firstHit?.point),
          findCustomWall: (wallId) => ctx.walls.find((item) => item.id === wallId) ?? null,
          getGroundHitPoint: () => intersectRayPlane(ctx.raycaster, ctx.groundPlane),
          getLegacyWallHitPoint: (wallId) => {
            const def = ctx.wallDefs[wallId];
            return def ? intersectRayPlane(ctx.raycaster, def.plane) : null;
          },
          getLegacyWallMeta: (wallId) => ctx.wallDefs[wallId] ?? null,
          opening: pickedWindow,
          pointOnWallAxisMm: ctx.pointOnWallAxisMm,
          selectOpening: (window) => {
            ctx.windowInst = window;
            ctx.setSelectedWindow();
          },
          setPointerCapture: () => ctx.renderer.domElement.setPointerCapture(ev.pointerId),
          toMmPoint: ctx.toMmPoint,
          windowDragState: ctx.windowDragState
        });
        return;
      }

      if (kind === "door") {
        const pickedDoor = findDoorFromObject(first);
        if (!pickedDoor) return;
        beginDoorDragFromPick({
          cancelPendingMarquee: () => cancelPendingMarquee(ev.pointerId),
          continueMoveAfterSelection: () => continueMoveAfterSelection(firstHit?.point),
          doorDragState: ctx.doorDragState,
          findCustomWall: (wallId) => ctx.walls.find((item) => item.id === wallId) ?? null,
          getGroundHitPoint: () => intersectRayPlane(ctx.raycaster, ctx.groundPlane),
          opening: pickedDoor,
          pointOnWallAxisMm: ctx.pointOnWallAxisMm,
          selectOpening: (door) => {
            ctx.doorInst = door;
            ctx.setSelectedDoor();
          },
          setPointerCapture: () => ctx.renderer.domElement.setPointerCapture(ev.pointerId),
          toMmPoint: ctx.toMmPoint
        });
        return;
      }

      const columnId = ctx.getColumnIdFromObject(first);
      const wallId = (first?.userData?.wallId as string | undefined) ?? null;
      const floorId = (first?.userData?.floorId as string | undefined) ?? null;
      const worktopId = ctx.getWorktopIdFromObject(first) ?? ctx.getWorktopIdFromObject(worktopHit3d);
      if (ctx.S.kitchenEditMode && kind !== "module") {
        if (worktopId && ctx.beginKitchenWorktopSelection(worktopId, ev)) return;
        return;
      }
      if (ctx.S.kitchenEditMode && kind === "module" && id && !ctx.kitchenMode?.filterSelectableInstanceId(id)) {
        if (worktopId && ctx.beginKitchenWorktopSelection(worktopId, ev)) return;
        return;
      }
      if (ctx.S.kitchenEditMode && kind === "module" && id) {
        if (ctx.kitchenMode?.selectTallSubmoduleFromObject?.(id, first, { additive: ev.shiftKey || ev.ctrlKey || ev.metaKey })) {
          cancelPendingMarquee(ev.pointerId);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        ctx.kitchenMode?.clearTallSubmoduleSelection?.();
      }

      if (
        executeFallbackPickSelection({
          activeViewerTab: ctx.activeViewerTab,
          beginModuleSelection: (selectableId) => ctx.beginModuleSelection(selectableId, ev),
          beginWorktopSelection: (id) => ctx.beginKitchenWorktopSelection(id, ev),
          cancelPendingMarquee: () => cancelPendingMarquee(ev.pointerId),
          clearNonFloorplanFloorSelection: () => clearNonFloorplanFloorSelection(ctx),
          clearWindowLightIfMissing: ctx.clearWindowLightIfMissing,
          columnId,
          continueMoveAfterSelection,
          filterSelectableId: (rawId) => (ctx.kitchenMode ? ctx.kitchenMode.filterSelectableInstanceId(rawId) : rawId),
          firstHitPoint: firstHit?.point,
          floorId,
          id,
          kind,
          setDoorInstNull: () => {
            ctx.doorInst = null;
          },
          selectColumn: ctx.setSelectedColumn,
          selectFloor: ctx.setSelectedFloor,
          selectModule: ctx.setSelectedModule,
          selectWall: ctx.setSelectedWall,
          transformSelectElements: ctx.transformState.kind === "move" && ctx.transformState.step === "selectElements",
          viewMode: ctx.viewMode,
          wallId,
          worktopId
        })
      ) {
        return;
      }

      if (!id) {
        const underlayDragHandled = beginUnderlayDragPointerDown({
          button: ev.button,
          cancelPendingMarquee: () => cancelPendingMarquee(ev.pointerId),
          getGroundHitPoint: () => intersectRayPlane(ctx.raycaster, ctx.groundPlane),
          hasUnderlayHit: () => !!ctx.raycaster.intersectObject(ctx.underlayMesh, false)[0],
          isEligible:
            ctx.viewMode === "2d" &&
            ctx.layoutTool === "select" &&
            ctx.underlayMesh.visible &&
            hasLoadedUnderlay() &&
            isPickableKey("underlay:main") &&
            !ctx.underlayState.pinned,
          pointerId: ev.pointerId,
          setPointerCapture: (pointerId) => ctx.renderer.domElement.setPointerCapture(pointerId),
          setSelectedUnderlay: ctx.setSelectedUnderlay,
          setUnderlayStatus: ctx.setUnderlayStatus,
          underlayDragState: ctx.underlayDragState,
          underlayOffsetMm: ctx.underlayState.offsetMm
        });
        if (underlayDragHandled) return;
        if (
          handleEmptyFallbackPickSelection({
            clearWindowLightIfMissing: ctx.clearWindowLightIfMissing,
            cloneMovePoint: (point) => new THREE.Vector3().copy(point),
            continueMoveWithCurrentSelection,
            getCurrentMoveHitPoint: () => intersectRayPlane(ctx.raycaster, ctx.groundPlane),
            hasPendingMarqueeForPointer: ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId,
            setDoorInstNull: () => {
              ctx.doorInst = null;
            },
            selectFloor: ctx.setSelectedFloor,
            selectModule: ctx.setSelectedModule,
            selectWall: ctx.setSelectedWall
          })
        ) {
          return;
        }
      }
    }

    if (!ctx.cabinetGroup) return;

    const meshes = ctx.getSelectableMeshes(ctx.cabinetGroup).filter((m) => m.visible);

    if (ctx.measureState.enabled) {
      const hit = ctx.pickSurfacePoint(ctx.raycaster, meshes);
      if (!hit) return;

      const snapped = ctx.snapPointXZ(hit.point, hit.object);
      handleLegacySurfaceMeasurePointClick({
        point: snapped.point,
        kind: snapped.kind,
        measureState: ctx.measureState,
        formatMm: ctx.formatMm,
        toFreePlanBinding: ctx.toFreePlanBinding,
        axisLockXZ: ctx.axisLockXZ,
        planarDistanceMm: ctx.planarDistanceMm,
        addMeasurement: ctx.addMeasurement,
        setReadout: (message) => { ctx.args.measureReadoutEl.textContent = message; },
        clearPreview: ctx.clearPreview
      });
      return;
    }

    const hits = ctx.raycaster.intersectObjects(meshes, false);
    const first = hits[0]?.object as THREE.Mesh | undefined;
    ctx.selectMesh(first ?? null);
  });

  // Live hover + preview (SketchUp-like)
  ctx.renderer.domElement.addEventListener("pointermove", (ev) => {
    if (ctx.viewNavigation.handlePointerMove(ev)) {
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.floorEdit.active) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      if (!hitPoint) return;
      const floorPoint = ctx.worldToFloorPoint(hitPoint);

      updateFloorBoundaryEditPointerMove({
        floorEdit: ctx.floorEdit,
        floorPoint,
        hitPoint,
        pointerId: ev.pointerId,
        rect,
        mouse: ctx.floorEdit.tool === "pickLines" ? pointerClientPointInRect(ev, rect) : null,
        camera: ctx.cam(),
        hudHoverLine: ctx.hudHoverLine,
        floorOrthoPoint: ctx.floorOrthoPoint,
        moveFloorEditVertex: ctx.moveFloorEditVertex,
        moveFloorEditSegment: ctx.moveFloorEditSegment,
        pickWallLine2D: ctx.pickWallLine2D,
        pickAlignLineAt: ctx.pickAlignLineAt,
        updateHudLine: ctx.updateHudLine,
        hudLineThickness: ctx.hudLineThicknessM(rect),
        renderFloorBoundaryEdit: ctx.renderFloorBoundaryEdit
      });
      return;
    }

    if (
      ctx.mode === "layout" &&
      ctx.viewMode === "2d" &&
      ctx.layoutTool === "select" &&
      (ctx.isWindowPlacementActive?.() || ctx.isDoorPlacementActive?.())
    ) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      const mouse = pointerClientPointInRect(ev, rect);
      handleSelectOpeningPlacementPreviewPointerMove({
        clearDoorPreview: () => ctx.clearDoorPlacementPreview?.(),
        clearWindowPreview: () => ctx.clearWindowPlacementPreview?.(),
        hitPoint,
        isDoorActive: !!ctx.isDoorPlacementActive?.(),
        isWindowActive: !!ctx.isWindowPlacementActive?.(),
        pickWallId: (pointMm) => pickFloorplanWallId(pointMm, mouse, rect),
        pointFromHit: ctx.toMmPoint,
        updateDoorPreview: (wallId, pointMm) => ctx.updateDoorPlacementPreview?.(wallId, pointMm),
        updateWindowPreview: (wallId, pointMm) => ctx.updateWindowPlacementPreview?.(wallId, pointMm)
      });
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ctx.layoutTool === "select" && ctx.isColumnPlacementActive?.()) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      handleColumnPlacementPreviewPointerMove({
        clearPlanSnap: () => {
          ctx.selectPlanSnap = null;
          ctx.drawSnapOverlay.hide();
        },
        hideHoverCursor: ctx.hideHoverCursor,
        hitPoint,
        isActive: true,
        pointFromPlacementPoint: ctx.toMmPoint,
        resolvePlacementPoint: (point) => resolveColumnPlacementPoint(point, rect),
        updatePreview: (pointMm) => ctx.updateColumnPlacementPreview?.(pointMm)
      });
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "select" && ctx.placement.active) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      handlePlacementPreviewPointerMove({
        helpers: ctx.placementHelpers,
        hitPoint,
        isActive: true,
        rebuildGhost: ctx.rebuildGhost,
        state: ctx.S
      });
      return;
    }

    // Wall edit drag (2D, select tool)
    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "select" && ctx.wallEditHud.drag) {
      const d = ctx.wallEditHud.drag;
      const w = ctx.walls.find((x) => x.id === d.wallId) ?? null;
      if (!w) return;

      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      if (!hitPoint) return;

      updateWallEditHudDragPointerMove({
        drag: d,
        fromMmPoint: ctx.fromMmPoint,
        hasModuleWallOverlap: () => ctx.instances.some((i) => ctx.moduleOverlapsWalls(i)),
        hitPoint,
        rebuildWall: ctx.rebuildWall,
        rebuildWallPlanMesh: ctx.rebuildWallPlanMesh,
        shiftKey: ev.shiftKey,
        snapAxisXZ: ctx.snapAxisXZ,
        snapPoint2D: (point) => ctx.snapPoint2D(point, rect, ctx.cam()),
        toMmPoint: ctx.toMmPoint,
        wall: w,
        walls: ctx.walls
      });
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "select" && ctx.transformState.kind) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const pointerPoint = pointerClientPointInRect(ev, rect);

      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);

      if (
        handleTransformPointerMovePreview({
          applyMoveDelta: ctx.applyMoveDelta,
          applyRotateAngle: ctx.applyRotateAngle,
          constrainMoveDelta,
          hitPoint,
          makeNoSnapResult,
          pointerPoint,
          rect,
          resolveMoveDelta: (delta) => resolveMoveDeltaWithObjectSnap(prepareMoveDeltaForSnapMode(delta, ctx.transformState.moveSnapDisabled), rect),
          resolveMoveSnap,
          resolveRotateSnap: (point, targetRect) => ctx.snapPoint2D(point, targetRect, ctx.cam(), SNAP_DISTANCE_PX.transformRotate, {
            sticky: ctx.selectPlanSnap
          }),
          setSelectPlanSnap: (snap) => {
            ctx.selectPlanSnap = snap;
          },
          setStatus: ctx.setUnderlayStatus,
          shiftKey: ev.shiftKey,
          transformState: ctx.transformState,
          updateHoverCursor: (point, kind, targetRect) => ctx.updateHoverCursor(ctx.worldToScreen(point, ctx.cam(), targetRect), kind),
          updateMoveSnapFeedback: (snap, target, targetRect) => updateMoveSnapFeedback(snap, target, targetRect),
          updateObjectSnapFeedback: (snap, target) => updateMoveSnapFeedback(snap, target, rect),
          hideHoverCursor: ctx.hideHoverCursor
        })
      ) {
        return;
      }
    }


    if (ctx.marquee.active || (ctx.marquee.pending && !ctx.marquee.active && ctx.marquee.pointerId === ev.pointerId)) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const point = pointerClientPointInRect(ev, rect);
      updatePointerMarqueePointerMove(ctx.marquee, ctx.marqueeEl, {
        pointerId: ev.pointerId,
        x: point.x,
        y: point.y
      });
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "select" && ctx.underlayDragState.active && ctx.underlayDragState.pointerId === ev.pointerId) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      updateUnderlayDragPointerMove({
        hitPoint,
        pointerId: ev.pointerId,
        selectedUnderlayBox: ctx.selectedUnderlayBox,
        setOffsetInputs: (x, z) => {
          if (ctx.underlayOffXEl) ctx.underlayOffXEl.value = x;
          if (ctx.underlayOffZEl) ctx.underlayOffZEl.value = z;
        },
        underlayDragState: ctx.underlayDragState,
        underlayOffsetMm: ctx.underlayState.offsetMm,
        updateUnderlayTransform: ctx.updateUnderlayTransform
      });
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "dimension") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      updateDimensionToolPointerMoveHover({
        hitPoint,
        mouse: hitPoint ? pointerClientPointInRect(ev, rect) : null,
        rect,
        dimensionState: ctx.dimensionState,
        pickDimensionLineAt: ctx.pickDimensionLineAt,
        pickAlignLineAt: ctx.pickAlignLineAt,
        areAlignLinesParallel: ctx.areAlignLinesParallel,
        buildPreviewDimensions: (picked, point) => ctx.technicalDimensions.buildFromPickedLines(picked, point, "preview"),
        hudHoverLine: ctx.hudHoverLine,
        hudPickLine1: ctx.hudPickLine1,
        hudPickLine2: ctx.hudPickLine2,
        hudLineThickness: hitPoint ? ctx.hudLineThicknessM(rect) : 0,
        updateHudLine: ctx.updateHudLine,
        clearToolHud: ctx.clearToolHud
      });
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && (ctx.layoutTool === "align" || ctx.layoutTool === "trim")) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      updateAlignTrimToolPointerMoveHover({
        tool: ctx.layoutTool,
        hitPoint,
        mouse: hitPoint ? pointerClientPointInRect(ev, rect) : null,
        rect,
        alignState: ctx.alignState,
        trimState: ctx.trimState,
        pickAlignLineAt: ctx.layoutTool === "align" && ctx.alignState.ref
          ? (hitPoint, mouse, rect) => ctx.pickCompatibleAlignLineAt(ctx.alignState.ref!, hitPoint, mouse, rect)
          : ctx.pickAlignLineAt,
        hudHoverLine: ctx.hudHoverLine,
        hudPickLine1: ctx.hudPickLine1,
        hudPickLine2: ctx.hudPickLine2,
        hudLineThickness: hitPoint ? ctx.hudLineThicknessM(rect) : 0,
        now: hitPoint ? performance.now() : 0,
        updateHudLine: ctx.updateHudLine,
        clearToolHud: ctx.clearToolHud
      });
      // no return; other pointermove handling can still run (e.g. marquee box)
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "measure") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      updateMeasure2DPointerMoveHover({
        hitPoint,
        rect,
        normalMode: ev.shiftKey,
        hideHoverCursor: ctx.hideHoverCursor,
        clearToolHud: ctx.clearToolHud,
        clearPreview: ctx.clearPreview,
        updateMeasureHoverFromPlanPoint: ctx.updateMeasureHoverFromPlanPoint
      });
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "3d" && ctx.layoutTool === "measure") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);

      const hit = ctx.pickSurfacePoint(ctx.raycaster, ctx.getLayoutMeasureMeshes3d());
      updateMeasure3DPointerMoveHover({
        hit,
        rect,
        measureState: ctx.measureState,
        cam: ctx.cam,
        getMeasure3DSnapTargetObject: ctx.getMeasure3DSnapTargetObject,
        snapPoint3D: ctx.snapPoint3D,
        applyMeasureAxisAssist3D: ctx.applyMeasureAxisAssist3D,
        worldToScreen: ctx.worldToScreen,
        updateHoverCursor: ctx.updateHoverCursor,
        hideHoverCursor: ctx.hideHoverCursor,
        clearToolHud: ctx.clearToolHud,
        clearPreview: ctx.clearPreview,
        setReadout: (message) => { ctx.args.measureReadoutEl.textContent = message; },
        hudHoverLine: ctx.hudHoverLine,
        hudLineThickness: ctx.hudLineThicknessM(rect),
        updateHudLine: ctx.updateHudLine,
        updatePreview: ctx.updatePreview,
        distance3dMm: ctx.distance3dMm,
        axisLockPoint3D: ctx.axisLockPoint3D,
        setFirstPointMarker: ctx.setFirstPointMarker
      });
      return;
    }

    if (ctx.mode === "layout" && ctx.layoutTool === "section" && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      updateSectionDrawPointerMoveHover({
        hitPoint,
        rect,
        allowAxisSnap: !ev.shiftKey,
        sectionDraw: ctx.sectionDraw,
        resolveSectionDrawPoint: ctx.resolveSectionDrawPoint,
        showSnapHover: (point, kind) => {
          ctx.updateHoverCursor(ctx.worldToScreen(point, ctx.cam(), rect), kind);
          ctx.drawSnapOverlay.showWorld(point, ctx.cam(), rect, kind);
        },
        hideHoverCursor: () => {
          ctx.hideHoverCursor();
          ctx.drawSnapOverlay.hide();
        },
        updateSectionDrawPreview: ctx.updateSectionDrawPreview
      });
      return;
    }

    if (ctx.mode === "layout" && ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active && ctx.viewMode === "2d") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const pointerPoint = pointerClientPointInRect(ev, rect);
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      updateKitchenWorktopDrawPointerMoveHover({
        pointerPoint,
        hitPoint,
        rect,
        kitchenWorktopDraw: ctx.kitchenWorktopDraw,
        resolveKitchenWorktopDrawSnap: ctx.resolveKitchenWorktopDrawSnap,
        floorOrthoPoint: ctx.floorOrthoPoint,
        showSnapHover: (point, kind) => ctx.updateHoverCursor(ctx.worldToScreen(point, ctx.cam(), rect), kind),
        hideHoverCursor: ctx.hideHoverCursor,
        updateTypedHud: (typedMm, point) => updatePointerTypedHud(ctx.wallTypedHud, typedMm, point),
        schedulePreviewUpdate: ctx.scheduleKitchenWorktopPreviewUpdate
      });
      return;
    }

    if (ctx.mode === "layout" && ctx.layoutTool === "wall" && ctx.wallDraw.active && ctx.wallDraw.a && ctx.wallDraw.preview) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const pointerPoint = pointerClientPointInRect(ev, rect);
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      ctx.wallDrawSnap = updateActiveWallDrawPointerMoveHover({
        pointerPoint,
        hitPoint,
        rect,
        wallDraw: ctx.wallDraw,
        wallDefault: ctx.wallDefault,
        currentSnap: ctx.wallDrawSnap,
        camera: ctx.cam(),
        snapPoint2D: ctx.snapPoint2D,
        keepStickyPlanSnap: ctx.keepStickyPlanSnap,
        worldToScreen: ctx.worldToScreen,
        updateHoverCursor: ctx.updateHoverCursor,
        hideHoverCursor: ctx.hideHoverCursor,
        allowAxisSnap: ctx.drawOrthoEnabled && !ev.shiftKey,
        precisionMm: isWallDrawFreeMm(ctx.wallDraw),
        walls: ctx.walls,
        hudWallEndAlignmentGuide: ctx.hudWallEndAlignmentGuide,
        updateHudDashedLine: ctx.updateHudDashedLine,
        snapAxisXZ: ctx.snapAxisXZ,
        updateWallMeshWithJustification: ctx.updateWallMeshWithJustification,
        updateTypedHud: (typedMm, point) => updatePointerTypedHud(ctx.wallTypedHud, typedMm, point)
      });
      return;
    }

    if (ctx.mode === "layout" && ctx.layoutTool === "led" && ctx.ledStripDrawController?.state.active && ctx.viewMode === "2d") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      if (!hitPoint) return;
      const snapped = ctx.snapPoint2D(hitPoint, rect, ctx.cam());
      ctx.ledStripDrawController.updatePreview(snapped.kind === "none" ? hitPoint : snapped.point);
      return;
    }

    if (ctx.mode === "layout" && ctx.layoutTool === "wall" && ctx.viewMode === "2d") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const pointerPoint = pointerClientPointInRect(ev, rect);
      updateRaycasterFromPointer(ev, rect);
      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      ctx.wallDrawSnap = updateWallToolPointerMoveHover({
        pointerPoint,
        hitPoint,
        rect,
        wallDraw: ctx.wallDraw,
        currentSnap: ctx.wallDrawSnap,
        camera: ctx.cam(),
        snapPoint2D: ctx.snapPoint2D,
        keepStickyPlanSnap: ctx.keepStickyPlanSnap,
        worldToScreen: ctx.worldToScreen,
        updateHoverCursor: ctx.updateHoverCursor,
        hideHoverCursor: ctx.hideHoverCursor
      });
    }

    const canShowSelectionHover =
      ctx.mode === "layout" &&
      ctx.layoutTool === "select" &&
      !ctx.placement.active &&
      !ctx.transformState.kind &&
      !ctx.dragState.active &&
      !ctx.windowDragState.active &&
      !ctx.doorDragState.active &&
      !ctx.wallEditHud.drag &&
      !ctx.marquee.active &&
      !ctx.measureState.enabled &&
      !ctx.floorEdit.active;

    if (canShowSelectionHover) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);
      const target = ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan"
        ? resolveFloorplanHoverTarget(ev)
        : resolve3dHoverTarget(ev);
      ctx.updateSelectionHover(target);
    } else {
      ctx.updateSelectionHover(null);
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ctx.layoutTool === "select" && !ctx.dragState.active && !ctx.windowDragState.active && !ctx.doorDragState.active && !ctx.wallEditHud.drag && !ctx.marquee.active) {
      ctx.selectPlanSnap = null;
      ctx.drawSnapOverlay.hide();
      ctx.hideHoverCursor();
    }

    if (
      ctx.mode === "layout" &&
      ((ctx.windowDragState.active && ctx.windowInst && ctx.windowDragState.wall) ||
        (ctx.doorDragState.active && ctx.doorInst && ctx.doorDragState.wall))
    ) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);

      if (handleOpeningDragPointerMove({
        doorDragState: ctx.doorDragState,
        doorOpening: ctx.doorInst,
        findCustomWall: (wallId) => ctx.walls.find((item) => item.id === wallId) ?? null,
        getGroundHitPoint: () => intersectRayPlane(ctx.raycaster, ctx.groundPlane),
        getLegacyWallHitPoint: (wallId) => intersectRayPlane(ctx.raycaster, ctx.wallDefs[wallId].plane),
        getLegacyWallMeta: (wallId) => ctx.wallDefs[wallId],
        mountProps: ctx.mountProps,
        pointOnWallAxisMm: ctx.pointOnWallAxisMm,
        toMmPoint: ctx.toMmPoint,
        updateDoorTransform: ctx.updateDoorTransform,
        updateWindowTransform: ctx.updateWindowTransform,
        windowDragState: ctx.windowDragState,
        windowOpening: ctx.windowInst
      })) {
        return;
      }
    }

    if (ctx.mode === "layout" && ctx.dragState.active && ctx.dragState.id) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      updateRaycasterFromPointer(ev, rect);

      const hitPoint = intersectRayPlane(ctx.raycaster, ctx.groundPlane);
      updateModuleDragFromGroundHit({
        dragState: ctx.dragState,
        hitPoint,
        findInstance: ctx.findInstance,
        applyWallConstraints: ctx.applyWallConstraints,
        snapPosition: ctx.snapPosition,
        autoOrientModuleToRoomWallIfSnapped: ctx.autoOrientModuleToRoomWallIfSnapped,
        nudgePinnedModuleChain: ctx.nudgePinnedModuleChain,
        anyOverlap: ctx.anyOverlap,
        moduleOverlapsWalls: ctx.moduleOverlapsWalls,
        moduleOverlapsKitchenWorktops: ctx.moduleOverlapsKitchenWorktops,
        kitchenGroups: ctx.S.kitchenGroups,
        defaultWorktopBackOffsetMm: ctx.S.kitchenCtx.worktopBackOffsetMm,
        inferKitchenPlacementBinding: ctx.inferKitchenPlacementBinding,
        updateLayoutPanel: ctx.updateLayoutPanel,
        isModuleAlignLocked: ctx.isModuleAlignLocked
      });
      return;
    }

    if (!ctx.measureState.enabled || !ctx.cabinetGroup) return;

    const rect = ctx.renderer.domElement.getBoundingClientRect();
    updateRaycasterFromPointer(ev, rect);

    const meshes = ctx.getSelectableMeshes(ctx.cabinetGroup).filter((m) => m.visible);
    const hit = ctx.pickSurfacePoint(ctx.raycaster, meshes);
    updateLegacySurfaceMeasurePointerMoveHover({
      hit,
      rect,
      measureState: ctx.measureState,
      snapPointXZ: ctx.snapPointXZ,
      cam: ctx.cam,
      worldToScreen: ctx.worldToScreen,
      updateHoverCursor: ctx.updateHoverCursor,
      hideHoverCursor: ctx.hideHoverCursor,
      setReadout: (message) => { ctx.args.measureReadoutEl.textContent = message; },
      clearPreview: ctx.clearPreview,
      updatePreview: (a, b, previewRect) => ctx.updatePreview(a, b, previewRect),
      axisLockXZ: ctx.axisLockXZ,
      planarDistanceMm: ctx.planarDistanceMm,
      formatMm: ctx.formatMm
    });
  });

  ctx.renderer.domElement.addEventListener("pointerleave", () => {
    ctx.updateSelectionHover(null);
  });

  ctx.renderer.domElement.addEventListener("pointerup", (ev) => {
    if (ctx.viewNavigation.handlePointerUp(ev)) {
      return;
    }

    if (ctx.mode !== "layout") return;

    if (finishFloorBoundaryEditDragPointerUp({
      floorEdit: ctx.floorEdit,
      mountProps: ctx.mountProps,
      pointerId: ev.pointerId,
      releasePointerCapture: (pointerId) => {
        try {
          ctx.renderer.domElement.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
      },
      renderFloorBoundaryEdit: ctx.renderFloorBoundaryEdit
    })) {
      return;
    }

    if (finishWallEditHudDragPointerUp({
      autoJoinAtMmPoint: ctx.autoJoinAtMmPoint,
      commitHistory: () => ctx.commitHistory(ctx.S),
      mountProps: ctx.mountProps,
      pointerId: ev.pointerId,
      rebuildWallPlanMesh: ctx.rebuildWallPlanMesh,
      releasePointerCapture: (pointerId) => {
        try {
          ctx.renderer.domElement.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
      },
      wallEditHud: ctx.wallEditHud,
      walls: ctx.walls
    })) {
      return;
    }

    if (finishUnderlayDragPointerUp({
      commitHistory: () => ctx.commitHistory(ctx.S),
      pointerId: ev.pointerId,
      releasePointerCapture: (pointerId) => {
        try {
          ctx.renderer.domElement.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
      },
      setUnderlayStatus: ctx.setUnderlayStatus,
      underlayDragState: ctx.underlayDragState
    })) {
      return;
    }

    if (finishPendingPointerMarquee({
      button: ev.button,
      clientX: ev.clientX,
      clientY: ev.clientY,
      layoutTool: ctx.layoutTool,
      marquee: ctx.marquee,
      openQuickActionMenu: ctx.openQuickActionMenu,
      pointerId: ev.pointerId,
      releasePointerCapture: (pointerId) => {
        try {
          ctx.renderer.domElement.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
      },
      setSelectedModule: ctx.setSelectedModule,
      setSelectedWall: ctx.setSelectedWall,
      viewMode: ctx.viewMode
    })) {
      return;
    }

    if (ctx.marquee.active) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const endPoint = pointerClientPointInRect(ev, rect);

      finishActivePointerMarquee({
        additive: ev.shiftKey,
        applyCustomSelection: (selectionRect, additive) => {
          if (!ctx.S.kitchenEditMode || !ctx.kitchenMode?.isTallModuleEditorActive?.()) return false;
          if (!ctx.kitchenMode.selectTallSubmodulesFromObjects) return false;
          const submoduleHits = collectTallSubmoduleObjectsInMarquee(selectionRect, rect);
          if (!submoduleHits) return false;
          ctx.kitchenMode.selectTallSubmodulesFromObjects(submoduleHits.activeHostId, submoduleHits.hits, { additive });
          return true;
        },
        collectHitIds: (selectionRect) => {
          const instBounds = (id: string) => {
            const inst = ctx.findInstance(id);
            if (!inst) return null;
            const meshes = ctx.getInstanceGeometryMeshes(inst);
            return buildModuleMarqueeScreenBounds({
              meshes,
              worldToScreen: (point) => ctx.worldToScreen(point, ctx.cam(), rect)
            });
          };
          return collectMarqueeHitIds({
            getModuleBounds: (inst) => instBounds(inst.id),
            getWallPolygon: (wall) =>
              buildWallMarqueeScreenPolygon({
                fromMmPoint: ctx.fromMmPoint,
                solvedOutline: ctx.wallSolvedOutlines.get(wall.id) ?? null,
                wall,
                worldToScreen: (point) => ctx.worldToScreen(point, ctx.cam(), rect)
              }),
            isModuleSelectable: (inst) => !ctx.kitchenMode || !!ctx.kitchenMode.filterSelectableInstanceId(inst.id),
            isWallPickable: (wall) => isPickableKey(`wall:${wall.id}`),
            marqueeMode: ctx.marquee.mode,
            modules: ctx.instances,
            pinnedInstanceIds: ctx.pinnedInstanceIds,
            pinnedWallIds: ctx.pinnedWallIds,
            selectionRect,
            walls: ctx.walls
          });
        },
        currentInstanceId: ctx.selectedInstanceId,
        currentWallId: ctx.selectedWallId,
        endPoint,
        layoutTool: ctx.layoutTool,
        marquee: ctx.marquee,
        marqueeEl: ctx.marqueeEl,
        mountProps: ctx.mountProps,
        pointerId: ev.pointerId,
        releasePointerCapture: (pointerId) => {
          try {
            ctx.renderer.domElement.releasePointerCapture(pointerId);
          } catch {
            // ignore
          }
        },
        selectedInstanceIds: ctx.selectedInstanceIds,
        selectedWallIds: ctx.selectedWallIds,
        setSelectedModule: ctx.setSelectedModule,
        setSelectedWall: ctx.setSelectedWall,
        updateSelectionHighlights: ctx.updateSelectionHighlights
      });
      return;
    }

    const draggedInstanceId = ctx.dragState.active ? ctx.dragState.id : null;
    if (
      finishPointerDragState({
        doorDragState: ctx.doorDragState,
        moduleDragState: ctx.dragState,
        pointerId: ev.pointerId,
        releasePointerCapture: (pointerId) => {
          try {
            ctx.renderer.domElement.releasePointerCapture(pointerId);
          } catch {
            // ignore
          }
        },
        windowDragState: ctx.windowDragState
      }) &&
      draggedInstanceId
    ) {
      syncKitchenDragBindings(draggedInstanceId);
      ctx.updateLayoutPanel();
    }
  });

  return { resolveContextTarget };
}
