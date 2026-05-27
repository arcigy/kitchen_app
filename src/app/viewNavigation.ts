import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type NavigationViewMode = "3d" | "2d";
export type NavigationAppMode = "build" | "layout";

type NavigationState = {
  mode: NavigationAppMode;
  viewMode: NavigationViewMode;
  activeViewerTab: string;
};

type NavigationViewerToolMode = "select" | "pan" | "zoom-in" | "zoom-out" | "orbit" | "fit";

type CreateViewNavigationArgs = {
  viewerEl: HTMLElement;
  canvasEl: HTMLCanvasElement;
  resetViewButton: HTMLButtonElement | null;
  getCamera: () => THREE.Camera;
  getControls: () => OrbitControls;
  getState: () => NavigationState;
  getViewerToolMode?: () => NavigationViewerToolMode;
  setViewerPanActive?: (active: boolean) => void;
  isTypingTarget: (target: EventTarget | null) => boolean;
  isInteractionBlocked: () => boolean;
  getSceneBounds: () => THREE.Box3;
  refreshDetailView: () => void;
  activate3dView?: () => void;
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
type ViewCubeFace = "top" | "bottom" | "front" | "back" | "right" | "left";

const VIEW_CUBE_DIRECTIONS: Record<ViewCubeFace, THREE.Vector3> = {
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0)
};

const VIEW_CUBE_UP: Record<ViewCubeFace, THREE.Vector3> = {
  top: new THREE.Vector3(0, 0, -1),
  bottom: new THREE.Vector3(0, 0, 1),
  front: new THREE.Vector3(0, 1, 0),
  back: new THREE.Vector3(0, 1, 0),
  right: new THREE.Vector3(0, 1, 0),
  left: new THREE.Vector3(0, 1, 0)
};

const VIEW_CUBE_EXACT_TRANSFORMS: Record<ViewCubeFace, string> = {
  top: "rotateX(-58deg) rotateY(-40deg)",
  bottom: "rotateX(58deg) rotateY(-40deg)",
  front: "rotateX(-36deg) rotateY(-40deg)",
  back: "rotateX(-36deg) rotateY(140deg)",
  right: "rotateX(-36deg) rotateY(-130deg)",
  left: "rotateX(-36deg) rotateY(50deg)"
};

const isViewCubeFace = (value: string | undefined): value is ViewCubeFace =>
  value === "top" ||
  value === "bottom" ||
  value === "front" ||
  value === "back" ||
  value === "right" ||
  value === "left";

const parseViewCubeTarget = (value: string | undefined): ViewCubeFace[] | null => {
  const parts = value?.split("-").filter(isViewCubeFace) ?? [];
  return parts.length > 0 && parts.length <= 3 ? parts : null;
};

