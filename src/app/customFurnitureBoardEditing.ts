import type {
  CustomFurnitureConstraint,
  CustomFurnitureParams,
  CustomFurniturePlanPoint
} from "../layout/customFurnitureTypes";

export type CustomFurnitureVerticalBoardHeightSettings = {
  baseConstraint: CustomFurnitureConstraint;
  baseOffsetMm: number;
  topConstraint: CustomFurnitureConstraint;
  topOffsetMm: number;
};

export function shouldStayInCustomFurnitureEditorAfterAccept(boundaryActive: boolean, furnitureId: string | null) {
  return boundaryActive || furnitureId !== null;
}

export function nextCustomFurnitureVerticalBoardDraftPoints(
  points: CustomFurniturePlanPoint[],
  point: CustomFurniturePlanPoint
) {
  return points.length === 0 ? [point] : [points[0]!, point];
}

export function makeCustomFurnitureVerticalBoardDraftPreview(
  points: CustomFurniturePlanPoint[],
  hover: CustomFurniturePlanPoint | null
) {
  if (points.length === 1 && hover) return [points[0]!, hover];
  return points.slice(0, 2);
}

export function resolveCustomFurnitureActiveFurnitureId(editorFurnitureId: string | null, selectedFurnitureId: string | null) {
  return editorFurnitureId ?? selectedFurnitureId;
}

export function shouldCommitCustomFurnitureDraftBeforeLeaving(activeTool: string | null, boundaryEditActive: boolean) {
  return activeTool !== null && !boundaryEditActive;
}

export function resolveCustomFurnitureConstraintHeightMm(
  furniture: Pick<CustomFurnitureParams, "baseOffsetMm" | "topOffsetMm">,
  constraint: CustomFurnitureConstraint,
  offsetMm: number
) {
  if (constraint === "furnitureBase") return furniture.baseOffsetMm + offsetMm;
  if (constraint === "furnitureTop") return furniture.topOffsetMm + offsetMm;
  return offsetMm;
}

export function makeCustomFurnitureVerticalBoardProfile(
  furniture: Pick<CustomFurnitureParams, "baseOffsetMm" | "topOffsetMm">,
  a: CustomFurniturePlanPoint,
  b: CustomFurniturePlanPoint,
  settings: CustomFurnitureVerticalBoardHeightSettings
) {
  const lengthMm = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
  return makeCustomFurnitureVerticalBoardProfileForLength(furniture, lengthMm, settings);
}

export function makeCustomFurnitureVerticalBoardProfileForLength(
  furniture: Pick<CustomFurnitureParams, "baseOffsetMm" | "topOffsetMm">,
  lengthMm: number,
  settings: CustomFurnitureVerticalBoardHeightSettings
) {
  const baseMm = resolveCustomFurnitureConstraintHeightMm(furniture, settings.baseConstraint, settings.baseOffsetMm);
  const topMm = Math.max(baseMm + 1, resolveCustomFurnitureConstraintHeightMm(furniture, settings.topConstraint, settings.topOffsetMm));
  return [
    { x: 0, y: baseMm },
    { x: Math.max(1, lengthMm), y: baseMm },
    { x: Math.max(1, lengthMm), y: topMm },
    { x: 0, y: topMm }
  ];
}
