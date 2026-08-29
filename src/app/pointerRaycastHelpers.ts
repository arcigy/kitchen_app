import * as THREE from "three";

export function intersectRayPlane(raycaster: THREE.Raycaster, plane: THREE.Plane): THREE.Vector3 | null {
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, point) ? point : null;
}
