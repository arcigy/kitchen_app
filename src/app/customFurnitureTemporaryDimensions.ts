import {
  moveCustomFurnitureBoundarySegmentToParallelDistance,
  resolveCustomFurnitureParallelBoundaryDimension,
  type CustomFurnitureBoundarySegment
} from "./customFurnitureBoundaryEditing";

export type CustomFurnitureBoundaryDimensionEdit = {
  kind: "parallelSegmentDistance";
  segmentIndex: number;
  referenceSegmentIndex: number;
} | { kind: "filletRadius"; filletId: string } | { kind: "cutPosition"; cutId: string };

export function parseCustomFurnitureTemporaryDimensionEdit(value: unknown): CustomFurnitureBoundaryDimensionEdit | null {
  if (!value || typeof value !== "object") return null;
  const edit = value as Partial<CustomFurnitureBoundaryDimensionEdit>;
  return edit.kind === "parallelSegmentDistance" &&
    typeof edit.segmentIndex === "number" &&
    typeof edit.referenceSegmentIndex === "number"
    ? (edit as CustomFurnitureBoundaryDimensionEdit)
    : edit.kind === "filletRadius" && typeof edit.filletId === "string"
      ? (edit as CustomFurnitureBoundaryDimensionEdit)
      : edit.kind === "cutPosition" && typeof edit.cutId === "string"
        ? (edit as CustomFurnitureBoundaryDimensionEdit)
        : null;
}

export function resolveCustomFurnitureTemporaryBoundaryDimension(
  segments: CustomFurnitureBoundarySegment[],
  segmentIndex: number
) {
  return resolveCustomFurnitureParallelBoundaryDimension(segments, segmentIndex);
}

export function moveCustomFurnitureTemporaryBoundaryDimension(
  segments: CustomFurnitureBoundarySegment[],
  segmentIndex: number,
  referenceSegmentIndex: number,
  nextDistanceMm: number
) {
  return moveCustomFurnitureBoundarySegmentToParallelDistance(
    segments,
    segmentIndex,
    referenceSegmentIndex,
    nextDistanceMm
  );
}
