import type { ClientModuleDefinition } from "../../core/catalog/catalog-types";
import { createCatalogModuleDefinitionFromPackage } from "../../core/module-package/module-package-catalog";
import { systemModulePackageTemplates } from "../module-packages";

export const systemModuleTemplates: ClientModuleDefinition[] = systemModulePackageTemplates.map((modulePackage) =>
  createCatalogModuleDefinitionFromPackage(modulePackage, { enabled: true })
);
