import type { ClientCatalog, ClientModuleDefinition } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage, ModuleParameterDefinition } from "../core/module-package/module-package-types";
import { createModulePackageDefaultParams } from "../core/module-package/runtime/module-runtime-adapter";
import type { ModuleParams } from "../model/cabinetTypes";

export type CompatibleModuleTypeOption = {
  value: string;
  label: string;
  modulePackage: FurnQuoteModulePackage;
  catalogModule: ClientModuleDefinition | null;
};

type ModuleCompatibilitySignature = {
  category: FurnQuoteModulePackage["module"]["category"];
  kitchenRole: string | null;
  isCorner: boolean;
};

const PACKAGE_OWNED_PARAMETER_KEYS = new Set([
  "type", "moduleType", "modulePackageId", "packageVersion", "packageHash", "typeId", "displayName",
  "family", "code", "catalogCode", "version", "assemblyContext", "roomCategory", "kitchenModuleRole",
  "isCorner", "frontFaceCount", "backFaceCount", "requiresWorktop", "hasWorktop", "hasPlinth",
  "frontSide", "backSide", "leftSide", "rightSide", "frontDirection", "backDirection", "leftDirection",
  "rightDirection", "worktopBackSide", "createdAt", "updatedAt", "tags", "ifcClass", "ifcPredefinedType",
  "ifcName", "ifcDescription", "ifcObjectType", "ifcTag", "classificationCode"
]);

function parameterDefault(modulePackage: FurnQuoteModulePackage, key: string): unknown {
  return modulePackage.parameters.parameters.find((parameter) => parameter.key === key)?.defaultValue;
}

function normalizeKitchenRole(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "base") return "low";
  if (normalized === "upper") return "top";
  return normalized;
}

function compatibilitySignature(modulePackage: FurnQuoteModulePackage): ModuleCompatibilitySignature {
  const cornerDefault = parameterDefault(modulePackage, "isCorner");
  return {
    category: modulePackage.module.category,
    kitchenRole: normalizeKitchenRole(parameterDefault(modulePackage, "kitchenModuleRole")),
    isCorner: typeof cornerDefault === "boolean"
      ? cornerDefault
      : modulePackage.placement.requiresCorner === true || modulePackage.module.category === "corner_cabinet"
  };
}

function isCompatiblePackage(currentPackage: FurnQuoteModulePackage, candidate: FurnQuoteModulePackage): boolean {
  const current = compatibilitySignature(currentPackage);
  const next = compatibilitySignature(candidate);
  return current.category === next.category && current.kitchenRole === next.kitchenRole && current.isCorner === next.isCorner;
}

function resolveCatalogPackage(
  definition: ClientModuleDefinition,
  modulePackages: readonly FurnQuoteModulePackage[]
): FurnQuoteModulePackage | null {
  if (definition.modulePackageId) {
    return modulePackages.find((candidate) => candidate.module.modulePackageId === definition.modulePackageId) ?? null;
  }
  const byType = modulePackages.filter((candidate) => candidate.module.moduleType === definition.moduleType);
  return byType.length === 1 ? byType[0] : null;
}

function catalogDefinitionForPackage(
  modulePackage: FurnQuoteModulePackage,
  modules: readonly ClientModuleDefinition[]
): ClientModuleDefinition | null {
  return modules.find((definition) => definition.modulePackageId === modulePackage.module.modulePackageId) ??
    modules.find((definition) => !definition.modulePackageId && definition.moduleType === modulePackage.module.moduleType) ??
    null;
}

