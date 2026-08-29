import { MathUtils } from "three";
import {
  floorPointDistMm,
  floorSegmentsToBoundary
} from "./floorBoundaryEdit";
import {
  PLAN_LINE_DRAW_TOOL_IDS,
  alignPlanLineSegmentToReference,
  movePlanLineSegmentToParallelDistance,
  offsetPlanLinePath,
  resolvePlanLineAutoAxisSnap,
  resolvePlanLineCombinedAxisSnap,
  resolvePlanLineParallelDimension,
  resolvePlanLineTrackedAxisSnap,
  selectPlanLineSegmentsInRect,
  trimExtendPlanLineSegmentsToCorner,
  type PlanLineDrawToolId
} from "./planLineDrawingTool";
import type { CustomFurnitureParams, CustomFurniturePlanPoint } from "../layout/customFurnitureTypes";

export type CustomFurnitureBoundaryFilletMeta = {
  id: string;
  radiusMm: number;
  corner: CustomFurniturePlanPoint;
  otherA: CustomFurniturePlanPoint;
  otherB: CustomFurniturePlanPoint;
  center: CustomFurniturePlanPoint;
};

export type CustomFurnitureBoundarySegment = {
  a: CustomFurniturePlanPoint;
  b: CustomFurniturePlanPoint;
  arcPoints?: CustomFurniturePlanPoint[];
  fillet?: CustomFurnitureBoundaryFilletMeta;
  filletRole?: "leg" | "arc";
  cut?: {
    id: string;
    gapMm: number;
    originalA: CustomFurniturePlanPoint;
    originalB: CustomFurniturePlanPoint;
    centerDistanceMm: number;
  };
};

export type CustomFurnitureBoundaryVertexRef = { segmentIndex: number; endpoint: "a" | "b" };

export type CustomFurnitureBoundaryEditState = {
  segments: CustomFurnitureBoundarySegment[];
  first: CustomFurniturePlanPoint | null;
  hover: CustomFurniturePlanPoint | null;
  draftPoints: CustomFurniturePlanPoint[];
  selectedSegmentIndex: number | null;
  selectedSegmentIndexes?: number[];
  selectedVertex: CustomFurnitureBoundaryVertexRef | null;
};

type CustomFurnitureScreenRect = { x0: number; y0: number; x1: number; y1: number };
type CustomFurnitureTrackedAxisSnap = { point: CustomFurniturePlanPoint; axis: "x" | "z" };
type CustomFurnitureParallelBoundaryDimension = {
  segmentIndex: number;
  referenceSegmentIndex: number;
  distanceMm: number;
  signedDistanceMm: number;
  selectedPoint: CustomFurniturePlanPoint;
  referencePoint: CustomFurniturePlanPoint;
  dir: { x: number; z: number };
  normal: { x: number; z: number };
};

export type CustomFurnitureSharedDrawToolId = PlanLineDrawToolId;

export const cloneCustomFurnitureBoundarySegments = (segments: CustomFurnitureBoundarySegment[]): CustomFurnitureBoundarySegment[] =>
  segments.map((segment) => ({
    a: { ...segment.a },
    b: { ...segment.b },
    ...(segment.arcPoints ? { arcPoints: segment.arcPoints.map((point) => ({ ...point })) } : {}),
    ...(segment.fillet
      ? {
          fillet: {
            ...segment.fillet,
            corner: { ...segment.fillet.corner },
            otherA: { ...segment.fillet.otherA },
            otherB: { ...segment.fillet.otherB },
            center: { ...segment.fillet.center }
          },
          filletRole: segment.filletRole
        }
      : {}),
    ...(segment.cut
      ? {
          cut: {
            ...segment.cut,
            originalA: { ...segment.cut.originalA },
            originalB: { ...segment.cut.originalB }
          }
        }
      : {})
  }));

export function resolveCustomFurnitureTrackedAxisSnap(
  raw: CustomFurniturePlanPoint,
  tracked: CustomFurniturePlanPoint | null,
  toleranceMm: number
): CustomFurnitureTrackedAxisSnap | null {
  return resolvePlanLineTrackedAxisSnap(raw, tracked, toleranceMm);
}

export function resolveCustomFurnitureAutoAxisSnap(base: CustomFurniturePlanPoint, raw: CustomFurniturePlanPoint) {
  return resolvePlanLineAutoAxisSnap(base, raw);
}

