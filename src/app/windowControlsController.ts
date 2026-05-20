import * as THREE from "three";
import type { WallId, WallInstance, WindowInstance, WindowParams } from "./localTypes";
import { getWindowMaterialOption } from "./windowMaterials";

type WallDefinition = {
  plane: THREE.Plane;
  inwardNormal: THREE.Vector3;
  axis: "x" | "z";
  fixedPos: THREE.Vector3;
  axisHalf: number;
};

type WindowControlsControllerContext = {
  clampWindowParams: (params: WindowInstance["params"]) => WindowInstance["params"];
  commitHistory: () => void;
  createWindow: (defaultWall?: WallId, wallId?: string | null) => WindowInstance;
  ensureFloorplanViewerTab: () => void;
  getActiveViewerTab: () => string;
  getSelectedWallId: () => string | null;
  getViewMode: () => "2d" | "3d";
  layoutRoot: THREE.Group;
  mode: "build" | "layout";
  mountProps: () => void;
  rebuildWall: (wall: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
  scene: THREE.Scene;
  setSelectedWindow: () => void;
  setToolSelect: () => void;
  setUnderlayStatus: (status: string) => void;
  setWindowCutout: (cutout: {
    wall: WallId;
    centerAxisM: number;
    sillM: number;
    widthM: number;
    heightM: number;
  } | null) => void;
  setWindowOpening: (opening: { center: THREE.Vector3; inwardNormal: THREE.Vector3; width: number; height: number } | null) => void;
  wallDefs: Record<WallId, WallDefinition>;
  walls: WallInstance[];
  windowEditorHost: HTMLElement;
  windows: WindowInstance[];
  windowInst: WindowInstance | null;
};

type WallBasis = {
  centerA: THREE.Vector3;
  dir: THREE.Vector3;
  leftNormal: THREE.Vector3;
  exteriorNormal: THREE.Vector3;
  lengthM: number;
  thicknessM: number;
};

type WindowDimensionParam = "widthMm" | "heightMm" | "sillHeightMm";
type WindowSwingControlAction = "toggleHandedness" | "toggleSwingSide";

const disposeObject = (object: THREE.Object3D) => {
  if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry) object.geometry.dispose();
  if ("material" in object) {
    const material = object.material as THREE.Material | THREE.Material[] | undefined;
    const disposeMaterial = (item: THREE.Material) => {
      const map = (item as THREE.Material & { map?: THREE.Texture | null }).map;
      map?.dispose();
      item.dispose();
    };
    if (Array.isArray(material)) for (const item of material) disposeMaterial(item);
    else if (material) disposeMaterial(material);
  }
};

const getWallBasis = (wall: WallInstance): WallBasis | null => {
  const refA = new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000);
  const refB = new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000);
  const dir = refB.clone().sub(refA);
  const lengthM = dir.length();
  if (lengthM < 0.001) return null;
  dir.multiplyScalar(1 / lengthM);
  const leftNormal = new THREE.Vector3(-dir.z, 0, dir.x);
  const exteriorSign = (wall.params.exteriorSign ?? 1) as 1 | -1;
  const thicknessM = Math.max(0.01, wall.params.thicknessMm / 1000);
  const half = thicknessM / 2;
  const justification = wall.params.justification ?? "center";
  const centerOffset =
    justification === "center"
      ? 0
      : justification === "exterior"
        ? -exteriorSign * half
        : exteriorSign * half;
  return {
    centerA: refA.addScaledVector(leftNormal, centerOffset),
    dir,
    leftNormal,
    exteriorNormal: leftNormal.clone().multiplyScalar(exteriorSign),
    lengthM,
    thicknessM
  };
};

const resetFrame = (frame: THREE.Group) => {
  for (const child of [...frame.children]) {
    frame.remove(child);
    child.traverse(disposeObject);
  }
};

const getWindowHandleSide = (params: WindowParams) => (params.swingDirection === "right" ? -1 : 1);

const markIfcWindowPart = (object: THREE.Object3D, windowId: string | undefined, objectType: string) => {
  if (!windowId) return;
  object.userData.kind = "window";
  object.userData.windowId = windowId;
  object.userData.ifc = {
    className: "IfcWindow",
    predefinedType: "WINDOW",
    elementId: windowId,
    objectType,
    name: `Window ${windowId}`
  };
  object.userData.tags = Array.from(new Set([...(Array.isArray(object.userData.tags) ? object.userData.tags : []), "window", "ifc", "IfcWindow"]));
};

const addBox = (
  parent: THREE.Group,
  name: string,
  size: { x: number; y: number; z: number },
  position: { x: number; y: number; z: number },
  material: THREE.Material
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material.clone());
  mesh.name = name;
  mesh.position.set(position.x, position.y, position.z);
  markIfcWindowPart(mesh, String(parent.userData.windowId ?? ""), name);
  mesh.userData.viewDisplaySkipEdges = true;
  parent.add(mesh);
  return mesh;
};

const addCylinder = (
  parent: THREE.Group,
  name: string,
  radius: number,
  depth: number,
  position: { x: number; y: number; z: number },
  material: THREE.Material,
  axis: "x" | "y" | "z" = "z"
) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 18), material.clone());
  mesh.name = name;
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  mesh.position.set(position.x, position.y, position.z);
  markIfcWindowPart(mesh, String(parent.userData.windowId ?? ""), name);
  mesh.userData.viewDisplaySkipEdges = true;
  parent.add(mesh);
  return mesh;
};

