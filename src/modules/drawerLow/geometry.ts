import type { Group } from "three";
import liveStateSnapshot from "./package/integration/current-live-state.json";
import { buildPortableLiveModuleGroup } from "../runtime/portableGeometry";
import type { DrawerLowParams } from "./types";

export function buildDrawerLow(params: DrawerLowParams): Group {
  return buildPortableLiveModuleGroup(
    params as Record<string, unknown>,
    liveStateSnapshot as Parameters<typeof buildPortableLiveModuleGroup>[1]
  );
}
