import * as THREE from "three";
import { axisLockXZ, planarDistanceMm, worldToScreen } from "./sharedUtils";
import type { SnapOverlayController } from "./snapOverlay";

export type WallEditHud = {
  root: HTMLDivElement;
  label: HTMLDivElement;
  input: HTMLInputElement;
  lenLine: HTMLDivElement;
  lenExtA: HTMLDivElement;
  lenExtB: HTMLDivElement;
  offsetLabel: HTMLDivElement;
  offsetInput: HTMLInputElement;
  offsetLine: HTMLDivElement;
  offsetTickA: HTMLDivElement;
  offsetTickB: HTMLDivElement;
  handleA: HTMLDivElement;
  handleB: HTMLDivElement;
  handleMid: HTMLDivElement;
  offsetRefWallId: string | null;
  drag:
    | null
    | {
        wallId: string;
        kind: "a" | "b" | "move";
        pointerId: number;
        startWorld: THREE.Vector3;
        startA: { x: number; z: number };
        startB: { x: number; z: number };
        connectedA: Array<{ wallId: string; which: "a" | "b" }>;
        connectedB: Array<{ wallId: string; which: "a" | "b" }>;
      };
};

export type MarqueeState = {
  active: boolean;
  pending: boolean;
  pointerId: number | null;
  hitSomething: boolean;
  startX: number;
  startY: number;
  mode: "contain" | "touch";
};

export type MeasureState = {
  enabled: boolean;
  axisLock: boolean;
  firstPoint: THREE.Vector3 | null;
  hoverPoint: THREE.Vector3 | null;
  hoverSnap: "none" | "free" | "edge" | "corner" | "endpoint" | "midpoint" | "perpendicular" | "axis";
  previewLine: THREE.Line | null;
  previewLabel: HTMLDivElement | null;
  previewLineEl: HTMLDivElement | null;
  previewStartEl: HTMLDivElement | null;
  previewEndEl: HTMLDivElement | null;
  firstPointEl: HTMLDivElement | null;
  measures: Array<{
    a: THREE.Vector3;
    b: THREE.Vector3;
    line: THREE.Line;
    label: HTMLDivElement;
    lineEl: HTMLDivElement;
    startEl: HTMLDivElement;
    endEl: HTMLDivElement;
  }>;
};

type HoverSnapKind = MeasureState["hoverSnap"];

type CreateMeasureToolsArgs = {
  viewerEl: HTMLElement;
  scene: THREE.Scene;
  getCamera: () => THREE.Camera;
  snapOverlay: SnapOverlayController;
  axisLockEl: HTMLInputElement;
  measureBtn: HTMLButtonElement;
  clearMeasuresBtn: HTMLButtonElement;
  measureReadoutEl: HTMLElement;
};

