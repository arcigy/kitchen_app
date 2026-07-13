import * as THREE from "three";
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
const LABEL_HIT_WIDTH_PX = 58;
const LABEL_HIT_HEIGHT_PX = 30;
const BASE_COLOR = "#333333";
const ACTIVE_COLOR = "#000fff";

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
    selected?.worktopId === source.worktopId &&
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
      size: [Math.round(rect.width), Math.round(rect.height)],
      selectedModuleIds,
      selectedWorktopSegment,
      sources: sources.map((source) => [
        source.id,
        Math.round(source.lengthMm),
        Math.round(getWorktopEdgeLengthMm(source)),
        Math.round((source.worktopEdgeStart ?? source.start).x * 1000),
        Math.round((source.worktopEdgeStart ?? source.start).z * 1000),
        Math.round((source.worktopEdgeEnd ?? source.end).x * 1000),
        Math.round((source.worktopEdgeEnd ?? source.end).z * 1000),
        Math.round(source.reservedStartMm),
        Math.round(source.reservedEndMm),
        source.reservedStartArm?.moduleId ?? "",
        source.reservedStartArm?.axis ?? "",
        source.reservedEndArm?.moduleId ?? "",
        source.reservedEndArm?.axis ?? "",
        ...source.modules.flatMap((module) => [module.id, Math.round(module.centerMm), Math.round(module.widthMm)])
      ]),
      blockers: blockers.map((blocker) => [blocker.id, blocker.minX, blocker.maxX, blocker.minZ, blocker.maxZ].map((value) => typeof value === "number" ? Math.round(value * 1000) : value)),
      camera: [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements].map((value) => Math.round(value * 10000))
    });
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
    const text = (value: string, a: THREE.Vector2, b: THREE.Vector2, color: string) => {
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      let angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
      drawing.save();
      drawing.translate(midX, midY);
      drawing.rotate(angle);
      drawing.font = "600 12px Inter, Arial, sans-serif";
      drawing.textAlign = "center";
      drawing.textBaseline = "middle";
      const width = drawing.measureText(value).width + 8;
      drawing.fillStyle = "rgba(255,255,255,0.92)";
      drawing.fillRect(-width / 2, -9, width, 18);
      drawing.fillStyle = color;
      drawing.fillText(value, 0, 0);
      drawing.restore();
    };
    const tick = (point: THREE.Vector2, direction: THREE.Vector2, color: string, width = 1.2) => {
      const perpendicular = new THREE.Vector2(-direction.y, direction.x).normalize().multiplyScalar(5);
      const along = direction.clone().normalize().multiplyScalar(3);
      stroke(point.clone().sub(perpendicular).sub(along), point.clone().add(perpendicular).add(along), color, width);
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
      const direction = screen(worktopEdgeWorldAt(source, worktopEdgeLengthMm, outerOffsetMm))
        .sub(screen(worktopEdgeWorldAt(source, 0, outerOffsetMm)))
        .normalize();
      const innerStart = screen(worldAt(source, 0, innerOffsetMm));
      const innerEnd = screen(worldAt(source, source.lengthMm, innerOffsetMm));
      const outerStart = screen(worktopEdgeWorldAt(source, 0, outerOffsetMm));
      const outerEnd = screen(worktopEdgeWorldAt(source, worktopEdgeLengthMm, outerOffsetMm));
      const worktopSelected = selectedWorktopSegment?.worktopId === source.worktopId &&
        selectedWorktopSegment.segmentIndex === source.segmentIndex;
      const worktopAdjacent = selectedWorktopSegment?.worktopId === source.worktopId &&
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
          ACTIVE_COLOR,
          3
        );
      }
      stroke(screen(worktopEdgeWorldAt(source, 0, 0)), outerStart, BASE_COLOR, 0.9);
      stroke(screen(worktopEdgeWorldAt(source, worktopEdgeLengthMm, 0)), outerEnd, BASE_COLOR, 0.9);
      const outerColor = worktopSelected || worktopAdjacent ? ACTIVE_COLOR : BASE_COLOR;
      stroke(outerStart, outerEnd, outerColor, worktopSelected || worktopAdjacent ? 1.8 : 1.25);
      tick(outerStart, direction, outerColor);
      tick(outerEnd, direction, outerColor);
      text(String(Math.round(worktopEdgeLengthMm)), outerStart, outerEnd, outerColor);
      const outerCenter = outerStart.clone().add(outerEnd).multiplyScalar(0.5);
      const outerHit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      outerHit.setAttribute("x", String(outerCenter.x - LABEL_HIT_WIDTH_PX / 2));
      outerHit.setAttribute("y", String(outerCenter.y - LABEL_HIT_HEIGHT_PX / 2));
      outerHit.setAttribute("width", String(LABEL_HIT_WIDTH_PX));
      outerHit.setAttribute("height", String(LABEL_HIT_HEIGHT_PX));
      outerHit.setAttribute("fill", "transparent");
      outerHit.style.pointerEvents = "auto";
      outerHit.style.cursor = "text";
      outerHit.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showWorktopInput(event, source);
      });
      hitSvg.appendChild(outerHit);
      if (source.modules.length === 0 && !source.reservedStartArm && !source.reservedEndArm) continue;
      stroke(innerStart, innerEnd, BASE_COLOR, 1.05);

      const boundaries = new Set<number>([0, source.lengthMm]);
      for (const segment of chain.segments) {
        boundaries.add(segment.startMm);
        boundaries.add(segment.endMm);
        const a = screen(worldAt(source, segment.startMm, innerOffsetMm));
        const b = screen(worldAt(source, segment.endMm, innerOffsetMm));
        const selected = !!segment.moduleId && selectedModuleIds.includes(segment.moduleId);
        const color = selected || segment.editable?.startsWith("gap") ? ACTIVE_COLOR : BASE_COLOR;
        text(String(Math.round(segment.valueMm)), a, b, color);
        if (!segment.editable || !segment.moduleId) continue;
        const center = a.clone().add(b).multiplyScalar(0.5);
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hit.setAttribute("x", String(center.x - LABEL_HIT_WIDTH_PX / 2));
        hit.setAttribute("y", String(center.y - LABEL_HIT_HEIGHT_PX / 2));
        hit.setAttribute("width", String(LABEL_HIT_WIDTH_PX));
        hit.setAttribute("height", String(LABEL_HIT_HEIGHT_PX));
        hit.setAttribute("fill", "transparent");
        hit.style.pointerEvents = "auto";
        hit.style.cursor = "text";
        hit.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          showInput(event, segment);
        });
        hitSvg.appendChild(hit);
      }
      for (const boundaryMm of boundaries) {
        tick(screen(worldAt(source, boundaryMm, innerOffsetMm)), direction, BASE_COLOR);
      }
    }
    root.replaceChildren(canvas, hitSvg, input);
  };

  return {
    sync,
    hide,
    destroy() {
      root.remove();
    }
  };
}
