import * as THREE from "three";
import { createPlanSnapper, type PlanSnapBinding, type PlanSnapResult } from "./planSnap";
import { buildMeasureGuides, type AssociativeMeasureContext } from "./measureAssociative";
import { pointInPolygonXZ } from "./sharedUtils";
import type { FloorInstance, KitchenPlacementBinding, KitchenWorktopInstance, LayoutInstance, WallInstance } from "./localTypes";
import type { ModuleParams } from "../model/cabinetTypes";
import { getKitchenModuleRole, staysOutsideKitchenWorktopFootprint } from "../layout/kitchenModuleRules";
import { applyKitchenContextToModuleParams } from "../layout/kitchenMaterialSync";
import { getKitchenWorktopPolygon } from "../layout/worktopGeometry";
import { toFreePlanBinding } from "./measureAssociative";

export type KitchenPlacementControllerContext = Record<string, any>;

export function createKitchenPlacementController(ctx: KitchenPlacementControllerContext) {
  const S = ctx.S as {
    activeKitchenGroupId: string | null;
    kitchenCtx: any;
    kitchenEditMode: boolean;
    kitchenGroups: any[];
  };
  const walls = ctx.walls as WallInstance[];
  const instances = ctx.instances as LayoutInstance[];
  const floors = ctx.floors as FloorInstance[];
  const kitchenWorktops = ctx.kitchenWorktops as KitchenWorktopInstance[];
  const wallSolvedOutlines = ctx.wallSolvedOutlines as Map<string, Array<{ x: number; z: number }>>;
  const getKitchenWorktopBackGuidePath = ctx.getKitchenWorktopBackGuidePath as (params: KitchenWorktopInstance["params"], backOffsetMm?: number) => THREE.Vector3[];
  const rebuildInstance = ctx.rebuildInstance as (inst: LayoutInstance, opts?: Record<string, unknown>) => void;
  const rebuildKitchenGroupWorktops = ctx.rebuildKitchenGroupWorktops as (groupId: string, nextCtx?: any) => void;
  const updateLayoutPanel = ctx.updateLayoutPanel as () => void;

  const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const kitchenBackAnchorName = "__kitchen_back_anchor";
  const kitchenCornerAnchorName = "__kitchen_corner_anchor";
  const kitchenCornerXAnchorName = "__kitchen_corner_x_anchor";
  const kitchenCornerZAnchorName = "__kitchen_corner_z_anchor";
  const kitchenAnchorMaxDistanceM = 0.18;
  const kitchenAnchorMaxAngleDeltaRad = Math.PI / 3;

  const normalizeAngleRad = (angle: number) => {
    let next = angle;
    while (next <= -Math.PI) next += Math.PI * 2;
    while (next > Math.PI) next -= Math.PI * 2;
    return next;
  };

  const getModuleLocalBackCenter = (inst: LayoutInstance) => {
    inst.root.updateMatrixWorld(true);
    const anchor = inst.module.getObjectByName(kitchenBackAnchorName);
    if (anchor) {
      const world = new THREE.Vector3();
      anchor.getWorldPosition(world);
      return inst.root.worldToLocal(world.clone());
    }
    return new THREE.Vector3((inst.localBox.min.x + inst.localBox.max.x) * 0.5, 0, inst.localBox.min.z);
  };

  const isCornerKitchenModule = (instOrParams: LayoutInstance | ModuleParams) => {
    const maybeParams = "params" in instOrParams ? instOrParams.params : instOrParams;
    return (
      maybeParams !== null &&
      typeof maybeParams === "object" &&
      "type" in maybeParams &&
      maybeParams.type === "corner_shelf_lower"
    );
  };

  const moduleStaysOutsideKitchenWorktop = (instOrParams: LayoutInstance | ModuleParams) =>
    staysOutsideKitchenWorktopFootprint(
      ("params" in instOrParams ? instOrParams.params : instOrParams) as Record<string, unknown>
    );

  const getKitchenModulePlacementY = (instOrParams: LayoutInstance | ModuleParams, groupId?: string | null) => {
    const params = ("params" in instOrParams ? instOrParams.params : instOrParams) as Record<string, unknown>;
    if (getKitchenModuleRole(params) !== "upper") return 0;
    const effectiveGroupId = groupId ?? ("kitchenGroupId" in instOrParams ? instOrParams.kitchenGroupId : null);
    const group = effectiveGroupId ? S.kitchenGroups.find((item) => item.id === effectiveGroupId) ?? null : null;
    const ctx = group?.ctx ?? S.kitchenCtx;
    return ctx.upperStartHeightMm / 1000;
  };

  const getModuleLocalKitchenCornerAnchor = (inst: LayoutInstance) => {
    inst.root.updateMatrixWorld(true);
    const anchor = inst.module.getObjectByName(kitchenCornerAnchorName);
    if (anchor) {
      const world = new THREE.Vector3();
      anchor.getWorldPosition(world);
      return inst.root.worldToLocal(world.clone());
    }
    return new THREE.Vector3(inst.localBox.min.x, 0, inst.localBox.min.z);
  };

  const getModuleLocalKitchenCornerAxisAnchor = (inst: LayoutInstance, axis: "x" | "z") => {
    inst.root.updateMatrixWorld(true);
    const anchorName = axis === "x" ? kitchenCornerXAnchorName : kitchenCornerZAnchorName;
    const anchor = inst.module.getObjectByName(anchorName);
    if (anchor) {
      const world = new THREE.Vector3();
      anchor.getWorldPosition(world);
      return inst.root.worldToLocal(world.clone());
    }
    return axis === "x"
      ? new THREE.Vector3(inst.localBox.max.x, 0, inst.localBox.min.z)
      : new THREE.Vector3(inst.localBox.min.x, 0, inst.localBox.max.z);
  };

  const getModuleKitchenCornerExtents = (inst: LayoutInstance) => {
    const corner = getModuleLocalKitchenCornerAnchor(inst);
    const xAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "x");
    const zAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "z");
    return {
      corner,
      xLength: Math.max(0.001, xAnchor.clone().sub(corner).length()),
      zLength: Math.max(0.001, zAnchor.clone().sub(corner).length())
    };
  };

  const getModuleLocalKitchenAnchor = (inst: LayoutInstance) =>
    isCornerKitchenModule(inst) ? getModuleLocalKitchenCornerAnchor(inst) : getModuleLocalBackCenter(inst);

  const getModuleWorldKitchenAnchor = (inst: LayoutInstance) => getModuleLocalKitchenAnchor(inst).applyMatrix4(inst.root.matrixWorld);

  const preserveWorldKitchenAnchor = (inst: LayoutInstance, previousWorldAnchor: THREE.Vector3) => {
    const nextWorldAnchor = getModuleWorldKitchenAnchor(inst);
    if (isCornerKitchenModule(inst)) {
      const delta = previousWorldAnchor.clone().sub(nextWorldAnchor);
      delta.y = 0;
      if (delta.lengthSq() <= 1e-12) return;
      inst.root.position.add(delta);
      inst.root.position.y = getKitchenModulePlacementY(inst);
      inst.root.updateMatrixWorld(true);
      return;
    }

    const frontDir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, inst.root.rotation.y, 0)).normalize();
    const deltaDepth = previousWorldAnchor.clone().sub(nextWorldAnchor).dot(frontDir);
    if (Math.abs(deltaDepth) <= 1e-9) return;
    inst.root.position.addScaledVector(frontDir, deltaDepth);
    inst.root.position.y = getKitchenModulePlacementY(inst);
    inst.root.updateMatrixWorld(true);
  };

  let measureStateRef: { measures: any[] } | null = null;

  const getAssociativeMeasureContext = (): AssociativeMeasureContext => ({
    walls,
    instances,
    floors,
    worktops: kitchenWorktops,
    measures: (measureStateRef?.measures ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      aBinding: item.aBinding,
      bBinding: item.bBinding
    })),
    getModuleLocalBackCenter,
    getKitchenWorktopPolygon
  });

  const bindingFromPlanSnap = (snapped: PlanSnapResult | null, fallbackPoint: THREE.Vector3): PlanSnapBinding =>
    snapped?.binding ?? toFreePlanBinding(fallbackPoint);

  const snapPoint2D = createPlanSnapper({
    getWalls: () => walls,
    getInstances: () => instances,
    getFloors: () => floors,
    getKitchenWorktops: () => kitchenWorktops,
    getMeasureGuides: () => buildMeasureGuides(getAssociativeMeasureContext()),
    getWallSolvedOutlines: () => wallSolvedOutlines,
    getWallSolvedJoinPolys: () => ctx.getWallSolvedJoinPolys(),
    getWallUnionPolys: () => ctx.getWallUnionPolys(),
    getLayoutTool: () => ctx.getLayoutTool(),
    getWallChainStart: () => ctx.getWallChainStart(),
    getModuleLocalBackCenter,
    getKitchenWorktopPolygon
  });

  const getKitchenGuideSegmentInfo = (
    worktop: KitchenWorktopInstance,
    segmentIndex: number,
    backOffsetMm: number
  ) => {
    const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
    if (guidePath.length < 2) return null;
    const safeIndex = clampNumber(segmentIndex, 0, guidePath.length - 2);
    const start = guidePath[safeIndex]!;
    const end = guidePath[safeIndex + 1]!;
    const segment = end.clone().sub(start);
    segment.y = 0;
    const length = segment.length();
    if (length < 1e-6) return null;
    const dir = segment.clone().multiplyScalar(1 / length);
    const frontNormal = new THREE.Vector3(-dir.z, 0, dir.x);
    if (worktop.params.mirrored) frontNormal.multiplyScalar(-1);
    const rotationY = Math.atan2(frontNormal.x, frontNormal.z);
    return { start, end, dir, length, frontNormal, rotationY };
  };

  const getKitchenCornerPlacementInfo = (
    worktop: KitchenWorktopInstance,
    cornerIndex: number,
    backOffsetMm: number,
    inst: LayoutInstance
  ) => {
    const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
    if (guidePath.length < 3) return null;
    const safeCornerIndex = clampNumber(cornerIndex, 1, guidePath.length - 2);
    const prev = guidePath[safeCornerIndex - 1]!;
    const corner = guidePath[safeCornerIndex]!;
    const next = guidePath[safeCornerIndex + 1]!;
    const prevVec = prev.clone().sub(corner);
    const nextVec = next.clone().sub(corner);
    prevVec.y = 0;
    nextVec.y = 0;
    const prevLength = prevVec.length();
    const nextLength = nextVec.length();
    if (prevLength < 1e-6 || nextLength < 1e-6) return null;

    const prevDir = prevVec.clone().multiplyScalar(1 / prevLength);
    const nextDir = nextVec.clone().multiplyScalar(1 / nextLength);
    if (Math.abs(prevDir.dot(nextDir)) > 0.999) return null;

    const cornerExtents = getModuleKitchenCornerExtents(inst);
    const localCorner = cornerExtents.corner;
    const tryAssignment = (xDir: THREE.Vector3, zDir: THREE.Vector3, xLength: number, zLength: number) => {
      const rotationY = Math.atan2(zDir.x, zDir.z);
      const rotatedX = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, rotationY, 0)).normalize();
      const rotatedZ = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, rotationY, 0)).normalize();
      if (rotatedX.dot(xDir) < 0.999 || rotatedZ.dot(zDir) < 0.999) return null;
      const rotatedCorner = localCorner.clone().applyEuler(new THREE.Euler(0, rotationY, 0));
      const position = corner.clone().sub(rotatedCorner);
      position.y = getKitchenModulePlacementY(inst, worktop.kitchenGroupId);
      return {
        binding: {
          kind: "corner" as const,
          worktopId: worktop.id,
          segmentIndex: safeCornerIndex - 1,
          offsetAlongM: 0,
          cornerIndex: safeCornerIndex
        },
        corner,
        position,
        rotationY,
        valid: xLength + 1e-6 >= cornerExtents.xLength && zLength + 1e-6 >= cornerExtents.zLength
      };
    };

    return (
      tryAssignment(prevDir, nextDir, prevLength, nextLength) ??
      tryAssignment(nextDir, prevDir, nextLength, prevLength)
    );
  };

  const getKitchenCornerArmBindingInfo = (inst: LayoutInstance, backOffsetMm: number) => {
    if (!isCornerKitchenModule(inst)) return null;
    const binding = inst.kitchenPlacement;
    if (!binding || (binding.kind ?? "segment") !== "corner") return null;

    const worktop = kitchenWorktops.find((item) => item.id === binding.worktopId) ?? null;
    if (!worktop) return null;

    const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
    const cornerIndex = Math.max(1, Math.min(binding.cornerIndex ?? 1, guidePath.length - 2));
    const cornerPoint = guidePath[cornerIndex];
    const prevPoint = guidePath[cornerIndex - 1];
    const nextPoint = guidePath[cornerIndex + 1];
    if (!cornerPoint || !prevPoint || !nextPoint) return null;

    const prevDir = prevPoint.clone().sub(cornerPoint).setY(0);
    const nextDir = nextPoint.clone().sub(cornerPoint).setY(0);
    if (prevDir.lengthSq() < 1e-8 || nextDir.lengthSq() < 1e-8) return null;
    prevDir.normalize();
    nextDir.normalize();

    const localCorner = getModuleLocalKitchenCornerAnchor(inst);
    const localXAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "x");
    const localZAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "z");
    const worldCorner = localCorner.clone().applyMatrix4(inst.root.matrixWorld);
    const xDir = localXAnchor.clone().applyMatrix4(inst.root.matrixWorld).sub(worldCorner).setY(0);
    const zDir = localZAnchor.clone().applyMatrix4(inst.root.matrixWorld).sub(worldCorner).setY(0);
    if (xDir.lengthSq() < 1e-8 || zDir.lengthSq() < 1e-8) return null;
    xDir.normalize();
    zDir.normalize();

    const resolveSegmentIndex = (axisDir: THREE.Vector3) => {
      const prevDot = axisDir.dot(prevDir);
      const nextDot = axisDir.dot(nextDir);
      if (prevDot >= nextDot && prevDot > 0.9) return cornerIndex - 1;
      if (nextDot > 0.9) return cornerIndex;
      return null;
    };

    const extents = getModuleKitchenCornerExtents(inst);
    return {
      worktopId: binding.worktopId,
      cornerIndex,
      xSegmentIndex: resolveSegmentIndex(xDir),
      zSegmentIndex: resolveSegmentIndex(zDir),
      xLengthM: extents.xLength,
      zLengthM: extents.zLength
    };
  };

  const getKitchenSegmentReservedMargins = (
    groupId: string | null,
    worktopId: string,
    segmentIndex: number,
    backOffsetMm: number,
    ignoreInstanceId?: string | null
  ) => {
    if (!groupId) return { startM: 0, endM: 0 };
    let startM = 0;
    let endM = 0;

    for (const other of instances) {
      if (other.id === ignoreInstanceId || other.kitchenGroupId !== groupId || !isCornerKitchenModule(other)) continue;
      const armInfo = getKitchenCornerArmBindingInfo(other, backOffsetMm);
      if (!armInfo || armInfo.worktopId !== worktopId) continue;

      if (armInfo.xSegmentIndex === segmentIndex) {
        if (segmentIndex < armInfo.cornerIndex) endM = Math.max(endM, armInfo.xLengthM);
        else startM = Math.max(startM, armInfo.xLengthM);
      }
      if (armInfo.zSegmentIndex === segmentIndex) {
        if (segmentIndex < armInfo.cornerIndex) endM = Math.max(endM, armInfo.zLengthM);
        else startM = Math.max(startM, armInfo.zLengthM);
      }
    }

    return { startM, endM };
  };

  const inferKitchenPlacementBinding = (
    inst: LayoutInstance,
    groupId: string,
    backOffsetMm: number
  ): KitchenPlacementBinding | null => {
    if (moduleStaysOutsideKitchenWorktop(inst)) return null;
    const groupWorktops = kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === groupId);
    if (groupWorktops.length === 0) return null;

    if (isCornerKitchenModule(inst)) {
      const localCorner = getModuleLocalKitchenCornerAnchor(inst);
      const worldCorner = localCorner.clone().applyMatrix4(inst.root.matrixWorld).setY(0);
      let best:
        | {
            binding: KitchenPlacementBinding;
            distanceSq: number;
            angleDelta: number;
          }
        | null = null;

      for (const worktop of groupWorktops) {
        const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
        for (let cornerIndex = 1; cornerIndex < guidePath.length - 1; cornerIndex += 1) {
          const info = getKitchenCornerPlacementInfo(worktop, cornerIndex, backOffsetMm, inst);
          if (!info) continue;
          const distanceSq = info.corner.distanceToSquared(worldCorner);
          const angleDelta = Math.abs(normalizeAngleRad(info.rotationY - inst.root.rotation.y));
          if (
            !best ||
            distanceSq < best.distanceSq - 1e-9 ||
            (Math.abs(distanceSq - best.distanceSq) < 1e-9 && angleDelta < best.angleDelta)
          ) {
            best = {
              binding: info.binding,
              distanceSq,
              angleDelta
            };
          }
        }
      }

      if (!best) return null;
      if (Math.sqrt(best.distanceSq) > kitchenAnchorMaxDistanceM) return null;
      if (best.angleDelta > kitchenAnchorMaxAngleDeltaRad) return null;
      return best.binding;
    }

    const localBackCenter = getModuleLocalBackCenter(inst);
    const worldBackCenter = localBackCenter.clone().applyMatrix4(inst.root.matrixWorld).setY(0);
    let best:
      | {
          binding: KitchenPlacementBinding;
          distanceSq: number;
          angleDelta: number;
        }
      | null = null;

    for (const worktop of groupWorktops) {
      for (let segmentIndex = 0; segmentIndex < getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm).length - 1; segmentIndex += 1) {
        const info = getKitchenGuideSegmentInfo(worktop, segmentIndex, backOffsetMm);
        if (!info) continue;
        const reserved = getKitchenSegmentReservedMargins(groupId, worktop.id, segmentIndex, backOffsetMm, inst.id);
        const halfModuleWidthM = Math.max(0.001, (inst.localBox.max.x - inst.localBox.min.x) * 0.5);
        const minAlong = reserved.startM + halfModuleWidthM;
        const maxAlong = info.length - reserved.endM - halfModuleWidthM;
        if (maxAlong + 1e-6 < minAlong) continue;
        const cursorOffset = worldBackCenter.clone().sub(info.start);
        const projected = clampNumber(cursorOffset.dot(info.dir), minAlong, maxAlong);
        const closestOnGuide = info.start.clone().addScaledVector(info.dir, projected);
        const distanceSq = closestOnGuide.distanceToSquared(worldBackCenter);
        const angleDelta = Math.abs(normalizeAngleRad(info.rotationY - inst.root.rotation.y));

        if (
          !best ||
          distanceSq < best.distanceSq - 1e-9 ||
          (Math.abs(distanceSq - best.distanceSq) < 1e-9 && angleDelta < best.angleDelta)
        ) {
          best = {
            binding: {
              worktopId: worktop.id,
              segmentIndex,
              offsetAlongM: projected
            },
            distanceSq,
            angleDelta
          };
        }
      }
    }

    if (!best) return null;
    if (Math.sqrt(best.distanceSq) > kitchenAnchorMaxDistanceM) return null;
    if (best.angleDelta > kitchenAnchorMaxAngleDeltaRad) return null;
    return best.binding;
  };

  const applyKitchenPlacementBinding = (
    inst: LayoutInstance,
    binding: KitchenPlacementBinding,
    backOffsetMm: number
  ) => {
    const worktop = kitchenWorktops.find((item) => item.id === binding.worktopId);
    if (!worktop) return false;

    if ((binding.kind ?? "segment") === "corner" || (isCornerKitchenModule(inst) && binding.cornerIndex != null)) {
      const info = getKitchenCornerPlacementInfo(
        worktop,
        binding.cornerIndex ?? binding.segmentIndex + 1,
        backOffsetMm,
        inst
      );
      if (!info) return false;
      inst.root.rotation.y = info.rotationY;
      inst.root.position.copy(info.position);
      inst.root.position.y = getKitchenModulePlacementY(inst, worktop.kitchenGroupId);
      inst.root.updateMatrixWorld(true);
      inst.kitchenPlacement = { ...info.binding };
      return true;
    }

    const info = getKitchenGuideSegmentInfo(worktop, binding.segmentIndex, backOffsetMm);
    if (!info) return false;

    const localBackCenter = getModuleLocalBackCenter(inst);
    const halfModuleWidthM = Math.max(0.001, (inst.localBox.max.x - inst.localBox.min.x) * 0.5);
    const reserved = getKitchenSegmentReservedMargins(inst.kitchenGroupId ?? worktop.kitchenGroupId, worktop.id, binding.segmentIndex, backOffsetMm, inst.id);
    const minAlong = reserved.startM + halfModuleWidthM;
    const maxAlong = info.length - reserved.endM - halfModuleWidthM;
    if (maxAlong + 1e-6 < minAlong) return false;
    const clampedAlong =
      clampNumber(binding.offsetAlongM, minAlong, maxAlong);
    const backCenter = info.start.clone().addScaledVector(info.dir, clampedAlong);
    const rotatedBackCenter = localBackCenter.clone().applyEuler(new THREE.Euler(0, info.rotationY, 0));

    inst.root.rotation.y = info.rotationY;
    inst.root.position.copy(backCenter.clone().sub(rotatedBackCenter));
    inst.root.position.y = getKitchenModulePlacementY(inst, worktop.kitchenGroupId);
    inst.root.updateMatrixWorld(true);
    inst.kitchenPlacement = {
      worktopId: binding.worktopId,
      segmentIndex: binding.segmentIndex,
      offsetAlongM: clampedAlong
    };
    return true;
  };

  const rebuildKitchenGroupLayout = (
    groupId: string,
    nextCtx: any,
    prevCtx: any = nextCtx
  ) => {
    const bindings = new Map<string, KitchenPlacementBinding>();

    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const binding = inst.kitchenPlacement ?? inferKitchenPlacementBinding(inst, groupId, prevCtx.worktopBackOffsetMm);
      if (!binding) continue;
      bindings.set(inst.id, { ...binding });
      inst.kitchenPlacement = { ...binding };
    }

    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      applyKitchenContextToModuleParams(inst.params, nextCtx);
      rebuildInstance(inst, { skipLayoutValidation: true, preserveBackAnchor: true });
    }

    rebuildKitchenGroupWorktops(groupId, nextCtx);

    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const binding = bindings.get(inst.id) ?? inst.kitchenPlacement;
      if (binding && applyKitchenPlacementBinding(inst, binding, nextCtx.worktopBackOffsetMm)) continue;
      inst.kitchenPlacement = inferKitchenPlacementBinding(inst, groupId, nextCtx.worktopBackOffsetMm);
    }

    updateLayoutPanel();
  };

  const getTallKitchenPlacementConstraint = (
    ghost: LayoutInstance,
    cursorWorld: THREE.Vector3,
    activeWorktops: KitchenWorktopInstance[],
    backOffsetMm: number
  ) => {
    if (!moduleStaysOutsideKitchenWorktop(ghost)) return null;

    const localBackCenter = getModuleLocalBackCenter(ghost);
    const halfModuleWidthM = Math.max(0.001, (ghost.localBox.max.x - ghost.localBox.min.x) * 0.5);
    let cursorOnWorktop = false;
    let closestGuideDistanceSq = Number.POSITIVE_INFINITY;
    let best:
      | {
          position: THREE.Vector3;
          rotationY: number;
          distanceSq: number;
        }
      | null = null;

    for (const worktop of activeWorktops) {
      const polygon = getKitchenWorktopPolygon(worktop.params);
      if (polygon.length >= 3 && pointInPolygonXZ({ x: cursorWorld.x, z: cursorWorld.z }, polygon.map((point) => ({ x: point.x, z: point.z })))) {
        cursorOnWorktop = true;
      }

      const firstInfo = getKitchenGuideSegmentInfo(worktop, 0, backOffsetMm);
      const lastGuidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
      const lastInfo = lastGuidePath.length >= 2 ? getKitchenGuideSegmentInfo(worktop, lastGuidePath.length - 2, backOffsetMm) : null;
      const edgeCandidates = [
        firstInfo
          ? {
              edgePoint: firstInfo.start.clone().addScaledVector(firstInfo.dir, -halfModuleWidthM),
              rotationY: firstInfo.rotationY
            }
          : null,
        lastInfo
          ? {
              edgePoint: lastInfo.start.clone().addScaledVector(lastInfo.dir, lastInfo.length + halfModuleWidthM),
              rotationY: lastInfo.rotationY
            }
          : null
      ].filter((candidate): candidate is { edgePoint: THREE.Vector3; rotationY: number } => candidate != null);

      if (firstInfo) {
        const projected = clampNumber(cursorWorld.clone().sub(firstInfo.start).dot(firstInfo.dir), 0, firstInfo.length);
        const closestOnGuide = firstInfo.start.clone().addScaledVector(firstInfo.dir, projected);
        closestGuideDistanceSq = Math.min(closestGuideDistanceSq, closestOnGuide.distanceToSquared(cursorWorld));
      }
      if (lastInfo) {
        const projected = clampNumber(cursorWorld.clone().sub(lastInfo.start).dot(lastInfo.dir), 0, lastInfo.length);
        const closestOnGuide = lastInfo.start.clone().addScaledVector(lastInfo.dir, projected);
        closestGuideDistanceSq = Math.min(closestGuideDistanceSq, closestOnGuide.distanceToSquared(cursorWorld));
      }

      for (const candidate of edgeCandidates) {
        const rotatedBackCenter = localBackCenter.clone().applyEuler(new THREE.Euler(0, candidate.rotationY, 0));
        const position = candidate.edgePoint.clone().sub(rotatedBackCenter);
        position.y = 0;
        const distanceSq = candidate.edgePoint.distanceToSquared(cursorWorld);
        if (!best || distanceSq < best.distanceSq) {
          best = {
            position,
            rotationY: candidate.rotationY,
            distanceSq
          };
        }
      }
    }

    if (!best) return null;
    if (!cursorOnWorktop && Math.sqrt(closestGuideDistanceSq) > 0.45) return null;

    return {
      kitchenPlacement: null,
      position: best.position,
      rotationY: best.rotationY,
      valid: true,
      enforceRoomBounds: true,
      enforceWallOverlap: true,
      statusText: "Placement: Tall module snaps beside the worktop."
    };
  };

  const getKitchenPlacementConstraint = (ghost: LayoutInstance, cursorWorld: THREE.Vector3) => {
    if (!S.kitchenEditMode || !S.activeKitchenGroupId) return null;

    const activeWorktops = kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === S.activeKitchenGroupId);
    if (activeWorktops.length === 0) return null;
    const activeGroup = S.kitchenGroups.find((group) => group.id === S.activeKitchenGroupId) ?? null;
    const backOffsetMm = activeGroup?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;

    if (moduleStaysOutsideKitchenWorktop(ghost)) {
      return getTallKitchenPlacementConstraint(ghost, cursorWorld, activeWorktops, backOffsetMm);
    }

    if (isCornerKitchenModule(ghost)) {
      let best:
        | {
            binding: KitchenPlacementBinding;
            position: THREE.Vector3;
            rotationY: number;
            valid: boolean;
            distance: number;
          }
        | null = null;

      for (const worktop of activeWorktops) {
        const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
        for (let cornerIndex = 1; cornerIndex < guidePath.length - 1; cornerIndex += 1) {
          const info = getKitchenCornerPlacementInfo(worktop, cornerIndex, backOffsetMm, ghost);
          if (!info) continue;
          const distance = info.corner.distanceToSquared(cursorWorld);
          if (!best || distance < best.distance) {
            best = {
              binding: info.binding,
              position: info.position,
              rotationY: info.rotationY,
              valid: info.valid,
              distance
            };
          }
        }
      }

      if (!best) {
        return {
          kitchenPlacement: null,
          position: ghost.root.position.clone(),
          rotationY: ghost.root.rotation.y,
          valid: false,
          enforceRoomBounds: false,
          enforceWallOverlap: false,
          statusText: "Placement: Corner module can be inserted only into a worktop corner."
        };
      }

      return {
        kitchenPlacement: best.binding,
        position: best.position,
        rotationY: best.rotationY,
        valid: best.valid,
        enforceRoomBounds: false,
        enforceWallOverlap: false,
        statusText: best.valid
          ? "Placement: Corner module binds only to the worktop back-line corner."
          : "Placement: Corner module needs a corner with long enough sides."
      };
    }

    const localBackCenter = getModuleLocalBackCenter(ghost);
    const halfModuleWidthM = Math.max(0.001, (ghost.localBox.max.x - ghost.localBox.min.x) * 0.5);

    let best:
      | {
          binding: KitchenPlacementBinding;
          position: THREE.Vector3;
          rotationY: number;
          valid: boolean;
          distance: number;
        }
      | null = null;

    for (const worktop of activeWorktops) {
      const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
      if (guidePath.length < 2) continue;

      for (let index = 0; index < guidePath.length - 1; index += 1) {
        const info = getKitchenGuideSegmentInfo(worktop, index, backOffsetMm);
        if (!info) continue;
        const reserved = getKitchenSegmentReservedMargins(S.activeKitchenGroupId, worktop.id, index, backOffsetMm, ghost.id);
        const minAlong = reserved.startM + halfModuleWidthM;
        const maxAlong = info.length - reserved.endM - halfModuleWidthM;
        if (maxAlong + 1e-6 < minAlong) continue;
        const guideStart = info.start;
        const cursorOffset = cursorWorld.clone().sub(guideStart);
        const projected = cursorOffset.dot(info.dir);
        const closestOnGuide = guideStart.clone().addScaledVector(info.dir, clampNumber(projected, 0, info.length));
        const backCenterDistance = closestOnGuide.distanceToSquared(cursorWorld);
        const clampedAlongGuide = clampNumber(projected, minAlong, maxAlong);
        const backCenter = guideStart.clone().addScaledVector(info.dir, clampedAlongGuide);
        const rotatedBackCenter = localBackCenter.clone().applyEuler(new THREE.Euler(0, info.rotationY, 0));
        const position = backCenter.clone().sub(rotatedBackCenter);
        position.y = 0;

        if (!best || backCenterDistance < best.distance) {
          best = {
            binding: {
              worktopId: worktop.id,
              segmentIndex: index,
              offsetAlongM: clampedAlongGuide
            },
            position,
            rotationY: info.rotationY,
            valid: true,
            distance: backCenterDistance
          };
        }
      }
    }

    if (!best) return null;
    best.position.y = getKitchenModulePlacementY(ghost, S.activeKitchenGroupId);
    return {
      kitchenPlacement: best.binding,
      position: best.position,
      rotationY: best.rotationY,
      valid: best.valid,
      enforceRoomBounds: false,
      enforceWallOverlap: false,
      statusText: best.valid
        ? "Placement: module moves along the back line under the worktop."
        : "Placement: module is too wide for the selected worktop segment."
    };
  };

  return {
    clampNumber,
    normalizeAngleRad,
    getModuleLocalBackCenter,
    isCornerKitchenModule,
    moduleStaysOutsideKitchenWorktop,
    getKitchenModulePlacementY,
    getModuleLocalKitchenCornerAnchor,
    getModuleLocalKitchenCornerAxisAnchor,
    getModuleKitchenCornerExtents,
    getModuleLocalKitchenAnchor,
    getModuleWorldKitchenAnchor,
    preserveWorldKitchenAnchor,
    getAssociativeMeasureContext,
    bindingFromPlanSnap,
    snapPoint2D,
    getKitchenGuideSegmentInfo,
    getKitchenCornerPlacementInfo,
    getKitchenCornerArmBindingInfo,
    getKitchenSegmentReservedMargins,
    inferKitchenPlacementBinding,
    applyKitchenPlacementBinding,
    rebuildKitchenGroupLayout,
    getTallKitchenPlacementConstraint,
    getKitchenPlacementConstraint,
    setMeasureStateRef: (next: { measures: any[] }) => { measureStateRef = next; }
  };
}
