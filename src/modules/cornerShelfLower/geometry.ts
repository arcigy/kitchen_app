import * as THREE from "three";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import liveStateSnapshot from "./package/integration/current-live-state.json";
import materialsSnapshot from "./package/definitions/corner_shelf_lower.materials.snapshot.json";
import { buildPortableLiveModuleGroup } from "../runtime/portableGeometry";
import type { CornerShelfLowerParams } from "./types";

const kitchenCornerAnchorName = "__kitchen_corner_anchor";
const kitchenCornerXAnchorName = "__kitchen_corner_x_anchor";
const kitchenCornerZAnchorName = "__kitchen_corner_z_anchor";
const baseLiveRuntime = liveStateSnapshot.liveRuntime;
const baseLiveParts = Array.isArray(baseLiveRuntime?.parts) ? baseLiveRuntime.parts : [];
const baseLivePartByName = new Map(baseLiveParts.map((part) => [part.name, part]));
const baseLengthXMm = typeof baseLiveRuntime?.params?.lengthX === "number" ? baseLiveRuntime.params.lengthX : 1000;
const baseLengthZMm = typeof baseLiveRuntime?.params?.lengthZ === "number" ? baseLiveRuntime.params.lengthZ : 1000;
const baseDepthMm = typeof baseLiveRuntime?.params?.depth === "number" ? baseLiveRuntime.params.depth : 560;
const baseFrontThicknessMm =
  typeof baseLiveRuntime?.params?.frontThicknessMm === "number" ? baseLiveRuntime.params.frontThicknessMm : 19;
const baseBackThicknessMm =
  typeof baseLiveRuntime?.params?.backThickness === "number" ? baseLiveRuntime.params.backThickness : 6;
const baseBoardThicknessMm =
  typeof baseLiveRuntime?.params?.boardThickness === "number" ? baseLiveRuntime.params.boardThickness : 18;
const baseHeightMm = typeof baseLiveRuntime?.params?.height === "number" ? baseLiveRuntime.params.height : 720;
const baseWorktopThicknessMm =
  typeof baseLiveRuntime?.params?.worktopThicknessMm === "number" ? baseLiveRuntime.params.worktopThicknessMm : 38;
const basePlinthHeightMm =
  typeof baseLiveRuntime?.params?.plinthHeight === "number" ? baseLiveRuntime.params.plinthHeight : 100;
const basePlinthSetbackMm =
  typeof baseLiveRuntime?.params?.plinthSetbackMm === "number" ? baseLiveRuntime.params.plinthSetbackMm : 60;
const cornerFrontRevealMm = 0.2;

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function shiftMeshAxis(mesh: THREE.Object3D, axis: "x" | "z", deltaMm: number) {
  if (Math.abs(deltaMm) < 1e-6) return;
  mesh.position[axis] += deltaMm / 1000;
}

function resizeMeshAxis(mesh: THREE.Mesh, axis: "x" | "z", nextSizeMm: number) {
  const dims = mesh.userData?.dimensionsMm as { width?: number; height?: number; depth?: number } | undefined;
  if (!dims) return;
  const dimKey = axis === "x" ? "width" : "depth";
  const currentSizeMm = dims[dimKey];
  if (typeof currentSizeMm !== "number" || !Number.isFinite(currentSizeMm) || currentSizeMm <= 0) return;
  if (Math.abs(nextSizeMm - currentSizeMm) < 1e-6) return;
  mesh.scale[axis] *= nextSizeMm / currentSizeMm;
  dims[dimKey] = nextSizeMm;
}

function getMeshDimensionsMm(obj: THREE.Object3D | null | undefined) {
  if (!obj) return null;
  const dims = obj.userData?.dimensionsMm as { width?: number; height?: number; depth?: number } | undefined;
  if (!dims) return null;
  return dims;
}

function resizeMeshHeight(mesh: THREE.Mesh, nextHeightMm: number) {
  const dims = getMeshDimensionsMm(mesh);
  if (!dims) return;
  const currentHeightMm = dims?.height;
  if (typeof currentHeightMm !== "number" || !Number.isFinite(currentHeightMm) || currentHeightMm <= 0) return;
  if (Math.abs(nextHeightMm - currentHeightMm) < 1e-6) return;
  mesh.scale.y *= nextHeightMm / currentHeightMm;
  dims.height = nextHeightMm;
}

function setObjectCenterY(obj: THREE.Object3D | null | undefined, centerYMm: number) {
  if (!obj) return;
  obj.position.y = centerYMm / 1000;
}

function getBasePart(name: string) {
  return baseLivePartByName.get(name) ?? null;
}

const baseSideGapMm = typeof baseLiveRuntime?.params?.sideGap === "number" ? baseLiveRuntime.params.sideGap : 2;
const baseHandleOffsetAlongDoorXMm =
  ((getBasePart("doorHandle_front_z")?.centerMm?.x ?? 0) - (getBasePart("door_front_z")?.centerMm?.x ?? 0)) || 40;
const baseHandleOffsetAlongDoorZMm =
  ((getBasePart("doorHandle_front_x")?.centerMm?.z ?? 0) - (getBasePart("door_front_x")?.centerMm?.z ?? 0)) || 40;
const baseHingeInsetXMm =
  ((getBasePart("door_front_z")?.sizeMm?.x ?? 418) * 0.5) -
    ((getBasePart("hinge_front_z_1_door_plate")?.centerMm?.x ?? 0) - (getBasePart("door_front_z")?.centerMm?.x ?? 0)) || 37;
const baseHingeInsetZMm =
  ((getBasePart("door_front_x")?.sizeMm?.z ?? 418) * 0.5) -
    ((getBasePart("hinge_front_x_1_door_plate")?.centerMm?.z ?? 0) - (getBasePart("door_front_x")?.centerMm?.z ?? 0)) || 37;

