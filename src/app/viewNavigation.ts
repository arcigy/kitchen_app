import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  applyOrthographicWheelZoom,
  applyPerspectiveWheelZoom,
  MIN_NAVIGATION_FOCUS_DISTANCE,
  normalizeNavigationWheelDelta,
  orbitCameraAroundPivot,
  panCameraInViewPlane,
  pointerNdcFromClient,
  semanticFocusDirection,
  semanticPerspectiveFocusDistance,
  type SemanticFocusPerspective,
  viewCubeCssTransform
} from "./viewNavigationMath";
import { createTouchGestureController, installTouchActivationGestures } from "./touchGestureController";

export type NavigationViewMode = "3d" | "2d";
export type NavigationAppMode = "build" | "layout";

type NavigationState = {
  mode: NavigationAppMode;
  viewMode: NavigationViewMode;
  activeViewerTab: string;
};

export type NavigationFocusProvider = {
  getSelectionBounds: () => THREE.Box3 | null;
  getVisibleProjectBounds: () => THREE.Box3;
};

export function resolveNavigationFocusCenter(
  provider: NavigationFocusProvider,
  fallback = new THREE.Vector3(0, 0.9, 0)
) {
  const selectionBounds = provider.getSelectionBounds();
  if (selectionBounds && !selectionBounds.isEmpty()) return selectionBounds.getCenter(new THREE.Vector3());
  const visibleBounds = provider.getVisibleProjectBounds();
  if (!visibleBounds.isEmpty()) return visibleBounds.getCenter(new THREE.Vector3());
  return fallback.clone();
}

// Orbiting is a continuation of the view currently on screen.  Replacing this
// pivot with a selected module or the project bounds at pointer-down changes
// the camera position on the first drag and looks like a teleport.
export function resolveStableOrbitPivot(currentTarget: THREE.Vector3) {
  return currentTarget.clone();
}

export type NavigationViewerToolMode = "select" | "pan" | "zoom-in" | "zoom-out" | "orbit" | "fit";
export type NavigationGesture = "pan" | "orbit";

export function resolveNavigationGesture(args: {
  button: number;
  shiftKey: boolean;
  viewerToolMode: NavigationViewerToolMode;
}): NavigationGesture | null {
  if (args.button === 1) return args.shiftKey ? "orbit" : "pan";
  if (args.button !== 0) return null;
  if (args.viewerToolMode === "pan") return "pan";
  if (args.viewerToolMode === "orbit") return "orbit";
  return null;
}

export function resolveNavigationViewerToolMode(getViewerToolMode?: () => NavigationViewerToolMode): NavigationViewerToolMode {
  return getViewerToolMode?.() ?? "select";
}

export function resolveNavigationPointerControls(
  viewMode: NavigationViewMode,
  activeViewerTab: string,
  viewerToolMode: NavigationViewerToolMode
) {
  const explicitPanTool = viewerToolMode === "pan";
  const isCameraView = viewMode === "3d" && activeViewerTab.startsWith("camera:");

  if (viewMode === "3d") {
    return {
      enableRotate: !explicitPanTool,
      enablePan: !isCameraView,
      mouseButtons: isCameraView
        ? {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.ROTATE
          }
        : {
            LEFT: explicitPanTool ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.PAN
          }
    };
  }

  return {
    enableRotate: false,
    enablePan: explicitPanTool,
    mouseButtons: {
      LEFT: explicitPanTool ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN
    }
  };
}

export function resolveViewCubePresentation(
  state: Pick<NavigationState, "viewMode" | "activeViewerTab">,
  cameraQuaternion: THREE.Quaternion,
  target = new THREE.Matrix4()
) {
  const isFloorplan = state.viewMode === "2d" && state.activeViewerTab === "floorplan";
  return {
    isFloorplan,
    transform: isFloorplan ? "none" : viewCubeCssTransform(cameraQuaternion, target)
  };
}

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
  isPanInteractionBlocked?: () => boolean;
  focusProvider: NavigationFocusProvider;
  refreshDetailView: () => void;
  activate3dView?: () => void;
  cancelEditorTouchInteraction?: (pointerIds: readonly number[]) => void;
  canStartSingleTouchOrbit?: () => boolean;
  setNavigationInteractionActive?: (active: boolean) => void;
};

