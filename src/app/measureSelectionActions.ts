import * as THREE from "three";
import type { AppState } from "../layout/appState";
import { sanitizeKitchenWorktopPath } from "../layout/worktopGeometry";
import type { MeasureSelectionTarget } from "./measureEditing";
import type { MeasureState } from "./measureTools";
import type { AssociativeMeasureContext } from "./measureAssociative";
import { resolveAssociativeMeasureWorld } from "./measureAssociative";
import { distance3dMm } from "./measure3d";
import { planarDistanceMm } from "./sharedUtils";
import { shiftPolylinePoint, shiftPolylineSegment } from "./alignTool";
import type { AlignPickedLine, FloorInstance, KitchenWorktopInstance, LayoutInstance, WallInstance } from "./localTypes";

type MeasureSelectionActionsContext = {
  S: AppState;
  measureState: MeasureState;
  walls: WallInstance[];
  floors: FloorInstance[];
  instances: LayoutInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  getAssociativeMeasureContext: () => AssociativeMeasureContext;
  updateMeasurementGeometry: (entry: MeasureState["measures"][number], a: THREE.Vector3, b: THREE.Vector3, distanceMm: number) => void;
  getSelectedKind: () => string | null;
  getSelectedWallId: () => string | null;
  getSelectedInstanceId: () => string | null;
  getSelectedFloorId: () => string | null;
  getSelectedKitchenGroupId: () => string | null;
  wallEndpointWhich: (wall: WallInstance, point: { x: number; z: number }, tolMm: number) => "a" | "b" | null;
  setWallEndpointMm: (wall: WallInstance, which: "a" | "b", point: { x: number; z: number }) => void;
  rebuildWall: (wall: WallInstance) => void;
  autoJoinAtMmPoint: (point: { x: number; z: number }) => void;
  rebuildWallPlanMesh: () => void;
  wallJoinTolMm: number;
  findInstance: (id: string) => LayoutInstance | null;
  instanceFitsRoom: (inst: LayoutInstance) => boolean;
  anyOverlap: (moving: LayoutInstance, ignoreId: string | null) => boolean;
  moduleOverlapsWalls: (inst: LayoutInstance) => boolean;
  moduleOverlapsKitchenWorktops: (inst: LayoutInstance) => boolean;
  inferKitchenPlacementBinding: (inst: LayoutInstance, groupId: string, backOffsetMm: number) => LayoutInstance["kitchenPlacement"];
  rebuildFloor: (floor: FloorInstance) => void;
  rebuildKitchenWorktop: (worktop: KitchenWorktopInstance) => void;
  applyKitchenPlacementBinding: (inst: LayoutInstance, binding: NonNullable<LayoutInstance["kitchenPlacement"]>, backOffsetMm: number) => boolean;
  findKitchenWorktop: (id: string) => KitchenWorktopInstance | null;
  updateSelectionHighlights: () => void;
  updateLayoutPanel: () => void;
};

