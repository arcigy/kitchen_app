import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import bomSnapshot from "./package/commercial/fridge_tall.bom.json";
import materialsSnapshot from "./package/definitions/fridge_tall.materials.snapshot.json";
import { buildPortableBomResult } from "../runtime/portableCalculation";
import type { FridgeTallParams } from "./types";

export function calculateBOM(params: FridgeTallParams, ctx: KitchenContext): BOMResult {
  return buildPortableBomResult({
    moduleType: "fridge_tall",
    params: params as Record<string, unknown>,
    ctx,
    bom: bomSnapshot as Parameters<typeof buildPortableBomResult>[0]["bom"],
    materialsSnapshot: materialsSnapshot as Parameters<typeof buildPortableBomResult>[0]["materialsSnapshot"]
  });
}
