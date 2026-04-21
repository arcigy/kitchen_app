import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
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
  bom: PortableQuoteBomPayload;
  materialsSnapshot?: PortableMaterialsSnapshot | null;
}): BOMResult {
  const { moduleType, params, ctx, bom, materialsSnapshot } = args;
  void ctx;

  const quoteBom = buildRuntimeQuoteBom({
    bom,
    materialsSnapshot,
    params
  });
  const pricing = calculateCommercialPricingFromQuoteBom({
    quoteBom
  });

  return {
    moduleType,
    displayName: bom.displayName,
    quoteBom,
    pricing,
    materialsSnapshot
  };
}
