import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import bomSnapshot from "./package/commercial/drawer_low.bom.json";
import materialsSnapshot from "./package/definitions/drawer_low.materials.snapshot.json";
import { buildPortableBomResult } from "../runtime/portableCalculation";
import type { DrawerLowParams } from "./types";

export function calculateBOM(params: DrawerLowParams, ctx: KitchenContext): BOMResult {
  return buildPortableBomResult({
    moduleType: "drawer_low",
    params: params as Record<string, unknown>,
    ctx,
    bom: bomSnapshot as Parameters<typeof buildPortableBomResult>[0]["bom"],
    materialsSnapshot: materialsSnapshot as Parameters<typeof buildPortableBomResult>[0]["materialsSnapshot"]
  });
}
