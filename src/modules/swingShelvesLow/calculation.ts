import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import bomSnapshot from "./package/commercial/swing_shelves_low.bom.json";
import materialsSnapshot from "./package/definitions/swing_shelves_low.materials.snapshot.json";
import { buildPortableBomResult } from "../runtime/portableCalculation";
import type { SwingShelvesLowParams } from "./types";

export function calculateBOM(params: SwingShelvesLowParams, ctx: KitchenContext): BOMResult {
  return buildPortableBomResult({
    moduleType: "swing_shelves_low",
    params: params as Record<string, unknown>,
    ctx,
    bom: bomSnapshot as unknown as Parameters<typeof buildPortableBomResult>[0]["bom"],
    materialsSnapshot: materialsSnapshot as unknown as Parameters<typeof buildPortableBomResult>[0]["materialsSnapshot"]
  });
}
