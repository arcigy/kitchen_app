import * as THREE from "three";
import { worldToScreen } from "./sharedUtils";

export type SnapOverlayKind = "none" | "free" | "edge" | "corner" | "endpoint" | "midpoint" | "perpendicular" | "axis";

export type SnapOverlayController = ReturnType<typeof createSnapOverlay>;

export function createSnapOverlay(viewerEl: HTMLElement) {
  const root = document.createElement("div");
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.pointerEvents = "none";
  root.style.zIndex = "12";
  root.dataset.snapOverlay = "root";
  viewerEl.appendChild(root);

  const marker = document.createElement("div");
  marker.style.position = "absolute";
  marker.style.width = "16px";
  marker.style.height = "16px";
  marker.style.transform = "translate(-50%, -50%)";
  marker.style.display = "none";
  marker.style.pointerEvents = "none";
  marker.dataset.snapOverlay = "marker";
  root.appendChild(marker);

  let desiredVisible = false;
  let desiredKind: SnapOverlayKind = "none";
  let desiredPoint = new THREE.Vector2();
  let desiredToken = 0;

  const applyMarkerStyle = (kind: SnapOverlayKind) => {
    const color =
      kind === "corner"
        ? "#ff4dff"
        : kind === "midpoint"
          ? "#ffffff"
          : kind === "perpendicular"
            ? "#7cfcff"
            : kind === "axis"
              ? "#3ddc97"
              : kind === "edge"
                ? "#ffd166"
                : kind === "endpoint"
                  ? "#3ddc97"
                  : "#00e5ff";

    marker.style.border = "none";
    marker.style.borderRadius = "0";
    marker.style.background = "transparent";
    marker.style.clipPath = "none";
    marker.style.boxShadow = `0 0 0 2px rgba(15,17,23,0.95), 0 0 16px ${color}66`;

    if (kind === "midpoint") {
      marker.style.width = "18px";
      marker.style.height = "16px";
      marker.style.background = color;
      marker.style.clipPath = "polygon(50% 4%, 96% 92%, 4% 92%)";
      marker.style.transform = "translate(-50%, -50%)";
      return;
    }

    if (kind === "perpendicular") {
      marker.style.width = "18px";
      marker.style.height = "18px";
      marker.style.background = "transparent";
      marker.style.border = `3px solid ${color}`;
      marker.style.borderRadius = "4px";
      marker.style.transform = "translate(-50%, -50%)";
      return;
    }

    marker.style.width = "16px";
    marker.style.height = "16px";
    marker.style.border = `3px solid ${color}`;
    marker.style.background = "rgba(12,14,18,0.92)";

    if (kind === "corner") {
      marker.style.borderRadius = "4px";
      marker.style.transform = "translate(-50%, -50%) rotate(45deg)";
      return;
    }

    marker.style.transform = "translate(-50%, -50%)";
    marker.style.borderRadius = kind === "edge" ? "4px" : "999px";
  };

  const showAt = (point: THREE.Vector2, kind: SnapOverlayKind, opts?: { stable?: boolean }) => {
    desiredVisible = true;
    desiredKind = kind;
    desiredPoint.copy(point);
    desiredToken += 1;
    applyMarkerStyle(desiredKind);
    marker.style.left = `${desiredPoint.x}px`;
    marker.style.top = `${desiredPoint.y}px`;
    marker.style.display = "block";
    if (opts?.stable) {
      const token = desiredToken;
      requestAnimationFrame(() => {
        if (!desiredVisible || desiredToken !== token) return;
        applyMarkerStyle(desiredKind);
        marker.style.left = `${desiredPoint.x}px`;
        marker.style.top = `${desiredPoint.y}px`;
        marker.style.display = "block";
      });
    }
  };

  const showWorld = (
    point: THREE.Vector3,
    camera: THREE.Camera,
    rect: DOMRect,
    kind: SnapOverlayKind,
    opts?: { stable?: boolean }
  ) => {
    showAt(worldToScreen(point, camera, rect), kind, opts);
  };

  const hide = () => {
    desiredVisible = false;
    desiredToken += 1;
    marker.style.display = "none";
    marker.style.transform = "translate(-50%, -50%)";
  };

  const isVisible = () => marker.style.display !== "none";

  return { root, marker, showAt, showWorld, hide, isVisible };
}
