import { componentGeometryDefinitions } from "./componentGeometryDefinitions";
import { componentDefinitions } from "./componentDefinitions";
import { materialDefinitions } from "./materialDefinitions";
import { getUnitPriceForCatalogId, priceList } from "./priceList";
import type {
  ComponentGeometryDefinition,
  ComponentDefinition,
  MaterialDefinition,
  PriceList,
  PricingCatalogRecord,
  PricingCatalogTableRow
} from "./types";

export type {
  BoardFamily,
  ComponentGeometryArchetype,
  ComponentGeometryDefinition,
  ComponentGeometryDimensions,
  ComponentGeometrySource,
  ComponentDefinition,
  ComponentType,
  EdgeFamily,
  MaterialDefinition,
  MaterialType,
  PriceList,
  PricingBasis,
  PricingCatalogRecord,
  PricingCatalogTableRow,
  PricingUnit
} from "./types";

export { componentDefinitions } from "./componentDefinitions";
export {
  componentGeometryDefinitions,
  getComponentGeometryDefinitionById,
  getComponentGeometryDefinitionForComponentId
} from "./componentGeometryDefinitions";
export { materialDefinitions } from "./materialDefinitions";
export { getUnitPriceForCatalogId, priceList } from "./priceList";

export const pricingCatalogRecords: PricingCatalogRecord[] = [...materialDefinitions, ...componentDefinitions];

export const materialDefinitionsById: Record<string, MaterialDefinition> = Object.fromEntries(
  materialDefinitions.map((material) => [material.id, material])
);

export const componentDefinitionsById: Record<string, ComponentDefinition> = Object.fromEntries(
  componentDefinitions.map((component) => [component.id, component])
);

export const pricingCatalogRecordsById: Record<string, PricingCatalogRecord> = Object.fromEntries(
  pricingCatalogRecords.map((record) => [record.id, record])
);

export const pricingCatalogTableRows: PricingCatalogTableRow[] = pricingCatalogRecords.map((record) => ({
  id: record.id,
  entityType: record.entityType,
  displayName: record.displayName,
  category: record.entityType === "material" ? record.category : record.componentType,
  pricingBasis: record.pricingBasis,
  pricingUnit: record.pricingUnit,
  unitPriceEur: getUnitPriceForCatalogId(record.id),
  isActive: record.isActive,
  tags: [...record.tags]
}));

export const pricingCatalog = {
  materialDefinitions,
  componentDefinitions,
  componentGeometryDefinitions,
  priceList
} satisfies {
  materialDefinitions: MaterialDefinition[];
  componentDefinitions: ComponentDefinition[];
  componentGeometryDefinitions: ComponentGeometryDefinition[];
  priceList: PriceList;
};

export function getPricingCatalogRecordById(id: string): PricingCatalogRecord | null {
  return pricingCatalogRecordsById[id] ?? null;
}
