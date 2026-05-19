import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import bomSnapshot from "./package/commercial/corner_shelf_lower.bom.json";
import materialsSnapshot from "./package/definitions/corner_shelf_lower.materials.snapshot.json";
import { buildPortableBomResult } from "../runtime/portableCalculation";
import type { CornerShelfLowerParams } from "./types";

export function calculateBOM(params: CornerShelfLowerParams, ctx: KitchenContext, catalog: ClientCatalog): BOMResult {
  return buildPortableBomResult({
    moduleType: "corner_shelf_lower",
    params: params as Record<string, unknown>,
    ctx,
    catalog,
    bom: bomSnapshot as unknown as Parameters<typeof buildPortableBomResult>[0]["bom"],
    materialsSnapshot: materialsSnapshot as unknown as Parameters<typeof buildPortableBomResult>[0]["materialsSnapshot"]
  });
}
