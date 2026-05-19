import type { ClientContext } from "../client/client-context";
import type { ClientCatalogRepository } from "../catalog/catalog-repository";
import type { ModulePackageRepository } from "./module-package-repository";
import { parseModulePackageImport, type ModulePackageImportInput } from "./module-package-import";
import { createCatalogModuleDefinitionFromPackage } from "./module-package-catalog";

export function createModulePackageService(args: {
  context: ClientContext;
  packageRepository: ModulePackageRepository;
  catalogRepository: ClientCatalogRepository;
  appVersion?: string;
}) {
  const importPackage = async (input: ModulePackageImportInput) => {
    const parsed = parseModulePackageImport(input, { appVersion: args.appVersion });
    const persisted = await args.packageRepository.savePackage(args.context, parsed.modulePackage, {
      source: parsed.source,
      originalModuleFile: parsed.originalModuleFile,
      payload: parsed.payload
    });
    const catalog = await args.catalogRepository.ensureCatalogExists(args.context);
    const catalogModule = createCatalogModuleDefinitionFromPackage(persisted, {
      catalog,
      enabled: parsed.enabled,
      packageHash: parsed.packageHash
    });
    const modules = catalog.modules.some((module) => module.modulePackageId === catalogModule.modulePackageId || module.moduleType === catalogModule.moduleType)
      ? catalog.modules.map((module) =>
          module.modulePackageId === catalogModule.modulePackageId || module.moduleType === catalogModule.moduleType
            ? { ...module, ...catalogModule }
            : module
        )
      : [...catalog.modules, catalogModule];
    await args.catalogRepository.saveCatalog(args.context, {
      ...catalog,
      modules,
      meta: {
        ...catalog.meta,
        source: "client-custom",
        updatedAt: new Date().toISOString()
      }
    });
    return { modulePackage: persisted, catalogModule };
  };

  return {
    importPackage,
    listPackages: () => args.packageRepository.listPackages(args.context),
    getPackage: (modulePackageId: string) => args.packageRepository.getPackage(args.context, modulePackageId)
  };
}
