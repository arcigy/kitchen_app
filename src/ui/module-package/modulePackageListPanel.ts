import type { ClientCatalog } from "../../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../../core/module-package/module-package-types";

export function listVisibleModulePackages(args: {
  catalog: Pick<ClientCatalog, "modules">;
  packages: readonly FurnQuoteModulePackage[];
}): FurnQuoteModulePackage[] {
  const enabledIds = new Set(
    args.catalog.modules
      .filter((module) => module.enabled)
      .map((module) => module.modulePackageId)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
  );
  return args.packages.filter((modulePackage) => enabledIds.has(modulePackage.module.modulePackageId));
}
