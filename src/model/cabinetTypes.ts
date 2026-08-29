export * from "../modules/cornerShelfLower/types";
export * from "../modules/drawerLow/types";
export * from "../modules/flapShelvesLow/types";
export * from "../modules/fridgeTall/types";
export * from "../modules/pinoSideCabinet/types";
export * from "../modules/swingShelvesLow/types";
export * from "../modules/fwmFurniture/types";
export { FWM_FURNITURE_MODULE_TYPES } from "../modules/fwmFurniture/definitions";

import type { CornerShelfLowerParams } from "../modules/cornerShelfLower/types";
import {
  makeDefaultCornerShelfLowerParams,
  validateCornerShelfLower,
  normalizeCornerShelfLowerParams as normalizeCornerShelfLowerImportedParams
} from "../modules/cornerShelfLower/types";

import type { DrawerLowParams } from "../modules/drawerLow/types";
import {
  makeDefaultDrawerLowParams,
  validateDrawerLow,
  normalizeDrawerLowParams as normalizeDrawerLowImportedParams
} from "../modules/drawerLow/types";

import type { FlapShelvesLowParams } from "../modules/flapShelvesLow/types";
import {
  makeDefaultFlapShelvesLowParams,
  validateFlapShelvesLow,
  normalizeFlapShelvesLowParams as normalizeFlapShelvesLowImportedParams
} from "../modules/flapShelvesLow/types";

import type { FridgeTallParams } from "../modules/fridgeTall/types";
import {
  makeDefaultFridgeTallParams,
  validateFridgeTall,
  normalizeFridgeTallParams as normalizeFridgeTallImportedParams
} from "../modules/fridgeTall/types";

import type { PinoSideCabinetParams } from "../modules/pinoSideCabinet/types";
import {
  makeDefaultPinoSideCabinetParams,
  normalizePinoSideCabinetParams,
  validatePinoSideCabinet
} from "../modules/pinoSideCabinet/types";

import type { SwingShelvesLowParams } from "../modules/swingShelvesLow/types";
import {
  makeDefaultSwingShelvesLowParams,
  validateSwingShelvesLow,
  normalizeSwingShelvesLowParams as normalizeSwingShelvesLowImportedParams
} from "../modules/swingShelvesLow/types";
import { FWM_FURNITURE_MODULE_TYPES } from "../modules/fwmFurniture/definitions";
import type { FwmFurnitureModuleType } from "../modules/fwmFurniture/definitions";
import type { FwmFurnitureParams } from "../modules/fwmFurniture/types";
import {
  isFwmFurnitureModuleType,
  makeDefaultFwmFurnitureParams,
  normalizeFwmFurnitureParams,
  validateFwmFurniture
} from "../modules/fwmFurniture/types";

const BUILTIN_MODULE_TYPES = [
  "corner_shelf_lower",
  "drawer_low",
  "flap_shelves_low",
  "fridge_tall",
  "pino_side_cabinet",
  "swing_shelves_low"
] as const;

export type BuiltInModuleType = (typeof BUILTIN_MODULE_TYPES)[number];
export type ModuleType = BuiltInModuleType | FwmFurnitureModuleType;

export const MODULE_TYPES = [
  ...BUILTIN_MODULE_TYPES,
  ...FWM_FURNITURE_MODULE_TYPES
] as readonly ModuleType[];

