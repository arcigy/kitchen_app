import * as THREE from "three";
import type { DoorParams, LayoutInstance, SectionInstance, SelectedKind, WallInstance, WallParams, WindowParams } from "./localTypes";
import type { StartTransformOptions, TransformClearOptions, TransformKind, TransformState } from "./transformStateTypes";
import type { KitchenContext } from "../layout/kitchenContext";
import { refreshModuleKitchenPlacement } from "./moduleKitchenPlacement";
import { refreshSelectionHighlights, resolveSelectedIds } from "./selectionController";

type MmPoint = { x: number; z: number };
type OpeningInstance<TParams extends WindowParams | DoorParams> = { id: string; params: TParams };

export type TransformSelectionIds = {
  wallIds: string[];
  instIds: string[];
  sectionIds: string[];
  windowIds: string[];
  doorIds: string[];
};

export function resolveTransformSelectionIds(args: {
  kind: TransformKind;
  selectedWallIds: Set<string>;
  selectedInstanceIds: Set<string>;
  selectedKind: SelectedKind;
  selectedWallId: string | null;
  selectedInstanceId: string | null;
  selectedSectionId: string | null;
  windowInst?: { id: string } | null;
  doorInst?: { id: string } | null;
}): TransformSelectionIds {
  const wallIds = resolveSelectedIds({
    selectedIds: args.selectedWallIds,
    selectedKind: args.selectedKind,
    selectedId: args.selectedWallId,
    singleKind: "wall"
  });
  const instIds = resolveSelectedIds({
    selectedIds: args.selectedInstanceIds,
    selectedKind: args.selectedKind,
    selectedId: args.selectedInstanceId,
    singleKind: "module"
  });
  const sectionIds = args.selectedKind === "section" && args.selectedSectionId ? [args.selectedSectionId] : [];
  const windowIds = args.kind === "move" && args.selectedKind === "window" && args.windowInst ? [args.windowInst.id] : [];
  const doorIds = args.kind === "move" && args.selectedKind === "door" && args.doorInst ? [args.doorInst.id] : [];
  return { wallIds, instIds, sectionIds, windowIds, doorIds };
}

export function resolveMovedOpeningCenterMm(args: {
  delta: THREE.Vector3;
  start: WindowParams | DoorParams;
  wall: WallInstance | null;
}) {
  if (!args.start.wallId || !args.wall) return null;
  const ax = args.wall.params.aMm.x;
  const az = args.wall.params.aMm.z;
  const bx = args.wall.params.bMm.x;
  const bz = args.wall.params.bMm.z;
  const lengthMm = Math.hypot(bx - ax, bz - az);
  if (lengthMm < 1) return null;
  const dirX = (bx - ax) / lengthMm;
  const dirZ = (bz - az) / lengthMm;
  const alongMm = Math.round(args.delta.x * dirX * 1000 + args.delta.z * dirZ * 1000);
  const unclampedCenterMm = args.start.centerMm + alongMm;
  const halfWidthMm = Math.max(0, args.start.widthMm / 2);
  const minCenterMm = halfWidthMm;
  const maxCenterMm = lengthMm - halfWidthMm;
  return maxCenterMm >= minCenterMm
    ? Math.round(Math.min(maxCenterMm, Math.max(minCenterMm, unclampedCenterMm)))
    : Math.round(lengthMm / 2);
}

export function resolveMovedSectionParams(
  start: SectionInstance["params"],
  deltaMm: { dxMm: number; dzMm: number }
): SectionInstance["params"] {
  return {
    ...start,
    aMm: { x: start.aMm.x + deltaMm.dxMm, z: start.aMm.z + deltaMm.dzMm },
    bMm: { x: start.bMm.x + deltaMm.dxMm, z: start.bMm.z + deltaMm.dzMm }
  };
}

