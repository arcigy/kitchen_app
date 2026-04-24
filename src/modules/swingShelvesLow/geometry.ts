import type { Group } from "three";
import liveStateSnapshot from "./package/integration/current-live-state.json";
import materialsSnapshot from "./package/definitions/swing_shelves_low.materials.snapshot.json";
import { buildPortableLiveModuleGroup } from "../runtime/portableGeometry";
import type { SwingShelvesLowParams } from "./types";

export function buildSwingShelvesLow(params: SwingShelvesLowParams): Group {
  return buildPortableLiveModuleGroup(
    params as Record<string, unknown>,
    liveStateSnapshot as Parameters<typeof buildPortableLiveModuleGroup>[1],
    materialsSnapshot as Parameters<typeof buildPortableLiveModuleGroup>[2]
  );
}
