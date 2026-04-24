import defaults from "./package/definitions/flap_shelves_low.defaults.json";
import { validateParams } from "./package/logic/flap_shelves_low.validation";
import type { PortableJsonValue } from "../runtime/portableTypes";
import {
  makePortableDefaultParams,
  normalizePortableParams,
  validatePortableParams
} from "../runtime/portableTypes";
import {
  applyDrawerLowHandleComponentToParams,
  applyFlapHangingBracketComponentToParams,
  applyFlapLiftUpComponentToParams,
  applyFlapShelfSupportComponentToParams,
  getDefaultFlapHangingBracketComponentId,
  getDefaultFlapLiftUpComponentId,
  getDefaultFlapShelfSupportComponentId
} from "../../data/pricing/handleComponentPresets";

export type FlapShelvesLowParams = {
  type: "flap_shelves_low";
} & Record<string, PortableJsonValue>;

const MODULE_DEFAULTS = defaults as FlapShelvesLowParams;

type FlapShelvesLowNormalizeOptions = {
  sourceKey?: string;
};

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundCount(value: unknown, fallback: number, min = 0) {
  return Math.max(min, Math.round(getNumber(value, fallback)));
}

function sanitizeShelfGaps(params: FlapShelvesLowParams, shelfCount: number) {
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
    next.push(next[next.length - 1] ?? fallbackGaps[next.length] ?? 220);
  }
  return next;
}

export function makeDefaultFlapShelvesLowParams(): FlapShelvesLowParams {
  return normalizeFlapShelvesLowParams(
    makePortableDefaultParams(MODULE_DEFAULTS, "flap_shelves_low") as FlapShelvesLowParams
  );
}

