import defaults from "./package/definitions/corner_shelf_lower.defaults.json";
import { validateParams } from "./package/logic/corner_shelf_lower.validation";
import type { PortableJsonValue } from "../runtime/portableTypes";
import {
  makePortableDefaultParams,
  normalizePortableParams,
  validatePortableParams
} from "../runtime/portableTypes";

export type CornerShelfLowerParams = {
  type: "corner_shelf_lower";
} & Record<string, PortableJsonValue>;

const MODULE_DEFAULTS = defaults as CornerShelfLowerParams;

type CornerShelfLowerNormalizeOptions = {
  sourceKey?: string;
};

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundCount(value: unknown, fallback: number, min = 1) {
  return Math.max(min, Math.round(getNumber(value, fallback)));
}

function getResolvedWorktopThickness(params: CornerShelfLowerParams) {
  return Math.max(0, Math.round(getNumber(params.worktopThicknessMm, getNumber(MODULE_DEFAULTS.worktopThicknessMm, 38))));
}

function requiresWorktop(params: CornerShelfLowerParams) {
  return params.requiresWorktop !== false && getResolvedWorktopThickness(params) > 0;
}

function getShelfGapCapacity(params: CornerShelfLowerParams, shelfCount: number, boardThicknessMm: number) {
  const heightCarcassMm = Math.max(50, Math.round(getNumber(params.heightCarcass, getNumber(MODULE_DEFAULTS.heightCarcass, 682))));
  const plinthHeightMm = Math.max(0, Math.round(getNumber(params.plinthHeight, getNumber(MODULE_DEFAULTS.plinthHeight, 100))));
  const shelfPanelCount = Math.max(0, shelfCount - 1);
  return Math.max(shelfCount, heightCarcassMm - plinthHeightMm - 2 * boardThicknessMm - shelfPanelCount * boardThicknessMm);
}

function createAutoFitShelfGaps(params: CornerShelfLowerParams, shelfCount: number, boardThicknessMm: number) {
  const totalGapMm = getShelfGapCapacity(params, shelfCount, boardThicknessMm);
  const equalGapMm = Math.floor(totalGapMm / shelfCount);
  const gaps = Array.from({ length: shelfCount }, () => Math.max(1, equalGapMm));
  gaps[gaps.length - 1] = Math.max(1, gaps[gaps.length - 1]! + (totalGapMm - equalGapMm * shelfCount));
  return gaps;
}

function createManualShelfGaps(params: CornerShelfLowerParams, shelfCount: number, boardThicknessMm: number) {
  const rawGaps = Array.isArray(params.shelfGaps)
    ? params.shelfGaps.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    : [];
  const seed = createAutoFitShelfGaps(params, shelfCount, boardThicknessMm);
  const gaps = Array.from({ length: shelfCount }, (_, index) => Math.max(1, Math.round(rawGaps[index] ?? seed[index] ?? 1)));

  let remaining = getShelfGapCapacity(params, shelfCount, boardThicknessMm);
  for (let index = 0; index < gaps.length; index += 1) {
    const slotsLeft = gaps.length - index - 1;
    const maxForThis = Math.max(1, remaining - slotsLeft);
    gaps[index] = clamp(gaps[index]!, 1, maxForThis);
    remaining -= gaps[index]!;
  }

  gaps[gaps.length - 1] = Math.max(1, gaps[gaps.length - 1]! + remaining);
  return gaps;
}

export function makeDefaultCornerShelfLowerParams(): CornerShelfLowerParams {
  return normalizeCornerShelfLowerParams(
    makePortableDefaultParams(MODULE_DEFAULTS, "corner_shelf_lower") as CornerShelfLowerParams
  );
}

