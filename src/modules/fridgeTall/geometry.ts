import * as THREE from "three";
import liveStateSnapshot from "./package/integration/current-live-state.json";
import materialsSnapshot from "./package/definitions/fridge_tall.materials.snapshot.json";
import { buildPortableLiveModuleGroup } from "../runtime/portableGeometry";
import type { FridgeTallParams } from "./types";

const kitchenBackAnchorName = "__kitchen_back_anchor";

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMeshDimensionsMm(obj: THREE.Object3D | null) {
  if (!obj) return null;
  const dims = obj.userData?.dimensionsMm as { width?: number; height?: number; depth?: number } | undefined;
  if (!dims) return null;
  return dims;
}

function resizeMeshAxis(mesh: THREE.Mesh | null, axis: "x" | "z", nextSizeMm: number) {
  if (!(mesh instanceof THREE.Mesh)) return;
  const dims = getMeshDimensionsMm(mesh);
  if (!dims) return;
  const dimKey = axis === "x" ? "width" : "depth";
  const currentSizeMm = dims[dimKey];
  if (typeof currentSizeMm !== "number" || !Number.isFinite(currentSizeMm) || currentSizeMm <= 0) return;
  if (Math.abs(nextSizeMm - currentSizeMm) < 1e-6) return;
  mesh.scale[axis] *= nextSizeMm / currentSizeMm;
  dims[dimKey] = nextSizeMm;
}

function resizeMeshHeight(mesh: THREE.Mesh | null, nextHeightMm: number) {
  if (!(mesh instanceof THREE.Mesh)) return;
  const dims = getMeshDimensionsMm(mesh);
  if (!dims) return;
  const currentHeightMm = dims?.height;
  if (typeof currentHeightMm !== "number" || !Number.isFinite(currentHeightMm) || currentHeightMm <= 0) return;
  if (Math.abs(nextHeightMm - currentHeightMm) < 1e-6) return;
  mesh.scale.y *= nextHeightMm / currentHeightMm;
  dims.height = nextHeightMm;
}

function setObjectCenterX(obj: THREE.Object3D | null, centerXMm: number) {
  if (!obj) return;
  obj.position.x = centerXMm / 1000;
}

function setObjectCenterY(obj: THREE.Object3D | null, centerYMm: number) {
  if (!obj) return;
  obj.position.y = centerYMm / 1000;
}

function setObjectCenterZ(obj: THREE.Object3D | null, centerZMm: number) {
  if (!obj) return;
  obj.position.z = centerZMm / 1000;
}

function setObjectCenter(obj: THREE.Object3D | null, centerMm: { x?: number; y?: number; z?: number }) {
  if (!obj) return;
  if (typeof centerMm.x === "number") obj.position.x = centerMm.x / 1000;
  if (typeof centerMm.y === "number") obj.position.y = centerMm.y / 1000;
  if (typeof centerMm.z === "number") obj.position.z = centerMm.z / 1000;
}

function getHandleType(params: FridgeTallParams) {
  return typeof params.handleType === "string" ? params.handleType.trim().toLowerCase() : "bar";
}

function syncHandleSize(handle: THREE.Mesh | null, params: FridgeTallParams) {
  if (!(handle instanceof THREE.Mesh)) return;
  const handleType = getHandleType(params);
  const dims = getMeshDimensionsMm(handle);
  if (!dims) return;

  const requestedLengthMm = Math.max(20, Math.round(getNumber(params.handleLengthMm, dims.height ?? 160)));
  const requestedSizeMm = Math.max(8, Math.round(getNumber(params.handleSizeMm, Math.min(dims.width ?? 12, dims.depth ?? 12))));
  const requestedProjectionMm = Math.max(4, Math.round(getNumber(params.handleProjectionMm, dims.depth ?? 14)));

  let nextWidthMm = requestedSizeMm;
  let nextHeightMm = requestedLengthMm;
  let nextDepthMm = requestedProjectionMm;

  if (handleType === "knob") {
    nextWidthMm = requestedSizeMm;
    nextHeightMm = requestedSizeMm;
    nextDepthMm = Math.max(requestedProjectionMm, requestedSizeMm);
  } else if (handleType === "profile") {
    nextWidthMm = Math.max(10, requestedSizeMm);
    nextHeightMm = Math.max(60, requestedLengthMm);
    nextDepthMm = Math.max(6, Math.round(requestedProjectionMm * 0.7));
  }

  resizeMeshAxis(handle, "x", nextWidthMm);
  resizeMeshHeight(handle, nextHeightMm);
  resizeMeshAxis(handle, "z", nextDepthMm);
}

