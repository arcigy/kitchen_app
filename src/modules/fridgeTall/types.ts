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

export function makeDefaultFridgeTallParams(): FridgeTallParams {
  return makePortableDefaultParams(MODULE_DEFAULTS, "fridge_tall") as FridgeTallParams;
}

export function normalizeFridgeTallParams(params: FridgeTallParams): FridgeTallParams {
  return normalizePortableParams(MODULE_DEFAULTS, params, "fridge_tall") as FridgeTallParams;
}

export function validateFridgeTall(params: FridgeTallParams): string[] {
  return validatePortableParams(params as Record<string, unknown>, validateParams);
}
