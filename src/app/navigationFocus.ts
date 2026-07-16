import * as THREE from "three";
import type { VisibilityTarget } from "./visibilityController";
import type { NavigationFocusProvider } from "./viewNavigation";

const EMPTY_PROJECT_BOUNDS = new THREE.Box3(
  new THREE.Vector3(-1, 0, -1),
  new THREE.Vector3(1, 2.6, 1)
);

const isModelTarget = (target: VisibilityTarget) =>
  target.key !== "underlay:main" && !target.key.startsWith("section:");

const getRoots = (target: VisibilityTarget) =>
  Array.isArray(target.root) ? target.root : [target.root];

const isVisible = (root: THREE.Object3D) => {
  for (let current: THREE.Object3D | null = root; current; current = current.parent) {
    if (!current.visible || current.userData.visibilityHidden === true) return false;
  }
  return true;
};

export function getNavigationTargetBounds(
  targets: VisibilityTarget[],
  options: { selectedKeys?: ReadonlySet<string>; visibleOnly?: boolean } = {}
) {
  const bounds = new THREE.Box3();
  for (const target of targets) {
    if (!isModelTarget(target) || (options.selectedKeys && !options.selectedKeys.has(target.key))) continue;
    for (const root of getRoots(target)) {
      if (options.visibleOnly && !isVisible(root)) continue;
      bounds.expandByObject(root, true);
    }
  }
  return bounds;
}

export function createNavigationFocusProvider(args: {
  getMode: () => "layout" | "build";
  getBuildSelectionBounds: () => THREE.Box3 | null;
  getLayoutSelectionBounds: () => THREE.Box3 | null;
  getSelectedTargetKeys: () => string[];
  getVisibilityTargets: () => VisibilityTarget[];
  getBuildProjectBounds: () => THREE.Box3;
}): NavigationFocusProvider {
  return {
    getSelectionBounds: () => {
      if (args.getMode() === "build") return args.getBuildSelectionBounds();
      const exactBounds = args.getLayoutSelectionBounds();
      if (exactBounds && !exactBounds.isEmpty()) return exactBounds;
      return getNavigationTargetBounds(args.getVisibilityTargets(), {
        selectedKeys: new Set(args.getSelectedTargetKeys())
      });
    },
    getVisibleProjectBounds: () => {
      if (args.getMode() === "build") return args.getBuildProjectBounds();
      const bounds = getNavigationTargetBounds(args.getVisibilityTargets(), { visibleOnly: true });
      return bounds.isEmpty() ? EMPTY_PROJECT_BOUNDS.clone() : bounds;
    }
  };
}
