import type { Group } from "three";
import geometrySnapshot from "./package/definitions/drawer_low.geometry.json";
import { buildPortableModuleGroup } from "../runtime/portableGeometry";
import type { DrawerLowParams } from "./types";

export function buildDrawerLow(params: DrawerLowParams): Group {
  return buildPortableModuleGroup(
    params as Record<string, unknown>,
    geometrySnapshot as Parameters<typeof buildPortableModuleGroup>[1]
  );
}
