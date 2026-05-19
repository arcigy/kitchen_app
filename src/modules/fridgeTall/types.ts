import defaults from "./package/definitions/fridge_tall.defaults.json";
import { validateParams } from "./package/logic/fridge_tall.validation";
import type { PortableJsonValue } from "../runtime/portableTypes";
import {
  makePortableDefaultParams,
  normalizePortableParams,
  validatePortableParams
} from "../runtime/portableTypes";

export type FridgeTallParams = {
  type: "fridge_tall";
} & Record<string, PortableJsonValue>;

const MODULE_DEFAULTS = defaults as FridgeTallParams;

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function makeDefaultFridgeTallParams(): FridgeTallParams {
  return normalizeFridgeTallParams(makePortableDefaultParams(MODULE_DEFAULTS, "fridge_tall") as FridgeTallParams);
}

export function normalizeFridgeTallParams(params: FridgeTallParams): FridgeTallParams {
  const normalized = normalizePortableParams(MODULE_DEFAULTS, params, "fridge_tall") as FridgeTallParams;

  normalized.kitchenModuleRole = "tall";
  normalized.requiresWorktop = false;
  normalized.worktopThicknessMm = 0;
  normalized.assemblyContext = "kitchen";
  normalized.__fridgeHandleSplitScaleVersion = 2;

  normalized.width = clamp(Math.round(getNumber(normalized.width, getNumber(MODULE_DEFAULTS.width, 600))), 400, 1500);
  normalized.height = clamp(Math.round(getNumber(normalized.height, getNumber(MODULE_DEFAULTS.height, 1916))), 1200, 3000);
  normalized.depth = clamp(Math.round(getNumber(normalized.depth, getNumber(MODULE_DEFAULTS.depth, 600))), 400, 1200);
  normalized.boardThickness = clamp(
    Math.round(getNumber(normalized.boardThickness, getNumber(MODULE_DEFAULTS.boardThickness, 18))),
    12,
    50
  );
  normalized.backThickness = clamp(
    Math.round(getNumber(normalized.backThickness, getNumber(MODULE_DEFAULTS.backThickness, 6))),
    1,
    20
  );
  normalized.frontThicknessMm = clamp(
    Math.round(getNumber(normalized.frontThicknessMm, getNumber(MODULE_DEFAULTS.frontThicknessMm, 18))),
    12,
    50
  );

  const maxPlinthHeightMm = Math.max(0, normalized.height - normalized.boardThickness * 2 - 100);
  normalized.plinthHeight = clamp(
    Math.round(getNumber(normalized.plinthHeight, getNumber(MODULE_DEFAULTS.plinthHeight, 100))),
    0,
    maxPlinthHeightMm
  );
  normalized.plinthSetbackMm = clamp(
    Math.round(getNumber(normalized.plinthSetbackMm, getNumber(MODULE_DEFAULTS.plinthSetbackMm, 60))),
    0,
    Math.max(0, normalized.depth - normalized.boardThickness)
  );

  const maxFridgeWidthMm = Math.max(100, normalized.width - normalized.boardThickness * 2);
  const maxFridgeHeightMm = Math.max(100, normalized.height - normalized.plinthHeight - normalized.boardThickness * 2);
  const maxFridgeDepthMm = Math.max(100, normalized.depth - normalized.backThickness - normalized.frontThicknessMm);
  normalized.fridgeWidthMm = clamp(
    Math.round(getNumber(normalized.fridgeWidthMm, getNumber(MODULE_DEFAULTS.fridgeWidthMm, 560))),
    100,
    maxFridgeWidthMm
  );
  normalized.fridgeHeightMm = clamp(
    Math.round(getNumber(normalized.fridgeHeightMm, getNumber(MODULE_DEFAULTS.fridgeHeightMm, 1770))),
    100,
    maxFridgeHeightMm
  );
  normalized.fridgeDepthMm = clamp(
    Math.round(getNumber(normalized.fridgeDepthMm, getNumber(MODULE_DEFAULTS.fridgeDepthMm, 550))),
    100,
    maxFridgeDepthMm
  );

  normalized.fridgeDoorGapMm = clamp(
    Math.round(getNumber(normalized.fridgeDoorGapMm, getNumber(MODULE_DEFAULTS.fridgeDoorGapMm, 2))),
    0,
    Math.max(0, normalized.fridgeHeightMm - 2)
  );

  const fridgeClearanceHeightBudgetMm = Math.max(0, normalized.fridgeHeightMm - normalized.fridgeDoorGapMm);
  normalized.fridgeTopClearanceMm = clamp(
    Math.round(getNumber(normalized.fridgeTopClearanceMm, getNumber(MODULE_DEFAULTS.fridgeTopClearanceMm, 5))),
    0,
    fridgeClearanceHeightBudgetMm
  );
  normalized.fridgeBottomClearanceMm = clamp(
    Math.round(getNumber(normalized.fridgeBottomClearanceMm, getNumber(MODULE_DEFAULTS.fridgeBottomClearanceMm, 5))),
    0,
    Math.max(0, fridgeClearanceHeightBudgetMm - normalized.fridgeTopClearanceMm)
  );

  const remainingDoorHeightMm = Math.max(
    1,
    normalized.fridgeHeightMm - normalized.fridgeTopClearanceMm - normalized.fridgeBottomClearanceMm - normalized.fridgeDoorGapMm
  );
  normalized.freezerDoorHeightMm = clamp(
    Math.round(getNumber(normalized.freezerDoorHeightMm, getNumber(MODULE_DEFAULTS.freezerDoorHeightMm, 700))),
    1,
    remainingDoorHeightMm - 1
  );

  const sideClearanceBudgetMm = Math.max(0, normalized.width - normalized.fridgeWidthMm - normalized.boardThickness * 2);
  normalized.fridgeSideClearanceMm = clamp(
    Math.round(getNumber(normalized.fridgeSideClearanceMm, getNumber(MODULE_DEFAULTS.fridgeSideClearanceMm, 2))),
    0,
    Math.floor(sideClearanceBudgetMm / 2)
  );

  normalized.handlePositionMm = clamp(
    Math.round(getNumber(normalized.handlePositionMm, getNumber(MODULE_DEFAULTS.handlePositionMm, 60))),
    0,
    Math.max(0, normalized.height - normalized.plinthHeight)
  );

  const upperDoorHeightMm = Math.max(1, remainingDoorHeightMm - normalized.freezerDoorHeightMm);
  const maxHandleOffsetMm = Math.max(0, Math.min(normalized.freezerDoorHeightMm, upperDoorHeightMm) - 40);
  normalized.doorHandleOffsetFromSplitMm = clamp(
    Math.round(getNumber(normalized.doorHandleOffsetFromSplitMm, getNumber(MODULE_DEFAULTS.doorHandleOffsetFromSplitMm, 0))),
    -maxHandleOffsetMm,
    maxHandleOffsetMm
  );

  normalized.sideGap = 0;
  normalized.topGap = 0;
  normalized.bottomGap = 0;
  normalized.doorOpen = normalized.doorOpen === true;

  if (normalized.handleType === "none") delete normalized.handleComponentId;
  else normalized.handleComponentId = cleanString(normalized.handleComponentId) ?? cleanString(MODULE_DEFAULTS.handleComponentId) ?? null;
  normalized.legComponentId = cleanString(normalized.legComponentId) ?? cleanString(MODULE_DEFAULTS.legComponentId) ?? null;

  return normalized;
}

