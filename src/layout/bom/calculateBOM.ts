import type { KitchenContext } from "../kitchenContext";
import type { LayoutInstance } from "../appState";
import type { BOMResult } from "./bomTypes";
import { getModuleDescriptorOrThrow } from "../../modules/registry";
import type { ClientCatalog } from "../../core/catalog/catalog-types";

export function calculateModuleBOM(
  instance: LayoutInstance,
  ctx: KitchenContext,
  catalog: ClientCatalog
): BOMResult {
  return getModuleDescriptorOrThrow(instance.params.type).calculateBOM(instance.params, ctx, catalog);
}
