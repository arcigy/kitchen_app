import {
  resolveCustomFurnitureParallelBoundaryDimension,
  type CustomFurnitureBoundarySegment
} from "./customFurnitureBoundaryEditing";

export function resolveCustomFurnitureTemporaryBoundaryDimension(
  segments: CustomFurnitureBoundarySegment[],
  segmentIndex: number
) {
  return resolveCustomFurnitureParallelBoundaryDimension(segments, segmentIndex);
}
