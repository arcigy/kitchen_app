import * as THREE from "three";
import type { GrainAlong, OverlapRow } from "../ui/createPartPanel";
import { computeMeshVolumeOverlaps } from "../geometry/meshOverlap";
import { SNAP_DISTANCE_M } from "./snapToolProfiles";

export function copyM16(out: Float32Array, m: THREE.Matrix4) {
  const e = m.elements;
  for (let i = 0; i < 16; i++) out[i] = e[i];
}

export function matrixChanged(a: Float32Array, m: THREE.Matrix4) {
  const e = m.elements;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(a[i] - e[i]) > 1e-7) return true;
  }
  return false;
}

export function planarDistanceMm(a: THREE.Vector3, b: THREE.Vector3) {
  const dx = (b.x - a.x) * 1000;
  const dz = (b.z - a.z) * 1000;
  return Math.hypot(dx, dz);
}

export function axisLockXZ(a: THREE.Vector3, b: THREE.Vector3) {
  const dx = Math.abs(b.x - a.x);
  const dz = Math.abs(b.z - a.z);
  if (dx >= dz) return new THREE.Vector3(b.x, b.y, a.z);
  return new THREE.Vector3(a.x, b.y, b.z);
}

export function pickSurfacePoint(raycaster: THREE.Raycaster, meshes: THREE.Mesh[]) {
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) return null;
  const h = hits[0];
  return { point: h.point.clone(), object: h.object as THREE.Mesh };
}

export function snapPointXZ(
  point: THREE.Vector3,
  mesh: THREE.Mesh,
  threshold: number = SNAP_DISTANCE_M.legacySurfaceMeasure
): { point: THREE.Vector3; kind: "free" | "edge" | "corner" } {
  const box = new THREE.Box3().setFromObject(mesh);

  const cornerCount = 4;
  const candidates = [
    new THREE.Vector3(box.min.x, point.y, box.min.z),
    new THREE.Vector3(box.min.x, point.y, box.max.z),
    new THREE.Vector3(box.max.x, point.y, box.min.z),
    new THREE.Vector3(box.max.x, point.y, box.max.z),
    new THREE.Vector3(box.min.x, point.y, clamp(point.z, box.min.z, box.max.z)),
    new THREE.Vector3(box.max.x, point.y, clamp(point.z, box.min.z, box.max.z)),
    new THREE.Vector3(clamp(point.x, box.min.x, box.max.x), point.y, box.min.z),
    new THREE.Vector3(clamp(point.x, box.min.x, box.max.x), point.y, box.max.z)
  ];

  let best = point.clone();
  let bestD = Infinity;
  let bestIdx = -1;
  for (let idx = 0; idx < candidates.length; idx++) {
    const c = candidates[idx];
    const d = Math.hypot(c.x - point.x, c.z - point.z);
    if (d < bestD) {
      bestD = d;
      best = c;
      bestIdx = idx;
    }
  }

  if (bestD > threshold) return { point: point.clone(), kind: "free" };
  return { point: best, kind: bestIdx >= 0 && bestIdx < cornerCount ? "corner" : "edge" };
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function pointInPolygonXZ(point: { x: number; z: number }, polygon: Array<{ x: number; z: number }>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const denominator = b.z - a.z || Number.EPSILON;
    const intersects = a.z > point.z !== b.z > point.z && point.x < ((b.x - a.x) * (point.z - a.z)) / denominator + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function formatMm(v: THREE.Vector3) {
  return `${Math.round(v.x * 1000)}, ${Math.round(v.z * 1000)}`;
}

export function worldToScreen(world: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) {
  const p = world.clone().project(camera);
  return new THREE.Vector2(
    (p.x * 0.5 + 0.5) * rect.width,
    (-p.y * 0.5 + 0.5) * rect.height
  );
}

export function getSelectableMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData?.selectable !== true) return;
    if (typeof m.name !== "string" || m.name.length === 0) return;
    meshes.push(m);
  });
  return meshes;
}

export function findSelectableMeshByName(root: THREE.Object3D, name: string): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (found) return;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.name !== name) return;
    if (m.userData?.selectable !== true) return;
    found = m;
  });
  return found;
}

export function readDimensionsMm(mesh: THREE.Mesh) {
  const d = mesh.userData?.dimensionsMm as { width: number; height: number; depth: number } | undefined;
  if (d && Number.isFinite(d.width) && Number.isFinite(d.height) && Number.isFinite(d.depth)) return d;

  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  return { width: size.x * 1000, height: size.y * 1000, depth: size.z * 1000 };
}

