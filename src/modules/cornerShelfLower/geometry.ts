import * as THREE from "three";
import liveStateSnapshot from "./package/integration/current-live-state.json";
import materialsSnapshot from "./package/definitions/corner_shelf_lower.materials.snapshot.json";
import { buildPortableLiveModuleGroup } from "../runtime/portableGeometry";
import type { CornerShelfLowerParams } from "./types";

const kitchenCornerAnchorName = "__kitchen_corner_anchor";
const kitchenCornerXAnchorName = "__kitchen_corner_x_anchor";
const kitchenCornerZAnchorName = "__kitchen_corner_z_anchor";
const baseLiveRuntime = liveStateSnapshot.liveRuntime;
const baseLengthXMm = typeof baseLiveRuntime?.params?.lengthX === "number" ? baseLiveRuntime.params.lengthX : 1000;
const baseLengthZMm = typeof baseLiveRuntime?.params?.lengthZ === "number" ? baseLiveRuntime.params.lengthZ : 1000;
const baseDepthMm = typeof baseLiveRuntime?.params?.depth === "number" ? baseLiveRuntime.params.depth : 560;
const baseFrontThicknessMm =
  typeof baseLiveRuntime?.params?.frontThicknessMm === "number" ? baseLiveRuntime.params.frontThicknessMm : 19;

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

function getObjectBoundsMm(obj: THREE.Object3D | null) {
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
    "doorHandle_front_z",
    "hinge_front_z_1_door_plate",
    "hinge_front_z_1_door_cup",
    "hinge_front_z_1_arm",
    "hinge_front_z_2_door_plate",
    "hinge_front_z_2_door_cup",
    "hinge_front_z_2_arm"
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
    "doorHandle_front_x",
    "hinge_front_x_1_door_plate",
    "hinge_front_x_1_door_cup",
    "hinge_front_x_1_arm",
    "hinge_front_x_2_door_plate",
    "hinge_front_x_2_door_cup",
    "hinge_front_x_2_arm"
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
    if (shiftDoorAlongX.includes(name)) {
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
    "hinge_front_z_1_door_plate",
    "hinge_front_z_1_door_cup",
    "hinge_front_z_1_arm",
    "hinge_front_z_2_door_plate",
    "hinge_front_z_2_door_cup",
    "hinge_front_z_2_arm",
    "kickClip_x_outer_collar",
    "kickClip_x_outer_pad",
    "kickClip_x_outer_arm"
  ];
  const shiftAlongDoorZ = [
    "doorHandle_front_x",
    "hinge_front_x_1_door_plate",
    "hinge_front_x_1_door_cup",
    "hinge_front_x_1_arm",
    "hinge_front_x_2_door_plate",
    "hinge_front_x_2_door_cup",
    "hinge_front_x_2_arm",
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
    if (Math.abs(deltaLengthZMm) > 1e-6 && shiftAlongDoorZ.includes(name)) {
      shiftMeshAxis(mesh, "z", deltaLengthZMm);
    }
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

export function buildCornerShelfLower(params: CornerShelfLowerParams): THREE.Group {
  const group = buildPortableLiveModuleGroup(
    params as Record<string, unknown>,
    liveStateSnapshot as Parameters<typeof buildPortableLiveModuleGroup>[1],
    materialsSnapshot as Parameters<typeof buildPortableLiveModuleGroup>[2]
  );

  applyCornerDepthAdjustments(group, params);
  applyCornerLengthAdjustments(group, params);
  alignCornerFrontSupports(group);

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

  return group;
}