export type ModuleParams =
  | CornerShelfLowerParams
  | DrawerLowParams
  | FlapShelvesLowParams
  | FridgeTallParams
  | PinoSideCabinetParams
  | SwingShelvesLowParams
  | FwmFurnitureParams;

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function applyRevitCornerPreviewAliases(params: CornerShelfLowerParams): CornerShelfLowerParams {
  const record = { ...params } as Record<string, unknown>;
  const aliases = [
    ["lengthx", "lengthX"],
    ["lengthz", "lengthZ"],
    ["plinth_height", "plinthHeight"],
    ["corpus_height", "heightCarcass"],
    ["hrubka_dosky", "boardThickness"]
  ] as const;

  for (const [fromKey, toKey] of aliases) {
    const value = readFiniteNumber(record, fromKey);
    if (value !== null) record[toKey] = value;
  }

  const corpusHeightMm = readFiniteNumber(record, "corpus_height");
  const totalHeightMm = readFiniteNumber(record, "height");
  if (corpusHeightMm !== null && totalHeightMm !== null) {
    record.worktopThicknessMm = Math.max(0, totalHeightMm - corpusHeightMm);
  }

  const shelfGapMm = readFiniteNumber(record, "vyska_policky");
  if (shelfGapMm !== null) {
    const shelfCount = readFiniteNumber(record, "shelfCount") ?? readFiniteNumber(record, "shelfcount") ?? 4;
    record.shelfAutoFit = false;
    record.shelfGaps = Array.from({ length: Math.max(1, Math.round(shelfCount)) }, () => shelfGapMm);
  }

  return record as CornerShelfLowerParams;
}

export function makeDefaultModuleParams(type: ModuleType): ModuleParams {
  if (isFwmFurnitureModuleType(type)) return makeDefaultFwmFurnitureParams(type);
  switch (type) {
    case "corner_shelf_lower":
      return makeDefaultCornerShelfLowerParams();
    case "drawer_low":
      return makeDefaultDrawerLowParams();
    case "flap_shelves_low":
      return makeDefaultFlapShelvesLowParams();
    case "fridge_tall":
      return makeDefaultFridgeTallParams();
    case "pino_side_cabinet":
      return makeDefaultPinoSideCabinetParams();
    case "swing_shelves_low":
      return makeDefaultSwingShelvesLowParams();
  }
  throw new Error(`Unsupported module type: ${type}`);
}

export function normalizeModuleParams(params: ModuleParams): ModuleParams {
  return normalizeModuleParamsForSource(params);
}

export function normalizeModuleParamsForSource(params: ModuleParams, sourceKey?: string): ModuleParams {
  if (isFwmFurnitureModuleType(params.type)) {
    return normalizeFwmFurnitureParams(params as FwmFurnitureParams) as ModuleParams;
  }
  switch (params.type) {
    case "corner_shelf_lower":
      return normalizeCornerShelfLowerImportedParams(applyRevitCornerPreviewAliases(params as CornerShelfLowerParams), { sourceKey }) as ModuleParams;
    case "drawer_low":
      return normalizeDrawerLowImportedParams(params as DrawerLowParams, { sourceKey }) as ModuleParams;
    case "flap_shelves_low":
      return normalizeFlapShelvesLowImportedParams(params as FlapShelvesLowParams, { sourceKey }) as ModuleParams;
    case "fridge_tall":
      return normalizeFridgeTallImportedParams(params as FridgeTallParams) as ModuleParams;
    case "pino_side_cabinet":
      return normalizePinoSideCabinetParams(params as PinoSideCabinetParams) as ModuleParams;
    case "swing_shelves_low":
      return normalizeSwingShelvesLowImportedParams(params as SwingShelvesLowParams, { sourceKey }) as ModuleParams;
  }
  return params;
}

export function validateModule(params: ModuleParams): string[] {
  if (isFwmFurnitureModuleType(params.type)) return validateFwmFurniture(params as FwmFurnitureParams);
  switch (params.type) {
    case "corner_shelf_lower":
      return validateCornerShelfLower(normalizeCornerShelfLowerImportedParams(applyRevitCornerPreviewAliases(params as CornerShelfLowerParams)));
    case "drawer_low":
      return validateDrawerLow(params as DrawerLowParams);
    case "flap_shelves_low":
      return validateFlapShelvesLow(params as FlapShelvesLowParams);
    case "fridge_tall":
      return validateFridgeTall(params as FridgeTallParams);
    case "pino_side_cabinet":
      return validatePinoSideCabinet(params as PinoSideCabinetParams);
    case "swing_shelves_low":
      return validateSwingShelvesLow(params as SwingShelvesLowParams);
  }
  if (typeof (params as Record<string, unknown>).modulePackageId === "string") return [];
  return [`Unsupported imported module type: ${(params as { type?: string }).type ?? "unknown"}`];
}