export function createViewNavigation(args: CreateViewNavigationArgs) {
  const navKeys = new Set<string>();
  const viewCubeEl = args.viewerEl.querySelector<HTMLElement>(".archux-view-cube");
  const viewCubeShell = args.viewerEl.querySelector<HTMLElement>(".archux-view-cube-shell");
  let lastViewCubeTransform = "";
  let lastViewCubeYaw: number | null = null;
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

  const getExactViewCubeFace = (direction: THREE.Vector3) => {
    let bestFace: ViewCubeFace = "front";
    let bestDot = -Infinity;
    for (const face of Object.keys(VIEW_CUBE_DIRECTIONS) as ViewCubeFace[]) {
      const dot = direction.dot(VIEW_CUBE_DIRECTIONS[face]);
      if (dot > bestDot) {
        bestDot = dot;
        bestFace = face;
      }
    }
    return bestDot > 0.985 ? bestFace : null;
  };

  const syncViewCube = () => {
    if (!viewCubeShell) return;
    const state = args.getState();
    const is3dView = state.viewMode === "3d";
    viewCubeEl?.classList.remove("is-hidden");
    viewCubeEl?.classList.toggle("is-floorplan", !is3dView);
    if (!is3dView) {
      viewCubeEl?.classList.remove("is-exact-face");
      if (viewCubeEl) delete viewCubeEl.dataset.activeFace;
      lastViewCubeYaw = null;
      const transform = "none";
      if (transform !== lastViewCubeTransform) {
        viewCubeShell.style.transform = transform;
        lastViewCubeTransform = transform;
      }
      return;
    }

    const camera = args.getCamera();
    const controls = getControls();
    const offset = tmpVecA.copy(camera.position).sub(controls.target);
    if (offset.lengthSq() < 1e-8) return;

    offset.normalize();
    const exactFace = getExactViewCubeFace(offset);
    viewCubeEl?.classList.toggle("is-exact-face", !!exactFace);
    if (viewCubeEl) {
      if (exactFace) viewCubeEl.dataset.activeFace = exactFace;
      else delete viewCubeEl.dataset.activeFace;
    }
    let yaw = THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z));
    const pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(offset.y, -1, 1)));

    if (lastViewCubeYaw !== null) {
      while (yaw - lastViewCubeYaw > 180) yaw -= 360;
      while (yaw - lastViewCubeYaw < -180) yaw += 360;
    }
    lastViewCubeYaw = yaw;

    const transform = exactFace ? VIEW_CUBE_EXACT_TRANSFORMS[exactFace] : `rotateX(${-pitch}deg) rotateY(${-yaw}deg)`;
    if (transform === lastViewCubeTransform) return;
    viewCubeShell.style.transform = transform;
    lastViewCubeTransform = transform;
  };

  const setViewCubeTarget = (target: string) => {
    const parts = parseViewCubeTarget(target);
    if (!parts) return;
    let camera = getPerspectiveCamera();
    if (!camera && !parts.includes("top")) {
      args.activate3dView?.();
      camera = getPerspectiveCamera();
    }
    if (!camera) return;
    const controls = getControls();
    const offset = tmpVecA.copy(camera.position).sub(controls.target);
    let distance = offset.length();
    if (!Number.isFinite(distance) || distance < MIN_3D_DISTANCE) {
      distance = Math.max(3.2, MIN_3D_DISTANCE * 4);
    }

    const direction = tmpVecB.set(0, 0, 0);
    for (const part of parts) direction.add(VIEW_CUBE_DIRECTIONS[part]);
    if (direction.lengthSq() < 1e-8) return;
    direction.normalize();

    if (parts.length === 1) {
      camera.up.copy(VIEW_CUBE_UP[parts[0]]);
    } else {
      tmpVecC.set(0, 1, 0);
      if (Math.abs(direction.dot(tmpVecC)) > 0.92) tmpVecC.set(0, 0, direction.y >= 0 ? -1 : 1);
      camera.up.copy(tmpVecC.addScaledVector(direction, -tmpVecC.dot(direction)).normalize());
    }

    camera.position.copy(controls.target).addScaledVector(direction, distance);
    camera.lookAt(controls.target);
    stabilize3dCamera();
    controls.update();
    syncViewCube();
    args.canvasEl.focus({ preventScroll: true });
  };

  const setViewCubeFace = (face: ViewCubeFace) => setViewCubeTarget(face);

  const rollViewCube = (direction: "cw" | "ccw") => {
    const camera = getPerspectiveCamera();
    if (!camera) return;
    const controls = getControls();
    const viewAxis = tmpVecA.copy(controls.target).sub(camera.position);
    if (viewAxis.lengthSq() < 1e-8) return;
    viewAxis.normalize();
    const angle = direction === "cw" ? -Math.PI / 2 : Math.PI / 2;
    camera.up.applyAxisAngle(viewAxis, angle).normalize();
    camera.lookAt(controls.target);
    stabilize3dCamera();
    controls.update();
    syncViewCube();
    args.canvasEl.focus({ preventScroll: true });
  };

  const getHorizontalViewCubeFace = (preferSide: boolean) => {
    const camera = args.getCamera();
    const controls = getControls();
    const offset = tmpVecA.copy(camera.position).sub(controls.target);
    if (offset.lengthSq() < 1e-8) return preferSide ? "right" : "front";

    if (preferSide) {
      if (Math.abs(offset.x) >= 0.12) return offset.x >= 0 ? "right" : "left";
      return offset.z >= 0 ? "front" : "back";
    }

    if (Math.abs(offset.z) >= Math.abs(offset.x) * 0.65) {
      return offset.z >= 0 ? "front" : "back";
    }
    return offset.x >= 0 ? "right" : "left";
  };

  const getViewCubeClickFace = (ev: MouseEvent): ViewCubeFace | null => {
    if (!viewCubeEl) return null;
    const rect = viewCubeEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    if (y < 0.4) {
      const camera = args.getCamera();
      const controls = getControls();
      return camera.position.y >= controls.target.y ? "top" : "bottom";
    }
    if (x > 0.6) return "right";
    if (x < 0.22) return "left";
    return getHorizontalViewCubeFace(false);
  };

  const handleViewCubeClick = (ev: MouseEvent) => {
    if (!(ev.target instanceof Element)) return;
    const rotateButton = ev.target.closest<HTMLButtonElement>("[data-view-rotate]");
    const targetButton = ev.target.closest<HTMLButtonElement>("[data-view-target]");
    const button = ev.target.closest<HTMLButtonElement>("[data-view-face]");
    if (!viewCubeEl?.contains(ev.target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (args.isInteractionBlocked()) return;
    const rotate = rotateButton?.dataset.viewRotate;
    if (rotate === "cw" || rotate === "ccw") {
      rollViewCube(rotate);
      return;
    }
    const explicitTarget = targetButton?.dataset.viewTarget;
    if (explicitTarget) {
      setViewCubeTarget(explicitTarget);
      return;
    }
    const explicitFace = button?.dataset.viewFace;
    const clickFace = getViewCubeClickFace(ev);
    const face = clickFace ?? explicitFace;
    if (!isViewCubeFace(face)) return;
    setViewCubeFace(face);
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
    const isCameraView = viewMode === "3d" && activeViewerTab.startsWith("camera:");

    if (viewMode === "3d") {
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.screenSpacePanning = false;
      controls.enableRotate = true;
      controls.enablePan = !isCameraView;
      controls.enableZoom = !isCameraView;
      controls.rotateSpeed = 0.85;
      controls.panSpeed = 0.9;
      controls.zoomSpeed = 0.95;
      (controls as OrbitControls & { zoomToCursor?: boolean }).zoomToCursor = false;
      (controls as OrbitControls & { minTargetRadius?: number }).minTargetRadius = 0;
      (controls as OrbitControls & { maxTargetRadius?: number }).maxTargetRadius = Infinity;
      controls.mouseButtons = isCameraView
        ? ({
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.ROTATE
          } as typeof controls.mouseButtons)
        : ({
            MIDDLE: THREE.MOUSE.ROTATE
          } as typeof controls.mouseButtons);
      if (!isCameraView) stabilize3dCamera();
      controls.update();
      syncViewCube();
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
    syncViewCube();
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

  const panViewByPixels = (deltaX: number, deltaY: number) => {
    const camera = args.getCamera();
    if (camera instanceof THREE.OrthographicCamera) {
      panDetailViewByPixels(deltaX, deltaY);
      return;
    }
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const controls = getControls();
    const rect = args.canvasEl.getBoundingClientRect();
    const distance = Math.max(0.01, camera.position.distanceTo(controls.target));
    const verticalWorld = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
    const unitsPerPixelY = verticalWorld / Math.max(1, rect.height);
    const unitsPerPixelX = (verticalWorld * camera.aspect) / Math.max(1, rect.width);
    const forward = tmpVecA.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const up = tmpVecB.copy(camera.up).normalize();
    const right = tmpVecC.copy(forward).cross(up).normalize();
    const pan = right.multiplyScalar(-deltaX * unitsPerPixelX).add(up.multiplyScalar(deltaY * unitsPerPixelY));
    camera.position.add(pan);
    controls.target.add(pan);
    stabilize3dCamera();
    controls.update();
    syncViewCube();
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
    args.setViewerPanActive?.(false);
  };

  const handlePointerDown = (ev: PointerEvent) => {
    viewerFocusState.active = true;
    const explicitPan = args.getViewerToolMode?.() === "pan";
    if (explicitPan && ev.button === 0) {
      const { mode, viewMode, activeViewerTab } = args.getState();
      if (mode !== "layout" || (viewMode === "3d" && activeViewerTab.startsWith("camera:")) || args.isInteractionBlocked()) return false;
      ev.preventDefault();
      detailPanState.active = true;
      detailPanState.pointerId = ev.pointerId;
      detailPanState.lastClientX = ev.clientX;
      detailPanState.lastClientY = ev.clientY;
      args.setViewerPanActive?.(true);
      try {
        args.canvasEl.setPointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return true;
    }
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
    if (args.getViewerToolMode?.() === "pan") panViewByPixels(deltaX, deltaY);
    else panDetailViewByPixels(deltaX, deltaY);
    return true;
  };

  const handlePointerUp = (ev: PointerEvent) => {
    if (!detailPanState.active || detailPanState.pointerId !== ev.pointerId) return false;
    detailPanState.active = false;
    detailPanState.pointerId = null;
    args.setViewerPanActive?.(false);
    try {
      args.canvasEl.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
    return true;
  };

  const update = (dt: number) => {
    syncViewCube();
    if (navKeys.size === 0) return;
    if (!shouldAcceptKeyboardNav()) return;

    const state = args.getState();
    if (state.viewMode === "3d" && state.activeViewerTab.startsWith("camera:")) return;
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
  viewCubeEl?.addEventListener("pointerdown", ev => {
    ev.preventDefault();
    ev.stopPropagation();
  });
  viewCubeEl?.addEventListener("click", handleViewCubeClick);

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
