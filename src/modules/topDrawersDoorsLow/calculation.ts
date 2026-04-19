import type { TopDrawersDoorsLowParams } from "../../model/cabinetTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";

export function calculateBOM(
  params: TopDrawersDoorsLowParams,
  ctx: KitchenContext
): BOMResult {
  void params;
  void ctx;

  return {
    moduleType: "topDrawersDoorsLow",
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
