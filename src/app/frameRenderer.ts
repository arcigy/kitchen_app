import * as THREE from "three";
import { computeGrainArrow, copyM16, matrixChanged } from "./sharedUtils";
import { createSsgiPipeline } from "../rendering/ssgiPipeline";
import { createPhotoPathTracer } from "../rendering/photoPathTracer";
import type { LayoutInstance } from "./localTypes";
import type { RenderMode } from "./renderControls";
import type { SsgiPipeline } from "../rendering/ssgiPipeline";
import type { PhotoPathTracer } from "../rendering/photoPathTracer";

export type FrameRendererContext = {
  viewNavigation: { update: (dt: number) => void };
  ctl: () => { update: () => void };
  enforceWallDrawInvariant: () => void;
  enforceKitchenWorktopDrawInvariant: () => void;
  enforceSectionDrawInvariant: () => void;
  selectedBox: THREE.BoxHelper | null;
  selectedMesh: THREE.Mesh | null;
  selectedInstanceBox: THREE.BoxHelper | null;
  selectedInstanceId: string | null;
  findInstance: (id: string) => LayoutInstance | null;
  grainArrow: THREE.ArrowHelper | null;
  overlapBoxes: Array<{ helper: THREE.BoxHelper; mesh: THREE.Object3D }>;
  refreshAssociativeMeasures: () => void;
  updateMeasureLabels: () => void;
  updateMeasureLabelInteractivity: () => void;
  updateModuleAdjacencyVisuals: () => void;
  updateAlignLockOverlay: () => void;
  updateWallEditHud: () => void;
  updateModuleEditHud: () => void;
  updateDetailViewCamera: () => void;
  cam: () => THREE.Camera;
  renderMode: RenderMode;
  enablePhoto: boolean;
  enableSsgi: boolean;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  viewerEl: HTMLElement;
  ssgi: SsgiPipeline | null;
  ssgiCameraUuid: string | null;
  photo: PhotoPathTracer | null;
  photoCameraUuid: string | null;
  photoLastLightingRevision: number;
  getLightingRevision: () => number;
  photoSamples: HTMLInputElement;
  photoStatus: HTMLElement;
  viewDisplay: { sync: () => void };
  lastCameraWorld: Float32Array;
  lastCameraProj: Float32Array;
  technicalDimensions: { render: () => void };
};

export function renderAppFrame(ctx: FrameRendererContext, dt: number) {
  ctx.viewNavigation.update(dt);
  ctx.ctl().update();
  ctx.enforceWallDrawInvariant();
  ctx.enforceKitchenWorktopDrawInvariant();
  ctx.enforceSectionDrawInvariant();

  if (ctx.selectedBox && ctx.selectedMesh) ctx.selectedBox.setFromObject(ctx.selectedMesh);
  if (ctx.selectedInstanceBox && ctx.selectedInstanceId) {
    const inst = ctx.findInstance(ctx.selectedInstanceId);
    if (inst) ctx.selectedInstanceBox.setFromObject(inst.root);
  }
  if (ctx.grainArrow && ctx.selectedMesh) {
    const grain = computeGrainArrow(ctx.selectedMesh);
    if (grain) {
      ctx.grainArrow.position.copy(grain.origin);
      ctx.grainArrow.setDirection(grain.dir);
      ctx.grainArrow.setLength(grain.length, grain.length * 0.22, grain.length * 0.12);
    }
  }

  for (const o of ctx.overlapBoxes) o.helper.setFromObject(o.mesh);
  ctx.refreshAssociativeMeasures();
  ctx.updateMeasureLabels();
  ctx.updateMeasureLabelInteractivity();
  ctx.updateModuleAdjacencyVisuals();
  ctx.updateAlignLockOverlay();
  ctx.updateWallEditHud();
  ctx.updateModuleEditHud();
  ctx.updateDetailViewCamera();
  ctx.viewDisplay.sync();

  const activeCam = ctx.cam();
  const isPhoto =
    ctx.renderMode === "photo_pathtrace" &&
    ctx.enablePhoto &&
    activeCam instanceof THREE.PerspectiveCamera;
  const isSsgi =
    ctx.renderMode === "realtime_ssgi" &&
    ctx.enableSsgi &&
    activeCam instanceof THREE.PerspectiveCamera;

  if (isPhoto) {
    ctx.ssgi?.dispose();
    ctx.ssgi = null;
    ctx.ssgiCameraUuid = null;

    if (!ctx.photo || ctx.photoCameraUuid !== activeCam.uuid) {
      ctx.photo?.dispose();
      ctx.photo = createPhotoPathTracer({ renderer: ctx.renderer, scene: ctx.scene, camera: activeCam });
      ctx.photoCameraUuid = activeCam.uuid;
      ctx.photoLastLightingRevision = ctx.getLightingRevision();
      ctx.photo.setSize(ctx.viewerEl.clientWidth, ctx.viewerEl.clientHeight);
      ctx.photo.setMaxSamples(Number(ctx.photoSamples.value));
      copyM16(ctx.lastCameraWorld, activeCam.matrixWorld);
      copyM16(ctx.lastCameraProj, activeCam.projectionMatrix);
    }

    const lightingRev = ctx.getLightingRevision();
    if (lightingRev !== ctx.photoLastLightingRevision) {
      ctx.photo.updateFromScene();
      ctx.photoLastLightingRevision = lightingRev;
    }

    if (matrixChanged(ctx.lastCameraWorld, activeCam.matrixWorld) || matrixChanged(ctx.lastCameraProj, activeCam.projectionMatrix)) {
      ctx.photo.updateCamera();
      copyM16(ctx.lastCameraWorld, activeCam.matrixWorld);
      copyM16(ctx.lastCameraProj, activeCam.projectionMatrix);
    }

    ctx.photo.setMaxSamples(Number(ctx.photoSamples.value));
    ctx.photo.renderSample();
    ctx.photoStatus.textContent = `Samples: ${ctx.photo.getSamples()} / ${ctx.photo.getMaxSamples()}`;
  } else if (isSsgi) {
    ctx.photo?.dispose();
    ctx.photo = null;
    ctx.photoCameraUuid = null;
    ctx.photoLastLightingRevision = -1;
    ctx.photoStatus.textContent = "";

    if (!ctx.ssgi || ctx.ssgiCameraUuid !== activeCam.uuid) {
      ctx.ssgi?.dispose();
      ctx.ssgi = createSsgiPipeline({ renderer: ctx.renderer, scene: ctx.scene, camera: activeCam });
      ctx.ssgiCameraUuid = activeCam.uuid;
      ctx.ssgi.setSize(ctx.viewerEl.clientWidth, ctx.viewerEl.clientHeight);
    }
    ctx.ssgi.render(dt);
  } else {
    if (ctx.ssgi) {
      ctx.ssgi.dispose();
      ctx.ssgi = null;
      ctx.ssgiCameraUuid = null;
    }
    if (ctx.photo) {
      ctx.photo.dispose();
      ctx.photo = null;
      ctx.photoCameraUuid = null;
      ctx.photoLastLightingRevision = -1;
      ctx.photoStatus.textContent = "";
    }
    ctx.renderer.render(ctx.scene, activeCam);
  }

  ctx.technicalDimensions.render();
}
