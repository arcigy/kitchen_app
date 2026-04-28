import type { Group } from "three";
import materialsSnapshot from "./package/definitions/swing_shelves_low.materials.snapshot.json";
import { buildSwingShelvesLowParametric } from "./parametricGeometry";
import type { SwingShelvesLowParams } from "./types";

export function buildSwingShelvesLow(params: SwingShelvesLowParams): Group {
  return buildSwingShelvesLowParametric(
    params,
    materialsSnapshot as unknown as Parameters<typeof buildSwingShelvesLowParametric>[1]
  );
}
