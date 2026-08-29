import type { ClientContext } from "../client/client-context";
import type { ClientCatalogRepository } from "../catalog/catalog-repository";
import type { ModulePackageRepository } from "./module-package-repository";
import { parseModulePackageImport, type ModulePackageImportInput } from "./module-package-import";
import { createCatalogModuleDefinitionFromPackage } from "./module-package-catalog";
import { computeModulePackageHash } from "./module-package-file";
import type { FurnQuoteModulePackage, ModuleParameterPreset } from "./module-package-types";

const DEFAULT_PRESET_FREE_PARAMETER_KEYS = [
  "width",
  "height",
  "depth",
  "widthMm",
  "heightMm",
  "depthMm",
  "plinthHeight",
  "plinthHeightMm",
  "materialId",
  "bodyMaterialId",
  "frontMaterialId",
  "backMaterialId",
  "drawerBottomMaterialId",
  "worktopMaterialId",
  "materialAssignments",
  "commercialSelections"
];

function presetIdFromName(name: string, existingIds: Set<string>) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "preset";
  let candidate = base;
  let index = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

function isJsonLikeValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonLikeValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isJsonLikeValue);
  return false;
}

function buildParameterPreset(args: {
  modulePackage: FurnQuoteModulePackage;
  parameters: Record<string, unknown>;
  name: string;
  note: string;
}): { freeParameterKeys: string[]; preset: ModuleParameterPreset } {
  const parameterKeys = new Set(args.modulePackage.parameters.parameters.map((parameter) => parameter.key));
  const allowedFreeKeys = new Set([...parameterKeys, "materialAssignments", "commercialSelections"]);
  const materialParameterKeys = args.modulePackage.parameters.parameters
    .filter((parameter) => parameter.type === "material")
    .map((parameter) => parameter.key);
  const existingFreeKeys = args.modulePackage.parameterPresets?.freeParameterKeys ?? [];
  const freeParameterKeys = [...new Set([...existingFreeKeys, ...DEFAULT_PRESET_FREE_PARAMETER_KEYS, ...materialParameterKeys])]
    .filter((key) => allowedFreeKeys.has(key));
  const freeKeys = new Set(freeParameterKeys);
  const parameterValues: Record<string, unknown> = {};
  for (const key of parameterKeys) {
    if (freeKeys.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(args.parameters, key)) continue;
    const value = args.parameters[key];
    if (value === undefined || !isJsonLikeValue(value)) continue;
    parameterValues[key] = structuredClone(value);
  }
  const presetId = presetIdFromName(
    args.name,
    new Set((args.modulePackage.parameterPresets?.presets ?? []).map((preset) => preset.presetId))
  );
  return {
    freeParameterKeys,
    preset: {
      presetId,
      label: args.name.trim(),
      note: args.note.trim(),
      parameterValues
    }
  };
}

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

  const createParameterPreset = async (input: {
    modulePackageId: string;
    name: string;
    note: string;
    parameters: Record<string, unknown>;
  }) => {
    const name = input.name.trim();
    const note = input.note.trim();
    if (!name) throw new Error("Preset name is required.");
    if (!note) throw new Error("Preset note is required.");
    const current = await args.packageRepository.getPackage(args.context, input.modulePackageId);
    if (!current) throw new Error("Module package not found.");
    const { freeParameterKeys, preset } = buildParameterPreset({
      modulePackage: current,
      parameters: input.parameters,
      name,
      note
    });
    const nextPackage: FurnQuoteModulePackage = {
      ...current,
      parameterPresets: {
        freeParameterKeys,
        presets: [...(current.parameterPresets?.presets ?? []), preset]
      },
      integrity: {
        ...current.integrity,
        updatedAt: new Date().toISOString(),
        packageHash: undefined
      }
    };
    const persisted = await args.packageRepository.savePackage(args.context, nextPackage, { source: "dev-json" });
    const catalog = await args.catalogRepository.ensureCatalogExists(args.context);
    const catalogModules = catalog.modules.map(normalizeCatalogModuleIdentity);
    const packageHash = computeModulePackageHash(persisted);
    const persistedCatalogKey = {
      modulePackageId: persisted.module.modulePackageId,
      moduleType: persisted.module.moduleType
    };
    const existingCatalogModule = catalogModules.find((module) => matchesCatalogPackage(module, persistedCatalogKey));
    const catalogModule = createCatalogModuleDefinitionFromPackage(persisted, {
      catalog,
      enabled: existingCatalogModule?.enabled ?? true,
      packageHash
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
    return { modulePackage: persisted, preset, catalogModule };
  };

  return {
    importPackage,
    createParameterPreset,
    listPackages: () => args.packageRepository.listPackages(args.context),
    getPackage: (modulePackageId: string) => args.packageRepository.getPackage(args.context, modulePackageId)
  };
}
