import * as THREE from "three";
import type { Group } from "three";
import type { FlapShelvesLowParams } from "./types";

const MM_TO_M = 0.001;

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMaterials(params: FlapShelvesLowParams) {
  const record = params as Record<string, unknown>;
  const materials = record.materials && typeof record.materials === "object" ? record.materials as Record<string, unknown> : {};
  return {
    body: getString(record.bodyColor, getString(materials.bodyColor, "#b8bcc7")),
    front: getString(record.frontColor, getString(materials.frontColor, "#d7d9dd")),
    back: getString(record.backColor, getString(materials.backColor, "#c8ccd1")),
    hardware: "#434955"
  };
}

function makeMaterial(color: string, hardware = false) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: hardware ? 0.45 : 0.72,
    metalness: hardware ? 0.3 : 0.04
  });
}

function addBox(
  group: THREE.Group,
  name: string,
  sizeMm: { x: number; y: number; z: number },
  centerMm: { x: number; y: number; z: number },
  material: THREE.Material,
  dimensionsMm: { width: number; height: number; depth: number }
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(1, sizeMm.x) * MM_TO_M,
      Math.max(1, sizeMm.y) * MM_TO_M,
      Math.max(1, sizeMm.z) * MM_TO_M
    ),
    material
  );
  mesh.name = name;
  mesh.position.set(centerMm.x * MM_TO_M, centerMm.y * MM_TO_M, centerMm.z * MM_TO_M);
  mesh.userData.selectable = true;
  mesh.userData.dimensionsMm = dimensionsMm;
  group.add(mesh);
  return mesh;
}

function getShelfCenters(params: FlapShelvesLowParams, heightMm: number, boardThicknessMm: number, shelfThicknessMm: number) {
  const shelfCount = Math.max(1, Math.round(getNumber(params.shelfCount, 3)));
  const shelfBoardCount = Math.max(0, shelfCount);
  const bottomY = boardThicknessMm + shelfThicknessMm / 2;
  const topY = Math.max(bottomY, heightMm - boardThicknessMm - shelfThicknessMm / 2);
  const manualGaps = params.shelfAutoFit !== true && Array.isArray(params.shelfGaps)
    ? params.shelfGaps.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry) && entry >= 0)
    : [];

  return Array.from({ length: shelfBoardCount }, (_, index) => {
    const autoY = bottomY + ((topY - bottomY) * (index + 1)) / (shelfBoardCount + 1);
    const manualY = manualGaps[index] != null ? boardThicknessMm + manualGaps[index]! : autoY;
    return clamp(manualY, bottomY, topY);
  });
}

