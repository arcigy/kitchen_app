import * as THREE from 'three';
import { offsetsM } from '../walls2d/model';
import type { KitchenPlacementBinding, LayoutInstance, WallInstance } from './localTypes';

type Side = 'left' | 'right';
type Face = { wall: WallInstance; side: Side; start: THREE.Vector3; dir: THREE.Vector3; normal: THREE.Vector3; min: number; max: number };
type Placement = { position: THREE.Vector3; rotationY: number; binding: KitchenPlacementBinding };
type Opening = { wallId: string; centerMm: number; widthMm: number; bottomMm: number; heightMm: number };
const tolerance = .001;
const flat = (point: THREE.Vector3) => point.clone().setY(0);
const angleDelta = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function isWallKitchenBinding(binding: KitchenPlacementBinding | null | undefined) {
  return binding?.kind === 'wall' || binding?.kind === 'wall-corner';
}

/** Uses the same physical side offsets as the wall solver, never a worktop proxy. */
export function createUpperWallPlacement(ctx: {
  walls: WallInstance[];
  wallSolvedOutlines: Map<string, Array<{ x: number; z: number }>>;
  getOpenings: () => Opening[];
  isCorner: (inst: LayoutInstance) => boolean;
  getBackCenter: (inst: LayoutInstance) => THREE.Vector3;
  getPlacementY: (inst: LayoutInstance, groupId?: string | null) => number;
}) {
  function faces(inst: LayoutInstance, y = ctx.getPlacementY(inst)): Face[] {
    const result: Face[] = [];
    for (const wall of ctx.walls) {
      if (wall.params.heightMm / 1000 + tolerance < y + inst.localBox.max.y) continue;
      const a = new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000);
      const b = new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000);
      const dir = b.clone().sub(a), length = dir.length();
      if (length < tolerance) continue;
      dir.divideScalar(length);
      const normal = new THREE.Vector3(-dir.z, 0, dir.x);
      const offsets = offsetsM({ id: wall.id, a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z },
        thicknessM: wall.params.thicknessMm / 1000, justification: wall.params.justification ?? 'center',
        exteriorSign: wall.params.exteriorSign ?? 1 });
      for (const side of ['left', 'right'] as const) {
        const start = a.clone().addScaledVector(normal, offsets[side]);
        const outline = ctx.wallSolvedOutlines.get(wall.id) ?? [];
        const along = outline.map(p => new THREE.Vector3(p.x, 0, p.z).sub(start))
          .filter(p => Math.abs(p.dot(normal)) < tolerance).map(p => p.dot(dir));
        result.push({ wall, side, start, dir, normal: normal.clone().multiplyScalar(side === 'left' ? 1 : -1),
          min: along.length >= 2 ? Math.min(...along) : 0, max: along.length >= 2 ? Math.max(...along) : length });
      }
    }
    // Through/butt joins can leave a host outline extending to the FAR side of
    // its cross wall. Only the exposed intervals can support a cabinet or be
    // used as the zero datum of an editable run dimension.
    return result.flatMap(face => {
      let intervals = [[face.min, face.max]];
      for (const other of ctx.walls) {
        if (other.id === face.wall.id || other.params.heightMm / 1000 <= y + inst.localBox.min.y + tolerance) continue;
        let outline = ctx.wallSolvedOutlines.get(other.id);
        if (!outline?.length) {
          const a = new THREE.Vector3(other.params.aMm.x / 1000, 0, other.params.aMm.z / 1000);
          const b = new THREE.Vector3(other.params.bMm.x / 1000, 0, other.params.bMm.z / 1000);
          const dir = b.clone().sub(a).normalize(), normal = new THREE.Vector3(-dir.z, 0, dir.x);
          const offsets = offsetsM({ id: other.id, a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z },
            thicknessM: other.params.thicknessMm / 1000, justification: other.params.justification ?? 'center',
            exteriorSign: other.params.exteriorSign ?? 1 });
          outline = [a.clone().addScaledVector(normal, offsets.left), b.clone().addScaledVector(normal, offsets.left),
            b.clone().addScaledVector(normal, offsets.right), a.clone().addScaledVector(normal, offsets.right)];
        }
        const points = outline.map(p => new THREE.Vector3(p.x, 0, p.z).sub(face.start));
        const normalDistances = points.map(p => p.dot(face.normal));
        if (Math.max(...normalDistances) <= tolerance) continue;
        const crossings: number[] = [];
        for (let i = 0; i < points.length; i++) {
          const j = (i + 1) % points.length, a = normalDistances[i], b = normalDistances[j];
          if (Math.abs(a) < tolerance) crossings.push(points[i].dot(face.dir));
          if (a * b < 0) crossings.push(points[i].clone().lerp(points[j], a / (a - b)).dot(face.dir));
        }
        if (crossings.length < 2) continue;
        const low = Math.min(...crossings), high = Math.max(...crossings);
        if (high - low < tolerance) continue;
        intervals = intervals.flatMap(([start, end]) => high <= start || low >= end ? [[start, end]]
          : [[start, Math.min(low, end)], [Math.max(high, start), end]].filter(([a, b]) => b - a > tolerance));
      }
      return intervals.map(([min, max]) => ({ ...face, min, max }));
    });
  }

  function supports(face: Face, a: THREE.Vector3, b: THREE.Vector3, inst: LayoutInstance, y: number) {
    const relative = [a, b].map(p => flat(p).sub(face.start));
    if (relative.some(p => Math.abs(p.dot(face.normal)) > tolerance)) return false;
    const along = relative.map(p => p.dot(face.dir));
    const low = Math.min(...along), high = Math.max(...along);
    if (low < face.min - tolerance || high > face.max + tolerance) return false;
    return !ctx.getOpenings().some(opening => opening.wallId === face.wall.id &&
      opening.bottomMm / 1000 < y + inst.localBox.max.y - tolerance &&
      (opening.bottomMm + opening.heightMm) / 1000 > y + inst.localBox.min.y + tolerance &&
      (opening.centerMm - opening.widthMm / 2) / 1000 < high - tolerance &&
      (opening.centerMm + opening.widthMm / 2) / 1000 > low + tolerance);
  }

  function rectangular(inst: LayoutInstance, face: Face, along: number, y: number): Placement | null {
    const rotationY = Math.atan2(face.normal.x, face.normal.z);
    const rotation = new THREE.Euler(0, rotationY, 0);
    const back = ctx.getBackCenter(inst);
    const center = face.start.clone().addScaledVector(face.dir, along);
    const position = center.clone().sub(back.clone().applyEuler(rotation)); position.y = y;
    const a = new THREE.Vector3(inst.localBox.min.x, 0, back.z).applyEuler(rotation).add(position);
    const b = new THREE.Vector3(inst.localBox.max.x, 0, back.z).applyEuler(rotation).add(position);
    if (!supports(face, a, b, inst, y)) return null;
    return { position, rotationY, binding: { kind: 'wall', wallId: face.wall.id, wallSide: face.side, segmentIndex: 0, offsetAlongM: along } };
  }

  function corner(inst: LayoutInstance, first: Face, second: Face, y: number): Placement | null {
    if (first.wall.id === second.wall.id || Math.abs(first.normal.dot(second.normal)) > 1e-6) return null;
    // Positive local X and Z must both point into the same interior quadrant.
    const axisRotation = Math.atan2(first.normal.x, first.normal.z);
    if (new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), axisRotation).dot(second.normal) < .999999) return null;
    const denom = first.dir.dot(second.normal);
    if (Math.abs(denom) < 1e-6) return null;
    const intersection = first.start.clone().addScaledVector(first.dir, second.start.clone().sub(first.start).dot(second.normal) / denom);
    const rotationOffset = Number(inst.module.userData.kitchenCornerRotationOffsetRad ?? inst.root.userData.kitchenCornerRotationOffsetRad ?? 0);
    const rotationY = axisRotation + rotationOffset;
    const rotation = new THREE.Euler(0, rotationY, 0);
    const { min, max } = inst.localBox;
    const points = [[min.x, min.z], [max.x, min.z], [max.x, max.z], [min.x, max.z]]
      .map(([x, z]) => new THREE.Vector3(x, 0, z).applyEuler(rotation));
    const xs = points.map(p => p.dot(second.normal)), zs = points.map(p => p.dot(first.normal));
    const position = intersection.clone().addScaledVector(second.normal, -Math.min(...xs)).addScaledVector(first.normal, -Math.min(...zs));
    position.y = y;
    const xEnd = intersection.clone().addScaledVector(second.normal, Math.max(...xs) - Math.min(...xs));
    const zEnd = intersection.clone().addScaledVector(first.normal, Math.max(...zs) - Math.min(...zs));
    if (!supports(first, intersection, xEnd, inst, y) || !supports(second, intersection, zEnd, inst, y)) return null;
    return { position, rotationY, binding: { kind: 'wall-corner', wallId: first.wall.id, wallSide: first.side,
      secondWallId: second.wall.id, secondWallSide: second.side, segmentIndex: 0, offsetAlongM: 0 } };
  }

  function resolveBinding(inst: LayoutInstance, binding: KitchenPlacementBinding, y = ctx.getPlacementY(inst)) {
    const available = faces(inst, y);
    for (const first of available.filter(face => face.wall.id === binding.wallId && face.side === binding.wallSide)) {
      if (ctx.isCorner(inst)) {
        if (binding.kind !== 'wall-corner') return null;
        for (const second of available.filter(face => face.wall.id === binding.secondWallId && face.side === binding.secondWallSide)) {
          const resolved = corner(inst, first, second, y);
          if (resolved) return resolved;
        }
      } else if (binding.kind === 'wall' && Number.isFinite(binding.offsetAlongM)) {
        const resolved = rectangular(inst, first, binding.offsetAlongM, y);
        if (resolved) return resolved;
      }
    }
    return null;
  }

  function candidates(inst: LayoutInstance, cursor: THREE.Vector3, groupId?: string | null) {
    const y = ctx.getPlacementY(inst, groupId), available = faces(inst, y);
    const result: Placement[] = [];
    for (const face of available) {
      if (ctx.isCorner(inst)) {
        for (const other of available) { const candidate = corner(inst, face, other, y); if (candidate) result.push(candidate); }
      } else {
        const half = (inst.localBox.max.x - inst.localBox.min.x) / 2;
        const low = face.min + half, high = face.max - half;
        if (high < low) continue;
        const offset = flat(cursor).sub(face.start);
        if (offset.dot(face.normal) < -tolerance) continue;
        const candidate = rectangular(inst, face, Math.max(low, Math.min(high, offset.dot(face.dir))), y);
        if (candidate) result.push(candidate);
      }
    }
    return result;
  }

  function constrain(inst: LayoutInstance, cursor: THREE.Vector3, groupId?: string | null) {
    const available = candidates(inst, cursor, groupId);
    const distance = (candidate: Placement) => flat(candidate.position).distanceToSquared(flat(cursor));
    available.sort((a, b) => distance(a) - distance(b) || angleDelta(a.rotationY, inst.root.rotation.y) - angleDelta(b.rotationY, inst.root.rotation.y));
    const best = available[0];
    const reach = Math.max(.65, (inst.localBox.max.z - inst.localBox.min.z) + .2);
    return best && distance(best) <= reach * reach ? best : null;
  }

  function infer(inst: LayoutInstance, groupId?: string | null) {
    inst.root.updateMatrixWorld(true);
    const y = ctx.getPlacementY(inst, groupId);
    const matches = (candidate: Placement) => Math.abs(inst.root.position.y - y) <= tolerance &&
      flat(candidate.position).distanceTo(flat(inst.root.position)) <= tolerance && angleDelta(candidate.rotationY, inst.root.rotation.y) <= .001;
    // Checking an existing attachment needs one wall (two for a corner), not a
    // fresh search over every possible corner on every movement frame.
    const current = isWallKitchenBinding(inst.kitchenPlacement) ? resolveBinding(inst, inst.kitchenPlacement!, y) : null;
    if (current && matches(current)) return current.binding;
    const cursor = ctx.isCorner(inst) ? inst.root.position : ctx.getBackCenter(inst).applyMatrix4(inst.root.matrixWorld);
    const candidatesAtPosition = candidates(inst, cursor, groupId);
    return candidatesAtPosition.find(matches)?.binding ?? null;
  }

  function apply(inst: LayoutInstance, binding: KitchenPlacementBinding) {
    const placement = resolveBinding(inst, binding);
    if (!placement) return false;
    inst.root.position.copy(placement.position); inst.root.rotation.y = placement.rotationY;
    inst.kitchenPlacement = placement.binding; inst.root.updateMatrixWorld(true);
    return true;
  }
  const getRunFace = (inst: LayoutInstance) => faces(inst).find(face =>
    face.wall.id === inst.kitchenPlacement?.wallId && face.side === inst.kitchenPlacement?.wallSide &&
    inst.kitchenPlacement.offsetAlongM >= face.min - tolerance && inst.kitchenPlacement.offsetAlongM <= face.max + tolerance) ?? null;
  return { constrain, infer, apply, resolveBinding, getRunFace };
}
