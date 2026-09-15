import * as THREE from "three";

/** Builder references are local to its root; the camera always sees world coordinates. */
export function projectModuleSettingsPoint(point: THREE.Vector3, camera: THREE.Camera,
  viewport: { width: number; height: number }, moduleRoot?: THREE.Object3D | null) {
  const world = moduleRoot ? moduleRoot.localToWorld(point.clone()) : point.clone();
  const projected = world.project(camera);
  return { x: (projected.x + 1) * viewport.width / 2, y: (1 - projected.y) * viewport.height / 2, z: projected.z };
}
