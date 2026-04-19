import type { CornerShelfLowerParams } from "../../model/cabinetTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";

export function calculateBOM(
  params: CornerShelfLowerParams,
  ctx: KitchenContext
): BOMResult {
  void params;
  void ctx;

  return {
    moduleType: "cornerShelfLower",
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