export function resolveCustomFurnitureCombinedAxisSnap(
  raw: CustomFurniturePlanPoint,
  tracked: CustomFurniturePlanPoint | null,
  base: CustomFurniturePlanPoint | null,
  toleranceMm: number
) {
  return resolvePlanLineCombinedAxisSnap(raw, tracked, base, toleranceMm);
}

export function shouldStopCustomFurnitureLineChainOnSnap(
  hasActiveLineStart: boolean,
  snappedToExistingBoundary: boolean,
  snapKind: string
) {
  return (
    hasActiveLineStart &&
    snappedToExistingBoundary &&
    (snapKind === "endpoint" || snapKind === "corner" || snapKind === "midpoint" || snapKind === "edge" || snapKind === "perpendicular")
  );
}

export function resolveCustomFurnitureBoundaryEscapeAction(
  drawTool: string,
  hasInProgressGeometry: boolean
) {
  if (hasInProgressGeometry) return "cancelDraft";
  if (drawTool !== "select") return "selectTool";
  return "clearSelection";
}

export function shouldCustomFurnitureBoundaryDrawFromPickedPoint(
  drawTool: string,
  hasActiveLineStart: boolean
) {
  return !hasActiveLineStart && (drawTool === "boundaryLine" || drawTool === "line" || drawTool === "pickLines");
}

export function shouldCustomFurnitureSelectToolPassThroughEmptyPointer(
  drawTool: string,
  pickedElement: boolean,
  hasBoundaryDrag: boolean
) {
  return drawTool === "select" && !pickedElement && !hasBoundaryDrag;
}

export function selectCustomFurnitureBoundarySegmentsInRect(
  segments: CustomFurnitureBoundarySegment[],
  rect: CustomFurnitureScreenRect,
  toScreen: (point: CustomFurniturePlanPoint) => { x: number; y: number },
  mode: "contain" | "touch" = "contain"
) {
  return selectPlanLineSegmentsInRect(segments, rect, toScreen, mode);
}

export function resolveCustomFurnitureParallelBoundaryDimension(
  segments: CustomFurnitureBoundarySegment[],
  segmentIndex: number
): CustomFurnitureParallelBoundaryDimension | null {
  return resolvePlanLineParallelDimension(segments, segmentIndex);
}

export function moveCustomFurnitureBoundarySegmentToParallelDistance(
  segments: CustomFurnitureBoundarySegment[],
  segmentIndex: number,
  referenceSegmentIndex: number,
  nextDistanceMm: number
) {
  return movePlanLineSegmentToParallelDistance(segments, segmentIndex, referenceSegmentIndex, nextDistanceMm);
}

export function trimExtendCustomFurnitureBoundarySegmentsToCorner(
  segments: CustomFurnitureBoundarySegment[],
  firstIndex: number,
  secondIndex: number
) {
  return trimExtendPlanLineSegmentsToCorner(segments, firstIndex, secondIndex);
}

export function alignCustomFurnitureBoundarySegmentToReference(
  segments: CustomFurnitureBoundarySegment[],
  referenceIndex: number,
  movingIndex: number
) {
  return alignPlanLineSegmentToReference(segments, referenceIndex, movingIndex);
}

const normalizeAngleDelta = (delta: number) => {
  let next = delta;
  while (next <= -Math.PI) next += Math.PI * 2;
  while (next > Math.PI) next -= Math.PI * 2;
  return next;
};