function getShelfGapValues(params: CornerShelfLowerParams) {
  const raw = Array.isArray(params.shelfGaps)
    ? params.shelfGaps.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    : [];
  if (raw.length > 0) return raw;
  const fallbackRaw = Array.isArray(baseLiveRuntime?.params?.shelfGaps)
    ? baseLiveRuntime.params.shelfGaps.filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
      )
    : [];
  return fallbackRaw.length > 0 ? fallbackRaw : [123, 123, 123, 123];
}

function getObjectCenterMm(obj: THREE.Object3D | null | undefined) {
  if (!obj) return null;
  return {
    x: obj.position.x * 1000,
    y: obj.position.y * 1000,
    z: obj.position.z * 1000
  };
}

function setObjectCenterX(obj: THREE.Object3D | null | undefined, centerXMm: number) {
  if (!obj) return;
  obj.position.x = centerXMm / 1000;
}

function setObjectCenterZ(obj: THREE.Object3D | null | undefined, centerZMm: number) {
  if (!obj) return;
  obj.position.z = centerZMm / 1000;
}

function getUniqueIndices(group: THREE.Group, pattern: RegExp) {
  return [...new Set(
    group.children
      .map((child) => child.name.match(pattern)?.[1])
      .filter((value): value is string => typeof value === "string")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0)
  )].sort((left, right) => left - right);
}

function cloneNamedMesh(group: THREE.Group, templateName: string, nextName: string) {
  const template = group.getObjectByName(templateName);
  if (!(template instanceof THREE.Mesh)) return null;
  const clone = template.clone();
  clone.name = nextName;
  clone.material = Array.isArray(template.material)
    ? template.material.map((material) => material.clone())
    : template.material.clone();
  clone.userData = structuredClone(template.userData ?? {});
  group.add(clone);
  return clone;
}

function syncCornerShelfMeshes(group: THREE.Group, params: CornerShelfLowerParams) {
  const desiredShelfPairCount = Math.max(0, Math.round(getNumber(params.shelfCount, 4)) - 1);
  const existing = getUniqueIndices(group, /^shelf_(\d+)_(x|z)$/i);
  const templateXName = existing[0] ? `shelf_${existing[0]}_x` : "shelf_1_x";
  const templateZName = existing[0] ? `shelf_${existing[0]}_z` : "shelf_1_z";

  for (let index = 1; index <= desiredShelfPairCount; index += 1) {
    if (!group.getObjectByName(`shelf_${index}_x`)) cloneNamedMesh(group, templateXName, `shelf_${index}_x`);
    if (!group.getObjectByName(`shelf_${index}_z`)) cloneNamedMesh(group, templateZName, `shelf_${index}_z`);
  }

  for (const index of existing) {
    if (index <= desiredShelfPairCount) continue;
    for (const axis of ["x", "z"] as const) {
      const obj = group.getObjectByName(`shelf_${index}_${axis}`);
      if (!obj) continue;
      group.remove(obj);
    }
  }
}

function syncCornerHingeMeshes(group: THREE.Group, params: CornerShelfLowerParams) {
  const desiredCount = Math.max(1, Math.round(getNumber(params.hingeCountPerDoor, 2)));
  const suffixes = ["door_plate", "door_cup", "arm"] as const;

  for (const axis of ["x", "z"] as const) {
    const existing = getUniqueIndices(group, new RegExp(`^hinge_front_${axis}_(\\d+)_(door_plate|door_cup|arm)$`, "i"));
    const templateIndex = existing[0] ?? 1;

    for (let index = 1; index <= desiredCount; index += 1) {
      for (const suffix of suffixes) {
        const name = `hinge_front_${axis}_${index}_${suffix}`;
        if (group.getObjectByName(name)) continue;
        cloneNamedMesh(group, `hinge_front_${axis}_${templateIndex}_${suffix}`, name);
      }
    }

    for (const index of existing) {
      if (index <= desiredCount) continue;
      for (const suffix of suffixes) {
        const obj = group.getObjectByName(`hinge_front_${axis}_${index}_${suffix}`);
        if (!obj) continue;
        group.remove(obj);
      }
    }
  }
}

function getDoorAttachmentOffsetMm(partName: string, doorName: string) {
  const part = getBasePart(partName);
  const door = getBasePart(doorName);
  const partCenterY = part?.centerMm?.y;
  const doorCenterY = door?.centerMm?.y;
  const doorHeightMm = door?.sizeMm?.y;
  if (
    typeof partCenterY !== "number" ||
    !Number.isFinite(partCenterY) ||
    typeof doorCenterY !== "number" ||
    !Number.isFinite(doorCenterY) ||
    typeof doorHeightMm !== "number" ||
    !Number.isFinite(doorHeightMm)
  ) {
    return null;
  }

  const doorTopMm = doorCenterY + doorHeightMm * 0.5;
  const doorBottomMm = doorCenterY - doorHeightMm * 0.5;
  if (partCenterY >= doorCenterY) {
    return {
      anchor: "top" as const,
      offsetMm: doorTopMm - partCenterY
    };
  }
  return {
    anchor: "bottom" as const,
    offsetMm: partCenterY - doorBottomMm
  };
}

function applyDoorAttachmentHeightAdjustments(
  group: THREE.Group,
  doorName: string,
  attachmentNames: string[],
  doorCenterYMm: number,
  doorHeightMm: number
) {
  const doorTopMm = doorCenterYMm + doorHeightMm * 0.5;
  const doorBottomMm = doorCenterYMm - doorHeightMm * 0.5;

  for (const attachmentName of attachmentNames) {
    const obj = group.getObjectByName(attachmentName);
    if (!obj) continue;
    const offset = getDoorAttachmentOffsetMm(attachmentName, doorName);
    if (!offset) continue;
    const nextCenterYMm =
      offset.anchor === "top" ? doorTopMm - offset.offsetMm : doorBottomMm + offset.offsetMm;
    setObjectCenterY(obj, nextCenterYMm);
  }
}

