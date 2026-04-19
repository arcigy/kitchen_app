import type { NestedDrawerLowParams } from "../../model/cabinetTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";

export function calculateBOM(
  params: NestedDrawerLowParams,
  ctx: KitchenContext
): BOMResult {
  void params;
  void ctx;

  return {
    moduleType: "nestedDrawerLow",
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
