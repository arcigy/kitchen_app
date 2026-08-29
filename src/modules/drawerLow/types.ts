import defaults from "./package/definitions/drawer_low.defaults.json";
import { validateParams } from "./package/logic/drawer_low.validation";
import type { PortableJsonValue } from "../runtime/portableTypes";
import {
  makePortableDefaultParams,
  normalizePortableParams,
  validatePortableParams
} from "../runtime/portableTypes";

export type DrawerLowParams = {
  type: "drawer_low";
} & Record<string, PortableJsonValue>;

const MODULE_DEFAULTS = defaults as DrawerLowParams;

type DrawerLowNormalizeOptions = {
  sourceKey?: string;
};

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundCount(value: unknown, fallback: number) {
  return Math.max(1, Math.round(getNumber(value, fallback)));
}

function getResolvedWorktopThickness(params: DrawerLowParams) {
  return Math.max(0, Math.round(getNumber(params.worktopThicknessMm, getNumber(MODULE_DEFAULTS.worktopThicknessMm, 38))));
}

function requiresWorktop(params: DrawerLowParams) {
  return params.requiresWorktop !== false && getResolvedWorktopThickness(params) > 0;
}

function getVisibleFrontStackHeight(params: DrawerLowParams, drawerCount: number) {
  const totalHeightMm = Math.max(50, Math.round(getNumber(params.height, getNumber(MODULE_DEFAULTS.height, 700))));
  const plinthHeightMm = Math.max(0, Math.round(getNumber(params.plinthHeight, getNumber(MODULE_DEFAULTS.plinthHeight, 100))));
  const topGapMm = Math.max(0, Math.round(getNumber(params.topGap, getNumber(MODULE_DEFAULTS.topGap, 2))));
  const bottomGapMm = Math.max(0, Math.round(getNumber(params.bottomGap, getNumber(MODULE_DEFAULTS.bottomGap, 2))));
  const frontGapMm = Math.max(0, Math.round(getNumber(params.frontGap, getNumber(MODULE_DEFAULTS.frontGap, 2))));
  const effectiveWorktopMm = requiresWorktop(params) ? getResolvedWorktopThickness(params) : 0;
  return Math.max(
    drawerCount,
    totalHeightMm - effectiveWorktopMm - plinthHeightMm - topGapMm - bottomGapMm - frontGapMm * (drawerCount - 1)
  );
}

function createAutoFitFrontHeights(params: DrawerLowParams, drawerCount: number, stackHeightMm: number) {
  const preset = typeof params.frontStackPreset === "string" ? params.frontStackPreset.toLowerCase() : "equal";
  const topFrontHeightMm = Math.max(1, Math.round(getNumber(params.topFrontHeightMm, getNumber(MODULE_DEFAULTS.topFrontHeightMm, 160))));

  if (preset.includes("top") && drawerCount > 1) {
    const topHeight = clamp(topFrontHeightMm, 1, Math.max(1, stackHeightMm - (drawerCount - 1)));
    const remaining = Math.max(1, stackHeightMm - topHeight);
    const equal = Math.floor(remaining / (drawerCount - 1));
    const heights = Array.from({ length: drawerCount - 1 }, () => Math.max(1, equal));
    const consumed = heights.reduce((sum, value) => sum + value, 0);
    heights.push(Math.max(1, topHeight + (remaining - consumed)));
    return heights;
  }

  const equal = Math.floor(stackHeightMm / drawerCount);
  const heights = Array.from({ length: drawerCount }, () => Math.max(1, equal));
  heights[heights.length - 1] = Math.max(1, heights[heights.length - 1]! + (stackHeightMm - equal * drawerCount));
  return heights;
}

function createManualFrontHeights(params: DrawerLowParams, drawerCount: number, stackHeightMm: number) {
  const rawHeights = Array.isArray(params.drawerFrontHeights)
    ? params.drawerFrontHeights.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    : [];
  const seed = createAutoFitFrontHeights(params, drawerCount, stackHeightMm);
  const heights = Array.from({ length: drawerCount }, (_, index) => Math.max(1, Math.round(rawHeights[index] ?? seed[index] ?? 1)));

  let remaining = stackHeightMm;
  for (let index = 0; index < heights.length; index += 1) {
    const slotsLeft = heights.length - index - 1;
    const maxForThis = Math.max(1, remaining - slotsLeft);
    heights[index] = clamp(heights[index]!, 1, maxForThis);
    remaining -= heights[index]!;
  }

  heights[heights.length - 1] = Math.max(1, heights[heights.length - 1]! + remaining);
  return heights;
}