export function normalizeFlapShelvesLowParams(
  params: FlapShelvesLowParams,
  options: FlapShelvesLowNormalizeOptions = {}
): FlapShelvesLowParams {
  const normalized = normalizePortableParams(MODULE_DEFAULTS, params, "flap_shelves_low") as FlapShelvesLowParams;

  normalized.type = "flap_shelves_low";
  normalized.assemblyContext = "kitchen";
  normalized.kitchenModuleRole = "top";
  normalized.requiresWorktop = false;
  normalized.worktopThicknessMm = 0;

  normalized.width = clamp(Math.round(getNumber(normalized.width, getNumber(MODULE_DEFAULTS.width, 900))), 300, 3000);
  normalized.height = clamp(Math.round(getNumber(normalized.height, getNumber(MODULE_DEFAULTS.height, 720))), 200, 2500);
  normalized.depth = clamp(Math.round(getNumber(normalized.depth, getNumber(MODULE_DEFAULTS.depth, 560))), 200, 1200);
  normalized.boardThickness = clamp(
    Math.round(getNumber(normalized.boardThickness, getNumber(MODULE_DEFAULTS.boardThickness, 18))),
    12,
    50
  );
  normalized.backThickness = clamp(
    Math.round(getNumber(normalized.backThickness, getNumber(MODULE_DEFAULTS.backThickness, 8))),
    1,
    20
  );
  normalized.frontThicknessMm = clamp(
    Math.round(getNumber(normalized.frontThicknessMm, getNumber(MODULE_DEFAULTS.frontThicknessMm, 18))),
    12,
    50
  );
  normalized.shelfThickness = clamp(
    Math.round(getNumber(normalized.shelfThickness, getNumber(MODULE_DEFAULTS.shelfThickness, 18))),
    12,
    50
  );

  normalized.wallMounted = normalized.wallMounted !== false;
  normalized.plinthHeight = normalized.wallMounted
    ? 0
    : clamp(
        Math.round(getNumber(normalized.plinthHeight, getNumber(MODULE_DEFAULTS.plinthHeight, 100))),
        0,
        Math.max(0, normalized.height - normalized.boardThickness * 2)
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

  normalized.shelfCount = clamp(roundCount(normalized.shelfCount, getNumber(MODULE_DEFAULTS.shelfCount, 3), 1), 1, 12);
  if (options.sourceKey === "shelfGaps") {
    normalized.shelfAutoFit = false;
  }
  normalized.shelfAutoFit = normalized.shelfAutoFit === true;
  normalized.shelfGaps = sanitizeShelfGaps(normalized, normalized.shelfCount as number) as PortableJsonValue;

  normalized.doorSystem =
    normalized.doorSystem === "double_hinged" ? "double_hinged" : "flap_up";
  normalized.doorOpen = normalized.doorOpen === true;
  normalized.handlePositionMm = clamp(
    Math.round(getNumber(normalized.handlePositionMm, getNumber(MODULE_DEFAULTS.handlePositionMm, 60))),
    0,
    Math.max(0, normalized.height)
  );
  normalized.handleHorizontalPositionMm = clamp(
    Math.round(getNumber(normalized.handleHorizontalPositionMm, getNumber(MODULE_DEFAULTS.handleHorizontalPositionMm, 0))),
    -Math.max(0, normalized.width / 2),
    Math.max(0, normalized.width / 2)
  );

  Object.assign(
    normalized,
    applyDrawerLowHandleComponentToParams(
      normalized as unknown as Record<string, unknown>,
      typeof normalized.handleComponentId === "string" && normalized.handleComponentId.trim().length > 0
        ? normalized.handleComponentId
        : null
    )
  );
  Object.assign(
    normalized,
    applyFlapLiftUpComponentToParams(
      normalized as unknown as Record<string, unknown>,
      typeof normalized.liftUpComponentId === "string" && normalized.liftUpComponentId.trim().length > 0
        ? normalized.liftUpComponentId
        : getDefaultFlapLiftUpComponentId()
    )
  );
  Object.assign(
    normalized,
    applyFlapHangingBracketComponentToParams(
      normalized as unknown as Record<string, unknown>,
      typeof normalized.hangingBracketComponentId === "string" && normalized.hangingBracketComponentId.trim().length > 0
        ? normalized.hangingBracketComponentId
        : getDefaultFlapHangingBracketComponentId()
    )
  );
  Object.assign(
    normalized,
    applyFlapShelfSupportComponentToParams(
      normalized as unknown as Record<string, unknown>,
      typeof normalized.shelfSupportComponentId === "string" && normalized.shelfSupportComponentId.trim().length > 0
        ? normalized.shelfSupportComponentId
        : getDefaultFlapShelfSupportComponentId()
    )
  );

  return normalized;
}

export function validateFlapShelvesLow(params: FlapShelvesLowParams): string[] {
  const errors = validatePortableParams(params as Record<string, unknown>, validateParams);
  const width = getNumber(params.width, 0);
  const height = getNumber(params.height, 0);
  const depth = getNumber(params.depth, 0);
  const boardThickness = getNumber(params.boardThickness, 0);
  const backThickness = getNumber(params.backThickness, 0);
  const frontThicknessMm = getNumber(params.frontThicknessMm, 0);
  const shelfCount = roundCount(params.shelfCount, 0, 0);

  if (params.kitchenModuleRole !== "top") errors.push("Flap module must use kitchenModuleRole = top.");
  if (params.requiresWorktop !== false) errors.push("Flap module must not require a worktop.");
  if (getNumber(params.worktopThicknessMm, 0) !== 0) errors.push("Flap module must keep worktopThicknessMm = 0.");
  if (boardThickness * 2 >= width) errors.push("Board thickness is too large for the current width.");
  if (boardThickness + backThickness + frontThicknessMm >= depth) {
    errors.push("Board, back, and front thicknesses leave no usable cabinet depth.");
  }
  if (params.wallMounted !== true && getNumber(params.plinthHeight, 0) <= 0) {
    errors.push("Non-wall-mounted flap module must have a positive plinth height.");
  }
  if (params.doorSystem === "double_hinged" && width < 400) {
    errors.push("Double hinged flap module needs more width.");
  }
  if (params.shelfAutoFit !== true && shelfCount > 1 && sanitizeShelfGaps(params, shelfCount).length !== shelfCount - 1) {
    errors.push("Manual shelf layout must provide shelf gaps for every opening.");
  }
  if (height <= boardThickness * 2) {
    errors.push("Height is too small for the current board thickness.");
  }

  return errors;
}
