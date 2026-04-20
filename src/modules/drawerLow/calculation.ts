import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import type { DrawerLowParams } from "./types";

export function calculateBOM(params: DrawerLowParams, ctx: KitchenContext): BOMResult {
  void params;
  void ctx;
  return {
    moduleType: "drawer_low",
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
