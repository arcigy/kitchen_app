import { normalizeCornerShelfLowerParams, type CornerShelfLowerParams } from "../cornerShelfLower/types";
import type { FwmFurnitureParams } from "./types";

function num(params: Record<string, unknown>, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(params: Record<string, unknown>, key: string, fallback: boolean) {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

function text(params: Record<string, unknown>, key: string, fallback: string) {
  const value = params[key];
  return typeof value === "string" && value ? value : fallback;
}

function optionalText(params: Record<string, unknown>, key: string) {
  const value = params[key];
  return typeof value === "string" && value ? value : undefined;
}

export function mapFwmCatalogCornerToCornerShelfLowerParams(params: FwmFurnitureParams): CornerShelfLowerParams {
  const source = params as Record<string, unknown>;
  const lengthX = num(source, "width", 1000);
  const lengthZ = num(source, "cornerLengthZMm", lengthX);
  const requestedArmDepth = num(source, "depth", 560);
  const maxArmDepth = Math.max(200, Math.min(lengthX, lengthZ) - 240);
  const armDepth = Math.min(requestedArmDepth, maxArmDepth);
  const height = num(source, "height", 720);
  const worktopThicknessMm = num(source, "worktopThicknessMm", 38);
  const hasWorktop = source.hasWorktop !== false && worktopThicknessMm > 0;
  const shelfCount = Math.max(1, Math.round(num(source, "shelfCount", 4)));

  return normalizeCornerShelfLowerParams({
    type: "corner_shelf_lower",
    lengthX,
    lengthZ,
    depth: num(source, "cornerArmDepthMm", num(source, "armDepth", armDepth)),
    height,
    heightCarcass: hasWorktop ? Math.max(50, height - worktopThicknessMm) : height,
    worktopThicknessMm: hasWorktop ? worktopThicknessMm : 0,
    requiresWorktop: hasWorktop,
    boardThickness: num(source, "boardThickness", 18),
    backThickness: num(source, "backThickness", 6),
    frontThicknessMm: num(source, "frontThicknessMm", 18),
    plinthHeight: num(source, "plinthHeight", 100),
    plinthSetbackMm: num(source, "plinthSetbackMm", 60),
    shelfCount,
    shelfAutoFit: true,
    shelfGaps: Array.from({ length: shelfCount }, () => 123),
    doorDouble: true,
    doorOpen: bool(source, "opened", bool(source, "doorOpen", false)),
    hingeCountPerDoor: Math.max(1, Math.round(num(source, "hingeCountPerDoor", 2))),
    sideGap: num(source, "sideGap", 2),
    topGap: num(source, "topGap", 2),
    bottomGap: num(source, "bottomGap", 2),
    handleType: text(source, "handleType", "bar"),
    handleLengthMm: num(source, "handleLengthMm", 160),
    handleSizeMm: num(source, "handleSizeMm", 12),
    handleProjectionMm: num(source, "handleProjectionMm", 14),
    legInsetMm: num(source, "legInsetMm", 30),
    legDiameterMm: num(source, "legDiameterMm", 40),
    bodyMaterialId: optionalText(source, "bodyMaterialId"),
    frontMaterialId: optionalText(source, "frontMaterialId"),
    backMaterialId: optionalText(source, "backMaterialId"),
    shelfMaterialId: optionalText(source, "shelfMaterialId"),
    plinthMaterialId: optionalText(source, "plinthMaterialId"),
    worktopMaterialId: optionalText(source, "worktopMaterialId"),
    handleComponentId: text(source, "handleComponentId", "cmp.handle.bar.160.black"),
    hingeComponentId: text(source, "hingeComponentId", "cmp.hinge.corner.45.softclose"),
    legComponentId: text(source, "legComponentId", "cmp.leg.adjustable.100.black"),
    clipComponentId: text(source, "clipComponentId", "cmp.clip.plinth.standard"),
    materialAssignments: source.materialAssignments,
    componentAssignments: source.componentAssignments,
    commercialSelections: source.commercialSelections
  } as CornerShelfLowerParams);
}
