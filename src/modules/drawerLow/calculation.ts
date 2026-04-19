import type { DrawerLowParams } from "../../model/cabinetTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";

export function calculateBOM(
  params: DrawerLowParams,
  ctx: KitchenContext
): BOMResult {
  void params;
  void ctx;

  return {
    moduleType: "drawerLow",
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
