import * as THREE from "three";
import type { AssociativeMeasureKind } from "./measureAssociative";
import type { PlanSnapBinding } from "./planSnap";
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

export type ModuleEditHud = {
  root: HTMLDivElement;
  label: HTMLDivElement;
  input: HTMLInputElement;
  widthLine: HTMLDivElement;
  widthExtA: HTMLDivElement;
  widthExtB: HTMLDivElement;
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
  firstBinding: PlanSnapBinding | null;
  hoverPoint: THREE.Vector3 | null;
  hoverSnap: "none" | "free" | "edge" | "corner" | "endpoint" | "midpoint" | "perpendicular" | "axis";
  previewLine: THREE.Line | null;
  previewLabel: HTMLDivElement | null;
  previewLineEl: HTMLDivElement | null;
  previewStartEl: HTMLDivElement | null;
  previewEndEl: HTMLDivElement | null;
  firstPointEl: HTMLDivElement | null;
  nextMeasureId: number;
  measures: Array<{
    id: string;
    kind: AssociativeMeasureKind;
    aBinding: PlanSnapBinding;
    bBinding: PlanSnapBinding;
    a: THREE.Vector3;
    b: THREE.Vector3;
    line: THREE.Line;
    label: HTMLDivElement | null;
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
  measureOverlay.style.zIndex = "14";
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

  const moduleEditHud: ModuleEditHud = {
    root: document.createElement("div"),
    label: document.createElement("div"),
    input: document.createElement("input"),
    widthLine: document.createElement("div"),
    widthExtA: document.createElement("div"),
    widthExtB: document.createElement("div")
  };

  const root = wallEditHud.root;
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.pointerEvents = "none";
  root.style.zIndex = "9";
  args.viewerEl.appendChild(root);
  moduleEditHud.root = root;

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

  lineBase(moduleEditHud.widthLine, "rgba(61, 220, 151, 0.98)");
  lineBase(moduleEditHud.widthExtA, "rgba(61, 220, 151, 0.85)");
  lineBase(moduleEditHud.widthExtB, "rgba(61, 220, 151, 0.85)");
  root.appendChild(moduleEditHud.widthLine);
  root.appendChild(moduleEditHud.widthExtA);
  root.appendChild(moduleEditHud.widthExtB);

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
  input.id = "wall-edit-length";
  input.name = "wall-edit-length";
  input.type = "text";
  input.inputMode = "numeric";
  input.placeholder = "mm";
  input.setAttribute("aria-label", "Wall length in millimeters");
  input.autocomplete = "off";
  input.style.position = "absolute";
  input.style.display = "none";
  input.style.pointerEvents = "auto";
  input.style.zIndex = "12";
  input.style.width = "88px";
  input.style.height = "22px";
  input.style.borderRadius = "7px";
  input.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  input.style.background = "#0f1117";
  input.style.color = "#ffffff";
  input.style.caretColor = "#ffffff";
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
  oInput.id = "wall-edit-offset";
  oInput.name = "wall-edit-offset";
  oInput.type = "text";
  oInput.inputMode = "numeric";
  oInput.placeholder = "mm";
  oInput.setAttribute("aria-label", "Wall offset in millimeters");
  oInput.autocomplete = "off";
  oInput.style.position = "absolute";
  oInput.style.display = "none";
  oInput.style.pointerEvents = "auto";
  oInput.style.zIndex = "12";
  oInput.style.width = "88px";
  oInput.style.height = "22px";
  oInput.style.borderRadius = "7px";
  oInput.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  oInput.style.background = "#0f1117";
  oInput.style.color = "#ffffff";
  oInput.style.caretColor = "#ffffff";
  oInput.style.padding = "0 6px";
  oInput.style.fontSize = "12px";
  oInput.style.outline = "none";
  root.appendChild(oInput);

  const mLabel = moduleEditHud.label;
  mLabel.style.position = "absolute";
  mLabel.style.transform = "translate(-50%, -50%)";
  mLabel.style.display = "none";
  mLabel.style.pointerEvents = "auto";
  mLabel.style.cursor = "pointer";
  mLabel.style.padding = "2px 6px";
  mLabel.style.borderRadius = "8px";
  mLabel.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  mLabel.style.background = "rgba(18, 20, 26, 0.92)";
  mLabel.style.color = "rgba(230, 232, 238, 0.98)";
  mLabel.style.fontSize = "12px";
  mLabel.style.lineHeight = "18px";
  mLabel.style.userSelect = "none";
  mLabel.style.whiteSpace = "nowrap";
  root.appendChild(mLabel);

  const mInput = moduleEditHud.input;
  mInput.id = "module-edit-width";
  mInput.name = "module-edit-width";
  mInput.type = "text";
  mInput.inputMode = "numeric";
  mInput.placeholder = "mm";
  mInput.setAttribute("aria-label", "Module width in millimeters");
  mInput.autocomplete = "off";
  mInput.style.position = "absolute";
  mInput.style.display = "none";
  mInput.style.pointerEvents = "auto";
  mInput.style.zIndex = "12";
  mInput.style.width = "88px";
  mInput.style.height = "22px";
  mInput.style.borderRadius = "7px";
  mInput.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  mInput.style.background = "#0f1117";
  mInput.style.color = "#ffffff";
  mInput.style.caretColor = "#ffffff";
  mInput.style.padding = "0 6px";
  mInput.style.fontSize = "12px";
  mInput.style.outline = "none";
  root.appendChild(mInput);

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
    firstBinding: null,
    hoverPoint: null,
    hoverSnap: "none",
    previewLine: null,
    previewLabel: null,
    previewLineEl: null,
    previewStartEl: null,
    previewEndEl: null,
    firstPointEl: null,
    nextMeasureId: 1,
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

  function styleMeasureLine(
    line: THREE.Line,
    lineEl: HTMLDivElement,
    kind: AssociativeMeasureKind
  ) {
    if (kind === "normalGuide") {
      const material = line.material as THREE.LineDashedMaterial;
      material.dashSize = 0.08;
      material.gapSize = 0.05;
      material.needsUpdate = true;
      line.computeLineDistances();
      lineEl.style.height = "3px";
      lineEl.style.background = "transparent";
      lineEl.style.boxShadow = "none";
      lineEl.style.backgroundImage =
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.92) 0 10px, rgba(255,255,255,0) 10px 18px)";
    } else {
      const material = line.material as THREE.LineBasicMaterial;
      material.opacity = 0.98;
      material.needsUpdate = true;
      lineEl.style.height = "6px";
      lineEl.style.background = "rgba(136,247,255,0.95)";
      lineEl.style.backgroundImage = "none";
      lineEl.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.24), 0 0 18px rgba(136,247,255,0.5)";
    }
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
      m.label?.remove();
      m.lineEl.remove();
      m.startEl.remove();
      m.endEl.remove();
    }
    measureState.measures = [];
    measureState.firstPoint = null;
    measureState.firstBinding = null;
    measureState.hoverPoint = null;
    measureState.hoverSnap = "none";
    clearPreview();
    setFirstPointMarker(null);
    hideHoverCursor();
    args.measureReadoutEl.textContent = measureState.enabled ? "Click 2 points to measure." : "";
  }

  args.clearMeasuresBtn.addEventListener("click", clearAllMeasurements);

  function updateMeasurementGeometry(
    entry: MeasureState["measures"][number],
    a: THREE.Vector3,
    b: THREE.Vector3,
    distanceMm = planarDistanceMm(a, b)
  ) {
    entry.a.copy(a);
    entry.b.copy(b);
    const y = Math.max(a.y, b.y) + 0.002;
    const p1 = new THREE.Vector3(a.x, y, a.z);
    const p2 = new THREE.Vector3(b.x, y, b.z);
    entry.line.geometry.setFromPoints([p1, p2]);
    if (entry.kind === "normalGuide") {
      (entry.line as THREE.Line).computeLineDistances?.();
      if (entry.label) entry.label.style.display = "none";
    } else if (entry.label) {
      entry.label.textContent = `${Math.round(distanceMm)} mm`;
      entry.label.style.display = "block";
    }
  }

  function addMeasurement(
    a: THREE.Vector3,
    b: THREE.Vector3,
    aBinding: PlanSnapBinding,
    bBinding: PlanSnapBinding,
    options?: { kind?: AssociativeMeasureKind; distanceMm?: number }
  ) {
    const kind = options?.kind ?? "distance";
    const geometry = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const material =
      kind === "normalGuide"
        ? new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.94, dashSize: 0.08, gapSize: 0.05 })
        : new THREE.LineBasicMaterial({ color: 0x88f7ff, transparent: true, opacity: 0.98 });
    const line = new THREE.Line(geometry, material);
    line.name = kind === "normalGuide" ? "measureNormalGuide" : "measureLine";
    args.scene.add(line);

    const label =
      kind === "normalGuide"
        ? null
        : (() => {
            const el = document.createElement("div");
            el.dataset.measureLabel = "true";
            el.style.position = "absolute";
            el.style.transform = "translate(-50%, -50%)";
            el.style.padding = "4px 8px";
            el.style.borderRadius = "10px";
            el.style.border = "1px solid rgba(255,255,255,0.35)";
            el.style.background = "rgba(8,10,14,0.94)";
            el.style.color = "#ffffff";
            el.style.fontSize = "12px";
            el.style.fontWeight = "700";
            el.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
            el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)";
            el.style.whiteSpace = "nowrap";
            measureOverlay.appendChild(el);
            return el;
          })();

    const lineEl = makeScreenLine("rgba(136,247,255,0.95)");
    const startEl = makeEndpointMarker(kind === "normalGuide" ? "#ffe082" : "#ff5c8a");
    const endEl = makeEndpointMarker(kind === "normalGuide" ? "#ffe082" : "#00e5ff");

    const entry = {
      id: `measure_${measureState.nextMeasureId++}`,
      kind,
      aBinding,
      bBinding,
      a: a.clone(),
      b: b.clone(),
      line,
      label,
      lineEl,
      startEl,
      endEl
    };
    if (label) label.dataset.measureId = entry.id;
    styleMeasureLine(line, lineEl, kind);
    updateMeasurementGeometry(entry, a, b, options?.distanceMm ?? planarDistanceMm(a, b));
    measureState.measures.push(entry);
    args.measureReadoutEl.textContent =
      kind === "normalGuide" ? "Normal guide created." : `Measured: ${Math.round(options?.distanceMm ?? planarDistanceMm(a, b))} mm`;
    return entry;
  }

  function updateMeasureLabels() {
    if (measureState.measures.length === 0) return;

    const rect = args.viewerEl.getBoundingClientRect();
    for (const m of measureState.measures) {
      const sa = worldToScreen(m.a, args.getCamera(), rect);
      const sb = worldToScreen(m.b, args.getCamera(), rect);
      if (m.label) positionMeasureLabel(m.label, sa, sb);
      positionScreenLine(m.lineEl, sa, sb);
      positionMarker(m.startEl, sa);
      positionMarker(m.endEl, sb);
    }
    setFirstPointMarker(measureState.firstPoint);
  }

  function updatePreview(
    a: THREE.Vector3,
    b: THREE.Vector3,
    rect: DOMRect,
    distanceMm = planarDistanceMm(a, b),
    options?: { kind?: AssociativeMeasureKind }
  ) {
    const kind = options?.kind ?? "distance";
    const y = Math.max(a.y, b.y) + 0.002;
    const p1 = new THREE.Vector3(a.x, y, a.z);
    const p2 = new THREE.Vector3(b.x, y, b.z);

    if (!measureState.previewLine) {
      const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const material =
        kind === "normalGuide"
          ? new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.94, dashSize: 0.08, gapSize: 0.05 })
          : new THREE.LineBasicMaterial({ color: 0x88f7ff, transparent: true, opacity: 1 });
      const line = new THREE.Line(geometry, material);
      line.name = "measurePreviewLine";
      args.scene.add(line);
      measureState.previewLine = line;
    } else {
      measureState.previewLine.geometry.setFromPoints([p1, p2]);
    }
    if (measureState.previewLine.material.type !== (kind === "normalGuide" ? "LineDashedMaterial" : "LineBasicMaterial")) {
      (measureState.previewLine.material as THREE.Material).dispose();
      measureState.previewLine.material =
        kind === "normalGuide"
          ? new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.94, dashSize: 0.08, gapSize: 0.05 })
          : new THREE.LineBasicMaterial({ color: 0x88f7ff, transparent: true, opacity: 1 });
    }
    if (kind === "normalGuide") {
      (measureState.previewLine as THREE.Line).computeLineDistances?.();
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
    if (kind === "normalGuide") {
      measureState.previewLabel.style.display = "none";
      styleMeasureLine(measureState.previewLine, measureState.previewLineEl, "normalGuide");
      if (measureState.previewStartEl) measureState.previewStartEl.style.borderColor = "#ffe082";
      if (measureState.previewEndEl) measureState.previewEndEl.style.borderColor = "#ffe082";
    } else {
      measureState.previewLabel.textContent = `${Math.round(distanceMm)} mm`;
      measureState.previewLabel.style.display = "block";
      styleMeasureLine(measureState.previewLine, measureState.previewLineEl, "distance");
      if (measureState.previewStartEl) measureState.previewStartEl.style.borderColor = "#ff5c8a";
      if (measureState.previewEndEl) measureState.previewEndEl.style.borderColor = "#00e5ff";
    }

    const sa = worldToScreen(a, args.getCamera(), rect);
    const sb = worldToScreen(b, args.getCamera(), rect);
    if (kind !== "normalGuide") positionMeasureLabel(measureState.previewLabel, sa, sb);
    positionScreenLine(measureState.previewLineEl, sa, sb);
    if (measureState.previewStartEl) positionMarker(measureState.previewStartEl, sa);
    if (measureState.previewEndEl) positionMarker(measureState.previewEndEl, sb);
  }

  return {
    measureOverlay,
    wallTypedHud,
    wallEditHud,
    moduleEditHud,
    marquee,
    marqueeEl,
    measureState,
    addMeasurement,
    updateMeasurementGeometry,
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
