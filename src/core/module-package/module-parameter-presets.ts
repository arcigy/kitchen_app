import type { ClientCatalog, ClientModuleDefinition } from "../catalog/catalog-types";
import type { FurnQuoteModulePackage, ModuleParameterPreset } from "./module-package-types";
import { withModulePackageHash } from "./module-package-file";
import { validateFurnQuoteModulePackage } from "./module-package-validation";
import { validateClientCatalog } from "../catalog/catalog-validation";

export type CreateModuleParameterPresetInput = { modulePackageId: string; name: string; note: string; parameters: Record<string, unknown> };
export type CreateModuleParameterPresetResult = { modulePackage: FurnQuoteModulePackage; preset: ModuleParameterPreset; catalogModule: ClientModuleDefinition };

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

/** Build and validate both persisted values before any repository writes. */
export function prepareModuleParameterPreset(current: FurnQuoteModulePackage, catalog: ClientCatalog, input: CreateModuleParameterPresetInput, now = new Date().toISOString()) {
  const name = input.name.trim(), note = input.note.trim();
  if (!name) throw new Error("Preset name is required.");
  if (!note) throw new Error("Preset note is required.");
  if (current.module.modulePackageId !== input.modulePackageId) throw new Error("Module package identity mismatch.");
  const references = catalog.modules.filter(item => (item.modulePackageId ?? item.id) === input.modulePackageId);
  if (references.length !== 1) throw new Error("Module package must have one unambiguous catalog assignment.");
  const {freeParameterKeys, preset} = buildParameterPreset({modulePackage: current, parameters: input.parameters, name, note});
  const modulePackage = withModulePackageHash(validateFurnQuoteModulePackage({
    ...current,
    parameterPresets: {freeParameterKeys, presets: [...(current.parameterPresets?.presets ?? []), preset]},
    integrity: {...current.integrity, updatedAt: now, packageHash: undefined}
  }));
  // A preset changes only its package hash, never customer identities, labels, placement or prices.
  const catalogModule = {...references[0]!, packageHash: modulePackage.integrity.packageHash};
  const nextCatalog = validateClientCatalog({
    ...catalog,
    modules: catalog.modules.map(item => item === references[0] ? catalogModule : item),
    meta: {...catalog.meta, updatedAt: now}
  });
  return {modulePackage, preset, catalogModule, catalog: nextCatalog};
}
