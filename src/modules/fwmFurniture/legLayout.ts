import { Box3, Matrix4, Mesh, Vector3, type Group, type Object3D } from "three";

import { explicitLegCounts } from "./legCounts";
export { explicitLegCounts } from "./legCounts";

type Anchor = { point: Vector3; leg: Mesh; clips: Mesh[]; facing: string };
function name(object: Object3D): string { return String(object.userData.boardName ?? object.name); }
function center(object: Object3D): Vector3 { return new Box3().setFromObject(object).getCenter(new Vector3()); }
function distanceXZ(a: Vector3, b: Vector3): number { return Math.hypot(a.x - b.x, a.z - b.z); }
function nearest<T>(items: readonly T[], score: (value: T) => number): T | undefined {
  return [...items].sort((a, b) => score(a) - score(b))[0];
}

/** Existing construction anchors preserve handedness and the separate arms of corner cabinets. */
function resizedAnchors(input: readonly Anchor[], count: number): Anchor[] {
  if (!count || !input.length) return [];
  const anchors = [...input].sort((a, b) => a.point.x - b.point.x || a.point.z - b.point.z);
  if (count <= anchors.length) {
    if (count === 1 && anchors.length === 2 && anchors[0]!.facing === anchors[1]!.facing)
      return [{ ...anchors[0]!, point: anchors[0]!.point.clone().lerp(anchors[1]!.point, 0.5) }];
    return Array.from({ length: count }, (_, i) => anchors[Math.round(i * (anchors.length - 1) / Math.max(1, count - 1))]!);
  }
  while (anchors.length < count) {
    let best: { a: Anchor; b: Anchor; length: number } | undefined;
    for (const a of anchors) {
      const b = nearest(anchors.filter(candidate => candidate !== a && candidate.facing === a.facing), candidate => distanceXZ(a.point, candidate.point));
      if (!b) continue;
      const length = distanceXZ(a.point, b.point);
      if (!best || length > best.length) best = { a, b, length };
    }
    if (!best || best.length < 0.041) throw new Error("Pre zadaný počet nôh nie je pod skrinkou dostatok miesta.");
    anchors.push({ ...best.a, point: best.a.point.clone().lerp(best.b.point, 0.5) });
  }
  return anchors;
}

function rootClone(source: Mesh, root: Group, offset: Vector3, id: string, kind: "leg" | "plinth_clip", role: "front" | "rear" | "side"): Mesh {
  const clone = source.clone();
  const matrix = new Matrix4().copy(root.matrixWorld).invert().multiply(source.matrixWorld);
  matrix.decompose(clone.position, clone.quaternion, clone.scale);
  clone.position.add(offset);
  clone.name = id;
  clone.userData = { ...clone.userData, boardName: id, partName: id, hardwareAssemblyId: id.replace(/_(collar|pad|arm)$/, ""),
    componentType: kind, materialGroup: "hardware", hardwareRole: role };
  root.add(clone);
  return clone;
}

export function applyExplicitLegLayout(root: Group, params: Record<string, unknown>): void {
  const counts = explicitLegCounts(params);
  if (!counts || Number(params.plinthHeight) <= 0) return;
  root.updateMatrixWorld(true);
  const legs: Mesh[] = [], clips: Mesh[] = [];
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (object.userData.componentType === "leg" || (object.userData.materialGroup === "hardware" && /(^|_)leg_/.test(name(object)))) legs.push(object);
    if (object.userData.componentType === "plinth_clip" || (object.userData.materialGroup === "hardware" && /clip/i.test(name(object)))) clips.push(object);
  });
  if (!legs.length) return;
  const anchors = legs.map(leg => ({ leg, point: center(leg), clips: [] as Mesh[], facing: "rear" }));
  const sideClips = clips.filter(clip => /kickClip_(left|right)_/.test(name(clip)));
  const frontClips = clips.filter(clip => !sideClips.includes(clip));
  for (const clip of frontClips) {
    const anchor = nearest(anchors, candidate => distanceXZ(candidate.point, center(clip)));
    if (anchor) anchor.clips.push(clip);
  }
  for (const anchor of anchors) {
    if (anchor.clips.length) {
      const arm = anchor.clips.find(clip => /_arm$/.test(name(clip))) ?? anchor.clips[0]!;
      const delta = center(arm).sub(anchor.point);
      anchor.facing = `front:${Math.round(Math.atan2(delta.x, delta.z) * 10)}`;
    } else if (params.plinthFrontEnabled === false && /front|diagonal/.test(name(anchor.leg))) anchor.facing = "front:0";
  }
  const front = anchors.filter(anchor => anchor.facing.startsWith("front"));
  const rear = anchors.filter(anchor => !front.includes(anchor));
  // Rear corner supports follow each wall arm; never interpolate diagonally across the empty corner.
  for (const anchor of rear) anchor.facing = /_x_|_right/.test(name(anchor.leg)) ? "rear:x" : "rear:z";
  if (rear.length === 2) rear.forEach(anchor => { anchor.facing = "rear"; });
  const placed = [
    ...resizedAnchors(front.length ? front : anchors, counts.front).map(anchor => ({ anchor, role: "front" as const })),
    ...resizedAnchors(rear.length ? rear : anchors, counts.rear).map(anchor => ({ anchor, role: "rear" as const }))
  ];
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();
  for (const [index, { anchor, role }] of placed.entries()) {
    const offset = anchor.point.clone().applyMatrix4(rootInverse).sub(center(anchor.leg).applyMatrix4(rootInverse));
    rootClone(anchor.leg, root, offset, `configured_leg_${role}_${index + 1}`, "leg", role);
    if (role === "front") {
      const template = anchor.clips.length ? anchor : nearest(front, candidate => distanceXZ(candidate.point, anchor.point));
      if (template) for (const clip of template.clips) {
        const clipOffset = anchor.point.clone().applyMatrix4(rootInverse).sub(template.point.clone().applyMatrix4(rootInverse));
        rootClone(clip, root, clipOffset, `configured_clip_front_${index + 1}_${name(clip).split("_").at(-1)}`, "plinth_clip", "front");
      }
    }
  }
  // Each existing side attachment follows one real leg, even when front/rear counts differ.
  const sideSets = new Map<string, Mesh[]>();
  for (const clip of sideClips) {
    const id = name(clip).replace(/_(collar|pad|arm)$/, "");
    sideSets.set(id, [...(sideSets.get(id) ?? []), clip]);
  }
  const emitted = new Set<string>();
  for (const [id, meshes] of sideSets) {
    const original = nearest(anchors, candidate => distanceXZ(candidate.point, center(meshes[0]!)));
    const target = original && nearest(placed, candidate => distanceXZ(candidate.anchor.point, original.point));
    if (!original || !target) continue;
    const arm = meshes.find(mesh => /_arm$/.test(name(mesh))) ?? meshes[0]!;
    const normal = center(arm).sub(original.point).setY(0).normalize();
    // A side clip must still touch the same side plinth plane after redistributing supports.
    if (Math.abs(target.anchor.point.clone().sub(original.point).dot(normal)) > 0.005) continue;
    const side = id.includes("left") ? "left" : "right";
    const key = `${side}:${placed.indexOf(target)}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    const offset = target.anchor.point.clone().applyMatrix4(rootInverse).sub(original.point.clone().applyMatrix4(rootInverse));
    for (const clip of meshes) rootClone(clip, root, offset, `configured_clip_side_${side}_${placed.indexOf(target)}_${name(clip).split("_").at(-1)}`, "plinth_clip", "side");
  }
  for (const object of [...legs, ...clips]) object.removeFromParent();
  root.updateMatrixWorld(true);
}
