import * as THREE from "three";
import { disposeObject3D } from "../core/dispose";
import { reportEditorToolEntryStatus } from "./editorToolEntryController";
import { buildSectionMarkerGeometry } from "./sectionViews";
import type { FloorBoundaryPoint, SectionInstance, SectionParams } from "./localTypes";
import type { PlanSnapResult } from "./planSnap";
import type { SnapOverlayController } from "./snapOverlay";

type SectionDrawState = {
  active: boolean;
  mirrored: boolean;
  axisLocked: boolean;
  a: FloorBoundaryPoint | null;
  hoverPoint: FloorBoundaryPoint | null;
  previewRoot: THREE.Group | null;
  previewLine: THREE.LineSegments | null;
  previewArrows: THREE.LineSegments | null;
};

type SectionDrawControllerContext = {
  layoutRoot: THREE.Group;
  sectionDraw: SectionDrawState;
  drawSnapOverlay: SnapOverlayController;
  setSectionDrawSnap: (next: PlanSnapResult | null) => void;
  hideHoverCursor: () => void;
  setUnderlayStatus: (text: string) => void;
  mountProps: () => void;
  createSectionInstance: (params: SectionParams) => SectionInstance;
  getNextSectionName: () => string;
  setSelectedSection: (id: string | null) => void;
  activateViewerTab: (key: string) => void;
};

export function createSectionDrawController(ctx: SectionDrawControllerContext) {
  const updateSectionDrawPreview = () => {
    const { sectionDraw } = ctx;
    if (!sectionDraw.a || !sectionDraw.hoverPoint) {
      if (sectionDraw.previewRoot) sectionDraw.previewRoot.visible = false;
      return;
    }
    if (!sectionDraw.previewRoot) {
      sectionDraw.previewRoot = new THREE.Group();
      sectionDraw.previewRoot.name = "sectionDrawPreview";
      sectionDraw.previewLine = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
      );
      sectionDraw.previewLine.renderOrder = 66;
      sectionDraw.previewArrows = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
      );
      sectionDraw.previewArrows.renderOrder = 67;
      sectionDraw.previewRoot.add(sectionDraw.previewLine, sectionDraw.previewArrows);
      ctx.layoutRoot.add(sectionDraw.previewRoot);
    }
    const params: SectionParams = {
      name: "",
      aMm: { x: sectionDraw.a.x, z: sectionDraw.a.z },
      bMm: { x: sectionDraw.hoverPoint.x, z: sectionDraw.hoverPoint.z },
      mirrored: sectionDraw.mirrored
    };
    const geom = buildSectionMarkerGeometry(params);
    sectionDraw.previewLine!.geometry.dispose();
    sectionDraw.previewLine!.geometry = geom.line;
    sectionDraw.previewArrows!.geometry.dispose();
    sectionDraw.previewArrows!.geometry = geom.arrows;
    const color = sectionDraw.axisLocked ? 0x2ac46d : 0x3ddc97;
    (sectionDraw.previewLine!.material as THREE.LineBasicMaterial).color.setHex(color);
    (sectionDraw.previewArrows!.material as THREE.LineBasicMaterial).color.setHex(color);
    sectionDraw.previewRoot.visible = true;
  };

  const cancelSectionDraw = (opts?: { silent?: boolean }) => {
    const { sectionDraw } = ctx;
    sectionDraw.active = false;
    sectionDraw.mirrored = false;
    sectionDraw.axisLocked = false;
    sectionDraw.a = null;
    sectionDraw.hoverPoint = null;
    ctx.setSectionDrawSnap(null);
    if (sectionDraw.previewRoot) {
      ctx.layoutRoot.remove(sectionDraw.previewRoot);
      disposeObject3D(sectionDraw.previewRoot);
      sectionDraw.previewRoot = null;
      sectionDraw.previewLine = null;
      sectionDraw.previewArrows = null;
    }
    ctx.hideHoverCursor();
    ctx.drawSnapOverlay.hide();
    if (!opts?.silent) {
      reportEditorToolEntryStatus(ctx, "");
    }
  };

  const commitSectionDraw = (bMm: FloorBoundaryPoint) => {
    const { sectionDraw } = ctx;
    if (!sectionDraw.a) return false;
    if (Math.hypot(bMm.x - sectionDraw.a.x, bMm.z - sectionDraw.a.z) < 5) return false;
    const section = ctx.createSectionInstance({
      name: ctx.getNextSectionName(),
      aMm: { x: sectionDraw.a.x, z: sectionDraw.a.z },
      bMm,
      mirrored: sectionDraw.mirrored
    });
    cancelSectionDraw({ silent: true });
    ctx.setSelectedSection(section.id);
    ctx.activateViewerTab(`section:${section.id}`);
    reportEditorToolEntryStatus(ctx, `Section ${section.params.name} created.`);
    return true;
  };

  return {
    updateSectionDrawPreview,
    cancelSectionDraw,
    commitSectionDraw
  };
}
