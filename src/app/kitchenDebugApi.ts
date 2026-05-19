import * as THREE from "three";
import { planarDistanceMm, worldToScreen } from "./sharedUtils";
import { wallEndpointWhich } from "./wallGeometryHelpers";
import { getModulePlanPolygon } from "./planSnap";
import { detectModuleAdjacencyInfo } from "./moduleAdjacency";
import { getSelectionMeasureBindings } from "./measureEditing";
import { makeDefaultKitchenContext, resolveContext } from "../layout/kitchenContext";
import { applyKitchenContextToModuleParams } from "../layout/kitchenMaterialSync";
import { captureLayoutSnapshot, commitHistory } from "../layout/historyManager";
import { cancelPlacement } from "../layout/placementManager";
import { normalizeModuleParamsForSource, type ModuleParams } from "../model/cabinetTypes";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { createDefaultModulePackageParameters } from "../core/module-package/runtime/module-runtime-adapter";
import { findModulePackageForParams } from "../core/module-package/runtime/module-package-controls";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import type { AppState } from "../layout/appState";
import type { MeasureState } from "./measureTools";
import type { FloorBoundaryPoint, FloorParams, KitchenWorktopInstance, KitchenWorktopJustification, LayoutInstance, WallInstance } from "./localTypes";

export type KitchenDebugApiContext = Record<string, any>;

declare global {
  interface Window {
    __kitchenDebug?: Record<string, unknown>;
  }
}

