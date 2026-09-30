import { componentDefinitions } from "../../data/pricing/componentDefinitions";
import { demosComponentTemplates } from "./demosCatalog";

const requiredBaseComponentIds = new Set([
  "cmp.leg.adjustable.100.black",
  "cmp.leg.adjustable.100.white",
  "cmp.leg.adjustable.150.black",
  "cmp.leg.adjustable.150.inox",
  "cmp.clip.plinth.standard",
  "cmp.clip.plinth.heavy",
  "cmp.hinge_plate.generic",
  "cmp.leg_plate.generic",
  "cmp.assembly_pack.generic",
  "cmp.hanging_bracket.wall.standard",
  "cmp.shelf_support.standard.nickel"
]);

const byId = new Map(demosComponentTemplates.map((component) => [component.id, component]));
for (const component of componentDefinitions) {
  if (requiredBaseComponentIds.has(component.id) && !byId.has(component.id)) {
    byId.set(component.id, component);
  }
}

export const systemComponentTemplates = [...byId.values()];
