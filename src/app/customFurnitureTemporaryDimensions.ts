import {
  moveCustomFurnitureBoundarySegmentToParallelDistance,
  resolveCustomFurnitureParallelBoundaryDimension,
  type CustomFurnitureBoundarySegment
} from "./customFurnitureBoundaryEditing";

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
