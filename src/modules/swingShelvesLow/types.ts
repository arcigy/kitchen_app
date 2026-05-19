import defaults from "./package/definitions/swing_shelves_low.defaults.json";
import { validateParams } from "./package/logic/swing_shelves_low.validation";
import type { PortableJsonValue } from "../runtime/portableTypes";
import {
  makePortableDefaultParams,
  normalizePortableParams,
  validatePortableParams
} from "../runtime/portableTypes";

export type SwingShelvesLowParams = {
  type: "swing_shelves_low";
} & Record<string, PortableJsonValue>;

const MODULE_DEFAULTS = defaults as SwingShelvesLowParams;

type SwingShelvesLowNormalizeOptions = {
  sourceKey?: string;
};

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundCount(value: unknown, fallback: number, min = 1) {
  return Math.max(min, Math.round(getNumber(value, fallback)));
}

function getResolvedWorktopThickness(params: SwingShelvesLowParams) {
  return Math.max(0, Math.round(getNumber(params.worktopThicknessMm, getNumber(MODULE_DEFAULTS.worktopThicknessMm, 38))));
}

function requiresWorktop(params: SwingShelvesLowParams) {
  return params.requiresWorktop !== false && getResolvedWorktopThickness(params) > 0;
}

function sanitizeShelfGaps(params: SwingShelvesLowParams, shelfCount: number) {
  const fallbackGaps = Array.isArray(MODULE_DEFAULTS.shelfGaps)
    ? MODULE_DEFAULTS.shelfGaps.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0)
    : [];
  const resolved = Array.isArray(params.shelfGaps)
    ? params.shelfGaps.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0)
    : [];
  const targetCount = Math.max(0, shelfCount - 1);
  if (targetCount === 0) return [];
  const seed = resolved.length > 0 ? resolved : fallbackGaps;
  const next = seed.slice(0, targetCount).map((value) => Math.max(0, Math.round(value)));
  while (next.length < targetCount) {
    next.push(next[next.length - 1] ?? fallbackGaps[next.length] ?? 120);
  }
  return next;
}

export function makeDefaultSwingShelvesLowParams(): SwingShelvesLowParams {
  return normalizeSwingShelvesLowParams(
    makePortableDefaultParams(MODULE_DEFAULTS, "swing_shelves_low") as SwingShelvesLowParams
  );
}

