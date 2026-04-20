export type {
  DrawerLowParams,
  MaterialParams
} from "../modules/drawerLow/types";
export {
  computeEqualDrawerFrontHeights,
  makeDefaultDrawerLowParams,
  normalizeDrawerLowParams,
  validateDrawerLow
} from "../modules/drawerLow/types";

import type { DrawerLowParams } from "../modules/drawerLow/types";
import {
  makeDefaultDrawerLowParams,
  normalizeDrawerLowParams,
  validateDrawerLow
} from "../modules/drawerLow/types";

export const MODULE_TYPES = ["drawer_low"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

export type ModuleParams = DrawerLowParams;

export function makeDefaultModuleParams(type: ModuleType): ModuleParams {
  switch (type) {
    case "drawer_low":
      return makeDefaultDrawerLowParams();
  }
  return makeDefaultDrawerLowParams();
}

export function normalizeModuleParams(params: ModuleParams): ModuleParams {
  switch (params.type) {
    case "drawer_low":
      return normalizeDrawerLowParams(params);
  }
  return normalizeDrawerLowParams(params);
}

export function validateModule(params: ModuleParams): string[] {
  switch (params.type) {
    case "drawer_low":
      return validateDrawerLow(params);
  }
  return [`Unsupported imported module type: ${(params as { type?: string }).type ?? "unknown"}`];
}
