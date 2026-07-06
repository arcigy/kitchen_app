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
  marker.style.width = "14px";
  marker.style.height = "14px";
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
    const color = kind === "free" ? "#64748b" : "#1d5fd1";
    const path =
      kind === "midpoint"
        ? `<path d="M7 2.4 12 11.2H2Z" />`
        : kind === "perpendicular"
          ? `<path d="M3 2.5V11h8.5" /><path d="M3 8h3v3" />`
          : kind === "axis"
            ? `<path d="M7 2v10M2 7h10" />`
            : kind === "edge"
              ? `<path d="M2 7h10" /><path d="M4 4.5h6" />`
              : kind === "corner"
                ? `<path d="M7 1.8 12.2 7 7 12.2 1.8 7Z" />`
                : kind === "endpoint"
                  ? `<path d="M2.5 2.5h9v9h-9Z" />`
                  : `<circle cx="7" cy="7" r="3.4" />`;
    marker.style.width = "14px";
    marker.style.height = "14px";
    marker.style.border = "none";
    marker.style.borderRadius = "0";
    marker.style.background = "transparent";
    marker.style.clipPath = "none";
    marker.style.boxShadow = "none";
    marker.style.filter = "drop-shadow(0 0 1px rgba(255,255,255,0.95)) drop-shadow(0 0 1px rgba(255,255,255,0.95))";
    marker.style.transform = "translate(-50%, -50%)";
    marker.innerHTML = `<svg viewBox="0 0 14 14" aria-hidden="true" focusable="false" style="display:block;width:14px;height:14px;overflow:visible"><g fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter">${path}</g></svg>`;
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
    marker.innerHTML = "";
    marker.style.transform = "translate(-50%, -50%)";
  };

  const isVisible = () => marker.style.display !== "none";

  return { root, marker, showAt, showWorld, hide, isVisible };
}