export function createCustomFurnitureBoundaryFilletSegments(
  first: CustomFurnitureBoundarySegment,
  second: CustomFurnitureBoundarySegment,
  radiusMm: number,
  filletId = `fillet_${Date.now()}`
): CustomFurnitureBoundarySegment[] | null {
  const radius = Math.max(1, Math.round(radiusMm));
  const shared =
    floorPointDistMm(first.a, second.a) <= 3
      ? { corner: first.a, firstOther: first.b, secondOther: second.b }
      : floorPointDistMm(first.a, second.b) <= 3
        ? { corner: first.a, firstOther: first.b, secondOther: second.a }
        : floorPointDistMm(first.b, second.a) <= 3
          ? { corner: first.b, firstOther: first.a, secondOther: second.b }
          : floorPointDistMm(first.b, second.b) <= 3
            ? { corner: first.b, firstOther: first.a, secondOther: second.a }
            : null;
  if (!shared) return null;
  const v1 = { x: shared.firstOther.x - shared.corner.x, z: shared.firstOther.z - shared.corner.z };
  const v2 = { x: shared.secondOther.x - shared.corner.x, z: shared.secondOther.z - shared.corner.z };
  const len1 = Math.hypot(v1.x, v1.z);
  const len2 = Math.hypot(v2.x, v2.z);
  if (len1 < 1 || len2 < 1) return null;
  const u1 = { x: v1.x / len1, z: v1.z / len1 };
  const u2 = { x: v2.x / len2, z: v2.z / len2 };
  const dot = MathUtils.clamp(u1.x * u2.x + u1.z * u2.z, -1, 1);
  const angle = Math.acos(dot);
  if (angle < MathUtils.degToRad(5) || Math.PI - angle < MathUtils.degToRad(5)) return null;
  const tangentDistance = radius / Math.tan(angle / 2);
  if (tangentDistance >= len1 - 1 || tangentDistance >= len2 - 1) return null;
  const tangentA = {
    x: Math.round(shared.corner.x + u1.x * tangentDistance),
    z: Math.round(shared.corner.z + u1.z * tangentDistance)
  };
  const tangentB = {
    x: Math.round(shared.corner.x + u2.x * tangentDistance),
    z: Math.round(shared.corner.z + u2.z * tangentDistance)
  };
  const bisectorLength = Math.hypot(u1.x + u2.x, u1.z + u2.z);
  if (bisectorLength < 1e-6) return null;
  const centerDistance = radius / Math.sin(angle / 2);
  const center = {
    x: Math.round(shared.corner.x + ((u1.x + u2.x) / bisectorLength) * centerDistance),
    z: Math.round(shared.corner.z + ((u1.z + u2.z) / bisectorLength) * centerDistance)
  };
  const startAngle = Math.atan2(tangentA.z - center.z, tangentA.x - center.x);
  const endAngle = Math.atan2(tangentB.z - center.z, tangentB.x - center.x);
  const delta = normalizeAngleDelta(endAngle - startAngle);
  const steps = Math.max(3, Math.ceil(Math.abs(delta) / (Math.PI / 18)));
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const angleAt = startAngle + (delta * index) / steps;
    return { x: Math.round(center.x + Math.cos(angleAt) * radius), z: Math.round(center.z + Math.sin(angleAt) * radius) };
  });
  points[0] = tangentA;
  points[points.length - 1] = tangentB;
  const fillet: CustomFurnitureBoundaryFilletMeta = {
    id: filletId,
    radiusMm: radius,
    corner: { ...shared.corner },
    otherA: { ...shared.firstOther },
    otherB: { ...shared.secondOther },
    center
  };
  const result: CustomFurnitureBoundarySegment[] = [
    { a: { ...shared.firstOther }, b: { ...tangentA }, fillet, filletRole: "leg" },
    { a: { ...tangentA }, b: { ...tangentB }, arcPoints: points.map((point) => ({ ...point })), fillet, filletRole: "arc" },
    { a: { ...tangentB }, b: { ...shared.secondOther }, fillet, filletRole: "leg" }
  ];
  return result.filter((segment) => floorPointDistMm(segment.a, segment.b) >= 1);
}

export function applyCustomFurnitureBoundaryFillet(
  segments: CustomFurnitureBoundarySegment[],
  firstIndex: number,
  secondIndex: number,
  radiusMm: number,
  filletId = `fillet_${Date.now()}`
) {
  const first = segments[firstIndex];
  const second = segments[secondIndex];
  if (!first || !second || firstIndex === secondIndex) return cloneCustomFurnitureBoundarySegments(segments);
  const filletSegments = createCustomFurnitureBoundaryFilletSegments(first, second, radiusMm, filletId);
  if (!filletSegments) return cloneCustomFurnitureBoundarySegments(segments);
  const result: CustomFurnitureBoundarySegment[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    if (index === firstIndex) {
      result.push(...filletSegments);
    } else if (index !== secondIndex) {
      result.push(cloneCustomFurnitureBoundarySegments([segments[index]!])[0]!);
    }
  }
  return result;
}

export function customFurnitureBoundarySegmentsToBoundary(segments: CustomFurnitureBoundarySegment[]) {
  const expanded: CustomFurnitureBoundarySegment[] = [];
  for (const segment of segments) expanded.push(...getCustomFurnitureBoundarySegmentPieces(segment));
  return floorSegmentsToBoundary(expanded);
}