function getObjectBoundsMm(obj: THREE.Object3D | null | undefined) {
  if (!obj) return null;
  const box = new THREE.Box3().setFromObject(obj);
  return {
    minX: box.min.x * 1000,
    maxX: box.max.x * 1000,
    minZ: box.min.z * 1000,
    maxZ: box.max.z * 1000
  };
}

function resolveCornerCarcassDepthMm(params: CornerShelfLowerParams) {
  const totalDepthMm = Math.max(1, Math.round(getNumber(params.depth, baseDepthMm + baseFrontThicknessMm)));
  const frontThicknessMm = Math.max(1, Math.round(getNumber(params.frontThicknessMm, baseFrontThicknessMm)));
  return Math.max(1, totalDepthMm - frontThicknessMm);
}

function applyCornerDepthAdjustments(group: THREE.Group, params: CornerShelfLowerParams) {
  const nextDepthMm = resolveCornerCarcassDepthMm(params);
  const deltaDepthMm = nextDepthMm - baseDepthMm;
  const nextFrontThicknessMm = Math.max(1, Math.round(getNumber(params.frontThicknessMm, baseFrontThicknessMm)));
  const deltaFrontThicknessMm = nextFrontThicknessMm - baseFrontThicknessMm;
  if (Math.abs(deltaDepthMm) < 1e-6 && Math.abs(deltaFrontThicknessMm) < 1e-6) return;
  const doorShiftDeltaMm = deltaDepthMm + deltaFrontThicknessMm * 0.5;

  const resizeAlongZ = ["side_end_x", "bottom_x"];
  const resizeAlongX = ["side_end_z"];
  const shiftDoorAlongZ = [
    "door_front_z",
    "doorHandle_front_z"
  ];
  const shiftCarcassAlongZ = [
    "top_x_front",
    "leg_outer_x_front",
    "leg_inner_x_front",
    "kickClip_x_outer_collar",
    "kickClip_x_outer_pad",
    "kickClip_x_outer_arm",
    "kickClip_x_inner_collar",
    "kickClip_x_inner_pad",
    "kickClip_x_inner_arm",
    "kick_x"
  ];
  const shiftDoorAlongX = [
    "door_front_x",
    "doorHandle_front_x"
  ];
  const shiftCarcassAlongX = [
    "leg_outer_z_front",
    "leg_inner_z_front",
    "kickClip_z_outer_collar",
    "kickClip_z_outer_pad",
    "kickClip_z_outer_arm",
    "kickClip_z_inner_collar",
    "kickClip_z_inner_pad",
    "kickClip_z_inner_arm",
    "kick_z"
  ];

  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (!(mesh instanceof THREE.Mesh)) continue;
    const name = mesh.name;

    if (/^shelf_\d+_x$/i.test(name)) {
      resizeMeshAxis(mesh, "z", ((mesh.userData?.dimensionsMm?.depth as number | undefined) ?? 0) + deltaDepthMm);
      shiftMeshAxis(mesh, "z", deltaDepthMm * 0.5);
      continue;
    }
    if (/^shelf_\d+_z$/i.test(name)) {
      resizeMeshAxis(mesh, "x", ((mesh.userData?.dimensionsMm?.width as number | undefined) ?? 0) + deltaDepthMm);
      shiftMeshAxis(mesh, "x", deltaDepthMm * 0.5);
      resizeMeshAxis(mesh, "z", Math.max(1, ((mesh.userData?.dimensionsMm?.depth as number | undefined) ?? 0) - deltaDepthMm));
      shiftMeshAxis(mesh, "z", deltaDepthMm * 0.5);
      continue;
    }

    if (name === "bottom_z" || name === "top_z") {
      resizeMeshAxis(mesh, "x", ((mesh.userData?.dimensionsMm?.width as number | undefined) ?? 0) + deltaDepthMm);
      shiftMeshAxis(mesh, "x", deltaDepthMm * 0.5);
      resizeMeshAxis(mesh, "z", Math.max(1, ((mesh.userData?.dimensionsMm?.depth as number | undefined) ?? 0) - deltaDepthMm));
      shiftMeshAxis(mesh, "z", deltaDepthMm * 0.5);
      continue;
    }

    if (resizeAlongZ.includes(name)) {
      resizeMeshAxis(mesh, "z", ((mesh.userData?.dimensionsMm?.depth as number | undefined) ?? 0) + deltaDepthMm);
      shiftMeshAxis(mesh, "z", deltaDepthMm * 0.5);
      continue;
    }
    if (resizeAlongX.includes(name)) {
      resizeMeshAxis(mesh, "x", ((mesh.userData?.dimensionsMm?.width as number | undefined) ?? 0) + deltaDepthMm);
      shiftMeshAxis(mesh, "x", deltaDepthMm * 0.5);
      continue;
    }
    if (shiftDoorAlongZ.includes(name)) {
      shiftMeshAxis(mesh, "z", doorShiftDeltaMm);
      continue;
    }
    if (/^hinge_front_z_\d+_/i.test(name)) {
      shiftMeshAxis(mesh, "z", doorShiftDeltaMm);
      continue;
    }
    if (shiftDoorAlongX.includes(name)) {
      shiftMeshAxis(mesh, "x", doorShiftDeltaMm);
      continue;
    }
    if (/^hinge_front_x_\d+_/i.test(name)) {
      shiftMeshAxis(mesh, "x", doorShiftDeltaMm);
      continue;
    }
    if (shiftCarcassAlongZ.includes(name)) {
      shiftMeshAxis(mesh, "z", deltaDepthMm);
      continue;
    }
    if (shiftCarcassAlongX.includes(name)) {
      shiftMeshAxis(mesh, "x", deltaDepthMm);
    }
  }
}