const buildWindowFrame = (inst: WindowInstance) => {
  resetFrame(inst.frame);
  const widthM = inst.params.widthMm / 1000;
  const heightM = inst.params.heightMm / 1000;
  const frameW = Math.max(0.002, Math.min(inst.params.frameWidthMm / 1000, Math.max(0.002, widthM / 2 - 0.02), Math.max(0.002, heightM / 2 - 0.02)));
  const sashW = Math.max(0.002, Math.min(inst.params.sashWidthMm / 1000, Math.max(0.002, (widthM - frameW * 2) / 2)));
  const frameDepth = inst.params.frameProfileDepthMm / 1000;
  const sashDepth = inst.params.sashProfileDepthMm / 1000;
  const innerW = Math.max(0.05, widthM - frameW * 2);
  const innerH = Math.max(0.05, heightM - frameW * 2);
  const glassW = Math.max(0.04, innerW - sashW * 2);
  const glassH = Math.max(0.04, innerH - sashW * 2);
  const material = getWindowMaterialOption(inst.params.materialId);
  const frameMat = new THREE.MeshBasicMaterial({
    color: material.color,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
  const sashMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(material.color).multiplyScalar(0.88),
    transparent: true,
    opacity: 0.58,
    depthWrite: false
  });
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0xd6eef8,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const handleMat = new THREE.MeshBasicMaterial({
    color: 0x2f343b,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });

  addBox(inst.frame, "window-frame-left", { x: frameW, y: heightM, z: frameDepth }, { x: -widthM / 2 + frameW / 2, y: 0, z: 0 }, frameMat);
  addBox(inst.frame, "window-frame-right", { x: frameW, y: heightM, z: frameDepth }, { x: widthM / 2 - frameW / 2, y: 0, z: 0 }, frameMat);
  addBox(inst.frame, "window-frame-top", { x: innerW, y: frameW, z: frameDepth }, { x: 0, y: heightM / 2 - frameW / 2, z: 0 }, frameMat);
  addBox(inst.frame, "window-frame-bottom", { x: innerW, y: frameW, z: frameDepth }, { x: 0, y: -heightM / 2 + frameW / 2, z: 0 }, frameMat);

  const sashZ = (sashDepth - frameDepth) / 2;
  addBox(inst.frame, "window-sash-left", { x: sashW, y: innerH, z: sashDepth }, { x: -innerW / 2 + sashW / 2, y: 0, z: sashZ }, sashMat);
  addBox(inst.frame, "window-sash-right", { x: sashW, y: innerH, z: sashDepth }, { x: innerW / 2 - sashW / 2, y: 0, z: sashZ }, sashMat);
  addBox(inst.frame, "window-sash-top", { x: glassW, y: sashW, z: sashDepth }, { x: 0, y: innerH / 2 - sashW / 2, z: sashZ }, sashMat);
  addBox(inst.frame, "window-sash-bottom", { x: glassW, y: sashW, z: sashDepth }, { x: 0, y: -innerH / 2 + sashW / 2, z: sashZ }, sashMat);
  const glass = addBox(inst.frame, "window-glass", { x: glassW, y: glassH, z: 0.006 }, { x: 0, y: 0, z: sashZ }, glassMat);
  glass.userData.viewDisplaySkipMaterialRestore = true;
  if (inst.params.handleType !== "none") {
    const handleSide = getWindowHandleSide(inst.params);
    const handleInsetM = inst.params.handleType === "bar" ? 0.012 : 0.019;
    const minHandleOffsetM = Math.min(sashW / 2, handleInsetM);
    const maxHandleOffsetM = Math.max(minHandleOffsetM, sashW - handleInsetM);
    const handleOffsetM = THREE.MathUtils.clamp(inst.params.handleOffsetMm / 1000, minHandleOffsetM, maxHandleOffsetM);
    const handleX = handleSide * (glassW / 2 + handleOffsetM);
    const handleMinY = -innerH / 2 + sashW + 0.06;
    const handleMaxY = innerH / 2 - sashW - 0.06;
    const preferredHandleY = -heightM / 2 + inst.params.handleHeightMm / 1000;
    const handleY = handleMinY <= handleMaxY ? THREE.MathUtils.clamp(preferredHandleY, handleMinY, handleMaxY) : 0;
    const leverH = Math.min(0.18, Math.max(0.12, innerH * 0.2));
    const barH = Math.min(0.34, Math.max(0.2, innerH * 0.34));
    const plateH = Math.min(0.14, Math.max(0.105, innerH * 0.16));
    for (const faceSign of [-1, 1] as const) {
      const faceName = faceSign > 0 ? "outer" : "inner";
      const faceZ = sashZ + faceSign * (sashDepth / 2);
      const plateZ = faceZ + faceSign * 0.006;
      const hubZ = faceZ + faceSign * 0.016;
      const gripZ = faceZ + faceSign * 0.034;
      const addBackplate = (height: number) => {
        const half = height / 2;
        addBox(inst.frame, `window-handle-plate-${faceName}`, { x: 0.034, y: Math.max(0.02, height - 0.032), z: 0.012 }, { x: handleX, y: handleY, z: plateZ }, handleMat);
        addCylinder(inst.frame, `window-handle-plate-top-${faceName}`, 0.017, 0.012, { x: handleX, y: handleY + half - 0.016, z: plateZ }, handleMat, "z");
        addCylinder(inst.frame, `window-handle-plate-bottom-${faceName}`, 0.017, 0.012, { x: handleX, y: handleY - half + 0.016, z: plateZ }, handleMat, "z");
      };
      if (inst.params.handleType === "knob") {
        addBackplate(0.088);
        addCylinder(inst.frame, `window-handle-neck-${faceName}`, 0.009, 0.034, { x: handleX, y: handleY, z: hubZ }, handleMat, "z");
        addCylinder(inst.frame, `window-handle-knob-${faceName}`, 0.023, 0.026, { x: handleX, y: handleY, z: gripZ }, handleMat, "z");
      } else if (inst.params.handleType === "bar") {
        addCylinder(inst.frame, `window-handle-bar-top-${faceName}`, 0.008, 0.03, { x: handleX, y: handleY + barH / 2 - 0.032, z: hubZ }, handleMat, "z");
        addCylinder(inst.frame, `window-handle-bar-bottom-${faceName}`, 0.008, 0.03, { x: handleX, y: handleY - barH / 2 + 0.032, z: hubZ }, handleMat, "z");
        addCylinder(inst.frame, `window-handle-bar-grip-${faceName}`, 0.01, barH, { x: handleX, y: handleY, z: gripZ }, handleMat, "y");
      } else {
        addBackplate(plateH);
        addCylinder(inst.frame, `window-handle-hub-${faceName}`, 0.014, 0.018, { x: handleX, y: handleY, z: hubZ }, handleMat, "z");
        addCylinder(inst.frame, `window-handle-neck-${faceName}`, 0.008, 0.034, { x: handleX, y: handleY, z: gripZ - faceSign * 0.012 }, handleMat, "z");
        addBox(inst.frame, `window-handle-lever-${faceName}`, { x: 0.026, y: leverH, z: 0.016 }, { x: handleX, y: handleY - leverH / 2 - 0.026, z: gripZ }, handleMat);
        addCylinder(inst.frame, `window-handle-lever-end-${faceName}`, 0.013, 0.016, { x: handleX, y: handleY - leverH - 0.026, z: gripZ }, handleMat, "z");
      }
    }
  }

  frameMat.dispose();
  sashMat.dispose();
  glassMat.dispose();
  handleMat.dispose();
};

