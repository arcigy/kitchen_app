import * as THREE from "three";
import type { DoorInstance, DoorParams, WallInstance } from "./localTypes";
import { getDoorMaterialOption } from "./doorMaterials";

type DoorControlsControllerContext = {
  clampDoorParams: (params: DoorParams) => DoorParams;
  commitHistory: () => void;
  createDoor: (defaultWall?: DoorParams["wall"], wallId?: string | null) => DoorInstance;
  ensureFloorplanViewerTab: () => void;
  getActiveViewerTab: () => string;
  getSelectedWallId: () => string | null;
  getViewMode: () => "2d" | "3d";
  layoutRoot: THREE.Group;
  mode: "build" | "layout";
  mountProps: () => void;
  rebuildWall: (wall: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
  setSelectedDoor: () => void;
  setToolSelect: () => void;
  setUnderlayStatus: (status: string) => void;
  walls: WallInstance[];
  doors: DoorInstance[];
  doorInst: DoorInstance | null;
};

type WallBasis = {
  centerA: THREE.Vector3;
  dir: THREE.Vector3;
  leftNormal: THREE.Vector3;
  exteriorNormal: THREE.Vector3;
  lengthM: number;
  thicknessM: number;
};

const markIfcDoorPart = (object: THREE.Object3D, doorId: string, objectType: string) => {
  object.userData.kind = "door";
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

type DoorDimensionParam = "widthMm" | "heightMm";
type DoorSwingControlAction = "toggleHandedness" | "toggleSwingSide";

const disposeObject = (object: THREE.Object3D) => {
  if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry) object.geometry.dispose();
  if ("material" in object) {
    const material = object.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) for (const item of material) item.dispose();
    else material?.dispose();
  }
};

const resetGroup = (group: THREE.Group) => {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse(disposeObject);
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

const addDoorBox = (
  parent: THREE.Group,
  doorId: string,
  name: string,
  size: { x: number; y: number; z: number },
  position: { x: number; y: number; z: number },
  material: THREE.Material
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material.clone());
  mesh.name = name;
  mesh.position.set(position.x, position.y, position.z);
  markIfcDoorPart(mesh, doorId, name);
  mesh.userData.viewDisplaySkipEdges = true;
  parent.add(mesh);
  return mesh;
};

const addDoorCylinder = (
  parent: THREE.Group,
  doorId: string,
  name: string,
  radius: number,
  depth: number,
  position: { x: number; y: number; z: number },
  material: THREE.Material,
  axis: "x" | "y" | "z" = "z"
) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 24), material.clone());
  mesh.name = name;
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  mesh.position.set(position.x, position.y, position.z);
  markIfcDoorPart(mesh, doorId, name);
  mesh.userData.viewDisplaySkipEdges = true;
  parent.add(mesh);
  return mesh;
};

const addDoorSphere = (
  parent: THREE.Group,
  doorId: string,
  name: string,
  radius: number,
  position: { x: number; y: number; z: number },
  material: THREE.Material
) => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material.clone());
  mesh.name = name;
  mesh.position.set(position.x, position.y, position.z);
  markIfcDoorPart(mesh, doorId, name);
  mesh.userData.viewDisplaySkipEdges = true;
  parent.add(mesh);
  return mesh;
};

const createLineSegments = (points: THREE.Vector3[], color: number, opacity = 0.98) => {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
  );
  line.userData.viewDisplaySkipEdges = true;
  return line;
};

const createDimensionSprite = (text: string, param?: DoorDimensionParam, rotationRad = 0) => {
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
  const height = 0.14;
  sprite.scale.set(height * (canvas.width / canvas.height), height, 1);
  sprite.renderOrder = 96;
  sprite.userData.viewDisplaySkipEdges = true;
  if (param) {
    sprite.userData.kind = "doorDimensionEdit";
    sprite.userData.doorDimensionParam = param;
  }
  return sprite;
};

const createDimensionHitSprite = (param: DoorDimensionParam, rotationRad = 0) => {
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
  sprite.scale.set(0.62, 0.22, 1);
  sprite.renderOrder = 97;
  sprite.userData.kind = "doorDimensionEdit";
  sprite.userData.doorDimensionParam = param;
  sprite.userData.viewDisplaySkipEdges = true;
  return sprite;
};

