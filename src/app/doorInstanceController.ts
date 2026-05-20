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

const markIfcDoor = (object: THREE.Object3D, doorId: string, objectType = "door") => {
  object.userData.kind = object.userData.kind ?? "door";
  object.userData.doorId = doorId;
  object.userData.ifc = {
    className: "IfcDoor",
    predefinedType: "DOOR",
    elementId: doorId,
    objectType,
    name: `Door ${doorId}`
  };
  object.userData.tags = Array.from(new Set([...(Array.isArray(object.userData.tags) ? object.userData.tags : []), "door", "ifc", "IfcDoor"]));
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
    swingSide: "inward",
    swingAngleDeg: 90,
    handleType: "lever",
    handleOffsetMm: 85,
    handleHeightMm: 1050,
    materialId: getDoorMaterialOption(null).id
  });

  const createDoor = (defaultWall: WallId = "back", wallId: string | null = null, opts: { id?: string } = {}) => {
    const id = opts.id ?? ctx.nextDoorId();
    const params = defaultParams(defaultWall, wallId);

    const root = new THREE.Group();
    root.name = `doorRoot_${id}`;
    markIfcDoor(root, id, "assembly");

    const frame = new THREE.Group();
    frame.name = "doorFrame";
    markIfcDoor(frame, id, "frame");
    root.add(frame);

    const plan = new THREE.Group();
    plan.name = "doorPlanSymbol";
    plan.visible = false;
    markIfcDoor(plan, id, "plan_symbol");
    root.add(plan);

    const selection = new THREE.Group();
    selection.name = "doorSelection";
    selection.visible = false;
    markIfcDoor(selection, id, "selection_overlay");
    root.add(selection);

    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), new THREE.MeshBasicMaterial({ visible: false }));
    pick.name = "doorPick";
    markIfcDoor(pick, id, "pick_proxy");
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
    markIfcDoor(outline, id, "outline");
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
    p.swingSide = p.swingSide === "outward" ? "outward" : "inward";
    p.swingAngleDeg = Math.max(1, Math.min(180, Math.round(Number(p.swingAngleDeg) || 90)));
    p.handleType = p.handleType === "none" || p.handleType === "knob" || p.handleType === "bar" ? p.handleType : "lever";
    p.handleOffsetMm = nonNegativeMm(p.handleOffsetMm, 85);
    p.handleHeightMm = nonNegativeMm(p.handleHeightMm, 1050);
    p.materialId = getDoorMaterialOption(p.materialId).id;
    return p;
  };

  return {
    createDoor,
    clampDoorParams
  };
}