function applyCornerLengthAdjustments(group: THREE.Group, params: CornerShelfLowerParams) {
  const nextLengthXMm = Math.max(400, Math.round(getNumber(params.lengthX, baseLengthXMm)));
  const nextLengthZMm = Math.max(400, Math.round(getNumber(params.lengthZ, baseLengthZMm)));
  const deltaLengthXMm = nextLengthXMm - baseLengthXMm;
  const deltaLengthZMm = nextLengthZMm - baseLengthZMm;
  if (Math.abs(deltaLengthXMm) < 1e-6 && Math.abs(deltaLengthZMm) < 1e-6) return;

  const resizeAlongX = ["back_x", "bottom_x", "top_x_front", "top_x_back", "kick_x"];
  const resizeAlongZ = ["back_z", "bottom_z", "top_z", "kick_z"];
  const shiftAlongX = ["side_end_x", "leg_outer_x_rear", "leg_outer_x_front"];
  const shiftAlongZ = ["side_end_z", "leg_outer_z_rear", "leg_outer_z_front"];
  const shiftAlongDoorX = [
    "doorHandle_front_z",
    "kickClip_x_outer_collar",
    "kickClip_x_outer_pad",
    "kickClip_x_outer_arm"
  ];
  const shiftAlongDoorZ = [
    "doorHandle_front_x",
    "kickClip_z_outer_collar",
    "kickClip_z_outer_pad",
    "kickClip_z_outer_arm"
  ];

  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (!(mesh instanceof THREE.Mesh)) continue;
    const name = mesh.name;

    if (/^shelf_\d+_x$/i.test(name) && Math.abs(deltaLengthXMm) > 1e-6) {
      resizeMeshAxis(mesh, "x", ((mesh.userData?.dimensionsMm?.width as number | undefined) ?? 0) + deltaLengthXMm);
      shiftMeshAxis(mesh, "x", deltaLengthXMm * 0.5);
      continue;
    }
    if (/^shelf_\d+_z$/i.test(name) && Math.abs(deltaLengthZMm) > 1e-6) {
      resizeMeshAxis(mesh, "z", ((mesh.userData?.dimensionsMm?.depth as number | undefined) ?? 0) + deltaLengthZMm);
      shiftMeshAxis(mesh, "z", deltaLengthZMm * 0.5);
      continue;
    }

    if (name === "door_front_z" && Math.abs(deltaLengthXMm) > 1e-6) {
      resizeMeshAxis(mesh, "x", ((mesh.userData?.dimensionsMm?.width as number | undefined) ?? 0) + deltaLengthXMm);
      shiftMeshAxis(mesh, "x", deltaLengthXMm * 0.5);
      continue;
    }
    if (name === "door_front_x" && Math.abs(deltaLengthZMm) > 1e-6) {
      resizeMeshAxis(mesh, "z", ((mesh.userData?.dimensionsMm?.depth as number | undefined) ?? 0) + deltaLengthZMm);
      shiftMeshAxis(mesh, "z", deltaLengthZMm * 0.5);
      continue;
    }

    if (Math.abs(deltaLengthXMm) > 1e-6 && resizeAlongX.includes(name)) {
      resizeMeshAxis(mesh, "x", ((mesh.userData?.dimensionsMm?.width as number | undefined) ?? 0) + deltaLengthXMm);
      shiftMeshAxis(mesh, "x", deltaLengthXMm * 0.5);
      continue;
    }
    if (Math.abs(deltaLengthZMm) > 1e-6 && resizeAlongZ.includes(name)) {
      resizeMeshAxis(mesh, "z", ((mesh.userData?.dimensionsMm?.depth as number | undefined) ?? 0) + deltaLengthZMm);
      shiftMeshAxis(mesh, "z", deltaLengthZMm * 0.5);
      continue;
    }
    if (Math.abs(deltaLengthXMm) > 1e-6 && shiftAlongX.includes(name)) {
      shiftMeshAxis(mesh, "x", deltaLengthXMm);
      continue;
    }
    if (Math.abs(deltaLengthZMm) > 1e-6 && shiftAlongZ.includes(name)) {
      shiftMeshAxis(mesh, "z", deltaLengthZMm);
      continue;
    }
    if (Math.abs(deltaLengthXMm) > 1e-6 && shiftAlongDoorX.includes(name)) {
      shiftMeshAxis(mesh, "x", deltaLengthXMm);
      continue;
    }
    if (Math.abs(deltaLengthXMm) > 1e-6 && /^hinge_front_z_\d+_/i.test(name)) {
      shiftMeshAxis(mesh, "x", deltaLengthXMm);
      continue;
    }
    if (Math.abs(deltaLengthZMm) > 1e-6 && shiftAlongDoorZ.includes(name)) {
      shiftMeshAxis(mesh, "z", deltaLengthZMm);
      continue;
    }
    if (Math.abs(deltaLengthZMm) > 1e-6 && /^hinge_front_x_\d+_/i.test(name)) {
      shiftMeshAxis(mesh, "z", deltaLengthZMm);
    }
  }
}

function applyCornerDoorGroundTruth(group: THREE.Group, params: CornerShelfLowerParams) {
  const lengthXMm = Math.max(400, Math.round(getNumber(params.lengthX, baseLengthXMm)));
  const lengthZMm = Math.max(400, Math.round(getNumber(params.lengthZ, baseLengthZMm)));
  const depthMm = Math.max(1, Math.round(getNumber(params.depth, baseDepthMm)));
  const frontThicknessMm = Math.max(1, Math.round(getNumber(params.frontThicknessMm, baseFrontThicknessMm)));
  const sideGapMm = Math.max(0, Math.round(getNumber(params.sideGap, baseSideGapMm)));

  const doorFrontZ = group.getObjectByName("door_front_z") as THREE.Mesh | null;
  if (doorFrontZ instanceof THREE.Mesh) {
    const targetMinXMm = depthMm - frontThicknessMm;
    const targetMaxXMm = lengthXMm - sideGapMm;
    const targetWidthMm = Math.max(1, targetMaxXMm - targetMinXMm);
    resizeMeshAxis(doorFrontZ, "x", targetWidthMm);
    setObjectCenterX(doorFrontZ, targetMinXMm + targetWidthMm * 0.5);
  }

  const doorFrontX = group.getObjectByName("door_front_x") as THREE.Mesh | null;
  if (doorFrontX instanceof THREE.Mesh) {
    const targetMinZMm = depthMm + cornerFrontRevealMm;
    const targetMaxZMm = lengthZMm - sideGapMm;
    const targetDepthMm = Math.max(1, targetMaxZMm - targetMinZMm);
    resizeMeshAxis(doorFrontX, "z", targetDepthMm);
    setObjectCenterZ(doorFrontX, targetMinZMm + targetDepthMm * 0.5);
  }
}

