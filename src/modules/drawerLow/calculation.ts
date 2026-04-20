import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import bomSnapshot from "./package/commercial/drawer_low.bom.json";
import pricingSnapshot from "./package/commercial/drawer_low.pricing.json";
import { buildPortableBomResult } from "../runtime/portableCalculation";
import type { DrawerLowParams } from "./types";

export function calculateBOM(params: DrawerLowParams, ctx: KitchenContext): BOMResult {
  void params;
  void ctx;
  return buildPortableBomResult({
    moduleType: "drawer_low",
    bom: bomSnapshot as Parameters<typeof buildPortableBomResult>[0]["bom"],
    pricing: pricingSnapshot as Parameters<typeof buildPortableBomResult>[0]["pricing"]
  });
}
