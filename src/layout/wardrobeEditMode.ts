import * as THREE from "three";
import type { Camera, Group, Object3D } from "three";
import type { BoardFamily, MaterialDefinition } from "../core/catalog/catalog-types";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { EditorPropsApi, EditorTopbarApi } from "../app/editorModeApis";
import { parseWardrobeDimensionEdit, type WardrobeDimensionEdit } from "./wardrobeDimensionEditMetadata";

type WardrobePartKind = "vertical" | "horizontal" | "back";
type WardrobeJointPriority = "horizontal" | "vertical";

type WardrobePart = {
  id: string;
  kind: WardrobePartKind;
  meshes: THREE.Mesh[];
  xMm: number;
  yMm: number;
  depthMm: number;
  materialId: string | null;
  thicknessMm: number | null;
  customPosition: boolean;
  customDepth: boolean;
};

type WardrobeParams = {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  corpusMaterialId: string;
  corpusThicknessMm: number;
  backMaterialId: string;
  backThicknessMm: number;
  innerMaterialId: string;
  innerThicknessMm: number;
  innerJointPriority: WardrobeJointPriority;
};

type WardrobeGroup = {
  id: string;
  name: string;
  root: THREE.Group;
  dimensionsRoot: THREE.Group;
  params: WardrobeParams;
  parts: WardrobePart[];
  nextPartIndex: number;
  selectedPartId: string | null;
};

export type WardrobeEditSaveState = {
  activeGroupId: string | null;
  groups: Array<{
    id: string;
    name: string;
    params: WardrobeParams;
    parts: Array<Omit<WardrobePart, "meshes">>;
    nextPartIndex: number;
    selectedPartId: string | null;
  }>;
};

type WardrobeJointEdit = { kind: "jointPriorityToggle" };

type DimensionLabelOrientation = "horizontal" | "verticalClockwise";

type CreateWardrobeEditModeArgs = {
  layoutRoot: Group;
  viewerEl: HTMLElement;
  getCamera: () => Camera;
  tb: EditorTopbarApi;
  props: EditorPropsApi;
  icons: {
    board: string;
    back: string;
    done: string;
    cancel: string;
  };
  ensureLayoutMode: () => void;
  setToolSelect: () => void;
  cancelPlacementIfActive: () => void;
  disposeObject3D: (obj: Object3D) => void;
  recordActivity?: (label: string) => void;
  buildClassicTopbar: () => void;
  restoreStandardTopbar: () => void;
  refreshProps: () => void;
  catalog: ClientCatalog;
};

const mmToM = (value: number) => value / 1000;
const BOARD_THICKNESS_MM = 18;
const BACK_THICKNESS_MM = 6;
const DEFAULT_CORPUS_MATERIAL_ID = "mat.board.body.dtd.grey.18";
const DEFAULT_BACK_MATERIAL_ID = "mat.board.back.hdf.grey.6";
const DEFAULT_INNER_MATERIAL_ID = "mat.board.shelf.dtd.grey.18";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const boardMaterialsForFamily = (catalog: ClientCatalog, family: BoardFamily) =>
  catalog.materials
    .filter((material): material is MaterialDefinition =>
      material.materialType === "board" && material.isActive && material.boardFamily === family
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

const getBoardMaterial = (catalog: ClientCatalog, materialId: string, fallbackFamily: BoardFamily) => {
  const material = catalog.materials.find((item) => item.id === materialId) ?? null;
  if (material?.materialType === "board" && material.boardFamily === fallbackFamily) return material;
  return boardMaterialsForFamily(catalog, fallbackFamily)[0] ?? null;
};

const thicknessOptionsForMaterial = (material: MaterialDefinition | null) => {
  if (!material) return [];
  const values = material.availableThicknessesMm.filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(values.length > 0 ? values : [material.defaultThicknessMm])].sort((left, right) => left - right);
};

const allowsCustomThickness = (material: MaterialDefinition | null) => material?.baseMaterial === "solid_wood";

const resolveThickness = (catalog: ClientCatalog, materialId: string, family: BoardFamily, desired: number) => {
  const material = getBoardMaterial(catalog, materialId, family);
  if (allowsCustomThickness(material)) return Math.max(1, Math.round(desired));
  const options = thicknessOptionsForMaterial(material);
  if (options.length === 0) return Math.max(1, Math.round(desired));
  return options.includes(desired)
    ? desired
    : [...options].sort((left, right) => Math.abs(left - desired) - Math.abs(right - desired))[0]!;
};

