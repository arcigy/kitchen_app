export * from "../modules/cornerShelfLower/types";
export * from "../modules/drawerLow/types";

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

export const MODULE_TYPES = ["corner_shelf_lower", "drawer_low"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

export type ModuleParams = CornerShelfLowerParams | DrawerLowParams;

export function makeDefaultModuleParams(type: ModuleType): ModuleParams {
  switch (type) {
    case "corner_shelf_lower":
      return makeDefaultCornerShelfLowerParams();
    case "drawer_low":
      return makeDefaultDrawerLowParams();
  }
}

export function normalizeModuleParams(params: ModuleParams): ModuleParams {
  switch (params.type) {
    case "corner_shelf_lower":
      return normalizeCornerShelfLowerImportedParams(params as CornerShelfLowerParams) as ModuleParams;
    case "drawer_low":
      return normalizeDrawerLowImportedParams(params as DrawerLowParams) as ModuleParams;
  }
  return params;
}

export function normalizeModuleParamsForSource(params: ModuleParams, sourceKey?: string): ModuleParams {
  switch (params.type) {
    case "corner_shelf_lower":
      return normalizeCornerShelfLowerImportedParams(params as CornerShelfLowerParams, { sourceKey }) as ModuleParams;
    case "drawer_low":
      return normalizeDrawerLowImportedParams(params as DrawerLowParams, { sourceKey }) as ModuleParams;
  }
  return params;
}

export function validateModule(params: ModuleParams): string[] {
  switch (params.type) {
    case "corner_shelf_lower":
      return validateCornerShelfLower(params as CornerShelfLowerParams);
    case "drawer_low":
      return validateDrawerLow(params as DrawerLowParams);
  }
  return [`Unsupported imported module type: ${(params as { type?: string }).type ?? "unknown"}`];
}