export function applyCustomFurnitureBoundaryCut(
  segments: CustomFurnitureBoundarySegment[],
  segmentIndex: number,
  point: CustomFurniturePlanPoint,
  gapMm = 20,
  cutId = `cut_${Date.now()}`
) {
  const segment = segments[segmentIndex];
  if (!segment) return cloneCustomFurnitureBoundarySegments(segments);
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const length = Math.hypot(dx, dz);
  const gap = Math.max(1, Math.round(gapMm));
  if (length <= gap + 2) return cloneCustomFurnitureBoundarySegments(segments);
  const dir = { x: dx / length, z: dz / length };
  const rawDistance = (point.x - segment.a.x) * dir.x + (point.z - segment.a.z) * dir.z;
  const centerDistanceMm = Math.max(gap / 2 + 1, Math.min(length - gap / 2 - 1, Math.round(rawDistance)));
  const cut = {
    id: cutId,
    gapMm: gap,
    originalA: { ...segment.a },
    originalB: { ...segment.b },
    centerDistanceMm
  };
  const leftEnd = {
    x: Math.round(segment.a.x + dir.x * (centerDistanceMm - gap / 2)),
    z: Math.round(segment.a.z + dir.z * (centerDistanceMm - gap / 2))
  };
  const rightStart = {
    x: Math.round(segment.a.x + dir.x * (centerDistanceMm + gap / 2)),
    z: Math.round(segment.a.z + dir.z * (centerDistanceMm + gap / 2))
  };
  const result = cloneCustomFurnitureBoundarySegments(segments);
  result.splice(segmentIndex, 1, { a: { ...segment.a }, b: leftEnd, cut }, { a: rightStart, b: { ...segment.b }, cut });
  return result;
}

export function moveCustomFurnitureBoundaryCut(
  segments: CustomFurnitureBoundarySegment[],
  cutId: string,
  nextCenterDistanceMm: number
) {
  const cutSegment = segments.find((segment) => segment.cut?.id === cutId);
  const cut = cutSegment?.cut;
  if (!cut) return cloneCustomFurnitureBoundarySegments(segments);
  const withoutCut = cloneCustomFurnitureBoundarySegments(segments).filter((segment) => segment.cut?.id !== cutId);
  return [
    ...withoutCut,
    ...applyCustomFurnitureBoundaryCut(
      [{ a: { ...cut.originalA }, b: { ...cut.originalB } }],
      0,
      {
        x: cut.originalA.x + ((cut.originalB.x - cut.originalA.x) / Math.max(1, Math.hypot(cut.originalB.x - cut.originalA.x, cut.originalB.z - cut.originalA.z))) * nextCenterDistanceMm,
        z: cut.originalA.z + ((cut.originalB.z - cut.originalA.z) / Math.max(1, Math.hypot(cut.originalB.x - cut.originalA.x, cut.originalB.z - cut.originalA.z))) * nextCenterDistanceMm
      },
      cut.gapMm,
      cut.id
    )
  ];
}

export function cloneCustomFurnitureBoundaryEditState(state: CustomFurnitureBoundaryEditState): CustomFurnitureBoundaryEditState {
  return {
    segments: cloneCustomFurnitureBoundarySegments(state.segments),
    first: state.first ? { ...state.first } : null,
    hover: state.hover ? { ...state.hover } : null,
    draftPoints: state.draftPoints.map((point) => ({ ...point })),
    selectedSegmentIndex: state.selectedSegmentIndex,
    selectedSegmentIndexes: state.selectedSegmentIndexes ? [...state.selectedSegmentIndexes] : undefined,
    selectedVertex: state.selectedVertex ? { ...state.selectedVertex } : null
  };
}

export function popCustomFurnitureBoundaryUndoState(
  current: CustomFurnitureBoundaryEditState,
  undoStack: CustomFurnitureBoundaryEditState[],
  redoStack: CustomFurnitureBoundaryEditState[]
) {
  const previous = undoStack.pop() ?? null;
  if (!previous) return null;
  redoStack.push(cloneCustomFurnitureBoundaryEditState(current));
  return cloneCustomFurnitureBoundaryEditState(previous);
}

export function popCustomFurnitureBoundaryRedoState(
  current: CustomFurnitureBoundaryEditState,
  undoStack: CustomFurnitureBoundaryEditState[],
  redoStack: CustomFurnitureBoundaryEditState[]
) {
  const next = redoStack.pop() ?? null;
  if (!next) return null;
  undoStack.push(cloneCustomFurnitureBoundaryEditState(current));
  return cloneCustomFurnitureBoundaryEditState(next);
}

