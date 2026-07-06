import type { FurnQuoteModulePackage, ModuleParameterDefinition } from "../module-package/module-package-types";

const PRESERVED_PARAMETER_DEFAULTS = new Set([
  "variant",
  "cornerShape",
  "side",
  "doorCount",
  "drawerCount",
  "openingMode",
  "shelfCount",
  "drawerSystemBrand"
]);

function runtimeBuilderKey(modulePackage: FurnQuoteModulePackage): string | null {
  return modulePackage.geometry.mode === "trusted-runtime" ? modulePackage.geometry.runtimeBuilderKey : null;
}

function findRefreshSource(
  existingPackage: FurnQuoteModulePackage,
  sourcePackages: readonly FurnQuoteModulePackage[]
): FurnQuoteModulePackage | null {
  const sameType = sourcePackages.filter((source) => source.module.moduleType === existingPackage.module.moduleType);
  if (sameType.length === 0) return null;
  const existingBuilderKey = runtimeBuilderKey(existingPackage);
  if (existingBuilderKey) {
    const sameBuilder = sameType.find((source) => runtimeBuilderKey(source) === existingBuilderKey);
    if (sameBuilder) return sameBuilder;
  }
  return sameType.length === 1 ? sameType[0] : null;
}

function defaultValueMap(modulePackage: FurnQuoteModulePackage): Map<string, unknown> {
  return new Map(modulePackage.parameters.parameters.map((parameter) => [parameter.key, parameter.defaultValue]));
}

function refreshParameterDefaults(
  sourceParameters: readonly ModuleParameterDefinition[],
  existingPackage: FurnQuoteModulePackage
): ModuleParameterDefinition[] {
  const existingDefaults = defaultValueMap(existingPackage);
  return sourceParameters.map((parameter) => {
    if (!PRESERVED_PARAMETER_DEFAULTS.has(parameter.key) || !existingDefaults.has(parameter.key)) {
      return { ...parameter };
    }
    return {
      ...parameter,
      defaultValue: existingDefaults.get(parameter.key)
    };
  });
}

export function refreshClientModulePackageFromSystemTemplate(args: {
  existingPackage: FurnQuoteModulePackage;
  sourcePackages: readonly FurnQuoteModulePackage[];
}): FurnQuoteModulePackage | null {
  const source = findRefreshSource(args.existingPackage, args.sourcePackages);
  if (!source) return null;

  const refreshed: FurnQuoteModulePackage = structuredClone(source);
  refreshed.module = {
    ...source.module,
    modulePackageId: args.existingPackage.module.modulePackageId,
    displayName: args.existingPackage.module.displayName,
    category: args.existingPackage.module.category,
    familyName: args.existingPackage.module.familyName,
    tags: args.existingPackage.module.tags,
    isSystemModule: args.existingPackage.module.isSystemModule
  };
  refreshed.parameters = {
    ...source.parameters,
    parameters: refreshParameterDefaults(source.parameters.parameters, args.existingPackage)
  };

  return refreshed;
}

export function refreshClientModulePackagesFromSystemTemplates(args: {
  existingPackages: readonly FurnQuoteModulePackage[];
  sourcePackages: readonly FurnQuoteModulePackage[];
  moduleIds: readonly string[];
}): FurnQuoteModulePackage[] {
  const requested = new Set(args.moduleIds.map((moduleId) => moduleId.trim().toLowerCase()).filter(Boolean));
  if (requested.size === 0 || requested.has("all")) return [];

  const refreshed: FurnQuoteModulePackage[] = [];
  for (const existingPackage of args.existingPackages) {
    const packageId = existingPackage.module.modulePackageId.toLowerCase();
    const moduleType = existingPackage.module.moduleType.toLowerCase();
    if (!requested.has(packageId) && !requested.has(moduleType)) continue;
    const nextPackage = refreshClientModulePackageFromSystemTemplate({
      existingPackage,
      sourcePackages: args.sourcePackages
    });
    if (nextPackage) refreshed.push(nextPackage);
  }
  return refreshed;
}