function applyCornerBackAdjustments(group: THREE.Group, params: CornerShelfLowerParams) {
  const backThicknessMm = Math.max(1, Math.round(getNumber(params.backThickness, baseBackThicknessMm)));
  const backX = group.getObjectByName("back_x") as THREE.Mesh | null;
  const backZ = group.getObjectByName("back_z") as THREE.Mesh | null;
  const backXCenter = getObjectCenterMm(backX);
  const backZCenter = getObjectCenterMm(backZ);

  if (backX instanceof THREE.Mesh) {
    resizeMeshAxis(backX, "z", backThicknessMm);
    if (backXCenter) {
      setObjectCenterZ(backX, backXCenter.z - (backThicknessMm - baseBackThicknessMm) * 0.5);
    }
  }

  if (backZ instanceof THREE.Mesh) {
    resizeMeshAxis(backZ, "x", backThicknessMm);
    if (backZCenter) {
      setObjectCenterX(backZ, backZCenter.x - (backThicknessMm - baseBackThicknessMm) * 0.5);
    }
  }
}

function applyCornerHeightAdjustments(group: THREE.Group, params: CornerShelfLowerParams) {
  const totalHeightMm = Math.max(50, Math.round(getNumber(params.height, baseHeightMm)));
  const worktopThicknessMm = Math.max(0, Math.round(getNumber(params.worktopThicknessMm, baseWorktopThicknessMm)));
  const boardThicknessMm = Math.max(1, Math.round(getNumber(params.boardThickness, baseBoardThicknessMm)));
  const plinthHeightMm = Math.max(0, Math.round(getNumber(params.plinthHeight, basePlinthHeightMm)));
  const heightCarcassMm = Math.max(50, Math.round(getNumber(params.heightCarcass, totalHeightMm - worktopThicknessMm)));
  const topGapMm = Math.max(0, Math.round(getNumber(params.topGap, 2)));
  const bottomGapMm = Math.max(0, Math.round(getNumber(params.bottomGap, 2)));
  const sidePanelHeightMm = Math.max(1, heightCarcassMm - plinthHeightMm);
  const clearInternalHeightMm = Math.max(1, heightCarcassMm - plinthHeightMm - 2 * boardThicknessMm);
  const bottomCenterYMm = plinthHeightMm + boardThicknessMm * 0.5;
  const topCenterYMm = totalHeightMm - worktopThicknessMm - boardThicknessMm * 0.5;
  const plinthCenterYMm = plinthHeightMm * 0.5;
  const internalBottomYMm = plinthHeightMm + boardThicknessMm;
  const internalTopYMm = totalHeightMm - worktopThicknessMm - boardThicknessMm;
  const doorHeightMm = Math.max(1, heightCarcassMm - plinthHeightMm - topGapMm - bottomGapMm);
  const doorCenterYMm = plinthHeightMm + bottomGapMm + doorHeightMm * 0.5;
  const shelfGaps = getShelfGapValues(params);

  const resizeHeight = (name: string, nextHeightMm: number) => {
    const mesh = group.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh)) return;
    resizeMeshHeight(mesh, nextHeightMm);
  };
  const setCenterY = (name: string, centerYMm: number) => {
    setObjectCenterY(group.getObjectByName(name), centerYMm);
  };

  for (const name of ["side_end_x", "side_end_z"]) {
    resizeHeight(name, sidePanelHeightMm);
    setCenterY(name, plinthHeightMm + sidePanelHeightMm * 0.5);
  }

  for (const name of ["bottom_x", "bottom_z", "top_x_front", "top_x_back", "top_z"]) {
    resizeHeight(name, boardThicknessMm);
  }
  setCenterY("bottom_x", bottomCenterYMm);
  setCenterY("bottom_z", bottomCenterYMm);
  setCenterY("top_x_front", topCenterYMm);
  setCenterY("top_x_back", topCenterYMm);
  setCenterY("top_z", topCenterYMm);

  for (const name of ["back_x", "back_z", "back_corner_panel"]) {
    resizeHeight(name, clearInternalHeightMm);
    setCenterY(name, (internalBottomYMm + internalTopYMm) * 0.5);
  }

  for (const name of ["kick_x", "kick_z", "leg_inner_rear", "leg_outer_x_rear", "leg_outer_x_front", "leg_inner_x_front", "leg_outer_z_rear", "leg_outer_z_front", "leg_inner_z_front"]) {
    resizeHeight(name, plinthHeightMm);
    setCenterY(name, plinthCenterYMm);
  }

  resizeHeight("door_front_z", doorHeightMm);
  resizeHeight("door_front_x", doorHeightMm);
  setCenterY("door_front_z", doorCenterYMm);
  setCenterY("door_front_x", doorCenterYMm);

  const shelfIndices = [...new Set(
    group.children
      .map((child) => child.name.match(/^shelf_(\d+)_(x|z)$/i)?.[1])
      .filter((value): value is string => typeof value === "string")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0)
  )].sort((left, right) => left - right);

  let cursorYMm = internalBottomYMm;
  for (const shelfIndex of shelfIndices) {
    const gapMm = Math.max(1, Math.round(shelfGaps[shelfIndex - 1] ?? shelfGaps[shelfGaps.length - 1] ?? 1));
    cursorYMm += gapMm;
    const centerYMm = cursorYMm + boardThicknessMm * 0.5;
    resizeHeight(`shelf_${shelfIndex}_x`, boardThicknessMm);
    resizeHeight(`shelf_${shelfIndex}_z`, boardThicknessMm);
    setCenterY(`shelf_${shelfIndex}_x`, centerYMm);
    setCenterY(`shelf_${shelfIndex}_z`, centerYMm);
    cursorYMm += boardThicknessMm;
  }

  applyDoorAttachmentHeightAdjustments(
    group,
    "door_front_z",
    [
      "doorHandle_front_z",
      "hinge_front_z_1_door_plate",
      "hinge_front_z_1_door_cup",
      "hinge_front_z_1_arm",
      "hinge_front_z_2_door_plate",
      "hinge_front_z_2_door_cup",
      "hinge_front_z_2_arm"
    ],
    doorCenterYMm,
    doorHeightMm
  );
  applyDoorAttachmentHeightAdjustments(
    group,
    "door_front_x",
    [
      "doorHandle_front_x",
      "hinge_front_x_1_door_plate",
      "hinge_front_x_1_door_cup",
      "hinge_front_x_1_arm",
      "hinge_front_x_2_door_plate",
      "hinge_front_x_2_door_cup",
      "hinge_front_x_2_arm"
    ],
    doorCenterYMm,
    doorHeightMm
  );
}