export function installKitchenDebugApi(ctx: KitchenDebugApiContext) {
  const catalog = ctx.catalog as ClientCatalog | undefined;
  if (!catalog) throw new Error("ClientCatalog is required for kitchen debug API.");
  const modulePackages = (ctx.modulePackages ?? []) as readonly FurnQuoteModulePackage[];
  const {
    S,
    kitchenWorktops,
    instances,
    placement,
    placementHelpers,
    layoutRoot,
    measureState,
    wallDefault,
    walls,
    renderer,
    wallJoinTolMm,
    wallPlanGroup,
    detailSliceGroup,
    instanceVisualWorldBox,
    getModuleLocalBackCenter,
    getModuleWorldKitchenAnchor,
    getKitchenWorktopBackGuidePath,
    cancelKitchenWorktopDraw,
    removeKitchenWorktop,
    deleteInstance,
    setSelectedKitchenGroup,
    setSelectedModule,
    mountProps,
    updateLayoutPanel,
    createInstance,
    getKitchenCornerPlacementInfo,
    applyKitchenPlacementBinding,
    getKitchenGuideSegmentInfo,
    moduleStaysOutsideKitchenWorktop,
    clampNumber,
    getTallKitchenPlacementConstraint,
    getKitchenModulePlacementY,
    ensureLayoutMode,
    createKitchenWorktop,
    rebuildKitchenGroupLayout,
    setToolMeasure,
    addWall,
    setWallEndpointMm,
    rebuildWall,
    autoJoinAtMmPoint,
    rebuildWallPlanMesh,
    snapPoint2D,
    cam,
    bindingFromPlanSnap,
    addMeasurement,
    createFloor,
    cloneFloorParams,
    setSelectedFloor,
    setSelectedWall,
    findInstance,
    rebuildInstance,
    instanceWorldBox,
    getCurrentMeasureSelectionTarget,
    commitSelectedMeasureValueMm,
    commitWallMeasureValueMm,
    pickAlignLineAt,
    applyAlignBetweenPickedLines,
    updateSelectionHighlights,
    getSceneDebugState,
    ctl
  } = ctx;

  const getDebugModuleSnapshot = (inst: LayoutInstance) => {
    const box = instanceVisualWorldBox(inst);
    const planPolygon = getModulePlanPolygon(inst, getModuleLocalBackCenter);
    const structuralMeshes: THREE.Object3D[] = [];
    const partSnapshots: Array<{
      name: string;
      positionM: { x: number; y: number; z: number };
      scale: { x: number; y: number; z: number };
      dimensionsMm: Record<string, unknown> | null;
      colorHex: string | null;
    }> = [];
    inst.module.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const name = child.name || "";
      if (
        name.startsWith("handle_") ||
        name.startsWith("gola_") ||
        name.startsWith("plinth-clip") ||
        name.includes("_screw_")
      ) {
        return;
      }
      structuralMeshes.push(child);
      const material = Array.isArray(child.material) ? child.material[0] : child.material;
      const colorHex =
        material && "color" in material && (material as { color?: THREE.Color }).color
          ? `#${(material as { color: THREE.Color }).color.getHexString()}`
          : null;
      partSnapshots.push({
        name,
        positionM: {
          x: child.position.x,
          y: child.position.y,
          z: child.position.z
        },
        scale: {
          x: child.scale.x,
          y: child.scale.y,
          z: child.scale.z
        },
        dimensionsMm:
          child.userData?.dimensionsMm && typeof child.userData.dimensionsMm === "object"
            ? structuredClone(child.userData.dimensionsMm as Record<string, unknown>)
            : null,
        colorHex
      });
    });
    const structuralBox = new THREE.Box3();
    for (const mesh of structuralMeshes) structuralBox.expandByObject(mesh);
    const localBackCenter = getModuleLocalBackCenter(inst);
    const worldKitchenAnchor = getModuleWorldKitchenAnchor(inst);
    const localFrontCenter = new THREE.Vector3((inst.localBox.min.x + inst.localBox.max.x) * 0.5, 0, inst.localBox.max.z);
    const worldBackCenter = localBackCenter.clone().applyMatrix4(inst.root.matrixWorld);
    const worldFrontCenter = localFrontCenter.clone().applyMatrix4(inst.root.matrixWorld);
    const worldFrontDir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, inst.root.rotation.y, 0)).normalize();
    return {
      id: inst.id,
      kitchenGroupId: inst.kitchenGroupId,
      kitchenPlacement: inst.kitchenPlacement ? structuredClone(inst.kitchenPlacement) : null,
      moduleVisible: inst.module.visible,
      outlineVisible: inst.outline.visible,
      pickVisible: inst.pick.visible,
      params: structuredClone(inst.params),
      positionM: {
        x: inst.root.position.x,
        y: inst.root.position.y,
        z: inst.root.position.z
      },
      rotationYRad: inst.root.rotation.y,
      localBoxM: {
        min: { x: inst.localBox.min.x, y: inst.localBox.min.y, z: inst.localBox.min.z },
        max: { x: inst.localBox.max.x, y: inst.localBox.max.y, z: inst.localBox.max.z }
      },
      worldBoxM: {
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z }
      },
      structuralWorldBoxM: {
        min: { x: structuralBox.min.x, y: structuralBox.min.y, z: structuralBox.min.z },
        max: { x: structuralBox.max.x, y: structuralBox.max.y, z: structuralBox.max.z }
      },
      worldKitchenAnchorM: {
        x: worldKitchenAnchor.x,
        y: worldKitchenAnchor.y,
        z: worldKitchenAnchor.z
      },
      worldBackCenterM: { x: worldBackCenter.x, y: worldBackCenter.y, z: worldBackCenter.z },
      worldFrontCenterM: { x: worldFrontCenter.x, y: worldFrontCenter.y, z: worldFrontCenter.z },
      frontVectorM: { x: worldFrontDir.x, y: worldFrontDir.y, z: worldFrontDir.z },
      planPolygonM: planPolygon.map((point) => ({ x: point.x, y: point.y, z: point.z })),
      parts: partSnapshots,
      realizedDepthMm: Math.round(worldFrontCenter.clone().sub(worldBackCenter).dot(worldFrontDir) * 1000),
      structuralDepthMm: Math.round(
        Math.abs(
          new THREE.Vector3(
            structuralBox.max.x - structuralBox.min.x,
            structuralBox.max.y - structuralBox.min.y,
            structuralBox.max.z - structuralBox.min.z
          ).dot(new THREE.Vector3(Math.abs(worldFrontDir.x), Math.abs(worldFrontDir.y), Math.abs(worldFrontDir.z)))
        ) * 1000
      )
    };
  };

  const getDebugKitchenSnapshot = (groupId: string | null) => {
    const kitchenGroups = S.kitchenGroups as AppState["kitchenGroups"];
    const allWorktops = kitchenWorktops as KitchenWorktopInstance[];
    const allInstances = instances as LayoutInstance[];
    const group = groupId ? kitchenGroups.find((item) => item.id === groupId) ?? null : null;
    const groupWorktops = groupId ? allWorktops.filter((item) => item.kitchenGroupId === groupId) : [];
    const groupInstances = groupId ? allInstances.filter((item) => item.kitchenGroupId === groupId) : [];
    return {
      selectedKitchenGroupId: ctx.getSelectedKitchenGroupId(),
      activeKitchenGroupId: S.activeKitchenGroupId,
      kitchenCtx: structuredClone(S.kitchenCtx),
      group: group
        ? {
            id: group.id,
            name: group.name,
            ctx: structuredClone(group.ctx),
            instanceIds: [...group.instanceIds]
          }
        : null,
      worktops: groupWorktops.map((worktop) => ({
        id: worktop.id,
        params: structuredClone(worktop.params),
        guidePathM: getKitchenWorktopBackGuidePath(worktop.params, group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm).map(
          (point: THREE.Vector3) => ({ x: point.x, y: point.y, z: point.z })
        )
      })),
      instances: groupInstances.map((inst) => getDebugModuleSnapshot(inst))
    };
  };

  const debugResetKitchenScenario = () => {
    if (S.kitchenEditMode) ctx.getKitchenMode()?.exitDiscard();
    cancelKitchenWorktopDraw({ silent: true });
    if (placement.active) cancelPlacement(S, placementHelpers);

    for (let index = kitchenWorktops.length - 1; index >= 0; index -= 1) {
      removeKitchenWorktop(kitchenWorktops[index]!.id, { skipHistory: true });
    }
    for (let index = instances.length - 1; index >= 0; index -= 1) {
      deleteInstance(instances[index]!.id);
    }

    S.kitchenGroups.splice(0, S.kitchenGroups.length);
    S.kitchenCtx = resolveContext(makeDefaultKitchenContext(catalog));
    setSelectedKitchenGroup(null);
    setSelectedModule(null);
    mountProps();
    updateLayoutPanel();
    return getDebugKitchenSnapshot(null);
  };

  const debugSelectKitchenGroup = (groupId: string | null) => {
    setSelectedKitchenGroup(groupId);
    mountProps();
    return getDebugKitchenSnapshot(groupId);
  };

  const debugAddKitchenModule = (groupId: string, opts?: { type?: ModuleParams["type"]; segmentIndex?: number; offsetAlongMm?: number; cornerIndex?: number }) => {
    const group = S.kitchenGroups.find((item: any) => item.id === groupId) ?? null;
    const worktop = kitchenWorktops.find((item: any) => item.kitchenGroupId === groupId) ?? null;
    if (!group || !worktop) throw new Error("Debug kitchen group/worktop not found.");

    const requestedType = opts?.type ?? "drawer_low";
    const modulePackage = findModulePackageForParams(modulePackages, { type: requestedType });
    if (!modulePackage) throw new Error(`Debug module package missing for ${requestedType}.`);
    const nextParams = structuredClone({
      ...createDefaultModulePackageParameters(modulePackage),
      type: requestedType
    }) as ModuleParams;
    applyKitchenContextToModuleParams(nextParams, group.ctx, catalog, modulePackage);
    const inst = createInstance(nextParams);
    inst.kitchenGroupId = groupId;

    if (nextParams.type === "corner_shelf_lower") {
      const guidePath = getKitchenWorktopBackGuidePath(worktop.params, group.ctx.worktopBackOffsetMm);
      let info = null as ReturnType<typeof getKitchenCornerPlacementInfo> | null;
      const requestedCornerIndex = typeof opts?.cornerIndex === "number" ? Math.round(opts.cornerIndex) : null;
      const candidateCornerIndexes =
        requestedCornerIndex != null
          ? [requestedCornerIndex]
          : Array.from({ length: Math.max(0, guidePath.length - 2) }, (_, index) => index + 1);
      for (const cornerIndex of candidateCornerIndexes) {
        info = getKitchenCornerPlacementInfo(worktop, cornerIndex, group.ctx.worktopBackOffsetMm, inst);
        if (info?.valid) break;
      }
      if (!info) throw new Error("Debug kitchen corner not available.");
      inst.kitchenPlacement = { ...info.binding };
      applyKitchenPlacementBinding(inst, inst.kitchenPlacement, group.ctx.worktopBackOffsetMm);
    } else {
      const info = getKitchenGuideSegmentInfo(worktop, opts?.segmentIndex ?? 0, group.ctx.worktopBackOffsetMm);
      if (!info) throw new Error("Debug guide segment not available.");

      if (moduleStaysOutsideKitchenWorktop(inst)) {
        const desiredAlongM = clampNumber((opts?.offsetAlongMm ?? 700) / 1000, 0, info.length);
        const cursorWorld = info.start
          .clone()
          .addScaledVector(info.dir, desiredAlongM)
          .addScaledVector(info.frontNormal, Math.max(0.05, worktop.params.depthMm / 2000));
        const tallConstraint = getTallKitchenPlacementConstraint(inst, cursorWorld, [worktop], group.ctx.worktopBackOffsetMm);
        if (!tallConstraint) throw new Error("Debug tall placement not available.");
        inst.kitchenPlacement = tallConstraint.kitchenPlacement ?? null;
        inst.root.position.copy(tallConstraint.position);
        inst.root.rotation.y = tallConstraint.rotationY;
        inst.root.position.y = getKitchenModulePlacementY(inst, groupId);
        inst.root.updateMatrixWorld(true);
      } else {
      const desiredAlongM = (opts?.offsetAlongMm ?? 700) / 1000;
      inst.kitchenPlacement = {
        kind: "segment",
        worktopId: worktop.id,
        segmentIndex: opts?.segmentIndex ?? 0,
        offsetAlongM: desiredAlongM
      };
      applyKitchenPlacementBinding(inst, inst.kitchenPlacement, group.ctx.worktopBackOffsetMm);
      }
    }

    layoutRoot.add(inst.root);
    instances.push(inst);
    group.instanceIds = instances.filter((item: any) => item.kitchenGroupId === groupId).map((item: any) => item.id);
    updateLayoutPanel();
    return getDebugKitchenSnapshot(groupId);
  };

  const debugCreateKitchenScenario = (opts?: {
    ctxPatch?: Partial<ReturnType<typeof resolveContext>>;
    path?: FloorBoundaryPoint[];
    justification?: KitchenWorktopJustification;
    mirrored?: boolean;
    addModule?: boolean;
    moduleType?: ModuleParams["type"];
    segmentIndex?: number;
    offsetAlongMm?: number;
    cornerIndex?: number;
  }) => {
    debugResetKitchenScenario();
    ensureLayoutMode();

    const nextCtx = resolveContext({
      ...makeDefaultKitchenContext(catalog),
      ...(opts?.ctxPatch ?? {})
    });
    const groupId = `dbg_kg_${Date.now()}`;
    S.kitchenCtx = structuredClone(nextCtx);
    S.kitchenGroups.push({
      id: groupId,
      name: "Debug Kitchen",
      ctx: structuredClone(nextCtx),
      instanceIds: []
    });

    createKitchenWorktop(
      {
        path: structuredClone(opts?.path ?? [{ x: 0, z: 0 }, { x: 2400, z: 0 }]),
        justification: opts?.justification ?? "back",
        mirrored: !!opts?.mirrored,
        depthMm: nextCtx.worktopDepthMm,
        thicknessMm: nextCtx.worktopThicknessMm,
        heightMm: nextCtx.heightMm,
        overhangSideMm: nextCtx.worktopOverhangSideMm,
        materialId: nextCtx.worktopMaterialId
      },
      groupId,
      { skipHistory: true, id: "dbg_wt1" }
    );

    if (opts?.addModule !== false) {
      debugAddKitchenModule(groupId, {
        type: opts?.moduleType ?? "drawer_low",
        segmentIndex: opts?.segmentIndex ?? 0,
        offsetAlongMm: opts?.offsetAlongMm ?? 700,
        cornerIndex: opts?.cornerIndex
      });
    }

    debugSelectKitchenGroup(groupId);
    return getDebugKitchenSnapshot(groupId);
  };

  const debugPatchKitchenContext = (groupId: string, patch: Partial<ReturnType<typeof resolveContext>>) => {
    const group = S.kitchenGroups.find((item: any) => item.id === groupId) ?? null;
    if (!group) throw new Error(`Kitchen group ${groupId} not found.`);
    const prevCtx = resolveContext(structuredClone(group.ctx));
    const nextCtx = resolveContext({ ...group.ctx, ...patch });
    group.ctx = structuredClone(nextCtx);
    if (S.activeKitchenGroupId === groupId || ctx.getSelectedKitchenGroupId() === groupId) {
      S.kitchenCtx = structuredClone(nextCtx);
    }
    rebuildKitchenGroupLayout(groupId, nextCtx, prevCtx);
    mountProps();
    return getDebugKitchenSnapshot(groupId);
  };

  const debugEnterMeasureTool = () => {
    setToolMeasure();
    return {
      layoutTool: ctx.getLayoutTool(),
      enabled: measureState.enabled
    };
  };

  const debugCreateWall = (params: { aMm: { x: number; z: number }; bMm: { x: number; z: number }; thicknessMm?: number }) => {
    const wall = addWall(
      new THREE.Vector3(params.aMm.x / 1000, 0, params.aMm.z / 1000),
      new THREE.Vector3(params.bMm.x / 1000, 0, params.bMm.z / 1000),
      params.thicknessMm ?? wallDefault.thicknessMm
    );
    return wall ? { id: wall.id, aMm: { ...wall.params.aMm }, bMm: { ...wall.params.bMm } } : null;
  };

  const debugMoveWall = (wallId: string, shiftMm: { x: number; z: number }) => {
    const wall = walls.find((item: any) => item.id === wallId) ?? null;
    if (!wall) throw new Error(`Wall ${wallId} not found.`);
    const oldA = { ...wall.params.aMm };
    const oldB = { ...wall.params.bMm };
    wall.params.aMm = { x: wall.params.aMm.x + shiftMm.x, z: wall.params.aMm.z + shiftMm.z };
    wall.params.bMm = { x: wall.params.bMm.x + shiftMm.x, z: wall.params.bMm.z + shiftMm.z };
    for (const otherWall of walls) {
      if (otherWall.id === wall.id) continue;
      const wa = wallEndpointWhich(otherWall, oldA, wallJoinTolMm);
      if (wa) setWallEndpointMm(otherWall, wa, wall.params.aMm);
      const wb = wallEndpointWhich(otherWall, oldB, wallJoinTolMm);
      if (wb) setWallEndpointMm(otherWall, wb, wall.params.bMm);
    }
    rebuildWall(wall);
    autoJoinAtMmPoint(wall.params.aMm);
    autoJoinAtMmPoint(wall.params.bMm);
    rebuildWallPlanMesh();
    return { id: wall.id, aMm: { ...wall.params.aMm }, bMm: { ...wall.params.bMm } };
  };

  const debugCreateMeasure = (params: {
    aMm: { x: number; z: number };
    bMm: { x: number; z: number };
    normal?: boolean;
  }) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const aRaw = new THREE.Vector3(params.aMm.x / 1000, 0, params.aMm.z / 1000);
    const bRaw = new THREE.Vector3(params.bMm.x / 1000, 0, params.bMm.z / 1000);
    const snappedA = snapPoint2D(aRaw, rect, cam(), 24);
    const snappedB = snapPoint2D(bRaw, rect, cam(), 24, {
      perpendicularFrom: params.normal ? null : snappedA.point
    });
    const a = snappedA.kind === "none" ? aRaw : snappedA.point;
    const b = snappedB.kind === "none" ? bRaw : snappedB.point;
    const aBinding = bindingFromPlanSnap(snappedA, a);
    const bBinding = bindingFromPlanSnap(snappedB, b);

    if (params.normal) {
      const baseDir = b.clone().sub(a).setY(0);
      if (baseDir.lengthSq() < 1e-10) throw new Error("Normal guide requires 2 distinct points.");
      baseDir.normalize();
      const normalDir = new THREE.Vector3(-baseDir.z, 0, baseDir.x).normalize();
      const spanM = Math.max(4, Math.min(30, a.distanceTo(b) * 6));
      return addMeasurement(
        a.clone().addScaledVector(normalDir, -spanM / 2),
        a.clone().addScaledVector(normalDir, spanM / 2),
        aBinding,
        bBinding,
        { kind: "normalGuide" }
      );
    }

    return addMeasurement(a, b, aBinding, bBinding, {
      kind: "distance",
      distanceMm: planarDistanceMm(a, b)
    });
  };

  const debugCreateFloor = (params: FloorParams) => {
    const floor = createFloor(cloneFloorParams(params), { skipHistory: true });
    return { id: floor.id, boundary: structuredClone(floor.params.boundary) };
  };

  const debugSelectFloor = (floorId: string) => {
    setSelectedFloor(floorId);
    return { selectedKind: ctx.getSelectedKind(), selectedFloorId: ctx.getSelectedFloorId() };
  };

  const debugSelectWall = (wallId: string) => {
    setSelectedWall(wallId);
    return { selectedKind: ctx.getSelectedKind(), selectedWallId: ctx.getSelectedWallId() };
  };

  const debugSelectModule = (instanceId: string) => {
    setSelectedModule(instanceId);
    return { selectedKind: ctx.getSelectedKind(), selectedInstanceId: ctx.getSelectedInstanceId() };
  };

  const debugPatchModuleParams = (
    instanceId: string,
    patch: Record<string, unknown>,
    options?: { sourceKey?: string; preserveBackAnchor?: boolean }
  ) => {
    const inst = findInstance(instanceId);
    if (!inst) throw new Error(`Instance ${instanceId} not found.`);
    const previousParams = structuredClone(inst.params);
      inst.params = normalizeModuleParamsForSource(
        {
          ...structuredClone(inst.params),
          ...structuredClone(patch)
        } as ModuleParams,
        options?.sourceKey
      );
    const ok = rebuildInstance(inst, {
        preserveBackAnchor: options?.preserveBackAnchor ?? true,
        previousParams,
        sourceKey: options?.sourceKey
      });
    return {
      ok,
      debug: ctx.getLastRebuildDebug() ? structuredClone(ctx.getLastRebuildDebug()) : null,
      snapshot: getDebugKitchenSnapshot(inst.kitchenGroupId),
      instance: getDebugModuleSnapshot(inst)
    };
  };

  const debugDetectModuleAdjacency = (instanceId: string) => {
    const inst = findInstance(instanceId);
    if (!inst) throw new Error(`Instance ${instanceId} not found.`);
    const box = instanceWorldBox(inst);
    return (instances as LayoutInstance[])
      .filter((other) => other.id !== inst.id && (!inst.kitchenGroupId || other.kitchenGroupId === inst.kitchenGroupId))
      .map((other) => {
        const info = detectModuleAdjacencyInfo(box, instanceWorldBox(other), other.id);
        if (!info) return null;
        return {
          otherId: other.id,
          otherType: other.params.type,
          side: info.side,
          axis: info.axis,
          gapMm: Math.round(info.gap * 1000),
          seamMm: Math.round(info.seam * 1000)
        };
      })
      .filter((value): value is NonNullable<typeof value> => !!value);
  };

  const debugCommitSelectedMeasureValue = (measureId: string, valueMm: number) => {
    const target = getCurrentMeasureSelectionTarget();
    const measure = (measureState as MeasureState).measures.find((item) => item.id === measureId) ?? null;
    const bindings = target && measure ? getSelectionMeasureBindings(measure, target) : null;
    const before = captureLayoutSnapshot(S);
    commitSelectedMeasureValueMm(measureId, String(valueMm));
    const after = captureLayoutSnapshot(S);
    return {
      selectedKind: ctx.getSelectedKind(),
      selectedKitchenGroupId: ctx.getSelectedKitchenGroupId(),
      target:
        target?.kind === "kitchenGroup"
          ? { kind: target.kind, groupId: target.groupId, worktopIds: Array.from(target.worktopIds), instanceIds: Array.from(target.instanceIds) }
          : target,
      bindings,
      before,
      after
    };
  };

  const debugCommitWallMeasureValue = (wallId: string, measureId: string, valueMm: number) => {
    setSelectedWall(wallId);
    commitWallMeasureValueMm(measureId, String(valueMm));
    return getDebugKitchenSnapshot(null);
  };

  const debugProjectPlanPoint = (pointMm: { x: number; z: number }) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const screen = worldToScreen(new THREE.Vector3(pointMm.x / 1000, 0, pointMm.z / 1000), cam(), rect);
    return { x: screen.x, y: screen.y };
  };

  const debugPickAlignLine = (pointMm: { x: number; z: number }) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const world = new THREE.Vector3(pointMm.x / 1000, 0, pointMm.z / 1000);
    const screen = worldToScreen(world, cam(), rect);
    const picked = pickAlignLineAt(world, { x: screen.x, y: screen.y }, rect);
    if (!picked) return null;
    return {
      label: picked.label,
      targetKind: picked.targetKind,
      lineRole: picked.lineRole,
      wallId: picked.wallId ?? null,
      instanceId: picked.instanceId ?? null,
      worktopId: picked.worktopId ?? null,
      segmentIndex: picked.segmentIndex ?? null
    };
  };

  const debugAlignLines = (refMm: { x: number; z: number }, targetMm: { x: number; z: number }) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const refWorld = new THREE.Vector3(refMm.x / 1000, 0, refMm.z / 1000);
    const targetWorld = new THREE.Vector3(targetMm.x / 1000, 0, targetMm.z / 1000);
    const refScreen = worldToScreen(refWorld, cam(), rect);
    const targetScreen = worldToScreen(targetWorld, cam(), rect);
    const ref = pickAlignLineAt(refWorld, { x: refScreen.x, y: refScreen.y }, rect);
    const picked = pickAlignLineAt(targetWorld, { x: targetScreen.x, y: targetScreen.y }, rect);
    if (!ref || !picked) {
      return {
        ok: false,
        ref: ref ? { label: ref.label, targetKind: ref.targetKind, lineRole: ref.lineRole } : null,
        picked: picked ? { label: picked.label, targetKind: picked.targetKind, lineRole: picked.lineRole } : null
      };
    }
    const result = applyAlignBetweenPickedLines(ref, picked);
    if (result.ok) {
      updateSelectionHighlights();
      commitHistory(S);
      mountProps();
    }
    return {
      ok: result.ok,
      reason: result.reason,
      ref: { label: ref.label, targetKind: ref.targetKind, lineRole: ref.lineRole },
      picked: {
        label: picked.label,
        targetKind: picked.targetKind,
        lineRole: picked.lineRole,
        wallId: picked.wallId ?? null,
        instanceId: picked.instanceId ?? null,
        worktopId: picked.worktopId ?? null,
        segmentIndex: picked.segmentIndex ?? null
      }
    };
  };

  const debugPlanSnap = (
    pointMm: { x: number; z: number },
    options?: { perpendicularFromMm?: { x: number; z: number } | null }
  ) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const snapped = snapPoint2D(new THREE.Vector3(pointMm.x / 1000, 0, pointMm.z / 1000), rect, cam(), 24, {
      perpendicularFrom: options?.perpendicularFromMm
        ? new THREE.Vector3(options.perpendicularFromMm.x / 1000, 0, options.perpendicularFromMm.z / 1000)
        : null
    });
    return {
      kind: snapped.kind,
      owner: snapped.owner ?? null,
      pointMm: {
        x: Math.round(snapped.point.x * 1000),
        z: Math.round(snapped.point.z * 1000)
      }
    };
  };

  const debugMeasureState = () => ({
    layoutTool: ctx.getLayoutTool(),
    enabled: measureState.enabled,
    firstPointMm: measureState.firstPoint
      ? { x: Math.round(measureState.firstPoint.x * 1000), z: Math.round(measureState.firstPoint.z * 1000) }
      : null,
    measures: (measureState as MeasureState).measures.map((item) => ({
      id: item.id,
      kind: item.kind,
      aBinding: item.aBinding,
      bBinding: item.bBinding,
      aMm: { x: Math.round(item.a.x * 1000), z: Math.round(item.a.z * 1000) },
      bMm: { x: Math.round(item.b.x * 1000), z: Math.round(item.b.z * 1000) }
    }))
  });

  const debugViewState = () => {
    const activeCam = cam();
    const sceneDebug = getSceneDebugState();
    return {
      viewMode: ctx.getViewMode(),
      activeViewerTab: ctx.getActiveViewerTab(),
      layoutTool: ctx.getLayoutTool(),
      wallCount: walls.length,
      wallPlanVisible: wallPlanGroup.visible,
      wallPlanChildren: wallPlanGroup.children.length,
      clippingPlanes: renderer.clippingPlanes.length,
      detailSliceVisible: detailSliceGroup.visible,
      detailSliceChildren: detailSliceGroup.children.length,
      camera: {
        type: activeCam.type,
        position: { x: activeCam.position.x, y: activeCam.position.y, z: activeCam.position.z },
        target: { x: ctl().target.x, y: ctl().target.y, z: ctl().target.z },
        zoom: activeCam instanceof THREE.OrthographicCamera ? activeCam.zoom : null,
        left: activeCam instanceof THREE.OrthographicCamera ? activeCam.left : null,
        right: activeCam instanceof THREE.OrthographicCamera ? activeCam.right : null,
        top: activeCam instanceof THREE.OrthographicCamera ? activeCam.top : null,
        bottom: activeCam instanceof THREE.OrthographicCamera ? activeCam.bottom : null
      },
      scene: {
        planOverlayVisible: sceneDebug.planOverlayVisible,
        planAmbientVisible: sceneDebug.planAmbientVisible
      },
      walls: (walls as WallInstance[]).map((wall) => ({
        id: wall.id,
        meshVisible: wall.mesh.visible,
        outlineVisible: wall.outline.visible,
        aMm: { ...wall.params.aMm },
        bMm: { ...wall.params.bMm }
      }))
    };
  };

  const debugLayoutSnapshot = () => captureLayoutSnapshot(S);

  window.__kitchenDebug = {
    reset: debugResetKitchenScenario,
    selectKitchenGroup: debugSelectKitchenGroup,
    createKitchenScenario: debugCreateKitchenScenario,
    addKitchenModule: debugAddKitchenModule,
    patchKitchenContext: debugPatchKitchenContext,
    createWall: debugCreateWall,
    createFloor: debugCreateFloor,
    moveWall: debugMoveWall,
    createMeasure: debugCreateMeasure,
    selectWall: debugSelectWall,
    selectFloor: debugSelectFloor,
    selectModule: debugSelectModule,
    patchModuleParams: debugPatchModuleParams,
    detectModuleAdjacency: debugDetectModuleAdjacency,
    commitWallMeasureValue: debugCommitWallMeasureValue,
    commitSelectedMeasureValue: debugCommitSelectedMeasureValue,
    snapshot: getDebugKitchenSnapshot,
    enterMeasureTool: debugEnterMeasureTool,
    projectPlanPoint: debugProjectPlanPoint,
    pickAlignLine: debugPickAlignLine,
    alignLines: debugAlignLines,
    planSnap: debugPlanSnap,
    measureState: debugMeasureState,
    viewState: debugViewState,
    layoutSnapshot: debugLayoutSnapshot
  };
}