const syncPlanSymbol = (
  group: THREE.Group,
  args: {
    widthM: number;
    wallThicknessM: number;
    yLocal: number;
    zCenter: number;
    color: number;
    opacity: number;
    preview?: boolean;
  }
) => {
  resetFrame(group);
  const halfW = Math.max(0.001, args.widthM / 2);
  const halfT = Math.max(0.025, args.wallThicknessM / 2);
  const glassOffset = Math.min(0.035, Math.max(0.012, halfT * 0.35));
  const y = args.yLocal;
  const z = args.zCenter;
  const pts: THREE.Vector3[] = [
    new THREE.Vector3(-halfW, y, z - halfT),
    new THREE.Vector3(-halfW, y, z + halfT),
    new THREE.Vector3(halfW, y, z - halfT),
    new THREE.Vector3(halfW, y, z + halfT),
    new THREE.Vector3(-halfW, y, z - glassOffset),
    new THREE.Vector3(halfW, y, z - glassOffset),
    new THREE.Vector3(-halfW, y, z + glassOffset),
    new THREE.Vector3(halfW, y, z + glassOffset)
  ];
  if (args.preview) {
    pts.push(
      new THREE.Vector3(-halfW, y, z - halfT),
      new THREE.Vector3(halfW, y, z - halfT),
      new THREE.Vector3(-halfW, y, z + halfT),
      new THREE.Vector3(halfW, y, z + halfT)
    );
  }
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({
      color: args.color,
      transparent: true,
      opacity: args.opacity,
      depthTest: false,
      depthWrite: false
    })
  );
  line.name = args.preview ? "windowPlacementPreviewLines" : "windowPlanLines";
  line.renderOrder = args.preview ? 80 : 65;
  line.userData.kind = "windowPlanSymbol";
  line.userData.viewDisplaySkipEdges = true;
  group.add(line);
};

const createDimensionSprite = (text: string, param?: WindowDimensionParam, rotationRad = 0, height = 0.14) => {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.font = '400 54px ISOCPEUR, "Arial Narrow", Arial, sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 6;
    context.strokeStyle = "rgba(255, 255, 255, 0.96)";
    context.strokeText(text, 0, 0);
    context.fillStyle = "#111827";
    context.fillText(text, 0, 0);
    context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, rotation: rotationRad }));
  sprite.scale.set(height * (canvas.width / canvas.height), height, 1);
  sprite.renderOrder = 96;
  sprite.userData.viewDisplaySkipEdges = true;
  if (param) {
    sprite.userData.kind = "windowDimensionEdit";
    sprite.userData.windowDimensionParam = param;
  }
  return sprite;
};

