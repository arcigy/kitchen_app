import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import bomSnapshot from "./package/commercial/flap_shelves_low.bom.json";
import materialsSnapshot from "./package/definitions/flap_shelves_low.materials.snapshot.json";
import { buildPortableBomResult } from "../runtime/portableCalculation";
import type { FlapShelvesLowParams } from "./types";

export function calculateBOM(params: FlapShelvesLowParams, ctx: KitchenContext): BOMResult {
  return buildPortableBomResult({
    moduleType: "flap_shelves_low",
    params: params as Record<string, unknown>,
    ctx,
    bom: bomSnapshot as Parameters<typeof buildPortableBomResult>[0]["bom"],
    materialsSnapshot: materialsSnapshot as Parameters<typeof buildPortableBomResult>[0]["materialsSnapshot"]
  });
}
