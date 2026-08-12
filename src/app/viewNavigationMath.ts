import * as THREE from "three";

export const MIN_NAVIGATION_FOCUS_DISTANCE = 0.001;

const MAX_NORMALIZED_WHEEL_DELTA = 240;
// Revit's documented zoom commands use quarter-step increments.  Keeping the
// wheel on the same logarithmic scale makes one standard mouse notch stable at
// every camera distance, while trackpads remain continuous.
export const NAVIGATION_WHEEL_SCALE_PER_NOTCH = 1.25;
const WHEEL_DELTA_PER_NOTCH = 120;
const MAX_ORBIT_ELEVATION = Math.PI / 2 - THREE.MathUtils.degToRad(0.5);

export type NavigationViewport = {
  width: number;
  height: number;
};

export type NavigationPointerNdc = {
  x: number;
  y: number;
};

export type SemanticFocusPerspective = "front" | "back" | "left" | "right" | "top" | "isometric";

export function semanticFocusDirection(perspective: SemanticFocusPerspective) {
  if (perspective === "front") return new THREE.Vector3(0, 0, 1);
  if (perspective === "back") return new THREE.Vector3(0, 0, -1);
  if (perspective === "left") return new THREE.Vector3(-1, 0, 0);
  if (perspective === "right") return new THREE.Vector3(1, 0, 0);
  if (perspective === "top") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(1, 0.65, 1).normalize();
}

export function semanticPerspectiveFocusDistance(radius: number, fovDeg: number, padding = 1.2) {
  const safeRadius = Math.max(0.08, Number.isFinite(radius) ? radius : 0.08);
  const safeFov = THREE.MathUtils.clamp(Number.isFinite(fovDeg) ? fovDeg : 45, 1, 179);
  const safePadding = THREE.MathUtils.clamp(Number.isFinite(padding) ? padding : 1.2, 0.5, 3);
  return Math.max(
    MIN_NAVIGATION_FOCUS_DISTANCE * 2,
    safeRadius / Math.tan(THREE.MathUtils.degToRad(safeFov) / 2) * safePadding
  );
}

export function setViewCubeCssRotationMatrix(
  cameraQuaternion: THREE.Quaternion,
  target: THREE.Matrix4
) {
  target.makeRotationFromQuaternion(cameraQuaternion).invert();

  // Three.js uses +Y up, while CSS 3D uses +Y down. Conjugating the camera's
  // inverse rotation by that axis flip preserves a proper rotation and keeps
  // the cube aligned with the complete camera orientation, including roll.
  const elements = target.elements;
  elements[1] *= -1;
  elements[4] *= -1;
  elements[6] *= -1;
  elements[9] *= -1;
  return target;
}

export function viewCubeCssTransform(
  cameraQuaternion: THREE.Quaternion,
  target = new THREE.Matrix4()
) {
  const elements = setViewCubeCssRotationMatrix(cameraQuaternion, target).elements;
  const values = elements.map((value) => {
    if (Math.abs(value) < 1e-12) return "0";
    return String(Number(value.toFixed(12)));
  });
  return `matrix3d(${values.join(",")})`;
}

export function normalizeNavigationWheelDelta(
  deltaY: number,
  deltaMode = 0,
  viewportHeight = 800
) {
  const pixels = deltaMode === 1
    ? deltaY * 16
    : deltaMode === 2
      ? deltaY * Math.max(1, viewportHeight)
      : deltaY;
  return THREE.MathUtils.clamp(pixels, -MAX_NORMALIZED_WHEEL_DELTA, MAX_NORMALIZED_WHEEL_DELTA);
}

export function navigationWheelScale(deltaY: number) {
  return Math.pow(NAVIGATION_WHEEL_SCALE_PER_NOTCH, deltaY / WHEEL_DELTA_PER_NOTCH);
}

export function pointerNdcFromClient(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">
): NavigationPointerNdc {
  return {
    x: ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
    y: -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
  };
}

