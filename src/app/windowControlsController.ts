import * as THREE from "three";
import type { WallId, WindowInstance } from "./localTypes";

type WallDefinition = {
  plane: THREE.Plane;
  inwardNormal: THREE.Vector3;
  axis: "x" | "z";
  fixedPos: THREE.Vector3;
  axisHalf: number;
};

type WindowControlsControllerContext = {
  clampWindowParams: (params: WindowInstance["params"]) => WindowInstance["params"];
  createWindow: (defaultWall?: WallId) => WindowInstance;
  mode: "build" | "layout";
  scene: THREE.Scene;
  setSelectedWindow: () => void;
  setWindowCutout: (cutout: {
    wall: WallId;
    centerAxisM: number;
    sillM: number;
    widthM: number;
    heightM: number;
  }) => void;
  setWindowOpening: (opening: { center: THREE.Vector3; inwardNormal: THREE.Vector3; width: number; height: number }) => void;
  wallDefs: Record<WallId, WallDefinition>;
  windowEditorHost: HTMLElement;
  windowInst: WindowInstance | null;
};

export function createWindowControlsController(ctx: WindowControlsControllerContext) {
  function updateWindowTransform(inst: WindowInstance) {
    inst.params = ctx.clampWindowParams(inst.params);
    const def = ctx.wallDefs[inst.params.wall];

    const widthM = inst.params.widthMm / 1000;
    const heightM = inst.params.heightMm / 1000;
    const centerAxisM = inst.params.centerMm / 1000;

    const y = inst.params.sillHeightMm / 1000 + heightM / 2;
    const pos = def.fixedPos.clone();
    pos.y = y;
    if (def.axis === "x") pos.x = centerAxisM;
    else pos.z = centerAxisM;

    inst.root.position.copy(pos);

    if (inst.params.wall === "back") inst.root.rotation.set(0, 0, 0);
    if (inst.params.wall === "left") inst.root.rotation.set(0, Math.PI / 2, 0);
    if (inst.params.wall === "right") inst.root.rotation.set(0, -Math.PI / 2, 0);

    inst.pick.geometry.dispose();
    inst.pick.geometry = new THREE.BoxGeometry(Math.max(0.05, widthM), Math.max(0.05, heightM), 0.03);
    inst.pick.position.set(0, 0, 0);

    const pts = [
      new THREE.Vector3(-widthM / 2, -heightM / 2, 0.006),
      new THREE.Vector3(widthM / 2, -heightM / 2, 0.006),
      new THREE.Vector3(widthM / 2, heightM / 2, 0.006),
      new THREE.Vector3(-widthM / 2, heightM / 2, 0.006),
      new THREE.Vector3(-widthM / 2, -heightM / 2, 0.006)
    ];
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    inst.outline.geometry.dispose();
    inst.outline.geometry = g;

    const centerWorld = inst.root.getWorldPosition(new THREE.Vector3());
    ctx.setWindowOpening({
      center: centerWorld,
      inwardNormal: def.inwardNormal,
      width: widthM,
      height: heightM
    });

    ctx.setWindowCutout({
      wall: inst.params.wall,
      centerAxisM: centerAxisM,
      sillM: inst.params.sillHeightMm / 1000,
      widthM,
      heightM
    });
  }

  function addOrSelectWindow() {
    if (ctx.mode !== "layout") return;
    if (!ctx.windowInst) {
      ctx.windowInst = ctx.createWindow("back");
      ctx.scene.add(ctx.windowInst.root);
    }
    ctx.setSelectedWindow();
  }

  function mountWindowControls() {
    ctx.windowEditorHost.innerHTML = "";
    if (!ctx.windowInst) return;

    const title = document.createElement("div");
    title.textContent = "Window";
    title.style.margin = "8px 0";
    title.style.fontWeight = "600";
    ctx.windowEditorHost.appendChild(title);

    const row = (label: string, el: HTMLElement) => {
      const wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.gridTemplateColumns = "140px 1fr";
      wrap.style.gap = "8px";
      wrap.style.alignItems = "center";
      const l = document.createElement("div");
      l.textContent = label;
      wrap.appendChild(l);
      wrap.appendChild(el);
      ctx.windowEditorHost.appendChild(wrap);
    };

    const wallSel = document.createElement("select");
    wallSel.innerHTML = `<option value="back">back</option><option value="left">left</option><option value="right">right</option>`;
    wallSel.value = ctx.windowInst.params.wall;
    wallSel.addEventListener("change", () => {
      if (!ctx.windowInst) return;
      ctx.windowInst.params.wall = wallSel.value as WallId;
      updateWindowTransform(ctx.windowInst);
      mountWindowControls();
    });
    row("Wall", wallSel);

    const mkNum = (v: number) => {
      const i = document.createElement("input");
      i.type = "number";
      i.value = String(v);
      i.step = "1";
      return i;
    };

    const width = mkNum(ctx.windowInst.params.widthMm);
    width.addEventListener("input", () => {
      if (!ctx.windowInst) return;
      ctx.windowInst.params.widthMm = Number(width.value);
      updateWindowTransform(ctx.windowInst);
    });
    row("Width (mm)", width);

    const height = mkNum(ctx.windowInst.params.heightMm);
    height.addEventListener("input", () => {
      if (!ctx.windowInst) return;
      ctx.windowInst.params.heightMm = Number(height.value);
      updateWindowTransform(ctx.windowInst);
    });
    row("Height (mm)", height);

    const sill = mkNum(ctx.windowInst.params.sillHeightMm);
    sill.addEventListener("input", () => {
      if (!ctx.windowInst) return;
      ctx.windowInst.params.sillHeightMm = Number(sill.value);
      updateWindowTransform(ctx.windowInst);
    });
    row("Sill (mm)", sill);

    const center = mkNum(ctx.windowInst.params.centerMm);
    center.addEventListener("input", () => {
      if (!ctx.windowInst) return;
      ctx.windowInst.params.centerMm = Number(center.value);
      updateWindowTransform(ctx.windowInst);
    });
    row(ctx.windowInst.params.wall === "back" ? "Center X (mm)" : "Center Z (mm)", center);
  }

  return { updateWindowTransform, mountWindowControls };
}
