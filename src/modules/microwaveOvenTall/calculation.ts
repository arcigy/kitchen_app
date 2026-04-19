import type { MicrowaveOvenTallParams } from "../../model/cabinetTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";

export function calculateBOM(
  params: MicrowaveOvenTallParams,
  ctx: KitchenContext
): BOMResult {
  void params;
  void ctx;

  return {
    moduleType: "microwaveOvenTall",
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
