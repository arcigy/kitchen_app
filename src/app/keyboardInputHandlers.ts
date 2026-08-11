import * as THREE from "three";
import type { LayoutInstance, SectionInstance, SelectedKind, WallInstance, WallParams } from "./localTypes";
import type { AppState } from "../layout/appState";
import type { HistoryHelpers } from "../layout/historyManager";
import type { PlacementHelpers } from "../layout/placementManager";
import { rotateActivePlacement } from "../layout/placementManager";
import type { KeyboardTransformState, StartTransformOptions, TransformClearOptions, TransformKind } from "./transformStateTypes";
import { applyTypedMillimeterKey, updatePointerTypedHud } from "./pointerTypedHudHelpers";
import { finishWallDrawAfterAddedWall, resolveWallDrawTypedEndPoint } from "./pointerWallDrawClickHelpers";
import { refreshModuleKitchenPlacement, resolveKitchenPlacementBackOffset } from "./moduleKitchenPlacement";
import { resolveSelectedIds } from "./selectionController";
import { SNAP_DISTANCE_M } from "./snapToolProfiles";
import { hasLockedAlignModule } from "./alignLocks";

type WallDefaultParams = Pick<WallParams, "heightMm" | "materialId" | "thicknessMm" | "typeId"> & {
  justification: NonNullable<WallParams["justification"]>;
  exteriorSign: NonNullable<WallParams["exteriorSign"]>;
};