export function normalizeSwingShelvesLowParams(
  params: SwingShelvesLowParams,
  options: SwingShelvesLowNormalizeOptions = {}
): SwingShelvesLowParams {
  const normalized = normalizePortableParams(MODULE_DEFAULTS, params, "swing_shelves_low") as SwingShelvesLowParams;
  const sourceKey = options.sourceKey ?? "";
  const worktopThicknessMm = getResolvedWorktopThickness(normalized);
  const hasWorktop = requiresWorktop(normalized);

  let heightCarcassMm = clamp(
    Math.round(getNumber(normalized.heightCarcass, getNumber(MODULE_DEFAULTS.heightCarcass, 662))),
    50,
    3000
  );
  let totalHeightMm = clamp(Math.round(getNumber(normalized.height, getNumber(MODULE_DEFAULTS.height, 700))), 50, 3000);

  if (sourceKey === "heightCarcass") {
    totalHeightMm = hasWorktop ? heightCarcassMm + worktopThicknessMm : heightCarcassMm;
  } else {
    heightCarcassMm = hasWorktop ? Math.max(50, totalHeightMm - worktopThicknessMm) : totalHeightMm;
    totalHeightMm = hasWorktop ? heightCarcassMm + worktopThicknessMm : heightCarcassMm;
  }

  normalized.type = "swing_shelves_low";
  normalized.assemblyContext = "kitchen";
  normalized.kitchenModuleRole = "base";
  normalized.requiresWorktop = true;
  normalized.worktopThicknessMm = worktopThicknessMm;
  normalized.heightCarcass = heightCarcassMm;
  normalized.height = totalHeightMm;
  normalized.width = clamp(Math.round(getNumber(normalized.width, getNumber(MODULE_DEFAULTS.width, 800))), 300, 3000);
  normalized.depth = clamp(Math.round(getNumber(normalized.depth, getNumber(MODULE_DEFAULTS.depth, 560))), 200, 1500);
  normalized.boardThickness = clamp(
    Math.round(getNumber(normalized.boardThickness, getNumber(MODULE_DEFAULTS.boardThickness, 18))),
    12,
    50
  );
  normalized.shelfThickness = clamp(
    Math.round(getNumber(normalized.shelfThickness, getNumber(MODULE_DEFAULTS.shelfThickness, 18))),
    12,
    50
  );
  normalized.backThickness = clamp(
    Math.round(getNumber(normalized.backThickness, getNumber(MODULE_DEFAULTS.backThickness, 6))),
    1,
    20
  );
  normalized.frontThicknessMm = clamp(
    Math.round(getNumber(normalized.frontThicknessMm, getNumber(MODULE_DEFAULTS.frontThicknessMm, 19))),
    12,
    50
  );
  normalized.plinthHeight = clamp(
    Math.round(getNumber(normalized.plinthHeight, getNumber(MODULE_DEFAULTS.plinthHeight, 100))),
    0,
    Math.max(0, heightCarcassMm - normalized.boardThickness * 2)
  );
  normalized.plinthSetbackMm = clamp(
    Math.round(getNumber(normalized.plinthSetbackMm, getNumber(MODULE_DEFAULTS.plinthSetbackMm, 60))),
    0,
    Math.max(0, normalized.depth - normalized.boardThickness)
  );
  normalized.frontGap = clamp(Math.round(getNumber(normalized.frontGap, getNumber(MODULE_DEFAULTS.frontGap, 2))), 0, 50);
  normalized.sideGap = clamp(Math.round(getNumber(normalized.sideGap, getNumber(MODULE_DEFAULTS.sideGap, 2))), 0, 50);
  normalized.topGap = clamp(Math.round(getNumber(normalized.topGap, getNumber(MODULE_DEFAULTS.topGap, 2))), 0, 50);
  normalized.bottomGap = clamp(Math.round(getNumber(normalized.bottomGap, getNumber(MODULE_DEFAULTS.bottomGap, 2))), 0, 50);
  normalized.shelfCount = clamp(roundCount(normalized.shelfCount, getNumber(MODULE_DEFAULTS.shelfCount, 4), 1), 1, 12);
  if (sourceKey === "shelfGaps") {
    normalized.shelfAutoFit = false;
  }
  normalized.shelfAutoFit = normalized.shelfAutoFit === true;
  normalized.shelfGaps = sanitizeShelfGaps(normalized, normalized.shelfCount as number) as PortableJsonValue;
  normalized.hingeCountPerDoor = clamp(
    roundCount(normalized.hingeCountPerDoor, getNumber(MODULE_DEFAULTS.hingeCountPerDoor, 2), 1),
    1,
    6
  );

  if (normalized.handleType === "none") delete normalized.handleComponentId;
  else normalized.handleComponentId = cleanString(normalized.handleComponentId) ?? cleanString(MODULE_DEFAULTS.handleComponentId) ?? null;
  normalized.legComponentId = cleanString(normalized.legComponentId) ?? cleanString(MODULE_DEFAULTS.legComponentId) ?? null;
  normalized.hingeComponentId = cleanString(normalized.hingeComponentId) ?? cleanString(MODULE_DEFAULTS.hingeComponentId) ?? null;
  normalized.clipComponentId = cleanString(normalized.clipComponentId) ?? cleanString(MODULE_DEFAULTS.clipComponentId) ?? null;

  return normalized;
}

export function validateSwingShelvesLow(params: SwingShelvesLowParams): string[] {
  const errors = validatePortableParams(params as Record<string, unknown>, validateParams);
  const height = getNumber(params.height, 0);
  const heightCarcass = getNumber(params.heightCarcass, 0);
  const worktopThicknessMm = getResolvedWorktopThickness(params);
  const boardThickness = getNumber(params.boardThickness, 0);
  const plinthHeight = getNumber(params.plinthHeight, 0);
  const topGap = getNumber(params.topGap, 0);
  const bottomGap = getNumber(params.bottomGap, 0);
  const doorHeight = heightCarcass - plinthHeight - topGap - bottomGap;

  if (params.requiresWorktop !== true) errors.push("Swing shelf module must require a worktop.");
  if (params.kitchenModuleRole !== "base") errors.push("Swing shelf module must use kitchenModuleRole = base.");
  if (heightCarcass + worktopThicknessMm !== height) {
    errors.push("Height must equal heightCarcass + worktopThicknessMm.");
  }
  if (plinthHeight > Math.max(0, heightCarcass - 2 * boardThickness)) {
    errors.push("Plinth height is too large for the current carcass height and board thickness.");
  }
  if (doorHeight <= 0) {
    errors.push("Top gap and bottom gap leave no valid door height.");
  }
  if (params.shelfAutoFit !== true && sanitizeShelfGaps(params, Math.max(1, roundCount(params.shelfCount, 1))).length === 0) {
    errors.push("Manual shelf layout requires at least one shelf gap value.");
  }
  return errors;
}
