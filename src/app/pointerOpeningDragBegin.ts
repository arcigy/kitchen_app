import * as THREE from "three";

type OpeningParams = {
  centerMm: number;
  wall: string;
  wallId?: string | null;
};

type WallAxisPoint = { t: number };
type WallLike = { params: { aMm: { x: number; z: number }; bMm: { x: number; z: number } } };
type OpeningDragState = { active: boolean; offsetMm: number; wall: string | null };

export function resolveOpeningCustomWallDragOffset<Wall extends WallLike>(args: {
  centerMm: number;
  groundHitPoint: THREE.Vector3 | null;
  pointOnWallAxisMm: (wall: Wall, pointMm: { x: number; z: number }) => WallAxisPoint;
  toMmPoint: (point: THREE.Vector3) => { x: number; z: number };
  wall: Wall | null;
}) {
  if (!args.wall || !args.groundHitPoint) return null;

  const closest = args.pointOnWallAxisMm(args.wall, args.toMmPoint(args.groundHitPoint));
  const lengthMm = Math.hypot(args.wall.params.bMm.x - args.wall.params.aMm.x, args.wall.params.bMm.z - args.wall.params.aMm.z);
  return args.centerMm - closest.t * lengthMm;
}

export function resolveOpeningLegacyWallDragOffset(args: {
  centerMm: number;
  groundHitPoint: THREE.Vector3 | null;
  wallAxis: "x" | "z";
  wallHitPoint: THREE.Vector3 | null;
}) {
  const hitPoint = args.wallHitPoint ?? args.groundHitPoint;
  if (!hitPoint) return null;
  const axis = args.wallAxis === "x" ? hitPoint.x : hitPoint.z;
  return args.centerMm - axis * 1000;
}

export function resolveOpeningCustomWallDragCenter<Wall extends WallLike>(args: {
  groundHitPoint: THREE.Vector3 | null;
  offsetMm: number;
  pointOnWallAxisMm: (wall: Wall, pointMm: { x: number; z: number }) => WallAxisPoint;
  toMmPoint: (point: THREE.Vector3) => { x: number; z: number };
  wall: Wall | null;
}) {
  if (!args.wall || !args.groundHitPoint) return null;

  const closest = args.pointOnWallAxisMm(args.wall, args.toMmPoint(args.groundHitPoint));
  const lengthMm = Math.hypot(args.wall.params.bMm.x - args.wall.params.aMm.x, args.wall.params.bMm.z - args.wall.params.aMm.z);
  return closest.t * lengthMm + args.offsetMm;
}

export function resolveOpeningLegacyWallDragCenter(args: {
  groundHitPoint: THREE.Vector3 | null;
  offsetMm: number;
  wallAxis: "x" | "z";
  wallHitPoint: THREE.Vector3 | null;
}) {
  const hitPoint = args.wallHitPoint ?? args.groundHitPoint;
  if (!hitPoint) return null;
  const axis = args.wallAxis === "x" ? hitPoint.x : hitPoint.z;
  return axis * 1000 + args.offsetMm;
}

