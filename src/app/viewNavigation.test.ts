import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  isNavigationKeyboardCode,
  resolveNavigationFocusCenter,
  resolveNavigationGesture,
  resolveNavigationPointerControls,
  resolveNavigationViewerToolMode,
  shouldHandleNavigationKeyboardEvent,
  resolveViewCubePresentation
} from "./viewNavigation";
import {
  applyOrthographicWheelZoom,
  applyPerspectiveWheelZoom,
  navigationWheelScale,
  orbitCameraAroundPivot,
  panCameraInViewPlane,
  semanticFocusDirection,
  semanticPerspectiveFocusDistance,
  setViewCubeCssRotationMatrix
} from "./viewNavigationMath";

describe("viewNavigation pointer controls", () => {
  it("derives semantic focus cameras without model-provided coordinates", () => {
    expect(semanticFocusDirection("front").toArray()).toEqual([0, 0, 1]);
    expect(semanticFocusDirection("top").toArray()).toEqual([0, 1, 0]);
    expect(semanticFocusDirection("isometric").length()).toBeCloseTo(1);
    expect(semanticPerspectiveFocusDistance(1, 45, 1.2)).toBeGreaterThan(2.8);
  });

  it("defaults to select mode before the viewer tool controller is initialized", () => {
    expect(resolveNavigationViewerToolMode()).toBe("select");
  });

  it("reads the active viewer tool mode when the controller is available", () => {
    expect(resolveNavigationViewerToolMode(() => "pan")).toBe("pan");
  });

  it("does not allow left-drag pan in floorplan select mode", () => {
    const controls = resolveNavigationPointerControls("2d", "floorplan", "select");

    expect(controls.enablePan).toBe(false);
    expect(controls.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
    expect(controls.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
  });

  it("allows left-drag pan only when the pan tool is active", () => {
    const controls = resolveNavigationPointerControls("2d", "floorplan", "pan");

    expect(controls.enablePan).toBe(true);
    expect(controls.mouseButtons.LEFT).toBe(THREE.MOUSE.PAN);
  });

  it("never captures WASD for viewer movement", () => {
    expect(isNavigationKeyboardCode("KeyW")).toBe(false);
    expect(isNavigationKeyboardCode("KeyA")).toBe(false);
    expect(isNavigationKeyboardCode("KeyS")).toBe(false);
    expect(isNavigationKeyboardCode("KeyD")).toBe(false);
  });

  it("never captures Space while a text field owns keyboard focus", () => {
    expect(shouldHandleNavigationKeyboardEvent({
      code: "Space",
      defaultPrevented: false,
      typingTarget: true,
      acceptsNavigationFocus: true
    })).toBe(false);
    expect(shouldHandleNavigationKeyboardEvent({
      code: "Space",
      defaultPrevented: false,
      typingTarget: false,
      acceptsNavigationFocus: true
    })).toBe(true);
  });

  it("uses Revit mouse gestures without assigning navigation to the primary button", () => {
    expect(resolveNavigationGesture({ button: 0, shiftKey: false, viewerToolMode: "select" })).toBeNull();
    expect(resolveNavigationGesture({ button: 1, shiftKey: false, viewerToolMode: "select" })).toBe("pan");
    expect(resolveNavigationGesture({ button: 1, shiftKey: true, viewerToolMode: "select" })).toBe("orbit");
  });

  it("keeps explicit navigation tools available on the primary button", () => {
    expect(resolveNavigationGesture({ button: 0, shiftKey: false, viewerToolMode: "pan" })).toBe("pan");
    expect(resolveNavigationGesture({ button: 0, shiftKey: false, viewerToolMode: "orbit" })).toBe("orbit");
  });

  it("uses current selection bounds and falls back to visible project bounds", () => {
    let selectionBounds: THREE.Box3 | null = new THREE.Box3(
      new THREE.Vector3(1, 2, 3),
      new THREE.Vector3(3, 4, 5)
    );
    const provider = {
      getSelectionBounds: () => selectionBounds,
      getVisibleProjectBounds: () => new THREE.Box3(
        new THREE.Vector3(-10, 0, -6),
        new THREE.Vector3(10, 4, 6)
      )
    };

    expect(resolveNavigationFocusCenter(provider).toArray()).toEqual([2, 3, 4]);
    selectionBounds = null;
    expect(resolveNavigationFocusCenter(provider).toArray()).toEqual([0, 2, 0]);
  });
});

describe("view cube presentation", () => {
  it("keeps floorplan flat but follows every standard elevation camera", () => {
    const floorplanCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    floorplanCamera.position.set(0, 10, 0);
    floorplanCamera.up.set(0, 0, -1);
    floorplanCamera.lookAt(0, 0, 0);

    const northCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    northCamera.position.set(0, 1, 10);
    northCamera.lookAt(0, 1, 0);

    const eastCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    eastCamera.position.set(10, 1, 0);
    eastCamera.lookAt(0, 1, 0);

    const floorplan = resolveViewCubePresentation(
      { viewMode: "2d", activeViewerTab: "floorplan" },
      floorplanCamera.quaternion
    );
    const north = resolveViewCubePresentation(
      { viewMode: "2d", activeViewerTab: "elevation:north" },
      northCamera.quaternion
    );
    const east = resolveViewCubePresentation(
      { viewMode: "2d", activeViewerTab: "elevation:east" },
      eastCamera.quaternion
    );

    expect(floorplan).toEqual({ isFloorplan: true, transform: "none" });
    expect(north.isFloorplan).toBe(false);
    expect(east.isFloorplan).toBe(false);
    expect(north.transform).toMatch(/^matrix3d\(/);
    expect(east.transform).toMatch(/^matrix3d\(/);
    expect(north.transform).not.toBe(east.transform);
  });
});

describe("viewNavigation camera math", () => {
  it("uses a stable Revit-like quarter zoom step", () => {
    const oneNotchZoomInScale = navigationWheelScale(-120);

    expect(oneNotchZoomInScale).toBeCloseTo(1 / 1.25, 10);
    expect(navigationWheelScale(120)).toBeCloseTo(1.25, 10);
  });

  it("pans in the camera view plane instead of fixed world axes", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 100);
    camera.position.set(4, 3, 5);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld(true);
    const target = new THREE.Vector3(0, 1, 0);
    const before = camera.position.clone();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    panCameraInViewPlane(camera, target, 120, 0, 4, { width: 1000, height: 800 });

    const movement = camera.position.clone().sub(before).normalize();
    expect(Math.abs(movement.dot(right))).toBeGreaterThan(0.999);
    expect(target.clone().sub(new THREE.Vector3(0, 1, 0)).normalize().dot(movement)).toBeGreaterThan(0.999);
  });

  it("continues zooming after repeated pan and zoom cycles", () => {
    const camera = new THREE.PerspectiveCamera(50, 1.5, 0.001, 1000);
    camera.position.set(4, 3, 5);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld(true);
    const target = new THREE.Vector3(0, 1, 0);
    let focusDistance = camera.position.distanceTo(target);
    const distances: number[] = [];

    for (let index = 0; index < 12; index += 1) {
      focusDistance = applyPerspectiveWheelZoom(camera, target, { x: 0.25, y: -0.2 }, -120, focusDistance);
      panCameraInViewPlane(camera, target, 18, -11, focusDistance, { width: 1200, height: 800 });
      distances.push(focusDistance);
    }

    expect(distances.every((distance, index) => index === 0 || distance < distances[index - 1]!)).toBe(true);
    expect(distances.at(-1)).toBeLessThan(distances[0]! * 0.4);
  });

  it("centers an off-center pivot before orbiting around it", () => {
    const camera = new THREE.PerspectiveCamera(50, 1.5, 0.001, 1000);
    camera.position.set(4, 3, 5);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld(true);
    const pivot = new THREE.Vector3(1.2, 0.8, -0.4);
    orbitCameraAroundPivot(camera, pivot, 90, -35, { width: 1200, height: 800 });
    camera.updateMatrixWorld(true);
    const after = pivot.clone().project(camera);

    expect(after.x).toBeCloseTo(0, 8);
    expect(after.y).toBeCloseTo(0, 8);
    expect(camera.position.distanceTo(pivot)).toBeCloseTo(new THREE.Vector3(4, 3, 5).distanceTo(pivot), 6);
  });

  it("returns reliably from an exact top view through a vertical orbit", () => {
    const camera = new THREE.PerspectiveCamera(50, 1.5, 0.001, 1000);
    const pivot = new THREE.Vector3(0, 0, 0);
    camera.position.set(0, 8, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(pivot);
    camera.updateMatrixWorld(true);

    expect(orbitCameraAroundPivot(camera, pivot, 0, 120, { width: 1200, height: 800 }, 1)).toBe(true);
    expect(camera.position.y).toBeLessThan(8);
    expect(camera.position.distanceTo(pivot)).toBeCloseTo(8, 8);
    expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
  });

  it("caps a delayed pointer event so orbit cannot jump away", () => {
    const camera = new THREE.PerspectiveCamera(50, 1.5, 0.001, 1000);
    const pivot = new THREE.Vector3(0, 1, 0);
    camera.position.set(4, 3, 5);
    camera.lookAt(pivot);
    camera.updateMatrixWorld(true);

    orbitCameraAroundPivot(camera, pivot, 48, -48, { width: 1200, height: 800 });
    const cappedPosition = camera.position.clone();
    camera.position.set(4, 3, 5);
    camera.lookAt(pivot);
    camera.updateMatrixWorld(true);
    orbitCameraAroundPivot(camera, pivot, 10000, -10000, { width: 1200, height: 800 });

    expect(camera.position.distanceTo(cappedPosition)).toBeLessThan(1e-8);
  });

  it("keeps the point below the cursor fixed during axonometric zoom", () => {
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.001, 1000);
    camera.position.set(4, 5, 6);
    camera.lookAt(0, 1, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const target = new THREE.Vector3(0, 1, 0);
    const pointer = { x: 0.4, y: -0.25 };
    const anchorBefore = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(camera);

    applyOrthographicWheelZoom(camera, target, pointer, -120, 5);

    const anchorAfter = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(camera);
    expect(anchorAfter.distanceTo(anchorBefore)).toBeLessThan(1e-8);
    expect(camera.zoom).toBeGreaterThan(1);
  });
});