export function makeCustomFurnitureRectBoundary(a: CustomFurniturePlanPoint, b: CustomFurniturePlanPoint): CustomFurniturePlanPoint[] {
  return [
    { x: a.x, z: a.z },
    { x: b.x, z: a.z },
    { x: b.x, z: b.z },
    { x: a.x, z: b.z }
  ];
}

export function makeCustomFurnitureCircleBoundary(
  center: CustomFurniturePlanPoint,
  radiusPoint: CustomFurniturePlanPoint,
  steps = 40
): CustomFurniturePlanPoint[] {
  const radius = Math.max(1, Math.hypot(radiusPoint.x - center.x, radiusPoint.z - center.z));
  const count = Math.max(8, Math.round(steps));
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count;
    return {
      x: Math.round(center.x + Math.cos(angle) * radius),
      z: Math.round(center.z + Math.sin(angle) * radius)
    };
  });
}

export function makeCustomFurniturePolygonBoundary(
  center: CustomFurniturePlanPoint,
  corner: CustomFurniturePlanPoint,
  sides = 6
): CustomFurniturePlanPoint[] {
  const count = Math.max(3, Math.round(sides));
  const radius = Math.max(1, Math.hypot(corner.x - center.x, corner.z - center.z));
  const start = Math.atan2(corner.z - center.z, corner.x - center.x);
  return Array.from({ length: count }, (_, index) => {
    const angle = start + (Math.PI * 2 * index) / count;
    return {
      x: Math.round(center.x + Math.cos(angle) * radius),
      z: Math.round(center.z + Math.sin(angle) * radius)
    };
  });
}

export function getCustomFurnitureSharedDrawToolIds(): CustomFurnitureSharedDrawToolId[] {
  return [...PLAN_LINE_DRAW_TOOL_IDS];
}

export function offsetCustomFurniturePlanPath(
  points: CustomFurniturePlanPoint[],
  offsetMm: number,
  direction = 1,
  closed = false
) {
  return offsetPlanLinePath(points, offsetMm, direction, closed);
}

export function getCustomFurnitureBoundarySegmentPieces(segment: CustomFurnitureBoundarySegment) {
  if (segment.arcPoints && segment.arcPoints.length >= 2) {
    const pieces: CustomFurnitureBoundarySegment[] = [];
    for (let index = 0; index < segment.arcPoints.length - 1; index += 1) {
      pieces.push({ a: { ...segment.arcPoints[index]! }, b: { ...segment.arcPoints[index + 1]! } });
    }
    return pieces;
  }
  return [{ a: { ...segment.a }, b: { ...segment.b } }];
}

export function getCustomFurnitureSegmentPathPoints(segment: CustomFurnitureBoundarySegment) {
  return segment.arcPoints && segment.arcPoints.length >= 2
    ? segment.arcPoints.map((point) => ({ ...point }))
    : [{ ...segment.a }, { ...segment.b }];
}

export function customFurniturePlanPathLengthMm(points: CustomFurniturePlanPoint[]) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) length += floorPointDistMm(points[index]!, points[index + 1]!);
  return length;
}

export function getCustomFurniturePlanSegmentsForParams(params: Pick<CustomFurnitureParams, "boundary" | "boundarySegments" | "boards">) {
  const segments: CustomFurnitureBoundarySegment[] = [];
  const addSegment = (a: CustomFurniturePlanPoint, b: CustomFurniturePlanPoint) => {
    if (floorPointDistMm(a, b) >= 2) segments.push({ a: { ...a }, b: { ...b } });
  };
  if (params.boundarySegments && params.boundarySegments.length > 0) {
    segments.push(...cloneCustomFurnitureBoundarySegments(params.boundarySegments));
  } else if (params.boundary.length >= 2) {
    for (let index = 0; index < params.boundary.length; index += 1) addSegment(params.boundary[index]!, params.boundary[(index + 1) % params.boundary.length]!);
  }
  for (const board of params.boards) {
    if (board.workplane.type === "vertical") {
      const path = board.workplane.pathMm && board.workplane.pathMm.length >= 2 ? board.workplane.pathMm : [board.workplane.aMm, board.workplane.bMm];
      for (let index = 0; index < path.length - 1; index += 1) addSegment(path[index]!, path[index + 1]!);
    } else {
      for (let index = 0; index < board.profile.length; index += 1) {
        const a = board.profile[index]!;
        const b = board.profile[(index + 1) % board.profile.length]!;
        addSegment({ x: a.x, z: a.y }, { x: b.x, z: b.y });
      }
    }
  }
  return segments;
}
