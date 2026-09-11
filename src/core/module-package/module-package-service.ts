import type { ClientContext } from "../client/client-context";
import type { ClientCatalogRepository } from "../catalog/catalog-repository";
import type { ModulePackageRepository } from "./module-package-repository";
import { parseModulePackageImport, type ModulePackageImportInput } from "./module-package-import";
import { createCatalogModuleDefinitionFromPackage } from "./module-package-catalog";
import { prepareModuleParameterPreset, type CreateModuleParameterPresetInput } from "./module-parameter-presets";

function matchesCatalogPackage(module: { modulePackageId?: string; moduleType: string }, catalogModule: { modulePackageId?: string; moduleType: string }): boolean {
  if (catalogModule.modulePackageId) {
    return module.modulePackageId === catalogModule.modulePackageId;
  }
  return !module.modulePackageId && module.moduleType === catalogModule.moduleType;
}

function normalizeCatalogModuleIdentity<T extends { id: string; modulePackageId?: string }>(module: T): T {
  if (!module.modulePackageId || module.id === module.modulePackageId) return module;
  return { ...module, id: module.modulePackageId };
}

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
    const catalogModules = catalog.modules.map(normalizeCatalogModuleIdentity);
    const catalogModule = createCatalogModuleDefinitionFromPackage(persisted, {
      catalog,
      enabled: parsed.enabled,
      packageHash: parsed.packageHash
    });
    const modules = catalogModules.some((module) => matchesCatalogPackage(module, catalogModule))
      ? catalogModules.map((module) =>
          matchesCatalogPackage(module, catalogModule)
            ? { ...module, ...catalogModule }
            : module
        )
      : [...catalogModules, catalogModule];
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

  const createParameterPreset = async (input: CreateModuleParameterPresetInput) => {
    if (args.packageRepository.createParameterPreset) {
      return args.packageRepository.createParameterPreset(args.context, input);
    }
    // File repositories are isolated local fixtures; production uses the atomic database capability.
    const current = await args.packageRepository.getPackage(args.context, input.modulePackageId);
    if (!current) throw new Error("Module package not found.");
    const catalog = await args.catalogRepository.ensureCatalogExists(args.context);
    const prepared = prepareModuleParameterPreset(current, catalog, input);
    const persisted = await args.packageRepository.savePackage(args.context, prepared.modulePackage, {source: "dev-json"});
    await args.catalogRepository.saveCatalog(args.context, prepared.catalog);
    return {modulePackage: persisted, preset: prepared.preset, catalogModule: prepared.catalogModule};
  };

  return {
    importPackage,
    createParameterPreset,
    listPackages: () => args.packageRepository.listPackages(args.context),
    getPackage: (modulePackageId: string) => args.packageRepository.getPackage(args.context, modulePackageId)
  };
}
