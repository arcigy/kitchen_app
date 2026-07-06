import * as THREE from "three";
import type { AlignLock, AlignLockEndpoint, AlignLockModuleSide, AlignPickedLine, LayoutInstance } from "./localTypes";

type AlignLockStore = {
  alignLocks: AlignLock[];
  alignLockCounter: number;
};

type EndpointContext = {
  resolveModuleSide?: (instanceId: string, line: AlignPickedLine) => AlignLockModuleSide | null;
};

type ResolvePointContext = {
  findInstance: (id: string) => LayoutInstance | null;
  instanceWorldBox: (inst: LayoutInstance) => THREE.Box3;
};

const endpointId = (line: AlignPickedLine) => {
  if (line.targetKind === "wall") return line.wallId ?? null;
  if (line.targetKind === "module") return line.instanceId ?? null;
  return line.worktopId ?? null;
};

export function resolveModuleSideFromBox(line: AlignPickedLine, box: THREE.Box3): AlignLockModuleSide | null {
  if (line.targetKind !== "module") return null;
  const mid = line.segA.clone().add(line.segB).multiplyScalar(0.5);
  const distances: Array<{ side: AlignLockModuleSide; distance: number }> = [
    { side: "left", distance: Math.abs(mid.x - box.min.x) },
    { side: "right", distance: Math.abs(mid.x - box.max.x) },
    { side: "back", distance: Math.abs(mid.z - box.min.z) },
    { side: "front", distance: Math.abs(mid.z - box.max.z) }
  ];
  distances.sort((a, b) => a.distance - b.distance);
  return distances[0]?.side ?? null;
}

export function alignEndpointFromPickedLine(line: AlignPickedLine, ctx: EndpointContext = {}): AlignLockEndpoint | null {
  const id = endpointId(line);
  if (!id) return null;
  return {
    targetKind: line.targetKind,
    targetId: id,
    lineRole: line.lineRole,
    segmentIndex: line.segmentIndex,
    moduleSide: line.targetKind === "module" ? ctx.resolveModuleSide?.(id, line) ?? undefined : undefined
  };
}

export function alignEndpointsEqual(a: AlignLockEndpoint, b: AlignLockEndpoint) {
  return (
    a.targetKind === b.targetKind &&
    a.targetId === b.targetId &&
    a.lineRole === b.lineRole &&
    (a.segmentIndex ?? -1) === (b.segmentIndex ?? -1) &&
    (a.moduleSide ?? "") === (b.moduleSide ?? "")
  );
}

function sameUnorderedPair(lock: AlignLock, a: AlignLockEndpoint, b: AlignLockEndpoint) {
  return (alignEndpointsEqual(lock.a, a) && alignEndpointsEqual(lock.b, b)) || (alignEndpointsEqual(lock.a, b) && alignEndpointsEqual(lock.b, a));
}

function sameTargetObject(a: AlignLockEndpoint, b: AlignLockEndpoint) {
  return a.targetKind === b.targetKind && a.targetId === b.targetId;
}

export function findBlockingAlignLock(
  locks: AlignLock[],
  ref: AlignPickedLine,
  picked: AlignPickedLine,
  ctx: EndpointContext = {}
) {
  const target = alignEndpointFromPickedLine(picked, ctx);
  const nextRef = alignEndpointFromPickedLine(ref, ctx);
  if (!target || !nextRef) return null;
  for (const lock of locks) {
    if (!lock.locked) continue;
    const targetIsA = sameTargetObject(lock.a, target);
    const targetIsB = sameTargetObject(lock.b, target);
    if (!targetIsA && !targetIsB) continue;
    if (sameUnorderedPair(lock, target, nextRef)) continue;
    const existingOther = targetIsA ? lock.b : lock.a;
    if (alignEndpointsEqual(targetIsA ? lock.a : lock.b, target) && alignEndpointsEqual(existingOther, nextRef)) continue;
    return lock;
  }
  return null;
}

export function addUnlockedAlignLockAfterAlign(
  store: AlignLockStore,
  ref: AlignPickedLine,
  picked: AlignPickedLine,
  ctx: EndpointContext = {}
) {
  const a = alignEndpointFromPickedLine(ref, ctx);
  const b = alignEndpointFromPickedLine(picked, ctx);
  if (!a || !b) return null;
  const mid = ref.segA.clone().add(ref.segB).multiplyScalar(0.5);
  return addUnlockedAlignLockForEndpoints(store, a, b, { x: Math.round(mid.x * 1000), z: Math.round(mid.z * 1000) });
}