export function normalizeCornerShelfLowerParams(
  params: CornerShelfLowerParams,
  options: CornerShelfLowerNormalizeOptions = {}
): CornerShelfLowerParams {
  const normalized = normalizePortableParams(MODULE_DEFAULTS, params, "corner_shelf_lower") as CornerShelfLowerParams;
  const sourceKey = options.sourceKey ?? "";
  const boardThicknessMm = Math.max(1, Math.round(getNumber(normalized.boardThickness, getNumber(MODULE_DEFAULTS.boardThickness, 18))));
  const worktopThicknessMm = getResolvedWorktopThickness(normalized);
  const hasWorktop = requiresWorktop(normalized);

  let heightCarcassMm = Math.max(50, Math.round(getNumber(normalized.heightCarcass, getNumber(MODULE_DEFAULTS.heightCarcass, 682))));
  let totalHeightMm = Math.max(50, Math.round(getNumber(normalized.height, getNumber(MODULE_DEFAULTS.height, 720))));

  if (sourceKey === "heightCarcass") {
    totalHeightMm = hasWorktop ? heightCarcassMm + worktopThicknessMm : heightCarcassMm;
  } else {
    heightCarcassMm = hasWorktop ? Math.max(50, totalHeightMm - worktopThicknessMm) : totalHeightMm;
    totalHeightMm = hasWorktop ? heightCarcassMm + worktopThicknessMm : heightCarcassMm;
  }

  normalized.worktopThicknessMm = worktopThicknessMm;
  normalized.heightCarcass = heightCarcassMm;
  normalized.height = totalHeightMm;
  normalized.boardThickness = boardThicknessMm;
  normalized.backThickness = Math.max(1, Math.round(getNumber(normalized.backThickness, getNumber(MODULE_DEFAULTS.backThickness, 6))));
  normalized.frontThicknessMm = Math.max(
    1,
    Math.round(getNumber(normalized.frontThicknessMm, getNumber(MODULE_DEFAULTS.frontThicknessMm, 19)))
  );
  normalized.depth = Math.max(
    normalized.frontThicknessMm + 1,
    Math.round(getNumber(normalized.depth, getNumber(MODULE_DEFAULTS.depth, 560)))
  );
  normalized.plinthHeight = clamp(
    Math.round(getNumber(normalized.plinthHeight, getNumber(MODULE_DEFAULTS.plinthHeight, 100))),
    0,
    Math.max(0, heightCarcassMm - 2 * boardThicknessMm)
  );
  normalized.sideGap = Math.max(0, Math.round(getNumber(normalized.sideGap, getNumber(MODULE_DEFAULTS.sideGap, 2))));
  normalized.topGap = Math.max(0, Math.round(getNumber(normalized.topGap, getNumber(MODULE_DEFAULTS.topGap, 2))));
  normalized.bottomGap = Math.max(0, Math.round(getNumber(normalized.bottomGap, getNumber(MODULE_DEFAULTS.bottomGap, 2))));
  normalized.hingeCountPerDoor = roundCount(
    normalized.hingeCountPerDoor,
    getNumber(MODULE_DEFAULTS.hingeCountPerDoor, 2),
    1
  );

  const shelfCount = roundCount(normalized.shelfCount, getNumber(MODULE_DEFAULTS.shelfCount, 4), 1);
  normalized.shelfCount = shelfCount;
  if (sourceKey === "shelfGaps") {
    normalized.shelfAutoFit = false;
  }
  normalized.shelfGaps = (normalized.shelfAutoFit
    ? createAutoFitShelfGaps(normalized, shelfCount as number, boardThicknessMm)
    : createManualShelfGaps(normalized, shelfCount as number, boardThicknessMm)) as PortableJsonValue;

  delete normalized.shelfThickness;
  delete normalized.hingeSideFrontX;
  delete normalized.hingeSideFrontZ;
  delete normalized.doorDouble_corner;
  delete normalized.doorOpen_corner;
  delete normalized.hingeCount_corner;
  delete normalized.hingeSideFrontX_corner;
  delete normalized.hingeSideFrontZ_corner;
  delete normalized.shelfAutoFit_corner;
  delete normalized.shelfGaps_corner;

  return normalized;
}

export function validateCornerShelfLower(params: CornerShelfLowerParams): string[] {
  return validatePortableParams(params as Record<string, unknown>, validateParams);
}
