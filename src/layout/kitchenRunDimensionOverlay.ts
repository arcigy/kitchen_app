import * as THREE from "three";
import { getTechnicalColors } from "../app/viewportAppearance";
import { drawProjectedDimension } from "../app/dimensionDrawing";
import {
  resolveKitchenRunDimensionChain,
  type KitchenRunDimensionSegment,
  type KitchenRunDimensionSource
} from "./kitchenRunDimensions";
import {
  createDimensionEditInput,
  parseDimensionMillimeters,
  showDimensionInputAtPointer
} from "../app/pointerDimensionInputControls";
import type { KitchenWorktopSegmentRef } from "./worktopSegmentEditing";

export type KitchenRunDimensionBlocker = {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type KitchenRunDimensionEditResult =
  | { ok: true; appliedValueMm: number; clamped: boolean }
  | { ok: false; reason: string };

export type KitchenRunDimensionOverlayContext = {
  host: HTMLElement;
  getCamera: () => THREE.Camera;
  worldToScreen: (world: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) => THREE.Vector2;
  getSources: () => KitchenRunDimensionSource[];
  getSelectedModuleIds: () => string[];
  getSelectedWorktopSegment: () => KitchenWorktopSegmentRef | null;
  getBlockingModules: () => KitchenRunDimensionBlocker[];
  selectModule: (instanceId: string) => void;
  selectWorktopSegment: (worktopId: string, segmentIndex: number) => void;
  editModuleWidth: (instanceId: string, widthMm: number) => KitchenRunDimensionEditResult;
  editCornerArm: (instanceId: string, axis: "x" | "z", lengthMm: number) => KitchenRunDimensionEditResult;
  editModuleGap: (instanceId: string, side: "before" | "after", gapMm: number) => KitchenRunDimensionEditResult;
  editWorktopLength: (worktopId: string, segmentIndex: number, lengthMm: number) => KitchenRunDimensionEditResult;
  editWorktopAdjacentOffset: (
    worktopId: string,
    selectedSegmentIndex: number,
    adjacentSegmentIndex: number,
    lengthMm: number
  ) => KitchenRunDimensionEditResult;
  setStatus: (message: string) => void;
};

type ActiveEdit =
  | {
      kind: "module";
      moduleId: string;
      edit: "width" | "gap-before" | "gap-after" | "corner-arm";
      cornerAxis?: "x" | "z";
    }
  | {
      kind: "worktop";
      worktopId: string;
      segmentIndex: number;
      adjacentSegmentIndex?: number;
    };

const BASE_DIMENSION_OFFSET_MM = 240;
const TOTAL_DIMENSION_EXTRA_MM = 170;
const BLOCKER_PADDING_M = 0.08;

function segmentIntersectsBounds(
  start: { x: number; z: number },
  end: { x: number; z: number },
  bounds: KitchenRunDimensionBlocker
) {
  const minX = bounds.minX - BLOCKER_PADDING_M;
  const maxX = bounds.maxX + BLOCKER_PADDING_M;
  const minZ = bounds.minZ - BLOCKER_PADDING_M;
  const maxZ = bounds.maxZ + BLOCKER_PADDING_M;
  let tMin = 0;
  let tMax = 1;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  for (const [origin, delta, min, max] of [[start.x, dx, minX, maxX], [start.z, dz, minZ, maxZ]] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const inverse = 1 / delta;
    let a = (min - origin) * inverse;
    let b = (max - origin) * inverse;
    if (a > b) [a, b] = [b, a];
    tMin = Math.max(tMin, a);
    tMax = Math.min(tMax, b);
    if (tMin > tMax) return false;
  }
  return true;
}

function offsetLine(source: KitchenRunDimensionSource, offsetMm: number) {
  const offsetM = offsetMm / 1000;
  return {
    start: {
      x: source.start.x + source.frontNormal.x * offsetM,
      z: source.start.z + source.frontNormal.z * offsetM
    },
    end: {
      x: source.end.x + source.frontNormal.x * offsetM,
      z: source.end.z + source.frontNormal.z * offsetM
    }
  };
}

export function resolveKitchenRunDimensionOffsets(
  source: KitchenRunDimensionSource,
  blockers: readonly KitchenRunDimensionBlocker[]
) {
  const behindOuter = offsetLine(source, -(BASE_DIMENSION_OFFSET_MM + TOTAL_DIMENSION_EXTRA_MM));
  const behindBlocked = blockers.some((blocker) => segmentIntersectsBounds(behindOuter.start, behindOuter.end, blocker));
  const innerOffsetMm = behindBlocked
    ? source.worktopDepthMm + BASE_DIMENSION_OFFSET_MM
    : -BASE_DIMENSION_OFFSET_MM;
  return {
    behindBlocked,
    innerOffsetMm,
    outerOffsetMm: behindBlocked
      ? innerOffsetMm + TOTAL_DIMENSION_EXTRA_MM
      : innerOffsetMm - TOTAL_DIMENSION_EXTRA_MM
  };
}

function worldAt(source: KitchenRunDimensionSource, distanceMm: number, offsetMm: number) {
  const ratio = source.lengthMm > 1e-6 ? distanceMm / source.lengthMm : 0;
  return new THREE.Vector3(
    source.start.x + (source.end.x - source.start.x) * ratio + source.frontNormal.x * offsetMm / 1000,
    0,
    source.start.z + (source.end.z - source.start.z) * ratio + source.frontNormal.z * offsetMm / 1000
  );
}

function getWorktopEdgeLengthMm(source: KitchenRunDimensionSource) {
  return source.worktopEdgeLengthMm ?? source.lengthMm;
}

export function resolveKitchenWorktopDimensionEdit(
  selected: KitchenWorktopSegmentRef | null,
  source: Pick<KitchenRunDimensionSource, "worktopId" | "segmentIndex">
) {
  if (
    selected && selected.worktopId === source.worktopId &&
    Math.abs(selected.segmentIndex - source.segmentIndex) === 1
  ) {
    return {
      segmentIndex: selected.segmentIndex,
      adjacentSegmentIndex: source.segmentIndex
    };
  }
  return { segmentIndex: source.segmentIndex };
}

function worktopEdgeWorldAt(source: KitchenRunDimensionSource, distanceMm: number, offsetMm: number) {
  const start = source.worktopEdgeStart ?? source.start;
  const end = source.worktopEdgeEnd ?? source.end;
  const lengthMm = getWorktopEdgeLengthMm(source);
  const ratio = lengthMm > 1e-6 ? distanceMm / lengthMm : 0;
  return new THREE.Vector3(
    start.x + (end.x - start.x) * ratio + source.frontNormal.x * offsetMm / 1000,
    0,
    start.z + (end.z - start.z) * ratio + source.frontNormal.z * offsetMm / 1000
  );
}

export function createKitchenRunDimensionOverlay(ctx: KitchenRunDimensionOverlayContext) {
  const root = document.createElement("div");
  root.className = "kitchen-run-dimension-chain";
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.zIndex = "17";
  root.style.pointerEvents = "none";
  root.style.display = "none";
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  const hitSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  hitSvg.style.position = "absolute";
  hitSvg.style.inset = "0";
  hitSvg.style.width = "100%";
  hitSvg.style.height = "100%";
  hitSvg.style.pointerEvents = "none";
  let activeEdit: ActiveEdit | null = null;
  let signature = "";
  const input = createDimensionEditInput(document, root, {
    id: "kitchen-run-dimension-input",
    ariaLabel: "Kitchen run dimension",
    onCommit: () => {
      if (!activeEdit) return;
      const valueMm = parseDimensionMillimeters(input.value);
      if (valueMm == null || valueMm < 0) return;
      const result = activeEdit.kind === "worktop"
        ? activeEdit.adjacentSegmentIndex != null
          ? ctx.editWorktopAdjacentOffset(
              activeEdit.worktopId,
              activeEdit.segmentIndex,
              activeEdit.adjacentSegmentIndex,
              valueMm
            )
          : ctx.editWorktopLength(activeEdit.worktopId, activeEdit.segmentIndex, valueMm)
        : activeEdit.edit === "width"
          ? ctx.editModuleWidth(activeEdit.moduleId, valueMm)
          : activeEdit.edit === "corner-arm" && activeEdit.cornerAxis
            ? ctx.editCornerArm(activeEdit.moduleId, activeEdit.cornerAxis, valueMm)
            : ctx.editModuleGap(activeEdit.moduleId, activeEdit.edit === "gap-before" ? "before" : "after", valueMm);
      if (result.ok) {
        ctx.setStatus(result.clamped
          ? `Kitchen dimension: applied ${Math.round(result.appliedValueMm)} mm (limited by worktop).`
          : `Kitchen dimension: applied ${Math.round(result.appliedValueMm)} mm.`);
      } else {
        ctx.setStatus(`Kitchen dimension: ${result.reason}.`);
      }
      signature = "";
    },
    onHide: () => {
      activeEdit = null;
    }
  });
  root.replaceChildren(canvas, hitSvg, input);
  ctx.host.appendChild(root);

  const hide = () => {
    root.style.display = "none";
    signature = "";
    input.style.display = "none";
    activeEdit = null;
  };

  const showInput = (
    event: PointerEvent,
    segment: KitchenRunDimensionSegment
  ) => {
    if (!segment.editable || !segment.moduleId) return;
    activeEdit = { kind: "module", moduleId: segment.moduleId, edit: segment.editable, cornerAxis: segment.cornerAxis };
    ctx.selectModule(segment.moduleId);
    const rect = ctx.host.getBoundingClientRect();
    showDimensionInputAtPointer(input, {
      clientX: event.clientX,
      clientY: event.clientY,
      hostLeft: rect.left,
      hostTop: rect.top,
      value: String(Math.round(segment.valueMm))
    });
  };

  const showWorktopInput = (event: PointerEvent, source: KitchenRunDimensionSource) => {
    if (!source.worktopId) return;
    const selected = ctx.getSelectedWorktopSegment();
    const edit = resolveKitchenWorktopDimensionEdit(selected, source);
    activeEdit = { kind: "worktop", worktopId: source.worktopId, ...edit };
    if (edit.adjacentSegmentIndex == null) ctx.selectWorktopSegment(source.worktopId, source.segmentIndex);
    const rect = ctx.host.getBoundingClientRect();
    showDimensionInputAtPointer(input, {
      clientX: event.clientX,
      clientY: event.clientY,
      hostLeft: rect.left,
      hostTop: rect.top,
      value: String(Math.round(getWorktopEdgeLengthMm(source)))
    });
  };

  const sync = (visible: boolean) => {
    if (!visible) {
      hide();
      return;
    }
    const sources = ctx.getSources();
    const selectedModuleIds = ctx.getSelectedModuleIds();
    const selectedWorktopSegment = ctx.getSelectedWorktopSegment();
    const blockers = ctx.getBlockingModules();
    const rect = ctx.host.getBoundingClientRect();
    const camera = ctx.getCamera();
    camera.updateMatrixWorld(true);
    const nextSignature = JSON.stringify({
      appearance: getTechnicalColors(),
      size: [Math.round(rect.width), Math.round(rect.height)],
      selectedModuleIds,
      selectedWorktopSegment,
      sources,
      blockers,
      camera: [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements]
    // Quantize only the render-cache key. Physical geometry and editable
    // millimetres retain full precision; sub-pixel noise must not detach hits.
    }, (_key, value) => typeof value === 'number' ? Math.round(value * 1e9) / 1e9 : value);
    if (nextSignature === signature && root.style.display === "block") return;
    signature = nextSignature;
    root.style.display = "block";
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    hitSvg.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
    hitSvg.replaceChildren();
    const drawing = canvas.getContext("2d");
    if (!drawing) return;
    drawing.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawing.clearRect(0, 0, rect.width, rect.height);
    drawing.lineCap = "round";
    drawing.lineJoin = "round";

    const screen = (world: THREE.Vector3) => ctx.worldToScreen(world, camera, rect);
    const stroke = (a: THREE.Vector2, b: THREE.Vector2, color: string, width = 1.2) => {
      drawing.strokeStyle = color;
      drawing.lineWidth = width;
      drawing.beginPath();
      drawing.moveTo(a.x, a.y);
      drawing.lineTo(b.x, b.y);
      drawing.stroke();
    };
    const addLabelHit = (bounds: ReturnType<typeof drawProjectedDimension>, onPointerDown: (event: PointerEvent) => void) => {
      if (!bounds) return;
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      for (const [key, value] of Object.entries(bounds)) hit.setAttribute(key, String(value));
      hit.setAttribute("fill", "transparent");
      hit.style.pointerEvents = "auto";
      hit.style.cursor = "text";
      hit.addEventListener("pointerdown", (event) => {
        event.preventDefault(); event.stopPropagation(); onPointerDown(event);
      });
      hitSvg.appendChild(hit);
    };

    for (const source of sources) {
      const { innerOffsetMm, outerOffsetMm } = resolveKitchenRunDimensionOffsets(source, blockers);
      const worktopEdgeLengthMm = getWorktopEdgeLengthMm(source);
      const chain = resolveKitchenRunDimensionChain({
        lengthMm: source.lengthMm,
        reservedStartMm: source.reservedStartMm,
        reservedEndMm: source.reservedEndMm,
        reservedStartArm: source.reservedStartArm,
        reservedEndArm: source.reservedEndArm,
        modules: source.modules,
        selectedModuleIds
      });
      const outerStart = screen(worktopEdgeWorldAt(source, 0, outerOffsetMm));
      const outerEnd = screen(worktopEdgeWorldAt(source, worktopEdgeLengthMm, outerOffsetMm));
      const pixelsPerMeter = outerStart.distanceTo(outerEnd) / (worktopEdgeLengthMm / 1000);
      const worktopSelected = !!selectedWorktopSegment && selectedWorktopSegment.worktopId === source.worktopId &&
        selectedWorktopSegment.segmentIndex === source.segmentIndex;
      const worktopAdjacent = !!selectedWorktopSegment && selectedWorktopSegment.worktopId === source.worktopId &&
        Math.abs(selectedWorktopSegment.segmentIndex - source.segmentIndex) === 1;
      if (worktopSelected) {
        const selectedPolygon = [
          screen(worktopEdgeWorldAt(source, 0, 0)),
          screen(worktopEdgeWorldAt(source, worktopEdgeLengthMm, 0)),
          screen(worktopEdgeWorldAt(source, worktopEdgeLengthMm, source.worktopDepthMm)),
          screen(worktopEdgeWorldAt(source, 0, source.worktopDepthMm))
        ];
        drawing.fillStyle = "rgba(0,15,255,0.10)";
        drawing.beginPath();
        drawing.moveTo(selectedPolygon[0]!.x, selectedPolygon[0]!.y);
        for (const point of selectedPolygon.slice(1)) drawing.lineTo(point.x, point.y);
        drawing.closePath();
        drawing.fill();
        stroke(
          screen(worktopEdgeWorldAt(source, 0, 0)),
          screen(worktopEdgeWorldAt(source, worktopEdgeLengthMm, 0)),
          getTechnicalColors().active,
          3
        );
      }
      const outerColor = worktopSelected || worktopAdjacent ? getTechnicalColors().active : getTechnicalColors().line;
      if (source.worktopId) addLabelHit(drawProjectedDimension(drawing, {
        start: outerStart, end: outerEnd,
        extensionStart: screen(worktopEdgeWorldAt(source, 0, 0)),
        extensionEnd: screen(worktopEdgeWorldAt(source, worktopEdgeLengthMm, 0)),
        pixelsPerMeter, text: String(Math.round(worktopEdgeLengthMm)), color: outerColor
      }), event => showWorktopInput(event, source));
      if (source.modules.length === 0 && !source.reservedStartArm && !source.reservedEndArm) continue;
      for (const segment of chain.segments) {
        const a = screen(worldAt(source, segment.startMm, innerOffsetMm));
        const b = screen(worldAt(source, segment.endMm, innerOffsetMm));
        const selected = !!segment.moduleId && selectedModuleIds.includes(segment.moduleId);
        const color = selected || segment.editable?.startsWith("gap") ? getTechnicalColors().active : getTechnicalColors().line;
        const label = drawProjectedDimension(drawing, {
          start: a, end: b,
          extensionStart: screen(worldAt(source, segment.startMm, 0)),
          extensionEnd: screen(worldAt(source, segment.endMm, 0)),
          pixelsPerMeter, text: String(Math.round(segment.valueMm)), color
        });
        if (!segment.editable || !segment.moduleId) continue;
        addLabelHit(label, event => showInput(event, segment));
      }
    }
    // These nodes stay mounted. Reparenting the focused input here would
    // blur it on the first selection/camera refresh, before the user can type.
  };

  return {
    sync,
    hide,
    destroy() {
      root.remove();
    }
  };
}