function getDoorMetrics(params: FridgeTallParams) {
  const widthMm = Math.max(400, Math.round(getNumber(params.width, 600)));
  const heightMm = Math.max(1200, Math.round(getNumber(params.height, 1916)));
  const depthMm = Math.max(400, Math.round(getNumber(params.depth, 600)));
  const boardThicknessMm = Math.max(12, Math.round(getNumber(params.boardThickness, 18)));
  const frontThicknessMm = Math.max(12, Math.round(getNumber(params.frontThicknessMm, 18)));
  const plinthHeightMm = Math.max(0, Math.round(getNumber(params.plinthHeight, 100)));
  const sideGapMm = Math.max(0, Math.round(getNumber(params.sideGap, 0)));
  const fridgeDoorGapMm = Math.max(0, Math.round(getNumber(params.fridgeDoorGapMm, 2)));
  const visibleDoorStackHeightMm = Math.max(1, heightMm - plinthHeightMm);
  const freezerDoorHeightMm = clamp(
    Math.round(getNumber(params.freezerDoorHeightMm, 700)) + boardThicknessMm,
    1,
    Math.max(1, visibleDoorStackHeightMm - fridgeDoorGapMm - 1)
  );
  const fridgeDoorHeightMm = Math.max(1, visibleDoorStackHeightMm - freezerDoorHeightMm - fridgeDoorGapMm);

  return {
    widthMm,
    heightMm,
    depthMm,
    boardThicknessMm,
    frontThicknessMm,
    plinthHeightMm,
    sideGapMm,
    fridgeDoorGapMm,
    visibleDoorStackHeightMm,
    freezerDoorHeightMm,
    fridgeDoorHeightMm,
    doorWidthMm: Math.max(40, widthMm - sideGapMm * 2),
    doorCenterZMm: depthMm * 0.5 + frontThicknessMm * 0.5,
    freezerDoorCenterYMm: plinthHeightMm + freezerDoorHeightMm * 0.5,
    fridgeDoorCenterYMm: plinthHeightMm + freezerDoorHeightMm + fridgeDoorGapMm + fridgeDoorHeightMm * 0.5,
    splitLineYMm: plinthHeightMm + freezerDoorHeightMm
  };
}

function applyFridgeCarcassGeometry(group: THREE.Group, params: FridgeTallParams) {
  const widthMm = Math.max(400, Math.round(getNumber(params.width, 600)));
  const heightMm = Math.max(1200, Math.round(getNumber(params.height, 1916)));
  const depthMm = Math.max(400, Math.round(getNumber(params.depth, 600)));
  const boardThicknessMm = Math.max(12, Math.round(getNumber(params.boardThickness, 18)));
  const backThicknessMm = Math.max(1, Math.round(getNumber(params.backThickness, 6)));
  const plinthHeightMm = Math.max(0, Math.round(getNumber(params.plinthHeight, 100)));
  const plinthSetbackMm = Math.max(0, Math.round(getNumber(params.plinthSetbackMm, 60)));
  const sideHeightMm = Math.max(1, heightMm - plinthHeightMm);
  const innerWidthMm = Math.max(1, widthMm - boardThicknessMm * 2);
  const halfWidthMm = widthMm * 0.5;
  const halfDepthMm = depthMm * 0.5;

  const leftSide = group.getObjectByName("leftSide") as THREE.Mesh | null;
  const rightSide = group.getObjectByName("rightSide") as THREE.Mesh | null;
  const bottom = group.getObjectByName("bottom") as THREE.Mesh | null;
  const top = group.getObjectByName("top") as THREE.Mesh | null;
  const back = group.getObjectByName("back") as THREE.Mesh | null;
  const kickboard = group.getObjectByName("kickboard") as THREE.Mesh | null;

  resizeMeshAxis(leftSide, "x", boardThicknessMm);
  resizeMeshHeight(leftSide, sideHeightMm);
  resizeMeshAxis(leftSide, "z", depthMm);
  setObjectCenter(leftSide, {
    x: -halfWidthMm + boardThicknessMm * 0.5,
    y: plinthHeightMm + sideHeightMm * 0.5,
    z: 0
  });

  resizeMeshAxis(rightSide, "x", boardThicknessMm);
  resizeMeshHeight(rightSide, sideHeightMm);
  resizeMeshAxis(rightSide, "z", depthMm);
  setObjectCenter(rightSide, {
    x: halfWidthMm - boardThicknessMm * 0.5,
    y: plinthHeightMm + sideHeightMm * 0.5,
    z: 0
  });

  resizeMeshAxis(bottom, "x", innerWidthMm);
  resizeMeshHeight(bottom, boardThicknessMm);
  resizeMeshAxis(bottom, "z", depthMm);
  setObjectCenter(bottom, {
    x: 0,
    y: plinthHeightMm + boardThicknessMm * 0.5,
    z: 0
  });

  resizeMeshAxis(top, "x", innerWidthMm);
  resizeMeshHeight(top, boardThicknessMm);
  resizeMeshAxis(top, "z", depthMm);
  setObjectCenter(top, {
    x: 0,
    y: heightMm - boardThicknessMm * 0.5,
    z: 0
  });

  resizeMeshAxis(back, "x", widthMm);
  resizeMeshHeight(back, sideHeightMm);
  resizeMeshAxis(back, "z", backThicknessMm);
  setObjectCenter(back, {
    x: 0,
    y: plinthHeightMm + sideHeightMm * 0.5,
    z: -halfDepthMm + backThicknessMm * 0.5
  });

  resizeMeshAxis(kickboard, "x", widthMm);
  resizeMeshHeight(kickboard, plinthHeightMm);
  resizeMeshAxis(kickboard, "z", boardThicknessMm);
  setObjectCenter(kickboard, {
    x: 0,
    y: plinthHeightMm * 0.5,
    z: halfDepthMm - plinthSetbackMm - boardThicknessMm * 0.5
  });
}