function applyCornerPlinthAdjustments(group: THREE.Group, params: CornerShelfLowerParams) {
  const plinthSetbackMm = Math.max(0, Math.round(getNumber(params.plinthSetbackMm, basePlinthSetbackMm)));
  const sideEndXBounds = getObjectBoundsMm(group.getObjectByName("side_end_x"));
  const sideEndZBounds = getObjectBoundsMm(group.getObjectByName("side_end_z"));
  const kickX = group.getObjectByName("kick_x") as THREE.Mesh | null;
  const kickZ = group.getObjectByName("kick_z") as THREE.Mesh | null;
  const kickXDims = getMeshDimensionsMm(kickX);
  const kickZDims = getMeshDimensionsMm(kickZ);
  const sharedCornerXMm = sideEndZBounds ? sideEndZBounds.maxX - plinthSetbackMm : null;
  const sharedCornerZMm = sideEndXBounds ? sideEndXBounds.maxZ - plinthSetbackMm : null;

  if (sideEndXBounds && kickX && kickXDims?.depth) {
    const targetFrontZMm = sharedCornerZMm ?? sideEndXBounds.maxZ - plinthSetbackMm;
    const overlapIntoCornerMm = kickZDims?.width ?? 0;
    const targetMinXMm = (sharedCornerXMm ?? sideEndXBounds.minX) - overlapIntoCornerMm;
    const targetWidthMm = Math.max(1, sideEndXBounds.maxX - targetMinXMm);
    resizeMeshAxis(kickX, "x", targetWidthMm);
    setObjectCenterX(kickX, targetMinXMm + targetWidthMm * 0.5);
    setObjectCenterZ(kickX, targetFrontZMm - kickXDims.depth * 0.5);
  }

  if (sideEndZBounds && kickZ && kickZDims?.width) {
    const targetFrontXMm = sharedCornerXMm ?? sideEndZBounds.maxX - plinthSetbackMm;
    const targetMinZMm = sharedCornerZMm ?? sideEndZBounds.minZ;
    const targetDepthMm = Math.max(1, sideEndZBounds.maxZ - targetMinZMm);
    resizeMeshAxis(kickZ, "z", targetDepthMm);
    setObjectCenterZ(kickZ, targetMinZMm + targetDepthMm * 0.5);
    setObjectCenterX(kickZ, targetFrontXMm - kickZDims.width * 0.5);
  }
}

function getHingeCenterOffsetsMm(doorCenterYMm: number, doorHeightMm: number, count: number, topOffsetMm: number, bottomOffsetMm: number) {
  if (count <= 1) return [doorCenterYMm];
  const topCenterYMm = doorCenterYMm + doorHeightMm * 0.5 - topOffsetMm;
  const bottomCenterYMm = doorCenterYMm - doorHeightMm * 0.5 + bottomOffsetMm;
  if (count === 2) return [bottomCenterYMm, topCenterYMm];

  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    return bottomCenterYMm + (topCenterYMm - bottomCenterYMm) * t;
  });
}

