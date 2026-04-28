import * as THREE from "three";
import type { FloorBoundaryPoint, KitchenWorktopInstance, KitchenWorktopParams } from "./localTypes";
import { disposeObject3D } from "../core/dispose";
import { commitHistory } from "../layout/historyManager";
import { sanitizeKitchenWorktopPath } from "../layout/worktopGeometry";
import {
  cloneKitchenWorktopParams,
  kitchenWorktopOutlineColor,
  makeKitchenWorktopBackGuideGeometry,
  makeKitchenWorktopGeometry,
  makeKitchenWorktopMaterial,
  makeKitchenWorktopOutlineGeometry,
  makeKitchenWorktopPreviewGeometry
} from "./kitchenWorktopVisuals";

export type WorktopControllerContext = Record<string, any>;

export function createWorktopController(ctx: WorktopControllerContext) {
  const kitchenWorktops = ctx.kitchenWorktops as KitchenWorktopInstance[];
  const layoutRoot = ctx.layoutRoot as THREE.Group;
  const S = ctx.S;
  const kitchenWorktopDraw = ctx.kitchenWorktopDraw;
  const wallTypedHud = ctx.wallTypedHud as HTMLElement;
  const getKitchenWorktopBackGuidePath = ctx.getKitchenWorktopBackGuidePath as (params: KitchenWorktopParams, backOffsetMm?: number) => THREE.Vector3[];
  const hideHoverCursor = ctx.hideHoverCursor as () => void;
  const showWallSnapMarkersFor = ctx.showWallSnapMarkersFor as (wallId: string | null) => void;
  const setUnderlayStatus = ctx.setUnderlayStatus as (text: string) => void;
  const mountProps = ctx.mountProps as () => void;

  const makeCurrentKitchenWorktopBackGuideGeometry = (params: KitchenWorktopParams) =>
    makeKitchenWorktopBackGuideGeometry(params, getKitchenWorktopBackGuidePath(params));

  function rebuildKitchenWorktop(inst: KitchenWorktopInstance) {
    inst.params = cloneKitchenWorktopParams(inst.params);
    inst.params.path = sanitizeKitchenWorktopPath(inst.params.path);
    inst.params.depthMm = Math.max(1, Math.round(inst.params.depthMm));
    inst.params.thicknessMm = Math.max(1, Math.round(inst.params.thicknessMm));
    inst.params.heightMm = Math.round(inst.params.heightMm);
    inst.params.overhangSideMm = Math.max(0, Math.round(inst.params.overhangSideMm));

    inst.mesh.geometry.dispose();
    inst.mesh.geometry = makeKitchenWorktopGeometry(inst.params);
    const prevMaterial = inst.mesh.material as THREE.Material;
    inst.mesh.material = makeKitchenWorktopMaterial(inst.params.materialId);
    prevMaterial.dispose();
    inst.mesh.position.y = inst.params.heightMm / 1000;
    inst.mesh.castShadow = true;
    inst.mesh.receiveShadow = true;
    inst.mesh.visible = true;
    inst.root.visible = true;

    const flattenWorktopOutline = !(ctx.getViewMode() === "2d" && ctx.getActiveViewerTab() !== "floorplan");
    inst.outline.geometry.dispose();
    inst.outline.geometry = makeKitchenWorktopOutlineGeometry(inst.params, flattenWorktopOutline);
    const outlineMaterial = inst.outline.material as THREE.LineBasicMaterial;
    outlineMaterial.color.setHex(kitchenWorktopOutlineColor(inst.params.materialId));
    inst.outline.position.set(0, inst.params.heightMm / 1000 + (flattenWorktopOutline ? 0.0015 : 0), 0);
    inst.outline.visible = ctx.getViewMode() === "2d";
    const meshMaterial = inst.mesh.material as THREE.MeshStandardMaterial;
    meshMaterial.transparent = ctx.getViewMode() === "2d";
    meshMaterial.opacity = ctx.getViewMode() === "2d" ? 0.35 : 1;
    meshMaterial.depthWrite = ctx.getViewMode() !== "2d";
    inst.root.updateMatrixWorld(true);
  }

  function createKitchenWorktop(
    params: KitchenWorktopParams,
    kitchenGroupId: string,
    opts?: { id?: string; skipHistory?: boolean }
  ) {
    const id = opts?.id ?? ctx.nextWorktopId();
    if (opts?.id) {
      const match = /^wt(\d+)$/.exec(id);
      if (match) ctx.ensureWorktopCounter(Number(match[1]) + 1);
    }

    const root = new THREE.Group();
    root.name = `kitchenWorktopRoot_${id}`;
    root.userData.kind = "kitchenWorktop";
    root.userData.worktopId = id;
    root.userData.kitchenGroupId = kitchenGroupId;

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), makeKitchenWorktopMaterial(params.materialId));
    mesh.name = `kitchenWorktopMesh_${id}`;
    mesh.renderOrder = 16;
    mesh.frustumCulled = false;
    mesh.userData.kind = "kitchenWorktop";
    mesh.userData.worktopId = id;
    mesh.userData.kitchenGroupId = kitchenGroupId;
    root.add(mesh);

    const outline = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: kitchenWorktopOutlineColor(params.materialId),
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        depthWrite: false
      })
    );
    outline.name = `kitchenWorktopOutline_${id}`;
    outline.renderOrder = 60;
    outline.frustumCulled = false;
    outline.userData.kind = "kitchenWorktopOutline";
    outline.userData.worktopId = id;
    outline.userData.kitchenGroupId = kitchenGroupId;
    root.add(outline);

    const inst: KitchenWorktopInstance = {
      id,
      kitchenGroupId,
      params: cloneKitchenWorktopParams(params),
      root,
      mesh,
      outline
    };

    layoutRoot.add(root);
    kitchenWorktops.push(inst);
    ctx.syncWorktopCounter();
    rebuildKitchenWorktop(inst);
    if (!opts?.skipHistory) commitHistory(S);
    return inst;
  }

  function removeKitchenWorktop(id: string, opts?: { skipHistory?: boolean }) {
    const index = kitchenWorktops.findIndex((worktop) => worktop.id === id);
    if (index < 0) return;
    const worktop = kitchenWorktops[index]!;
    layoutRoot.remove(worktop.root);
    disposeObject3D(worktop.root);
    kitchenWorktops.splice(index, 1);
    if (!opts?.skipHistory) commitHistory(S);
  }

  function restoreKitchenWorktopsFromSnapshot(
    nextWorktops: Array<{ id: string; kitchenGroupId: string; params: KitchenWorktopParams }>,
    nextCounter?: number
  ) {
    for (const worktop of kitchenWorktops.splice(0, kitchenWorktops.length)) {
      layoutRoot.remove(worktop.root);
      disposeObject3D(worktop.root);
    }
    ctx.setWorktopCounter(nextCounter ?? 1);
    for (const worktop of nextWorktops) {
      createKitchenWorktop(cloneKitchenWorktopParams(worktop.params), worktop.kitchenGroupId, {
        id: worktop.id,
        skipHistory: true
      });
    }
  }

  const makeKitchenWorktopParamsFromPath = (path: FloorBoundaryPoint[]): KitchenWorktopParams => ({
    path: sanitizeKitchenWorktopPath(path),
    justification: kitchenWorktopDraw.justification,
    mirrored: kitchenWorktopDraw.mirrored,
    depthMm: S.kitchenCtx.worktopDepthMm,
    thicknessMm: S.kitchenCtx.worktopThicknessMm,
    heightMm: S.kitchenCtx.heightMm,
    overhangSideMm: S.kitchenCtx.worktopOverhangSideMm,
    materialId: S.kitchenCtx.worktopMaterialId
  });

  const updateKitchenWorktopPreview = () => {
    if (!kitchenWorktopDraw.active || kitchenWorktopDraw.points.length === 0) return;

    const hoverPoint =
      kitchenWorktopDraw.hoverPoint &&
      Math.hypot(
        kitchenWorktopDraw.hoverPoint.x - (kitchenWorktopDraw.points[kitchenWorktopDraw.points.length - 1]?.x ?? 0),
        kitchenWorktopDraw.hoverPoint.z - (kitchenWorktopDraw.points[kitchenWorktopDraw.points.length - 1]?.z ?? 0)
      ) >= 1
        ? kitchenWorktopDraw.hoverPoint
        : null;
    const previewPath =
      hoverPoint
        ? [...kitchenWorktopDraw.points, hoverPoint]
        : [...kitchenWorktopDraw.points];
    const params = makeKitchenWorktopParamsFromPath(previewPath);
    if (params.path.length < 2) return;
    const signature = JSON.stringify({
      path: params.path,
      justification: params.justification,
      mirrored: params.mirrored,
      depthMm: params.depthMm,
      heightMm: params.heightMm,
      materialId: params.materialId
    });

    if (!kitchenWorktopDraw.previewRoot || !kitchenWorktopDraw.previewMesh || !kitchenWorktopDraw.previewOutline || !kitchenWorktopDraw.previewBackLine) {
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(makeKitchenWorktopPreviewGeometry(params), makeKitchenWorktopMaterial(params.materialId, { preview: true }));
      (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      mesh.frustumCulled = false;
      const outline = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: kitchenWorktopOutlineColor(params.materialId),
          transparent: true,
          opacity: 0.98,
          depthTest: false,
          depthWrite: false
        })
      );
      outline.frustumCulled = false;
      const backLine = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: 0x00c2ff,
          transparent: true,
          opacity: 0.98,
          depthTest: false,
          depthWrite: false
        })
      );
      backLine.frustumCulled = false;
      backLine.renderOrder = 61;
      root.name = "kitchenWorktopPreview";
      root.add(mesh);
      root.add(outline);
      root.add(backLine);
      kitchenWorktopDraw.previewRoot = root;
      kitchenWorktopDraw.previewMesh = mesh;
      kitchenWorktopDraw.previewOutline = outline;
      kitchenWorktopDraw.previewBackLine = backLine;
      layoutRoot.add(root);
    }

    if (kitchenWorktopDraw.previewSignature !== signature) {
      kitchenWorktopDraw.previewMesh.geometry.dispose();
      kitchenWorktopDraw.previewMesh.geometry = makeKitchenWorktopPreviewGeometry(params);

      kitchenWorktopDraw.previewOutline.geometry.dispose();
      kitchenWorktopDraw.previewOutline.geometry = makeKitchenWorktopOutlineGeometry(params);

      kitchenWorktopDraw.previewBackLine.geometry.dispose();
        kitchenWorktopDraw.previewBackLine.geometry = makeCurrentKitchenWorktopBackGuideGeometry(params);
      kitchenWorktopDraw.previewSignature = signature;
    }
    if (kitchenWorktopDraw.previewMaterialId !== params.materialId) {
      const previewMaterial = kitchenWorktopDraw.previewMesh.material as THREE.Material;
      kitchenWorktopDraw.previewMesh.material = makeKitchenWorktopMaterial(params.materialId, { preview: true });
      (kitchenWorktopDraw.previewMesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      previewMaterial.dispose();
      kitchenWorktopDraw.previewMaterialId = params.materialId;
    }
    kitchenWorktopDraw.previewMesh.position.y = params.heightMm / 1000;
    kitchenWorktopDraw.previewMesh.visible = true;

    kitchenWorktopDraw.previewOutline.position.set(0, params.heightMm / 1000 + 0.0015, 0);
    (kitchenWorktopDraw.previewOutline.material as THREE.LineBasicMaterial).color.setHex(kitchenWorktopOutlineColor(params.materialId));
    kitchenWorktopDraw.previewOutline.visible = true;

    kitchenWorktopDraw.previewBackLine.position.set(0, params.heightMm / 1000 + 0.0015, 0);
    kitchenWorktopDraw.previewBackLine.visible = true;

    kitchenWorktopDraw.previewRoot.visible = true;
    kitchenWorktopDraw.previewRoot.updateMatrixWorld(true);
  };

  const scheduleKitchenWorktopPreviewUpdate = () => {
    if (kitchenWorktopDraw.previewUpdatePending) return;
    kitchenWorktopDraw.previewUpdatePending = true;
    requestAnimationFrame(() => {
      kitchenWorktopDraw.previewUpdatePending = false;
      updateKitchenWorktopPreview();
    });
  };

  const cancelKitchenWorktopDraw = (opts?: { silent?: boolean }) => {
    kitchenWorktopDraw.active = false;
    kitchenWorktopDraw.mirrored = false;
    ctx.setWorktopDrawSnap(null);
    kitchenWorktopDraw.points = [];
    kitchenWorktopDraw.hoverPoint = null;
    kitchenWorktopDraw.typedMm = "";
    kitchenWorktopDraw.previewUpdatePending = false;
    kitchenWorktopDraw.previewSignature = "";
    kitchenWorktopDraw.previewMaterialId = "";
    if (kitchenWorktopDraw.previewRoot) {
      layoutRoot.remove(kitchenWorktopDraw.previewRoot);
      disposeObject3D(kitchenWorktopDraw.previewRoot);
      kitchenWorktopDraw.previewRoot = null;
      kitchenWorktopDraw.previewMesh = null;
      kitchenWorktopDraw.previewOutline = null;
      kitchenWorktopDraw.previewBackLine = null;
    }
    hideHoverCursor();
    showWallSnapMarkersFor(ctx.getSelectedKind() === "wall" ? ctx.getSelectedWallId() : null);
    wallTypedHud.textContent = "";
    wallTypedHud.style.display = "none";
    if (!opts?.silent) {
      setUnderlayStatus("");
      mountProps();
    }
  };

  const getKitchenGroupWorktops = (groupId: string) =>
    kitchenWorktops
      .filter((worktop) => worktop.kitchenGroupId === groupId)
      .map((worktop) => ({ id: worktop.id, params: cloneKitchenWorktopParams(worktop.params) }));

  const replaceKitchenGroupWorktops = (
    groupId: string,
    nextWorktops: Array<{ id: string; params: KitchenWorktopParams }>,
    opts?: { skipHistory?: boolean }
  ) => {
    for (let index = kitchenWorktops.length - 1; index >= 0; index -= 1) {
      const worktop = kitchenWorktops[index]!;
      if (worktop.kitchenGroupId !== groupId) continue;
      removeKitchenWorktop(worktop.id, { skipHistory: true });
    }
    for (const worktop of nextWorktops) {
      createKitchenWorktop(cloneKitchenWorktopParams(worktop.params), groupId, {
        id: worktop.id,
        skipHistory: true
      });
    }
    if (!opts?.skipHistory) commitHistory(S);
  };

  const rebuildKitchenGroupWorktops = (groupId: string, ctx = S.kitchenCtx) => {
    for (const worktop of kitchenWorktops) {
      if (worktop.kitchenGroupId !== groupId) continue;
      worktop.params.depthMm = ctx.worktopDepthMm;
      worktop.params.thicknessMm = ctx.worktopThicknessMm;
      worktop.params.heightMm = ctx.heightMm;
      worktop.params.overhangSideMm = ctx.worktopOverhangSideMm;
      worktop.params.materialId = ctx.worktopMaterialId;
      rebuildKitchenWorktop(worktop);
    }
  };

  return {
    makeCurrentKitchenWorktopBackGuideGeometry,
    rebuildKitchenWorktop,
    createKitchenWorktop,
    removeKitchenWorktop,
    restoreKitchenWorktopsFromSnapshot,
    makeKitchenWorktopParamsFromPath,
    updateKitchenWorktopPreview,
    scheduleKitchenWorktopPreviewUpdate,
    cancelKitchenWorktopDraw,
    getKitchenGroupWorktops,
    replaceKitchenGroupWorktops,
    rebuildKitchenGroupWorktops
  };
}
