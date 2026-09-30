import type { ClientCatalog } from "./catalog-types";
import { systemComponentGeometryTemplates, systemComponentTemplates } from "../../system/catalog-templates";

const REQUIRED_COMPONENT_IDS = [
  "cmp.hinge_plate.generic",
  "cmp.leg_plate.generic",
  "cmp.assembly_pack.generic",
  "cmp.hanging_bracket.wall.standard",
  "cmp.shelf_support.standard.nickel"
] as const;

/** Add identities required by current FWM BOMs without supplying or changing prices. */
export function ensureRequiredFwmHardware(catalog: ClientCatalog): ClientCatalog {
  const components = [...catalog.components];
  const componentGeometry = [...catalog.componentGeometry];
  const componentIds = new Set(components.map((component) => component.id));
  const geometryIds = new Set(componentGeometry.map((geometry) => geometry.id));
  let changed = false;

  for (const id of REQUIRED_COMPONENT_IDS) {
    const definition = systemComponentTemplates.find((component) => component.id === id);
    if (definition && !componentIds.has(id)) {
      components.push(structuredClone(definition));
      componentIds.add(id);
      changed = true;
    }
    const geometry = definition && systemComponentGeometryTemplates.find((item) => item.id === definition.geometryId);
    if (geometry && !geometryIds.has(geometry.id)) {
      componentGeometry.push(structuredClone(geometry));
      geometryIds.add(geometry.id);
      changed = true;
    }
  }

  if (!changed) return catalog;
  return {
    ...catalog,
    components,
    componentGeometry,
    meta: { ...catalog.meta, catalogVersion: catalog.meta.catalogVersion + 1, updatedAt: new Date().toISOString() }
  };
}
