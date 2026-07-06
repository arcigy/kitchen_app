import * as THREE from "three";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { createMaterialRequestFromCatalogMaterial } from "../core/catalog/material-render-request";
import { createModuleRuntimeCatalogContext } from "../modules/runtime/runtimeCatalog";
import {
  getKitchenWorktopCoveredPolygon,
  getKitchenWorktopPolygon,
  type KitchenWorktopCoveragePolygon
} from "../layout/worktopGeometry";
import type { KitchenWorktopParams } from "./localTypes";

type KitchenWorktopVisualOptions = {
  coveragePolygons?: KitchenWorktopCoveragePolygon[];
};

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

const unassignedWorktopColor = "#d4d8de";
const unassignedWorktopOutlineColor = 0x536173;

function resolveWorktopMaterial(materialId: string, catalog: ClientCatalog) {
  if (!materialId.trim()) return null;
  const ctx = createModuleRuntimeCatalogContext(catalog);
  const renderMaterial = ctx.resolveRenderMaterial(materialId, "worktop");
  const catalogMaterial = ctx.resolveMaterial(materialId, "worktop");
  return {
    ...renderMaterial,
    catalogMaterial: catalogMaterial ?? null
  };
}

export function makeKitchenWorktopMaterial(materialId: string, opts: { preview?: boolean; catalog: ClientCatalog }) {
  const resolved = resolveWorktopMaterial(materialId, opts.catalog);
  return new THREE.MeshStandardMaterial({
    color: resolved?.colorHex ?? unassignedWorktopColor,
    roughness: resolved?.roughness ?? 0.78,
    metalness: resolved?.metalness ?? 0.02,
    side: THREE.DoubleSide,
    transparent: !!opts?.preview,
    opacity: opts?.preview ? 0.52 : 1
  });
}

export function kitchenWorktopOutlineColor(materialId: string, catalog: ClientCatalog) {
  const resolved = resolveWorktopMaterial(materialId, catalog);
  if (resolved?.colorHex && /^#[0-9a-f]{6}$/i.test(resolved.colorHex)) {
    const color = new THREE.Color(resolved.colorHex);
    return color.clone().multiplyScalar(0.68).getHex();
  }
  return unassignedWorktopOutlineColor;
}

export function getKitchenWorktopMaterialMetadata(materialId: string, catalog: ClientCatalog) {
  const resolved = resolveWorktopMaterial(materialId, catalog);
  if (!resolved?.catalogMaterial) return null;
  return {
    catalogMaterialId: resolved.catalogMaterial.id,
    catalogMaterialName: resolved.catalogMaterial.displayName,
    materialRequest: createMaterialRequestFromCatalogMaterial(resolved.catalogMaterial)
  };
}

function getVisualWorktopPolygon(params: KitchenWorktopParams, opts?: KitchenWorktopVisualOptions) {
  return opts?.coveragePolygons?.length
    ? getKitchenWorktopCoveredPolygon(params, opts.coveragePolygons)
    : getKitchenWorktopPolygon(params);
}

export function makeKitchenWorktopGeometry(params: KitchenWorktopParams, opts?: KitchenWorktopVisualOptions) {
  const polygon = getVisualWorktopPolygon(params, opts);
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

export function makeKitchenWorktopPreviewGeometry(params: KitchenWorktopParams, opts?: KitchenWorktopVisualOptions) {
  const polygon = getVisualWorktopPolygon(params, opts);
  if (polygon.length < 3) return new THREE.PlaneGeometry(0.001, 0.001);

  const shape = new THREE.Shape(polygon.map((point) => new THREE.Vector2(point.x, point.z)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function makeKitchenWorktopOutlineGeometry(
  params: KitchenWorktopParams,
  flattenToPlan = true,
  opts?: KitchenWorktopVisualOptions
) {
  if (flattenToPlan) {
    const polygon = getVisualWorktopPolygon(params, opts);
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