export function isTransformModuleMoveValid(args: {
  instances: LayoutInstance[];
  selectedInstanceIds: string[];
  ignoreIds: Set<string>;
  findInstance: (id: string) => LayoutInstance | null | undefined;
  instanceFitsRoom: (instance: LayoutInstance) => boolean;
  anyOverlapIgnoring: (instance: LayoutInstance, ignoreIds: Set<string>) => boolean;
  anyOverlap: (instance: LayoutInstance, selectedId: string | null) => boolean;
  moduleOverlapsWalls: (instance: LayoutInstance) => boolean;
  moduleOverlapsKitchenWorktops: (instance: LayoutInstance) => boolean;
}) {
  for (const id of args.selectedInstanceIds) {
    const inst = args.findInstance(id);
    if (!inst) continue;
    const inRoom = args.instanceFitsRoom(inst);
    const overlaps = args.anyOverlapIgnoring(inst, args.ignoreIds);
    if (!inRoom || overlaps || args.moduleOverlapsWalls(inst) || args.moduleOverlapsKitchenWorktops(inst)) return false;
  }

  for (const inst of args.instances) {
    if (
      !args.instanceFitsRoom(inst) ||
      args.anyOverlap(inst, null) ||
      args.moduleOverlapsWalls(inst) ||
      args.moduleOverlapsKitchenWorktops(inst)
    ) {
      return false;
    }
  }

  return true;
}

export function updateMovedModuleKitchenPlacements(args: {
  selectedInstanceIds: string[];
  kitchenCtx: KitchenContext;
  kitchenGroups: Array<{ id: string; ctx: KitchenContext }>;
  findInstance: (id: string) => LayoutInstance | null | undefined;
  inferKitchenPlacementBinding: (
    instance: LayoutInstance,
    kitchenGroupId: string,
    backOffsetMm: number
  ) => LayoutInstance["kitchenPlacement"];
}) {
  for (const id of args.selectedInstanceIds) {
    const inst = args.findInstance(id);
    if (!inst) continue;
    refreshModuleKitchenPlacement({
      instance: inst,
      kitchenGroups: args.kitchenGroups,
      defaultWorktopBackOffsetMm: args.kitchenCtx.worktopBackOffsetMm,
      inferKitchenPlacementBinding: args.inferKitchenPlacementBinding
    });
  }
}

export function resetTransformStateForClear(transformState: TransformState) {
  transformState.kind = null;
  transformState.step = null;
  transformState.stickyMove = false;
  transformState.moveSnapDisabled = false;
  transformState.base = null;
  transformState.pivot = null;
  transformState.typed = "";
  transformState.lastAngleSign = 1;
  transformState.selectedWallIds = [];
  transformState.selectedInstanceIds = [];
  transformState.selectedSectionIds = [];
  transformState.selectedWindowIds = [];
  transformState.selectedDoorIds = [];
  transformState.startWalls.clear();
  transformState.startInstances.clear();
  transformState.startInstanceAdjacency.clear();
  transformState.startSections.clear();
  transformState.startWindows.clear();
  transformState.startDoors.clear();
  transformState.startPointerAngle = 0;
  transformState.lastValidDelta.set(0, 0, 0);
  transformState.lastValidAngle = 0;
}

export type TransformStartGuardContext = Pick<
  TransformControllerContext,
  | "mode"
  | "viewMode"
  | "layoutTool"
  | "measureState"
  | "dragState"
  | "windowDragState"
  | "doorDragState"
  | "wallEditHud"
  | "marquee"
  | "underlayCal"
>;

export function canStartTransformFromSelection(ctx: TransformStartGuardContext) {
  if (ctx.mode !== "layout" || ctx.viewMode !== "2d" || ctx.layoutTool !== "select") return false;
  if (ctx.measureState.enabled) return false;
  if (ctx.dragState.active || ctx.windowDragState.active || ctx.doorDragState?.active || ctx.wallEditHud.drag || ctx.marquee.active) return false;
  if (ctx.underlayCal.active) return false;
  return true;
}

export type TransformStartSnapshotContext = Pick<
  TransformControllerContext,
  | "walls"
  | "instances"
  | "sections"
  | "windows"
  | "doors"
  | "transformState"
  | "instanceWorldBox"
  | "detectModuleAdjacency"
  | "cloneSectionParams"
>;