export function readGrainAlong(mesh: THREE.Mesh): GrainAlong {
  const raw = mesh.userData?.grainAlong;
  if (raw === "width" || raw === "height" || raw === "depth" || raw === "none") return raw;
  return "none";
}

export function computeGrainArrow(mesh: THREE.Mesh): { origin: THREE.Vector3; dir: THREE.Vector3; length: number } | null {
  const grainAlong = readGrainAlong(mesh);
  if (grainAlong === "none") return null;
  const n = mesh.name ?? "";
  if (n.includes("hinge") || n.startsWith("leg")) return null;

  const localAxis =
    grainAlong === "width"
      ? new THREE.Vector3(1, 0, 0)
      : grainAlong === "height"
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);

  const q = new THREE.Quaternion();
  mesh.getWorldQuaternion(q);

  const dir = localAxis.applyQuaternion(q).normalize();
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const origin = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const length = Math.max(0.08, Math.min(0.35, maxDim * 0.7));
  return { origin, dir, length };
}

export function toggleSelectedPbr(mesh: THREE.Mesh, kind: "all" | "normal" | "roughness") {
  const matAny = mesh.material as unknown;
  if (!(matAny instanceof THREE.MeshStandardMaterial)) return;

  const mat = matAny as THREE.MeshStandardMaterial;

  if (mesh.userData?.__pbrMaterialCloned !== true) {
    mesh.material = mat.clone();
    mesh.userData.__pbrMaterialCloned = true;
    return toggleSelectedPbr(mesh, kind);
  }

  const m = mesh.material as THREE.MeshStandardMaterial;
  const backup = (m.userData.__pbrBackup as
    | { map: THREE.Texture | null; normalMap: THREE.Texture | null; roughnessMap: THREE.Texture | null }
    | undefined) ?? { map: m.map ?? null, normalMap: m.normalMap ?? null, roughnessMap: m.roughnessMap ?? null };
  m.userData.__pbrBackup = backup;

  const toggle = (key: "map" | "normalMap" | "roughnessMap") => {
    m[key] = m[key] ? null : backup[key];
  };

  if (kind === "all") {
    const anyOn = Boolean(m.map || m.normalMap || m.roughnessMap);
    m.map = anyOn ? null : backup.map;
    m.normalMap = anyOn ? null : backup.normalMap;
    m.roughnessMap = anyOn ? null : backup.roughnessMap;
  } else if (kind === "normal") {
    toggle("normalMap");
  } else if (kind === "roughness") {
    toggle("roughnessMap");
  }

  m.needsUpdate = true;
}

export function computeOverlaps(root: THREE.Object3D): OverlapRow[] {
  const meshes = getSelectableMeshes(root).filter((m) => {
    const n = m.name ?? "";
    if (n.includes("hinge")) return false;
    if (n.startsWith("leg")) return false;
    return true;
  });

  const meshByName = new Map(meshes.map((mesh) => [mesh.name, mesh]));
  const out: OverlapRow[] = computeMeshVolumeOverlaps(meshes, { toleranceMm: 2 }).map((overlap) => {
    const a = meshByName.get(overlap.a);
    const b = meshByName.get(overlap.b);
    const aAllow = (a?.userData?.allowOverlapWith as string[] | undefined) ?? [];
    const bAllow = (b?.userData?.allowOverlapWith as string[] | undefined) ?? [];
    const allowed = aAllow.includes(overlap.b) || bAllow.includes(overlap.a);
    const reason =
      (a?.userData?.allowOverlapReason as string | undefined) ?? (b?.userData?.allowOverlapReason as string | undefined);
    return {
      ...overlap,
      status: allowed ? "allowed" : "error",
      reason: allowed ? reason ?? "whitelisted overlap" : undefined
    };
  });

  out.sort((x, y) => (x.status === y.status ? y.volumeMm3 - x.volumeMm3 : x.status === "error" ? -1 : 1));
  return out.slice(0, 40);
}

export function renderErrors(el: HTMLElement, errors: string[]) {
  if (errors.length === 0) {
    el.classList.remove("visible");
    el.innerHTML = "";
    return;
  }

  el.classList.add("visible");
  el.innerHTML = `<ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`;
}

export function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