const createDoorSwingControlSprite = (action: DoorSwingControlAction, rotationRad = 0) => {
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
  sprite.userData.kind = "doorSwingControl";
  sprite.userData.doorSwingAction = action;
  sprite.userData.viewDisplaySkipEdges = true;
  return sprite;
};

const getDoorWallCenterOffset = (params: DoorParams, wallThicknessM: number, panelThicknessM: number) => {
  const leafCenterFromFaceM = params.offsetFromInteriorMm / 1000 + panelThicknessM / 2;
  const inwardOffsetM = -wallThicknessM / 2 + leafCenterFromFaceM;
  return params.swingSide === "outward" ? -inwardOffsetM : inwardOffsetM;
};

const getDoorHandleSide = (params: DoorParams) => (params.swingDirection === "right" ? -1 : 1);

const createDimensionLine = (points: THREE.Vector3[], color = 0xc98d00) => {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false })
  );
  line.renderOrder = 90;
  line.userData.viewDisplaySkipEdges = true;
  return line;
};

const readablePlanLabelRotation = (rotationRad: number) => {
  let next = rotationRad;
  while (next > Math.PI / 2) next -= Math.PI;
  while (next <= -Math.PI / 2) next += Math.PI;
  return next;
};

const addDoorDimensions = (
  parent: THREE.Group,
  args: {
    a: THREE.Vector3;
    b: THREE.Vector3;
    dimA: THREE.Vector3;
    dimB: THREE.Vector3;
    widthTextPos: THREE.Vector3;
    heightTextPos: THREE.Vector3;
    tickAxisA: THREE.Vector3;
    tickAxisB: THREE.Vector3;
    widthLabel: string;
    heightLabel: string;
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
  const addEditableLabel = (text: string, position: THREE.Vector3, param: DoorDimensionParam) => {
    const sprite = createDimensionSprite(text, param, labelRotationRad);
    sprite.position.copy(position);
    parent.add(sprite);
    const hit = createDimensionHitSprite(param, labelRotationRad);
    hit.position.copy(position);
    parent.add(hit);
  };
  addEditableLabel(args.widthLabel, args.widthTextPos, "widthMm");
  addEditableLabel(args.heightLabel, args.heightTextPos, "heightMm");
};

const buildArcPoints = (center: THREE.Vector3, radius: number, start: number, end: number, segments = 18) => {
  const pts: THREE.Vector3[] = [];
  const count = Math.max(3, segments);
  for (let i = 0; i < count; i += 1) {
    const a0 = start + (end - start) * (i / count);
    const a1 = start + (end - start) * ((i + 1) / count);
    pts.push(
      new THREE.Vector3(center.x + Math.cos(a0) * radius, center.y, center.z + Math.sin(a0) * radius),
      new THREE.Vector3(center.x + Math.cos(a1) * radius, center.y, center.z + Math.sin(a1) * radius)
    );
  }
  return pts;
};

const syncDoorPlanSymbol = (
  group: THREE.Group,
  args: {
    widthM: number;
    wallThicknessM: number;
    yLocal: number;
    zCenter: number;
    swingDirection: DoorParams["swingDirection"];
    swingSide: DoorParams["swingSide"];
    swingAngleDeg: number;
    frameWidthM?: number;
    panelThicknessM?: number;
    color: number;
    opacity: number;
    preview?: boolean;
  }
) => {
  resetGroup(group);
  const halfW = Math.max(0.001, args.widthM / 2);
  const halfT = Math.max(0.025, args.wallThicknessM / 2);
  const y = args.yLocal;
  const innerZ = args.zCenter - halfT;
  const outerZ = args.zCenter + halfT;
  const frameW = Math.max(0.004, Math.min(args.frameWidthM ?? 0.07, halfW - 0.01));
  const panelT = Math.max(0.006, args.panelThicknessM ?? 0.042);
  const hingeX = args.swingDirection === "right" ? halfW - frameW : -halfW + frameW;
  const freeClosedX = args.swingDirection === "right" ? -halfW + frameW : halfW - frameW;
  const angle = THREE.MathUtils.degToRad(Math.max(1, Math.min(180, args.swingAngleDeg)));
  const leafRadius = Math.max(0.08, Math.abs(freeClosedX - hingeX));
  const closedLeafMinX = Math.min(hingeX, freeClosedX);
  const closedLeafMaxX = Math.max(hingeX, freeClosedX);
  const rawClosedLeafInnerZ = -panelT / 2;
  const rawClosedLeafOuterZ = panelT / 2;
  const closedLeafInnerZ = Math.max(innerZ, Math.min(outerZ - 0.004, rawClosedLeafInnerZ));
  const closedLeafOuterZ = Math.min(outerZ, Math.max(innerZ + 0.004, rawClosedLeafOuterZ));
  const hingeZ = (closedLeafInnerZ + closedLeafOuterZ) / 2;
  const sideSign = args.swingSide === "outward" ? 1 : -1;
  const arcStart = args.swingDirection === "right" ? Math.PI : 0;
  const arcEnd = args.swingDirection === "right" ? Math.PI - sideSign * angle : sideSign * angle;
  const arcEndPoint = new THREE.Vector3(hingeX + Math.cos(arcEnd) * leafRadius, y, hingeZ + Math.sin(arcEnd) * leafRadius);
  const addPlanRect = (x0: number, z0: number, x1: number, z1: number) => [
    new THREE.Vector3(x0, y, z0),
    new THREE.Vector3(x1, y, z0),
    new THREE.Vector3(x1, y, z0),
    new THREE.Vector3(x1, y, z1),
    new THREE.Vector3(x1, y, z1),
    new THREE.Vector3(x0, y, z1),
    new THREE.Vector3(x0, y, z1),
    new THREE.Vector3(x0, y, z0)
  ];

  const pts: THREE.Vector3[] = [
    ...addPlanRect(-halfW, innerZ, -halfW + frameW, outerZ),
    ...addPlanRect(halfW - frameW, innerZ, halfW, outerZ),
    ...addPlanRect(closedLeafMinX, closedLeafInnerZ, closedLeafMaxX, closedLeafOuterZ),
    new THREE.Vector3(hingeX, y, hingeZ),
    arcEndPoint,
    ...buildArcPoints(
      new THREE.Vector3(hingeX, y, hingeZ),
      leafRadius,
      arcStart,
      arcEnd
    )
  ];

  if (args.preview) {
    pts.push(
      new THREE.Vector3(-halfW, y, outerZ),
      new THREE.Vector3(halfW, y, outerZ),
      new THREE.Vector3(-halfW, y, innerZ),
      new THREE.Vector3(halfW, y, innerZ)
    );
  }

  const line = createLineSegments(pts, args.color, args.opacity);
  line.name = args.preview ? "doorPlacementPreviewLines" : "doorPlanLines";
  line.renderOrder = args.preview ? 82 : 66;
  line.userData.kind = "doorPlanSymbol";
  group.add(line);
};

const addRectSelection = (parent: THREE.Group, x0: number, x1: number, y0: number, y1: number, z: number) => {
  if (x1 - x0 <= 0.001 || y1 - y0 <= 0.001) return;
  const line = createLineSegments(
    [
      new THREE.Vector3(x0, y0, z),
      new THREE.Vector3(x1, y0, z),
      new THREE.Vector3(x1, y0, z),
      new THREE.Vector3(x1, y1, z),
      new THREE.Vector3(x1, y1, z),
      new THREE.Vector3(x0, y1, z),
      new THREE.Vector3(x0, y1, z),
      new THREE.Vector3(x0, y0, z)
    ],
    0x3ddc97
  );
  line.renderOrder = 92;
  parent.add(line);
};

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

export function createDoorControlsController(ctx: DoorControlsControllerContext) {
  let placementActive = false;
  let placementDraft: DoorParams | null = null;
  let selectedDoorVisible = false;
  let lastPreviewWallId: string | null = null;
  let lastPreviewPointMm: { x: number; z: number } | null = null;
  const placementPreview = new THREE.Group();
  placementPreview.name = "doorPlacementPreview";
  placementPreview.visible = false;
  placementPreview.userData.viewDisplaySkipEdges = true;
  ctx.layoutRoot.add(placementPreview);

  const defaultDraftParams = (): DoorParams => ({
    wall: "back",
    wallId: null,
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

  const getPlacementDraft = () => {
    if (!placementDraft) placementDraft = ctx.clampDoorParams(defaultDraftParams());
    return placementDraft;
  };

  const isFloorplanActive = () => ctx.getViewMode() === "2d" && ctx.getActiveViewerTab() === "floorplan";

  const isPlacementPointValid = (lengthMm: number, centerMm: number, widthMm: number) =>
    widthMm < lengthMm && centerMm >= widthMm / 2 && centerMm <= lengthMm - widthMm / 2;

  const buildDoorFrame = (inst: DoorInstance, wallThicknessM: number, planZCenter: number) => {
    resetGroup(inst.frame);
    const widthM = Math.max(0.001, inst.params.widthMm / 1000);
    const heightM = Math.max(0.001, inst.params.heightMm / 1000);
    const panelThicknessM = Math.max(0.006, inst.params.panelThicknessMm / 1000);
    const frameW = Math.max(0.002, Math.min(inst.params.frameWidthMm / 1000, Math.max(0.002, widthM / 2 - 0.02), Math.max(0.002, heightM / 2 - 0.02)));
    const frameDepth = Math.max(panelThicknessM, wallThicknessM + 0.03);
    const innerW = Math.max(0.05, widthM - frameW * 2);
    const panelH = Math.max(0.05, heightM - frameW);
    const material = getDoorMaterialOption(inst.params.materialId);
    const frameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(material.color).multiplyScalar(0.82) });
    const panelMat = new THREE.MeshBasicMaterial({ color: material.color, transparent: true, opacity: 0.94 });
    const handleMat = new THREE.MeshBasicMaterial({ color: 0x2f343b });

    addDoorBox(inst.frame, inst.id, "door-frame-left", { x: frameW, y: heightM, z: frameDepth }, { x: -widthM / 2 + frameW / 2, y: 0, z: planZCenter }, frameMat);
    addDoorBox(inst.frame, inst.id, "door-frame-right", { x: frameW, y: heightM, z: frameDepth }, { x: widthM / 2 - frameW / 2, y: 0, z: planZCenter }, frameMat);
    addDoorBox(inst.frame, inst.id, "door-frame-top", { x: innerW, y: frameW, z: frameDepth }, { x: 0, y: heightM / 2 - frameW / 2, z: planZCenter }, frameMat);
    addDoorBox(inst.frame, inst.id, "door-panel", { x: innerW, y: panelH, z: panelThicknessM }, { x: 0, y: -frameW / 2, z: 0 }, panelMat);
    if (inst.params.handleType !== "none") {
      const handleSide = getDoorHandleSide(inst.params);
      const handleOffsetM = THREE.MathUtils.clamp(inst.params.handleOffsetMm / 1000, 0.035, Math.max(0.035, innerW / 2 - 0.035));
      const handleX = handleSide * Math.max(0.035, innerW / 2 - handleOffsetM);
      const handleMinY = -panelH / 2 + 0.18;
      const handleMaxY = panelH / 2 - 0.18;
      const preferredHandleY = -heightM / 2 + inst.params.handleHeightMm / 1000;
      const handleY = handleMinY <= handleMaxY ? THREE.MathUtils.clamp(preferredHandleY, handleMinY, handleMaxY) : -frameW / 2;
      const leverLength = Math.min(0.18, Math.max(0.12, innerW * 0.22));
      const barHeight = Math.min(0.42, Math.max(0.24, panelH * 0.24));
      for (const faceSign of [-1, 1] as const) {
        const faceName = faceSign > 0 ? "outer" : "inner";
        const rosetteZ = faceSign * (panelThicknessM / 2 + 0.008);
        const gripZ = faceSign * (panelThicknessM / 2 + 0.034);
        if (inst.params.handleType === "knob") {
          addDoorCylinder(inst.frame, inst.id, `door-handle-rosette-${faceName}`, 0.035, 0.014, { x: handleX, y: handleY, z: rosetteZ }, handleMat, "z");
          addDoorSphere(inst.frame, inst.id, `door-handle-knob-${faceName}`, 0.034, { x: handleX, y: handleY, z: gripZ + faceSign * 0.012 }, handleMat);
        } else if (inst.params.handleType === "bar") {
          addDoorCylinder(inst.frame, inst.id, `door-handle-bar-top-${faceName}`, 0.012, 0.038, { x: handleX, y: handleY + barHeight / 2 - 0.035, z: gripZ }, handleMat, "z");
          addDoorCylinder(inst.frame, inst.id, `door-handle-bar-bottom-${faceName}`, 0.012, 0.038, { x: handleX, y: handleY - barHeight / 2 + 0.035, z: gripZ }, handleMat, "z");
          addDoorCylinder(inst.frame, inst.id, `door-handle-bar-grip-${faceName}`, 0.014, barHeight, { x: handleX, y: handleY, z: gripZ + faceSign * 0.016 }, handleMat, "y");
        } else {
          addDoorCylinder(inst.frame, inst.id, `door-handle-rosette-${faceName}`, 0.035, 0.014, { x: handleX, y: handleY, z: rosetteZ }, handleMat, "z");
          addDoorCylinder(inst.frame, inst.id, `door-handle-neck-${faceName}`, 0.012, 0.04, { x: handleX, y: handleY, z: gripZ }, handleMat, "z");
          addDoorCylinder(inst.frame, inst.id, `door-handle-lever-${faceName}`, 0.012, leverLength, { x: handleX - handleSide * leverLength / 2, y: handleY, z: gripZ + faceSign * 0.018 }, handleMat, "x");
        }
      }
    }

    frameMat.dispose();
    panelMat.dispose();
    handleMat.dispose();
  };

  const rebuildDoorSelection = (
    inst: DoorInstance,
    args: {
      widthM: number;
      heightM: number;
      frameW: number;
      wallThicknessM: number;
      planYLocal: number;
      planZCenter: number;
      pickMaxZ: number;
    }
  ) => {
    const selected = inst.selection.visible;
    resetGroup(inst.selection);
    const halfW = args.widthM / 2;
    const halfH = args.heightM / 2;
    const frameW = Math.max(0.002, Math.min(args.frameW, halfW - 0.01, halfH - 0.01));
    const widthLabel = `${Math.round(args.widthM * 1000)}`;
    const heightLabel = `${Math.round(args.heightM * 1000)}`;

    const model = new THREE.Group();
    model.name = "doorSelection3d";
    model.userData.doorOverlayView = "3d";
    const zFront = args.pickMaxZ + 0.018;
    addRectSelection(model, -halfW, -halfW + frameW, -halfH, halfH, zFront);
    addRectSelection(model, halfW - frameW, halfW, -halfH, halfH, zFront);
    addRectSelection(model, -halfW + frameW, halfW - frameW, halfH - frameW, halfH, zFront);
    addRectSelection(model, -halfW + frameW, halfW - frameW, -halfH, halfH - frameW, zFront);
    const modelDimY = -halfH - 0.46;
    addDoorDimensions(model, {
      a: new THREE.Vector3(-halfW, -halfH, zFront),
      b: new THREE.Vector3(halfW, -halfH, zFront),
      dimA: new THREE.Vector3(-halfW, modelDimY, zFront),
      dimB: new THREE.Vector3(halfW, modelDimY, zFront),
      widthTextPos: new THREE.Vector3(0, modelDimY + 0.09, zFront),
      heightTextPos: new THREE.Vector3(0, modelDimY - 0.09, zFront),
      tickAxisA: new THREE.Vector3(1, 0, 0),
      tickAxisB: new THREE.Vector3(0, 1, 0),
      widthLabel,
      heightLabel
    });
    const modelControlCenter = new THREE.Vector3(0, 0, zFront + 0.018);
    const modelStackAxis = new THREE.Vector3(0, 0.17, 0);
    const modelHandedness = createDoorSwingControlSprite("toggleHandedness");
    modelHandedness.position.copy(modelControlCenter).add(modelStackAxis);
    model.add(modelHandedness);
    const modelSide = createDoorSwingControlSprite("toggleSwingSide");
    modelSide.position.copy(modelControlCenter).addScaledVector(modelStackAxis, -1);
    model.add(modelSide);
    inst.selection.add(model);

    const plan = new THREE.Group();
    plan.name = "doorSelectionPlan";
    plan.userData.doorOverlayView = "plan";
    const planY = args.planYLocal + 0.034;
    syncDoorPlanSymbol(plan, {
      widthM: args.widthM,
      wallThicknessM: args.wallThicknessM,
      yLocal: planY,
      zCenter: args.planZCenter,
      swingDirection: inst.params.swingDirection,
      swingSide: inst.params.swingSide,
      swingAngleDeg: inst.params.swingAngleDeg,
      frameWidthM: frameW,
      panelThicknessM: Math.max(0.006, inst.params.panelThicknessMm / 1000),
      color: 0x3ddc97,
      opacity: 0.98
    });
    const planLabelRotationRad = readablePlanLabelRotation(-inst.root.rotation.y);
    const halfT = Math.max(0.025, args.wallThicknessM / 2);
    const dimSide = inst.params.swingSide === "outward" ? -1 : 1;
    const z1 = args.planZCenter + dimSide * halfT;
    const dimZ = z1 + dimSide * 0.5;
    addDoorDimensions(plan, {
      a: new THREE.Vector3(-halfW, planY, z1),
      b: new THREE.Vector3(halfW, planY, z1),
      dimA: new THREE.Vector3(-halfW, planY, dimZ),
      dimB: new THREE.Vector3(halfW, planY, dimZ),
      widthTextPos: new THREE.Vector3(0, planY, dimZ - dimSide * 0.09),
      heightTextPos: new THREE.Vector3(0, planY, dimZ + dimSide * 0.09),
      tickAxisA: new THREE.Vector3(1, 0, 0),
      tickAxisB: new THREE.Vector3(0, 0, dimSide),
      widthLabel,
      heightLabel,
      labelRotationRad: planLabelRotationRad
    });
    const controlDepthSide = inst.params.swingSide === "outward" ? 1 : -1;
    const controlDepthOffset = halfT + 0.22;
    const controlCenter = new THREE.Vector3(0, planY, args.planZCenter + controlDepthSide * controlDepthOffset);
    const stackAxis = new THREE.Vector3(0, 0, 1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -inst.root.rotation.y)
      .normalize()
      .multiplyScalar(0.085);
    const handedness = createDoorSwingControlSprite("toggleHandedness", planLabelRotationRad);
    handedness.position.copy(controlCenter).addScaledVector(stackAxis, -1);
    plan.add(handedness);
    const side = createDoorSwingControlSprite("toggleSwingSide", planLabelRotationRad);
    side.position.copy(controlCenter).add(stackAxis);
    plan.add(side);
    inst.selection.add(plan);
    inst.selection.visible = selected;
  };

  function syncDoorSelectionVisuals(selected = selectedDoorVisible) {
    selectedDoorVisible = selected;
    const targetView = isFloorplanActive() ? "plan" : "3d";
    for (const inst of ctx.doors) {
      for (const child of inst.selection.children) {
        child.visible = child.userData.doorOverlayView === targetView;
      }
      inst.selection.visible = selectedDoorVisible && inst === ctx.doorInst;
    }
  }

  function updateDoorTransform(inst: DoorInstance) {
    inst.params = ctx.clampDoorParams(inst.params);
    const wall = inst.params.wallId ? ctx.walls.find((item) => item.id === inst.params.wallId) ?? null : null;
    if (!wall) return;
    const basis = getWallBasis(wall);
    if (!basis) return;

    const widthM = inst.params.widthMm / 1000;
    const heightM = inst.params.heightMm / 1000;
    const panelThicknessM = Math.max(0.006, inst.params.panelThicknessMm / 1000);
    const frameW = Math.max(0.002, inst.params.frameWidthMm / 1000);
    const wallCenterOffsetM = getDoorWallCenterOffset(inst.params, basis.thicknessM, panelThicknessM);
    const center = basis.centerA.clone().addScaledVector(basis.dir, inst.params.centerMm / 1000);
    center.addScaledVector(basis.exteriorNormal, wallCenterOffsetM);
    center.y = heightM / 2;
    inst.root.position.copy(center);
    inst.root.rotation.set(0, -Math.atan2(basis.dir.z, basis.dir.x), 0);

    const planYLocal = -inst.root.position.y + 0.065;
    const planZCenter = -wallCenterOffsetM;
    syncDoorPlanSymbol(inst.plan, {
      widthM,
      wallThicknessM: basis.thicknessM,
      yLocal: planYLocal,
      zCenter: planZCenter,
      swingDirection: inst.params.swingDirection,
      swingSide: inst.params.swingSide,
      swingAngleDeg: inst.params.swingAngleDeg,
      frameWidthM: frameW,
      panelThicknessM,
      color: 0x111827,
      opacity: 0.95
    });
    inst.plan.visible = isFloorplanActive();
    buildDoorFrame(inst, basis.thicknessM, planZCenter);
    inst.frame.visible = !isFloorplanActive();

    const frameDepth = Math.max(panelThicknessM, basis.thicknessM + 0.03);
    const minZ = Math.min(-panelThicknessM / 2, planZCenter - frameDepth / 2);
    const maxZ = Math.max(panelThicknessM / 2, planZCenter + frameDepth / 2);
    const pickCenterZ = (minZ + maxZ) / 2;
    inst.pick.geometry.dispose();
    inst.pick.geometry = new THREE.BoxGeometry(Math.max(0.18, widthM + 0.16), Math.max(0.18, heightM + 0.16), Math.max(0.12, maxZ - minZ + 0.12));
    inst.pick.position.set(0, 0, pickCenterZ);

    rebuildDoorSelection(inst, {
      widthM,
      heightM,
      frameW,
      wallThicknessM: basis.thicknessM,
      planYLocal,
      planZCenter,
      pickMaxZ: maxZ
    });
    syncDoorSelectionVisuals();

    const pts = [
      new THREE.Vector3(-widthM / 2, -heightM / 2, maxZ + 0.004),
      new THREE.Vector3(widthM / 2, -heightM / 2, maxZ + 0.004),
      new THREE.Vector3(widthM / 2, heightM / 2, maxZ + 0.004),
      new THREE.Vector3(-widthM / 2, heightM / 2, maxZ + 0.004),
      new THREE.Vector3(-widthM / 2, -heightM / 2, maxZ + 0.004)
    ];
    inst.outline.geometry.dispose();
    inst.outline.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    inst.outline.visible = false;

    ctx.rebuildWall(wall);
    ctx.rebuildWallPlanMesh();
  }

  function clearDoorPlacementPreview() {
    placementPreview.visible = false;
    lastPreviewWallId = null;
    lastPreviewPointMm = null;
  }

  function cancelDoorPlacement() {
    if (!placementActive) return false;
    placementActive = false;
    clearDoorPlacementPreview();
    ctx.setUnderlayStatus("");
    ctx.mountProps();
    return true;
  }

  function updateDoorPlacementPreview(wallId: string | null, pointMm: { x: number; z: number } | null) {
    if (!placementActive || !wallId || !pointMm || !isFloorplanActive()) {
      clearDoorPlacementPreview();
      return false;
    }
    const wall = ctx.walls.find((item) => item.id === wallId) ?? null;
    if (!wall) {
      clearDoorPlacementPreview();
      return false;
    }
    const basis = getWallBasis(wall);
    if (!basis) {
      clearDoorPlacementPreview();
      return false;
    }
    const draft = getPlacementDraft();
    const { centerMm, lengthMm } = centerOnWallMm(wall, pointMm);
    const widthMm = Math.max(1, Math.round(draft.widthMm));
    const valid = isPlacementPointValid(lengthMm, centerMm, widthMm);
    const panelThicknessM = Math.max(0.006, draft.panelThicknessMm / 1000);
    const wallCenterOffsetM = getDoorWallCenterOffset(draft, basis.thicknessM, panelThicknessM);
    const center = basis.centerA.clone().addScaledVector(basis.dir, centerMm / 1000);
    center.addScaledVector(basis.exteriorNormal, wallCenterOffsetM);
    placementPreview.position.set(center.x, 0, center.z);
    placementPreview.rotation.set(0, -Math.atan2(basis.dir.z, basis.dir.x), 0);
    syncDoorPlanSymbol(placementPreview, {
      widthM: widthMm / 1000,
      wallThicknessM: basis.thicknessM,
      yLocal: 0.078,
      zCenter: -wallCenterOffsetM,
      swingDirection: draft.swingDirection,
      swingSide: draft.swingSide,
      swingAngleDeg: draft.swingAngleDeg,
      frameWidthM: Math.max(0.004, draft.frameWidthMm / 1000),
      panelThicknessM,
      color: valid ? 0x12b981 : 0xef4444,
      opacity: valid ? 0.95 : 0.78,
      preview: true
    });
    placementPreview.visible = true;
    lastPreviewWallId = wallId;
    lastPreviewPointMm = { ...pointMm };
    return valid;
  }

  function updateDoorPlacementParams(next: Partial<DoorParams>) {
    const draft = getPlacementDraft();
    placementDraft = ctx.clampDoorParams({ ...draft, ...next });
    if (lastPreviewWallId && lastPreviewPointMm) updateDoorPlacementPreview(lastPreviewWallId, lastPreviewPointMm);
    return placementDraft;
  }

  function rotateDoorPlacement() {
    if (!placementActive) return false;
    const draft = getPlacementDraft();
    placementDraft = ctx.clampDoorParams({
      ...draft,
      swingDirection: draft.swingDirection === "right" ? "left" : "right"
    });
    if (lastPreviewWallId && lastPreviewPointMm) updateDoorPlacementPreview(lastPreviewWallId, lastPreviewPointMm);
    ctx.mountProps();
    ctx.setUnderlayStatus(`Door: otvaranie ${placementDraft.swingDirection === "right" ? "prave" : "lave"}. Space = lave/prave, Shift+Space = dnu/von, Esc = ukoncit.`);
    return true;
  }

  function flipDoorPlacementSwingSide() {
    if (!placementActive) return false;
    const draft = getPlacementDraft();
    placementDraft = ctx.clampDoorParams({
      ...draft,
      swingSide: draft.swingSide === "outward" ? "inward" : "outward"
    });
    if (lastPreviewWallId && lastPreviewPointMm) updateDoorPlacementPreview(lastPreviewWallId, lastPreviewPointMm);
    ctx.mountProps();
    ctx.setUnderlayStatus(`Door: smer ${placementDraft.swingSide === "outward" ? "von" : "dovnutra"}. Shift+Space = dnu/von, Esc = ukoncit.`);
    return true;
  }

  function insertDoorAtWallPoint(wallId: string, pointMm: { x: number; z: number }) {
    const wall = ctx.walls.find((item) => item.id === wallId) ?? null;
    if (!wall) return false;
    const draft = getPlacementDraft();
    const widthMm = Math.max(1, Math.round(draft.widthMm));
    const { centerMm, lengthMm } = centerOnWallMm(wall, pointMm);
    if (!isPlacementPointValid(lengthMm, centerMm, widthMm)) {
      ctx.setUnderlayStatus("Door: dvere sa nedaju vlozit do hrany steny. Klikni dalej od konca.");
      return false;
    }

    const inst = ctx.createDoor("back", wall.id);
    inst.params = {
      ...inst.params,
      ...structuredClone(draft),
      wall: "back",
      wallId: wall.id,
      centerMm
    };
    ctx.doorInst = inst;
    ctx.doors.push(inst);
    ctx.layoutRoot.add(inst.root);
    updateDoorTransform(inst);
    placementActive = true;
    placementPreview.visible = false;
    ctx.setSelectedDoor();
    ctx.mountProps();
    ctx.commitHistory();
    ctx.setUnderlayStatus("Door: klikni dalsie miesto na stene. Space = lave/prave, Shift+Space = dnu/von, Esc = ukoncit.");
    return true;
  }

  function addOrSelectDoor() {
    if (ctx.mode !== "layout") return;
    if (ctx.walls.length === 0) {
      ctx.setUnderlayStatus("Door: najprv nakresli stenu.");
      return;
    }
    ctx.setToolSelect();
    ctx.ensureFloorplanViewerTab();
    placementDraft = ctx.clampDoorParams(ctx.doorInst ? structuredClone(ctx.doorInst.params) : defaultDraftParams());
    placementActive = true;
    const selectedWallId = ctx.getSelectedWallId();
    ctx.setUnderlayStatus(selectedWallId ? "Door: uprav parametre a klikni miesto na vybratej stene. Space = lave/prave, Shift+Space = dnu/von." : "Door: uprav parametre a klikni miesto na stene. Space = lave/prave, Shift+Space = dnu/von.");
    ctx.mountProps();
  }

  return {
    updateDoorTransform,
    addOrSelectDoor,
    cancelDoorPlacement,
    insertDoorAtWallPoint,
    updateDoorPlacementPreview,
    clearDoorPlacementPreview,
    getDoorPlacementParams: () => (placementActive ? getPlacementDraft() : null),
    updateDoorPlacementParams,
    rotateDoorPlacement,
    flipDoorPlacementSwingSide,
    isDoorPlacementActive: () => placementActive,
    syncDoorSelectionVisuals
  };
}
