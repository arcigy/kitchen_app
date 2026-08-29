import type { ClientCatalog, ClientModuleDefinition } from "../catalog/catalog-types";
import type { FurnQuoteModulePackage } from "./module-package-types";

function numberDefault(modulePackage: FurnQuoteModulePackage, key: string): number | undefined {
  const value = modulePackage.parameters.parameters.find((parameter) => parameter.key === key)?.defaultValue;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function firstPricingRef(modulePackage: FurnQuoteModulePackage, catalog?: Pick<ClientCatalog, "priceList">): string | undefined {
  const refs = modulePackage.pricing?.pricingRefs ?? [];
  if (!catalog) return refs[0];
  return refs.find((ref) => Number.isFinite(catalog.priceList.prices[ref]));
}

export function createCatalogModuleDefinitionFromPackage(
  modulePackage: FurnQuoteModulePackage,
  args?: { enabled?: boolean; packageHash?: string; catalog?: Pick<ClientCatalog, "priceList"> }
): ClientModuleDefinition {
  const geometry = modulePackage.geometry.mode === "trusted-runtime" ? modulePackage.geometry : null;
  const defaultWidth = numberDefault(modulePackage, "width") ?? numberDefault(modulePackage, "lengthX") ?? numberDefault(modulePackage, "lengthx");
  const defaultDepth = numberDefault(modulePackage, "depth") ?? numberDefault(modulePackage, "lengthZ") ?? numberDefault(modulePackage, "lengthz");
  return {
    id: modulePackage.module.modulePackageId,
    moduleType: modulePackage.module.moduleType,
    modulePackageId: modulePackage.module.modulePackageId,
    packageVersion: modulePackage.module.version,
    packageHash: args?.packageHash ?? modulePackage.integrity.packageHash,
    name: modulePackage.module.displayName,
    description: modulePackage.module.description,
    enabled: args?.enabled ?? true,
    category: modulePackage.module.category,
    runtimeBuilderKey: geometry?.runtimeBuilderKey,
    defaultWidth,
    defaultHeight: numberDefault(modulePackage, "height"),
    defaultDepth,
    pricingRef: firstPricingRef(modulePackage, args?.catalog),
    tags: modulePackage.module.tags
  };
}

export function getPackageDefaultValue(modulePackage: FurnQuoteModulePackage, key: string): unknown {
  return modulePackage.parameters.parameters.find((parameter) => parameter.key === key)?.defaultValue;
}