function applyCornerFrontAdjustments(group: THREE.Group, params: CornerShelfLowerParams) {
  const sideGapMm = Math.max(0, Math.round(getNumber(params.sideGap, baseSideGapMm)));
  const deltaSideGapMm = sideGapMm - baseSideGapMm;
  const frontThicknessMm = Math.max(1, Math.round(getNumber(params.frontThicknessMm, baseFrontThicknessMm)));
  const handleLengthMm = Math.max(12, Math.round(getNumber(params.handleLengthMm, 160)));
  const handleSizeMm = Math.max(8, Math.round(getNumber(params.handleSizeMm, 12)));
  const handleProjectionMm = Math.max(4, Math.round(getNumber(params.handleProjectionMm, 14)));
  const handlePositionMm = Math.max(0, Math.round(getNumber(params.handlePositionMm, 60)));
  const hingeCount = Math.max(1, Math.round(getNumber(params.hingeCountPerDoor, 2)));
  const hingeTopOffsetMm = Math.max(0, Math.round(getNumber(params.hingeTopOffsetMm, 110)));
  const hingeBottomOffsetMm = Math.max(0, Math.round(getNumber(params.hingeBottomOffsetMm, 110)));

  const doorFrontZ = group.getObjectByName("door_front_z") as THREE.Mesh | null;
  const doorFrontX = group.getObjectByName("door_front_x") as THREE.Mesh | null;
  const doorFrontZDims = getMeshDimensionsMm(doorFrontZ);
  const doorFrontXDims = getMeshDimensionsMm(doorFrontX);

  if (doorFrontZ instanceof THREE.Mesh && doorFrontZDims) {
    resizeMeshAxis(doorFrontZ, "x", Math.max(40, (doorFrontZDims.width ?? 40) - 2 * deltaSideGapMm));
    resizeMeshAxis(doorFrontZ, "z", frontThicknessMm);
  }
  if (doorFrontX instanceof THREE.Mesh && doorFrontXDims) {
    resizeMeshAxis(doorFrontX, "z", Math.max(40, (doorFrontXDims.depth ?? 40) - 2 * deltaSideGapMm));
    resizeMeshAxis(doorFrontX, "x", frontThicknessMm);
  }

  const doorFrontZCenter = getObjectCenterMm(doorFrontZ);
  const doorFrontXCenter = getObjectCenterMm(doorFrontX);
  const doorFrontZWidthMm = getMeshDimensionsMm(doorFrontZ)?.width ?? getBasePart("door_front_z")?.sizeMm?.x ?? 418;
  const doorFrontXDepthMm = getMeshDimensionsMm(doorFrontX)?.depth ?? getBasePart("door_front_x")?.sizeMm?.z ?? 418;
  const doorFrontZHeightMm = getMeshDimensionsMm(doorFrontZ)?.height ?? getBasePart("door_front_z")?.sizeMm?.y ?? 578;
  const doorFrontXHeightMm = getMeshDimensionsMm(doorFrontX)?.height ?? getBasePart("door_front_x")?.sizeMm?.y ?? 578;

  if (doorFrontZCenter) {
    const doorTopMm = doorFrontZCenter.y + doorFrontZHeightMm * 0.5;
    const handle = group.getObjectByName("doorHandle_front_z") as THREE.Mesh | null;
    if (handle instanceof THREE.Mesh) {
      resizeMeshAxis(handle, "x", handleLengthMm);
      resizeMeshHeight(handle, handleSizeMm);
      resizeMeshAxis(handle, "z", handleProjectionMm);
      setObjectCenterX(handle, doorFrontZCenter.x + baseHandleOffsetAlongDoorXMm);
      setObjectCenterY(handle, doorTopMm - handlePositionMm);
      setObjectCenterZ(handle, doorFrontZCenter.z + frontThicknessMm * 0.5 + handleProjectionMm * 0.5);
    }

    const hingeCenters = getHingeCenterOffsetsMm(doorFrontZCenter.y, doorFrontZHeightMm, hingeCount, hingeTopOffsetMm, hingeBottomOffsetMm);
    for (let index = 0; index < hingeCenters.length; index += 1) {
      for (const suffix of ["door_plate", "door_cup", "arm"] as const) {
        const hingeName = `hinge_front_z_${index + 1}_${suffix}`;
        const hinge = group.getObjectByName(hingeName);
        if (!hinge) continue;
        const hingeThicknessMm = getMeshDimensionsMm(hinge)?.depth ?? getBasePart(hingeName)?.sizeMm?.z ?? 0;
        setObjectCenterY(hinge, hingeCenters[index]!);
        setObjectCenterX(hinge, doorFrontZCenter.x + doorFrontZWidthMm * 0.5 - baseHingeInsetXMm);
        setObjectCenterZ(hinge, doorFrontZCenter.z - frontThicknessMm * 0.5 - hingeThicknessMm * 0.5);
      }
    }
  }

  if (doorFrontXCenter) {
    const doorTopMm = doorFrontXCenter.y + doorFrontXHeightMm * 0.5;
    const handle = group.getObjectByName("doorHandle_front_x") as THREE.Mesh | null;
    if (handle instanceof THREE.Mesh) {
      resizeMeshAxis(handle, "z", handleLengthMm);
      resizeMeshHeight(handle, handleSizeMm);
      resizeMeshAxis(handle, "x", handleProjectionMm);
      setObjectCenterZ(handle, doorFrontXCenter.z + baseHandleOffsetAlongDoorZMm);
      setObjectCenterY(handle, doorTopMm - handlePositionMm);
      setObjectCenterX(handle, doorFrontXCenter.x + frontThicknessMm * 0.5 + handleProjectionMm * 0.5);
    }

    const hingeCenters = getHingeCenterOffsetsMm(doorFrontXCenter.y, doorFrontXHeightMm, hingeCount, hingeTopOffsetMm, hingeBottomOffsetMm);
    for (let index = 0; index < hingeCenters.length; index += 1) {
      for (const suffix of ["door_plate", "door_cup", "arm"] as const) {
        const hingeName = `hinge_front_x_${index + 1}_${suffix}`;
        const hinge = group.getObjectByName(hingeName);
        if (!hinge) continue;
        const hingeThicknessMm = getMeshDimensionsMm(hinge)?.width ?? getBasePart(hingeName)?.sizeMm?.x ?? 0;
        setObjectCenterY(hinge, hingeCenters[index]!);
        setObjectCenterZ(hinge, doorFrontXCenter.z + doorFrontXDepthMm * 0.5 - baseHingeInsetZMm);
        setObjectCenterX(hinge, doorFrontXCenter.x - frontThicknessMm * 0.5 - hingeThicknessMm * 0.5);
      }
    }
  }
}

function attachObjectsToPivot(group: THREE.Group, pivotName: string, pivotPositionMm: { x: number; z: number }, objectNames: string[]) {
  const pivot = new THREE.Group();
  pivot.name = pivotName;
  pivot.position.set(pivotPositionMm.x / 1000, 0, pivotPositionMm.z / 1000);
  group.add(pivot);
  group.updateMatrixWorld(true);

  for (const objectName of objectNames) {
    const obj = group.getObjectByName(objectName);
    if (!obj || obj.parent === pivot) continue;
    pivot.attach(obj);
  }

  return pivot;
}

