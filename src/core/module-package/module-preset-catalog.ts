import type { ClientCatalog } from "../catalog/catalog-types";
import { createCatalogModuleDefinitionFromPackage } from "./module-package-catalog";
import { computeModulePackageHash } from "./module-package-file";
import type { FurnQuoteModulePackage } from "./module-package-types";

/** A preset changes configuration, not the company's commercial module data. */
export function presetCatalogReference(catalog: ClientCatalog, modulePackage: FurnQuoteModulePackage) {
  const matches = (module: ClientCatalog["modules"][number]) =>
    module.modulePackageId === modulePackage.module.modulePackageId ||
    (!module.modulePackageId && module.moduleType === modulePackage.module.moduleType);
  const previous = catalog.modules.find(matches);
  const packageHash = computeModulePackageHash(modulePackage);
  const catalogModule = previous ? { ...previous, packageHash } : createCatalogModuleDefinitionFromPackage(modulePackage, { catalog, packageHash });
  return {
    catalogModule,
    modules: previous ? catalog.modules.map(module => matches(module) ? { ...module, packageHash } : module) : [...catalog.modules, catalogModule],
    changed: !previous || catalog.modules.some(module => matches(module) && module.packageHash !== packageHash)
  };
}