export function beginWindowDragFromPick<Opening extends { params: OpeningParams }, Wall extends WallLike>(args: {
  cancelPendingMarquee: () => void;
  continueMoveAfterSelection: () => boolean;
  findCustomWall: (wallId: string) => Wall | null;
  getGroundHitPoint: () => THREE.Vector3 | null;
  getLegacyWallHitPoint: (wallId: string) => THREE.Vector3 | null;
  getLegacyWallMeta: (wallId: string) => { axis: "x" | "z" } | null;
  opening: Opening;
  pointOnWallAxisMm: (wall: Wall, pointMm: { x: number; z: number }) => WallAxisPoint;
  selectOpening: (opening: Opening) => void;
  setPointerCapture: () => void;
  toMmPoint: (point: THREE.Vector3) => { x: number; z: number };
  windowDragState: OpeningDragState;
}) {
  args.selectOpening(args.opening);
  args.cancelPendingMarquee();
  if (args.continueMoveAfterSelection()) return true;

  args.windowDragState.active = true;
  const customWallId = args.opening.params.wallId ?? null;
  args.windowDragState.wall = customWallId ?? args.opening.params.wall;

  if (customWallId) {
    const offset = resolveOpeningCustomWallDragOffset({
      centerMm: args.opening.params.centerMm,
      groundHitPoint: args.getGroundHitPoint(),
      pointOnWallAxisMm: args.pointOnWallAxisMm,
      toMmPoint: args.toMmPoint,
      wall: args.findCustomWall(customWallId)
    });
    if (offset === null) return true;
    args.windowDragState.offsetMm = offset;
  } else {
    const wallMeta = args.getLegacyWallMeta(args.opening.params.wall);
    if (!wallMeta) return true;
    const offset = resolveOpeningLegacyWallDragOffset({
      centerMm: args.opening.params.centerMm,
      groundHitPoint: args.getGroundHitPoint(),
      wallAxis: wallMeta.axis,
      wallHitPoint: args.getLegacyWallHitPoint(args.opening.params.wall)
    });
    if (offset === null) return true;
    args.windowDragState.offsetMm = offset;
  }

  args.setPointerCapture();
  return true;
}

export function beginDoorDragFromPick<Opening extends { params: OpeningParams }, Wall extends WallLike>(args: {
  cancelPendingMarquee: () => void;
  continueMoveAfterSelection: () => boolean;
  doorDragState: OpeningDragState;
  findCustomWall: (wallId: string) => Wall | null;
  getGroundHitPoint: () => THREE.Vector3 | null;
  opening: Opening;
  pointOnWallAxisMm: (wall: Wall, pointMm: { x: number; z: number }) => WallAxisPoint;
  selectOpening: (opening: Opening) => void;
  setPointerCapture: () => void;
  toMmPoint: (point: THREE.Vector3) => { x: number; z: number };
}) {
  args.selectOpening(args.opening);
  args.cancelPendingMarquee();
  if (args.continueMoveAfterSelection()) return true;

  args.doorDragState.active = true;
  const customWallId = args.opening.params.wallId ?? null;
  args.doorDragState.wall = customWallId;

  if (customWallId) {
    const offset = resolveOpeningCustomWallDragOffset({
      centerMm: args.opening.params.centerMm,
      groundHitPoint: args.getGroundHitPoint(),
      pointOnWallAxisMm: args.pointOnWallAxisMm,
      toMmPoint: args.toMmPoint,
      wall: args.findCustomWall(customWallId)
    });
    if (offset === null) return true;
    args.doorDragState.offsetMm = offset;
  }

  args.setPointerCapture();
  return true;
}

export function updateWindowDragFromPointerMove<Opening extends { params: OpeningParams }, Wall extends WallLike>(args: {
  findCustomWall: (wallId: string) => Wall | null;
  getGroundHitPoint: () => THREE.Vector3 | null;
  getLegacyWallHitPoint: (wallId: string) => THREE.Vector3 | null;
  getLegacyWallMeta: (wallId: string) => { axis: "x" | "z" };
  mountProps: () => void;
  opening: Opening;
  pointOnWallAxisMm: (wall: Wall, pointMm: { x: number; z: number }) => WallAxisPoint;
  toMmPoint: (point: THREE.Vector3) => { x: number; z: number };
  updateOpeningTransform: (opening: Opening) => void;
  windowDragState: OpeningDragState;
}) {
  const customWallId = args.opening.params.wallId ?? null;
  if (customWallId) {
    const centerMm = resolveOpeningCustomWallDragCenter({
      groundHitPoint: args.getGroundHitPoint(),
      offsetMm: args.windowDragState.offsetMm,
      pointOnWallAxisMm: args.pointOnWallAxisMm,
      toMmPoint: args.toMmPoint,
      wall: args.findCustomWall(customWallId)
    });
    if (centerMm === null) return true;
    args.opening.params.centerMm = centerMm;
  } else {
    const wallId = args.windowDragState.wall;
    if (!wallId) return true;
    const wallMeta = args.getLegacyWallMeta(wallId);
    const centerMm = resolveOpeningLegacyWallDragCenter({
      groundHitPoint: args.getGroundHitPoint(),
      offsetMm: args.windowDragState.offsetMm,
      wallAxis: wallMeta.axis,
      wallHitPoint: args.getLegacyWallHitPoint(wallId)
    });
    if (centerMm === null) return true;
    args.opening.params.centerMm = centerMm;
  }

  args.updateOpeningTransform(args.opening);
  args.mountProps();
  return true;
}