function applyFridgeSupportGeometry(group: THREE.Group, params: FridgeTallParams) {
  const widthMm = Math.max(400, Math.round(getNumber(params.width, 600)));
  const depthMm = Math.max(400, Math.round(getNumber(params.depth, 600)));
  const plinthHeightMm = Math.max(0, Math.round(getNumber(params.plinthHeight, 100)));
  const plinthSetbackMm = Math.max(0, Math.round(getNumber(params.plinthSetbackMm, 60)));

  const frontLegNames = ["leg_FL", "leg_FR"];
  const backLegNames = ["leg_BL", "leg_BR"];
  const clipNames = ["kickClip_FL", "kickClip_FR"];
  const halfWidthMm = widthMm * 0.5;
  const halfDepthMm = depthMm * 0.5;

  for (const name of [...frontLegNames, ...backLegNames]) {
    const leg = group.getObjectByName(name) as THREE.Mesh | null;
    const dims = getMeshDimensionsMm(leg);
    if (!leg || !dims) continue;
    resizeMeshHeight(leg, plinthHeightMm);
    const halfLegWidthMm = (dims.width ?? 40) * 0.5;
    const halfLegDepthMm = (dims.depth ?? 40) * 0.5;
    const centerXMm = name.endsWith("L")
      ? -halfWidthMm + 10 + halfLegWidthMm
      : halfWidthMm - 10 - halfLegWidthMm;
    const centerZMm = name.startsWith("leg_F")
      ? halfDepthMm - plinthSetbackMm - 28 - halfLegDepthMm
      : -halfDepthMm + 40 + halfLegDepthMm;
    setObjectCenter(leg, {
      x: centerXMm,
      y: plinthHeightMm * 0.5,
      z: centerZMm
    });
  }

  for (const name of clipNames) {
    const clip = group.getObjectByName(name) as THREE.Mesh | null;
    const dims = getMeshDimensionsMm(clip);
    if (!clip || !dims) continue;
    const matchingLeg = group.getObjectByName(name === "kickClip_FL" ? "leg_FL" : "leg_FR");
    if (!matchingLeg) continue;
    const legX = matchingLeg.position.x * 1000;
    const legZ = matchingLeg.position.z * 1000;
    setObjectCenter(clip, {
      x: legX,
      y: Math.max((dims.height ?? 18) * 0.5 + 12, plinthHeightMm * 0.42),
      z: legZ
    });
  }
}