export function listCompatibleModuleTypeOptions(args: {
  currentPackage: FurnQuoteModulePackage;
  modulePackages: readonly FurnQuoteModulePackage[];
  catalog: ClientCatalog;
}): CompatibleModuleTypeOption[] {
  const byPackageId = new Map<string, CompatibleModuleTypeOption>();
  const add = (modulePackage: FurnQuoteModulePackage, catalogModule: ClientModuleDefinition | null) => {
    const value = modulePackage.module.modulePackageId;
    if (byPackageId.has(value)) return;
    byPackageId.set(value, {
      value,
      label: catalogModule?.name?.trim() || modulePackage.module.displayName,
      modulePackage,
      catalogModule
    });
  };

  add(args.currentPackage, catalogDefinitionForPackage(args.currentPackage, args.catalog.modules ?? []));
  for (const definition of args.catalog.modules ?? []) {
    if (!definition.enabled) continue;
    const modulePackage = resolveCatalogPackage(definition, args.modulePackages);
    if (!modulePackage || !isCompatiblePackage(args.currentPackage, modulePackage)) continue;
    add(modulePackage, definition);
  }

  const options = Array.from(byPackageId.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "sk", { sensitivity: "base" }) || a.value.localeCompare(b.value)
  );
  const labelCounts = new Map<string, number>();
  for (const option of options) labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1);
  for (const option of options) {
    if ((labelCounts.get(option.label) ?? 0) > 1) option.label = `${option.label} — ${option.modulePackage.module.displayName}`;
  }
  return options;
}

function canTransferParameterValue(parameter: ModuleParameterDefinition, value: unknown): boolean {
  if (value == null) return parameter.required !== true;
  if (parameter.type === "number") {
    return typeof value === "number" && Number.isFinite(value) &&
      (parameter.min == null || value >= parameter.min) &&
      (parameter.max == null || value <= parameter.max);
  }
  if (parameter.type === "boolean") return typeof value === "boolean";
  if (parameter.type === "select") {
    if (typeof value !== "string") return false;
    return !parameter.options?.length || parameter.options.some((option) => option.value === value);
  }
  if (parameter.type === "material" || parameter.type === "component") return typeof value === "string";
  return true;
}

function mergeSupportedAssignments(targetValue: unknown, sourceValue: unknown): unknown {
  if (!targetValue || typeof targetValue !== "object" || Array.isArray(targetValue)) return targetValue;
  if (!sourceValue || typeof sourceValue !== "object" || Array.isArray(sourceValue)) return targetValue;
  const target = targetValue as Record<string, unknown>;
  const source = sourceValue as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = structuredClone(source[key]);
  }
  return target;
}

export function createReplacementModuleParams(args: {
  currentParams: ModuleParams;
  currentPackage: FurnQuoteModulePackage;
  targetPackage: FurnQuoteModulePackage;
  catalog: ClientCatalog;
}): ModuleParams {
  const sourceParams = args.currentParams as Record<string, unknown>;
  const next = createModulePackageDefaultParams({ modulePackage: args.targetPackage, catalog: args.catalog });
  const sourceDefinitions = new Map(args.currentPackage.parameters.parameters.map((parameter) => [parameter.key, parameter]));

  for (const targetParameter of args.targetPackage.parameters.parameters) {
    const sourceParameter = sourceDefinitions.get(targetParameter.key);
    if (!sourceParameter || sourceParameter.type !== targetParameter.type) continue;
    if (PACKAGE_OWNED_PARAMETER_KEYS.has(targetParameter.key)) continue;
    if (!Object.prototype.hasOwnProperty.call(sourceParams, targetParameter.key)) continue;
    const value = sourceParams[targetParameter.key];
    if (canTransferParameterValue(targetParameter, value)) next[targetParameter.key] = structuredClone(value);
  }

  next.materialAssignments = mergeSupportedAssignments(next.materialAssignments, sourceParams.materialAssignments);
  next.componentAssignments = mergeSupportedAssignments(next.componentAssignments, sourceParams.componentAssignments);
  if (args.currentPackage.module.moduleType === args.targetPackage.module.moduleType) {
    if (sourceParams.commercialSelections !== undefined) next.commercialSelections = structuredClone(sourceParams.commercialSelections);
    if (sourceParams.materials !== undefined) next.materials = structuredClone(sourceParams.materials);
  }

  return next as ModuleParams;
}