export function updateDoorDragFromPointerMove<Opening extends { params: OpeningParams }, Wall extends WallLike>(args: {
  doorDragState: OpeningDragState;
  findCustomWall: (wallId: string) => Wall | null;
  getGroundHitPoint: () => THREE.Vector3 | null;
  mountProps: () => void;
  opening: Opening;
  pointOnWallAxisMm: (wall: Wall, pointMm: { x: number; z: number }) => WallAxisPoint;
  toMmPoint: (point: THREE.Vector3) => { x: number; z: number };
  updateOpeningTransform: (opening: Opening) => void;
}) {
  const wallId = args.doorDragState.wall;
  if (!wallId) return true;

  const centerMm = resolveOpeningCustomWallDragCenter({
    groundHitPoint: args.getGroundHitPoint(),
    offsetMm: args.doorDragState.offsetMm,
    pointOnWallAxisMm: args.pointOnWallAxisMm,
    toMmPoint: args.toMmPoint,
    wall: args.findCustomWall(wallId)
  });
  if (centerMm === null) return true;

  args.opening.params.centerMm = centerMm;
  args.updateOpeningTransform(args.opening);
  args.mountProps();
  return true;
}

export function handleOpeningDragPointerMove<
  WindowOpening extends { params: OpeningParams },
  DoorOpening extends { params: OpeningParams },
  Wall extends WallLike
>(args: {
  doorDragState: OpeningDragState;
  doorOpening: DoorOpening | null;
  findCustomWall: (wallId: string) => Wall | null;
  getGroundHitPoint: () => THREE.Vector3 | null;
  getLegacyWallHitPoint: (wallId: string) => THREE.Vector3 | null;
  getLegacyWallMeta: (wallId: string) => { axis: "x" | "z" };
  mountProps: () => void;
  pointOnWallAxisMm: (wall: Wall, pointMm: { x: number; z: number }) => WallAxisPoint;
  toMmPoint: (point: THREE.Vector3) => { x: number; z: number };
  updateDoorTransform: (opening: DoorOpening) => void;
  updateWindowTransform: (opening: WindowOpening) => void;
  windowDragState: OpeningDragState;
  windowOpening: WindowOpening | null;
}) {
  if (args.windowDragState.active && args.windowOpening && args.windowDragState.wall) {
    return updateWindowDragFromPointerMove({
      findCustomWall: args.findCustomWall,
      getGroundHitPoint: args.getGroundHitPoint,
      getLegacyWallHitPoint: args.getLegacyWallHitPoint,
      getLegacyWallMeta: args.getLegacyWallMeta,
      mountProps: args.mountProps,
      opening: args.windowOpening,
      pointOnWallAxisMm: args.pointOnWallAxisMm,
      toMmPoint: args.toMmPoint,
      updateOpeningTransform: args.updateWindowTransform,
      windowDragState: args.windowDragState
    });
  }

  if (args.doorDragState.active && args.doorOpening && args.doorDragState.wall) {
    return updateDoorDragFromPointerMove({
      doorDragState: args.doorDragState,
      findCustomWall: args.findCustomWall,
      getGroundHitPoint: args.getGroundHitPoint,
      mountProps: args.mountProps,
      opening: args.doorOpening,
      pointOnWallAxisMm: args.pointOnWallAxisMm,
      toMmPoint: args.toMmPoint,
      updateOpeningTransform: args.updateDoorTransform
    });
  }

  return false;
}
