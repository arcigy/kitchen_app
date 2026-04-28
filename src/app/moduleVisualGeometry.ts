import * as THREE from "three";
import {
  getModulePlanLocalPolygon,
  getModulePlanLocalRect,
  getModulePlanPolygon
} from "./planSnap";
import type { LayoutInstance } from "./localTypes";

type BackCenterResolver = (inst: LayoutInstance) => THREE.Vector3;

export function moduleRootLocalBox(root: THREE.Object3D, module: THREE.Object3D) {
  root.updateMatrixWorld(true);
  module.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  const childBox = new THREE.Box3();
  const relativeMatrix = new THREE.Matrix4();
  module.traverse((obj) => {
    const geometry = (obj as THREE.Mesh | THREE.LineSegments).geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    relativeMatrix.multiplyMatrices(rootInverse, obj.matrixWorld);
    childBox.copy(geometry.boundingBox).applyMatrix4(relativeMatrix);
    box.union(childBox);
  });
  return box;
}

export function instanceVisualWorldBox(inst: LayoutInstance) {
  inst.root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(inst.module);
}

export function instanceLayoutWorldBox(inst: LayoutInstance, getModuleLocalBackCenter: BackCenterResolver) {
  const visualBox = instanceVisualWorldBox(inst);
  const polygon = getModulePlanPolygon(inst, getModuleLocalBackCenter);
  if (polygon.length === 0) return visualBox;
  const xs = polygon.map((point) => point.x);
  const zs = polygon.map((point) => point.z);
  return new THREE.Box3(
    new THREE.Vector3(Math.min(...xs), visualBox.min.y, Math.min(...zs)),
    new THREE.Vector3(Math.max(...xs), visualBox.max.y, Math.max(...zs))
  );
}

export function footprintExtentsMatchXZ(a: THREE.Box3, b: THREE.Box3, eps = 1e-6) {
  return (
    Math.abs((a.max.x - a.min.x) - (b.max.x - b.min.x)) <= eps &&
    Math.abs((a.max.z - a.min.z) - (b.max.z - b.min.z)) <= eps
  );
}

