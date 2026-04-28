import type { Group } from "three";
import materialsSnapshot from "./package/definitions/drawer_low.materials.snapshot.json";
import type { DrawerLowParams } from "./types";
import { buildDrawerLowParametric } from "./parametricGeometry";

export function buildDrawerLow(params: DrawerLowParams): Group {
  return buildDrawerLowParametric(
    params,
    materialsSnapshot as unknown as Parameters<typeof buildDrawerLowParametric>[1]
  );
}
