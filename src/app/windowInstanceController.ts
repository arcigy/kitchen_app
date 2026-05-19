import * as THREE from "three";
import type { WallId, WallInstance, WindowInstance, WindowParams } from "./localTypes";
import { getWindowMaterialOption } from "./windowMaterials";

type WindowWallDefinition = {
  axisHalf: number;
};

type WindowOpening = {
  center: THREE.Vector3;
  inwardNormal: THREE.Vector3;
  width: number;
  height: number;
} | null;

type WindowCutout = {
  wall: "back" | "left" | "right";
  centerAxisM: number;
  sillM: number;
  widthM: number;
  heightM: number;
} | null;

type WindowInstanceControllerContext = {
  roomHeightM: number;
  wallDefs: Record<WallId, WindowWallDefinition>;
  walls: WallInstance[];
  getWindowInst: () => WindowInstance | null;
  nextWindowId: () => string;
  setWindowOpening: (opening: WindowOpening) => void;
  setWindowCutout: (cutout: WindowCutout) => void;
  updateWindowTransform: (inst: WindowInstance) => void;
};

export function createWindowInstanceController(ctx: WindowInstanceControllerContext) {
  const defaultParams = (defaultWall: WallId, wallId: string | null): WindowParams => ({
    wall: defaultWall,
    wallId,
    widthMm: 900,
    heightMm: 900,
    sillHeightMm: 900,
    centerMm: 0,
    frameWidthMm: 70,
    offsetFromInteriorMm: 20,
    sashWidthMm: 48,
    sashProfileDepthMm: 56,
    frameProfileDepthMm: 72,
    swingDirection: "left",
    swingSide: "inward",
    swingAngleDeg: 90,
    handleType: "lever",
    handleOffsetMm: 70,
    handleHeightMm: 450,
    materialId: getWindowMaterialOption(null).id
  });

  const createWindow = (defaultWall: WallId = "back", wallId: string | null = null, opts: { id?: string } = {}) => {
    const id = opts.id ?? ctx.nextWindowId();
    const params: WindowParams = {
      ...defaultParams(defaultWall, wallId)
    };

    const root = new THREE.Group();
    root.name = `windowRoot_${id}`;
    root.userData.windowId = id;

    const frame = new THREE.Group();
    frame.name = "windowFrame";
    frame.userData.windowId = id;
    root.add(frame);

    const plan = new THREE.Group();
    plan.name = "windowPlanSymbol";
    plan.visible = false;
    plan.userData.windowId = id;
    root.add(plan);

    const selection = new THREE.Group();
    selection.name = "windowSelection";
    selection.visible = false;
    selection.userData.windowId = id;
    root.add(selection);

    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), new THREE.MeshBasicMaterial({ visible: false }));
    pick.name = "windowPick";
    pick.userData.kind = "window";
    pick.userData.windowId = id;
    pick.userData.viewDisplaySkipEdges = true;
    pick.userData.viewDisplaySkipMaterialRestore = true;
    root.add(pick);

    const outline = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false })
    );
    outline.name = "windowOutline";
    outline.renderOrder = 57;
    outline.visible = false;
    outline.userData.windowId = id;
    root.add(outline);

    const inst: WindowInstance = { id, params, root, frame, plan, selection, pick, outline };
    ctx.updateWindowTransform(inst);
    return inst;
  };

  const clampWindowParams = (p: WindowParams) => {
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
    p.heightMm = positiveMm(p.heightMm, 900);
    p.sillHeightMm = nonNegativeMm(p.sillHeightMm, 900);
    p.centerMm = anyMm(p.centerMm, 0);
    p.frameWidthMm = nonNegativeMm(p.frameWidthMm, 70);
    p.offsetFromInteriorMm = nonNegativeMm(p.offsetFromInteriorMm, 20);
    p.sashWidthMm = nonNegativeMm(p.sashWidthMm, 48);
    p.sashProfileDepthMm = positiveMm(p.sashProfileDepthMm, 56);
    p.frameProfileDepthMm = positiveMm(p.frameProfileDepthMm, 72);
    p.swingDirection = p.swingDirection === "right" ? "right" : "left";
    p.swingSide = p.swingSide === "outward" ? "outward" : "inward";
    p.swingAngleDeg = Math.max(1, Math.min(180, positiveMm(p.swingAngleDeg, 90)));
    p.handleType = p.handleType === "none" || p.handleType === "knob" || p.handleType === "bar" ? p.handleType : "lever";
    p.handleOffsetMm = nonNegativeMm(p.handleOffsetMm, 70);
    p.handleHeightMm = nonNegativeMm(p.handleHeightMm, 450);
    p.materialId = getWindowMaterialOption(p.materialId).id;
    return p;
  };

  const clearWindowLightIfMissing = () => {
    if (ctx.getWindowInst()) return;
    ctx.setWindowOpening(null);
    ctx.setWindowCutout(null);
  };

  return {
    createWindow,
    clampWindowParams,
    clearWindowLightIfMissing
  };
}
