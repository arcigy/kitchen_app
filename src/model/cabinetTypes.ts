export * from "../modules/drawerLow/types";

import type { DrawerLowParams } from "../modules/drawerLow/types";
import {
  makeDefaultDrawerLowParams,
  validateDrawerLow,
  normalizeDrawerLowParams as normalizeDrawerLowImportedParams
} from "../modules/drawerLow/types";

export const MODULE_TYPES = ["drawer_low"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

export type ModuleParams = DrawerLowParams;

export function makeDefaultModuleParams(type: ModuleType): ModuleParams {
  switch (type) {
    case "drawer_low":
      return makeDefaultDrawerLowParams();
  }
}

export function normalizeModuleParams(params: ModuleParams): ModuleParams {
  switch (params.type) {
    case "drawer_low":
      return normalizeDrawerLowImportedParams(params as DrawerLowParams) as ModuleParams;
  }
  return params;
}

export function validateModule(params: ModuleParams): string[] {
  switch (params.type) {
    case "drawer_low":
      return validateDrawerLow(params as DrawerLowParams);
  }
  return [`Unsupported imported module type: ${(params as { type?: string }).type ?? "unknown"}`];
}