const createDimensionHitSprite = (param: WindowDimensionParam, rotationRad = 0, height = 0.14) => {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      rotation: rotationRad
    })
  );
  const scale = height / 0.14;
  sprite.scale.set(0.62 * scale, 0.22 * scale, 1);
  sprite.renderOrder = 97;
  sprite.userData.kind = "windowDimensionEdit";
  sprite.userData.windowDimensionParam = param;
  sprite.userData.viewDisplaySkipEdges = true;
  return sprite;
};

const createWindowSwingControlSprite = (action: WindowSwingControlAction, rotationRad = 0) => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const arrow = action === "toggleHandedness" ? String.fromCharCode(8596) : String.fromCharCode(8597);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '800 84px "Arial Narrow", Arial, sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 3;
    context.strokeStyle = "rgba(255, 255, 255, 0.7)";
    context.strokeText(arrow, canvas.width / 2, canvas.height / 2 - 2);
    context.fillStyle = "#005cff";
    context.fillText(arrow, canvas.width / 2, canvas.height / 2 - 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      rotation: rotationRad
    })
  );
  sprite.scale.set(0.145, 0.145, 1);
  sprite.renderOrder = 98;
  sprite.userData.kind = "windowSwingControl";
  sprite.userData.windowSwingAction = action;
  sprite.userData.viewDisplaySkipEdges = true;
  return sprite;
};

const createDimensionLine = (points: THREE.Vector3[], color = 0xc98d00) => {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false })
  );
  line.renderOrder = 110;
  line.userData.viewDisplaySkipEdges = true;
  return line;
};

const createSelectionLine = (points: THREE.Vector3[]) => {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: 0x3ddc97,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false
    })
  );
  line.renderOrder = 92;
  line.userData.viewDisplaySkipEdges = true;
  return line;
};

const addRectSelection = (parent: THREE.Group, x0: number, x1: number, y0: number, y1: number, z: number) => {
  if (x1 - x0 <= 0.001 || y1 - y0 <= 0.001) return;
  parent.add(
    createSelectionLine([
      new THREE.Vector3(x0, y0, z),
      new THREE.Vector3(x1, y0, z),
      new THREE.Vector3(x1, y0, z),
      new THREE.Vector3(x1, y1, z),
      new THREE.Vector3(x1, y1, z),
      new THREE.Vector3(x0, y1, z),
      new THREE.Vector3(x0, y1, z),
      new THREE.Vector3(x0, y0, z)
    ])
  );
};

const addPlanSelectionSymbol = (
  parent: THREE.Group,
  args: {
    halfW: number;
    halfT: number;
    glassOffset: number;
    y: number;
    zCenter: number;
  }
) => {
  const { halfW, halfT, glassOffset, y, zCenter } = args;
  parent.add(
    createSelectionLine([
      new THREE.Vector3(-halfW, y, zCenter - halfT),
      new THREE.Vector3(-halfW, y, zCenter + halfT),
      new THREE.Vector3(halfW, y, zCenter - halfT),
      new THREE.Vector3(halfW, y, zCenter + halfT),
      new THREE.Vector3(-halfW, y, zCenter - glassOffset),
      new THREE.Vector3(halfW, y, zCenter - glassOffset),
      new THREE.Vector3(-halfW, y, zCenter + glassOffset),
      new THREE.Vector3(halfW, y, zCenter + glassOffset)
    ])
  );
};

const readablePlanLabelRotation = (rotationRad: number) => {
  let next = rotationRad;
  while (next > Math.PI / 2) next -= Math.PI;
  while (next <= -Math.PI / 2) next += Math.PI;
  return next;
};

const addWindowDimension = (
  parent: THREE.Group,
  args: {
    a: THREE.Vector3;
    b: THREE.Vector3;
    dimA: THREE.Vector3;
    dimB: THREE.Vector3;
    textPos: THREE.Vector3;
    tickAxisA: THREE.Vector3;
    tickAxisB: THREE.Vector3;
    label: string;
    param: WindowDimensionParam;
    extensionGapM?: number;
    labelRotationRad?: number;
  }
) => {
  const tick = 0.042;
  const halfTickA = args.tickAxisA.clone().normalize().multiplyScalar(tick / 2);
  const halfTickB = args.tickAxisB.clone().normalize().multiplyScalar(tick / 2);
  const extensionStart = (objectPoint: THREE.Vector3, dimPoint: THREE.Vector3) => {
    const delta = dimPoint.clone().sub(objectPoint);
    const distance = delta.length();
    if (distance < 0.001) return objectPoint.clone();
    const gap = Math.min(args.extensionGapM ?? 0.045, distance * 0.6);
    return objectPoint.clone().addScaledVector(delta.multiplyScalar(1 / distance), gap);
  };
  const extA = extensionStart(args.a, args.dimA);
  const extB = extensionStart(args.b, args.dimB);
  parent.add(
    createDimensionLine([
      args.dimA,
      args.dimB,
      extA,
      args.dimA,
      extB,
      args.dimB,
      args.dimA.clone().sub(halfTickA).sub(halfTickB),
      args.dimA.clone().add(halfTickA).add(halfTickB),
      args.dimB.clone().sub(halfTickA).sub(halfTickB),
      args.dimB.clone().add(halfTickA).add(halfTickB)
    ])
  );
  const labelRotationRad = args.labelRotationRad ?? 0;
  const sprite = createDimensionSprite(args.label, args.param, labelRotationRad);
  sprite.position.copy(args.textPos);
  parent.add(sprite);
  const hit = createDimensionHitSprite(args.param, labelRotationRad);
  hit.position.copy(args.textPos);
  parent.add(hit);
};

