import type { ModuleParams } from "../model/cabinetTypes";
import { buildDrawerLow } from "./buildDrawerLow";
import { buildCornerShelfLower } from "./buildCornerShelfLower";
import { buildShelves } from "./buildShelves";
import { buildFlapShelvesLow } from "./buildFlapShelvesLow";
import { buildSwingShelvesLow } from "./buildSwingShelvesLow";
import { buildNestedDrawerLow } from "./buildNestedDrawerLow";

export function buildModule(p: ModuleParams) {
  if (p.type === "drawer_low") return buildDrawerLow(p);
  if (p.type === "nested_drawer_low") return buildNestedDrawerLow(p);
  if (p.type === "flap_shelves_low") return buildFlapShelvesLow(p);
  if (p.type === "swing_shelves_low") return buildSwingShelvesLow(p);
  if (p.type === "corner_shelf_lower") return buildCornerShelfLower(p);
  return buildShelves(p);
}
