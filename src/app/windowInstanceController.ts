import * as THREE from "three";
import type { WallId, WindowInstance, WindowParams } from "./localTypes";

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
  getWindowInst: () => WindowInstance | null;
  setWindowOpening: (opening: WindowOpening) => void;
  setWindowCutout: (cutout: WindowCutout) => void;
  updateWindowTransform: (inst: WindowInstance) => void;
};

export function createWindowInstanceController(ctx: WindowInstanceControllerContext) {
  const createWindow = (defaultWall: WallId = "back") => {
    const params: WindowParams = {
      wall: defaultWall,
      widthMm: 900,
      heightMm: 900,
      sillHeightMm: 900,
      centerMm: 0
    };

    const root = new THREE.Group();
    root.name = "windowRoot";

    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), new THREE.MeshBasicMaterial({ visible: false }));
    pick.name = "windowPick";
    pick.userData.kind = "window";
    root.add(pick);

    const outline = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false })
    );
    outline.name = "windowOutline";
    outline.renderOrder = 57;
    root.add(outline);

    const inst: WindowInstance = { params, root, pick, outline };
    ctx.updateWindowTransform(inst);
    return inst;
  };

  const clampWindowParams = (p: WindowParams) => {
    const widthMm = Math.max(200, Math.min(4800, Math.round(p.widthMm)));
    const heightMm = Math.max(200, Math.min(2600, Math.round(p.heightMm)));
    const maxSill = Math.max(0, Math.round(ctx.roomHeightM * 1000 - heightMm));
    const sillHeightMm = Math.max(0, Math.min(Math.round(p.sillHeightMm), maxSill));

    const axisHalfMm = ctx.wallDefs[p.wall].axisHalf * 1000;
    const maxCenter = Math.max(0, axisHalfMm - widthMm / 2);
    const centerMm = Math.max(-maxCenter, Math.min(Math.round(p.centerMm), maxCenter));

    return { ...p, widthMm, heightMm, sillHeightMm, centerMm };
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
