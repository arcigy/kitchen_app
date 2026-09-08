import type { ClientCatalogSeed } from "./catalog-types";
import {
  systemComponentGeometryTemplates,
  systemComponentTemplates,
  systemHardwareTemplates,
  systemKitchenDefaultsTemplate,
  systemLegacyMaterialTemplates,
  systemMaterialTemplates,
  systemModuleTemplates,
  systemPriceListTemplate
} from "../../system/catalog-templates";

// File catalogs predate persisted legacy materials and metadata. Loading those
// compatibility defaults must not clone the full supplier catalog on each request.
export function createSystemCatalogLegacyDefaults(): Pick<ClientCatalogSeed, "legacyMaterials" | "meta"> {
  const now = new Date().toISOString();
  return {
    legacyMaterials: structuredClone([...systemLegacyMaterialTemplates]),
    meta: { catalogVersion: 1, source: "system-seed", createdAt: now, updatedAt: now }
  };
}

export function createSystemCatalogSeed(): ClientCatalogSeed {
  return {
    ...createSystemCatalogLegacyDefaults(),
    materials: structuredClone(systemMaterialTemplates),
    hardware: structuredClone(systemHardwareTemplates),
    components: structuredClone(systemComponentTemplates),
    componentGeometry: structuredClone(systemComponentGeometryTemplates),
    modules: structuredClone(systemModuleTemplates),
    priceList: structuredClone(systemPriceListTemplate),
    kitchenDefaults: structuredClone(systemKitchenDefaultsTemplate)
  };
}
