import * as THREE from "three";
import { disposeObject3D } from "../core/dispose";
import type { AppState } from "../layout/appState";
import { commitHistory } from "../layout/historyManager";
import {
  cloneFloorParams as cloneFloorParamsBase,
  floorMaterialColor,
  makeFloorGeometry,
  makeFloorOutlineGeometry
} from "./floorGeometry";
import type { FloorInstance, FloorParams } from "./localTypes";

type FloorControllerContext = {
  S: AppState;
  layoutRoot: THREE.Group;
  floors: FloorInstance[];
  floorDefault: Pick<FloorParams, "materialId">;
  getFloorCounter: () => number;
  setFloorCounter: (next: number) => void;
  getSelectedFloorId: () => string | null;
  setSelectedFloorId: (next: string | null) => void;
};

export function createFloorController(ctx: FloorControllerContext) {
  const cloneFloorParams = (params: FloorParams): FloorParams =>
    cloneFloorParamsBase(params, ctx.floorDefault.materialId);

  function syncFloorCounter(next: number) {
    ctx.setFloorCounter(next);
    ctx.S.floorCounter = next;
  }

  function rebuildFloor(floor: FloorInstance) {
    floor.params.heightMm = Math.round(floor.params.heightMm);
    floor.params.thicknessMm = Math.max(1, Math.round(floor.params.thicknessMm));
    floor.params.materialId = floor.params.materialId ?? ctx.floorDefault.materialId;
    floor.mesh.geometry.dispose();
    floor.mesh.geometry = makeFloorGeometry(floor.params);
    const mat = floor.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(floorMaterialColor(floor.params.materialId));
    mat.transparent = false;
    mat.opacity = 1;
    mat.depthWrite = true;
    floor.mesh.position.y = floor.params.heightMm / 1000;
    floor.outline.geometry.dispose();
    floor.outline.geometry = makeFloorOutlineGeometry(floor.params);
    floor.outline.position.set(0, 0, 0);
  }

  function createFloor(params: FloorParams, opts?: { id?: string; skipHistory?: boolean }) {
    const currentCounter = ctx.getFloorCounter();
    const id = opts?.id ?? `f${currentCounter}`;
    syncFloorCounter(opts?.id ? currentCounter : currentCounter + 1);
    if (opts?.id) {
      const match = /^f(\d+)$/.exec(id);
      const nextFromId = match ? Number(match[1]) + 1 : NaN;
      if (Number.isFinite(nextFromId) && nextFromId > ctx.getFloorCounter()) {
        syncFloorCounter(nextFromId);
      }
    }

    const root = new THREE.Group();
    root.name = `floor_${id}`;
    const mesh = new THREE.Mesh(
      makeFloorGeometry(params),
      new THREE.MeshBasicMaterial({ color: floorMaterialColor(params.materialId ?? ctx.floorDefault.materialId) })
    );
    mesh.name = `floorMesh_${id}`;
    mesh.userData.kind = "floor";
    mesh.userData.floorId = id;
    mesh.renderOrder = 4;
    mesh.position.y = params.heightMm / 1000;
    root.add(mesh);

    const outline = new THREE.Line(
      makeFloorOutlineGeometry(params),
      new THREE.LineBasicMaterial({ color: 0x5c8cff, transparent: true, opacity: 0.9, depthTest: true, depthWrite: false })
    );
    outline.name = `floorOutline_${id}`;
    outline.userData.kind = "floor";
    outline.userData.floorId = id;
    outline.renderOrder = 55;
    outline.visible = true;
    root.add(outline);

    const floor: FloorInstance = { id, params: cloneFloorParams(params), root, mesh, outline };
    ctx.layoutRoot.add(root);
    ctx.floors.push(floor);
    rebuildFloor(floor);
    if (!opts?.skipHistory) commitHistory(ctx.S);
    return floor;
  }

  function deleteFloor(id: string, opts?: { skipHistory?: boolean }) {
    const index = ctx.floors.findIndex((floor) => floor.id === id);
    if (index < 0) return;
    const floor = ctx.floors[index]!;
    ctx.layoutRoot.remove(floor.root);
    disposeObject3D(floor.root);
    ctx.floors.splice(index, 1);
    if (ctx.getSelectedFloorId() === id) ctx.setSelectedFloorId(null);
    if (!opts?.skipHistory) commitHistory(ctx.S);
  }

  function restoreFloorsFromSnapshot(nextFloors: Array<{ id: string; params: FloorParams }>, nextCounter?: number) {
    for (const floor of ctx.floors.splice(0, ctx.floors.length)) {
      ctx.layoutRoot.remove(floor.root);
      disposeObject3D(floor.root);
    }
    syncFloorCounter(nextCounter ?? 1);
    for (const floor of nextFloors) {
      createFloor(cloneFloorParams(floor.params), { id: floor.id, skipHistory: true });
    }
  }

  return {
    cloneFloorParams,
    rebuildFloor,
    createFloor,
    deleteFloor,
    restoreFloorsFromSnapshot
  };
}
