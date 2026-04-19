import type { ShelvesParams } from "../../model/cabinetTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";

export function calculateBOM(
  params: ShelvesParams,
  ctx: KitchenContext
): BOMResult {
  void params;
  void ctx;

  return {
    moduleType: "shelves",
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