type KeyboardInputHandlersContext = {
  activeViewerTab: string;
  addWall: (a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number) => WallInstance | null;
  anyOverlap: (instance: LayoutInstance, selectedId: string | null) => boolean;
  applyMoveDelta: (delta: THREE.Vector3) => void;
  applyRotateAngle: (angleRad: number) => void;
  applyWallConstraints: (instance: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
  autoJoinAtMmPoint: (point: { x: number; z: number }) => void;
  autoOrientModuleToRoomWallIfSnapped: (instance: LayoutInstance) => void;
  cam: () => THREE.Camera;
  cancelDoorPlacement?: () => void;
  cancelPlacement: (state: AppState, helpers: PlacementHelpers) => void;
  cancelWindowPlacement?: () => void;
  clearTransform: (opts?: TransformClearOptions) => void;
  clearSelection: () => void;
  clearWallDrawState: () => void;
  commitHistory: (state: AppState) => void;
  commitKitchenWorktopTypedLength: () => boolean;
  customFurnitureMode?: {
    redoActiveEdit?: () => boolean;
    undoActiveEdit?: () => boolean;
  };
  deleteInstance: (id: string) => void;
  deleteSelected: () => boolean;
  deleteWall: (id: string) => void;
  discardFloorBoundaryEdit: () => void;
  doorDragState?: { active: boolean };
  drawSnapOverlay?: { hide?: () => void };
  dragState: { active: boolean };
  findInstance: (id: string) => LayoutInstance | null;
  floorEdit: {
    active: boolean;
    first: unknown | null;
    hover: unknown | null;
  };
  flipDoorPlacementSwingSide?: () => boolean;
  getKitchenPlacementConstraint: (
    instance: LayoutInstance,
    desired: THREE.Vector3
  ) => { position: THREE.Vector3; rotationY: number; kitchenPlacement?: LayoutInstance["kitchenPlacement"] } | null;
  applyKitchenPlacementBinding: (
    instance: LayoutInstance,
    binding: NonNullable<LayoutInstance["kitchenPlacement"]>,
    backOffsetMm: number
  ) => boolean;
  cancelActiveViewerTool: () => boolean;
  handleCustomFurnitureEscape: (ev: KeyboardEvent) => boolean;
  handleGlobalMeasurementClear: (ev: KeyboardEvent) => boolean;
  handleLayoutEscape: (ev: KeyboardEvent) => boolean;
  helpers: HistoryHelpers;
  hideHoverCursor?: () => void;
  hudHoverLine?: { visible: boolean } | null;
  walls: WallInstance[];
  instances: LayoutInstance[];
  instanceFitsRoom: (instance: LayoutInstance) => boolean;
  inferKitchenPlacementBinding: (instance: LayoutInstance, kitchenGroupId: string, backOffsetMm: number) => LayoutInstance["kitchenPlacement"];
  syncKitchenRunEndClosures?: (groupId: string, backOffsetMm?: number) => boolean;
  isDoorPlacementActive?: () => boolean;
  isTypingTarget: (target: EventTarget | null) => boolean;
  isWindowPlacementActive?: () => boolean;
  kitchenWorktopDraw: {
    active: boolean;
    typedMm: string;
    lastPointerPx: { x: number; y: number };
  };
  layoutTool: "select" | "wall" | "align" | "trim" | "measure" | "section" | "dimension";
  marquee: { active: boolean };
  measureState: { enabled: boolean };
  mirrorKitchenWorktopDraw: () => void;
  mode: "build" | "layout";
  moduleOverlapsKitchenWorktops: (instance: LayoutInstance) => boolean;
  moduleOverlapsWalls: (instance: LayoutInstance) => boolean;
  mountProps: () => void;
  nudgePinnedModuleChain: (instance: LayoutInstance, actualDelta: THREE.Vector3) => void;
  pinnedWallIds: Set<string>;
  placement: { active: boolean };
  placementHelpers: PlacementHelpers;
  rebuildWall: (wall: WallInstance) => void;
  rebuildInstance: (
    inst: LayoutInstance,
    opts?: { preserveBackAnchor?: boolean; previousParams?: LayoutInstance["params"] }
  ) => boolean;
  rebuildWallPlanMesh: () => void;
  redo: (state: AppState, helpers: HistoryHelpers) => void;
  renderFloorBoundaryEdit: () => void;
  rotateDoorPlacement?: () => boolean;
  sectionDraw: { mirrored: boolean };
  sections: SectionInstance[];
  selectPlanSnap: unknown | null;
  selectedInstanceId: string | null;
  selectedInstanceIds: Set<string>;
  selectedKind: SelectedKind;
  selectedSectionId: string | null;
  selectedWallId: string | null;
  selectedWallIds: Set<string>;
  setSelectedModule: (id: string | null) => void;
  setSelectedWall: (id: string | null) => void;
  setToolAlign: () => void;
  setToolSelect: () => void;
  setToolTrim: () => void;
  setToolWall: () => void;
  setUnderlayStatus: (status: string) => void;
  snapPositionDetailed: (
    instance: LayoutInstance,
    desired: THREE.Vector3,
    opts?: { stickyNeighborId?: string | null; snapDistanceM?: number }
  ) => { position: THREE.Vector3 };
  startTransformFromSelection: (kind: TransformKind, opts?: StartTransformOptions) => boolean;
  transformState: KeyboardTransformState;
  underlayCal: { active: boolean };
  undo: (state: AppState, helpers: HistoryHelpers) => void;
  updateLayoutPanel: () => void;
  updateSectionDrawPreview: () => void;
  updateSectionVisual: (section: SectionInstance) => void;
  updateWallMeshWithJustification: (
    mesh: THREE.Mesh,
    refA: THREE.Vector3 | null,
    refB: THREE.Vector3 | null,
    thicknessMm: number,
    justification: NonNullable<WallParams["justification"]>,
    exteriorSign: NonNullable<WallParams["exteriorSign"]>
  ) => void;
  viewMode: "2d" | "3d";
  wallDefault: WallDefaultParams;
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
  wallEditHud: { drag: unknown };
  wallEndpointWhich: (wall: WallInstance, point: { x: number; z: number }, toleranceMm: number) => "a" | "b" | null;
  wallJoinTolMm: number;
  wallTypedHud: HTMLElement;
  windowDragState: { active: boolean };
  S: AppState;
};

type KeyboardNudgeSelectionCommandContext = Pick<
  KeyboardInputHandlersContext,
  | "anyOverlap"
  | "applyWallConstraints"
  | "autoOrientModuleToRoomWallIfSnapped"
  | "commitHistory"
  | "doorDragState"
  | "dragState"
  | "findInstance"
  | "getKitchenPlacementConstraint"
  | "inferKitchenPlacementBinding"
  | "syncKitchenRunEndClosures"
  | "instanceFitsRoom"
  | "instances"
  | "layoutTool"
  | "marquee"
  | "measureState"
  | "moduleOverlapsKitchenWorktops"
  | "moduleOverlapsWalls"
  | "mountProps"
  | "nudgePinnedModuleChain"
  | "pinnedWallIds"
  | "rebuildWall"
  | "rebuildInstance"
  | "rebuildWallPlanMesh"
  | "S"
  | "sections"
  | "selectedInstanceId"
  | "selectedInstanceIds"
  | "selectedKind"
  | "selectedSectionId"
  | "selectedWallId"
  | "selectedWallIds"
  | "snapPositionDetailed"
  | "underlayCal"
  | "updateLayoutPanel"
  | "updateSectionVisual"
  | "viewMode"
  | "wallEditHud"
  | "wallEndpointWhich"
  | "wallJoinTolMm"
  | "walls"
  | "windowDragState"
>;

type KeyboardMoveSelectionShortcutCommandContext = KeyboardNudgeSelectionCommandContext &
  Pick<KeyboardInputHandlersContext, "cam">;

type KeyboardMoveSelectionShortcutDeltaContext = Pick<KeyboardInputHandlersContext, "cam" | "viewMode">;

type KeyboardNudgeSelectionGuardContext = Pick<
  KeyboardInputHandlersContext,
  | "doorDragState"
  | "dragState"
  | "layoutTool"
  | "marquee"
  | "measureState"
  | "underlayCal"
  | "viewMode"
  | "wallEditHud"
  | "windowDragState"
>;

type GlobalUndoRedoShortcutCommandContext = Pick<
  KeyboardInputHandlersContext,
  "customFurnitureMode" | "helpers" | "redo" | "S" | "undo"
>;

type LayoutToolShortcutCommandContext = Pick<
  KeyboardInputHandlersContext,
  "setToolAlign" | "setToolTrim" | "setToolWall" | "startTransformFromSelection"
>;

type LayoutSpaceShortcutCommandContext = Pick<
  KeyboardInputHandlersContext,
  | "commitHistory"
  | "findInstance"
  | "layoutTool"
  | "mountProps"
  | "rebuildInstance"
  | "rebuildWall"
  | "rebuildWallPlanMesh"
  | "S"
  | "selectedInstanceId"
  | "selectedKind"
  | "selectedWallId"
  | "setToolSelect"
  | "setUnderlayStatus"
  | "updateWallMeshWithJustification"
  | "wallDefault"
  | "wallDraw"
  | "walls"
>;

type ModuleSideMirrorShortcutCommandContext = Pick<
  KeyboardInputHandlersContext,
  | "commitHistory"
  | "findInstance"
  | "mountProps"
  | "rebuildInstance"
  | "S"
  | "selectedInstanceId"
  | "selectedKind"
  | "setUnderlayStatus"
> & Partial<Pick<KeyboardInputHandlersContext, "applyKitchenPlacementBinding">>;

type DeleteSelectionShortcutCommandContext = Pick<KeyboardInputHandlersContext, "deleteSelected">;
type ClearSelectionShortcutCommandContext = Pick<KeyboardInputHandlersContext, "clearSelection">;

type KeyboardShortcutLike = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey">;
type KeyboardKeyLike = Pick<KeyboardEvent, "key">;
type KeyboardSpaceLike = Pick<KeyboardEvent, "code" | "key">;

function isSpaceShortcut(ev: KeyboardSpaceLike) {
  return ev.key === " " || ev.key === "Spacebar" || ev.code === "Space";
}

type DrawingSpaceShortcutCommandContext = Pick<
  KeyboardInputHandlersContext,
  | "activeViewerTab"
  | "kitchenWorktopDraw"
  | "layoutTool"
  | "mirrorKitchenWorktopDraw"
  | "mode"
  | "S"
  | "sectionDraw"
  | "setUnderlayStatus"
  | "updateSectionDrawPreview"
  | "viewMode"
>;

type PlacementShortcutCommandContext = Pick<
  KeyboardInputHandlersContext,
  | "cancelDoorPlacement"
  | "cancelWindowPlacement"
  | "flipDoorPlacementSwingSide"
  | "isDoorPlacementActive"
  | "isWindowPlacementActive"
  | "rotateDoorPlacement"
> & Partial<Pick<KeyboardInputHandlersContext, "placement" | "placementHelpers" | "S">>;

type FloorEditEscapeCommandContext = Pick<
  KeyboardInputHandlersContext,
  "discardFloorBoundaryEdit" | "floorEdit" | "renderFloorBoundaryEdit"
>;

type ActivePlacementEscapeCommandContext = Pick<
  KeyboardInputHandlersContext,
  "cancelPlacement" | "placement" | "placementHelpers" | "S"
>;

type TransformEscapeCommandContext = Pick<KeyboardInputHandlersContext, "clearTransform" | "transformState">;

type TransformMoveSnapToggleCommandContext = Pick<
  KeyboardInputHandlersContext,
  | "drawSnapOverlay"
  | "hideHoverCursor"
  | "hudHoverLine"
  | "selectPlanSnap"
  | "setUnderlayStatus"
  | "transformState"
>;

type TransformRotateTypedAngleCommandContext = Pick<
  KeyboardInputHandlersContext,
  "applyRotateAngle" | "setUnderlayStatus" | "transformState"
>;

type TransformMoveTypedDistanceCommandContext = Pick<
  KeyboardInputHandlersContext,
  "applyMoveDelta" | "clearTransform" | "commitHistory" | "mountProps" | "S" | "setUnderlayStatus" | "transformState" | "wallTypedHud"
>;

type TransformMoveSelectElementsCommandContext = Pick<
  KeyboardInputHandlersContext,
  "startTransformFromSelection" | "transformState"
>;

type LayoutTransformKeyboardCommandContext = TransformEscapeCommandContext &
  TransformMoveSnapToggleCommandContext &
  TransformMoveSelectElementsCommandContext &
  TransformMoveTypedDistanceCommandContext &
  TransformRotateTypedAngleCommandContext;

type LayoutKeyboardCommandContext = ActivePlacementEscapeCommandContext &
  LayoutTransformKeyboardCommandContext &
  KeyboardMoveSelectionShortcutCommandContext &
  LayoutToolShortcutCommandContext &
  LayoutSpaceShortcutCommandContext &
  WallTypedLengthCommandContext &
  ClearSelectionShortcutCommandContext &
  DeleteSelectionShortcutCommandContext &
  Pick<KeyboardInputHandlersContext, "handleLayoutEscape" | "mode" | "viewMode">;

type KeyboardInputCommandContext = PlacementShortcutCommandContext &
  GlobalUndoRedoShortcutCommandContext &
  DrawingSpaceShortcutCommandContext &
  KitchenWorktopTypedInputCommandContext &
  FloorEditEscapeCommandContext &
  LayoutKeyboardCommandContext &
  Pick<
    KeyboardInputHandlersContext,
    | "cancelActiveViewerTool"
    | "floorEdit"
    | "handleCustomFurnitureEscape"
    | "handleGlobalMeasurementClear"
    | "isTypingTarget"
  >;

type KitchenWorktopTypedInputCommandContext = Pick<
  KeyboardInputHandlersContext,
  | "commitKitchenWorktopTypedLength"
  | "kitchenWorktopDraw"
  | "mode"
  | "S"
  | "setUnderlayStatus"
  | "viewMode"
  | "wallTypedHud"
>;

type WallTypedLengthCommandContext = Pick<
  KeyboardInputHandlersContext,
  | "addWall"
  | "autoJoinAtMmPoint"
  | "clearWallDrawState"
  | "drawSnapOverlay"
  | "hideHoverCursor"
  | "hudHoverLine"
  | "layoutTool"
  | "mountProps"
  | "selectPlanSnap"
  | "selectedKind"
  | "selectedWallId"
  | "setUnderlayStatus"
  | "updateWallMeshWithJustification"
  | "viewMode"
  | "wallDefault"
  | "wallDraw"
  | "wallTypedHud"
>;

export function handleGlobalUndoRedoShortcut(ctx: GlobalUndoRedoShortcutCommandContext, ev: KeyboardEvent) {
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return false;
  const key = ev.key.toLowerCase();
  if (key === "z") {
    const handled = ev.shiftKey ? ctx.customFurnitureMode?.redoActiveEdit?.() : ctx.customFurnitureMode?.undoActiveEdit?.();
    if (!handled) {
      if (ev.shiftKey) ctx.redo(ctx.S, ctx.helpers);
      else ctx.undo(ctx.S, ctx.helpers);
    }
  } else if (key === "y") {
    const handled = ctx.customFurnitureMode?.redoActiveEdit?.();
    if (!handled) ctx.redo(ctx.S, ctx.helpers);
  } else {
    return false;
  }
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();
  return true;
}

export function resolveKeyboardNudgeStepM(viewMode: "2d" | "3d", camera: THREE.Camera) {
  if (viewMode !== "2d") return 0;
  if (!(camera instanceof THREE.OrthographicCamera)) return 0;
  const visibleW = Math.abs(camera.right - camera.left) / Math.max(1e-6, camera.zoom);
  const visibleH = Math.abs(camera.top - camera.bottom) / Math.max(1e-6, camera.zoom);
  const visible = Math.min(visibleW, visibleH);
  if (visible >= 20) return 1;
  if (visible >= 12) return 0.5;
  if (visible >= 7) return 0.25;
  if (visible >= 4) return 0.1;
  if (visible >= 2) return 0.05;
  return 0.01;
}

export function resolveArrowNudgeDeltaM(key: string, stepM: number) {
  if (stepM <= 0) return null;
  if (key === "ArrowLeft") return { dx: -stepM, dz: 0 };
  if (key === "ArrowRight") return { dx: stepM, dz: 0 };
  if (key === "ArrowUp") return { dx: 0, dz: -stepM };
  if (key === "ArrowDown") return { dx: 0, dz: stepM };
  return null;
}

export function nudgeSelectedSectionByDeltaMm(args: {
  sections: SectionInstance[];
  selectedKind: SelectedKind;
  selectedSectionId: string | null;
  dxMm: number;
  dzMm: number;
  updateSectionVisual: (section: SectionInstance) => void;
}) {
  if (args.selectedKind !== "section" || !args.selectedSectionId) return false;
  const section = args.sections.find((item) => item.id === args.selectedSectionId) ?? null;
  if (!section) return false;
  section.params.aMm = { x: section.params.aMm.x + args.dxMm, z: section.params.aMm.z + args.dzMm };
  section.params.bMm = { x: section.params.bMm.x + args.dxMm, z: section.params.bMm.z + args.dzMm };
  args.updateSectionVisual(section);
  return true;
}

export function nudgeSelectedWallsByDeltaMm(args: {
  walls: WallInstance[];
  selectedKind: SelectedKind;
  selectedWallId: string | null;
  selectedWallIds: Set<string>;
  pinnedWallIds: Set<string>;
  wallJoinTolMm: number;
  dxMm: number;
  dzMm: number;
  wallEndpointWhich: (wall: WallInstance, point: { x: number; z: number }, tolMm: number) => "a" | "b" | null;
  rebuildWall: (wall: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
}) {
  const wallIds = resolveSelectedIds({
    selectedIds: args.selectedWallIds,
    selectedKind: args.selectedKind,
    selectedId: args.selectedWallId,
    singleKind: "wall"
  });
  if (wallIds.length === 0) return false;

  const touched = new Set<string>();
  const movedEnds = new Set<string>();
  const moveEnd = (wall: WallInstance, which: "a" | "b") => {
    const key = `${wall.id}:${which}`;
    if (movedEnds.has(key)) return;
    if (args.pinnedWallIds.has(wall.id)) return;
    if (which === "a") wall.params.aMm = { x: wall.params.aMm.x + args.dxMm, z: wall.params.aMm.z + args.dzMm };
    else wall.params.bMm = { x: wall.params.bMm.x + args.dxMm, z: wall.params.bMm.z + args.dzMm };
    movedEnds.add(key);
    touched.add(wall.id);
  };

  for (const id of wallIds) {
    const wall = args.walls.find((item) => item.id === id) ?? null;
    if (!wall) continue;
    if (args.pinnedWallIds.has(wall.id)) continue;

    const oldA = { x: wall.params.aMm.x, z: wall.params.aMm.z };
    const oldB = { x: wall.params.bMm.x, z: wall.params.bMm.z };

    moveEnd(wall, "a");
    moveEnd(wall, "b");

    for (const other of args.walls) {
      if (other.id === wall.id) continue;
      if (args.pinnedWallIds.has(other.id)) continue;
      const endpointAtA = args.wallEndpointWhich(other, oldA, args.wallJoinTolMm);
      if (endpointAtA) moveEnd(other, endpointAtA);
      const endpointAtB = args.wallEndpointWhich(other, oldB, args.wallJoinTolMm);
      if (endpointAtB) moveEnd(other, endpointAtB);
    }
  }

  for (const id of touched) {
    const wall = args.walls.find((item) => item.id === id) ?? null;
    if (wall) args.rebuildWall(wall);
  }
  if (touched.size === 0) return false;

  args.rebuildWallPlanMesh();
  return true;
}

export function nudgeSelectedModulesByDeltaMm(args: {
  instances: LayoutInstance[];
  selectedKind: SelectedKind;
  selectedInstanceId: string | null;
  selectedInstanceIds: Set<string>;
  dxMm: number;
  dzMm: number;
  findInstance: (id: string) => LayoutInstance | null;
  applyWallConstraints: (instance: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
  getKitchenPlacementConstraint: (
    instance: LayoutInstance,
    desired: THREE.Vector3
  ) => { position: THREE.Vector3; rotationY: number; kitchenPlacement?: LayoutInstance["kitchenPlacement"] } | null;
  snapPositionDetailed: (
    instance: LayoutInstance,
    desired: THREE.Vector3,
    opts?: { stickyNeighborId?: string | null; snapDistanceM?: number }
  ) => { position: THREE.Vector3 };
  anyOverlap: (instance: LayoutInstance, selectedId: string | null) => boolean;
  moduleOverlapsWalls: (instance: LayoutInstance) => boolean;
  moduleOverlapsKitchenWorktops: (instance: LayoutInstance) => boolean;
  autoOrientModuleToRoomWallIfSnapped: (instance: LayoutInstance) => void;
  nudgePinnedModuleChain: (instance: LayoutInstance, actualDelta: THREE.Vector3) => void;
  kitchenGroups: Array<{ id: string; ctx: { worktopBackOffsetMm: number } }>;
  defaultWorktopBackOffsetMm: number;
  inferKitchenPlacementBinding: (instance: LayoutInstance, kitchenGroupId: string, backOffsetMm: number) => LayoutInstance["kitchenPlacement"];
  syncKitchenRunEndClosures?: (groupId: string, backOffsetMm?: number) => boolean;
  updateLayoutPanel: () => void;
  alignLocks?: AppState["alignLocks"];
}) {
  const instanceIds = resolveSelectedIds({
    selectedIds: args.selectedInstanceIds,
    selectedKind: args.selectedKind,
    selectedId: args.selectedInstanceId,
    singleKind: "module"
  });
  if (instanceIds.length === 0) return false;
  if (hasLockedAlignModule(instanceIds, args.alignLocks)) return false;

  let moved = false;
  for (const id of instanceIds) {
    const instance = args.findInstance(id);
    if (!instance) continue;
    const prev = instance.root.position.clone();
    const prevRotationY = instance.root.rotation.y;
    const prevKitchenPlacement = instance.kitchenPlacement ? structuredClone(instance.kitchenPlacement) : null;
    const desired = new THREE.Vector3(
      instance.root.position.x + args.dxMm / 1000,
      instance.root.position.y,
      instance.root.position.z + args.dzMm / 1000
    );
    const desiredInRoom = args.applyWallConstraints(instance, desired);
    let desiredPlaced = desiredInRoom.clone();
    if (instanceIds.length === 1 && instance.kitchenGroupId) {
      const kitchenConstraint = args.getKitchenPlacementConstraint(instance, desiredInRoom);
      if (kitchenConstraint) {
        desiredPlaced.copy(kitchenConstraint.position);
        instance.root.rotation.y = kitchenConstraint.rotationY;
        instance.kitchenPlacement = kitchenConstraint.kitchenPlacement ?? prevKitchenPlacement;
      }
    }
    const snapped =
      instanceIds.length === 1
        ? args.snapPositionDetailed(instance, desiredPlaced, {
            stickyNeighborId: null,
            snapDistanceM: instance.kitchenGroupId ? SNAP_DISTANCE_M.kitchenKeyboardPlacement : undefined
          }).position
        : desiredPlaced;
    instance.root.position.copy(snapped);
    if (args.anyOverlap(instance, null) || args.moduleOverlapsWalls(instance) || args.moduleOverlapsKitchenWorktops(instance)) {
      instance.root.position.copy(prev);
      instance.root.rotation.y = prevRotationY;
      instance.kitchenPlacement = prevKitchenPlacement;
    } else {
      args.autoOrientModuleToRoomWallIfSnapped(instance);
      if (instanceIds.length === 1) {
        const actualDelta = instance.root.position.clone().sub(prev);
        args.nudgePinnedModuleChain(instance, actualDelta);
      }
      moved = true;
    }
  }

  if (!moved) return false;

  for (const movedInstance of args.instances) {
    refreshModuleKitchenPlacement({
      instance: movedInstance,
      kitchenGroups: args.kitchenGroups,
      defaultWorktopBackOffsetMm: args.defaultWorktopBackOffsetMm,
      inferKitchenPlacementBinding: args.inferKitchenPlacementBinding
    });
  }
  const affectedKitchenGroups = new Set(
    args.instances
      .map((instance) => instance.kitchenGroupId)
      .filter((groupId): groupId is string => typeof groupId === "string")
  );
  for (const groupId of affectedKitchenGroups) args.syncKitchenRunEndClosures?.(groupId);
  args.updateLayoutPanel();
  return true;
}

export function runKeyboardNudgeSelectionCommand(ctx: KeyboardNudgeSelectionCommandContext, dxM: number, dzM: number) {
  if (!canRunKeyboardNudgeSelectionCommand(ctx)) return false;

  const dxMm = Math.round(dxM * 1000);
  const dzMm = Math.round(dzM * 1000);

  let moved = false;
  const prevWalls = new Map<string, WallParams>();
  for (const wall of ctx.walls) prevWalls.set(wall.id, JSON.parse(JSON.stringify(wall.params)) as WallParams);
  const prevInstancePos = new Map<string, THREE.Vector3>();
  for (const instance of ctx.instances) prevInstancePos.set(instance.id, instance.root.position.clone());

  moved =
    nudgeSelectedWallsByDeltaMm({
      walls: ctx.walls,
      selectedKind: ctx.selectedKind,
      selectedWallId: ctx.selectedWallId,
      selectedWallIds: ctx.selectedWallIds,
      pinnedWallIds: ctx.pinnedWallIds,
      wallJoinTolMm: ctx.wallJoinTolMm,
      dxMm,
      dzMm,
      wallEndpointWhich: ctx.wallEndpointWhich,
      rebuildWall: ctx.rebuildWall,
      rebuildWallPlanMesh: ctx.rebuildWallPlanMesh
    }) || moved;

  moved =
    nudgeSelectedModulesByDeltaMm({
      instances: ctx.instances,
      selectedKind: ctx.selectedKind,
      selectedInstanceId: ctx.selectedInstanceId,
      selectedInstanceIds: ctx.selectedInstanceIds,
      dxMm,
      dzMm,
      findInstance: ctx.findInstance,
      applyWallConstraints: ctx.applyWallConstraints,
      getKitchenPlacementConstraint: ctx.getKitchenPlacementConstraint,
      snapPositionDetailed: ctx.snapPositionDetailed,
      anyOverlap: ctx.anyOverlap,
      moduleOverlapsWalls: ctx.moduleOverlapsWalls,
      moduleOverlapsKitchenWorktops: ctx.moduleOverlapsKitchenWorktops,
      autoOrientModuleToRoomWallIfSnapped: ctx.autoOrientModuleToRoomWallIfSnapped,
      nudgePinnedModuleChain: ctx.nudgePinnedModuleChain,
      kitchenGroups: ctx.S.kitchenGroups,
      defaultWorktopBackOffsetMm: ctx.S.kitchenCtx.worktopBackOffsetMm,
      inferKitchenPlacementBinding: ctx.inferKitchenPlacementBinding,
      syncKitchenRunEndClosures: ctx.syncKitchenRunEndClosures,
      updateLayoutPanel: ctx.updateLayoutPanel,
      alignLocks: ctx.S.alignLocks
    }) || moved;

  moved =
    nudgeSelectedSectionByDeltaMm({
      sections: ctx.sections,
      selectedKind: ctx.selectedKind,
      selectedSectionId: ctx.selectedSectionId,
      dxMm,
      dzMm,
      updateSectionVisual: ctx.updateSectionVisual
    }) || moved;

  const modulesInvalid = ctx.instances.some(
    (instance) =>
      !ctx.instanceFitsRoom(instance) ||
      ctx.anyOverlap(instance, null) ||
      ctx.moduleOverlapsWalls(instance) ||
      ctx.moduleOverlapsKitchenWorktops(instance)
  );

  if (modulesInvalid) {
    for (const wall of ctx.walls) {
      const params = prevWalls.get(wall.id);
      if (params) wall.params = JSON.parse(JSON.stringify(params)) as WallParams;
      ctx.rebuildWall(wall);
    }
    for (const instance of ctx.instances) {
      const prev = prevInstancePos.get(instance.id);
      if (!prev) continue;
      instance.root.position.copy(prev);
    }
    ctx.rebuildWallPlanMesh();
    ctx.updateLayoutPanel();
    ctx.mountProps();
    return false;
  }

  if (moved) {
    ctx.mountProps();
    ctx.commitHistory(ctx.S);
  }
  return moved;
}

export function canRunKeyboardNudgeSelectionCommand(ctx: KeyboardNudgeSelectionGuardContext) {
  if (ctx.viewMode !== "2d" || ctx.layoutTool !== "select") return false;
  if (ctx.measureState.enabled) return false;
  if (ctx.dragState.active || ctx.windowDragState.active || ctx.doorDragState?.active || ctx.wallEditHud.drag || ctx.marquee.active) {
    return false;
  }
  if (ctx.underlayCal.active) return false;
  return true;
}

export function resolveKeyboardMoveSelectionShortcutDeltaM(ctx: KeyboardMoveSelectionShortcutDeltaContext, key: string) {
  if (!key.startsWith("Arrow")) return null;
  return resolveArrowNudgeDeltaM(key, resolveKeyboardNudgeStepM(ctx.viewMode, ctx.cam()));
}

export function runKeyboardMoveSelectionShortcutCommand(
  ctx: KeyboardMoveSelectionShortcutCommandContext,
  ev: KeyboardEvent
) {
  const delta = resolveKeyboardMoveSelectionShortcutDeltaM(ctx, ev.key);
  if (!delta) return false;
  const moved = runKeyboardNudgeSelectionCommand(ctx, delta.dx, delta.dz);
  if (!moved) return false;
  ev.preventDefault();
  return true;
}

export function runLayoutToolShortcutCommand(ctx: LayoutToolShortcutCommandContext, ev: KeyboardShortcutLike) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
  const key = ev.key.toLowerCase();
  if (key === "m") return ctx.startTransformFromSelection("move", { sticky: true, toggle: true });
  if (key === "r") return ctx.startTransformFromSelection("rotate");
  if (key === "w") {
    ctx.setToolWall();
    return true;
  }
  if (key === "a") {
    ctx.setToolAlign();
    return true;
  }
  if (key === "t") {
    ctx.setToolTrim();
    return true;
  }
  return false;
}

export function runModuleSideMirrorShortcutCommand(ctx: ModuleSideMirrorShortcutCommandContext) {
  if (ctx.selectedKind !== "module" || !ctx.selectedInstanceId) return false;
  const inst = ctx.findInstance(ctx.selectedInstanceId);
  const side = (inst?.params as Record<string, unknown> | undefined)?.side;
  if (!inst || (side !== "left" && side !== "right")) return false;
  const previousParams = structuredClone(inst.params);
  const previousKitchenPlacement = inst.kitchenPlacement ? structuredClone(inst.kitchenPlacement) : null;
  (inst.params as Record<string, unknown>).side = side === "left" ? "right" : "left";
  const accepted = ctx.rebuildInstance(inst, {
    preserveBackAnchor: !!inst.kitchenPlacement,
    previousParams
  });
  if (accepted) {
    const binding = previousKitchenPlacement ?? inst.kitchenPlacement;
    if (inst.kitchenGroupId && binding && ctx.applyKitchenPlacementBinding) {
      const backOffsetMm = resolveKitchenPlacementBackOffset({
        kitchenGroupId: inst.kitchenGroupId,
        kitchenGroups: ctx.S.kitchenGroups,
        defaultWorktopBackOffsetMm: ctx.S.kitchenCtx.worktopBackOffsetMm
      });
      ctx.applyKitchenPlacementBinding(inst, binding, backOffsetMm);
    }
    ctx.commitHistory(ctx.S);
    ctx.mountProps();
    ctx.setUnderlayStatus(`Module: zrkadlene na ${(inst.params as Record<string, unknown>).side}. Space = druha strana.`);
  }
  return true;
}

export function runLayoutSpaceShortcutCommand(ctx: LayoutSpaceShortcutCommandContext) {
  if (ctx.layoutTool === "wall") {
    ctx.wallDefault.exteriorSign = ctx.wallDefault.exteriorSign === 1 ? -1 : 1;
    ctx.setUnderlayStatus(`Wall: exterior ${ctx.wallDefault.exteriorSign === 1 ? "left" : "right"} of A->B.`);
    if (ctx.wallDraw.preview && ctx.wallDraw.a) {
      ctx.updateWallMeshWithJustification(
        ctx.wallDraw.preview,
        ctx.wallDraw.a,
        ctx.wallDraw.hoverB ?? ctx.wallDraw.a,
        ctx.wallDefault.thicknessMm,
        ctx.wallDefault.justification,
        ctx.wallDefault.exteriorSign
      );
    }
    ctx.mountProps();
    return true;
  }

  if (ctx.selectedKind === "wall" && ctx.selectedWallId) {
    const wall = ctx.walls.find((item) => item.id === ctx.selectedWallId) ?? null;
    if (wall) {
      wall.params.exteriorSign = (wall.params.exteriorSign ?? 1) === 1 ? -1 : 1;
      for (const item of ctx.walls) ctx.rebuildWall(item);
      ctx.rebuildWallPlanMesh();
      ctx.mountProps();
    }
    return true;
  }

  if (runModuleSideMirrorShortcutCommand(ctx)) return true;

  ctx.setToolSelect();
  return true;
}

export function runDeleteSelectionShortcutCommand(ctx: DeleteSelectionShortcutCommandContext, ev: KeyboardKeyLike) {
  if (ev.key !== "Delete" && ev.key !== "Backspace") return false;
  return ctx.deleteSelected();
}

export function runClearSelectionShortcutCommand(ctx: ClearSelectionShortcutCommandContext, ev: KeyboardKeyLike) {
  if (ev.key !== "Escape") return false;
  ctx.clearSelection();
  return true;
}

export function runDrawingSpaceShortcutCommand(ctx: DrawingSpaceShortcutCommandContext, ev: KeyboardSpaceLike) {
  if (!isSpaceShortcut(ev)) return false;
  if (ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active && ctx.mode === "layout" && ctx.viewMode === "2d") {
    ctx.mirrorKitchenWorktopDraw();
    return true;
  }
  if (ctx.mode === "layout" && ctx.layoutTool === "section" && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan") {
    ctx.sectionDraw.mirrored = !ctx.sectionDraw.mirrored;
    ctx.updateSectionDrawPreview();
    ctx.setUnderlayStatus(`Section: smer ${ctx.sectionDraw.mirrored ? "mirrored" : "default"}.`);
    return true;
  }
  return false;
}

export function runPlacementShortcutCommand(
  ctx: PlacementShortcutCommandContext,
  ev: KeyboardSpaceLike & Pick<KeyboardEvent, "shiftKey">
) {
  if (ev.key === "Escape" && ctx.isDoorPlacementActive?.()) {
    ctx.cancelDoorPlacement?.();
    return true;
  }
  if (ev.key === "Escape" && ctx.isWindowPlacementActive?.()) {
    ctx.cancelWindowPlacement?.();
    return true;
  }
  if (isSpaceShortcut(ev) && ev.shiftKey && ctx.isDoorPlacementActive?.() && ctx.flipDoorPlacementSwingSide?.()) {
    return true;
  }
  if (isSpaceShortcut(ev) && ctx.isDoorPlacementActive?.() && ctx.rotateDoorPlacement?.()) {
    return true;
  }
  if (isSpaceShortcut(ev) && !ev.shiftKey && ctx.placement?.active && ctx.S && ctx.placementHelpers) {
    return rotateActivePlacement(ctx.S, ctx.placementHelpers);
  }
  return false;
}

export function runKitchenWorktopTypedInputCommand(ctx: KitchenWorktopTypedInputCommandContext, ev: KeyboardKeyLike) {
  if (!(ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active && ctx.mode === "layout" && ctx.viewMode === "2d")) {
    return false;
  }

  const worktopTypedInput = applyTypedMillimeterKey(ctx.kitchenWorktopDraw.typedMm, ev.key);
  if (worktopTypedInput.handled) {
    ctx.kitchenWorktopDraw.typedMm = worktopTypedInput.typedMm;
    if (ctx.kitchenWorktopDraw.typedMm.trim().length > 0) {
      updatePointerTypedHud(ctx.wallTypedHud, ctx.kitchenWorktopDraw.typedMm, ctx.kitchenWorktopDraw.lastPointerPx);
      ctx.setUnderlayStatus(`Worktop: ${ctx.kitchenWorktopDraw.typedMm} mm (Enter = add point, Backspace = edit, Esc = confirm)`);
    } else {
      updatePointerTypedHud(ctx.wallTypedHud, ctx.kitchenWorktopDraw.typedMm, ctx.kitchenWorktopDraw.lastPointerPx);
      ctx.setUnderlayStatus("Worktop: click points or type mm + Enter. Esc = confirm.");
    }
    return true;
  }

  if (ev.key === "Enter" && ctx.kitchenWorktopDraw.typedMm.trim().length > 0) {
    return ctx.commitKitchenWorktopTypedLength();
  }

  return false;
}

export function runWallTypedLengthCommand(ctx: WallTypedLengthCommandContext, ev: KeyboardKeyLike) {
  if (!(ctx.layoutTool === "wall" && ctx.wallDraw.active && ctx.wallDraw.a && ctx.viewMode === "2d")) {
    return false;
  }

  if (ev.key.toLowerCase() === "n") {
    ctx.wallDraw.freeMm = !ctx.wallDraw.freeMm;
    ctx.selectPlanSnap = null;
    ctx.drawSnapOverlay?.hide?.();
    ctx.hideHoverCursor?.();
    if (ctx.hudHoverLine) ctx.hudHoverLine.visible = false;
    ctx.setUnderlayStatus(
      ctx.wallDraw.freeMm
        ? "Wall: precision 1 mm. Ortho stays on, dashed guide visible, snaps only very close. N = normal guide snap."
        : "Wall: dashed alignment on. N = precision 1 mm near guide."
    );
    return true;
  }

  const wallTypedInput = applyTypedMillimeterKey(ctx.wallDraw.typedMm, ev.key);
  if (wallTypedInput.handled) {
    ctx.wallDraw.typedMm = wallTypedInput.typedMm;
    if (ctx.wallDraw.typedMm.trim().length > 0) {
      updatePointerTypedHud(ctx.wallTypedHud, ctx.wallDraw.typedMm, ctx.wallDraw.lastPointerPx);
      ctx.setUnderlayStatus(`Wall: ${ctx.wallDraw.typedMm} mm (Enter = place, Backspace = edit)`);
    } else {
      updatePointerTypedHud(ctx.wallTypedHud, ctx.wallDraw.typedMm, ctx.wallDraw.lastPointerPx);
      ctx.setUnderlayStatus("Wall: second point... (type mm + Enter, Shift = no axis snap, N = precision 1 mm, Esc = stop)");
    }
    return true;
  }

  if (ev.key === "Enter" && ctx.wallDraw.typedMm.trim().length > 0) {
    if (ctx.wallDraw.a) {
      const closeTolM = Math.max(0.03, Math.min(0.15, ctx.wallDefault.thicknessMm / 1000));
      const resolvedTypedEnd = resolveWallDrawTypedEndPoint({
        a: ctx.wallDraw.a,
        hoverB: ctx.wallDraw.hoverB,
        typedMm: ctx.wallDraw.typedMm,
        chainStart: ctx.wallDraw.chainStart,
        segments: ctx.wallDraw.segments,
        closeToleranceM: closeTolM
      });
      if (!resolvedTypedEnd) return false;

      const w = ctx.addWall(resolvedTypedEnd.a, resolvedTypedEnd.end, ctx.wallDefault.thicknessMm);
      if (!w) return true;
      finishWallDrawAfterAddedWall({
        wall: w,
        closes: resolvedTypedEnd.closes,
        wallDraw: ctx.wallDraw,
        wallDefault: ctx.wallDefault,
        wallTypedHud: ctx.wallTypedHud,
        clearTypedBeforeClose: true,
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
      return true;
    }
  }

  return false;
}

export function runFloorEditEscapeCommand(ctx: FloorEditEscapeCommandContext, ev: KeyboardKeyLike) {
  if (!ctx.floorEdit.active || ev.key !== "Escape") return false;
  if (ctx.floorEdit.first) {
    ctx.floorEdit.first = null;
    ctx.floorEdit.hover = null;
    ctx.renderFloorBoundaryEdit();
  } else {
    ctx.discardFloorBoundaryEdit();
  }
  return true;
}

export function runActivePlacementEscapeCommand(ctx: ActivePlacementEscapeCommandContext, ev: KeyboardKeyLike) {
  if (!ctx.placement.active || ev.key !== "Escape") return false;
  ctx.cancelPlacement(ctx.S, ctx.placementHelpers);
  return true;
}

export function runTransformEscapeCommand(ctx: TransformEscapeCommandContext, ev: KeyboardKeyLike) {
  if (!ctx.transformState.kind || ev.key !== "Escape") return false;
  ctx.clearTransform({ restore: true, status: "Canceled." });
  return true;
}

export function runTransformMoveSnapToggleCommand(ctx: TransformMoveSnapToggleCommandContext, ev: KeyboardShortcutLike) {
  if (ctx.transformState.kind !== "move" || (ev.key !== "n" && ev.key !== "N") || ev.ctrlKey || ev.metaKey || ev.altKey) {
    return false;
  }

  ctx.transformState.moveSnapDisabled = !ctx.transformState.moveSnapDisabled;
  ctx.selectPlanSnap = null;
  ctx.drawSnapOverlay?.hide?.();
  ctx.hideHoverCursor?.();
  if (ctx.hudHoverLine) ctx.hudHoverLine.visible = false;
  ctx.setUnderlayStatus(
    ctx.transformState.moveSnapDisabled
      ? "Move: free movement in 1 mm steps. Snapping off. N = snapping on."
      : ctx.transformState.step === "pickTarget"
        ? "Move: snapping on. Zvol cielovy bod, alebo namier smer a napis vzdialenost. N = free movement."
        : "Move: snapping on. N = free movement."
  );
  return true;
}

export function runTransformRotateTypedAngleCommand(ctx: TransformRotateTypedAngleCommandContext, ev: KeyboardKeyLike) {
  if (ctx.transformState.kind !== "rotate" || ctx.transformState.step !== "rotating") return false;

  const isDigit = ev.key.length === 1 && ev.key >= "0" && ev.key <= "9";
  if (isDigit) {
    ctx.transformState.typed = `${ctx.transformState.typed}${ev.key}`.slice(0, 6);
    ctx.setUnderlayStatus(`Rotate: ${ctx.transformState.typed} deg (Enter)`);
    return true;
  }

  if (ev.key === "Backspace") {
    ctx.transformState.typed = ctx.transformState.typed.slice(0, -1);
    ctx.setUnderlayStatus(ctx.transformState.typed.length ? `Rotate: ${ctx.transformState.typed} deg (Enter)` : "Rotate: move mouse for direction, or type degrees + Enter.");
    return true;
  }

  if (ev.key === "Enter" && ctx.transformState.typed.trim().length > 0) {
    const n = Number(ctx.transformState.typed.trim().replace(",", "."));
    if (Number.isFinite(n) && n !== 0) {
      const sign = ctx.transformState.lastAngleSign || 1;
      const ang = (Math.abs(n) * Math.PI) / 180 * sign;
      ctx.applyRotateAngle(ang);
      ctx.setUnderlayStatus(`Rotate: ${sign < 0 ? "CW" : "CCW"} ${Math.abs(Math.round(n))} deg (click to finish)`);
    }
    ctx.transformState.typed = "";
    return true;
  }

  return false;
}

export function runTransformMoveTypedDistanceCommand(ctx: TransformMoveTypedDistanceCommandContext, ev: KeyboardKeyLike) {
  if (ctx.transformState.kind !== "move" || ctx.transformState.step !== "pickTarget") return false;

  const updateMoveTypedHud = () =>
    updatePointerTypedHud(ctx.wallTypedHud, ctx.transformState.typed, ctx.transformState.lastPointerPx ?? { x: 0, y: 0 });
  const hideMoveTypedHud = () => updatePointerTypedHud(ctx.wallTypedHud, "", ctx.transformState.lastPointerPx ?? { x: 0, y: 0 });

  const isNumberChar = ev.key.length === 1 && ((ev.key >= "0" && ev.key <= "9") || ev.key === "," || ev.key === ".");
  if (isNumberChar) {
    const next = `${ctx.transformState.typed}${ev.key}`.replace(/,/g, ".");
    if (/^\d*\.?\d*$/.test(next)) {
      ctx.transformState.typed = next.slice(0, 8);
      updateMoveTypedHud();
      ctx.setUnderlayStatus(`Move: ${ctx.transformState.typed} mm (Enter)`);
    }
    return true;
  }

  if (ev.key === "Backspace") {
    ctx.transformState.typed = ctx.transformState.typed.slice(0, -1);
    updateMoveTypedHud();
    ctx.setUnderlayStatus(ctx.transformState.typed.length ? `Move: ${ctx.transformState.typed} mm (Enter)` : "Move: zvol cielovy bod, alebo namier smer a napis vzdialenost v mm.");
    return true;
  }

  if (ev.key === "Enter" && ctx.transformState.typed.trim().length > 0) {
    const distanceMm = Number(ctx.transformState.typed.trim().replace(",", "."));
    const direction = ctx.transformState.lastValidDelta.clone();
    if (!Number.isFinite(distanceMm) || distanceMm <= 0) {
      ctx.transformState.typed = "";
      hideMoveTypedHud();
      ctx.setUnderlayStatus("Move: type a positive distance in mm.");
      return true;
    }
    if (direction.lengthSq() < 1e-10) {
      ctx.setUnderlayStatus("Move: move mouse for direction, then type distance.");
      return true;
    }
    const requestedDelta = direction.normalize().multiplyScalar(distanceMm / 1000);
    const continueMove = !!ctx.transformState.stickyMove;
    ctx.applyMoveDelta(requestedDelta);
    if (ctx.transformState.lastValidDelta.distanceTo(requestedDelta) > 1e-6) {
      hideMoveTypedHud();
      ctx.clearTransform({
        restore: true,
        continueMove,
        status: continueMove ? "Move: blocked. Select next element, or click Move again to exit." : "Move: blocked."
      });
      ctx.mountProps();
      return true;
    }
    ctx.commitHistory(ctx.S);
    hideMoveTypedHud();
    ctx.clearTransform({
      continueMove,
      status: continueMove ? "Move: done. Select next element, or click Move again to exit." : "Move: done."
    });
    ctx.mountProps();
    return true;
  }

  return false;
}

export function runTransformMoveSelectElementsCommand(ctx: TransformMoveSelectElementsCommandContext, ev: KeyboardKeyLike) {
  if (ctx.transformState.kind !== "move" || ctx.transformState.step !== "selectElements" || ev.key !== "Enter") {
    return false;
  }
  ctx.startTransformFromSelection("move");
  return true;
}

export function runLayoutTransformKeyboardCommand(
  ctx: LayoutTransformKeyboardCommandContext,
  ev: KeyboardShortcutLike & Pick<KeyboardEvent, "preventDefault">
) {
  if (!ctx.transformState.kind) return false;

  if (runTransformEscapeCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (runTransformMoveSnapToggleCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (runTransformMoveSelectElementsCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (runTransformMoveTypedDistanceCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (runTransformRotateTypedAngleCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  return false;
}

export function runLayoutKeyboardCommand(ctx: LayoutKeyboardCommandContext, ev: KeyboardEvent) {
  if (ctx.mode !== "layout") return false;

  if (runActivePlacementEscapeCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (runLayoutTransformKeyboardCommand(ctx, ev)) {
    return true;
  }

  if (runKeyboardMoveSelectionShortcutCommand(ctx, ev)) {
    return true;
  }

  if (runLayoutToolShortcutCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (isSpaceShortcut(ev)) {
    runLayoutSpaceShortcutCommand(ctx);
    ev.preventDefault();
    return true;
  }

  if (ev.key === "Escape" && ctx.handleLayoutEscape(ev)) return true;

  if (runWallTypedLengthCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (runClearSelectionShortcutCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (runDeleteSelectionShortcutCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  return false;
}

export function runKeyboardInputCommand(ctx: KeyboardInputCommandContext, ev: KeyboardEvent) {
  // Native text controls own every key, including Escape and Undo/Redo. This
  // prevents an in-progress value from cancelling its enclosing editor tool.
  if (ctx.isTypingTarget(ev.target)) return false;

  if (ev.defaultPrevented) {
    if (isSpaceShortcut(ev)) {
      if (runPlacementShortcutCommand(ctx, ev)) {
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        return true;
      }
      if (runModuleSideMirrorShortcutCommand(ctx)) return true;
    }
    if (ev.key === "Escape") {
      if (runPlacementShortcutCommand(ctx, ev)) return true;
      if (runClearSelectionShortcutCommand(ctx, ev)) return true;
    }
    return true;
  }

  if (handleGlobalUndoRedoShortcut(ctx, ev)) return true;

  if (ev.key === "Delete" && runDeleteSelectionShortcutCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (ev.key === "Escape") {
    if (ctx.handleGlobalMeasurementClear(ev)) return true;
    if (ctx.handleCustomFurnitureEscape(ev)) return true;
    if (ctx.cancelActiveViewerTool()) {
      ev.preventDefault();
      ev.stopPropagation();
      return true;
    }
  }

  if (runPlacementShortcutCommand(ctx, ev)) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    return true;
  }

  if (runDrawingSpaceShortcutCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (runKitchenWorktopTypedInputCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (runLayoutTransformKeyboardCommand(ctx, ev)) {
    return true;
  }

  if (isSpaceShortcut(ev) && runModuleSideMirrorShortcutCommand(ctx)) {
    ev.preventDefault();
    return true;
  }

  if (ev.key === "Escape" && runClearSelectionShortcutCommand(ctx, ev)) {
    ev.preventDefault();
    return true;
  }

  if (ctx.S.kitchenEditMode) return true;

  if (ctx.floorEdit.active) {
    if (runFloorEditEscapeCommand(ctx, ev)) {
      ev.preventDefault();
    }
    return true;
  }

  return runLayoutKeyboardCommand(ctx, ev);
}

export function installKeyboardInputHandlers(ctx: KeyboardInputHandlersContext) {
  window.addEventListener("keydown", (ev) => {
    runKeyboardInputCommand(ctx, ev);
  });
}