export function captureTransformStartState(ctx: TransformStartSnapshotContext, selectedInstanceIds: string[]) {
  for (const w of ctx.walls) ctx.transformState.startWalls.set(w.id, JSON.parse(JSON.stringify(w.params)) as WallParams);
  for (const inst of ctx.instances) ctx.transformState.startInstances.set(inst.id, { pos: inst.root.position.clone(), rotY: inst.root.rotation.y });
  for (const inst of ctx.instances) {
    if (!selectedInstanceIds.includes(inst.id)) continue;
    const box = ctx.instanceWorldBox(inst);
    let neighborId: string | null = null;
    for (const other of ctx.instances) {
      if (other.id === inst.id) continue;
      if (inst.kitchenGroupId && other.kitchenGroupId !== inst.kitchenGroupId) continue;
      const link = ctx.detectModuleAdjacency(box, ctx.instanceWorldBox(other), other.id);
      if (link) {
        neighborId = other.id;
        break;
      }
    }
    ctx.transformState.startInstanceAdjacency.set(inst.id, neighborId);
  }
  for (const section of ctx.sections) ctx.transformState.startSections.set(section.id, ctx.cloneSectionParams(section.params));
  for (const window of ctx.windows ?? []) ctx.transformState.startWindows.set(window.id, JSON.parse(JSON.stringify(window.params)) as WindowParams);
  for (const door of ctx.doors ?? []) ctx.transformState.startDoors.set(door.id, JSON.parse(JSON.stringify(door.params)) as DoorParams);
}

