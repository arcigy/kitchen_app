import type { Group } from "three";
import liveStateSnapshot from "./package/integration/current-live-state.json";
import materialsSnapshot from "./package/definitions/drawer_low.materials.snapshot.json";
import { buildPortableLiveModuleGroup } from "../runtime/portableGeometry";
import type { DrawerLowParams } from "./types";

export function buildDrawerLow(params: DrawerLowParams): Group {
  return buildPortableLiveModuleGroup(
    params as Record<string, unknown>,
    liveStateSnapshot as Parameters<typeof buildPortableLiveModuleGroup>[1],
    materialsSnapshot as Parameters<typeof buildPortableLiveModuleGroup>[2]
  );
}
