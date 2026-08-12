import * as THREE from "three";
import type { LedStripGroup, LedStripMode, LedStripPointMm } from "./ledStripTypes";
import { offsetLedStripPolyline } from "./ledStripEditing";

export type LedStripPlacementMode = Exclude<LedStripMode, "custom">;
export type LedPlacementSource = { id: string; root: THREE.Object3D };

function taggedMeshes(root: THREE.Object3D, tag: string): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const tags = Array.isArray(object.userData.tags) ? object.userData.tags : [];
    if (tags.includes(tag)) result.push(object);
  });
  return result;
}

function boxOf(mesh: THREE.Object3D): THREE.Box3 | null {
  const box = new THREE.Box3().setFromObject(mesh);
  return box.isEmpty() ? null : box;
}

function lineAtWallBack(box: THREE.Box3, y: number): LedStripPointMm[] {
  const z = box.min.z;
  return [{ x: Math.round(box.min.x * 1000), y: Math.round(y * 1000), z: Math.round(z * 1000) }, { x: Math.round(box.max.x * 1000), y: Math.round(y * 1000), z: Math.round(z * 1000) }];
}

function lineAtPlinthFront(box: THREE.Box3, y: number): LedStripPointMm[] {
  const z = box.max.z;
  return [{ x: Math.round(box.min.x * 1000), y: Math.round(y * 1000), z: Math.round(z * 1000) }, { x: Math.round(box.max.x * 1000), y: Math.round(y * 1000), z: Math.round(z * 1000) }];
}

/** Fails atomically: unsupported sources return no groups and a diagnostic instead of a partial placement. */
export function createAutomaticLedStripGroups(args: {
  mode: LedStripPlacementMode;
  sources: readonly LedPlacementSource[];
  nextId: () => string;
  offsetMm?: number;
  lightingComponentId?: string | null;
  profileWidthMm?: number | null;
}): { groups: LedStripGroup[]; unsupportedSourceIds: string[] } {
  const unsupportedSourceIds: string[] = [];
  const groups: LedStripGroup[] = [];
  for (const source of args.sources) {
    // An upper-module LED belongs to the whole module's underside, not to its internal shelves.
    const anchors = args.mode === "underUpper" ? [source.root] : taggedMeshes(source.root, args.mode === "plinthJoint" ? "plinth" : "shelf");
    if (anchors.length === 0) { unsupportedSourceIds.push(source.id); continue; }
    const runs = anchors.flatMap((anchor, index) => {
      const box = boxOf(anchor);
      if (!box) return [];
      const y = args.mode === "underUpper" ? box.min.y : args.mode === "plinthJoint" ? box.max.y : box.min.y;
      let points = args.mode === "plinthJoint" ? lineAtPlinthFront(box, y) : lineAtWallBack(box, y);
      if (args.mode === "underUpper" && args.offsetMm) points = offsetLedStripPolyline(points, args.offsetMm);
      return [{ id: `${source.id}-run${index + 1}`, points }];
    });
    if (runs.length === 0) { unsupportedSourceIds.push(source.id); continue; }
    const id = args.nextId();
    groups.push({ id, params: { name: `LED pásik ${groups.length + 1}`, mode: args.mode, heightMm: runs[0]!.points[0]!.y, offsetMm: args.offsetMm ?? 0, lightingComponentId: args.lightingComponentId ?? null, profileWidthMm: args.profileWidthMm ?? null }, runs });
  }
  return unsupportedSourceIds.length ? { groups: [], unsupportedSourceIds } : { groups, unsupportedSourceIds };
}