export function validateFridgeTall(params: FridgeTallParams): string[] {
  const errors = validatePortableParams(params as Record<string, unknown>, validateParams);
  const width = getNumber(params.width, 0);
  const height = getNumber(params.height, 0);
  const depth = getNumber(params.depth, 0);
  const boardThickness = getNumber(params.boardThickness, 0);
  const backThickness = getNumber(params.backThickness, 0);
  const frontThicknessMm = getNumber(params.frontThicknessMm, 0);
  const plinthHeight = getNumber(params.plinthHeight, 0);
  const fridgeWidthMm = getNumber(params.fridgeWidthMm, 0);
  const fridgeHeightMm = getNumber(params.fridgeHeightMm, 0);
  const fridgeDepthMm = getNumber(params.fridgeDepthMm, 0);
  const fridgeSideClearanceMm = getNumber(params.fridgeSideClearanceMm, 0);
  const fridgeTopClearanceMm = getNumber(params.fridgeTopClearanceMm, 0);
  const fridgeBottomClearanceMm = getNumber(params.fridgeBottomClearanceMm, 0);
  const fridgeDoorGapMm = getNumber(params.fridgeDoorGapMm, 0);
  const freezerDoorHeightMm = getNumber(params.freezerDoorHeightMm, 0);

  if (params.kitchenModuleRole !== "tall") errors.push("Fridge musí mať kitchenModuleRole = tall.");
  if (params.requiresWorktop !== false) errors.push("Fridge nesmie vyžadovať worktop.");
  if (getNumber(params.worktopThicknessMm, 0) !== 0) errors.push("Fridge musí mať worktopThicknessMm = 0.");
  if (plinthHeight > Math.max(0, height - boardThickness * 2 - 100)) {
    errors.push("Plinth height je príliš veľký vzhľadom na výšku fridge modulu.");
  }
  if (fridgeWidthMm + boardThickness * 2 + fridgeSideClearanceMm * 2 > width) {
    errors.push("Fridge width a side clearances sa nezmestia do šírky korpusu.");
  }
  if (fridgeHeightMm + plinthHeight + boardThickness * 2 > height) {
    errors.push("Fridge height sa nezmestí do výšky korpusu.");
  }
  if (fridgeDepthMm + backThickness + frontThicknessMm > depth) {
    errors.push("Fridge depth sa nezmestí do hĺbky korpusu.");
  }
  if (fridgeTopClearanceMm + fridgeBottomClearanceMm + fridgeDoorGapMm >= fridgeHeightMm) {
    errors.push("Top clearance, bottom clearance a door gap sú príliš veľké pre výšku chladničky.");
  }
  if (freezerDoorHeightMm >= Math.max(1, fridgeHeightMm - fridgeTopClearanceMm - fridgeBottomClearanceMm - fridgeDoorGapMm)) {
    errors.push("Freezer door height musí nechať priestor aj pre horné dvere.");
  }

  return errors;
}
