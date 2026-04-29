import * as THREE from "three";
import { worldToScreen } from "./sharedUtils";
import type { PlanSnapResult } from "./planSnap";
import type {
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
  floors: FloorInstance[];
  sections: SectionInstance[];
  roomBounds: RoomBounds;
  getWindowInst: () => WindowInstance | null;
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
    getInstanceGeometryMeshesBase(inst, ctx.getViewMode());

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
    const windowInst = ctx.getWindowInst();
    if (kind === "window" && windowInst) return windowInst.root;

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
    for (const floor of ctx.floors) if (floor.mesh.visible) meshes.push(floor.mesh);
    const windowInst = ctx.getWindowInst();
    if (windowInst?.pick.visible) meshes.push(windowInst.pick);
    return meshes;
  };

  const getSectionPickMeshes = () => ctx.sections.map((section) => section.pick);

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
    getSectionPickMeshes,
    findKitchenWorktop,
    keepStickyPlanSnap
  };
}
