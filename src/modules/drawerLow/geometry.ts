import type { Group } from "three";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import materialsSnapshot from "./package/definitions/drawer_low.materials.snapshot.json";
import type { DrawerLowParams } from "./types";
import { buildDrawerLowParametric } from "./parametricGeometry";

export function buildDrawerLow(params: DrawerLowParams, catalog: ClientCatalog): Group {
  return buildDrawerLowParametric(
    params,
    materialsSnapshot as unknown as Parameters<typeof buildDrawerLowParametric>[1],
    catalog
  );
}
