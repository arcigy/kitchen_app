import * as THREE from "three";
import {
  computeOverlaps,
  findSelectableMeshByName,
  getSelectableMeshes,
  readDimensionsMm,
  readGrainAlong,
  renderErrors
} from "./sharedUtils";
import { buildModule } from "../geometry/buildModule";
import { disposeObject3D } from "../core/dispose";
import { getModuleDescriptorOrThrow } from "../modules/registry";
import { validateModule, type ModuleParams } from "../model/cabinetTypes";
import type { AppArgs } from "./bootstrap";
import type { PartRow, OverlapRow } from "../ui/createPartPanel";

type ParamHighlightControls = {
  highlightParamKeys?: (keys: string[]) => void;
  clearHighlights?: () => void;
};

type BuildModePanel = {
  setRows: (rows: PartRow[]) => void;
  setOverlaps: (rows: OverlapRow[]) => void;
  setSelected: (name: string | null) => void;
};

type BuildModeControllerContext = {
  args: AppArgs & {
    errorsEl: HTMLElement;
    exportOutEl: HTMLTextAreaElement;
  };
  cam: () => THREE.Camera;
  clearOverlapHighlight: () => void;
  ctl: () => { target: THREE.Vector3; update: () => void };
  editorHost: HTMLElement;
  hasImportedModules: boolean;
  hiddenParts: Set<string>;
  noModulesMessage: string;
  partPanel: BuildModePanel;
  scene: THREE.Scene;
  selectMesh: (mesh: THREE.Mesh | null) => void;
  activeBuildControls: ParamHighlightControls | null;
  cabinetGroup: THREE.Group | null;
  params: ModuleParams;
  selectedMesh: THREE.Mesh | null;
};

export function createBuildModeController(ctx: BuildModeControllerContext) {
  const mountControls = () => {
    ctx.editorHost.innerHTML = "";
    ctx.activeBuildControls = null;

    if (!ctx.hasImportedModules) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = ctx.noModulesMessage;
      ctx.editorHost.appendChild(empty);
      renderErrors(ctx.args.errorsEl, [ctx.noModulesMessage]);
      return;
    }

    const worktopArgs = { getWorktopThicknessMm: () => 0 };
    ctx.activeBuildControls = getModuleDescriptorOrThrow(ctx.params.type).createControls(ctx.editorHost, ctx.params, {
      ...worktopArgs,
      onChange: () => afterParamsChanged()
    });
  };

  const afterParamsChanged = () => {
    rebuild();
    ctx.args.exportOutEl.value = "";
  };

  const rebuild = () => {
    if (!ctx.hasImportedModules) {
      renderErrors(ctx.args.errorsEl, [ctx.noModulesMessage]);
      if (ctx.cabinetGroup) {
        ctx.scene.remove(ctx.cabinetGroup);
        disposeObject3D(ctx.cabinetGroup);
        ctx.cabinetGroup = null;
      }
      ctx.args.exportOutEl.value = "";
      return;
    }

    const errors = validateModule(ctx.params);
    renderErrors(ctx.args.errorsEl, errors);
    if (errors.length > 0) return;

    const next = buildModule(ctx.params);

    if (ctx.cabinetGroup) {
      ctx.scene.remove(ctx.cabinetGroup);
      disposeObject3D(ctx.cabinetGroup);
    }
    ctx.cabinetGroup = next;
    ctx.scene.add(ctx.cabinetGroup);

    const parts = getSelectableMeshes(ctx.cabinetGroup).map((mesh) => {
      mesh.visible = !ctx.hiddenParts.has(mesh.name);
      return {
        name: mesh.name,
        visible: mesh.visible,
        dimensionsMm: readDimensionsMm(mesh),
        grainAlong: readGrainAlong(mesh)
      };
    });
    ctx.partPanel.setRows(parts);
    ctx.partPanel.setOverlaps(computeOverlaps(ctx.cabinetGroup));
    ctx.clearOverlapHighlight();

    if (ctx.selectedMesh) {
      const keepName = ctx.selectedMesh.name;
      const nextSelected = findSelectableMeshByName(ctx.cabinetGroup, keepName);
      ctx.selectMesh(nextSelected && nextSelected.visible ? nextSelected : null);
    } else {
      ctx.partPanel.setSelected(null);
    }

    const box = new THREE.Box3().setFromObject(ctx.cabinetGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const controls = ctx.ctl();
    const camera = ctx.cam() as THREE.PerspectiveCamera;
    controls.target.copy(center);
    camera.position.set(center.x + maxDim * 0.9, center.y + maxDim * 0.6, center.z + maxDim * 1.2);
    camera.near = Math.max(0.001, maxDim / 1000);
    camera.far = Math.max(50, maxDim * 20);
    camera.updateProjectionMatrix();
    controls.update();
  };

  return { afterParamsChanged, mountControls, rebuild };
}
