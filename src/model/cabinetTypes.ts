export * from "../modules/cornerShelfLower/types";
export * from "../modules/drawerLow/types";
export * from "../modules/fridgeTall/types";

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

export const MODULE_TYPES = ["corner_shelf_lower", "drawer_low", "fridge_tall"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

export type ModuleParams = CornerShelfLowerParams | DrawerLowParams | FridgeTallParams;

export function makeDefaultModuleParams(type: ModuleType): ModuleParams {
  switch (type) {
    case "corner_shelf_lower":
      return makeDefaultCornerShelfLowerParams();
    case "drawer_low":
      return makeDefaultDrawerLowParams();
    case "fridge_tall":
      return makeDefaultFridgeTallParams();
  }
}

export function normalizeModuleParams(params: ModuleParams): ModuleParams {
  switch (params.type) {
    case "corner_shelf_lower":
      return normalizeCornerShelfLowerImportedParams(params as CornerShelfLowerParams) as ModuleParams;
    case "drawer_low":
      return normalizeDrawerLowImportedParams(params as DrawerLowParams) as ModuleParams;
    case "fridge_tall":
      return normalizeFridgeTallImportedParams(params as FridgeTallParams) as ModuleParams;
  }
  return params;
}

export function normalizeModuleParamsForSource(params: ModuleParams, _sourceKey?: string): ModuleParams {
  return normalizeModuleParams(params);
}

export function validateModule(params: ModuleParams): string[] {
  switch (params.type) {
    case "corner_shelf_lower":
      return validateCornerShelfLower(params as CornerShelfLowerParams);
    case "drawer_low":
      return validateDrawerLow(params as DrawerLowParams);
    case "fridge_tall":
      return validateFridgeTall(params as FridgeTallParams);
  }
  return [`Unsupported imported module type: ${(params as { type?: string }).type ?? "unknown"}`];
}
