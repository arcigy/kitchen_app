import * as THREE from "three";

export function resolveNormalGuideCore(
  a: THREE.Vector3,
  b: THREE.Vector3
): { anchor: THREE.Vector3; direction: THREE.Vector3; spanM: number } | null {
  const baseDir = b.clone().sub(a).setY(0);
  if (baseDir.lengthSq() <= 1e-10) return null;

  baseDir.normalize();
  const direction = new THREE.Vector3(-baseDir.z, 0, baseDir.x).normalize();
  const spanM = Math.max(4, Math.min(30, a.distanceTo(b) * 6));
  return { anchor: a, direction, spanM };
}

export function resolveNormalGuideSegment(
  a: THREE.Vector3,
  b: THREE.Vector3
): { a: THREE.Vector3; b: THREE.Vector3 } | null {
  const guide = resolveNormalGuideCore(a, b);
  if (!guide) return null;

  return {
    a: guide.anchor.clone().addScaledVector(guide.direction, -guide.spanM / 2),
    b: guide.anchor.clone().addScaledVector(guide.direction, guide.spanM / 2)
  };
}
