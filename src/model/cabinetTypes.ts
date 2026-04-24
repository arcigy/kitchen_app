export * from "../modules/cornerShelfLower/types";
export * from "../modules/drawerLow/types";
export * from "../modules/fridgeTall/types";
export * from "../modules/swingShelvesLow/types";

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

export const MODULE_TYPES = ["corner_shelf_lower", "drawer_low", "fridge_tall", "swing_shelves_low"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

export type ModuleParams = CornerShelfLowerParams | DrawerLowParams | FridgeTallParams | SwingShelvesLowParams;

export function makeDefaultModuleParams(type: ModuleType): ModuleParams {
  switch (type) {
    case "corner_shelf_lower":
      return makeDefaultCornerShelfLowerParams();
    case "drawer_low":
      return makeDefaultDrawerLowParams();
    case "fridge_tall":
      return makeDefaultFridgeTallParams();
    case "swing_shelves_low":
      return makeDefaultSwingShelvesLowParams();
  }
}

export function normalizeModuleParams(params: ModuleParams): ModuleParams {
  return normalizeModuleParamsForSource(params);
}

export function normalizeModuleParamsForSource(params: ModuleParams, sourceKey?: string): ModuleParams {
  switch (params.type) {
    case "corner_shelf_lower":
      return normalizeCornerShelfLowerImportedParams(params as CornerShelfLowerParams, { sourceKey }) as ModuleParams;
    case "drawer_low":
      return normalizeDrawerLowImportedParams(params as DrawerLowParams, { sourceKey }) as ModuleParams;
    case "fridge_tall":
      return normalizeFridgeTallImportedParams(params as FridgeTallParams) as ModuleParams;
    case "swing_shelves_low":
      return normalizeSwingShelvesLowImportedParams(params as SwingShelvesLowParams, { sourceKey }) as ModuleParams;
  }
  return params;
}

export function validateModule(params: ModuleParams): string[] {
  switch (params.type) {
    case "corner_shelf_lower":
      return validateCornerShelfLower(params as CornerShelfLowerParams);
    case "drawer_low":
      return validateDrawerLow(params as DrawerLowParams);
    case "fridge_tall":
      return validateFridgeTall(params as FridgeTallParams);
    case "swing_shelves_low":
      return validateSwingShelvesLow(params as SwingShelvesLowParams);
  }
  return [`Unsupported imported module type: ${(params as { type?: string }).type ?? "unknown"}`];
}