const addWidthDimension = (
  parent: THREE.Group,
  args: {
    a: THREE.Vector3;
    b: THREE.Vector3;
    dimA: THREE.Vector3;
    dimB: THREE.Vector3;
    widthTextPos: THREE.Vector3;
    heightTextPos: THREE.Vector3;
    sillTextPos: THREE.Vector3;
    tickAxisA: THREE.Vector3;
    tickAxisB: THREE.Vector3;
    widthLabel: string;
    heightLabel: string;
    sillLabel: string;
    extensionGapM?: number;
    labelRotationRad?: number;
    labelHeight?: number;
  }
) => {
  const tick = 0.042;
  const halfTickA = args.tickAxisA.clone().normalize().multiplyScalar(tick / 2);
  const halfTickB = args.tickAxisB.clone().normalize().multiplyScalar(tick / 2);
  const extensionStart = (objectPoint: THREE.Vector3, dimPoint: THREE.Vector3) => {
    const delta = dimPoint.clone().sub(objectPoint);
    const distance = delta.length();
    if (distance < 0.001) return objectPoint.clone();
    const gap = Math.min(args.extensionGapM ?? 0.045, distance * 0.6);
    return objectPoint.clone().addScaledVector(delta.multiplyScalar(1 / distance), gap);
  };
  const extA = extensionStart(args.a, args.dimA);
  const extB = extensionStart(args.b, args.dimB);
  parent.add(
    createDimensionLine([
      args.dimA,
      args.dimB,
      extA,
      args.dimA,
      extB,
      args.dimB,
      args.dimA.clone().sub(halfTickA).sub(halfTickB),
      args.dimA.clone().add(halfTickA).add(halfTickB),
      args.dimB.clone().sub(halfTickA).sub(halfTickB),
      args.dimB.clone().add(halfTickA).add(halfTickB)
    ])
  );
  const labelRotationRad = args.labelRotationRad ?? 0;
  const labelHeight = args.labelHeight ?? 0.14;
  const addEditableLabel = (text: string, position: THREE.Vector3, param: WindowDimensionParam) => {
    const sprite = createDimensionSprite(text, param, labelRotationRad, labelHeight);
    sprite.position.copy(position);
    parent.add(sprite);

    const hit = createDimensionHitSprite(param, labelRotationRad, labelHeight);
    hit.position.copy(position);
    parent.add(hit);
  };

  const widthSprite = createDimensionSprite(args.widthLabel, "widthMm", labelRotationRad, labelHeight);
  widthSprite.position.copy(args.widthTextPos);
  parent.add(widthSprite);
  const widthHit = createDimensionHitSprite("widthMm", labelRotationRad, labelHeight);
  widthHit.position.copy(args.widthTextPos);
  parent.add(widthHit);
  addEditableLabel(args.heightLabel, args.heightTextPos, "heightMm");
  addEditableLabel(args.sillLabel, args.sillTextPos, "sillHeightMm");
};

