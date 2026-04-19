import type { FlapShelvesLowParams } from "../../model/cabinetTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";

export function calculateBOM(
  params: FlapShelvesLowParams,
  ctx: KitchenContext
): BOMResult {
  void params;
  void ctx;

  return {
    moduleType: "flapShelvesLow",
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
