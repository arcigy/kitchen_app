import type { KitchenContext } from "../kitchenContext";
import type { LayoutInstance } from "../appState";
import type { BOMResult } from "./bomTypes";
import { getModuleDescriptorOrThrow } from "../../modules/registry";

export function calculateModuleBOM(
  instance: LayoutInstance,
  ctx: KitchenContext
): BOMResult {
  return getModuleDescriptorOrThrow(instance.params.type).calculateBOM(instance.params, ctx);
}