export function addUnlockedAlignLockForEndpoints(
  store: AlignLockStore,
  a: AlignLockEndpoint,
  b: AlignLockEndpoint,
  pointMm: { x: number; z: number }
) {
  const existing = store.alignLocks.find((lock) => sameUnorderedPair(lock, a, b)) ?? null;
  if (existing) {
    existing.pointMm = pointMm;
    return existing;
  }
  const lock: AlignLock = {
    id: `align-lock-${store.alignLockCounter++}`,
    locked: false,
    a,
    b,
    pointMm
  };
  store.alignLocks.push(lock);
  return lock;
}

export function toggleAlignLock(locks: AlignLock[], id: string) {
  const lock = locks.find((item) => item.id === id) ?? null;
  if (!lock) return false;
  lock.locked = !lock.locked;
  return true;
}

export function getLockedModuleNeighborIdsForSide(
  locks: AlignLock[],
  moduleId: string,
  side: AlignLockModuleSide
) {
  const ids: string[] = [];
  for (const lock of locks) {
    if (!lock.locked) continue;
    const bMatches = lock.b.targetKind === "module" && lock.b.targetId === moduleId && lock.b.moduleSide === side;
    const other = bMatches ? lock.a : null;
    if (other?.targetKind === "module") ids.push(other.targetId);
  }
  return ids;
}

export function isProtectedAlignModule(locks: AlignLock[] | undefined, moduleId: string | null | undefined) {
  if (!moduleId) return false;
  return (locks ?? []).some((lock) => lock.locked && lock.b.targetKind === "module" && lock.b.targetId === moduleId);
}

export function getLockedResizeAnchorSide(locks: AlignLock[], moduleId: string): AlignLockModuleSide | null {
  for (const lock of locks) {
    if (!lock.locked) continue;
    if (lock.a.targetKind === "module" && lock.a.targetId === moduleId && lock.a.moduleSide) return lock.a.moduleSide;
    if (lock.b.targetKind === "module" && lock.b.targetId === moduleId && lock.b.moduleSide) return lock.b.moduleSide;
  }
  return null;
}

function pointForModuleEndpoint(endpoint: AlignLockEndpoint, ctx: ResolvePointContext) {
  if (endpoint.targetKind !== "module" || !endpoint.moduleSide) return null;
  const inst = ctx.findInstance(endpoint.targetId);
  if (!inst) return null;
  const box = ctx.instanceWorldBox(inst);
  const center = box.getCenter(new THREE.Vector3());
  switch (endpoint.moduleSide) {
    case "left":
      return new THREE.Vector3(box.min.x, 0, center.z);
    case "right":
      return new THREE.Vector3(box.max.x, 0, center.z);
    case "back":
      return new THREE.Vector3(center.x, 0, box.min.z);
    case "front":
      return new THREE.Vector3(center.x, 0, box.max.z);
  }
}

export function resolveAlignLockPointWorld(lock: AlignLock, ctx: ResolvePointContext) {
  const a = pointForModuleEndpoint(lock.a, ctx);
  const b = pointForModuleEndpoint(lock.b, ctx);
  if (a && b) return a.add(b).multiplyScalar(0.5);
  return new THREE.Vector3(lock.pointMm.x / 1000, 0, lock.pointMm.z / 1000);
}

export function alignLockInvolvesSelection(lock: AlignLock, selected: { kind: string | null; moduleId?: string | null; wallId?: string | null }) {
  const matches = (endpoint: AlignLockEndpoint) => {
    if (selected.kind === "module") return endpoint.targetKind === "module" && endpoint.targetId === selected.moduleId;
    if (selected.kind === "wall") return endpoint.targetKind === "wall" && endpoint.targetId === selected.wallId;
    return false;
  };
  return matches(lock.a) || matches(lock.b);
}

export function isObjectInLockedAlignLock(
  locks: AlignLock[] | undefined,
  targetKind: AlignLockEndpoint["targetKind"],
  targetId: string | null | undefined
) {
  if (!targetId) return false;
  return (locks ?? []).some(
    (lock) =>
      lock.locked &&
      ((lock.a.targetKind === targetKind && lock.a.targetId === targetId) ||
        (lock.b.targetKind === targetKind && lock.b.targetId === targetId))
  );
}

export function hasLockedAlignModule(ids: Iterable<string>, locks: AlignLock[] | undefined) {
  for (const id of ids) {
    if (isObjectInLockedAlignLock(locks, "module", id)) return true;
  }
  return false;
}

export function hasLockedAlignWall(ids: Iterable<string>, locks: AlignLock[] | undefined) {
  for (const id of ids) {
    if (isObjectInLockedAlignLock(locks, "wall", id)) return true;
  }
  return false;
}
