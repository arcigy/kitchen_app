import type { SwingShelvesLowParams } from "../../model/cabinetTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";

export function calculateBOM(
  params: SwingShelvesLowParams,
  ctx: KitchenContext
): BOMResult {
  void params;
  void ctx;

  return {
    moduleType: "swingShelvesLow",
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
