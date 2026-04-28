import * as THREE from "three";
import { computeGrainArrow, findSelectableMeshByName, toggleSelectedPbr } from "./sharedUtils";

export function createBuildSelectionController(ctx: any) {
  const selectMesh = (mesh: THREE.Mesh | null) => {
    ctx.selectedMesh = mesh;

    if (ctx.selectedBox) {
      ctx.scene.remove(ctx.selectedBox);
      ctx.selectedBox.geometry.dispose();
      (ctx.selectedBox.material as THREE.Material).dispose();
      ctx.selectedBox = null;
    }

    if (ctx.grainArrow) {
      ctx.scene.remove(ctx.grainArrow);
      (ctx.grainArrow.line.material as THREE.Material).dispose();
      (ctx.grainArrow.cone.material as THREE.Material).dispose();
      ctx.grainArrow = null;
    }

    if (!mesh) {
      ctx.activeBuildControls?.clearHighlights?.();
      ctx.partPanel.setSelected(null);
      return;
    }

    ctx.partPanel.setSelected(mesh.name);
    ctx.activeBuildControls?.highlightParamKeys?.(((mesh as any).userData?.paramKeys as string[] | undefined) ?? []);

    ctx.selectedBox = new THREE.BoxHelper(mesh, 0xffe066);
    ctx.selectedBox.name = "selectionBox";
    ctx.scene.add(ctx.selectedBox);

    const grain = computeGrainArrow(mesh);
    if (grain) {
      ctx.grainArrow = new THREE.ArrowHelper(grain.dir, grain.origin, grain.length, 0x3ddc97, grain.length * 0.22, grain.length * 0.12);
      ctx.grainArrow.name = "grainArrow";
      ctx.grainArrow.visible = false;
    }
  };

  window.addEventListener("keydown", (ev) => {
    if (ctx.S.kitchenEditMode) return;
    if (!ctx.selectedMesh) return;
    const k = ev.key.toLowerCase();
    if (k === "p") toggleSelectedPbr(ctx.selectedMesh, "all");
    if (k === "n") toggleSelectedPbr(ctx.selectedMesh, "normal");
    if (k === "r") toggleSelectedPbr(ctx.selectedMesh, "roughness");
  });

  const selectByName = (name: string) => {
    const mesh = ctx.cabinetGroup ? findSelectableMeshByName(ctx.cabinetGroup, name) : null;
    if (!mesh || !mesh.visible) {
      selectMesh(null);
      return;
    }
    selectMesh(mesh);
  };

  const setVisibleByName = (name: string, visible: boolean) => {
    if (visible) ctx.hiddenParts.delete(name);
    else ctx.hiddenParts.add(name);

    const mesh = ctx.cabinetGroup ? findSelectableMeshByName(ctx.cabinetGroup, name) : null;
    if (mesh) mesh.visible = visible;

    ctx.partPanel.updateVisibility(name, visible);

    if (ctx.selectedMesh?.name === name && !visible) selectMesh(null);
  };

  const clearOverlapHighlight = () => {
    for (const o of ctx.overlapBoxes) {
      ctx.scene.remove(o.helper);
      o.helper.geometry.dispose();
      (o.helper.material as THREE.Material).dispose();
    }
    ctx.overlapBoxes = [];
  };

  const showForHighlight = (name: string) => {
    if (ctx.hiddenParts.has(name)) {
      ctx.hiddenParts.delete(name);
      const mesh = ctx.cabinetGroup ? findSelectableMeshByName(ctx.cabinetGroup, name) : null;
      if (mesh) mesh.visible = true;
      ctx.partPanel.updateVisibility(name, true);
    }
  };

  const highlightOverlap = (a: string, b: string) => {
    if (!ctx.cabinetGroup) return;

    showForHighlight(a);
    showForHighlight(b);

    const ma = findSelectableMeshByName(ctx.cabinetGroup, a);
    const mb = findSelectableMeshByName(ctx.cabinetGroup, b);
    if (!ma || !mb) return;

    clearOverlapHighlight();

    const ha = new THREE.BoxHelper(ma, 0xff6b6b);
    const hb = new THREE.BoxHelper(mb, 0xffd166);
    ctx.scene.add(ha);
    ctx.scene.add(hb);
    ctx.overlapBoxes = [
      { mesh: ma, helper: ha },
      { mesh: mb, helper: hb }
    ];
  };

  return { clearOverlapHighlight, highlightOverlap, selectByName, selectMesh, setVisibleByName };
}
