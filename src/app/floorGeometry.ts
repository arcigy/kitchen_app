import * as THREE from "three";
import type { FloorParams } from "./localTypes";

export function cloneFloorParams(params: FloorParams, defaultMaterialId: string): FloorParams {
  return {
    name: params.name,
    heightMm: params.heightMm,
    thicknessMm: params.thicknessMm,
    materialId: params.materialId ?? defaultMaterialId,
    boundary: params.boundary.map((point) => ({ x: point.x, z: point.z }))
  };
}

export function floorMaterialColor(materialId: string) {
  if (materialId === "mat_oak_natural" || materialId === "mat_worktop_oak") return 0xb98755;
  if (materialId === "mat_white_melamine") return 0xf1f3f5;
  return 0x9aa3af;
}

export function makeFloorGeometry(params: FloorParams) {
  const points = params.boundary;
  if (points.length < 3) return new THREE.BoxGeometry(0.001, 0.001, 0.001);

  const shape = new THREE.Shape(points.map((point) => new THREE.Vector2(point.x / 1000, point.z / 1000)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, params.thicknessMm) / 1000,
    bevelEnabled: false
  });
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

export function makeFloorOutlineGeometry(params: FloorParams) {
  if (params.boundary.length === 0) {
    return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  }

  const y = params.heightMm / 1000 + 0.012;
  const points = params.boundary.map((point) => new THREE.Vector3(point.x / 1000, y, point.z / 1000));
  points.push(new THREE.Vector3(params.boundary[0].x / 1000, y, params.boundary[0].z / 1000));
  return new THREE.BufferGeometry().setFromPoints(points);
}
