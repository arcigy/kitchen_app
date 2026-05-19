import type { ClientCatalog, ClientModuleDefinition } from "./catalog-types";
import type { ModuleDescriptor } from "../../modules/registry";
import type { FurnQuoteModulePackage } from "../module-package/module-package-types";

export function getEnabledClientModules(catalog: Pick<ClientCatalog, "modules">): ClientModuleDefinition[] {
  return catalog.modules.filter((module) => module.enabled);
}

export function getEnabledModuleDescriptors(
  catalog: Pick<ClientCatalog, "modules">,
  runtimeRegistry: readonly ModuleDescriptor[]
): readonly ModuleDescriptor[] {
  const enabledTypes = new Set(getEnabledClientModules(catalog).map((module) => module.moduleType));
  return runtimeRegistry.filter((descriptor) => enabledTypes.has(descriptor.type));
}

export function getEnabledModulePackageDefinitions(
  catalog: Pick<ClientCatalog, "modules">,
  packages: readonly FurnQuoteModulePackage[]
): readonly FurnQuoteModulePackage[] {
  const enabledPackageIds = new Set(
    getEnabledClientModules(catalog)
      .map((module) => module.modulePackageId)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
  );
  return packages.filter((modulePackage) => enabledPackageIds.has(modulePackage.module.modulePackageId));
}
