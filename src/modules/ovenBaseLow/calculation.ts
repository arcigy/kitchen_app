import type { OvenBaseLowParams } from "../../model/cabinetTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";

export function calculateBOM(
  params: OvenBaseLowParams,
  ctx: KitchenContext
): BOMResult {
  void params;
  void ctx;

  return {
    moduleType: "ovenBaseLow",
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