export function createMeasureTools(args: CreateMeasureToolsArgs) {
  const measureOverlay = document.createElement("div");
  measureOverlay.style.position = "absolute";
  measureOverlay.style.inset = "0";
  measureOverlay.style.pointerEvents = "none";
  args.viewerEl.appendChild(measureOverlay);

  const wallTypedHud = document.createElement("div");
  wallTypedHud.style.position = "absolute";
  wallTypedHud.style.transform = "translate(10px, -28px)";
  wallTypedHud.style.display = "none";
  wallTypedHud.style.pointerEvents = "none";
  wallTypedHud.style.padding = "2px 6px";
  wallTypedHud.style.borderRadius = "8px";
  wallTypedHud.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  wallTypedHud.style.background = "rgba(18, 20, 26, 0.92)";
  wallTypedHud.style.color = "rgba(230, 232, 238, 0.98)";
  wallTypedHud.style.fontSize = "12px";
  wallTypedHud.style.lineHeight = "18px";
  wallTypedHud.style.whiteSpace = "nowrap";
  measureOverlay.appendChild(wallTypedHud);

  const wallEditHud: WallEditHud = {
    root: document.createElement("div"),
    label: document.createElement("div"),
    input: document.createElement("input"),
    lenLine: document.createElement("div"),
    lenExtA: document.createElement("div"),
    lenExtB: document.createElement("div"),
    offsetLabel: document.createElement("div"),
    offsetInput: document.createElement("input"),
    offsetLine: document.createElement("div"),
    offsetTickA: document.createElement("div"),
    offsetTickB: document.createElement("div"),
    handleA: document.createElement("div"),
    handleB: document.createElement("div"),
    handleMid: document.createElement("div"),
    offsetRefWallId: null,
    drag: null
  };

  const root = wallEditHud.root;
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.pointerEvents = "none";
  root.style.zIndex = "9";
  args.viewerEl.appendChild(root);

  const lineBase = (el: HTMLDivElement, color = "rgba(92, 140, 255, 0.95)") => {
    el.style.position = "absolute";
    el.style.height = "1px";
    el.style.background = color;
    el.style.transformOrigin = "0 0";
    el.style.display = "none";
    el.style.pointerEvents = "none";
  };
  lineBase(wallEditHud.lenLine, "rgba(92, 140, 255, 0.95)");
  lineBase(wallEditHud.lenExtA, "rgba(92, 140, 255, 0.85)");
  lineBase(wallEditHud.lenExtB, "rgba(92, 140, 255, 0.85)");
  root.appendChild(wallEditHud.lenLine);
  root.appendChild(wallEditHud.lenExtA);
  root.appendChild(wallEditHud.lenExtB);

  lineBase(wallEditHud.offsetLine, "rgba(92, 140, 255, 0.95)");
  lineBase(wallEditHud.offsetTickA, "rgba(92, 140, 255, 0.95)");
  lineBase(wallEditHud.offsetTickB, "rgba(92, 140, 255, 0.95)");
  root.appendChild(wallEditHud.offsetLine);
  root.appendChild(wallEditHud.offsetTickA);
  root.appendChild(wallEditHud.offsetTickB);

  const handleBase = (el: HTMLDivElement) => {
    el.style.position = "absolute";
    el.style.width = "10px";
    el.style.height = "10px";
    el.style.borderRadius = "999px";
    el.style.border = "2px solid rgba(230, 232, 238, 0.95)";
    el.style.background = "rgba(12, 14, 18, 0.35)";
    el.style.transform = "translate(-50%, -50%)";
    el.style.display = "none";
    el.style.pointerEvents = "auto";
    el.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.45)";
  };

  handleBase(wallEditHud.handleA);
  wallEditHud.handleA.title = "Wall start";
  root.appendChild(wallEditHud.handleA);

  handleBase(wallEditHud.handleB);
  wallEditHud.handleB.title = "Wall end";
  root.appendChild(wallEditHud.handleB);

  const mid = wallEditHud.handleMid;
  mid.style.position = "absolute";
  mid.style.width = "10px";
  mid.style.height = "10px";
  mid.style.borderRadius = "6px";
  mid.style.border = "2px solid rgba(61, 220, 151, 0.95)";
  mid.style.background = "rgba(12, 14, 18, 0.35)";
  mid.style.transform = "translate(-50%, -50%)";
  mid.style.display = "none";
  mid.style.pointerEvents = "auto";
  mid.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.45)";
  mid.title = "Move wall";
  root.appendChild(mid);

  const label = wallEditHud.label;
  label.style.position = "absolute";
  label.style.transform = "translate(-50%, -50%)";
  label.style.display = "none";
  label.style.pointerEvents = "auto";
  label.style.cursor = "pointer";
  label.style.padding = "2px 6px";
  label.style.borderRadius = "8px";
  label.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  label.style.background = "rgba(18, 20, 26, 0.92)";
  label.style.color = "rgba(230, 232, 238, 0.98)";
  label.style.fontSize = "12px";
  label.style.lineHeight = "18px";
  label.style.userSelect = "none";
  label.style.whiteSpace = "nowrap";
  root.appendChild(label);

  const input = wallEditHud.input;
  input.type = "text";
  input.inputMode = "numeric";
  input.placeholder = "mm";
  input.style.position = "absolute";
  input.style.display = "none";
  input.style.pointerEvents = "auto";
  input.style.zIndex = "12";
  input.style.width = "88px";
  input.style.height = "22px";
  input.style.borderRadius = "7px";
  input.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  input.style.background = "#0f1117";
  input.style.color = "var(--text)";
  input.style.padding = "0 6px";
  input.style.fontSize = "12px";
  input.style.outline = "none";
  root.appendChild(input);

  const oLabel = wallEditHud.offsetLabel;
  oLabel.style.position = "absolute";
  oLabel.style.transform = "translate(-50%, -50%)";
  oLabel.style.display = "none";
  oLabel.style.pointerEvents = "auto";
  oLabel.style.cursor = "pointer";
  oLabel.style.padding = "2px 6px";
  oLabel.style.borderRadius = "8px";
  oLabel.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  oLabel.style.background = "rgba(18, 20, 26, 0.92)";
  oLabel.style.color = "rgba(230, 232, 238, 0.98)";
  oLabel.style.fontSize = "12px";
  oLabel.style.lineHeight = "18px";
  oLabel.style.userSelect = "none";
  oLabel.style.whiteSpace = "nowrap";
  root.appendChild(oLabel);

  const oInput = wallEditHud.offsetInput;
  oInput.type = "text";
  oInput.inputMode = "numeric";
  oInput.placeholder = "mm";
  oInput.style.position = "absolute";
  oInput.style.display = "none";
  oInput.style.pointerEvents = "auto";
  oInput.style.zIndex = "12";
  oInput.style.width = "88px";
  oInput.style.height = "22px";
  oInput.style.borderRadius = "7px";
  oInput.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  oInput.style.background = "#0f1117";
  oInput.style.color = "var(--text)";
  oInput.style.padding = "0 6px";
  oInput.style.fontSize = "12px";
  oInput.style.outline = "none";
  root.appendChild(oInput);

  const marquee: MarqueeState = {
    active: false,
    pending: false,
    pointerId: null,
    hitSomething: false,
    startX: 0,
    startY: 0,
    mode: "contain"
  };
  const marqueeEl = document.createElement("div");
  marqueeEl.style.position = "absolute";
  marqueeEl.style.border = "1px solid rgba(255, 209, 102, 0.95)";
  marqueeEl.style.background = "rgba(255, 209, 102, 0.08)";
  marqueeEl.style.display = "none";
  marqueeEl.style.pointerEvents = "none";
  measureOverlay.appendChild(marqueeEl);

  const measureState: MeasureState = {
    enabled: false,
    axisLock: false,
    firstPoint: null,
    hoverPoint: null,
    hoverSnap: "none",
    previewLine: null,
    previewLabel: null,
    previewLineEl: null,
    previewStartEl: null,
    previewEndEl: null,
    firstPointEl: null,
    measures: []
  };

  const firstPointEl = document.createElement("div");
  firstPointEl.style.position = "absolute";
  firstPointEl.style.width = "20px";
  firstPointEl.style.height = "20px";
  firstPointEl.style.transform = "translate(-50%, -50%)";
  firstPointEl.style.display = "none";
  firstPointEl.style.pointerEvents = "none";
  firstPointEl.innerHTML = `
    <div style="position:absolute;left:9px;top:0;width:2px;height:20px;background:#ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.45),0 0 10px rgba(255,92,138,0.65);"></div>
    <div style="position:absolute;left:0;top:9px;width:20px;height:2px;background:#ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.45),0 0 10px rgba(255,92,138,0.65);"></div>
    <div style="position:absolute;inset:4px;border:2px solid #ff5c8a;border-radius:999px;"></div>
  `;
  measureOverlay.appendChild(firstPointEl);
  measureState.firstPointEl = firstPointEl;

  function clearPreview() {
    if (measureState.previewLine) {
      args.scene.remove(measureState.previewLine);
      measureState.previewLine.geometry.dispose();
      (measureState.previewLine.material as THREE.Material).dispose();
      measureState.previewLine = null;
    }
    if (measureState.previewLabel) {
      measureState.previewLabel.remove();
      measureState.previewLabel = null;
    }
    if (measureState.previewLineEl) {
      measureState.previewLineEl.remove();
      measureState.previewLineEl = null;
    }
    if (measureState.previewStartEl) {
      measureState.previewStartEl.remove();
      measureState.previewStartEl = null;
    }
    if (measureState.previewEndEl) {
      measureState.previewEndEl.remove();
      measureState.previewEndEl = null;
    }
  }

  function setFirstPointMarker(point: THREE.Vector3 | null) {
    if (!measureState.firstPointEl) return;
    if (!point) {
      measureState.firstPointEl.style.display = "none";
      return;
    }
    const rect = args.viewerEl.getBoundingClientRect();
    const s = worldToScreen(point, args.getCamera(), rect);
    measureState.firstPointEl.style.left = `${s.x}px`;
    measureState.firstPointEl.style.top = `${s.y}px`;
    measureState.firstPointEl.style.display = "block";
  }

  function makeEndpointMarker(color: string) {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.width = "16px";
    el.style.height = "16px";
    el.style.borderRadius = "999px";
    el.style.border = `3px solid ${color}`;
    el.style.background = "rgba(12,14,18,0.94)";
    el.style.transform = "translate(-50%, -50%)";
    el.style.pointerEvents = "none";
    el.style.boxShadow = `0 0 0 2px rgba(255,255,255,0.18), 0 0 16px ${color}55`;
    measureOverlay.appendChild(el);
    return el;
  }

  function makeScreenLine(color: string) {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.height = "6px";
    el.style.borderRadius = "999px";
    el.style.background = color;
    el.style.transformOrigin = "0 50%";
    el.style.pointerEvents = "none";
    el.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.24), 0 0 18px rgba(136,247,255,0.5)";
    measureOverlay.appendChild(el);
    return el;
  }

  function positionScreenLine(el: HTMLDivElement, a: THREE.Vector2, b: THREE.Vector2) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    el.style.left = `${a.x}px`;
    el.style.top = `${a.y}px`;
    el.style.width = `${len}px`;
    el.style.transform = `translateY(-50%) rotate(${Math.atan2(dy, dx)}rad)`;
    el.style.display = len > 0.5 ? "block" : "none";
  }

  function positionMarker(el: HTMLDivElement, point: THREE.Vector2) {
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    el.style.display = "block";
  }

  function positionMeasureLabel(el: HTMLDivElement, a: THREE.Vector2, b: THREE.Vector2) {
    const midX = (a.x + b.x) * 0.5;
    const midY = (a.y + b.y) * 0.5;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    let offX = 0;
    let offY = -22;
    if (len > 1e-6) {
      let perpX = -dy / len;
      let perpY = dx / len;
      if (perpY > 0) {
        perpX *= -1;
        perpY *= -1;
      }
      offX = perpX * 20;
      offY = perpY * 20 - 8;
    }
    el.style.left = `${midX + offX}px`;
    el.style.top = `${midY + offY}px`;
  }

  function updateHoverCursor(point: THREE.Vector2, kind: HoverSnapKind) {
    args.snapOverlay.showAt(point, kind);
  }

  function hideHoverCursor() {
    args.snapOverlay.hide();
  }

  args.axisLockEl.addEventListener("change", () => {
    measureState.axisLock = args.axisLockEl.checked;
  });

  args.measureBtn.addEventListener("click", () => {
    args.measureBtn.textContent = measureState.enabled ? "Measure: On" : "Measure: Off";
  });

  function clearAllMeasurements() {
    for (const m of measureState.measures) {
      args.scene.remove(m.line);
      m.line.geometry.dispose();
      (m.line.material as THREE.Material).dispose();
      m.label.remove();
      m.lineEl.remove();
      m.startEl.remove();
      m.endEl.remove();
    }
    measureState.measures = [];
    measureState.firstPoint = null;
    measureState.hoverPoint = null;
    measureState.hoverSnap = "none";
    clearPreview();
    setFirstPointMarker(null);
    hideHoverCursor();
    args.measureReadoutEl.textContent = measureState.enabled ? "Click 2 points to measure." : "";
  }

  args.clearMeasuresBtn.addEventListener("click", clearAllMeasurements);

  function addMeasurement(a: THREE.Vector3, b: THREE.Vector3, distanceMm = planarDistanceMm(a, b)) {
    const y = Math.max(a.y, b.y) + 0.002;
    const p1 = new THREE.Vector3(a.x, y, a.z);
    const p2 = new THREE.Vector3(b.x, y, b.z);

    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const material = new THREE.LineBasicMaterial({ color: 0x88f7ff, transparent: true, opacity: 0.98 });
    const line = new THREE.Line(geometry, material);
    line.name = "measureLine";
    args.scene.add(line);

    const label = document.createElement("div");
    label.style.position = "absolute";
    label.style.transform = "translate(-50%, -50%)";
    label.style.padding = "4px 8px";
    label.style.borderRadius = "10px";
    label.style.border = "1px solid rgba(255,255,255,0.35)";
    label.style.background = "rgba(8,10,14,0.94)";
    label.style.color = "#ffffff";
    label.style.fontSize = "12px";
    label.style.fontWeight = "700";
    label.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
    label.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)";
    label.style.whiteSpace = "nowrap";

    label.textContent = `${Math.round(distanceMm)} mm`;
    measureOverlay.appendChild(label);

    const lineEl = makeScreenLine("rgba(136,247,255,0.95)");
    const startEl = makeEndpointMarker("#ff5c8a");
    const endEl = makeEndpointMarker("#00e5ff");

    measureState.measures.push({ a: a.clone(), b: b.clone(), line, label, lineEl, startEl, endEl });
    args.measureReadoutEl.textContent = `Measured: ${Math.round(distanceMm)} mm`;
  }

  function updateMeasureLabels() {
    if (measureState.measures.length === 0) return;

    const rect = args.viewerEl.getBoundingClientRect();
    for (const m of measureState.measures) {
      const sa = worldToScreen(m.a, args.getCamera(), rect);
      const sb = worldToScreen(m.b, args.getCamera(), rect);
      positionMeasureLabel(m.label, sa, sb);
      positionScreenLine(m.lineEl, sa, sb);
      positionMarker(m.startEl, sa);
      positionMarker(m.endEl, sb);
    }
    setFirstPointMarker(measureState.firstPoint);
  }

  function updatePreview(a: THREE.Vector3, b: THREE.Vector3, rect: DOMRect, distanceMm = planarDistanceMm(a, b)) {
    const y = Math.max(a.y, b.y) + 0.002;
    const p1 = new THREE.Vector3(a.x, y, a.z);
    const p2 = new THREE.Vector3(b.x, y, b.z);

    if (!measureState.previewLine) {
      const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const material = new THREE.LineBasicMaterial({ color: 0x88f7ff, transparent: true, opacity: 1 });
      const line = new THREE.Line(geometry, material);
      line.name = "measurePreviewLine";
      args.scene.add(line);
      measureState.previewLine = line;
    } else {
      measureState.previewLine.geometry.setFromPoints([p1, p2]);
    }

    if (!measureState.previewLabel) {
      const previewLabel = document.createElement("div");
      previewLabel.style.position = "absolute";
      previewLabel.style.transform = "translate(-50%, -50%)";
      previewLabel.style.padding = "4px 8px";
      previewLabel.style.borderRadius = "10px";
      previewLabel.style.border = "1px solid rgba(255,255,255,0.4)";
      previewLabel.style.background = "rgba(8,10,14,0.96)";
      previewLabel.style.color = "#ffffff";
      previewLabel.style.fontSize = "12px";
      previewLabel.style.fontWeight = "700";
      previewLabel.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
      previewLabel.style.boxShadow = "0 8px 24px rgba(0,0,0,0.32)";
      previewLabel.style.whiteSpace = "nowrap";
      measureOverlay.appendChild(previewLabel);
      measureState.previewLabel = previewLabel;
    }
    if (!measureState.previewLineEl) {
      measureState.previewLineEl = makeScreenLine("rgba(136,247,255,1)");
      measureState.previewStartEl = makeEndpointMarker("#ff5c8a");
      measureState.previewEndEl = makeEndpointMarker("#00e5ff");
    }

    measureState.previewLabel.textContent = `${Math.round(distanceMm)} mm`;

    const sa = worldToScreen(a, args.getCamera(), rect);
    const sb = worldToScreen(b, args.getCamera(), rect);
    positionMeasureLabel(measureState.previewLabel, sa, sb);
    positionScreenLine(measureState.previewLineEl, sa, sb);
    if (measureState.previewStartEl) positionMarker(measureState.previewStartEl, sa);
    if (measureState.previewEndEl) positionMarker(measureState.previewEndEl, sb);
  }

  return {
    measureOverlay,
    wallTypedHud,
    wallEditHud,
    marquee,
    marqueeEl,
    measureState,
    addMeasurement,
    updateMeasureLabels,
    updatePreview,
    clearPreview,
    setFirstPointMarker,
    clearAllMeasurements,
    updateHoverCursor,
    hideHoverCursor
  };
}

export function applyMeasureAxisAssist(
  firstPoint: THREE.Vector3 | null,
  point: THREE.Vector3,
  camera: THREE.Camera,
  rect: DOMRect,
  thresholdPx = 12
) {
  if (!firstPoint) return null;
  const axisPoint = axisLockXZ(firstPoint, point);
  const rawScreen = worldToScreen(point, camera, rect);
  const axisScreen = worldToScreen(axisPoint, camera, rect);
  const dx = rawScreen.x - axisScreen.x;
  const dy = rawScreen.y - axisScreen.y;
  const distancePx = Math.hypot(dx, dy);
  if (distancePx > thresholdPx) return null;
  return { point: axisPoint, distancePx };
}
