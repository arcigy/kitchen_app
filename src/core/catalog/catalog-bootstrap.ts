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

export function createSystemCatalogSeed(): ClientCatalogSeed {
  const now = new Date().toISOString();
  return {
    materials: structuredClone(systemMaterialTemplates),
    hardware: structuredClone(systemHardwareTemplates),
    legacyMaterials: structuredClone([...systemLegacyMaterialTemplates]),
    components: structuredClone(systemComponentTemplates),
    componentGeometry: structuredClone(systemComponentGeometryTemplates),
    modules: structuredClone(systemModuleTemplates),
    priceList: structuredClone(systemPriceListTemplate),
    kitchenDefaults: structuredClone(systemKitchenDefaultsTemplate),
    meta: {
      catalogVersion: 1,
      source: "system-seed",
      createdAt: now,
      updatedAt: now
    }
  };
}