export function createWardrobeEditMode(args: CreateWardrobeEditModeArgs) {
  const groups: WardrobeGroup[] = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let activeGroupId: string | null = null;

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf1eee5, roughness: 0.7, metalness: 0.02 });
  const backMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d4ca, roughness: 0.78, metalness: 0.01 });
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x54616b });

  const findActiveGroup = () => groups.find((group) => group.id === activeGroupId) ?? null;
  const findPart = (group: WardrobeGroup, partId: string | null) => group.parts.find((part) => part.id === partId) ?? null;
  const recordChange = (label: string) => args.recordActivity?.(label);
  const getPartFamily = (group: WardrobeGroup, part: WardrobePart): BoardFamily => {
    if (part.kind === "back") return "back";
    const sameKind = group.parts
      .filter((item) => item.kind === part.kind)
      .sort((left, right) => (part.kind === "vertical" ? left.xMm - right.xMm : left.yMm - right.yMm));
    const index = sameKind.indexOf(part);
    return index === 0 || index === sameKind.length - 1 ? "body" : "shelf";
  };
  const getDefaultMaterialId = (group: WardrobeGroup, family: BoardFamily) => {
    if (family === "back") return group.params.backMaterialId;
    if (family === "shelf") return group.params.innerMaterialId;
    return group.params.corpusMaterialId;
  };
  const getDefaultThicknessMm = (group: WardrobeGroup, family: BoardFamily) => {
    if (family === "back") return group.params.backThicknessMm;
    if (family === "shelf") return group.params.innerThicknessMm;
    return group.params.corpusThicknessMm;
  };
  const getPartMaterialId = (group: WardrobeGroup, part: WardrobePart) => {
    const family = getPartFamily(group, part);
    return part.materialId ?? getDefaultMaterialId(group, family);
  };
  const getPartThicknessMm = (group: WardrobeGroup, part: WardrobePart) => {
    const family = getPartFamily(group, part);
    return part.thicknessMm ?? getDefaultThicknessMm(group, family);
  };
  const isInnerBoard = (group: WardrobeGroup, part: WardrobePart) =>
    part.kind !== "back" && getPartFamily(group, part) === "shelf";
  const makePanelMaterial = (materialId: string, family: BoardFamily) => {
    const material = getBoardMaterial(args.catalog, materialId, family);
    return new THREE.MeshStandardMaterial({
      color: material?.preview.colorHex ?? (family === "back" ? 0xd8d4ca : 0xf1eee5),
      roughness: material?.preview.roughness ?? 0.72,
      metalness: material?.preview.metalness ?? 0.02
    });
  };
  const createPanelMesh = (kind: WardrobePartKind) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), (kind === "back" ? backMaterial : bodyMaterial).clone());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const disposePartMeshes = (group: WardrobeGroup, part: WardrobePart) => {
    for (const mesh of part.meshes) {
      group.root.remove(mesh);
      args.disposeObject3D(mesh);
    }
    part.meshes = [];
  };

  const createPartMesh = (
    group: WardrobeGroup,
    part: WardrobePart,
    sizeMm: { width: number; height: number; depth: number },
    positionMm: { x: number; y: number; z: number }
  ) => {
    const mesh = createPanelMesh(part.kind);
    const current = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(current)) current.forEach((material) => material.dispose());
    else current.dispose();
    const family = getPartFamily(group, part);
    mesh.material = makePanelMaterial(getPartMaterialId(group, part), family);
    mesh.userData.wardrobeGroupId = group.id;
    mesh.userData.wardrobePartId = part.id;
    setPanelTransform(mesh, sizeMm, positionMm);
    part.meshes.push(mesh);
    group.root.add(mesh);
  };

  const createOutline = (params: WardrobeParams) => {
    const geometry = new THREE.BoxGeometry(mmToM(params.widthMm), mmToM(params.heightMm), mmToM(params.depthMm));
    geometry.translate(0, mmToM(params.heightMm) / 2, 0);
    return new THREE.LineSegments(new THREE.EdgesGeometry(geometry), outlineMaterial);
  };

  const disposeDimensions = (group: WardrobeGroup) => {
    for (const child of [...group.dimensionsRoot.children]) {
      group.dimensionsRoot.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
          return;
        }
        if (obj instanceof THREE.LineSegments || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            for (const material of obj.material) material.dispose();
          } else {
            obj.material.dispose();
          }
        }
      });
    }
  };

  const createDimensionSprite = (
    text: string,
    active: boolean,
    edit: WardrobeDimensionEdit,
    orientation: DimensionLabelOrientation = "horizontal"
  ) => {
    const isVertical = orientation === "verticalClockwise";
    const canvas = document.createElement("canvas");
    canvas.width = isVertical ? 120 : 220;
    canvas.height = isVertical ? 320 : 84;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      if (isVertical) ctx.rotate(Math.PI / 2);
      ctx.font = '400 42px ISOCPEUR, "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = "#1f252b";
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
    sprite.scale.set(isVertical ? 0.26 : 0.52, isVertical ? 0.7 : 0.18, 1);
    sprite.renderOrder = 40;
    sprite.userData.wardrobeDimensionEdit = edit;
    return sprite;
  };

  const createJointToggleSprite = (group: WardrobeGroup) => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255, 250, 214, 0.95)";
      ctx.strokeStyle = "#c98d00";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(48, 48, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1f252b";
      ctx.font = '400 38px ISOCPEUR, "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(group.params.innerJointPriority === "horizontal" ? "H" : "V", 48, 50);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
    sprite.scale.set(0.16, 0.16, 1);
    sprite.renderOrder = 42;
    sprite.userData.wardrobeJointEdit = { kind: "jointPriorityToggle" } satisfies WardrobeJointEdit;
    return sprite;
  };

  const createDimensionLine = (pointsMm: Array<{ x: number; y: number; z: number }>, active: boolean) => {
    const vertices: number[] = [];
    for (let i = 0; i < pointsMm.length - 1; i += 2) {
      vertices.push(
        mmToM(pointsMm[i].x),
        mmToM(pointsMm[i].y),
        mmToM(pointsMm[i].z),
        mmToM(pointsMm[i + 1].x),
        mmToM(pointsMm[i + 1].y),
        mmToM(pointsMm[i + 1].z)
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({
      color: active ? 0xc98d00 : 0x386f9d,
      depthTest: false,
      depthWrite: false
    });
    const line = new THREE.LineSegments(geometry, material);
    line.renderOrder = 39;
    return line;
  };

  const addHorizontalDimension = (
    group: WardrobeGroup,
    aX: number,
    bX: number,
    y: number,
    z: number,
    label: string,
    active: boolean,
    edit: WardrobeDimensionEdit
  ) => {
    const tick = 42;
    const ext = 70;
    const root = new THREE.Group();
    root.add(
      createDimensionLine(
        [
          { x: aX, y, z },
          { x: bX, y, z },
          { x: aX, y: y - ext, z },
          { x: aX, y: y + ext, z },
          { x: bX, y: y - ext, z },
          { x: bX, y: y + ext, z },
          { x: aX - tick / 2, y: y - tick / 2, z },
          { x: aX + tick / 2, y: y + tick / 2, z },
          { x: bX - tick / 2, y: y - tick / 2, z },
          { x: bX + tick / 2, y: y + tick / 2, z }
        ],
        active
      )
    );
    const sprite = createDimensionSprite(label, active, edit);
    sprite.position.set(mmToM((aX + bX) / 2), mmToM(y + 55), mmToM(z));
    root.add(sprite);
    group.dimensionsRoot.add(root);
  };

  const addVerticalDimension = (
    group: WardrobeGroup,
    x: number,
    aY: number,
    bY: number,
    z: number,
    label: string,
    active: boolean,
    edit: WardrobeDimensionEdit
  ) => {
    const tick = 42;
    const ext = 70;
    const root = new THREE.Group();
    root.add(
      createDimensionLine(
        [
          { x, y: aY, z },
          { x, y: bY, z },
          { x: x - ext, y: aY, z },
          { x: x + ext, y: aY, z },
          { x: x - ext, y: bY, z },
          { x: x + ext, y: bY, z },
          { x: x - tick / 2, y: aY - tick / 2, z },
          { x: x + tick / 2, y: aY + tick / 2, z },
          { x: x - tick / 2, y: bY - tick / 2, z },
          { x: x + tick / 2, y: bY + tick / 2, z }
        ],
        active
      )
    );
    const sprite = createDimensionSprite(label, active, edit, "verticalClockwise");
    sprite.position.set(mmToM(x - 58), mmToM((aY + bY) / 2), mmToM(z));
    root.add(sprite);
    group.dimensionsRoot.add(root);
  };

  const addDepthDimension = (
    group: WardrobeGroup,
    x: number,
    y: number,
    backZ: number,
    frontZ: number,
    label: string,
    active: boolean,
    edit: WardrobeDimensionEdit
  ) => {
    const tick = 42;
    const ext = 70;
    const root = new THREE.Group();
    root.add(
      createDimensionLine(
        [
          { x, y, z: backZ },
          { x, y, z: frontZ },
          { x: x - ext, y, z: backZ },
          { x: x + ext, y, z: backZ },
          { x: x - ext, y, z: frontZ },
          { x: x + ext, y, z: frontZ },
          { x: x - tick / 2, y, z: backZ - tick / 2 },
          { x: x + tick / 2, y, z: backZ + tick / 2 },
          { x: x - tick / 2, y, z: frontZ - tick / 2 },
          { x: x + tick / 2, y, z: frontZ + tick / 2 }
        ],
        active
      )
    );
    const sprite = createDimensionSprite(label, active, edit);
    sprite.position.set(mmToM(x), mmToM(y + 55), mmToM((backZ + frontZ) / 2));
    root.add(sprite);
    group.dimensionsRoot.add(root);
  };

  const rebuildOutline = (group: WardrobeGroup) => {
    const old = group.root.getObjectByName("wardrobe-outline");
    if (old) {
      group.root.remove(old);
      const line = old as THREE.LineSegments;
      line.geometry?.dispose();
    }
    const outline = createOutline(group.params);
    outline.name = "wardrobe-outline";
    group.root.add(outline);
  };

  const setPanelTransform = (
    mesh: THREE.Mesh,
    sizeMm: { width: number; height: number; depth: number },
    positionMm: { x: number; y: number; z: number }
  ) => {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BoxGeometry(mmToM(sizeMm.width), mmToM(sizeMm.height), mmToM(sizeMm.depth));
    mesh.position.set(mmToM(positionMm.x), mmToM(positionMm.y), mmToM(positionMm.z));
  };

  const distributeAutoParts = (group: WardrobeGroup) => {
    const { widthMm, heightMm } = group.params;
    const verticals = group.parts.filter((part) => part.kind === "vertical");
    const horizontals = group.parts.filter((part) => part.kind === "horizontal");

    const distributeAxis = (parts: WardrobePart[], min: number, max: number, setValue: (part: WardrobePart, value: number) => void) => {
      if (parts.length === 0) return;
      if (parts.length === 1) {
        if (!parts[0]!.customPosition) setValue(parts[0]!, (min + max) / 2);
        return;
      }

      const startPart = parts[0]!;
      const endPart = parts[1]!;
      if (!startPart.customPosition) setValue(startPart, min);
      if (!endPart.customPosition) setValue(endPart, max);

      const innerParts = parts.slice(2).filter((part) => !part.customPosition);
      innerParts.forEach((part, index) => {
        setValue(part, min + ((max - min) * (index + 1)) / (innerParts.length + 1));
      });
    };

    distributeAxis(verticals, -widthMm / 2, widthMm / 2, (part, value) => {
      part.xMm = value;
    });
    distributeAxis(horizontals, 0, heightMm, (part, value) => {
      part.yMm = value;
    });
  };

  const subtractRange = (ranges: Array<{ start: number; end: number }>, cutStart: number, cutEnd: number) => {
    const next: Array<{ start: number; end: number }> = [];
    for (const range of ranges) {
      if (cutEnd <= range.start || cutStart >= range.end) {
        next.push(range);
        continue;
      }
      if (cutStart > range.start) next.push({ start: range.start, end: cutStart });
      if (cutEnd < range.end) next.push({ start: cutEnd, end: range.end });
    }
    return next.filter((range) => range.end - range.start > 1);
  };

  const getInnerXBounds = (group: WardrobeGroup) => {
    const verticals = group.parts.filter((part) => part.kind === "vertical").sort((a, b) => a.xMm - b.xMm);
    const left = verticals[0] ?? null;
    const right = verticals[verticals.length - 1] ?? null;
    return {
      start: left ? left.xMm + getPartThicknessMm(group, left) / 2 : -group.params.widthMm / 2,
      end: right ? right.xMm - getPartThicknessMm(group, right) / 2 : group.params.widthMm / 2
    };
  };

  const getInnerYBounds = (group: WardrobeGroup) => {
    const horizontals = group.parts.filter((part) => part.kind === "horizontal").sort((a, b) => a.yMm - b.yMm);
    const bottom = horizontals[0] ?? null;
    const top = horizontals[horizontals.length - 1] ?? null;
    return {
      start: bottom ? bottom.yMm + getPartThicknessMm(group, bottom) / 2 : 0,
      end: top ? top.yMm - getPartThicknessMm(group, top) / 2 : group.params.heightMm
    };
  };

  const rebuildVerticalPartMeshes = (group: WardrobeGroup, part: WardrobePart, thicknessMm: number) => {
    const { heightMm, depthMm } = group.params;
    const depth = clamp(part.customDepth ? part.depthMm : depthMm, 1, depthMm);
    part.depthMm = depth;
    part.xMm = clamp(part.xMm, -group.params.widthMm / 2 + thicknessMm / 2, group.params.widthMm / 2 - thicknessMm / 2);

    let ranges = isInnerBoard(group, part)
      ? [getInnerYBounds(group)]
      : [{ start: 0, end: heightMm }];
    if (isInnerBoard(group, part) && group.params.innerJointPriority === "horizontal") {
      for (const horizontal of group.parts.filter((item) => item.kind === "horizontal" && isInnerBoard(group, item))) {
        const cutThickness = getPartThicknessMm(group, horizontal);
        ranges = subtractRange(ranges, horizontal.yMm - cutThickness / 2, horizontal.yMm + cutThickness / 2);
      }
    }

    for (const range of ranges) {
      createPartMesh(
        group,
        part,
        { width: thicknessMm, height: range.end - range.start, depth },
        { x: part.xMm, y: (range.start + range.end) / 2, z: depthMm / 2 - depth / 2 }
      );
    }
  };

  const rebuildHorizontalPartMeshes = (group: WardrobeGroup, part: WardrobePart, thicknessMm: number) => {
    const { widthMm, heightMm, depthMm } = group.params;
    const depth = clamp(part.customDepth ? part.depthMm : depthMm, 1, depthMm);
    part.depthMm = depth;
    part.yMm = clamp(part.yMm, thicknessMm / 2, heightMm - thicknessMm / 2);

    let ranges = isInnerBoard(group, part)
      ? [getInnerXBounds(group)]
      : [{ start: -widthMm / 2, end: widthMm / 2 }];
    if (isInnerBoard(group, part) && group.params.innerJointPriority === "vertical") {
      for (const vertical of group.parts.filter((item) => item.kind === "vertical" && isInnerBoard(group, item))) {
        const cutThickness = getPartThicknessMm(group, vertical);
        ranges = subtractRange(ranges, vertical.xMm - cutThickness / 2, vertical.xMm + cutThickness / 2);
      }
    }

    for (const range of ranges) {
      createPartMesh(
        group,
        part,
        { width: range.end - range.start, height: thicknessMm, depth },
        { x: (range.start + range.end) / 2, y: part.yMm, z: depthMm / 2 - depth / 2 }
      );
    }
  };

  const rebuildDimensions = (group: WardrobeGroup) => {
    disposeDimensions(group);
    const selectedPart = findPart(group, group.selectedPartId);
    const { widthMm, heightMm, depthMm } = group.params;

    const verticals = group.parts
      .filter((part) => part.kind === "vertical")
      .sort((a, b) => a.xMm - b.xMm);
    for (let i = 0; i < verticals.length - 1; i += 1) {
      const a = verticals[i];
      const b = verticals[i + 1];
      const aThickness = getPartThicknessMm(group, a);
      const bThickness = getPartThicknessMm(group, b);
      const gap = Math.max(0, Math.round(b.xMm - bThickness / 2 - (a.xMm + aThickness / 2)));
      const active = selectedPart === a || selectedPart === b;
      addHorizontalDimension(
        group,
        a.xMm + aThickness / 2,
        b.xMm - bThickness / 2,
        heightMm + 105,
        depthMm / 2 + 80,
        `${gap}`,
        active,
        { kind: "verticalGap", aPartId: a.id, bPartId: b.id }
      );
    }

    const horizontals = group.parts
      .filter((part) => part.kind === "horizontal")
      .sort((a, b) => a.yMm - b.yMm);
    for (let i = 0; i < horizontals.length - 1; i += 1) {
      const a = horizontals[i];
      const b = horizontals[i + 1];
      const aThickness = getPartThicknessMm(group, a);
      const bThickness = getPartThicknessMm(group, b);
      const gap = Math.max(0, Math.round(b.yMm - bThickness / 2 - (a.yMm + aThickness / 2)));
      const active = selectedPart === a || selectedPart === b;
      addVerticalDimension(
        group,
        -widthMm / 2 - 130,
        a.yMm + aThickness / 2,
        b.yMm - bThickness / 2,
        depthMm / 2 + 80,
        `${gap}`,
        active,
        { kind: "horizontalGap", aPartId: a.id, bPartId: b.id }
      );
    }

    if (selectedPart && selectedPart.kind !== "back") {
      addDepthDimension(
        group,
        selectedPart.kind === "vertical" ? selectedPart.xMm + 95 : widthMm / 2 + 95,
        selectedPart.kind === "vertical" ? heightMm / 2 : selectedPart.yMm + 95,
        depthMm / 2,
        depthMm / 2 - selectedPart.depthMm,
        `${Math.round(selectedPart.depthMm)}`,
        true,
        { kind: "partDepth", partId: selectedPart.id }
      );
    }

    if (selectedPart && isInnerBoard(group, selectedPart)) {
      const oppositeParts = group.parts.filter((part) =>
        selectedPart.kind === "vertical"
          ? part.kind === "horizontal" && isInnerBoard(group, part)
          : part.kind === "vertical" && isInnerBoard(group, part)
      );
      for (const part of oppositeParts) {
        const sprite = createJointToggleSprite(group);
        sprite.position.set(
          mmToM(selectedPart.kind === "vertical" ? selectedPart.xMm + 72 : part.xMm + 72),
          mmToM(selectedPart.kind === "vertical" ? part.yMm + 72 : selectedPart.yMm + 72),
          mmToM(depthMm / 2 + 120)
        );
        group.dimensionsRoot.add(sprite);
      }
    }
  };

  const updatePartHighlights = (group: WardrobeGroup) => {
    for (const part of group.parts) {
      const selected = part.id === group.selectedPartId;
      for (const mesh of part.meshes) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissive.setHex(selected ? 0xffd34d : 0x000000);
        material.emissiveIntensity = selected ? 0.45 : 0;
      }
    }
    rebuildDimensions(group);
  };

  const rebuildParts = (group: WardrobeGroup) => {
    distributeAutoParts(group);
    const { widthMm, heightMm, depthMm } = group.params;

    for (const part of group.parts) {
      disposePartMeshes(group, part);
      const thicknessMm = getPartThicknessMm(group, part);
      if (part.kind === "vertical") {
        rebuildVerticalPartMeshes(group, part, thicknessMm);
      } else if (part.kind === "horizontal") {
        rebuildHorizontalPartMeshes(group, part, thicknessMm);
      } else {
        part.depthMm = thicknessMm;
        createPartMesh(
          group,
          part,
          { width: widthMm, height: heightMm, depth: thicknessMm },
          { x: 0, y: heightMm / 2, z: depthMm / 2 - thicknessMm / 2 }
        );
      }
    }

    rebuildOutline(group);
    updatePartHighlights(group);
  };

  const setSelectedPart = (group: WardrobeGroup, partId: string | null) => {
    group.selectedPartId = partId;
    updatePartHighlights(group);
    args.refreshProps();
  };

  const addPart = (kind: WardrobePartKind) => {
    const group = findActiveGroup();
    if (!group) return;
    if (kind === "back" && group.parts.some((part) => part.kind === "back")) return;
    const part: WardrobePart = {
      id: `${group.id}_${group.nextPartIndex++}`,
      kind,
      meshes: [],
      xMm: 0,
      yMm: group.params.heightMm / 2,
      depthMm: kind === "back" ? BACK_THICKNESS_MM : group.params.depthMm,
      materialId: null,
      thicknessMm: null,
      customPosition: false,
      customDepth: false
    };
    group.parts.push(part);
    rebuildParts(group);
    setSelectedPart(group, part.id);
    recordChange("Wardrobe board added");
  };

  const numberInput = (value: number, onCommit: (next: number, refresh: boolean) => void) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.value = String(Math.round(value));
    const commit = (refresh: boolean) => {
      const next = Math.round(Number(String(input.value).trim().replace(",", ".")));
      if (!Number.isFinite(next)) return;
      onCommit(next, refresh);
      if (refresh) input.value = String(Math.round(next));
    };
    input.addEventListener("input", () => commit(false));
    input.addEventListener("change", () => commit(true));
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commit(true);
    });
    return input;
  };

  const materialSelect = (family: BoardFamily, value: string, onChange: (materialId: string) => void) => {
    const select = document.createElement("select");
    const options = boardMaterialsForFamily(args.catalog, family);
    select.innerHTML = options.map((material) => `<option value="${material.id}">${material.displayName}</option>`).join("");
    select.value = options.some((material) => material.id === value) ? value : (options[0]?.id ?? "");
    select.addEventListener("change", () => onChange(select.value));
    return select;
  };

  const thicknessSelect = (materialId: string, family: BoardFamily, value: number, onChange: (thicknessMm: number) => void) => {
    const material = getBoardMaterial(args.catalog, materialId, family);
    if (allowsCustomThickness(material)) {
      return numberInput(value, (next) => onChange(Math.max(1, Math.round(next))));
    }

    const select = document.createElement("select");
    const options = thicknessOptionsForMaterial(material);
    const resolved = resolveThickness(args.catalog, materialId, family, value);
    select.innerHTML = options.map((thickness) => `<option value="${thickness}">${thickness} mm</option>`).join("");
    select.value = String(resolved);
    select.addEventListener("change", () => {
      const next = Number(select.value);
      if (Number.isFinite(next)) onChange(next);
    });
    return select;
  };

  const jointPrioritySelect = (value: WardrobeJointPriority, onChange: (priority: WardrobeJointPriority) => void) => {
    const select = document.createElement("select");
    select.innerHTML = [
      '<option value="horizontal">Horizontalne</option>',
      '<option value="vertical">Vertikalne</option>'
    ].join("");
    select.value = value;
    select.addEventListener("change", () => {
      if (select.value === "horizontal" || select.value === "vertical") onChange(select.value);
    });
    return select;
  };

  const mountSelectedPartProps = (group: WardrobeGroup, section: HTMLElement) => {
    const part = findPart(group, group.selectedPartId);
    if (!part) return;

    const label = document.createElement("div");
    label.className = "muted";
    label.style.padding = "6px";
    label.textContent =
      part.kind === "vertical" ? "Označená doska: vertikálna" : part.kind === "horizontal" ? "Označená doska: horizontálna" : "Označená doska: chrbát";
    section.appendChild(label);

    const family = getPartFamily(group, part);
    const materialId = getPartMaterialId(group, part);
    const thicknessMm = getPartThicknessMm(group, part);
    args.props.row(
      section,
      "Materiál dosky",
      materialSelect(family, materialId, (nextMaterialId) => {
        part.materialId = nextMaterialId;
        part.thicknessMm = resolveThickness(args.catalog, nextMaterialId, family, thicknessMm);
        rebuildParts(group);
        recordChange("Wardrobe board updated");
        args.refreshProps();
      })
    );
    args.props.row(
      section,
      "Hrúbka dosky",
      thicknessSelect(materialId, family, thicknessMm, (nextThickness) => {
        part.thicknessMm = nextThickness;
        rebuildParts(group);
        recordChange("Wardrobe board updated");
        args.refreshProps();
      })
    );

    if (part.kind === "vertical") {
      const partThicknessMm = getPartThicknessMm(group, part);
      const leftGap = part.xMm - partThicknessMm / 2 + group.params.widthMm / 2;
      const rightGap = group.params.widthMm / 2 - (part.xMm + partThicknessMm / 2);
      args.props.row(
        section,
        "Ľavá kóta (mm)",
        numberInput(leftGap, (next, refresh) => {
          part.xMm = -group.params.widthMm / 2 + Math.max(0, next) + getPartThicknessMm(group, part) / 2;
          part.customPosition = true;
          rebuildParts(group);
          if (refresh) recordChange("Wardrobe board moved");
          if (refresh) args.refreshProps();
        })
      );
      args.props.row(
        section,
        "Pravá kóta (mm)",
        numberInput(rightGap, (next, refresh) => {
          part.xMm = group.params.widthMm / 2 - Math.max(0, next) - getPartThicknessMm(group, part) / 2;
          part.customPosition = true;
          rebuildParts(group);
          if (refresh) recordChange("Wardrobe board moved");
          if (refresh) args.refreshProps();
        })
      );
    } else if (part.kind === "horizontal") {
      const partThicknessMm = getPartThicknessMm(group, part);
      const bottomGap = part.yMm - partThicknessMm / 2;
      const topGap = group.params.heightMm - (part.yMm + partThicknessMm / 2);
      args.props.row(
        section,
        "Spodná kóta (mm)",
        numberInput(bottomGap, (next, refresh) => {
          part.yMm = Math.max(0, next) + getPartThicknessMm(group, part) / 2;
          part.customPosition = true;
          rebuildParts(group);
          if (refresh) recordChange("Wardrobe board moved");
          if (refresh) args.refreshProps();
        })
      );
      args.props.row(
        section,
        "Horná kóta (mm)",
        numberInput(topGap, (next, refresh) => {
          part.yMm = group.params.heightMm - Math.max(0, next) - getPartThicknessMm(group, part) / 2;
          part.customPosition = true;
          rebuildParts(group);
          if (refresh) recordChange("Wardrobe board moved");
          if (refresh) args.refreshProps();
        })
      );
    }

    if (part.kind !== "back") {
      args.props.row(
        section,
        "Hĺbka dosky (mm)",
        numberInput(part.depthMm, (next, refresh) => {
          part.depthMm = clamp(Math.max(1, next), 1, group.params.depthMm);
          part.customDepth = true;
          rebuildParts(group);
          if (refresh) recordChange("Wardrobe board depth updated");
          if (refresh) args.refreshProps();
        })
      );
    }
  };

  const mountWardrobeProps = () => {
    const group = findActiveGroup();
    if (!group) return false;

    args.props.setTitle("Wardrobe");
    const section = args.props.section();

    const addParamRow = (label: string, key: "widthMm" | "heightMm" | "depthMm") => {
      args.props.row(
        section,
        label,
        numberInput(group.params[key], (next, refresh) => {
          group.params[key] = Math.max(1, next);
          rebuildParts(group);
          if (refresh) recordChange("Wardrobe size updated");
          if (refresh) args.refreshProps();
        })
      );
    };

    addParamRow("Výška (mm)", "heightMm");
    addParamRow("Šírka (mm)", "widthMm");
    addParamRow("Hĺbka (mm)", "depthMm");
    args.props.row(
      section,
      "Korpus materiál",
      materialSelect("body", group.params.corpusMaterialId, (materialId) => {
        group.params.corpusMaterialId = materialId;
        group.params.corpusThicknessMm = resolveThickness(args.catalog, materialId, "body", group.params.corpusThicknessMm);
        rebuildParts(group);
        recordChange("Wardrobe corpus updated");
        args.refreshProps();
      })
    );
    args.props.row(
      section,
      "Korpus hrúbka",
      thicknessSelect(group.params.corpusMaterialId, "body", group.params.corpusThicknessMm, (thicknessMm) => {
        group.params.corpusThicknessMm = thicknessMm;
        rebuildParts(group);
        recordChange("Wardrobe corpus updated");
        args.refreshProps();
      })
    );
    args.props.row(
      section,
      "Zadok materiál",
      materialSelect("back", group.params.backMaterialId, (materialId) => {
        group.params.backMaterialId = materialId;
        group.params.backThicknessMm = resolveThickness(args.catalog, materialId, "back", group.params.backThicknessMm);
        rebuildParts(group);
        recordChange("Wardrobe back updated");
        args.refreshProps();
      })
    );
    args.props.row(
      section,
      "Zadok hrúbka",
      thicknessSelect(group.params.backMaterialId, "back", group.params.backThicknessMm, (thicknessMm) => {
        group.params.backThicknessMm = thicknessMm;
        rebuildParts(group);
        recordChange("Wardrobe back updated");
        args.refreshProps();
      })
    );
    args.props.row(
      section,
      "Vnútorné dosky materiál",
      materialSelect("shelf", group.params.innerMaterialId, (materialId) => {
        group.params.innerMaterialId = materialId;
        group.params.innerThicknessMm = resolveThickness(args.catalog, materialId, "shelf", group.params.innerThicknessMm);
        rebuildParts(group);
        recordChange("Wardrobe inner boards updated");
        args.refreshProps();
      })
    );
    args.props.row(
      section,
      "Vnútorné dosky hrúbka",
      thicknessSelect(group.params.innerMaterialId, "shelf", group.params.innerThicknessMm, (thicknessMm) => {
        group.params.innerThicknessMm = thicknessMm;
        rebuildParts(group);
        recordChange("Wardrobe inner boards updated");
        args.refreshProps();
      })
    );
    args.props.row(
      section,
      "Prednost spojov",
      jointPrioritySelect(group.params.innerJointPriority, (priority) => {
        group.params.innerJointPriority = priority;
        rebuildParts(group);
        recordChange("Wardrobe joint priority updated");
        args.refreshProps();
      })
    );
    mountSelectedPartProps(group, section);

    const summary = document.createElement("div");
    summary.className = "muted";
    summary.style.padding = "6px";
    summary.textContent = `Dosky: ${group.parts.length}`;
    section.appendChild(summary);
    return true;
  };

  const buildWardrobeTopbar = () => {
    args.tb.clear();
    args.buildClassicTopbar();

    const row = args.tb.addRow({ title: "Wardrobe settings", className: "topbar-wardrobe-ribbon" });
    const boards = args.tb.addGroup("Dosky", { row });
    args.tb.toolButton(boards, {
      title: "Vertical board",
      iconSvg: args.icons.board,
      label: "Vertical",
      onClick: () => addPart("vertical")
    });
    args.tb.toolButton(boards, {
      title: "Horizontal board",
      iconSvg: args.icons.board,
      label: "Horizontal",
      onClick: () => addPart("horizontal")
    });
    args.tb.toolButton(boards, {
      title: "Back panel",
      iconSvg: args.icons.back,
      label: "Chrbát",
      onClick: () => addPart("back")
    });

    args.tb.addSpacer({ row });
    const groupTools = args.tb.addGroup("Skupina", { row });
    args.tb.toolButton(groupTools, {
      title: "Finish wardrobe",
      iconSvg: args.icons.done,
      label: "Dokončiť",
      variant: "success",
      onClick: () => exitFinish()
    });
    args.tb.toolButton(groupTools, {
      title: "Discard wardrobe",
      iconSvg: args.icons.cancel,
      label: "Zrušiť",
      variant: "danger",
      onClick: () => exitDiscard()
    });
  };

  const parseJointEdit = (value: unknown): WardrobeJointEdit | null => {
    if (!value || typeof value !== "object") return null;
    const edit = value as Partial<WardrobeJointEdit>;
    return edit.kind === "jointPriorityToggle" ? { kind: "jointPriorityToggle" } : null;
  };

  const toggleInnerJointPriority = (group: WardrobeGroup) => {
    group.params.innerJointPriority = group.params.innerJointPriority === "horizontal" ? "vertical" : "horizontal";
    rebuildParts(group);
    recordChange("Wardrobe joint priority updated");
    args.refreshProps();
  };

  const getDimensionValue = (group: WardrobeGroup, edit: WardrobeDimensionEdit) => {
    if (edit.kind === "verticalGap") {
      const a = findPart(group, edit.aPartId);
      const b = findPart(group, edit.bPartId);
      return a && b ? Math.max(0, Math.round(b.xMm - getPartThicknessMm(group, b) / 2 - (a.xMm + getPartThicknessMm(group, a) / 2))) : null;
    }
    if (edit.kind === "horizontalGap") {
      const a = findPart(group, edit.aPartId);
      const b = findPart(group, edit.bPartId);
      return a && b ? Math.max(0, Math.round(b.yMm - getPartThicknessMm(group, b) / 2 - (a.yMm + getPartThicknessMm(group, a) / 2))) : null;
    }
    const part = findPart(group, edit.partId);
    return part ? Math.round(part.depthMm) : null;
  };

  const applyDimensionValue = (group: WardrobeGroup, edit: WardrobeDimensionEdit, next: number) => {
    const selected = findPart(group, group.selectedPartId);
    if (edit.kind === "verticalGap") {
      const a = findPart(group, edit.aPartId);
      const b = findPart(group, edit.bPartId);
      if (!a || !b) return;
      const moving = selected === a ? a : selected === b ? b : b;
      if (moving === a) a.xMm = b.xMm - getPartThicknessMm(group, b) / 2 - getPartThicknessMm(group, a) / 2 - next;
      else b.xMm = a.xMm + getPartThicknessMm(group, a) / 2 + getPartThicknessMm(group, b) / 2 + next;
      moving.customPosition = true;
      group.selectedPartId = moving.id;
    } else if (edit.kind === "horizontalGap") {
      const a = findPart(group, edit.aPartId);
      const b = findPart(group, edit.bPartId);
      if (!a || !b) return;
      const moving = selected === a ? a : selected === b ? b : b;
      if (moving === a) a.yMm = b.yMm - getPartThicknessMm(group, b) / 2 - getPartThicknessMm(group, a) / 2 - next;
      else b.yMm = a.yMm + getPartThicknessMm(group, a) / 2 + getPartThicknessMm(group, b) / 2 + next;
      moving.customPosition = true;
      group.selectedPartId = moving.id;
    } else {
      const part = findPart(group, edit.partId);
      if (!part || part.kind === "back") return;
      part.depthMm = clamp(Math.max(1, next), 1, group.params.depthMm);
      part.customDepth = true;
      group.selectedPartId = part.id;
    }

    rebuildParts(group);
    recordChange("Wardrobe dimension updated");
    args.refreshProps();
  };

  const openDimensionInput = (group: WardrobeGroup, edit: WardrobeDimensionEdit, clientX: number, clientY: number) => {
    const current = getDimensionValue(group, edit);
    if (current === null) return;

    args.viewerEl.querySelector(".wardrobe-dimension-edit")?.remove();
    const rect = args.viewerEl.getBoundingClientRect();
    const input = document.createElement("input");
    input.className = "wardrobe-dimension-edit";
    input.type = "number";
    input.step = "1";
    input.value = String(current);
    input.style.position = "absolute";
    input.style.left = `${clientX - rect.left - 42}px`;
    input.style.top = `${clientY - rect.top - 16}px`;
    input.style.width = "84px";
    input.style.height = "28px";
    input.style.zIndex = "50";
    input.style.padding = "2px 6px";
    input.style.border = "2px solid #c98d00";
    input.style.background = "#fff8d7";
    input.style.color = "#2c2100";
    input.style.font = "600 13px Arial";
    input.style.textAlign = "center";
    input.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const next = Math.max(0, Math.round(Number(input.value.trim().replace(",", "."))));
      input.remove();
      if (!Number.isFinite(next)) return;
      applyDimensionValue(group, edit, next);
    };
    const cancel = () => {
      committed = true;
      input.remove();
    };
    input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commit();
      if (ev.key === "Escape") cancel();
    });
    input.addEventListener("blur", commit);

    args.viewerEl.appendChild(input);
    input.focus();
    input.select();
  };

  const handleViewerPointerDown = (ev: PointerEvent) => {
    const target = ev.target as HTMLElement | null;
    if (target && target.closest("button,input,select,textarea")) return;

    const rect = args.viewerEl.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, args.getCamera());
    let group = findActiveGroup();
    if (!group) {
      const hit = raycaster.intersectObjects(groups.flatMap((item) => item.parts.flatMap((part) => part.meshes)), false)[0];
      const groupId = typeof hit?.object.userData.wardrobeGroupId === "string" ? hit.object.userData.wardrobeGroupId : null;
      group = groups.find((item) => item.id === groupId) ?? null;
      if (!group) return;
      activeGroupId = group.id;
      buildWardrobeTopbar();
    }

    const jointHit = raycaster
      .intersectObjects(group.dimensionsRoot.children, true)
      .find((hit) => parseJointEdit(hit.object.userData.wardrobeJointEdit));
    if (parseJointEdit(jointHit?.object.userData.wardrobeJointEdit)) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleInnerJointPriority(group);
      return;
    }

    const dimensionHit = raycaster
      .intersectObjects(group.dimensionsRoot.children, true)
      .find((hit) => parseWardrobeDimensionEdit(hit.object.userData.wardrobeDimensionEdit));
    const dimensionEdit = parseWardrobeDimensionEdit(dimensionHit?.object.userData.wardrobeDimensionEdit);
    if (dimensionEdit) {
      ev.preventDefault();
      ev.stopPropagation();
      openDimensionInput(group, dimensionEdit, ev.clientX, ev.clientY);
      return;
    }

    const hit = raycaster.intersectObjects(group.parts.flatMap((part) => part.meshes), false)[0];
    const hitPartId = typeof hit?.object.userData.wardrobePartId === "string" ? hit.object.userData.wardrobePartId : null;
    if (hitPartId) {
      setSelectedPart(group, hitPartId);
      return;
    }
    setSelectedPart(group, null);
  };

  args.viewerEl.addEventListener("pointerdown", handleViewerPointerDown);

  const enterNew = () => {
    args.ensureLayoutMode();
    args.cancelPlacementIfActive();
    args.setToolSelect();

    const dimensionsRoot = new THREE.Group();
    dimensionsRoot.name = "wardrobe-dimensions";
    const group: WardrobeGroup = {
      id: `wg_${Date.now()}`,
      name: "Wardrobe",
      root: new THREE.Group(),
      dimensionsRoot,
      params: {
        widthMm: 1200,
        heightMm: 2400,
        depthMm: 600,
        corpusMaterialId: DEFAULT_CORPUS_MATERIAL_ID,
        corpusThicknessMm: resolveThickness(args.catalog, DEFAULT_CORPUS_MATERIAL_ID, "body", BOARD_THICKNESS_MM),
        backMaterialId: DEFAULT_BACK_MATERIAL_ID,
        backThicknessMm: resolveThickness(args.catalog, DEFAULT_BACK_MATERIAL_ID, "back", BACK_THICKNESS_MM),
        innerMaterialId: DEFAULT_INNER_MATERIAL_ID,
        innerThicknessMm: resolveThickness(args.catalog, DEFAULT_INNER_MATERIAL_ID, "shelf", BOARD_THICKNESS_MM),
        innerJointPriority: "horizontal"
      },
      parts: [],
      nextPartIndex: 1,
      selectedPartId: null
    };
    group.root.name = group.name;
    group.root.add(dimensionsRoot);
    args.layoutRoot.add(group.root);
    groups.push(group);
    activeGroupId = group.id;

    addPart("vertical");
    addPart("vertical");
    addPart("horizontal");
    addPart("horizontal");
    addPart("back");
    buildWardrobeTopbar();
    const firstVertical = group.parts.find((part) => part.kind === "vertical") ?? null;
    if (firstVertical) setSelectedPart(group, firstVertical.id);
    mountWardrobeProps();
    recordChange("Wardrobe added");
  };

  const exitCommon = () => {
    const group = findActiveGroup();
    if (group) {
      group.selectedPartId = null;
      updatePartHighlights(group);
    }
    activeGroupId = null;
    args.restoreStandardTopbar();
    args.refreshProps();
  };

  const exitFinish = () => {
    if (!activeGroupId) return;
    exitCommon();
  };

  const exitDiscard = () => {
    const group = findActiveGroup();
    if (group) {
      args.layoutRoot.remove(group.root);
      disposeDimensions(group);
      args.disposeObject3D(group.root);
      const index = groups.indexOf(group);
      if (index >= 0) groups.splice(index, 1);
    }
    exitCommon();
  };

  const deleteSelected = () => {
    const group = findActiveGroup();
    if (!group) return false;

    const selectedPart = findPart(group, group.selectedPartId);
    if (selectedPart) {
      disposePartMeshes(group, selectedPart);
      const index = group.parts.indexOf(selectedPart);
      if (index >= 0) group.parts.splice(index, 1);
      group.selectedPartId = null;
      rebuildParts(group);
      recordChange("Wardrobe board deleted");
      args.refreshProps();
      return true;
    }

    args.layoutRoot.remove(group.root);
    disposeDimensions(group);
    args.disposeObject3D(group.root);
    const index = groups.indexOf(group);
    if (index >= 0) groups.splice(index, 1);
    activeGroupId = null;
    args.restoreStandardTopbar();
    recordChange("Wardrobe deleted");
    args.refreshProps();
    return true;
  };

  const clearGroups = () => {
    for (const group of groups.splice(0, groups.length)) {
      args.layoutRoot.remove(group.root);
      disposeDimensions(group);
      args.disposeObject3D(group.root);
    }
    activeGroupId = null;
  };

  const getSaveState = (): WardrobeEditSaveState => ({
    activeGroupId,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      params: structuredClone(group.params),
      parts: group.parts.map(({ meshes: _meshes, ...part }) => structuredClone(part)),
      nextPartIndex: group.nextPartIndex,
      selectedPartId: group.selectedPartId
    }))
  });

  const restoreSaveState = (state: unknown) => {
    clearGroups();
    const saved = state as Partial<WardrobeEditSaveState> | null | undefined;
    if (Array.isArray(saved?.groups)) {
      for (const savedGroup of saved.groups) {
        if (!savedGroup || typeof savedGroup.id !== "string" || !savedGroup.params) continue;
        const dimensionsRoot = new THREE.Group();
        dimensionsRoot.name = "wardrobe-dimensions";
        const group: WardrobeGroup = {
          id: savedGroup.id,
          name: typeof savedGroup.name === "string" && savedGroup.name.trim() ? savedGroup.name : "Wardrobe",
          root: new THREE.Group(),
          dimensionsRoot,
          params: structuredClone(savedGroup.params),
          parts: Array.isArray(savedGroup.parts)
            ? savedGroup.parts.map((part) => ({ ...structuredClone(part), meshes: [] }))
            : [],
          nextPartIndex: Number.isFinite(savedGroup.nextPartIndex) ? Number(savedGroup.nextPartIndex) : 1,
          selectedPartId: typeof savedGroup.selectedPartId === "string" ? savedGroup.selectedPartId : null
        };
        group.root.name = group.name;
        group.root.add(dimensionsRoot);
        args.layoutRoot.add(group.root);
        groups.push(group);
        rebuildParts(group);
      }
    }
    activeGroupId = typeof saved?.activeGroupId === "string" && groups.some((group) => group.id === saved.activeGroupId)
      ? saved.activeGroupId
      : null;
    if (activeGroupId) buildWardrobeTopbar();
    else args.restoreStandardTopbar();
    args.refreshProps();
  };

  return {
    enterNew,
    deleteSelected,
    getSaveState,
    restoreSaveState,
    getVisibilityTargets() {
      return groups.flatMap((group) =>
        group.parts.map((part) => ({
          key: `wardrobe:${group.id}:${part.id}`,
          root: part.meshes
        }))
      );
    },
    getSelectedVisibilityTargetKeys() {
      const group = findActiveGroup();
      return group?.selectedPartId ? [`wardrobe:${group.id}:${group.selectedPartId}`] : [];
    },
    tryMountActiveWardrobeProps() {
      return Boolean(activeGroupId) && mountWardrobeProps();
    }
  };
}
