import { validateLaborRate, type LaborRate } from "../project-manufacturing/module-labor";
import { ModulePackageRevisionConflictError } from "./module-package-write-lock";
import type { ClientContext } from "../client/client-context";
import type { ClientCatalogRepository } from "../catalog/catalog-repository";
import type { ModulePackageRepository } from "./module-package-repository";
import { parseModulePackageImport, type ModulePackageImportInput } from "./module-package-import";
import { createCatalogModuleDefinitionFromPackage } from "./module-package-catalog";
import { computeModulePackageHash } from "./module-package-file";
import type { FurnQuoteModulePackage, ModuleParameterPreset } from "./module-package-types";
import { preserveModuleParameterPresets } from "./module-preset-retention";
import { createModulePresetWriteOperation, isSameModulePresetOperation } from "./module-preset-operation";

const DEFAULT_PRESET_FREE_PARAMETER_KEYS = [
  // Catalog identity belongs to the target cabinet, not to its reusable configuration.
  "code",
  "width",
  "height",
  "depth",
  "widthMm",
  "heightMm",
  "depthMm",
  "heightCarcass",
  "depthCarcass",
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
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
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
  const definitions = new Map(args.modulePackage.parameters.parameters.map(parameter => [parameter.key, parameter]));
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
    if (value === undefined) continue;
    if (!isJsonLikeValue(value)) throw new Error(`Invalid preset parameter: ${key}`);
    const definition = definitions.get(key)!;
    if (value === null && definition.defaultValue === null) { parameterValues[key] = null; continue; }
    // Inactive drawer/front fields legitimately hold zero outside their UI
    // slider range. The module owner validates active geometry when applied.
    if (definition.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`Invalid numeric preset parameter: ${key}`);
    }
    if (definition.type === "boolean" && typeof value !== "boolean") throw new Error(`Invalid boolean preset parameter: ${key}`);
    // Legacy "string" fields also hold JSON metadata such as validationErrors,
    // tags and price overrides. Keep their existing JSON contract.
    if (["select", "component"].includes(definition.type) && typeof value !== "string") throw new Error(`Invalid text preset parameter: ${key}`);
    if (definition.type === "select" && definition.options?.length && !definition.options.some(option => option.value === value)) throw new Error(`Invalid preset option: ${key}`);
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
    if (args.context.role === "viewer") throw new Error("Viewer role cannot import module packages.");
    const parsed = parseModulePackageImport(input, { appVersion: args.appVersion });
    const current = await args.packageRepository.getPackage(args.context, parsed.modulePackage.module.modulePackageId);
    const modulePackage = current ? preserveModuleParameterPresets(current, parsed.modulePackage) : parsed.modulePackage;
    const persisted = await args.packageRepository.savePackage(args.context, modulePackage, {
      source: parsed.source,
      payload: { ...parsed.payload, modulePackage },
      ...(current ? { expectedPackageHash: computeModulePackageHash(current) } : { expectedPackageHash: null })
    });
    const catalog = await args.catalogRepository.ensureCatalogExists(args.context);
    const catalogModules = catalog.modules.map(normalizeCatalogModuleIdentity);
    const catalogModule = createCatalogModuleDefinitionFromPackage(persisted, {
      catalog,
      enabled: parsed.enabled,
      packageHash: computeModulePackageHash(persisted)
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

  async function updateCatalog(persisted: FurnQuoteModulePackage) {
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
    return catalogModule;
  }

  const updatePresetLabor = async (input: { modulePackageId: string; presetId: string; expectedPackageHash: string; laborRate: LaborRate | null; operationId?: string }) => {
    if (args.context.role === "viewer") throw new Error("Viewer role cannot edit presets.");
    if (!input.expectedPackageHash?.trim()) throw new Error("Preset revision is required.");
    if (input.laborRate !== null) validateLaborRate(input.laborRate);
    const current = await args.packageRepository.getPackage(args.context, input.modulePackageId);
    if (!current) throw new Error("Module package not found.");
    const operation = createModulePresetWriteOperation(input.operationId, args.context.userId, { presetId: input.presetId, laborRate: input.laborRate });
    const savedPreset = current.parameterPresets?.presets.find(item => item.presetId === input.presetId);
    if (isSameModulePresetOperation(savedPreset?.laborOperation, operation)) {
      const catalogModule = await updateCatalog(current);
      return { modulePackage: current, preset: savedPreset!, catalogModule };
    }
    if (computeModulePackageHash(current) !== input.expectedPackageHash) throw new ModulePackageRevisionConflictError();
    const next = structuredClone(current);
    const preset = next.parameterPresets?.presets.find(item => item.presetId === input.presetId);
    if (!preset) throw new Error("Preset not found.");
    preset.laborRate = input.laborRate ? structuredClone(input.laborRate) : null;
    if (operation) preset.laborOperation = operation;
    else delete preset.laborOperation;
    next.integrity = { ...next.integrity, updatedAt: new Date().toISOString(), packageHash: undefined };
    let persisted: FurnQuoteModulePackage;
    try { persisted = await args.packageRepository.savePackage(args.context, next, { source: "dev-json", expectedPackageHash: input.expectedPackageHash }); }
    catch (error) {
      if (!(error instanceof ModulePackageRevisionConflictError) || !operation) throw error;
      const latest = await args.packageRepository.getPackage(args.context, input.modulePackageId);
      const saved = latest?.parameterPresets?.presets.find(item => item.presetId === input.presetId);
      if (!latest || !saved || !isSameModulePresetOperation(saved.laborOperation, operation)) throw error;
      return { modulePackage: latest, preset: saved, catalogModule: await updateCatalog(latest) };
    }
    const catalogModule = await updateCatalog(persisted);
    return { modulePackage: persisted, preset, catalogModule };
  };

  const createParameterPreset = async (input: {
    modulePackageId: string;
    name: string;
    note: string;
    parameters: Record<string, unknown>;
    laborRate?: LaborRate | null;
    expectedPackageHash?: string;
    operationId?: string;
  }) => {
    if (args.context.role === "viewer") throw new Error("Viewer role cannot create presets.");
    if (input.laborRate != null) validateLaborRate(input.laborRate);
    const name = input.name.trim();
    const note = input.note.trim();
    if (!name) throw new Error("Preset name is required.");
    if (!note) throw new Error("Preset note is required.");
    const operation = createModulePresetWriteOperation(input.operationId, args.context.userId, { name, note, parameters: input.parameters, laborRate: input.laborRate ?? null });
    const current = await args.packageRepository.getPackage(args.context, input.modulePackageId);
    if (!current) throw new Error("Module package not found.");
    const replay = current.parameterPresets?.presets.find(item => isSameModulePresetOperation(item.creationOperation, operation));
    if (replay) return { modulePackage: current, preset: replay, catalogModule: await updateCatalog(current) };
    const { freeParameterKeys, preset } = buildParameterPreset({
      modulePackage: current,
      parameters: input.parameters,
      name,
      note
    });
    if (input.expectedPackageHash && computeModulePackageHash(current) !== input.expectedPackageHash) throw new ModulePackageRevisionConflictError();
    if (input.laborRate !== undefined) preset.laborRate = input.laborRate ? structuredClone(input.laborRate) : null;
    if (operation) preset.creationOperation = operation;
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
    let persisted: FurnQuoteModulePackage;
    try {
      persisted = await args.packageRepository.savePackage(args.context, nextPackage, { source: "dev-json", expectedPackageHash: computeModulePackageHash(current) });
    } catch (error) {
      // Two deliveries of the same operation may race. The losing writer must
      // confirm the receipt, never create a suffixed duplicate.
      if (!(error instanceof ModulePackageRevisionConflictError) || !operation) throw error;
      const latest = await args.packageRepository.getPackage(args.context, input.modulePackageId);
      const saved = latest?.parameterPresets?.presets.find(item => isSameModulePresetOperation(item.creationOperation, operation));
      if (!latest || !saved) throw error;
      return { modulePackage: latest, preset: saved, catalogModule: await updateCatalog(latest) };
    }
    const catalogModule = await updateCatalog(persisted);
    return { modulePackage: persisted, preset, catalogModule };
  };

  return {
    importPackage,
    createParameterPreset,
    updatePresetLabor,
    listPackages: () => args.packageRepository.listPackages(args.context),
    getPackage: (modulePackageId: string) => args.packageRepository.getPackage(args.context, modulePackageId)
  };
}
