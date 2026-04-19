import type { KitchenContext } from "../kitchenContext";
import type { LayoutInstance } from "../appState";
import type { BOMResult } from "./bomTypes";
import { calculateBOM as calculateDrawerLowBOM } from "../../modules/drawerLow/calculation";
import { calculateBOM as calculateNestedDrawerLowBOM } from "../../modules/nestedDrawerLow/calculation";
import { calculateBOM as calculateShelvesBOM } from "../../modules/shelves/calculation";
import { calculateBOM as calculateCornerShelfLowerBOM } from "../../modules/cornerShelfLower/calculation";
import { calculateBOM as calculateFridgeTallBOM } from "../../modules/fridgeTall/calculation";
import { calculateBOM as calculateFlapShelvesLowBOM } from "../../modules/flapShelvesLow/calculation";
import { calculateBOM as calculateSwingShelvesLowBOM } from "../../modules/swingShelvesLow/calculation";
import { calculateBOM as calculateOvenBaseLowBOM } from "../../modules/ovenBaseLow/calculation";
import { calculateBOM as calculateMicrowaveOvenTallBOM } from "../../modules/microwaveOvenTall/calculation";
import { calculateBOM as calculateTopDrawersDoorsLowBOM } from "../../modules/topDrawersDoorsLow/calculation";

export function calculateModuleBOM(
  instance: LayoutInstance,
  ctx: KitchenContext
): BOMResult {
  switch (instance.params.type) {
    case "drawer_low":
      return calculateDrawerLowBOM(instance.params, ctx);
    case "nested_drawer_low":
      return calculateNestedDrawerLowBOM(instance.params, ctx);
    case "shelves":
      return calculateShelvesBOM(instance.params, ctx);
    case "corner_shelf_lower":
      return calculateCornerShelfLowerBOM(instance.params, ctx);
    case "fridge_tall":
      return calculateFridgeTallBOM(instance.params, ctx);
    case "flap_shelves_low":
      return calculateFlapShelvesLowBOM(instance.params, ctx);
    case "swing_shelves_low":
      return calculateSwingShelvesLowBOM(instance.params, ctx);
    case "oven_base_low":
      return calculateOvenBaseLowBOM(instance.params, ctx);
    case "microwave_oven_tall":
      return calculateMicrowaveOvenTallBOM(instance.params, ctx);
    case "top_drawers_doors_low":
      return calculateTopDrawersDoorsLowBOM(instance.params, ctx);
  }
}
