import { componentGeometryDefinitions } from "../../data/pricing/componentGeometryDefinitions";
import { demosComponentGeometryTemplates } from "./demosCatalog";

const requiredBaseGeometryIds = new Set([
  "geo.leg.adjustable.100",
  "geo.leg.adjustable.150",
  "geo.plinth_clip.standard",
  "geo.plinth_clip.heavy",
  "geo.hinge_plate.generic",
  "geo.leg_plate.generic",
  "geo.assembly_pack.generic",
  "geo.hanging_bracket.wall.standard",
  "geo.shelf_support.standard"
]);

const byId = new Map(demosComponentGeometryTemplates.map((geometry) => [geometry.id, geometry]));
for (const geometry of componentGeometryDefinitions) {
  if (requiredBaseGeometryIds.has(geometry.id) && !byId.has(geometry.id)) {
    byId.set(geometry.id, geometry);
  }
}

export const systemComponentGeometryTemplates = [...byId.values()];
