export * from "../modules/cornerShelfLower/types";
export * from "../modules/drawerLow/types";
export * from "../modules/flapShelvesLow/types";
export * from "../modules/fridgeTall/types";
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
  | SwingShelvesLowParams
  | FwmFurnitureParams;

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
      return normalizeCornerShelfLowerImportedParams(params as CornerShelfLowerParams, { sourceKey }) as ModuleParams;
    case "drawer_low":
      return normalizeDrawerLowImportedParams(params as DrawerLowParams, { sourceKey }) as ModuleParams;
    case "flap_shelves_low":
      return normalizeFlapShelvesLowImportedParams(params as FlapShelvesLowParams, { sourceKey }) as ModuleParams;
    case "fridge_tall":
      return normalizeFridgeTallImportedParams(params as FridgeTallParams) as ModuleParams;
    case "swing_shelves_low":
      return normalizeSwingShelvesLowImportedParams(params as SwingShelvesLowParams, { sourceKey }) as ModuleParams;
  }
  return params;
}

export function validateModule(params: ModuleParams): string[] {
  if (isFwmFurnitureModuleType(params.type)) return validateFwmFurniture(params as FwmFurnitureParams);
  switch (params.type) {
    case "corner_shelf_lower":
      return validateCornerShelfLower(params as CornerShelfLowerParams);
    case "drawer_low":
      return validateDrawerLow(params as DrawerLowParams);
    case "flap_shelves_low":
      return validateFlapShelvesLow(params as FlapShelvesLowParams);
    case "fridge_tall":
      return validateFridgeTall(params as FridgeTallParams);
    case "swing_shelves_low":
      return validateSwingShelvesLow(params as SwingShelvesLowParams);
  }
  return [`Unsupported imported module type: ${(params as { type?: string }).type ?? "unknown"}`];
}