export type TransformControllerContext = {
  walls: WallInstance[];
  instances: LayoutInstance[];
  sections: SectionInstance[];
  windows?: Array<OpeningInstance<WindowParams>>;
  doors?: Array<OpeningInstance<DoorParams>>;
  S: {
    kitchenCtx: KitchenContext;
    kitchenGroups: Array<{ id: string; ctx: KitchenContext }>;
  };
  mode: "build" | "layout";
  viewMode: "2d" | "3d";
  layoutTool: string;
  measureState: { enabled: boolean };
  dragState: { active: boolean };
  windowDragState: { active: boolean };
  doorDragState?: { active: boolean };
  wallEditHud: { drag: unknown };
  marquee: { active: boolean };
  underlayCal: { active: boolean };
  selectedWallIds: Set<string>;
  selectedInstanceIds: Set<string>;
  selectedKind: SelectedKind;
  selectedWallId: string | null;
  selectedInstanceId: string | null;
  selectedSectionId: string | null;
  windowInst?: OpeningInstance<WindowParams> | null;
  doorInst?: OpeningInstance<DoorParams> | null;
  pinnedWallIds: Set<string>;
  wallJoinTolMm: number;
  transformState: TransformState;
  setUnderlayStatus: (message: string) => void;
  mountProps: () => void;
  rebuildWall: (wall: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
  updateLayoutPanel: () => void;
  updateSelectionHighlights: () => void;
  cloneSectionParams: (params: SectionInstance["params"]) => SectionInstance["params"];
  updateSectionVisual: (section: SectionInstance) => void;
  updateWindowTransform(window: OpeningInstance<WindowParams>): void;
  updateDoorTransform(door: OpeningInstance<DoorParams>): void;
  instanceWorldBox: (instance: LayoutInstance) => THREE.Box3;
  detectModuleAdjacency: (box: THREE.Box3, otherBox: THREE.Box3, otherId: string) => unknown;
  mmDist: (a: MmPoint, b: MmPoint) => number;
  findInstance: (id: string) => LayoutInstance | null | undefined;
  applyWallConstraints: (instance: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
  snapPositionDetailed: (
    instance: LayoutInstance,
    desired: THREE.Vector3,
    opts: { ignoreIds?: Set<string>; stickyNeighborId?: string | null }
  ) => { position: THREE.Vector3 };
  autoOrientModuleToRoomWallIfSnapped: (instance: LayoutInstance, ignoreIds?: Set<string>) => void;
  nudgePinnedModuleChain: (instance: LayoutInstance, delta: THREE.Vector3) => void;
  instanceFitsRoom: (instance: LayoutInstance) => boolean;
  anyOverlapIgnoring: (instance: LayoutInstance, ignoreIds: Set<string>) => boolean;
  anyOverlap: (instance: LayoutInstance, selectedId: string | null) => boolean;
  moduleOverlapsWalls: (instance: LayoutInstance) => boolean;
  moduleOverlapsKitchenWorktops: (instance: LayoutInstance) => boolean;
  inferKitchenPlacementBinding: (
    instance: LayoutInstance,
    kitchenGroupId: string,
    backOffsetMm: number
  ) => LayoutInstance["kitchenPlacement"];
  fromMmPoint: (point: MmPoint) => THREE.Vector3;
  toMmPoint: (point: THREE.Vector3) => MmPoint;
};

export function createTransformController(ctx: TransformControllerContext) {
  const clearTransform = (opts?: TransformClearOptions) => {
    const preserveMoveSnapDisabled =
      !!opts?.continueMove && ctx.transformState.kind === "move" && !!ctx.transformState.moveSnapDisabled;

    if (opts?.restore) {
      restoreTransformStartState();
      ctx.updateLayoutPanel();
      refreshSelectionHighlights(ctx);
      ctx.mountProps();
    }

    resetTransformStateForClear(ctx.transformState);

    if (opts?.continueMove) {
      ctx.transformState.kind = "move";
      ctx.transformState.step = "selectElements";
      ctx.transformState.stickyMove = true;
      ctx.transformState.moveSnapDisabled = preserveMoveSnapDisabled;
    }

    const status = opts?.status ?? (opts?.continueMove ? "Move: select next element. Click Move again to exit." : null);
    if (status) ctx.setUnderlayStatus(status);
  };

  const startTransformFromSelection = (kind: TransformKind, opts: StartTransformOptions = {}) => {
    if (kind === "move" && opts.toggle && ctx.transformState.kind === "move" && ctx.transformState.stickyMove) {
      const restore = ctx.transformState.step === "pickTarget" && !!ctx.transformState.base;
      clearTransform({ restore, status: "Move: off." });
      ctx.mountProps();
      return true;
    }

    if (!canStartTransformFromSelection(ctx)) return false;

    const stickyMove = kind === "move" && (opts.sticky ?? ctx.transformState.stickyMove);
    const moveSnapDisabled = kind === "move" && ctx.transformState.kind === "move" && !!ctx.transformState.moveSnapDisabled;

    const { wallIds, instIds, sectionIds, windowIds, doorIds } = resolveTransformSelectionIds({
      kind,
      selectedWallIds: ctx.selectedWallIds,
      selectedInstanceIds: ctx.selectedInstanceIds,
      selectedKind: ctx.selectedKind,
      selectedWallId: ctx.selectedWallId,
      selectedInstanceId: ctx.selectedInstanceId,
      selectedSectionId: ctx.selectedSectionId,
      windowInst: ctx.windowInst,
      doorInst: ctx.doorInst
    });
    if (kind === "rotate" && sectionIds.length > 0 && wallIds.length + instIds.length === 0) return false;
    if (wallIds.length + instIds.length + sectionIds.length + windowIds.length + doorIds.length === 0) {
      if (kind !== "move") return false;
      clearTransform();
      ctx.transformState.kind = "move";
      ctx.transformState.step = "selectElements";
      ctx.transformState.stickyMove = stickyMove;
      ctx.transformState.moveSnapDisabled = moveSnapDisabled;
      ctx.setUnderlayStatus(
        stickyMove ? "Move: select element to move. Click Move again to exit. N = free movement." : "Move (M): select elements, then press Enter. N = free movement."
      );
      ctx.mountProps();
      return true;
    }

    clearTransform();
    ctx.transformState.kind = kind;
    ctx.transformState.step = kind === "move" ? "pickBase" : "pickPivot";
    ctx.transformState.stickyMove = stickyMove;
    ctx.transformState.moveSnapDisabled = moveSnapDisabled;
    ctx.transformState.selectedWallIds = wallIds;
    ctx.transformState.selectedInstanceIds = instIds;
    ctx.transformState.selectedSectionIds = sectionIds;
    ctx.transformState.selectedWindowIds = windowIds;
    ctx.transformState.selectedDoorIds = doorIds;

    captureTransformStartState(ctx, instIds);

    ctx.setUnderlayStatus(kind === "move" ? "Move (M): click base point. N = free movement." : "Rotate (R): click pivot point...");
    ctx.mountProps();
    return true;
  };

  const restoreTransformStartState = () => {
    for (const w of ctx.walls) {
      const p = ctx.transformState.startWalls.get(w.id);
      if (p) w.params = JSON.parse(JSON.stringify(p)) as WallParams;
      ctx.rebuildWall(w);
    }
    ctx.rebuildWallPlanMesh();
    for (const inst of ctx.instances) {
      const s = ctx.transformState.startInstances.get(inst.id);
      if (s) {
        inst.root.position.copy(s.pos);
        inst.root.rotation.y = s.rotY;
      }
    }
    for (const section of ctx.sections) {
      const s = ctx.transformState.startSections.get(section.id);
      if (!s) continue;
      section.params = ctx.cloneSectionParams(s);
      ctx.updateSectionVisual(section);
    }
    for (const window of ctx.windows ?? []) {
      const s = ctx.transformState.startWindows.get(window.id);
      if (!s) continue;
      window.params = JSON.parse(JSON.stringify(s)) as WindowParams;
      ctx.updateWindowTransform(window);
    }
    for (const door of ctx.doors ?? []) {
      const s = ctx.transformState.startDoors.get(door.id);
      if (!s) continue;
      door.params = JSON.parse(JSON.stringify(s)) as DoorParams;
      ctx.updateDoorTransform(door);
    }
  };

  const translateWallsByAnchors = (dxMm: number, dzMm: number) => {
    const anchors: Array<{ x: number; z: number }> = [];
    for (const id of ctx.transformState.selectedWallIds) {
      const p = ctx.transformState.startWalls.get(id);
      if (!p) continue;
      anchors.push({ x: p.aMm.x, z: p.aMm.z }, { x: p.bMm.x, z: p.bMm.z });
    }
    if (anchors.length === 0) return;

    const matchAnchor = (p: { x: number; z: number }) => anchors.some((a) => ctx.mmDist(a, p) <= ctx.wallJoinTolMm);
    const touched = new Set<string>();
    for (const w of ctx.walls) {
      if (ctx.pinnedWallIds.has(w.id)) continue;
      let changed = false;
      if (matchAnchor(w.params.aMm)) {
        w.params.aMm = { x: w.params.aMm.x + dxMm, z: w.params.aMm.z + dzMm };
        changed = true;
      }
      if (matchAnchor(w.params.bMm)) {
        w.params.bMm = { x: w.params.bMm.x + dxMm, z: w.params.bMm.z + dzMm };
        changed = true;
      }
      if (changed) touched.add(w.id);
    }
    for (const id of touched) {
      const w = ctx.walls.find((x) => x.id === id) ?? null;
      if (w) ctx.rebuildWall(w);
    }
    if (touched.size > 0) ctx.rebuildWallPlanMesh();
  };

  const applyMoveDelta = (delta: THREE.Vector3) => {
    restoreTransformStartState();

    const dxMm = Math.round(delta.x * 1000);
    const dzMm = Math.round(delta.z * 1000);

    if (dxMm !== 0 || dzMm !== 0) {
      translateWallsByAnchors(dxMm, dzMm);
    }

    const moveOpeningAlongHostWall = (params: WindowParams | DoorParams, start: WindowParams | DoorParams) => {
      const wall = ctx.walls.find((item: WallInstance) => item.id === start.wallId) ?? null;
      const centerMm = resolveMovedOpeningCenterMm({ delta, start, wall });
      if (centerMm === null) return false;
      params.centerMm = centerMm;
      return true;
    };

    for (const id of ctx.transformState.selectedWindowIds) {
      const window = (ctx.windows ?? []).find((item: { id: string }) => item.id === id) ?? null;
      const start = ctx.transformState.startWindows.get(id);
      if (!window || !start) continue;
      window.params = JSON.parse(JSON.stringify(start)) as WindowParams;
      if (moveOpeningAlongHostWall(window.params, start)) ctx.updateWindowTransform(window);
    }

    for (const id of ctx.transformState.selectedDoorIds) {
      const door = (ctx.doors ?? []).find((item: { id: string }) => item.id === id) ?? null;
      const start = ctx.transformState.startDoors.get(id);
      if (!door || !start) continue;
      door.params = JSON.parse(JSON.stringify(start)) as DoorParams;
      if (moveOpeningAlongHostWall(door.params, start)) ctx.updateDoorTransform(door);
    }

    for (const id of ctx.transformState.selectedSectionIds) {
      const section = ctx.sections.find((item) => item.id === id) ?? null;
      const start = ctx.transformState.startSections.get(id);
      if (!section || !start) continue;
      section.params = resolveMovedSectionParams(start, { dxMm, dzMm });
      ctx.updateSectionVisual(section);
    }

    const ignore = new Set<string>(ctx.transformState.selectedInstanceIds);

    const moveSelectedModulesByDelta = (moduleDelta: THREE.Vector3) => {
      for (const id of ctx.transformState.selectedInstanceIds) {
        const inst = ctx.findInstance(id);
        const st = ctx.transformState.startInstances.get(id);
        if (!inst || !st) continue;
        const desired = st.pos.clone().add(moduleDelta);
        const desiredInRoom = ctx.applyWallConstraints(inst, desired);
        const snapped =
          ctx.transformState.selectedInstanceIds.length === 1
            ? ctx.snapPositionDetailed(inst, desiredInRoom, {
                ignoreIds: ignore,
                stickyNeighborId: ctx.transformState.startInstanceAdjacency.get(id) ?? null
              }).position
            : desiredInRoom;
        inst.root.position.copy(snapped);
        ctx.autoOrientModuleToRoomWallIfSnapped(inst, ignore);
        if (ctx.transformState.selectedInstanceIds.length === 1) {
          const actualDelta = inst.root.position.clone().sub(st.pos);
          ctx.nudgePinnedModuleChain(inst, actualDelta);
        }
      }
    };

    // Move modules as a group (no module-to-module snapping here; target snapping comes from cursor snap).
    moveSelectedModulesByDelta(delta);
    const ok = isTransformModuleMoveValid({
      instances: ctx.instances,
      selectedInstanceIds: ctx.transformState.selectedInstanceIds,
      ignoreIds: ignore,
      findInstance: ctx.findInstance,
      instanceFitsRoom: ctx.instanceFitsRoom,
      anyOverlapIgnoring: ctx.anyOverlapIgnoring,
      anyOverlap: ctx.anyOverlap,
      moduleOverlapsWalls: ctx.moduleOverlapsWalls,
      moduleOverlapsKitchenWorktops: ctx.moduleOverlapsKitchenWorktops
    });

    if (ok) {
      updateMovedModuleKitchenPlacements({
        selectedInstanceIds: ctx.transformState.selectedInstanceIds,
        kitchenCtx: ctx.S.kitchenCtx,
        kitchenGroups: ctx.S.kitchenGroups,
        findInstance: ctx.findInstance,
        inferKitchenPlacementBinding: ctx.inferKitchenPlacementBinding
      });
      ctx.transformState.lastValidDelta.copy(delta);
      ctx.updateLayoutPanel();
    } else {
      restoreTransformStartState();
      const d = ctx.transformState.lastValidDelta;
      const dxMm2 = Math.round(d.x * 1000);
      const dzMm2 = Math.round(d.z * 1000);
      if (dxMm2 !== 0 || dzMm2 !== 0) translateWallsByAnchors(dxMm2, dzMm2);
      moveSelectedModulesByDelta(d);
      ctx.updateLayoutPanel();
    }
  };

  const rotatePointAround = (p: THREE.Vector3, pivot: THREE.Vector3, ang: number) => {
    const dx = p.x - pivot.x;
    const dz = p.z - pivot.z;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return new THREE.Vector3(pivot.x + dx * c - dz * s, 0, pivot.z + dx * s + dz * c);
  };

  const rotateWallsByAnchors = (pivot: THREE.Vector3, ang: number) => {
    const anchors: Array<{ old: { x: number; z: number }; next: { x: number; z: number } }> = [];
    for (const id of ctx.transformState.selectedWallIds) {
      const p = ctx.transformState.startWalls.get(id);
      if (!p) continue;
      const a = ctx.fromMmPoint(p.aMm);
      const b = ctx.fromMmPoint(p.bMm);
      const na = rotatePointAround(a, pivot, ang);
      const nb = rotatePointAround(b, pivot, ang);
      anchors.push(
        { old: { x: p.aMm.x, z: p.aMm.z }, next: ctx.toMmPoint(na) },
        { old: { x: p.bMm.x, z: p.bMm.z }, next: ctx.toMmPoint(nb) }
      );
    }
    if (anchors.length === 0) return;

    const mapEnd = (p: { x: number; z: number }) => {
      for (const a of anchors) if (ctx.mmDist(a.old, p) <= ctx.wallJoinTolMm) return a.next;
      return null;
    };

    const touched = new Set<string>();
    for (const w of ctx.walls) {
      if (ctx.pinnedWallIds.has(w.id)) continue;
      const na = mapEnd(w.params.aMm);
      const nb = mapEnd(w.params.bMm);
      if (na) {
        w.params.aMm = { x: na.x, z: na.z };
        touched.add(w.id);
      }
      if (nb) {
        w.params.bMm = { x: nb.x, z: nb.z };
        touched.add(w.id);
      }
    }
    for (const id of touched) {
      const w = ctx.walls.find((x) => x.id === id) ?? null;
      if (w) ctx.rebuildWall(w);
    }
    if (touched.size > 0) ctx.rebuildWallPlanMesh();
  };

  const applyRotateAngle = (ang: number) => {
    const pivot = ctx.transformState.pivot;
    if (!pivot) return;
    restoreTransformStartState();

    rotateWallsByAnchors(pivot, ang);

    const ignore = new Set<string>(ctx.transformState.selectedInstanceIds);
    let ok = true;

    for (const id of ctx.transformState.selectedInstanceIds) {
      const inst = ctx.findInstance(id);
      const st = ctx.transformState.startInstances.get(id);
      if (!inst || !st) continue;
      const nextPos = rotatePointAround(st.pos, pivot, ang);
      inst.root.rotation.y = st.rotY + ang;
      inst.root.position.copy(ctx.applyWallConstraints(inst, nextPos));
    }

    for (const id of ctx.transformState.selectedInstanceIds) {
      const inst = ctx.findInstance(id);
      if (!inst) continue;
      const inRoom = ctx.instanceFitsRoom(inst);
      const overlaps = ctx.anyOverlapIgnoring(inst, ignore);
      if (!inRoom || overlaps || ctx.moduleOverlapsWalls(inst) || ctx.moduleOverlapsKitchenWorktops(inst)) {
        ok = false;
        break;
      }
    }

    // Also block rotating walls into any existing module.
    if (ok) {
      for (const inst of ctx.instances) {
        if (ctx.moduleOverlapsWalls(inst)) {
          ok = false;
          break;
        }
      }
    }

    if (ok) {
      ctx.transformState.lastValidAngle = ang;
      ctx.updateLayoutPanel();
    } else {
      // Keep last valid
      restoreTransformStartState();
      rotateWallsByAnchors(pivot, ctx.transformState.lastValidAngle);
      for (const id of ctx.transformState.selectedInstanceIds) {
        const inst = ctx.findInstance(id);
        const st = ctx.transformState.startInstances.get(id);
        if (!inst || !st) continue;
        const nextPos = rotatePointAround(st.pos, pivot, ctx.transformState.lastValidAngle);
        inst.root.rotation.y = st.rotY + ctx.transformState.lastValidAngle;
        inst.root.position.copy(ctx.applyWallConstraints(inst, nextPos));
      }
      ctx.updateLayoutPanel();
    }
  };

  return { clearTransform, startTransformFromSelection, restoreTransformStartState, translateWallsByAnchors, applyMoveDelta, rotatePointAround, rotateWallsByAnchors, applyRotateAngle };
}
