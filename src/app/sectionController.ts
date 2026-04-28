import * as THREE from "three";
import { disposeObject3D } from "../core/dispose";
import type { AppState } from "../layout/appState";
import { commitHistory } from "../layout/historyManager";
import {
  buildSectionMarkerGeometry,
  cloneSectionParams,
  createSectionPickGeometry
} from "./sectionViews";
import type { SectionInstance, SectionParams, SelectedKind } from "./localTypes";

type SectionControllerContext = {
  S: AppState;
  layoutRoot: THREE.Group;
  sections: SectionInstance[];
  getSectionCounter: () => number;
  setSectionCounter: (next: number) => void;
  getSelectedKind: () => SelectedKind;
  getSelectedSectionId: () => string | null;
  setSelectedSectionId: (next: string | null) => void;
  getMode: () => "build" | "layout";
  getViewMode: () => "2d" | "3d";
  getActiveViewerTab: () => string;
  setActiveViewerTab: (next: string) => void;
  refreshViewerTabs: () => void;
};

export function createSectionController(ctx: SectionControllerContext) {
  function syncSectionCounter(next: number) {
    ctx.setSectionCounter(next);
    ctx.S.sectionCounter = next;
  }

  function updateSectionVisual(section: SectionInstance) {
    const nextParams = cloneSectionParams(section.params);
    section.params = nextParams;

    section.line.geometry.dispose();
    section.arrows.geometry.dispose();
    section.pick.geometry.dispose();

    const geom = buildSectionMarkerGeometry(nextParams);
    section.line.geometry = geom.line;
    section.arrows.geometry = geom.arrows;
    section.pick.geometry = createSectionPickGeometry(nextParams);

    const selected = ctx.getSelectedKind() === "section" && ctx.getSelectedSectionId() === section.id;
    (section.line.material as THREE.LineBasicMaterial).color.setHex(selected ? 0x2ac46d : 0x253245);
    (section.arrows.material as THREE.LineBasicMaterial).color.setHex(selected ? 0x2ac46d : 0x253245);
    const visible = ctx.getMode() === "layout" && ctx.getViewMode() === "2d" && ctx.getActiveViewerTab() === "floorplan";
    section.root.visible = visible;
  }

  const getNextSectionName = () => `Section ${Math.max(1, ctx.sections.length + 1)}`;

  const createSectionInstance = (params: SectionParams, opts?: { id?: string; skipHistory?: boolean }) => {
    const currentCounter = ctx.getSectionCounter();
    const id = opts?.id ?? `s${currentCounter}`;
    syncSectionCounter(opts?.id ? currentCounter : currentCounter + 1);
    if (opts?.id) {
      const match = /^s(\d+)$/.exec(id);
      if (match) syncSectionCounter(Math.max(ctx.getSectionCounter(), Number(match[1]) + 1));
    }

    const root = new THREE.Group();
    root.name = `section_${id}`;

    const line = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x253245, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
    );
    line.name = `sectionLine_${id}`;
    line.renderOrder = 62;
    line.userData.kind = "section";
    line.userData.sectionId = id;
    line.frustumCulled = false;
    root.add(line);

    const arrows = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x253245, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
    );
    arrows.name = `sectionArrows_${id}`;
    arrows.renderOrder = 63;
    arrows.userData.kind = "section";
    arrows.userData.sectionId = id;
    arrows.frustumCulled = false;
    root.add(arrows);

    const pick = new THREE.Mesh(
      new THREE.PlaneGeometry(0.001, 0.001),
      new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0 })
    );
    pick.name = `sectionPick_${id}`;
    pick.userData.kind = "section";
    pick.userData.sectionId = id;
    root.add(pick);

    const section: SectionInstance = { id, params: cloneSectionParams(params), root, line, arrows, pick };
    ctx.layoutRoot.add(root);
    ctx.sections.push(section);
    updateSectionVisual(section);
    ctx.refreshViewerTabs();
    if (!opts?.skipHistory) commitHistory(ctx.S);
    return section;
  };

  const updateAllSectionVisuals = () => {
    for (const section of ctx.sections) updateSectionVisual(section);
    ctx.refreshViewerTabs();
  };

  const deleteSectionInstance = (id: string, opts?: { skipHistory?: boolean }) => {
    const index = ctx.sections.findIndex((section) => section.id === id);
    if (index < 0) return;
    const section = ctx.sections[index]!;
    ctx.layoutRoot.remove(section.root);
    disposeObject3D(section.root);
    ctx.sections.splice(index, 1);
    if (ctx.getSelectedSectionId() === id) ctx.setSelectedSectionId(null);
    if (ctx.getActiveViewerTab() === `section:${id}`) ctx.setActiveViewerTab("floorplan");
    updateAllSectionVisuals();
    if (!opts?.skipHistory) commitHistory(ctx.S);
  };

  const restoreSectionsFromSnapshot = (nextSections: Array<{ id: string; params: SectionParams }>, nextCounter?: number) => {
    for (const section of ctx.sections.splice(0, ctx.sections.length)) {
      ctx.layoutRoot.remove(section.root);
      disposeObject3D(section.root);
    }
    syncSectionCounter(nextCounter ?? 1);
    for (const section of nextSections) {
      createSectionInstance(cloneSectionParams(section.params), { id: section.id, skipHistory: true });
    }
  };

  return {
    updateSectionVisual,
    updateAllSectionVisuals,
    getNextSectionName,
    createSectionInstance,
    deleteSectionInstance,
    restoreSectionsFromSnapshot
  };
}
