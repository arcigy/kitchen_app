import type { ClientCatalog } from "../catalog/catalog-types";
import { createCatalogModuleDefinitionFromPackage } from "./module-package-catalog";
import { computeModulePackageHash } from "./module-package-file";
import type { FurnQuoteModulePackage } from "./module-package-types";

/** A preset changes configuration, not the company's commercial module data. */
export function presetCatalogReference(catalog: ClientCatalog, modulePackage: FurnQuoteModulePackage) {
  const index = catalog.modules.findIndex(module => {
    return module.modulePackageId === modulePackage.module.modulePackageId ||
      (!module.modulePackageId && module.moduleType === modulePackage.module.moduleType);
  });
  const previous = catalog.modules[index];
  const packageHash = computeModulePackageHash(modulePackage);
  const catalogModule = previous ? { ...previous, packageHash } : createCatalogModuleDefinitionFromPackage(modulePackage, { catalog, packageHash });
  return { catalogModule, modules: previous ? catalog.modules.map((module, position) => position === index ? catalogModule : module) : [...catalog.modules, catalogModule], changed: !previous || previous.packageHash !== packageHash };
}