const rebuildWindowSelection = (
  inst: WindowInstance,
  args: {
    widthM: number;
    heightM: number;
    maxDepthM: number;
    planYLocal: number;
    planZCenter: number;
    wallThicknessM: number;
  }
) => {
  const selected = inst.selection.visible;
  resetFrame(inst.selection);

  const widthM = Math.max(0.001, args.widthM);
  const heightM = Math.max(0.001, args.heightM);
  const halfW = widthM / 2;
  const halfH = heightM / 2;
  const widthLabel = `${Math.round(widthM * 1000)}`;
  const heightLabel = `${Math.round(heightM * 1000)}`;
  const sillLabel = `(${Math.round(inst.params.sillHeightMm)})`;
  const frameW = Math.min(inst.params.frameWidthMm / 1000, widthM / 2 - 0.02, heightM / 2 - 0.02);
  const sashW = Math.min(inst.params.sashWidthMm / 1000, Math.max(0.02, (widthM - frameW * 2) / 2));
  const innerW = Math.max(0.05, widthM - frameW * 2);
  const innerH = Math.max(0.05, heightM - frameW * 2);
  const glassW = Math.max(0.04, innerW - sashW * 2);
  const glassH = Math.max(0.04, innerH - sashW * 2);

  const modelGroup = new THREE.Group();
  modelGroup.name = "windowSelection3d";
  modelGroup.userData.windowOverlayView = "3d";
  const zFront = args.maxDepthM / 2 + 0.018;
  addRectSelection(modelGroup, -halfW, -halfW + frameW, -halfH, halfH, zFront);
  addRectSelection(modelGroup, halfW - frameW, halfW, -halfH, halfH, zFront);
  addRectSelection(modelGroup, -innerW / 2, innerW / 2, halfH - frameW, halfH, zFront);
  addRectSelection(modelGroup, -innerW / 2, innerW / 2, -halfH, -halfH + frameW, zFront);
  addRectSelection(modelGroup, -innerW / 2, -innerW / 2 + sashW, -innerH / 2, innerH / 2, zFront);
  addRectSelection(modelGroup, innerW / 2 - sashW, innerW / 2, -innerH / 2, innerH / 2, zFront);
  addRectSelection(modelGroup, -glassW / 2, glassW / 2, innerH / 2 - sashW, innerH / 2, zFront);
  addRectSelection(modelGroup, -glassW / 2, glassW / 2, -innerH / 2, -innerH / 2 + sashW, zFront);
  addRectSelection(modelGroup, -glassW / 2, glassW / 2, -glassH / 2, glassH / 2, zFront);
  const widthDimY = -halfH - 0.28;
  addWindowDimension(modelGroup, {
    a: new THREE.Vector3(-halfW, -halfH, zFront),
    b: new THREE.Vector3(halfW, -halfH, zFront),
    dimA: new THREE.Vector3(-halfW, widthDimY, zFront),
    dimB: new THREE.Vector3(halfW, widthDimY, zFront),
    textPos: new THREE.Vector3(0, widthDimY + 0.09, zFront),
    tickAxisA: new THREE.Vector3(1, 0, 0),
    tickAxisB: new THREE.Vector3(0, 1, 0),
    label: widthLabel,
    param: "widthMm"
  });
  const heightDimX = halfW + 0.32;
  addWindowDimension(modelGroup, {
    a: new THREE.Vector3(halfW, -halfH, zFront),
    b: new THREE.Vector3(halfW, halfH, zFront),
    dimA: new THREE.Vector3(heightDimX, -halfH, zFront),
    dimB: new THREE.Vector3(heightDimX, halfH, zFront),
    textPos: new THREE.Vector3(heightDimX + 0.13, 0, zFront),
    tickAxisA: new THREE.Vector3(0, 1, 0),
    tickAxisB: new THREE.Vector3(1, 0, 0),
    label: heightLabel,
    param: "heightMm"
  });
  const modelControlCenter = new THREE.Vector3(0, 0, zFront + 0.018);
  const modelStackAxis = new THREE.Vector3(0, 0.17, 0);
  const modelHandedness = createWindowSwingControlSprite("toggleHandedness");
  modelHandedness.position.copy(modelControlCenter).add(modelStackAxis);
  modelGroup.add(modelHandedness);
  const modelSide = createWindowSwingControlSprite("toggleSwingSide");
  modelSide.position.copy(modelControlCenter).addScaledVector(modelStackAxis, -1);
  modelGroup.add(modelSide);
  inst.selection.add(modelGroup);

  const planGroup = new THREE.Group();
  planGroup.name = "windowSelectionPlan";
  planGroup.userData.windowOverlayView = "plan";
  const planLabelRotationRad = readablePlanLabelRotation(-inst.root.rotation.y);
  const planY = args.planYLocal + 0.032;
  const halfT = Math.max(0.025, args.wallThicknessM / 2);
  const glassOffset = Math.min(0.035, Math.max(0.012, halfT * 0.35));
  const z1 = args.planZCenter + halfT;
  const dimZ = z1 + 0.5;
  addPlanSelectionSymbol(planGroup, {
    halfW,
    halfT,
    glassOffset,
    y: planY,
    zCenter: args.planZCenter
  });
  addWidthDimension(planGroup, {
    a: new THREE.Vector3(-halfW, planY, z1),
    b: new THREE.Vector3(halfW, planY, z1),
    dimA: new THREE.Vector3(-halfW, planY, dimZ),
    dimB: new THREE.Vector3(halfW, planY, dimZ),
    widthTextPos: new THREE.Vector3(0, planY, dimZ - 0.09),
    heightTextPos: new THREE.Vector3(-0.16, planY, dimZ + 0.09),
    sillTextPos: new THREE.Vector3(0.18, planY, dimZ + 0.09),
    tickAxisA: new THREE.Vector3(1, 0, 0),
    tickAxisB: new THREE.Vector3(0, 0, 1),
    widthLabel,
    heightLabel,
    sillLabel,
    labelRotationRad: planLabelRotationRad
  });
  const controlDepthSide = inst.params.swingSide === "outward" ? 1 : -1;
  const controlDepthOffset = halfT + 0.22;
  const controlCenter = new THREE.Vector3(0, planY, args.planZCenter + controlDepthSide * controlDepthOffset);
  const stackAxis = new THREE.Vector3(0, 0, 1)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -inst.root.rotation.y)
    .normalize()
    .multiplyScalar(0.085);
  const handedness = createWindowSwingControlSprite("toggleHandedness", planLabelRotationRad);
  handedness.position.copy(controlCenter).addScaledVector(stackAxis, -1);
  planGroup.add(handedness);
  const side = createWindowSwingControlSprite("toggleSwingSide", planLabelRotationRad);
  side.position.copy(controlCenter).add(stackAxis);
  planGroup.add(side);
  inst.selection.add(planGroup);
  inst.selection.visible = selected;
};

