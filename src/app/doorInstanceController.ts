import * as THREE from "three";
import type { DoorInstance, DoorParams, WallId, WallInstance } from "./localTypes";
import { getDoorMaterialOption } from "./doorMaterials";

type DoorInstanceControllerContext = {
  roomHeightM: number;
  walls: WallInstance[];
  getDoorInst: () => DoorInstance | null;
  nextDoorId: () => string;
  updateDoorTransform: (inst: DoorInstance) => void;
};

export function createDoorInstanceController(ctx: DoorInstanceControllerContext) {
  const defaultParams = (defaultWall: WallId, wallId: string | null): DoorParams => ({
    wall: defaultWall,
    wallId,
    widthMm: 900,
    heightMm: 2100,
    centerMm: 0,
    frameWidthMm: 70,
    offsetFromInteriorMm: 20,
    panelThicknessMm: 42,
    swingDirection: "left",
    swingAngleDeg: 90,
    materialId: getDoorMaterialOption(null).id
  });

  const createDoor = (defaultWall: WallId = "back", wallId: string | null = null, opts: { id?: string } = {}) => {
    const id = opts.id ?? ctx.nextDoorId();
    const params = defaultParams(defaultWall, wallId);

    const root = new THREE.Group();
    root.name = `doorRoot_${id}`;
    root.userData.doorId = id;

    const frame = new THREE.Group();
    frame.name = "doorFrame";
    frame.userData.doorId = id;
    root.add(frame);

    const plan = new THREE.Group();
    plan.name = "doorPlanSymbol";
    plan.visible = false;
    plan.userData.doorId = id;
    root.add(plan);

    const selection = new THREE.Group();
    selection.name = "doorSelection";
    selection.visible = false;
    selection.userData.doorId = id;
    root.add(selection);

    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), new THREE.MeshBasicMaterial({ visible: false }));
    pick.name = "doorPick";
    pick.userData.kind = "door";
    pick.userData.doorId = id;
    pick.userData.viewDisplaySkipEdges = true;
    pick.userData.viewDisplaySkipMaterialRestore = true;
    root.add(pick);

    const outline = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false })
    );
    outline.name = "doorOutline";
    outline.renderOrder = 57;
    outline.visible = false;
    outline.userData.doorId = id;
    root.add(outline);

    const inst: DoorInstance = { id, params, root, frame, plan, selection, pick, outline };
    ctx.updateDoorTransform(inst);
    return inst;
  };

  const clampDoorParams = (p: DoorParams) => {
    const positiveMm = (value: unknown, fallback: number) => {
      const next = Math.round(Number(value));
      return Number.isFinite(next) ? Math.max(1, next) : fallback;
    };
    const nonNegativeMm = (value: unknown, fallback: number) => {
      const next = Math.round(Number(value));
      return Number.isFinite(next) ? Math.max(0, next) : fallback;
    };
    const anyMm = (value: unknown, fallback: number) => {
      const next = Math.round(Number(value));
      return Number.isFinite(next) ? next : fallback;
    };

    p.wallId = p.wallId ?? null;
    p.widthMm = positiveMm(p.widthMm, 900);
    p.heightMm = positiveMm(p.heightMm, 2100);
    p.centerMm = anyMm(p.centerMm, 0);
    p.frameWidthMm = nonNegativeMm(p.frameWidthMm, 70);
    p.offsetFromInteriorMm = nonNegativeMm(p.offsetFromInteriorMm, 20);
    p.panelThicknessMm = positiveMm(p.panelThicknessMm, 42);
    p.swingDirection = p.swingDirection === "right" ? "right" : "left";
    p.swingAngleDeg = Math.max(1, Math.min(180, Math.round(Number(p.swingAngleDeg) || 90)));
    p.materialId = getDoorMaterialOption(p.materialId).id;
    return p;
  };

  return {
    createDoor,
    clampDoorParams
  };
}