function applyFridgeApplianceGeometry(group: THREE.Group, params: FridgeTallParams) {
  const widthMm = Math.max(400, Math.round(getNumber(params.width, 600)));
  const heightMm = Math.max(1200, Math.round(getNumber(params.height, 1916)));
  const depthMm = Math.max(400, Math.round(getNumber(params.depth, 600)));
  const boardThicknessMm = Math.max(12, Math.round(getNumber(params.boardThickness, 18)));
  const plinthHeightMm = Math.max(0, Math.round(getNumber(params.plinthHeight, 100)));
  const fridgeWidthMm = Math.max(100, Math.round(getNumber(params.fridgeWidthMm, 560)));
  const fridgeHeightMm = Math.max(100, Math.round(getNumber(params.fridgeHeightMm, 1770)));
  const fridgeDepthMm = Math.max(100, Math.round(getNumber(params.fridgeDepthMm, 550)));
  const fridgeSideClearanceMm = Math.max(0, Math.round(getNumber(params.fridgeSideClearanceMm, 2)));
  const fridgeTopClearanceMm = Math.max(0, Math.round(getNumber(params.fridgeTopClearanceMm, 5)));
  const fridgeBottomClearanceMm = Math.max(0, Math.round(getNumber(params.fridgeBottomClearanceMm, 5)));

  const dummyTrim = group.getObjectByName("fridge_dummy_trim") as THREE.Mesh | null;
  const dummyBody = group.getObjectByName("fridge_dummy_body") as THREE.Mesh | null;
  const dummyBezel = group.getObjectByName("fridge_dummy_bezel") as THREE.Mesh | null;

  const assemblyFrontFaceMm = depthMm * 0.5 - 2;
  const bezelDepthMm = 30;
  const bodyDepthMm = Math.max(1, fridgeDepthMm - bezelDepthMm);
  const trimDepthMm = 10;
  const dummyCenterYMm = plinthHeightMm + boardThicknessMm + fridgeBottomClearanceMm + fridgeHeightMm * 0.5;
  const bodyWidthMm = fridgeWidthMm;
  const facadeWidthMm = fridgeWidthMm + fridgeSideClearanceMm * 2;

  resizeMeshAxis(dummyBody, "x", bodyWidthMm);
  resizeMeshHeight(dummyBody, fridgeHeightMm);
  resizeMeshAxis(dummyBody, "z", bodyDepthMm);
  setObjectCenter(dummyBody, {
    x: 0,
    y: dummyCenterYMm,
    z: assemblyFrontFaceMm - bezelDepthMm - bodyDepthMm * 0.5
  });

  resizeMeshAxis(dummyBezel, "x", facadeWidthMm);
  resizeMeshHeight(dummyBezel, fridgeHeightMm);
  resizeMeshAxis(dummyBezel, "z", bezelDepthMm);
  setObjectCenter(dummyBezel, {
    x: 0,
    y: dummyCenterYMm,
    z: assemblyFrontFaceMm - bezelDepthMm * 0.5
  });

  resizeMeshAxis(dummyTrim, "x", facadeWidthMm + 20);
  resizeMeshHeight(dummyTrim, fridgeHeightMm + 20 + fridgeTopClearanceMm);
  resizeMeshAxis(dummyTrim, "z", trimDepthMm);
  setObjectCenter(dummyTrim, {
    x: 0,
    y: dummyCenterYMm + fridgeTopClearanceMm * 0.5,
    z: assemblyFrontFaceMm + trimDepthMm * 0.5
  });
}