export function buildFlapShelvesLow(params: FlapShelvesLowParams): Group {
  const group = new THREE.Group();
  group.name = "flap_shelves_lowParametricModule";

  const widthMm = Math.max(300, getNumber(params.width, 900));
  const heightMm = Math.max(200, getNumber(params.height, 720));
  const depthMm = Math.max(200, getNumber(params.depth, 320));
  const boardThicknessMm = clamp(getNumber(params.boardThickness, 18), 1, Math.max(1, widthMm / 3));
  const backThicknessMm = clamp(getNumber(params.backThickness, 6), 1, Math.max(1, depthMm / 4));
  const frontThicknessMm = clamp(getNumber(params.frontThicknessMm, 18), 1, 80);
  const shelfThicknessMm = clamp(getNumber(params.shelfThickness, boardThicknessMm), 1, 80);
  const frontGapMm = Math.max(0, getNumber(params.frontGap, 2));
  const sideGapMm = Math.max(0, getNumber(params.sideGap, 2));
  const topGapMm = Math.max(0, getNumber(params.topGap, 2));
  const bottomGapMm = Math.max(0, getNumber(params.bottomGap, 2));
  const doorSystem = params.doorSystem === "double_hinged" ? "double_hinged" : "flap_up";
  const doorOpen = params.doorOpen === true || params.flapOpen === true;
  const materials = getMaterials(params);

  const bodyMaterial = makeMaterial(materials.body);
  const frontMaterial = makeMaterial(materials.front);
  const backMaterial = makeMaterial(materials.back);
  const hardwareMaterial = makeMaterial(materials.hardware, true);
  const innerWidthMm = Math.max(1, widthMm - boardThicknessMm * 2);
  const innerDepthMm = Math.max(1, depthMm - backThicknessMm);

  addBox(group, "left-side", { x: boardThicknessMm, y: heightMm, z: depthMm }, { x: -widthMm / 2 + boardThicknessMm / 2, y: heightMm / 2, z: 0 }, bodyMaterial, { width: depthMm, height: heightMm, depth: boardThicknessMm });
  addBox(group, "right-side", { x: boardThicknessMm, y: heightMm, z: depthMm }, { x: widthMm / 2 - boardThicknessMm / 2, y: heightMm / 2, z: 0 }, bodyMaterial, { width: depthMm, height: heightMm, depth: boardThicknessMm });
  addBox(group, "bottom-panel", { x: innerWidthMm, y: boardThicknessMm, z: depthMm }, { x: 0, y: boardThicknessMm / 2, z: 0 }, bodyMaterial, { width: innerWidthMm, height: depthMm, depth: boardThicknessMm });
  addBox(group, "top-panel", { x: innerWidthMm, y: boardThicknessMm, z: depthMm }, { x: 0, y: heightMm - boardThicknessMm / 2, z: 0 }, bodyMaterial, { width: innerWidthMm, height: depthMm, depth: boardThicknessMm });
  addBox(group, "back-panel", { x: innerWidthMm, y: Math.max(1, heightMm - boardThicknessMm * 2), z: backThicknessMm }, { x: 0, y: heightMm / 2, z: -depthMm / 2 + backThicknessMm / 2 }, backMaterial, { width: innerWidthMm, height: Math.max(1, heightMm - boardThicknessMm * 2), depth: backThicknessMm });

  getShelfCenters(params, heightMm, boardThicknessMm, shelfThicknessMm).forEach((centerY, index) => {
    addBox(group, `shelf-${index + 1}`, { x: innerWidthMm, y: shelfThicknessMm, z: innerDepthMm }, { x: 0, y: centerY, z: backThicknessMm / 2 }, bodyMaterial, { width: innerWidthMm, height: innerDepthMm, depth: shelfThicknessMm });
  });

  const handleLengthMm = clamp(getNumber(params.handleLengthMm, 160), 40, Math.max(40, widthMm - 80));
  const handleSizeMm = clamp(getNumber(params.handleSizeMm, 12), 4, 40);
  const handleProjectionMm = clamp(getNumber(params.handleProjectionMm, 14), 4, 60);
  const handleType = getString(params.handleType, "bar");
  const frontWidthMm = Math.max(1, widthMm - sideGapMm * 2);
  const frontHeightMm = Math.max(1, heightMm - topGapMm - bottomGapMm);
  const frontTopY = bottomGapMm + frontHeightMm;
  const frontPlaneZ = depthMm / 2 + frontGapMm + frontThicknessMm / 2;
  const handleOffsetFromBottomMm = clamp(getNumber(params.handlePositionMm, doorSystem === "double_hinged" ? 100 : 60), 0, frontHeightMm);
  const handleYFromTopMm = -frontHeightMm + handleOffsetFromBottomMm;
  const verticalHandleLengthMm = Math.min(handleLengthMm, Math.max(40, frontHeightMm * 0.72));
  const verticalHandleClearanceMm = 24;
  const verticalHandleYFromTopMm = clamp(
    handleYFromTopMm,
    -frontHeightMm + verticalHandleLengthMm / 2 + verticalHandleClearanceMm,
    -verticalHandleLengthMm / 2 - verticalHandleClearanceMm
  );
  const handleOffsetFromSplitMm = Math.max(0, getNumber(params.doorHandleOffsetFromSplitMm, getNumber(params.handleHorizontalPositionMm, 0)));
  const addHandle = (parent: THREE.Group, name: string, opts: { x: number; y: number; vertical?: boolean; maxLengthMm: number }) => {
    if (handleType === "none") return;
    const length = Math.min(handleLengthMm, Math.max(40, opts.maxLengthMm * 0.72));
    const size = handleType === "knob" ? Math.max(handleSizeMm, 24) : handleSizeMm;
    const handleSize = opts.vertical
      ? { x: size, y: length, z: handleProjectionMm }
      : { x: length, y: size, z: handleProjectionMm };
    addBox(
      parent,
      name,
      handleSize,
      { x: opts.x, y: opts.y, z: frontThicknessMm / 2 + handleProjectionMm / 2 + 1 },
      hardwareMaterial,
      { width: handleSize.x, height: handleSize.y, depth: handleSize.z }
    );
  };

  if (doorSystem === "double_hinged") {
    const centerGapMm = Math.max(2, Math.min(sideGapMm, frontWidthMm * 0.05));
    const leafWidthMm = Math.max(1, (frontWidthMm - centerGapMm) / 2);
    const openAngle = doorOpen ? Math.PI / 2 : 0;
    const addDoorLeaf = (name: string, side: -1 | 1) => {
      const pivot = new THREE.Group();
      pivot.name = `${name}-pivot`;
      pivot.position.set((side * frontWidthMm * MM_TO_M) / 2, frontTopY * MM_TO_M, frontPlaneZ * MM_TO_M);
      pivot.rotation.y = side < 0 ? -openAngle : openAngle;
      addBox(
        pivot,
        name,
        { x: leafWidthMm, y: frontHeightMm, z: frontThicknessMm },
        { x: (-side * leafWidthMm) / 2, y: -frontHeightMm / 2, z: 0 },
        frontMaterial,
        { width: leafWidthMm, height: frontHeightMm, depth: frontThicknessMm }
      );
      const handleInsetMm = clamp(handleSizeMm / 2 + 12 + handleOffsetFromSplitMm, handleSizeMm / 2, Math.max(handleSizeMm / 2, leafWidthMm - handleSizeMm / 2));
      addHandle(pivot, `${name}-handle`, {
        x: side < 0 ? leafWidthMm - handleInsetMm : -leafWidthMm + handleInsetMm,
        y: verticalHandleYFromTopMm,
        vertical: true,
        maxLengthMm: frontHeightMm
      });
      const hingeX = side < 0 ? 10 : -10;
      for (const hingeY of [-frontHeightMm + 70, -70]) {
        addBox(
          pivot,
          `${name}-hinge-${hingeY}`,
          { x: 18, y: 34, z: 12 },
          { x: hingeX, y: clamp(hingeY, -frontHeightMm + 40, -40), z: -frontThicknessMm / 2 - 8 },
          hardwareMaterial,
          { width: 18, height: 34, depth: 12 }
        );
      }
      group.add(pivot);
    };
    addDoorLeaf("door-left", -1);
    addDoorLeaf("door-right", 1);
  } else {
    const pivot = new THREE.Group();
    pivot.name = "flap-pivot";
    pivot.position.set(0, frontTopY * MM_TO_M, frontPlaneZ * MM_TO_M);
    pivot.rotation.x = doorOpen ? -Math.PI / 2 : 0;
    addBox(
      pivot,
      "door-front",
      { x: frontWidthMm, y: frontHeightMm, z: frontThicknessMm },
      { x: 0, y: -frontHeightMm / 2, z: 0 },
      frontMaterial,
      { width: frontWidthMm, height: frontHeightMm, depth: frontThicknessMm }
    );
    const handleX = clamp(getNumber(params.handleHorizontalPositionMm, 0), -frontWidthMm / 2 + handleLengthMm / 2, frontWidthMm / 2 - handleLengthMm / 2);
    addHandle(pivot, "handle", {
      x: handleX,
      y: clamp(handleYFromTopMm, -frontHeightMm + handleSizeMm / 2, -handleSizeMm / 2),
      maxLengthMm: frontWidthMm
    });
    addBox(
      pivot,
      "lift-hardware-left",
      { x: 28, y: 10, z: 18 },
      { x: -frontWidthMm / 2 + 60, y: -8, z: -frontThicknessMm / 2 - 10 },
      hardwareMaterial,
      { width: 28, height: 10, depth: 18 }
    );
    addBox(
      pivot,
      "lift-hardware-right",
      { x: 28, y: 10, z: 18 },
      { x: frontWidthMm / 2 - 60, y: -8, z: -frontThicknessMm / 2 - 10 },
      hardwareMaterial,
      { width: 28, height: 10, depth: 18 }
    );
    group.add(pivot);
  }

  return group;
}