const NAV_KEY_CODES = new Set([
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
  "Space"
]);

export function isNavigationKeyboardCode(code: string) {
  return NAV_KEY_CODES.has(code);
}

export function shouldHandleNavigationKeyboardEvent(args: {
  code: string;
  defaultPrevented: boolean;
  typingTarget: boolean;
  acceptsNavigationFocus: boolean;
}) {
  return !args.defaultPrevented &&
    isNavigationKeyboardCode(args.code) &&
    !args.typingTarget &&
    args.acceptsNavigationFocus;
}

const DEFAULT_3D_TARGET = new THREE.Vector3(0, 0.9, 0);
const DEFAULT_3D_DIRECTION = new THREE.Vector3(1, 0.65, 1).normalize();
type ViewCubeFace = "top" | "bottom" | "front" | "back" | "right" | "left";
export type { SemanticFocusPerspective } from "./viewNavigationMath";

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
  const detailViewPanOffset = new THREE.Vector3();
  const viewerFocusState = {
    hover: false,
    active: false
  };
  const gestureState = {
    kind: null as NavigationGesture | null,
    pointerId: null as number | null,
    lastClientX: 0,
    lastClientY: 0,
    pivot: new THREE.Vector3()
  };
  let singleTouchOrbitCandidate: { pointerId: number; startClientX: number; startClientY: number } | null = null;
  let navigationFocusDistance: number | null = null;
  let navigationSceneRadius = 10;
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
  const tmpViewCubeMatrix = new THREE.Matrix4();

  const getControls = () => args.getControls();
  const getPerspectiveCamera = () => {
    const camera = args.getCamera();
    return camera instanceof THREE.PerspectiveCamera ? camera : null;
  };
  const get3dCamera = () => {
    const camera = args.getCamera();
    return camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera ? camera : null;
  };

  const refreshNavigationSceneRadius = () => {
    const bounds = args.focusProvider.getVisibleProjectBounds();
    if (bounds.isEmpty()) return;
    bounds.getBoundingSphere(tmpSphere);
    if (Number.isFinite(tmpSphere.radius)) navigationSceneRadius = Math.max(0.35, tmpSphere.radius);
  };

  const getFocusDistance = () => {
    if (navigationFocusDistance != null && Number.isFinite(navigationFocusDistance)) {
      return Math.max(MIN_NAVIGATION_FOCUS_DISTANCE, navigationFocusDistance);
    }
    const camera = args.getCamera();
    const distance = camera.position.distanceTo(getControls().target);
    navigationFocusDistance = Number.isFinite(distance)
      ? Math.max(MIN_NAVIGATION_FOCUS_DISTANCE, distance)
      : 3.2;
    return navigationFocusDistance;
  };

  const resolveOrbitPivot = () => {
    return resolveNavigationFocusCenter(args.focusProvider, DEFAULT_3D_TARGET);
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
    const presentation = resolveViewCubePresentation(state, args.getCamera().quaternion, tmpViewCubeMatrix);
    viewCubeEl?.classList.remove("is-hidden");
    viewCubeEl?.classList.toggle("is-floorplan", presentation.isFloorplan);
    if (presentation.isFloorplan) {
      viewCubeEl?.classList.remove("is-exact-face");
      if (viewCubeEl) delete viewCubeEl.dataset.activeFace;
      const transform = presentation.transform;
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
    const transform = presentation.transform;
    if (transform === lastViewCubeTransform) return;
    viewCubeShell.style.transform = transform;
    lastViewCubeTransform = transform;
  };

  const setViewCubeTarget = (target: string) => {
    const parts = parseViewCubeTarget(target);
    if (!parts) return;
    let camera = get3dCamera();
    if (args.getState().viewMode !== "3d") {
      args.activate3dView?.();
      camera = get3dCamera();
    }
    if (!camera) return;
    const controls = getControls();
    const pivot = resolveOrbitPivot();
    const offset = tmpVecA.copy(camera.position).sub(pivot);
    let distance = offset.length();
    if (!Number.isFinite(distance) || distance < MIN_NAVIGATION_FOCUS_DISTANCE) distance = Math.max(3.2, getFocusDistance());

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

    navigationFocusDistance = Math.max(MIN_NAVIGATION_FOCUS_DISTANCE, distance);
    controls.target.copy(pivot);
    camera.position.copy(pivot).addScaledVector(direction, distance);
    camera.lookAt(pivot);
    stabilize3dCamera();
    controls.update();
    syncViewCube();
    args.canvasEl.focus({ preventScroll: true });
  };

  const setViewCubeFace = (face: ViewCubeFace) => setViewCubeTarget(face);

  const rollViewCube = (direction: "cw" | "ccw") => {
    const camera = get3dCamera();
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
    const distance = getFocusDistance();
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    camera.near = THREE.MathUtils.clamp(distance / 2000, 0.0005, 0.05);
    camera.far = Math.max(120, navigationSceneRadius * 20, distance * 200);
    camera.updateProjectionMatrix();
  };

  const syncControls = () => {
    const { viewMode, activeViewerTab } = args.getState();
    const controls = getControls();
    const isCameraView = viewMode === "3d" && activeViewerTab.startsWith("camera:");
    const pointerControls = resolveNavigationPointerControls(
      viewMode,
      activeViewerTab,
      resolveNavigationViewerToolMode(args.getViewerToolMode)
    );

    if (viewMode === "3d") {
      controls.enabled = false;
      controls.enableDamping = false;
      controls.screenSpacePanning = true;
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.rotateSpeed = 0.85;
      controls.panSpeed = 0.9;
      controls.zoomSpeed = 0.95;
      (controls as OrbitControls & { zoomToCursor?: boolean }).zoomToCursor = false;
      (controls as OrbitControls & { minTargetRadius?: number }).minTargetRadius = 0;
      (controls as OrbitControls & { maxTargetRadius?: number }).maxTargetRadius = Infinity;
      controls.mouseButtons = pointerControls.mouseButtons as typeof controls.mouseButtons;
      if (!isCameraView) {
        navigationFocusDistance = Math.max(
          MIN_NAVIGATION_FOCUS_DISTANCE,
          args.getCamera().position.distanceTo(controls.target)
        );
        refreshNavigationSceneRadius();
        stabilize3dCamera();
      }
      controls.update();
      syncViewCube();
      return;
    }

    controls.enabled = true;
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.enableRotate = pointerControls.enableRotate;
    controls.enableZoom = true;
    controls.enablePan = pointerControls.enablePan;
    controls.zoomSpeed = 1;
    controls.panSpeed = 1;
    controls.mouseButtons = pointerControls.mouseButtons as typeof controls.mouseButtons;
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
    if (args.getState().viewMode === "2d" && camera instanceof THREE.OrthographicCamera) {
      panDetailViewByPixels(deltaX, deltaY);
      return;
    }
    if (!(camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera)) return;
    const controls = getControls();
    const rect = args.canvasEl.getBoundingClientRect();
    panCameraInViewPlane(camera, controls.target, deltaX, deltaY, getFocusDistance(), rect);
    stabilize3dCamera();
    controls.update();
    syncViewCube();
  };

  const orbitViewByPixels = (deltaX: number, deltaY: number, pivot: THREE.Vector3) => {
    const camera = get3dCamera();
    if (!camera) return;
    const rect = args.canvasEl.getBoundingClientRect();
    if (!orbitCameraAroundPivot(camera, pivot, deltaX, deltaY, rect)) return;
    // Keep OrbitControls and camera on the exact same pivot for the full
    // gesture.  Reconstructing a forward proxy here caused top-view drift.
    getControls().target.copy(pivot);
    navigationFocusDistance = Math.max(MIN_NAVIGATION_FOCUS_DISTANCE, camera.position.distanceTo(pivot));
    stabilize3dCamera();
    getControls().update();
    syncViewCube();
  };

  const zoomViewByTouchScale = (scale: number) => {
    if (!Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.001) return;
    const camera = args.getCamera();
    const controls = getControls();
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * scale, 0.02, 200);
      camera.updateProjectionMatrix();
      controls.update();
      return;
    }
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const offset = tmpVecA.copy(camera.position).sub(controls.target);
    const currentDistance = Math.max(MIN_NAVIGATION_FOCUS_DISTANCE, offset.length());
    const nextDistance = THREE.MathUtils.clamp(currentDistance / scale, MIN_NAVIGATION_FOCUS_DISTANCE, Math.max(500, navigationSceneRadius * 100));
    if (offset.lengthSq() < 1e-8) offset.copy(DEFAULT_3D_DIRECTION);
    camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(nextDistance));
    navigationFocusDistance = nextDistance;
    stabilize3dCamera();
    controls.update();
    syncViewCube();
  };

  const touchGesture = createTouchGestureController({
    onMultiTouchStart: (pointerIds) => {
      singleTouchOrbitCandidate = null;
      args.cancelEditorTouchInteraction?.(pointerIds);
      args.setViewerPanActive?.(true);
      args.setNavigationInteractionActive?.(true);
    },
    onMultiTouchMove: (delta) => {
      if (args.isPanInteractionBlocked?.() ?? args.isInteractionBlocked()) return;
      panViewByPixels(delta.deltaX, delta.deltaY);
      zoomViewByTouchScale(delta.scale);
    },
    onMultiTouchEnd: () => {
      args.setViewerPanActive?.(false);
      args.setNavigationInteractionActive?.(false);
    }
  });

  const reset3dView = () => {
    const camera = get3dCamera();
    if (!camera) return;
    const controls = getControls();
    const bounds = args.focusProvider.getVisibleProjectBounds();

    if (bounds.isEmpty()) {
      controls.target.copy(DEFAULT_3D_TARGET);
      camera.position.copy(DEFAULT_3D_TARGET).addScaledVector(DEFAULT_3D_DIRECTION, 3.2);
      camera.lookAt(DEFAULT_3D_TARGET);
      navigationFocusDistance = 3.2;
      stabilize3dCamera();
      controls.update();
      return;
    }

    bounds.getBoundingSphere(tmpSphere);
    const radius = Math.max(tmpSphere.radius, 0.35);
    navigationSceneRadius = radius;
    const distance = camera instanceof THREE.PerspectiveCamera
      ? Math.max(
          MIN_NAVIGATION_FOCUS_DISTANCE * 2,
          radius / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.2
        )
      : Math.max(radius * 2.4, 1);

    controls.target.copy(tmpSphere.center);
    camera.position.copy(tmpSphere.center).addScaledVector(DEFAULT_3D_DIRECTION, distance);
    camera.up.set(0, 1, 0);
    camera.lookAt(tmpSphere.center);
    if (camera instanceof THREE.OrthographicCamera) {
      const baseHeight = Math.max(0.001, camera.top - camera.bottom);
      camera.zoom = THREE.MathUtils.clamp(baseHeight / Math.max(0.001, radius * 2.4), 1e-6, 1e6);
      camera.updateProjectionMatrix();
    }
    navigationFocusDistance = distance;
    stabilize3dCamera();
    controls.update();
    syncViewCube();
  };

  const focusSelection = (perspective: SemanticFocusPerspective, padding = 1.2) => {
    const bounds = args.focusProvider.getSelectionBounds();
    if (!bounds || bounds.isEmpty()) return false;
    if (args.getState().viewMode !== "3d") args.activate3dView?.();
    const camera = get3dCamera();
    if (!camera) return false;
    const controls = getControls();
    bounds.getBoundingSphere(tmpSphere);
    const radius = Math.max(tmpSphere.radius, 0.08);
    const safePadding = THREE.MathUtils.clamp(Number.isFinite(padding) ? padding : 1.2, 0.5, 3);
    const direction = semanticFocusDirection(perspective);
    const distance = camera instanceof THREE.PerspectiveCamera
      ? semanticPerspectiveFocusDistance(radius, camera.fov, safePadding)
      : Math.max(radius * 2 * safePadding, 0.2);

    controls.target.copy(tmpSphere.center);
    camera.position.copy(tmpSphere.center).addScaledVector(direction, distance);
    camera.up.copy(perspective === "top" ? VIEW_CUBE_UP.top : new THREE.Vector3(0, 1, 0));
    camera.lookAt(tmpSphere.center);
    if (camera instanceof THREE.OrthographicCamera) {
      const baseHeight = Math.max(0.001, camera.top - camera.bottom);
      camera.zoom = THREE.MathUtils.clamp(baseHeight / Math.max(0.001, radius * 2 * safePadding), 1e-6, 1e6);
      camera.updateProjectionMatrix();
    }
    navigationFocusDistance = distance;
    navigationSceneRadius = Math.max(navigationSceneRadius, radius);
    stabilize3dCamera();
    controls.update();
    syncViewCube();
    return true;
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
    if (!shouldHandleNavigationKeyboardEvent({
      code: ev.code,
      defaultPrevented: ev.defaultPrevented,
      typingTarget: args.isTypingTarget(ev.target),
      acceptsNavigationFocus: shouldAcceptKeyboardNav()
    })) return;
    navKeys.add(ev.code);
    if (ev.code === "Space") ev.preventDefault();
  };

  const onKeyUp = (ev: KeyboardEvent) => {
    navKeys.delete(ev.code);
  };

  const onBlur = () => {
    navKeys.clear();
    gestureState.kind = null;
    gestureState.pointerId = null;
    singleTouchOrbitCandidate = null;
    args.setViewerPanActive?.(false);
    args.setNavigationInteractionActive?.(false);
    touchGesture.cancel();
  };

  const beginGesture = (kind: NavigationGesture, ev: PointerEvent) => {
    const { viewMode, activeViewerTab } = args.getState();
    if (viewMode === "2d" && kind !== "pan") return false;
    if (viewMode === "3d" && activeViewerTab.startsWith("camera:") && kind === "pan") return false;
    const blocked = kind === "pan"
      ? args.isPanInteractionBlocked?.() ?? args.isInteractionBlocked()
      : args.isInteractionBlocked();
    if (blocked) return false;

    ev.preventDefault();
    ev.stopPropagation();
    args.canvasEl.focus({ preventScroll: true });
    gestureState.kind = kind;
    gestureState.pointerId = ev.pointerId;
    gestureState.lastClientX = ev.clientX;
    gestureState.lastClientY = ev.clientY;
    if (kind === "orbit") gestureState.pivot.copy(resolveStableOrbitPivot(getControls().target));
    args.setViewerPanActive?.(true);
    args.setNavigationInteractionActive?.(true);
    try {
      args.canvasEl.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
    return true;
  };

  const beginPan = (ev: PointerEvent) => beginGesture("pan", ev);
  const beginOrbit = (ev: PointerEvent) => beginGesture("orbit", ev);

  const handlePointerDown = (ev: PointerEvent) => {
    viewerFocusState.active = true;
    if (ev.pointerType === "touch") {
      const consumed = touchGesture.pointerDown(ev);
      if (consumed) {
        singleTouchOrbitCandidate = null;
        ev.preventDefault();
        ev.stopPropagation();
      } else if (args.canStartSingleTouchOrbit?.()) {
        singleTouchOrbitCandidate = {
          pointerId: ev.pointerId,
          startClientX: ev.clientX,
          startClientY: ev.clientY
        };
      }
      return consumed;
    }
    const gesture = resolveNavigationGesture({
      button: ev.button,
      shiftKey: ev.shiftKey,
      viewerToolMode: resolveNavigationViewerToolMode(args.getViewerToolMode)
    });
    if (gesture === "pan") return beginPan(ev);
    if (gesture === "orbit") return beginOrbit(ev);
    return false;
  };

  const handlePointerMove = (ev: PointerEvent) => {
    if (ev.pointerType === "touch" && touchGesture.pointerMove(ev)) {
      singleTouchOrbitCandidate = null;
      ev.preventDefault();
      return true;
    }
    if (ev.pointerType === "touch" && singleTouchOrbitCandidate?.pointerId === ev.pointerId) {
      const movedDistance = Math.hypot(
        ev.clientX - singleTouchOrbitCandidate.startClientX,
        ev.clientY - singleTouchOrbitCandidate.startClientY
      );
      if (movedDistance >= 10) {
        singleTouchOrbitCandidate = null;
        args.cancelEditorTouchInteraction?.([ev.pointerId]);
        return beginOrbit(ev);
      }
    }
    if (!gestureState.kind || gestureState.pointerId !== ev.pointerId) return false;
    const deltaX = ev.clientX - gestureState.lastClientX;
    const deltaY = ev.clientY - gestureState.lastClientY;
    gestureState.lastClientX = ev.clientX;
    gestureState.lastClientY = ev.clientY;
    ev.preventDefault();
    if (gestureState.kind === "pan") panViewByPixels(deltaX, deltaY);
    else orbitViewByPixels(deltaX, deltaY, gestureState.pivot);
    return true;
  };

  const endGesture = (pointerId?: number) => {
    if (!gestureState.kind || pointerId != null && gestureState.pointerId !== pointerId) return false;
    const activePointerId = gestureState.pointerId;
    gestureState.kind = null;
    gestureState.pointerId = null;
    args.setViewerPanActive?.(false);
    args.setNavigationInteractionActive?.(false);
    if (activePointerId != null) {
      try {
        args.canvasEl.releasePointerCapture(activePointerId);
      } catch {
        // ignore
      }
    }
    return true;
  };

  const handlePointerUp = (ev: PointerEvent) => {
    if (singleTouchOrbitCandidate?.pointerId === ev.pointerId) singleTouchOrbitCandidate = null;
    if (ev.pointerType === "touch" && touchGesture.pointerEnd(ev)) return true;
    return endGesture(ev.pointerId);
  };

  const applyWheelZoom = (ev: WheelEvent) => {
    const { viewMode, activeViewerTab } = args.getState();
    if (viewMode !== "3d") return false;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (activeViewerTab.startsWith("camera:") || args.isInteractionBlocked()) return true;
    const camera = get3dCamera();
    if (!camera) return true;
    const rect = args.canvasEl.getBoundingClientRect();
    const delta = normalizeNavigationWheelDelta(ev.deltaY, ev.deltaMode, rect.height);
    if (Math.abs(delta) < 1e-8) return true;
    const pointerNdc = pointerNdcFromClient(ev.clientX, ev.clientY, rect);
    const controls = getControls();
    const selectionBounds = args.focusProvider.getSelectionBounds();
    navigationFocusDistance = camera instanceof THREE.PerspectiveCamera
      ? applyPerspectiveWheelZoom(camera, controls.target, pointerNdc, delta, getFocusDistance(), {
          lockFocus: !!selectionBounds && !selectionBounds.isEmpty()
        })
      : applyOrthographicWheelZoom(camera, controls.target, pointerNdc, delta, getFocusDistance());
    stabilize3dCamera();
    controls.update();
    syncViewCube();
    args.setNavigationInteractionActive?.(true);
    args.setNavigationInteractionActive?.(false);
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
    args.setNavigationInteractionActive?.(true);
    args.setNavigationInteractionActive?.(false);

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
  args.canvasEl.addEventListener("auxclick", ev => {
    if (ev.button === 1) ev.preventDefault();
  });
  args.canvasEl.addEventListener("wheel", applyWheelZoom, { capture: true, passive: false });
  args.canvasEl.addEventListener("lostpointercapture", () => {
    singleTouchOrbitCandidate = null;
    endGesture();
  });
  args.canvasEl.addEventListener("pointercancel", (event) => {
    if (singleTouchOrbitCandidate?.pointerId === event.pointerId) singleTouchOrbitCandidate = null;
    touchGesture.pointerEnd(event);
    endGesture(event.pointerId);
  });
  installTouchActivationGestures(args.canvasEl);
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
    beginPan,
    beginOrbit,
    applyWheelZoom,
    endGesture,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    update,
    resetView,
    focusSelection
  };
}
