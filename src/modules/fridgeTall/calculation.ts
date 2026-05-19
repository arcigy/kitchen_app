import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import bomSnapshot from "./package/commercial/fridge_tall.bom.json";
import materialsSnapshot from "./package/definitions/fridge_tall.materials.snapshot.json";
import { buildPortableBomResult } from "../runtime/portableCalculation";
import type { FridgeTallParams } from "./types";

export function calculateBOM(params: FridgeTallParams, ctx: KitchenContext, catalog: ClientCatalog): BOMResult {
  return buildPortableBomResult({
    moduleType: "fridge_tall",
    params: params as Record<string, unknown>,
    ctx,
    catalog,
    bom: bomSnapshot as unknown as Parameters<typeof buildPortableBomResult>[0]["bom"],
    materialsSnapshot: materialsSnapshot as unknown as Parameters<typeof buildPortableBomResult>[0]["materialsSnapshot"]
  });
}
