import * as THREE from "three";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { getKitchenWorktopPolygon } from "../layout/worktopGeometry";
import type { KitchenWorktopParams } from "./localTypes";

export function cloneKitchenWorktopParams(params: KitchenWorktopParams): KitchenWorktopParams {
  return {
    path: params.path.map((point) => ({ x: point.x, z: point.z })),
    justification: params.justification,
    mirrored: !!params.mirrored,
    depthMm: params.depthMm,
    thicknessMm: params.thicknessMm,
    heightMm: params.heightMm,
    overhangSideMm: params.overhangSideMm,
    materialId: params.materialId
  };
}

function getCatalogMaterialPreview(materialId: string, catalog: ClientCatalog) {
  return catalog.materials.find((material) => material.id === materialId)?.preview ?? null;
}

export function makeKitchenWorktopMaterial(materialId: string, opts: { preview?: boolean; catalog: ClientCatalog }) {
  const preview = getCatalogMaterialPreview(materialId, opts.catalog);
  return new THREE.MeshStandardMaterial({
    color: preview?.colorHex ?? "#b08e6d",
    roughness: preview?.roughness ?? 0.78,
    metalness: preview?.metalness ?? 0.02,
    side: THREE.DoubleSide,
    transparent: !!opts?.preview,
    opacity: opts?.preview ? 0.52 : 1
  });
}

export function kitchenWorktopOutlineColor(materialId: string, catalog: ClientCatalog) {
  const color = new THREE.Color(getCatalogMaterialPreview(materialId, catalog)?.colorHex ?? "#b08e6d");
  return color.offsetHSL(0, 0, -0.24).getHex();
}

export function makeKitchenWorktopGeometry(params: KitchenWorktopParams) {
  const polygon = getKitchenWorktopPolygon(params);
  if (polygon.length < 3) return new THREE.BoxGeometry(0.001, 0.001, 0.001);

  const shape = new THREE.Shape(polygon.map((point) => new THREE.Vector2(point.x, point.z)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, params.thicknessMm) / 1000,
    bevelEnabled: false
  });
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function makeKitchenWorktopPreviewGeometry(params: KitchenWorktopParams) {
  const polygon = getKitchenWorktopPolygon(params);
  if (polygon.length < 3) return new THREE.PlaneGeometry(0.001, 0.001);

  const shape = new THREE.Shape(polygon.map((point) => new THREE.Vector2(point.x, point.z)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function makeKitchenWorktopOutlineGeometry(params: KitchenWorktopParams, flattenToPlan = true) {
  if (flattenToPlan) {
    const polygon = getKitchenWorktopPolygon(params);
    if (polygon.length === 0) {
      return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    }

    const points = polygon.map((point) => new THREE.Vector3(point.x, 0.012, point.z));
    points.push(points[0]!.clone());
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  const geometry = makeKitchenWorktopGeometry(params);
  const edges = new THREE.EdgesGeometry(geometry, 1);
  geometry.dispose();
  return edges;
}

export function makeKitchenWorktopBackGuideGeometry(params: KitchenWorktopParams, guidePath: THREE.Vector3[]) {
  if (guidePath.length < 2) {
    return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  }

  return new THREE.BufferGeometry().setFromPoints(guidePath.map((point) => new THREE.Vector3(point.x, 0.018, point.z)));
}