function applyFridgeDoorGeometry(group: THREE.Group, params: FridgeTallParams) {
  const freezerDoor = group.getObjectByName("freezerDoorFront") as THREE.Mesh | null;
  const fridgeDoor = group.getObjectByName("fridgeDoorFront") as THREE.Mesh | null;
  const freezerHandle = group.getObjectByName("freezerDoor_handle") as THREE.Mesh | null;
  const fridgeHandle = group.getObjectByName("fridgeDoor_handle") as THREE.Mesh | null;
  const {
    widthMm,
    frontThicknessMm,
    sideGapMm,
    doorWidthMm,
    doorCenterZMm,
    freezerDoorHeightMm,
    fridgeDoorHeightMm,
    freezerDoorCenterYMm,
    fridgeDoorCenterYMm,
    splitLineYMm,
    fridgeDoorGapMm
  } = getDoorMetrics(params);

  resizeMeshAxis(freezerDoor, "x", doorWidthMm);
  resizeMeshHeight(freezerDoor, freezerDoorHeightMm);
  resizeMeshAxis(freezerDoor, "z", frontThicknessMm);
  setObjectCenter(freezerDoor, {
    x: 0,
    y: freezerDoorCenterYMm,
    z: doorCenterZMm
  });

  resizeMeshAxis(fridgeDoor, "x", doorWidthMm);
  resizeMeshHeight(fridgeDoor, fridgeDoorHeightMm);
  resizeMeshAxis(fridgeDoor, "z", frontThicknessMm);
  setObjectCenter(fridgeDoor, {
    x: 0,
    y: fridgeDoorCenterYMm,
    z: doorCenterZMm
  });

  syncHandleSize(freezerHandle, params);
  syncHandleSize(fridgeHandle, params);

  const freezerHandleDims = getMeshDimensionsMm(freezerHandle);
  const fridgeHandleDims = getMeshDimensionsMm(fridgeHandle);
  const handlePositionMm = Math.max(0, Math.round(getNumber(params.handlePositionMm, 60)));
  const handleOffsetFromSplitMm = Math.round(getNumber(params.doorHandleOffsetFromSplitMm, 0));
  const handleCenterXMm = widthMm * 0.5 - Math.max(24, 68 + sideGapMm);
  const freezerHandleLengthMm = freezerHandleDims?.height ?? 160;
  const fridgeHandleLengthMm = fridgeHandleDims?.height ?? 160;
  const freezerHandleProjectionMm = freezerHandleDims?.depth ?? 14;
  const fridgeHandleProjectionMm = fridgeHandleDims?.depth ?? 14;
  const handleCenterZMm = widthMm && doorCenterZMm + frontThicknessMm * 0.5 + Math.max(freezerHandleProjectionMm, fridgeHandleProjectionMm) * 0.5;

  setObjectCenter(freezerHandle, {
    x: handleCenterXMm,
    y: splitLineYMm - handlePositionMm - freezerHandleLengthMm * 0.5 - handleOffsetFromSplitMm,
    z: handleCenterZMm
  });

  setObjectCenter(fridgeHandle, {
    x: handleCenterXMm,
    y: splitLineYMm + fridgeDoorGapMm + handlePositionMm + fridgeHandleLengthMm * 0.5 + handleOffsetFromSplitMm,
    z: handleCenterZMm
  });
}

function attachObjectsToPivot(
  group: THREE.Group,
  pivotName: string,
  pivotPositionMm: { x: number; z: number },
  objectNames: string[]
) {
  const pivot = new THREE.Group();
  pivot.name = pivotName;
  pivot.position.set(pivotPositionMm.x / 1000, 0, pivotPositionMm.z / 1000);
  group.add(pivot);
  group.updateMatrixWorld(true);

  for (const name of objectNames) {
    const obj = group.getObjectByName(name);
    if (!obj || obj.parent === pivot) continue;
    pivot.attach(obj);
  }

  return pivot;
}

function applyFridgeDoorOpenState(group: THREE.Group, params: FridgeTallParams) {
  if (params.doorOpen !== true) return;
  const { doorWidthMm, doorCenterZMm } = getDoorMetrics(params);
  const hingeXMm = -doorWidthMm * 0.5;

  const freezerPivot = attachObjectsToPivot(
    group,
    "__fridge_freezer_door_pivot",
    { x: hingeXMm, z: doorCenterZMm },
    ["freezerDoorFront", "freezerDoor_handle"]
  );
  freezerPivot.rotation.y = -Math.PI / 2;

  const fridgePivot = attachObjectsToPivot(
    group,
    "__fridge_main_door_pivot",
    { x: hingeXMm, z: doorCenterZMm },
    ["fridgeDoorFront", "fridgeDoor_handle"]
  );
  fridgePivot.rotation.y = -Math.PI / 2;
}

function attachBackAnchor(group: THREE.Group, params: FridgeTallParams) {
  const depthMm = Math.max(400, Math.round(getNumber(params.depth, 600)));
  const existing = group.getObjectByName(kitchenBackAnchorName);
  if (existing) group.remove(existing);
  const anchor = new THREE.Object3D();
  anchor.name = kitchenBackAnchorName;
  anchor.visible = false;
  anchor.position.set(0, 0, -depthMm * 0.5 / 1000);
  group.add(anchor);
}

export function buildFridgeTall(params: FridgeTallParams): THREE.Group {
  const group = buildPortableLiveModuleGroup(
    params as Record<string, unknown>,
    liveStateSnapshot as unknown as Parameters<typeof buildPortableLiveModuleGroup>[1],
    materialsSnapshot as unknown as Parameters<typeof buildPortableLiveModuleGroup>[2]
  );

  applyFridgeCarcassGeometry(group, params);
  applyFridgeSupportGeometry(group, params);
  applyFridgeApplianceGeometry(group, params);
  applyFridgeDoorGeometry(group, params);
  applyFridgeDoorOpenState(group, params);
  attachBackAnchor(group, params);
  group.updateMatrixWorld(true);
  return group;
}