export function applyPerspectiveWheelZoom(
  camera: THREE.PerspectiveCamera,
  compatibilityTarget: THREE.Vector3,
  pointerNdc: NavigationPointerNdc,
  normalizedDeltaY: number,
  focusDistance: number,
  options: { lockFocus?: boolean } = {}
) {
  const currentDistance = Math.max(MIN_NAVIGATION_FOCUS_DISTANCE, focusDistance);
  const nextDistance = Math.max(
    MIN_NAVIGATION_FOCUS_DISTANCE,
    currentDistance * navigationWheelScale(normalizedDeltaY)
  );
  const scale = nextDistance / currentDistance;
  if (options.lockFocus) {
    // A selected object is the explicit orbit centre.  Never pass through it.
    const offset = camera.position.clone().sub(compatibilityTarget);
    if (offset.lengthSq() > 1e-12) {
      camera.position.copy(compatibilityTarget).addScaledVector(offset.normalize(), nextDistance);
      camera.lookAt(compatibilityTarget);
    }
  } else {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const rayDirection = new THREE.Vector3(pointerNdc.x, pointerNdc.y, 0.5)
      .unproject(camera)
      .sub(camera.position)
      .normalize();
    const denominator = rayDirection.dot(forward);
    // Intersect the cursor ray with the current focus plane.  Scaling camera
    // and focus around this anchor preserves the world point below the cursor.
    const anchor = compatibilityTarget.clone();
    if (Math.abs(denominator) > 1e-8) {
      const distanceAlongRay = compatibilityTarget.clone().sub(camera.position).dot(forward) / denominator;
      if (distanceAlongRay > 0) anchor.copy(camera.position).addScaledVector(rayDirection, distanceAlongRay);
    }
    camera.position.lerp(anchor, 1 - scale);
    compatibilityTarget.lerp(anchor, 1 - scale);
  }
  camera.updateMatrixWorld(true);
  return nextDistance;
}

export function applyOrthographicWheelZoom(
  camera: THREE.OrthographicCamera,
  compatibilityTarget: THREE.Vector3,
  pointerNdc: NavigationPointerNdc,
  normalizedDeltaY: number,
  focusDistance: number
) {
  const before = new THREE.Vector3(pointerNdc.x, pointerNdc.y, 0).unproject(camera);
  const scale = navigationWheelScale(normalizedDeltaY);
  camera.zoom = THREE.MathUtils.clamp(camera.zoom / scale, 1e-6, 1e6);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const after = new THREE.Vector3(pointerNdc.x, pointerNdc.y, 0).unproject(camera);
  const correction = before.sub(after);
  camera.position.add(correction);
  compatibilityTarget.add(correction);
  camera.updateMatrixWorld(true);
  return Math.max(MIN_NAVIGATION_FOCUS_DISTANCE, focusDistance * scale);
}

export function panCameraInViewPlane(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  compatibilityTarget: THREE.Vector3,
  deltaX: number,
  deltaY: number,
  focusDistance: number,
  viewport: NavigationViewport
) {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  let unitsPerPixelX: number;
  let unitsPerPixelY: number;

  if (camera instanceof THREE.PerspectiveCamera) {
    const visibleHeight = 2
      * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
      * Math.max(MIN_NAVIGATION_FOCUS_DISTANCE, focusDistance);
    unitsPerPixelY = visibleHeight / height;
    unitsPerPixelX = visibleHeight * camera.aspect / width;
  } else {
    const zoom = Math.max(1e-6, camera.zoom);
    unitsPerPixelX = (camera.right - camera.left) / (width * zoom);
    unitsPerPixelY = (camera.top - camera.bottom) / (height * zoom);
  }

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  const translation = right
    .multiplyScalar(-deltaX * unitsPerPixelX)
    .add(up.multiplyScalar(deltaY * unitsPerPixelY));
  camera.position.add(translation);
  compatibilityTarget.add(translation);
  camera.updateMatrixWorld(true);
  return translation;
}

export function orbitCameraAroundPivot(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  pivot: THREE.Vector3,
  deltaX: number,
  deltaY: number,
  viewportHeight: number,
  rotateSpeed = 0.85
) {
  const height = Math.max(1, viewportHeight);
  const offset = camera.position.clone().sub(pivot);
  if (offset.lengthSq() < 1e-12) return false;
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= Math.PI * 2 * deltaX / height * rotateSpeed;
  // Clamp polar angle, not the camera quaternion.  This remains well-defined
  // at a top/bottom view and lets the next vertical drag return to an axon.
  const minPolar = Math.PI / 2 - MAX_ORBIT_ELEVATION;
  spherical.phi = THREE.MathUtils.clamp(
    spherical.phi + Math.PI * 2 * deltaY / height * rotateSpeed,
    minPolar,
    Math.PI - minPolar
  );
  camera.position.copy(pivot).add(new THREE.Vector3().setFromSpherical(spherical));
  camera.up.set(0, 1, 0);
  camera.lookAt(pivot);
  camera.updateMatrixWorld(true);
  return true;
}
