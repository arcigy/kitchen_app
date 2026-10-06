import type { ClientCatalog, ComponentDefinition, MaterialDefinition } from "./catalog-types";

type CatalogInput = Pick<ClientCatalog, "materials" | "components" | "priceList">;
export type PricingCatalog = ReturnType<typeof buildPricingCatalog>;
const calculationContexts = new WeakMap<CatalogInput, { index?: PricingCatalog }>();

/** Indexes live only for one synchronous calculation, so mutable catalogues
 * cannot reuse an index from an earlier project or assignment revision. */
export function withPricingCatalogContext<T>(catalog: CatalogInput, calculate: () => T): T {
  if (calculationContexts.has(catalog)) return calculate();
  calculationContexts.set(catalog, {});
  try { return calculate(); } finally { calculationContexts.delete(catalog); }
}

export function createPricingCatalog(catalog: CatalogInput): PricingCatalog {
  const context = calculationContexts.get(catalog);
  if (!context) return buildPricingCatalog(catalog);
  return context.index ??= buildPricingCatalog(catalog);
}

function buildPricingCatalog(catalog: CatalogInput) {
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
