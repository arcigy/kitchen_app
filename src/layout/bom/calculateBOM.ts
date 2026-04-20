import type { KitchenContext } from "../kitchenContext";
import type { LayoutInstance } from "../appState";
import type { BOMResult } from "./bomTypes";

export function calculateModuleBOM(
  instance: LayoutInstance,
  ctx: KitchenContext
): BOMResult {
  void ctx;
  return {
    moduleType: instance.params.type,
    parts: [],
    hardware: [],
    totalPrice: 0
  };
}