export function createWindowControlsController(ctx: WindowControlsControllerContext) {
  let placementActive = false;
  let placementDraft: WindowParams | null = null;
  let selectedWindowVisible = false;
  const placementPreview = new THREE.Group();
  placementPreview.name = "windowPlacementPreview";
  placementPreview.visible = false;
  placementPreview.userData.viewDisplaySkipEdges = true;
  ctx.layoutRoot.add(placementPreview);
  let lastPreviewWallId: string | null = null;
  let lastPreviewPointMm: { x: number; z: number } | null = null;

  const defaultDraftParams = (): WindowParams => ({
    wall: "back",
    wallId: null,
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
    handleOffsetMm: 24,
    handleHeightMm: 450,
    materialId: getWindowMaterialOption(null).id
  });

  const getPlacementDraft = () => {
    if (!placementDraft) placementDraft = ctx.clampWindowParams(defaultDraftParams());
    return placementDraft;
  };

  const isFloorplanActive = () => ctx.getViewMode() === "2d" && ctx.getActiveViewerTab() === "floorplan";

  function syncWindowSelectionVisuals(selected = selectedWindowVisible) {
    selectedWindowVisible = selected;
    const targetView = isFloorplanActive() ? "plan" : "3d";
    for (const inst of ctx.windows) {
      for (const child of inst.selection.children) {
        child.visible = child.userData.windowOverlayView === targetView;
      }
      inst.selection.visible = selectedWindowVisible && inst === ctx.windowInst;
    }
  }

  function updateWindowTransform(inst: WindowInstance) {
    inst.params = ctx.clampWindowParams(inst.params);
    const widthM = inst.params.widthMm / 1000;
    const heightM = inst.params.heightMm / 1000;
    const maxDepthM = Math.max(inst.params.frameProfileDepthMm, inst.params.sashProfileDepthMm) / 1000;
    const wall = inst.params.wallId ? ctx.walls.find((item) => item.id === inst.params.wallId) ?? null : null;
    let planYLocal = -inst.root.position.y + 0.065;
    let planZCenter = 0;
    let planWallThicknessM = 0.18;

    if (wall) {
      const basis = getWallBasis(wall);
      if (!basis) return;
      const center = basis.centerA.clone().addScaledVector(basis.dir, inst.params.centerMm / 1000);
      const depthCenterM = inst.params.offsetFromInteriorMm / 1000 + maxDepthM / 2;
      const wallCenterOffsetM = -basis.thicknessM / 2 + depthCenterM;
      center.addScaledVector(basis.exteriorNormal, wallCenterOffsetM);
      center.y = inst.params.sillHeightMm / 1000 + heightM / 2;
      inst.root.position.copy(center);
      inst.root.rotation.set(0, -Math.atan2(basis.dir.z, basis.dir.x), 0);
      planYLocal = -inst.root.position.y + 0.065;
      planZCenter = -wallCenterOffsetM;
      planWallThicknessM = basis.thicknessM;
      syncPlanSymbol(inst.plan, {
        widthM,
        wallThicknessM: planWallThicknessM,
        yLocal: planYLocal,
        zCenter: planZCenter,
        color: 0x111827,
        opacity: 0.95
      });
      inst.plan.visible = isFloorplanActive();
      ctx.setWindowOpening({
        center,
        inwardNormal: basis.exteriorNormal.clone().multiplyScalar(-1),
        width: widthM,
        height: heightM
      });
      ctx.setWindowCutout(null);
      ctx.rebuildWall(wall);
      ctx.rebuildWallPlanMesh();
    } else {
      const def = ctx.wallDefs[inst.params.wall];
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
      planYLocal = -inst.root.position.y + 0.065;
      planZCenter = 0;
      planWallThicknessM = 0.18;
      syncPlanSymbol(inst.plan, {
        widthM,
        wallThicknessM: planWallThicknessM,
        yLocal: planYLocal,
        zCenter: planZCenter,
        color: 0x111827,
        opacity: 0.95
      });
      inst.plan.visible = isFloorplanActive();
      ctx.setWindowOpening({ center: pos, inwardNormal: def.inwardNormal, width: widthM, height: heightM });
      ctx.setWindowCutout({
        wall: inst.params.wall,
        centerAxisM,
        sillM: inst.params.sillHeightMm / 1000,
        widthM,
        heightM
      });
    }

    buildWindowFrame(inst);
    inst.frame.visible = !isFloorplanActive();
    rebuildWindowSelection(inst, {
      widthM,
      heightM,
      maxDepthM,
      planYLocal,
      planZCenter,
      wallThicknessM: planWallThicknessM
    });
    syncWindowSelectionVisuals();
    inst.pick.geometry.dispose();
    inst.pick.geometry = new THREE.BoxGeometry(Math.max(0.18, widthM + 0.16), Math.max(0.18, heightM + 0.16), Math.max(0.12, maxDepthM + 0.16));
    inst.pick.position.set(0, 0, 0);

    const pts = [
      new THREE.Vector3(-widthM / 2, -heightM / 2, maxDepthM / 2 + 0.004),
      new THREE.Vector3(widthM / 2, -heightM / 2, maxDepthM / 2 + 0.004),
      new THREE.Vector3(widthM / 2, heightM / 2, maxDepthM / 2 + 0.004),
      new THREE.Vector3(-widthM / 2, heightM / 2, maxDepthM / 2 + 0.004),
      new THREE.Vector3(-widthM / 2, -heightM / 2, maxDepthM / 2 + 0.004)
    ];
    inst.outline.geometry.dispose();
    inst.outline.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    inst.outline.visible = false;
  }

  function cancelWindowPlacement() {
    if (!placementActive) return false;
    placementActive = false;
    placementPreview.visible = false;
    ctx.setUnderlayStatus("");
    ctx.mountProps();
    return true;
  }

  function clearWindowPlacementPreview() {
    placementPreview.visible = false;
    lastPreviewWallId = null;
    lastPreviewPointMm = null;
  }

  function isPlacementPointValid(lengthMm: number, centerMm: number, widthMm: number) {
    if (widthMm >= lengthMm) return true;
    return centerMm >= widthMm / 2 && centerMm <= lengthMm - widthMm / 2;
  }

  function centerOnWallMm(wall: WallInstance, pointMm: { x: number; z: number }) {
    const ax = wall.params.aMm.x;
    const az = wall.params.aMm.z;
    const bx = wall.params.bMm.x;
    const bz = wall.params.bMm.z;
    const abx = bx - ax;
    const abz = bz - az;
    const lengthMm = Math.hypot(abx, abz);
    const t = ((pointMm.x - ax) * abx + (pointMm.z - az) * abz) / Math.max(1, lengthMm * lengthMm);
    return {
      centerMm: Math.round(Math.max(0, Math.min(1, t)) * lengthMm),
      lengthMm
    };
  }

  function updateWindowPlacementPreview(wallId: string | null, pointMm: { x: number; z: number } | null) {
    if (!placementActive || !wallId || !pointMm || !isFloorplanActive()) {
      clearWindowPlacementPreview();
      return false;
    }
    const wall = ctx.walls.find((item) => item.id === wallId) ?? null;
    if (!wall) {
      clearWindowPlacementPreview();
      return false;
    }
    const basis = getWallBasis(wall);
    if (!basis) {
      clearWindowPlacementPreview();
      return false;
    }
    const draft = getPlacementDraft();
    const { centerMm, lengthMm } = centerOnWallMm(wall, pointMm);
    const widthMm = Math.max(1, Math.round(draft.widthMm));
    const valid = isPlacementPointValid(lengthMm, centerMm, widthMm);
    const center = basis.centerA.clone().addScaledVector(basis.dir, centerMm / 1000);
    placementPreview.position.set(center.x, 0, center.z);
    placementPreview.rotation.set(0, -Math.atan2(basis.dir.z, basis.dir.x), 0);
    syncPlanSymbol(placementPreview, {
      widthM: widthMm / 1000,
      wallThicknessM: basis.thicknessM,
      yLocal: 0.075,
      zCenter: 0,
      color: valid ? 0x12b981 : 0xef4444,
      opacity: valid ? 0.95 : 0.78,
      preview: true
    });
    placementPreview.visible = true;
    lastPreviewWallId = wallId;
    lastPreviewPointMm = { ...pointMm };
    return valid;
  }

  function updateWindowPlacementParams(next: Partial<WindowParams>) {
    const draft = getPlacementDraft();
    placementDraft = ctx.clampWindowParams({ ...draft, ...next });
    if (lastPreviewWallId && lastPreviewPointMm) updateWindowPlacementPreview(lastPreviewWallId, lastPreviewPointMm);
    return placementDraft;
  }

  function insertWindowAtWallPoint(wallId: string, pointMm: { x: number; z: number }) {
    const wall = ctx.walls.find((item) => item.id === wallId) ?? null;
    if (!wall) return false;
    const draft = getPlacementDraft();
    const widthMm = Math.max(1, Math.round(draft.widthMm));
    const { centerMm, lengthMm } = centerOnWallMm(wall, pointMm);
    if (!isPlacementPointValid(lengthMm, centerMm, widthMm)) {
      ctx.setUnderlayStatus("Window: okno sa neda vlozit do hrany steny. Klikni dalej od konca.");
      return false;
    }

    const inst = ctx.createWindow("back", wall.id);
    inst.params = {
      ...inst.params,
      ...structuredClone(draft),
      wall: "back",
      wallId: wall.id,
      centerMm
    };
    ctx.windowInst = inst;
    ctx.windows.push(inst);
    updateWindowTransform(inst);
    ctx.layoutRoot.add(inst.root);
    placementActive = true;
    placementPreview.visible = false;
    ctx.setSelectedWindow();
    ctx.mountProps();
    ctx.commitHistory();
    ctx.setUnderlayStatus("Window: klikni dalsie miesto na stene, alebo Esc pre ukoncenie.");
    return true;
  }

  function addOrSelectWindow() {
    if (ctx.mode !== "layout") return;

    if (ctx.walls.length === 0) {
      ctx.setUnderlayStatus("Window: najprv nakresli stenu.");
      return;
    }

    ctx.setToolSelect();
    ctx.ensureFloorplanViewerTab();
    placementDraft = ctx.clampWindowParams(ctx.windowInst ? structuredClone(ctx.windowInst.params) : defaultDraftParams());
    placementActive = true;
    const selectedWallId = ctx.getSelectedWallId();
    ctx.setUnderlayStatus(selectedWallId ? "Window: uprav parametre a klikni miesto na vybratej stene." : "Window: uprav parametre a klikni miesto na stene.");
    ctx.mountProps();
  }

  function mountWindowControls() {
    ctx.windowEditorHost.innerHTML = "";
  }

  return {
    updateWindowTransform,
    addOrSelectWindow,
    cancelWindowPlacement,
    insertWindowAtWallPoint,
    updateWindowPlacementPreview,
    clearWindowPlacementPreview,
    getWindowPlacementParams: () => (placementActive ? getPlacementDraft() : null),
    updateWindowPlacementParams,
    isWindowPlacementActive: () => placementActive,
    syncWindowSelectionVisuals,
    mountWindowControls
  };
}