function applyCornerDoorOpenState(group: THREE.Group, params: CornerShelfLowerParams) {
  if (params.doorOpen !== true) return;

  group.updateMatrixWorld(true);
  const hingeCount = Math.max(1, Math.round(getNumber(params.hingeCountPerDoor, 2)));
  const zDoor = group.getObjectByName("door_front_z");
  const xDoor = group.getObjectByName("door_front_x");
  const zBounds = getObjectBoundsMm(zDoor);
  const xBounds = getObjectBoundsMm(xDoor);

  if (zBounds) {
    const zPivot = attachObjectsToPivot(
      group,
      "__corner_door_pivot_z",
      { x: zBounds.maxX, z: (zBounds.minZ + zBounds.maxZ) * 0.5 },
      [
        "door_front_z",
        "doorHandle_front_z",
        ...Array.from({ length: hingeCount }, (_, index) => [
          `hinge_front_z_${index + 1}_door_plate`,
          `hinge_front_z_${index + 1}_door_cup`,
          `hinge_front_z_${index + 1}_arm`
        ]).flat()
      ]
    );
    zPivot.rotation.y = -Math.PI / 2;
  }

  if (xBounds) {
    const xPivot = attachObjectsToPivot(
      group,
      "__corner_door_pivot_x",
      { x: (xBounds.minX + xBounds.maxX) * 0.5, z: xBounds.maxZ },
      [
        "door_front_x",
        "doorHandle_front_x",
        ...Array.from({ length: hingeCount }, (_, index) => [
          `hinge_front_x_${index + 1}_door_plate`,
          `hinge_front_x_${index + 1}_door_cup`,
          `hinge_front_x_${index + 1}_arm`
        ]).flat()
      ]
    );
    xPivot.rotation.y = Math.PI / 2;
  }
}

function alignCornerFrontSupports(group: THREE.Group) {
  const legClearanceBehindKickMm = 10;
  const xKickBounds = getObjectBoundsMm(group.getObjectByName("kick_x"));
  const zKickBounds = getObjectBoundsMm(group.getObjectByName("kick_z"));
  const xFrontLegNames = ["leg_outer_x_front", "leg_inner_x_front"];
  const zFrontLegNames = ["leg_outer_z_front", "leg_inner_z_front"];
  const xFrontClipNames = [
    "kickClip_x_outer_collar",
    "kickClip_x_outer_pad",
    "kickClip_x_outer_arm",
    "kickClip_x_inner_collar",
    "kickClip_x_inner_pad",
    "kickClip_x_inner_arm"
  ];
  const zFrontClipNames = [
    "kickClip_z_outer_collar",
    "kickClip_z_outer_pad",
    "kickClip_z_outer_arm",
    "kickClip_z_inner_collar",
    "kickClip_z_inner_pad",
    "kickClip_z_inner_arm"
  ];

  if (xKickBounds) {
    let currentLegFrontMaxZ = -Infinity;
    for (const name of xFrontLegNames) {
      const bounds = getObjectBoundsMm(group.getObjectByName(name));
      if (bounds) currentLegFrontMaxZ = Math.max(currentLegFrontMaxZ, bounds.maxZ);
    }
    if (Number.isFinite(currentLegFrontMaxZ)) {
      const targetLegFrontMaxZ = xKickBounds.minZ - legClearanceBehindKickMm;
      const deltaZMm = targetLegFrontMaxZ - currentLegFrontMaxZ;
      if (Math.abs(deltaZMm) > 1e-6) {
        for (const name of [...xFrontLegNames, ...xFrontClipNames]) {
          const obj = group.getObjectByName(name);
          if (obj) shiftMeshAxis(obj, "z", deltaZMm);
        }
      }
    }
  }

  if (zKickBounds) {
    let currentLegFrontMaxX = -Infinity;
    for (const name of zFrontLegNames) {
      const bounds = getObjectBoundsMm(group.getObjectByName(name));
      if (bounds) currentLegFrontMaxX = Math.max(currentLegFrontMaxX, bounds.maxX);
    }
    if (Number.isFinite(currentLegFrontMaxX)) {
      const targetLegFrontMaxX = zKickBounds.minX - legClearanceBehindKickMm;
      const deltaXMm = targetLegFrontMaxX - currentLegFrontMaxX;
      if (Math.abs(deltaXMm) > 1e-6) {
        for (const name of [...zFrontLegNames, ...zFrontClipNames]) {
          const obj = group.getObjectByName(name);
          if (obj) shiftMeshAxis(obj, "x", deltaXMm);
        }
      }
    }
  }
}

function attachKitchenCornerAnchors(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);

  const cornerAnchor = new THREE.Object3D();
  cornerAnchor.name = kitchenCornerAnchorName;
  cornerAnchor.position.set(box.min.x, 0, box.min.z);
  cornerAnchor.visible = false;
  group.add(cornerAnchor);

  const xAnchor = new THREE.Object3D();
  xAnchor.name = kitchenCornerXAnchorName;
  xAnchor.position.set(box.max.x, 0, box.min.z);
  xAnchor.visible = false;
  group.add(xAnchor);

  const zAnchor = new THREE.Object3D();
  zAnchor.name = kitchenCornerZAnchorName;
  zAnchor.position.set(box.min.x, 0, box.max.z);
  zAnchor.visible = false;
  group.add(zAnchor);
}

export function buildCornerShelfLower(params: CornerShelfLowerParams, catalog: ClientCatalog): THREE.Group {
  const group = buildPortableLiveModuleGroup(
    params as Record<string, unknown>,
    liveStateSnapshot as unknown as Parameters<typeof buildPortableLiveModuleGroup>[1],
    materialsSnapshot as unknown as Parameters<typeof buildPortableLiveModuleGroup>[2],
    catalog
  );

  syncCornerShelfMeshes(group, params);
  syncCornerHingeMeshes(group, params);
  applyCornerDepthAdjustments(group, params);
  applyCornerLengthAdjustments(group, params);
  applyCornerDoorGroundTruth(group, params);
  applyCornerBackAdjustments(group, params);
  applyCornerHeightAdjustments(group, params);
  applyCornerPlinthAdjustments(group, params);
  applyCornerFrontAdjustments(group, params);
  alignCornerFrontSupports(group);
  attachKitchenCornerAnchors(group);
  applyCornerDoorOpenState(group, params);

  return group;
}
