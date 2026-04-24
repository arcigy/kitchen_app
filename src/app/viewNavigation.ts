import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type NavigationViewMode = "3d" | "2d";
export type NavigationAppMode = "build" | "layout";

type NavigationState = {
  mode: NavigationAppMode;
  viewMode: NavigationViewMode;
  activeViewerTab: string;
};

type CreateViewNavigationArgs = {
  viewerEl: HTMLElement;
  canvasEl: HTMLCanvasElement;
  resetViewButton: HTMLButtonElement | null;
  getCamera: () => THREE.Camera;
  getControls: () => OrbitControls;
  getState: () => NavigationState;
  isTypingTarget: (target: EventTarget | null) => boolean;
  isInteractionBlocked: () => boolean;
  getSceneBounds: () => THREE.Box3;
  refreshDetailView: () => void;
};

const NAV_KEY_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
  "Space"
]);

const MIN_3D_DISTANCE = 0.18;
const MAX_3D_DISTANCE = 80;
const DEFAULT_3D_TARGET = new THREE.Vector3(0, 0.9, 0);
const DEFAULT_3D_DIRECTION = new THREE.Vector3(1, 0.65, 1).normalize();

export function createViewNavigation(args: CreateViewNavigationArgs) {
  const navKeys = new Set<string>();
  const detailViewPanOffset = new THREE.Vector3();
  const viewerFocusState = {
    hover: false,
    active: false
  };
  const detailPanState = {
    active: false,
    pointerId: null as number | null,
    lastClientX: 0,
    lastClientY: 0
  };
  const savedFloorplanView = {
    target: new THREE.Vector3(0, 0, 0),
    zoom: 1,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    near: 0.01,
    far: 200
  };
  const tmpVecA = new THREE.Vector3();
  const tmpVecB = new THREE.Vector3();
  const tmpVecC = new THREE.Vector3();
  const tmpSphere = new THREE.Sphere();

  const getControls = () => args.getControls();
  const getPerspectiveCamera = () => {
    const camera = args.getCamera();
    return camera instanceof THREE.PerspectiveCamera ? camera : null;
  };

  const stabilize3dCamera = () => {
    const camera = getPerspectiveCamera();
    if (!camera) return;
    const controls = getControls();
    const offset = tmpVecA.copy(camera.position).sub(controls.target);
    let distance = offset.length();

    if (!Number.isFinite(distance) || distance < 1e-6) {
      offset.copy(DEFAULT_3D_DIRECTION).multiplyScalar(MIN_3D_DISTANCE * 2.5);
      distance = offset.length();
    }

    if (distance < MIN_3D_DISTANCE) {
      offset.setLength(MIN_3D_DISTANCE);
      camera.position.copy(controls.target).add(offset);
      distance = MIN_3D_DISTANCE;
    }

    controls.minDistance = MIN_3D_DISTANCE;
    controls.maxDistance = MAX_3D_DISTANCE;
    camera.near = Math.max(0.01, Math.min(0.08, distance / 80));
    camera.far = Math.max(120, distance * 120);
    camera.updateProjectionMatrix();
  };

  const syncControls = () => {
    const { viewMode, activeViewerTab } = args.getState();
    const controls = getControls();
    const isFloorplanView = viewMode === "2d" && activeViewerTab === "floorplan";

    if (viewMode === "3d") {
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.screenSpacePanning = false;
      controls.enableRotate = true;
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.rotateSpeed = 0.85;
      controls.panSpeed = 0.9;
      controls.zoomSpeed = 0.95;
      (controls as OrbitControls & { zoomToCursor?: boolean }).zoomToCursor = false;
      (controls as OrbitControls & { minTargetRadius?: number }).minTargetRadius = 0;
      (controls as OrbitControls & { maxTargetRadius?: number }).maxTargetRadius = Infinity;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      };
      stabilize3dCamera();
      controls.update();
      return;
    }

    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.enableRotate = false;
    controls.enableZoom = true;
    controls.enablePan = isFloorplanView;
    controls.zoomSpeed = 1;
    controls.panSpeed = 1;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: isFloorplanView ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.ROTATE
    };
    (controls as OrbitControls & { zoomToCursor?: boolean }).zoomToCursor = true;
    controls.update();
  };

  const captureFloorplanView = () => {
    const camera = args.getCamera();
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const controls = getControls();
    savedFloorplanView.target.copy(controls.target);
    savedFloorplanView.zoom = camera.zoom;
    savedFloorplanView.left = camera.left;
    savedFloorplanView.right = camera.right;
    savedFloorplanView.top = camera.top;
    savedFloorplanView.bottom = camera.bottom;
    savedFloorplanView.near = camera.near;
    savedFloorplanView.far = camera.far;
  };

  const restoreFloorplanView = () => {
    const camera = args.getCamera();
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const controls = getControls();
    camera.up.set(0, 0, -1);
    if (savedFloorplanView.right !== savedFloorplanView.left) {
      camera.left = savedFloorplanView.left;
      camera.right = savedFloorplanView.right;
      camera.top = savedFloorplanView.top;
      camera.bottom = savedFloorplanView.bottom;
    }
    camera.near = savedFloorplanView.near;
    camera.far = savedFloorplanView.far;
    camera.zoom = savedFloorplanView.zoom;
    controls.target.copy(savedFloorplanView.target);
    camera.position.set(savedFloorplanView.target.x, 10, savedFloorplanView.target.z);
    camera.lookAt(savedFloorplanView.target.x, 0, savedFloorplanView.target.z);
    camera.updateProjectionMatrix();
    controls.update();
  };

  const panDetailViewByPixels = (deltaX: number, deltaY: number) => {
    const camera = args.getCamera();
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const rect = args.canvasEl.getBoundingClientRect();
    const zoom = Math.max(0.0001, camera.zoom);
    const unitsPerPixelX = (camera.right - camera.left) / (rect.width * zoom);
    const unitsPerPixelY = (camera.top - camera.bottom) / (rect.height * zoom);
    camera.getWorldDirection(tmpVecA);
    const up = tmpVecB.copy(camera.up).normalize();
    const right = tmpVecC.copy(tmpVecA).cross(up).normalize();
    const pan = right.multiplyScalar(-deltaX * unitsPerPixelX).add(up.multiplyScalar(deltaY * unitsPerPixelY));
    detailViewPanOffset.add(pan);
    camera.position.add(pan);
    getControls().target.add(pan);
    camera.updateProjectionMatrix();
    getControls().update();
  };

  const reset3dView = () => {
    const camera = getPerspectiveCamera();
    if (!camera) return;
    const controls = getControls();
    const bounds = args.getSceneBounds();

    if (bounds.isEmpty()) {
      controls.target.copy(DEFAULT_3D_TARGET);
      camera.position.copy(DEFAULT_3D_TARGET).addScaledVector(DEFAULT_3D_DIRECTION, 3.2);
      stabilize3dCamera();
      controls.update();
      return;
    }

    bounds.getBoundingSphere(tmpSphere);
    const radius = Math.max(tmpSphere.radius, 0.35);
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const distance = Math.max(MIN_3D_DISTANCE * 2, (radius / Math.tan(fovRad / 2)) * 1.2);

    controls.target.copy(tmpSphere.center);
    camera.position.copy(tmpSphere.center).addScaledVector(DEFAULT_3D_DIRECTION, distance);
    stabilize3dCamera();
    controls.update();
  };

  const resetView = () => {
    const state = args.getState();
    detailViewPanOffset.set(0, 0, 0);
    if (state.viewMode === "3d") {
      reset3dView();
      return;
    }
    if (state.activeViewerTab === "floorplan") {
      restoreFloorplanView();
      return;
    }
    args.refreshDetailView();
  };

  const shouldAcceptKeyboardNav = () => {
    if (args.isInteractionBlocked()) return false;
    return viewerFocusState.hover || viewerFocusState.active || document.activeElement === args.canvasEl;
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.defaultPrevented) return;
    if (!NAV_KEY_CODES.has(ev.code)) return;
    if (args.isTypingTarget(ev.target) && ev.code !== "Space") return;
    if (!shouldAcceptKeyboardNav()) return;
    navKeys.add(ev.code);
    if (ev.code === "Space") ev.preventDefault();
  };

  const onKeyUp = (ev: KeyboardEvent) => {
    navKeys.delete(ev.code);
  };

  const onBlur = () => {
    navKeys.clear();
    detailPanState.active = false;
    detailPanState.pointerId = null;
  };

  const handlePointerDown = (ev: PointerEvent) => {
    viewerFocusState.active = true;
    if (ev.button !== 1) return false;
    const { mode, viewMode, activeViewerTab } = args.getState();
    if (mode !== "layout" || viewMode !== "2d" || activeViewerTab === "floorplan") return false;
    detailPanState.active = true;
    detailPanState.pointerId = ev.pointerId;
    detailPanState.lastClientX = ev.clientX;
    detailPanState.lastClientY = ev.clientY;
    try {
      args.canvasEl.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
    return true;
  };

  const handlePointerMove = (ev: PointerEvent) => {
    if (!detailPanState.active || detailPanState.pointerId !== ev.pointerId) return false;
    const deltaX = ev.clientX - detailPanState.lastClientX;
    const deltaY = ev.clientY - detailPanState.lastClientY;
    detailPanState.lastClientX = ev.clientX;
    detailPanState.lastClientY = ev.clientY;
    panDetailViewByPixels(deltaX, deltaY);
    return true;
  };

  const handlePointerUp = (ev: PointerEvent) => {
    if (!detailPanState.active || detailPanState.pointerId !== ev.pointerId) return false;
    detailPanState.active = false;
    detailPanState.pointerId = null;
    try {
      args.canvasEl.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
    return true;
  };

  const update = (dt: number) => {
    if (navKeys.size === 0) return;
    if (!shouldAcceptKeyboardNav()) return;

    const state = args.getState();
    const shift = navKeys.has("ShiftLeft") || navKeys.has("ShiftRight");
    const space = navKeys.has("Space");
    let speedMult = 1;
    if (shift && space) speedMult = 4;
    else if (shift) speedMult = 2.4;
    else if (space) speedMult = 0.35;

    const xAxis = (navKeys.has("KeyD") ? 1 : 0) - (navKeys.has("KeyA") ? 1 : 0);
    const zAxis = (navKeys.has("KeyW") ? 1 : 0) - (navKeys.has("KeyS") ? 1 : 0);
    const yAxis = (navKeys.has("KeyQ") ? 1 : 0) - (navKeys.has("KeyE") ? 1 : 0);
    if (xAxis === 0 && zAxis === 0 && yAxis === 0) return;

    const controls = getControls();
    const camera = args.getCamera();

    if (state.viewMode === "2d") {
      const baseSpeed = 1.8;
      tmpVecA.set(xAxis, 0, -zAxis);
      if (tmpVecA.lengthSq() > 1) tmpVecA.normalize();
      tmpVecA.multiplyScalar(baseSpeed * speedMult * dt);
      camera.position.add(tmpVecA);
      controls.target.add(tmpVecA);
      controls.update();
      return;
    }

    const perspectiveCamera = getPerspectiveCamera();
    if (!perspectiveCamera) return;

    const orbitDistance = perspectiveCamera.position.distanceTo(controls.target);
    const baseSpeed = THREE.MathUtils.clamp(orbitDistance * 1.6, 0.8, 8);

    tmpVecA.set(0, 0, -1).applyQuaternion(perspectiveCamera.quaternion);
    tmpVecA.y = 0;
    if (tmpVecA.lengthSq() < 1e-8) tmpVecA.set(0, 0, -1);
    tmpVecA.normalize();

    tmpVecB.copy(tmpVecA).cross(new THREE.Vector3(0, 1, 0)).normalize();
    tmpVecC.set(0, 0, 0);
    if (xAxis) tmpVecC.addScaledVector(tmpVecB, xAxis);
    if (zAxis) tmpVecC.addScaledVector(tmpVecA, zAxis);
    if (yAxis) tmpVecC.addScaledVector(new THREE.Vector3(0, 1, 0), yAxis);
    if (tmpVecC.lengthSq() > 1) tmpVecC.normalize();
    tmpVecC.multiplyScalar(baseSpeed * speedMult * dt);

    perspectiveCamera.position.add(tmpVecC);
    controls.target.add(tmpVecC);
    stabilize3dCamera();
    controls.update();
  };

  args.viewerEl.addEventListener("pointerenter", () => {
    viewerFocusState.hover = true;
  });
  args.viewerEl.addEventListener("pointerleave", () => {
    viewerFocusState.hover = false;
  });
  args.canvasEl.tabIndex = args.canvasEl.tabIndex >= 0 ? args.canvasEl.tabIndex : 0;
  args.canvasEl.addEventListener("pointerdown", () => {
    viewerFocusState.active = true;
    args.canvasEl.focus({ preventScroll: true });
  });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  args.resetViewButton?.addEventListener("click", resetView);

  return {
    detailViewPanOffset,
    syncControls,
    captureFloorplanView,
    restoreFloorplanView,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    update,
    resetView
  };
}