export function buildModulePlanPickGeometry(polygon: THREE.Vector3[]) {
  const shape = new THREE.Shape();
  polygon.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.z);
    else shape.lineTo(point.x, point.z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

export function buildModuleEdgeGeometry(inst: LayoutInstance, flattenToPlan: boolean, getModuleLocalBackCenter: BackCenterResolver) {
  if (flattenToPlan) {
    const polygon = getModulePlanLocalPolygon(inst, getModuleLocalBackCenter);
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index]!;
      const b = polygon[(index + 1) % polygon.length]!;
      points.push(new THREE.Vector3(a.x, 0.01, a.z), new THREE.Vector3(b.x, 0.01, b.z));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  inst.root.updateMatrixWorld(true);
  inst.module.updateMatrixWorld(true);

  const rootInv = inst.root.matrixWorld.clone().invert();
  const points: THREE.Vector3[] = [];
  const seen = new Set<string>();

  const pushSegment = (a: THREE.Vector3, b: THREE.Vector3) => {
    const ay = flattenToPlan ? 0.01 : a.y;
    const by = flattenToPlan ? 0.01 : b.y;
    const aa = new THREE.Vector3(a.x, ay, a.z);
    const bb = new THREE.Vector3(b.x, by, b.z);

    const ax = Math.round(aa.x * 10000);
    const ayi = Math.round(aa.y * 10000);
    const az = Math.round(aa.z * 10000);
    const bx = Math.round(bb.x * 10000);
    const byi = Math.round(bb.y * 10000);
    const bz = Math.round(bb.z * 10000);
    const same = ax === bx && ayi === byi && az === bz;
    if (same) return;

    const key =
      ax < bx || (ax === bx && (ayi < byi || (ayi === byi && az <= bz)))
        ? `${ax},${ayi},${az}|${bx},${byi},${bz}`
        : `${bx},${byi},${bz}|${ax},${ayi},${az}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push(aa, bb);
  };

  inst.module.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const edgeGeom = new THREE.EdgesGeometry(mesh.geometry as THREE.BufferGeometry, 1);
    const pos = edgeGeom.getAttribute("position");
    const toRoot = rootInv.clone().multiply(mesh.matrixWorld);

    for (let i = 0; i < pos.count; i += 2) {
      const a = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(toRoot);
      const b = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)).applyMatrix4(toRoot);
      if (flattenToPlan) {
        if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-5) continue;
      } else {
        if (a.distanceToSquared(b) < 1e-10) continue;
      }
      pushSegment(a, b);
    }

    edgeGeom.dispose();
  });

  if (points.length === 0) {
    const min = inst.localBox.min;
    const max = inst.localBox.max;
    const y = flattenToPlan ? 0.01 : min.y;
    if (flattenToPlan) {
      points.push(
        new THREE.Vector3(min.x, y, min.z),
        new THREE.Vector3(max.x, y, min.z),
        new THREE.Vector3(max.x, y, min.z),
        new THREE.Vector3(max.x, y, max.z),
        new THREE.Vector3(max.x, y, max.z),
        new THREE.Vector3(min.x, y, max.z),
        new THREE.Vector3(min.x, y, max.z),
        new THREE.Vector3(min.x, y, min.z)
      );
    } else {
      const corners = [
        new THREE.Vector3(min.x, min.y, min.z),
        new THREE.Vector3(max.x, min.y, min.z),
        new THREE.Vector3(max.x, min.y, max.z),
        new THREE.Vector3(min.x, min.y, max.z),
        new THREE.Vector3(min.x, max.y, min.z),
        new THREE.Vector3(max.x, max.y, min.z),
        new THREE.Vector3(max.x, max.y, max.z),
        new THREE.Vector3(min.x, max.y, max.z)
      ];
      const edges: Array<[number, number]> = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
      ];
      for (const [i0, i1] of edges) points.push(corners[i0], corners[i1]);
    }
  }

  return new THREE.BufferGeometry().setFromPoints(points);
}

export function ensurePickAndOutline(
  inst: LayoutInstance,
  opts: {
    flattenToPlan: boolean;
    viewMode: "2d" | "3d";
    getModuleLocalBackCenter: BackCenterResolver;
  }
) {
  const polygon = getModulePlanLocalPolygon(inst, opts.getModuleLocalBackCenter);
  const bounds = getModulePlanLocalRect(inst, opts.getModuleLocalBackCenter);
  const xs = bounds.map((point) => point.x);
  const zs = bounds.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  inst.pick.geometry.dispose();
  if (opts.flattenToPlan) {
    inst.pick.geometry = buildModulePlanPickGeometry(polygon);
    inst.pick.position.set(0, 0.015, 0);
    inst.pick.rotation.set(0, 0, 0);
  } else {
    const width = Math.max(0.001, maxX - minX);
    const depth = Math.max(0.001, maxZ - minZ);
    inst.pick.geometry = new THREE.BoxGeometry(width, 0.03, depth);
    inst.pick.position.set((minX + maxX) * 0.5, 0.015, (minZ + maxZ) * 0.5);
    inst.pick.rotation.set(0, 0, 0);
  }
  inst.pick.visible = true;

  const pickMaterial = inst.pick.material as THREE.MeshBasicMaterial;
  pickMaterial.transparent = true;
  pickMaterial.depthWrite = false;
  pickMaterial.depthTest = false;
  pickMaterial.color.setHex(0xc5cfdb);
  pickMaterial.opacity = opts.viewMode === "2d" ? 0.18 : 0;

  const geometry = buildModuleEdgeGeometry(inst, opts.flattenToPlan, opts.getModuleLocalBackCenter);
  inst.outline.geometry.dispose();
  inst.outline.geometry = geometry;
  inst.outline.position.set(0, 0, 0);
}

export function tagModuleGeometry(module: THREE.Object3D, instanceId: string) {
  module.userData.kind = "module";
  module.userData.instanceId = instanceId;
  module.traverse((obj: any) => {
    obj.userData.kind = "module";
    obj.userData.instanceId = instanceId;
  });
}

export function getInstanceGeometryMeshes(inst: LayoutInstance, viewMode: "2d" | "3d") {
  if (viewMode === "2d") return [inst.pick];
  const meshes: THREE.Mesh[] = [];
  inst.module.traverse((obj: any) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    meshes.push(mesh);
  });
  return meshes;
}