export function createMeasureSelectionActions(ctx: MeasureSelectionActionsContext) {
  const refreshAssociativeMeasures = () => {
    if (ctx.measureState.measures.length === 0) return;
    const measureContext = ctx.getAssociativeMeasureContext();
    for (const item of ctx.measureState.measures) {
      const resolved = resolveAssociativeMeasureWorld(
        {
          id: item.id,
          kind: item.kind,
          aBinding: item.aBinding,
          bBinding: item.bBinding
        },
        measureContext
      );
      if (!resolved) continue;
      const distanceMm =
        item.kind === "normalGuide"
          ? 0
          : Math.abs(resolved.a.y - resolved.b.y) > 1e-6
            ? distance3dMm(resolved.a, resolved.b)
            : planarDistanceMm(resolved.a, resolved.b);
      ctx.updateMeasurementGeometry(item, resolved.a, resolved.b, distanceMm);
    }
  };

  const getCurrentMeasureSelectionTarget = (): MeasureSelectionTarget | null => {
    const selectedKind = ctx.getSelectedKind();
    const selectedWallId = ctx.getSelectedWallId();
    const selectedInstanceId = ctx.getSelectedInstanceId();
    const selectedFloorId = ctx.getSelectedFloorId();
    const selectedKitchenGroupId = ctx.getSelectedKitchenGroupId();
    if (selectedKind === "wall" && selectedWallId) return { kind: "wall", wallId: selectedWallId };
    if (selectedKind === "module" && selectedInstanceId) return { kind: "module", instanceId: selectedInstanceId };
    if (selectedKind === "floor" && selectedFloorId) return { kind: "floor", floorId: selectedFloorId };
    if (selectedKind === "kitchenGroup" && selectedKitchenGroupId) {
      const instanceIds = new Set(ctx.instances.filter((inst) => inst.kitchenGroupId === selectedKitchenGroupId).map((inst) => inst.id));
      const worktopIds = new Set(
        ctx.kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === selectedKitchenGroupId).map((worktop) => worktop.id)
      );
      return { kind: "kitchenGroup", groupId: selectedKitchenGroupId, instanceIds, worktopIds };
    }
    return null;
  };

  const translateWallByMeasure = (wallId: string, dxMm: number, dzMm: number) => {
    const wall = ctx.walls.find((item) => item.id === wallId) ?? null;
    if (!wall) return false;
    const oldA = { ...wall.params.aMm };
    const oldB = { ...wall.params.bMm };
    wall.params.aMm = { x: wall.params.aMm.x + dxMm, z: wall.params.aMm.z + dzMm };
    wall.params.bMm = { x: wall.params.bMm.x + dxMm, z: wall.params.bMm.z + dzMm };

    for (const otherWall of ctx.walls) {
      if (otherWall.id === wall.id) continue;
      const wa = ctx.wallEndpointWhich(otherWall, oldA, ctx.wallJoinTolMm);
      if (wa) ctx.setWallEndpointMm(otherWall, wa, wall.params.aMm);
      const wb = ctx.wallEndpointWhich(otherWall, oldB, ctx.wallJoinTolMm);
      if (wb) ctx.setWallEndpointMm(otherWall, wb, wall.params.bMm);
    }

    ctx.rebuildWall(wall);
    ctx.autoJoinAtMmPoint(wall.params.aMm);
    ctx.autoJoinAtMmPoint(wall.params.bMm);
    ctx.rebuildWallPlanMesh();
    return true;
  };

  const translateModuleByMeasure = (instanceId: string, dxMm: number, dzMm: number) => {
    const inst = ctx.findInstance(instanceId);
    if (!inst) return false;
    const prevPos = inst.root.position.clone();
    inst.root.position.x += dxMm / 1000;
    inst.root.position.z += dzMm / 1000;
    const valid =
      ctx.instanceFitsRoom(inst) &&
      !ctx.anyOverlap(inst, null) &&
      !ctx.moduleOverlapsWalls(inst) &&
      !ctx.moduleOverlapsKitchenWorktops(inst);
    if (!valid) {
      inst.root.position.copy(prevPos);
      return false;
    }
    if (inst.kitchenGroupId) {
      const group = ctx.S.kitchenGroups.find((item) => item.id === inst.kitchenGroupId) ?? null;
      const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? ctx.S.kitchenCtx.worktopBackOffsetMm;
      inst.kitchenPlacement = ctx.inferKitchenPlacementBinding(inst, inst.kitchenGroupId, backOffsetMm);
    }
    return true;
  };

  const translateFloorByMeasure = (floorId: string, dxMm: number, dzMm: number) => {
    const floor = ctx.floors.find((item) => item.id === floorId) ?? null;
    if (!floor) return false;
    floor.params.boundary = floor.params.boundary.map((point) => ({ x: point.x + dxMm, z: point.z + dzMm }));
    ctx.rebuildFloor(floor);
    ctx.updateSelectionHighlights();
    return true;
  };

  const translateKitchenGroupByMeasure = (groupId: string, dxMm: number, dzMm: number) => {
    const groupInstances = ctx.instances.filter((inst) => inst.kitchenGroupId === groupId);
    const groupWorktops = ctx.kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === groupId);
    if (groupInstances.length === 0 && groupWorktops.length === 0) return false;

    for (const inst of groupInstances) {
      inst.root.position.x += dxMm / 1000;
      inst.root.position.z += dzMm / 1000;
    }
    for (const worktop of groupWorktops) {
      worktop.params.path = worktop.params.path.map((point) => ({ x: point.x + dxMm, z: point.z + dzMm }));
      ctx.rebuildKitchenWorktop(worktop);
    }

    return true;
  };

  const reapplyKitchenGroupPlacementBindings = (groupId: string) => {
    const group = ctx.S.kitchenGroups.find((item) => item.id === groupId) ?? null;
    const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? ctx.S.kitchenCtx.worktopBackOffsetMm;
    for (const inst of ctx.instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const binding = inst.kitchenPlacement ?? ctx.inferKitchenPlacementBinding(inst, groupId, backOffsetMm);
      if (binding && ctx.applyKitchenPlacementBinding(inst, binding, backOffsetMm)) continue;
      inst.kitchenPlacement = ctx.inferKitchenPlacementBinding(inst, groupId, backOffsetMm);
    }
  };

  const alignKitchenWorktopLine = (picked: AlignPickedLine, dxMm: number, dzMm: number) => {
    if (picked.targetKind !== "worktop" || !picked.worktopId || picked.segmentIndex == null) return false;
    const worktop = ctx.findKitchenWorktop(picked.worktopId);
    if (!worktop) return false;
    const prevPath = structuredClone(worktop.params.path);
    const groupId = worktop.kitchenGroupId;
    const pointIndex = picked.lineRole === "endB" ? picked.segmentIndex + 1 : picked.segmentIndex;
    worktop.params.path =
      picked.lineRole === "endA" || picked.lineRole === "endB"
        ? shiftPolylinePoint(worktop.params.path, pointIndex, dxMm, dzMm)
        : shiftPolylineSegment(worktop.params.path, picked.segmentIndex, dxMm, dzMm);
    worktop.params.path = sanitizeKitchenWorktopPath(worktop.params.path);
    if (worktop.params.path.length < 2) {
      worktop.params.path = prevPath;
      return false;
    }
    ctx.rebuildKitchenWorktop(worktop);
    reapplyKitchenGroupPlacementBindings(groupId);
    ctx.updateSelectionHighlights();
    ctx.updateLayoutPanel();
    return true;
  };

  return {
    refreshAssociativeMeasures,
    getCurrentMeasureSelectionTarget,
    translateWallByMeasure,
    translateModuleByMeasure,
    translateFloorByMeasure,
    translateKitchenGroupByMeasure,
    alignKitchenWorktopLine
  };
}
