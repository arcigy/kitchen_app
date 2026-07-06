import type { PlanSnapKind } from "./planSnap";

export type SnapKindPriority = Array<Exclude<PlanSnapKind, "none">>;

export const SNAP_PRIORITY_DEFAULT = ["corner", "endpoint", "perpendicular", "midpoint", "edge", "axis"] satisfies SnapKindPriority;
export const SNAP_PRIORITY_MEASURE = SNAP_PRIORITY_DEFAULT;
export const SNAP_PRIORITY_WALL_DRAW = SNAP_PRIORITY_DEFAULT;
export const SNAP_PRIORITY_BOUNDARY_DRAW = SNAP_PRIORITY_DEFAULT;
export const SNAP_PRIORITY_EDGE_FIRST = ["edge", "midpoint", "perpendicular", "endpoint", "corner"] satisfies SnapKindPriority;
export const SNAP_PRIORITY_MOVE_TARGET = ["endpoint", "midpoint", "corner", "perpendicular", "edge", "axis"] satisfies SnapKindPriority;
export const SNAP_PRIORITY_MOVE_OBJECT_POINTS = ["endpoint", "corner", "midpoint", "perpendicular"] satisfies SnapKindPriority;
export const SNAP_PRIORITY_MOVE_OBJECT_LINES = ["edge", "axis"] satisfies SnapKindPriority;

export const SNAP_DISTANCE_PX = {
  wallDraw: 14,
  planDefault: 14,
  wallDrawSticky: 18,
  wallDrawAlignmentPx: 28,
  measure2d: 24,
  measure2dAxis: 12,
  measure3d: 32,
  measure3dAxis: 12,
  alignPick: 12,
  dimensionPick: 24,
  wallLinePick: 14,
  floorEditVertex: 12,
  floorEditSegment: 10,
  transformRotate: 24,
  moveTarget: 28,
  moveSticky: 30,
  moveObject: 26,
  moveObjectFree: 18,
  columnPlacement: 24,
  columnPlacementSticky: 28,
  customBoundaryExternal: 24,
  customBoundarySticky: 28,
  customBoundaryLocal: 18,
  customBoundaryPick: 12,
  customBoundarySegmentPick: 10
} as const;

export const SNAP_DISTANCE_M = {
  wallDrawAlignmentMin: 0.035,
  wallDrawAlignmentMax: 0.24,
  wallDrawAlignmentPerspective: 0.11,
  wallDrawAlignmentPrecision: 0.0015,
  moduleAdjacency: 0.08,
  moduleAdjacencyDetach: 0.14,
  moduleAdjacencyMinOverlap: 0.05,
  moduleAdjacencyVisualTolerance: 0.008,
  kitchenModulePlacement: 2.4,
  kitchenKeyboardPlacement: 0.12,
  legacySurfaceMeasure: 0.015
} as const;

export const SNAP_KIND_SCORE: Partial<Record<Exclude<PlanSnapKind, "none">, number>> = {
  endpoint: 0.42,
  corner: 0.48,
  midpoint: 0.7,
  perpendicular: 0.82,
  edge: 1,
  axis: 1.08
};
