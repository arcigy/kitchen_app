import * as THREE from "three";
import { worldToScreen } from "./sharedUtils";
import type { PlanSnapResult } from "./planSnap";
import type {
  ColumnInstance,
  DoorInstance,
  FloorInstance,
  KitchenWorktopInstance,
  LayoutInstance,
  SectionInstance,
  WallInstance,
  WindowInstance
} from "./localTypes";
import {
  ensurePickAndOutline as ensurePickAndOutlineBase,
  getInstanceGeometryMeshes as getInstanceGeometryMeshesBase,
  instanceLayoutWorldBox as instanceLayoutWorldBoxBase
} from "./moduleVisualGeometry";

type RoomBounds = {
  halfW: number;
  halfD: number;
};

type LayoutSceneQueriesContext = {
  instances: LayoutInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  walls: WallInstance[];
  columns: ColumnInstance[];
  floors: FloorInstance[];
  sections: SectionInstance[];
  roomBounds: RoomBounds;
  getWindowInst: () => WindowInstance | null;
  getWindowInsts: () => WindowInstance[];
  getDoorInst: () => DoorInstance | null;
  getDoorInsts: () => DoorInstance[];
  getViewMode: () => "2d" | "3d";
  getActiveViewerTab: () => string;
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3;
};

export function createLayoutSceneQueries(ctx: LayoutSceneQueriesContext) {
  const findInstance = (id: string) => ctx.instances.find((x) => x.id === id) ?? null;

  const instanceLayoutWorldBox = (inst: LayoutInstance) =>
    instanceLayoutWorldBoxBase(inst, ctx.getModuleLocalBackCenter);

  const instanceWorldBox = (inst: LayoutInstance) => instanceLayoutWorldBox(inst);

  const roomContainsBoxXZ = (box: THREE.Box3, eps = 0.0005) => (
    box.min.x >= -ctx.roomBounds.halfW - eps &&
    box.max.x <= ctx.roomBounds.halfW + eps &&
    box.min.z >= -ctx.roomBounds.halfD - eps &&
    box.max.z <= ctx.roomBounds.halfD + eps
  );

  const instanceFitsRoom = (inst: LayoutInstance) => roomContainsBoxXZ(instanceLayoutWorldBox(inst));

  const instanceFitsLayoutBounds = (inst: LayoutInstance) => {
    if (inst.kitchenGroupId) return true;
    return instanceFitsRoom(inst);
  };

  const ensurePickAndOutline = (
    inst: LayoutInstance,
    flattenToPlan = ctx.getViewMode() === "2d" && ctx.getActiveViewerTab() === "floorplan"
  ) => {
    ensurePickAndOutlineBase(inst, {
      flattenToPlan,
      viewMode: ctx.getViewMode(),
      getModuleLocalBackCenter: ctx.getModuleLocalBackCenter
    });
  };

  const getInstanceGeometryMeshes = (inst: LayoutInstance) =>
    getInstanceGeometryMeshesBase(
      inst,
      ctx.getViewMode() === "2d" && ctx.getActiveViewerTab() === "floorplan" ? "2d" : "3d"
    );

  const getAllInstanceGeometryMeshes = () => ctx.instances.flatMap((inst) => getInstanceGeometryMeshes(inst));

  const getKitchenWorktopGeometryMeshes = () =>
    ctx.kitchenWorktops.flatMap((worktop) => (worktop.mesh.visible ? [worktop.mesh] : []));

  const getInstanceIdFromObject = (obj: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.instanceId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  };

  const getWorktopIdFromObject = (obj: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.worktopId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  };

  const getSectionIdFromObject = (obj: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.sectionId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  };

  const getColumnIdFromObject = (obj: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.columnId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
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

  const getDoorIdFromObject = (obj: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.doorId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  };

  const getMeasure3DSnapTargetObject = (obj: THREE.Object3D | null | undefined) => {
    if (!obj) return null;
    const instanceId = getInstanceIdFromObject(obj);
    if (instanceId) {
      const inst = findInstance(instanceId);
      if (inst) return inst.module;
    }

    const worktopId = getWorktopIdFromObject(obj);
    if (worktopId) {
      const worktop = ctx.kitchenWorktops.find((item) => item.id === worktopId) ?? null;
      if (worktop) return worktop.mesh;
    }

    const kind = obj.userData?.kind as string | undefined;
    const columnId = getColumnIdFromObject(obj);
    if (kind === "column" || columnId) {
      const column = ctx.columns.find((item) => item.id === columnId) ?? null;
      if (column) return column.mesh;
    }

    const windowId = getWindowIdFromObject(obj);
    if (kind === "window" || windowId) {
      const windowInst = ctx.getWindowInsts().find((item) => item.id === windowId) ?? ctx.getWindowInst();
      if (windowInst) return windowInst.root;
    }

    const doorId = getDoorIdFromObject(obj);
    if (kind === "door" || doorId) {
      const doorInst = ctx.getDoorInsts().find((item) => item.id === doorId) ?? ctx.getDoorInst();
      if (doorInst) return doorInst.root;
    }

    const wallId = obj.userData?.wallId as string | undefined;
    if (wallId) {
      const wall = ctx.walls.find((item) => item.id === wallId) ?? null;
      if (wall) return wall.mesh;
    }

    const floorId = obj.userData?.floorId as string | undefined;
    if (floorId) {
      const floor = ctx.floors.find((item) => item.id === floorId) ?? null;
      if (floor) return floor.mesh;
    }

    return obj;
  };

  const getLayoutMeasureMeshes3d = () => {
    const meshes: THREE.Mesh[] = [];
    meshes.push(...getAllInstanceGeometryMeshes());
    meshes.push(...getKitchenWorktopGeometryMeshes());
    for (const wall of ctx.walls) if (wall.mesh.visible) meshes.push(wall.mesh);
    for (const column of ctx.columns) if (column.mesh.visible) meshes.push(column.mesh);
    for (const floor of ctx.floors) if (floor.mesh.visible) meshes.push(floor.mesh);
    for (const windowInst of ctx.getWindowInsts()) {
      if (windowInst.pick.visible) meshes.push(windowInst.pick);
    }
    for (const doorInst of ctx.getDoorInsts()) {
      if (doorInst.pick.visible) meshes.push(doorInst.pick);
    }
    return meshes;
  };

  const getSectionPickMeshes = () => ctx.sections.map((section) => section.pick);
  const getColumnPickMeshes = () => ctx.columns.map((column) => column.pick);

  const findKitchenWorktop = (id: string) =>
    ctx.kitchenWorktops.find((worktop) => worktop.id === id) ?? null;

  const keepStickyPlanSnap = (
    rawPoint: THREE.Vector3,
    sticky: PlanSnapResult | null,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx = 20
  ) => {
    if (!sticky || sticky.kind === "none") return null;
    const rawScreen = worldToScreen(rawPoint, camera, rect);
    const stickyScreen = worldToScreen(sticky.point, camera, rect);
    const dx = rawScreen.x - stickyScreen.x;
    const dy = rawScreen.y - stickyScreen.y;
    if (Math.hypot(dx, dy) > thresholdPx) return null;
    return {
      point: sticky.point.clone(),
      kind: sticky.kind,
      a: sticky.a?.clone() ?? null,
      b: sticky.b?.clone() ?? null,
      owner: sticky.owner
    } satisfies PlanSnapResult;
  };

  return {
    findInstance,
    instanceLayoutWorldBox,
    instanceWorldBox,
    instanceFitsRoom,
    instanceFitsLayoutBounds,
    roomContainsBoxXZ,
    ensurePickAndOutline,
    getInstanceGeometryMeshes,
    getAllInstanceGeometryMeshes,
    getKitchenWorktopGeometryMeshes,
    getMeasure3DSnapTargetObject,
    getLayoutMeasureMeshes3d,
    getInstanceIdFromObject,
    getWorktopIdFromObject,
    getSectionIdFromObject,
    getColumnIdFromObject,
    getDoorIdFromObject,
    getSectionPickMeshes,
    getColumnPickMeshes,
    findKitchenWorktop,
    keepStickyPlanSnap
  };
}
