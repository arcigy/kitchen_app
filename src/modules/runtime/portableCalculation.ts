import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import {
  buildRuntimeQuoteBom,
  calculateCommercialPricingFromQuoteBom,
  type PortableMaterialsSnapshot,
  type PortableQuoteBomPayload
} from "./portableCommercial";

export function buildPortableBomResult(args: {
  moduleType: string;
  params: Record<string, unknown>;
  ctx: KitchenContext;
  catalog: ClientCatalog;
  bom: PortableQuoteBomPayload;
  materialsSnapshot?: PortableMaterialsSnapshot | null;
}): BOMResult {
  const { moduleType, params, ctx, catalog, bom, materialsSnapshot } = args;
  void ctx;

  const quoteBom = buildRuntimeQuoteBom({
    bom,
    catalog,
    materialsSnapshot,
    params
  });
  const pricing = calculateCommercialPricingFromQuoteBom({
    quoteBom,
    catalog
  });

  return {
    moduleType,
    displayName: bom.displayName,
    quoteBom,
    pricing,
    materialsSnapshot
  };
}