export function makeDefaultDrawerLowParams(): DrawerLowParams {
  return normalizeDrawerLowParams(makePortableDefaultParams(MODULE_DEFAULTS, "drawer_low") as DrawerLowParams);
}

export function normalizeDrawerLowParams(
  params: DrawerLowParams,
  options: DrawerLowNormalizeOptions = {}
): DrawerLowParams {
  const normalized = normalizePortableParams(MODULE_DEFAULTS, params, "drawer_low") as DrawerLowParams;
  const worktopThicknessMm = getResolvedWorktopThickness(normalized);
  const hasWorktop = requiresWorktop(normalized);
  const sourceKey = options.sourceKey ?? "";

  let heightCarcassMm = Math.max(50, Math.round(getNumber(normalized.heightCarcass, getNumber(MODULE_DEFAULTS.heightCarcass, 662))));
  let totalHeightMm = Math.max(50, Math.round(getNumber(normalized.height, getNumber(MODULE_DEFAULTS.height, 700))));

  if (sourceKey === "heightCarcass") {
    totalHeightMm = hasWorktop ? heightCarcassMm + worktopThicknessMm : heightCarcassMm;
  } else {
    heightCarcassMm = hasWorktop ? Math.max(50, totalHeightMm - worktopThicknessMm) : totalHeightMm;
    totalHeightMm = hasWorktop ? heightCarcassMm + worktopThicknessMm : heightCarcassMm;
  }

  normalized.worktopThicknessMm = worktopThicknessMm;
  normalized.heightCarcass = heightCarcassMm;
  normalized.height = totalHeightMm;
  normalized.drawerCount = roundCount(normalized.drawerCount, getNumber(MODULE_DEFAULTS.drawerCount, 3));
  normalized.plinthHeight = clamp(
    Math.round(getNumber(normalized.plinthHeight, getNumber(MODULE_DEFAULTS.plinthHeight, 100))),
    0,
    Math.max(0, heightCarcassMm - 20)
  );
  normalized.frontGap = Math.max(0, Math.round(getNumber(normalized.frontGap, getNumber(MODULE_DEFAULTS.frontGap, 2))));
  normalized.sideGap = Math.max(0, Math.round(getNumber(normalized.sideGap, getNumber(MODULE_DEFAULTS.sideGap, 2))));
  normalized.topGap = Math.max(0, Math.round(getNumber(normalized.topGap, getNumber(MODULE_DEFAULTS.topGap, 2))));
  normalized.bottomGap = Math.max(0, Math.round(getNumber(normalized.bottomGap, getNumber(MODULE_DEFAULTS.bottomGap, 2))));
  normalized.drawerBackReserveMm = Math.max(0, getNumber(normalized.drawerBackReserveMm, getNumber(MODULE_DEFAULTS.drawerBackReserveMm, 10)));
  normalized.backGrooveDepthMm = clamp(
    Math.round(getNumber(normalized.backGrooveDepthMm, getNumber(MODULE_DEFAULTS.backGrooveDepthMm, 8))),
    0,
    Math.max(0, Math.round(getNumber(normalized.boardThickness, getNumber(MODULE_DEFAULTS.boardThickness, 18))))
  );
  normalized.backGrooveClearanceMm = clamp(
    Math.round(getNumber(normalized.backGrooveClearanceMm, getNumber(MODULE_DEFAULTS.backGrooveClearanceMm, 1))),
    0,
    Math.max(0, Math.round(getNumber(normalized.boardThickness, getNumber(MODULE_DEFAULTS.boardThickness, 18))))
  );
  normalized.backGrooveWidthMm = clamp(
    Math.round(getNumber(normalized.backGrooveWidthMm, getNumber(MODULE_DEFAULTS.backGrooveWidthMm, 8))),
    Math.max(1, Math.round(getNumber(normalized.backThickness, getNumber(MODULE_DEFAULTS.backThickness, 6)))),
    Math.max(1, Math.round(getNumber(normalized.depth, getNumber(MODULE_DEFAULTS.depth, 560)) * 0.25))
  );

  if (sourceKey === "drawerFrontHeights") {
    normalized.autoFit = false;
  }

  const visibleStackHeightMm = getVisibleFrontStackHeight(normalized, normalized.drawerCount as number);
  normalized.drawerFrontHeights = (normalized.autoFit
    ? createAutoFitFrontHeights(normalized, normalized.drawerCount as number, visibleStackHeightMm)
    : createManualFrontHeights(normalized, normalized.drawerCount as number, visibleStackHeightMm)) as PortableJsonValue;

  return normalized;
}

export function validateDrawerLow(params: DrawerLowParams): string[] {
  return validatePortableParams(params as Record<string, unknown>, validateParams);
}
