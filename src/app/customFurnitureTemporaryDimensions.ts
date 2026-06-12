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
  if (isParallelSegmentDistanceEdit(edit)) return edit;
  if (isFilletRadiusEdit(edit)) return edit;
  if (isCutPositionEdit(edit)) return edit;
  return null;
}

function isParallelSegmentDistanceEdit(
  edit: Partial<CustomFurnitureBoundaryDimensionEdit>
): edit is Extract<CustomFurnitureBoundaryDimensionEdit, { kind: "parallelSegmentDistance" }> {
  return edit.kind === "parallelSegmentDistance" &&
    typeof edit.segmentIndex === "number" &&
    typeof edit.referenceSegmentIndex === "number";
}

function isFilletRadiusEdit(
  edit: Partial<CustomFurnitureBoundaryDimensionEdit>
): edit is Extract<CustomFurnitureBoundaryDimensionEdit, { kind: "filletRadius" }> {
  return edit.kind === "filletRadius" && typeof edit.filletId === "string";
}

function isCutPositionEdit(
  edit: Partial<CustomFurnitureBoundaryDimensionEdit>
): edit is Extract<CustomFurnitureBoundaryDimensionEdit, { kind: "cutPosition" }> {
  return edit.kind === "cutPosition" && typeof edit.cutId === "string";
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
