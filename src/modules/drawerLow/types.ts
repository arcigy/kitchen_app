import defaults from "./package/definitions/drawer_low.defaults.json";
import { validateParams } from "./package/logic/drawer_low.validation";
import type { PortableJsonValue } from "../runtime/portableTypes";
import {
  makePortableDefaultParams,
  normalizePortableParams,
  validatePortableParams
} from "../runtime/portableTypes";

export type DrawerLowParams = {
  type: "drawer_low";
} & Record<string, PortableJsonValue>;

const MODULE_DEFAULTS = defaults as DrawerLowParams;

export function makeDefaultDrawerLowParams(): DrawerLowParams {
  return makePortableDefaultParams(MODULE_DEFAULTS, "drawer_low") as DrawerLowParams;
}

export function normalizeDrawerLowParams(params: DrawerLowParams): DrawerLowParams {
  return normalizePortableParams(MODULE_DEFAULTS, params, "drawer_low") as DrawerLowParams;
}

export function validateDrawerLow(params: DrawerLowParams): string[] {
  return validatePortableParams(params as Record<string, unknown>, validateParams);
}
