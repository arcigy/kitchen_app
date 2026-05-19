import type { ClientCatalog, ComponentDefinition, MaterialDefinition } from "./catalog-types";

export type PricingCatalog = ReturnType<typeof createPricingCatalog>;

export function createPricingCatalog(catalog: Pick<ClientCatalog, "materials" | "components" | "priceList">) {
  const materialDefinitionsById = new Map(catalog.materials.map((material) => [material.id, material]));
  const componentDefinitionsById = new Map(catalog.components.map((component) => [component.id, component]));

  return {
    priceList: catalog.priceList,
    materialDefinitions: catalog.materials,
    componentDefinitions: catalog.components,
    getUnitPriceForCatalogId(catalogId: string): number | null {
      return catalog.priceList.prices[catalogId] ?? null;
    },
    getMaterialDefinitionById(id: string): MaterialDefinition | null {
      return materialDefinitionsById.get(id) ?? null;
    },
    getComponentDefinitionById(id: string): ComponentDefinition | null {
      return componentDefinitionsById.get(id) ?? null;
    }
  };
}
