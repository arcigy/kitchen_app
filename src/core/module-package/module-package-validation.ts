import type { ClientCatalog } from "../catalog/catalog-types";
import { sanitizeStorageFileName, sanitizeStorageId } from "../storage/storage-types";
import { hasTrustedRuntimeBuilder } from "./runtime/module-runtime-adapter";
import {
  CURRENT_MODULE_PACKAGE_VERSION,
  MODULE_PACKAGE_FORMAT,
  type FurnQuoteModulePackage,
  type ModuleComponentSlot,
  type ModuleContextBindingTransform,
  type ModuleContextType,
  type ModuleInstance,
  type ModulePlacementContext
} from "./module-package-types";
import { compareAppVersions, isSupportedModulePackageVersion } from "./module-package-versioning";
import { computeModulePackageHash } from "./module-package-file";

export class ModulePackageValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid FurnQuote module package: ${errors.join("; ")}`);
  }
}

export type ModulePackageValidationOptions = {
  appVersion?: string;
  catalog?: ClientCatalog;
};

const VALID_PLACEMENT_CONTEXTS = new Set<ModulePlacementContext>([
  "kitchen_wall",
  "kitchen_corner",
  "floor",
  "wall_mounted",
  "free_standing",
  "inside_wardrobe",
  "above_countertop",
  "under_sink",
  "appliance_zone",
  "custom"
]);

const VALID_COMPONENT_SLOT_TYPES = new Set<ModuleComponentSlot["componentType"]>([
  "handle",
  "hinge",
  "runner",
  "leg",
  "plinth_clip",
  "rail",
  "led",
  "other"
]);

const VALID_CONTEXT_TYPES = new Set<ModuleContextType>(["kitchenGroup", "wardrobeGroup", "room", "custom"]);
const VALID_CONTEXT_TRANSFORMS = new Set<ModuleContextBindingTransform>([
  "identity",
  "materialDefaultThickness",
  "resolvedWorktopThickness",
  "handleGeometryKind",
  "componentNominalLength"
]);
const VALID_CONTEXT_MATERIAL_FAMILIES = new Set(["body", "front", "back", "drawer_box", "drawer_bottom", "worktop", "shelf"]);
const SAFE_CONTEXT_SOURCE = /^(ctx|catalog|constant)\.[A-Za-z0-9_.-]+$/;
const ARBITRARY_CODE_KEYS = new Set(["code", "script", "sourceCode", "js", "ts", "eval", "dynamicImport", "modulePath"]);
const SAFE_ASSET_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/json"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function scanForArbitraryCodeFields(value: unknown, errors: string[], path = "package"): void {
  if (!isRecord(value)) {
    if (Array.isArray(value)) value.forEach((entry, index) => scanForArbitraryCodeFields(entry, errors, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (ARBITRARY_CODE_KEYS.has(key)) errors.push(`${path}.${key} is not allowed in .fqm packages`);
    scanForArbitraryCodeFields(child, errors, `${path}.${key}`);
  }
}

function assertSafePackageId(value: string, errors: string[]): void {
  try {
    sanitizeStorageId(value, "modulePackageId");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

function assertSafeAssetFileName(fileName: string, errors: string[]): void {
  try {
    const sanitized = sanitizeStorageFileName(fileName);
    if (sanitized !== fileName) errors.push(`asset filename must already be storage-safe: ${fileName}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

function validateCompatibility(modulePackage: FurnQuoteModulePackage, options: ModulePackageValidationOptions, errors: string[]) {
  const compatibility = modulePackage.compatibility ?? {};
  const appVersion = options.appVersion ?? "0.0.0";
  if (compatibility.minAppVersion && compareAppVersions(appVersion, compatibility.minAppVersion) < 0) {
    errors.push(`package requires minAppVersion ${compatibility.minAppVersion}`);
  }
  if (compatibility.maxAppVersion && compareAppVersions(appVersion, compatibility.maxAppVersion) > 0) {
    errors.push(`package exceeds maxAppVersion ${compatibility.maxAppVersion}`);
  }
  for (const key of compatibility.requiredRuntimeBuilderKeys ?? []) {
    if (!hasTrustedRuntimeBuilder(key)) errors.push(`required runtime builder does not exist: ${key}`);
  }
}

function validateParameters(modulePackage: FurnQuoteModulePackage, errors: string[]) {
  const parameters = modulePackage.parameters?.parameters;
  if (!Array.isArray(parameters)) {
    errors.push("parameters.parameters must be an array");
    return;
  }
  for (const duplicate of findDuplicates(parameters.map((parameter) => parameter.key))) {
    errors.push(`duplicate parameter key: ${duplicate}`);
  }
  for (const parameter of parameters) {
    if (!parameter.key.trim()) errors.push("parameter key is required");
    if (!parameter.label.trim()) errors.push(`parameter ${parameter.key || "(missing)"} label is required`);
    if (parameter.required && !hasOwn(parameter, "defaultValue")) errors.push(`required parameter ${parameter.key} must define defaultValue`);
    if (parameter.type === "number") {
      if (typeof parameter.min === "number" && typeof parameter.max === "number" && parameter.min > parameter.max) {
        errors.push(`number parameter ${parameter.key} has min greater than max`);
      }
      if (hasOwn(parameter, "defaultValue") && typeof parameter.defaultValue === "number") {
        if (typeof parameter.min === "number" && parameter.defaultValue < parameter.min) errors.push(`defaultValue for ${parameter.key} is below min`);
        if (typeof parameter.max === "number" && parameter.defaultValue > parameter.max) errors.push(`defaultValue for ${parameter.key} is above max`);
      }
    }
    if (parameter.type === "select" && (!Array.isArray(parameter.options) || parameter.options.length === 0)) {
      errors.push(`select parameter ${parameter.key} must define options`);
    }
  }
}

function validatePlacement(modulePackage: FurnQuoteModulePackage, errors: string[]) {
  const allowedContexts = modulePackage.placement?.allowedContexts;
  if (!Array.isArray(allowedContexts) || allowedContexts.length === 0) {
    errors.push("placement.allowedContexts must not be empty");
    return;
  }
  for (const context of allowedContexts) {
    if (!VALID_PLACEMENT_CONTEXTS.has(context)) errors.push(`invalid placement context: ${context}`);
  }
  for (const context of modulePackage.placement.forbiddenContexts ?? []) {
    if (!VALID_PLACEMENT_CONTEXTS.has(context)) errors.push(`invalid forbidden placement context: ${context}`);
  }
  const corner = modulePackage.placement.corner;
  if ((modulePackage.placement.requiresCorner || corner?.required) && !allowedContexts.includes("kitchen_corner")) {
    errors.push("corner-required modules must allow kitchen_corner context");
  }
  if (corner?.allowedAngles?.some((angle) => !Number.isFinite(angle) || angle <= 0 || angle > 180)) {
    errors.push("corner.allowedAngles must contain angles between 0 and 180");
  }
}

function validateSlots(modulePackage: FurnQuoteModulePackage, errors: string[]) {
  const materialSlots = modulePackage.materials?.slots ?? [];
  const componentSlots = modulePackage.components?.slots ?? [];
  for (const duplicate of findDuplicates(materialSlots.map((slot) => slot.slotId))) errors.push(`duplicate material slotId: ${duplicate}`);
  for (const duplicate of findDuplicates(componentSlots.map((slot) => slot.slotId))) errors.push(`duplicate component slotId: ${duplicate}`);
  for (const slot of componentSlots) {
    if (!VALID_COMPONENT_SLOT_TYPES.has(slot.componentType)) errors.push(`invalid componentType: ${slot.componentType}`);
  }
}

function validateGeometry(modulePackage: FurnQuoteModulePackage, errors: string[]) {
  const geometry = modulePackage.geometry;
  if (!geometry || (geometry.mode !== "trusted-runtime" && geometry.mode !== "declarative")) {
    errors.push("geometry.mode must be trusted-runtime or declarative");
    return;
  }
  if (geometry.mode === "trusted-runtime" && !hasTrustedRuntimeBuilder(geometry.runtimeBuilderKey)) {
    errors.push(`trusted runtime builder does not exist: ${geometry.runtimeBuilderKey}`);
  }
  if (geometry.mode === "declarative" && !Array.isArray(geometry.primitives)) {
    errors.push("declarative geometry must define primitives");
  }
}

function validateAssets(modulePackage: FurnQuoteModulePackage, errors: string[]) {
  const assets = modulePackage.assets?.files ?? [];
  for (const asset of assets) {
    if (!asset.assetId?.trim()) errors.push("assetId is required");
    assertSafeAssetFileName(asset.fileName, errors);
    if (asset.mimeType && !SAFE_ASSET_MIME.has(asset.mimeType)) errors.push(`unsupported asset MIME type: ${asset.mimeType}`);
    if (asset.sizeBytes !== undefined && (!Number.isFinite(asset.sizeBytes) || asset.sizeBytes < 0)) {
      errors.push(`invalid asset size for ${asset.fileName}`);
    }
  }
}

function validateBehavior(modulePackage: FurnQuoteModulePackage, errors: string[]) {
  const behavior = modulePackage.behavior;
  if (!behavior) return;
  const bindings = behavior.contextBindings ?? [];
  if (!Array.isArray(bindings)) {
    errors.push("behavior.contextBindings must be an array");
    return;
  }
  const parameterKeys = new Set(modulePackage.parameters.parameters.map((parameter) => parameter.key));
  const materialSlotIds = new Set(modulePackage.materials.slots.map((slot) => slot.slotId));
  const componentSlotIds = new Set(modulePackage.components.slots.map((slot) => slot.slotId));
  for (const binding of bindings) {
    if (!VALID_CONTEXT_TYPES.has(binding.contextType)) errors.push(`invalid behavior contextType: ${binding.contextType}`);
    if (binding.scope && !["single", "multiple", "optional"].includes(binding.scope)) errors.push(`invalid context binding scope: ${binding.scope}`);
    if (binding.autoAssign && !["activeContext", "activeKitchenGroup", "none"].includes(binding.autoAssign)) {
      errors.push(`invalid context binding autoAssign: ${binding.autoAssign}`);
    }
    const validateSource = (source: string, path: string) => {
      if (!SAFE_CONTEXT_SOURCE.test(source)) errors.push(`${path} source must be a safe declarative path`);
    };
    for (const rule of binding.parameterSync ?? []) {
      if (!parameterKeys.has(rule.targetParameter)) errors.push(`parameterSync target does not exist: ${rule.targetParameter}`);
      validateSource(rule.source, `parameterSync.${rule.targetParameter}`);
      if (rule.transform && !VALID_CONTEXT_TRANSFORMS.has(rule.transform)) errors.push(`invalid parameterSync transform: ${rule.transform}`);
      if (rule.mode && !["live", "defaultOnly"].includes(rule.mode)) errors.push(`invalid parameterSync mode: ${rule.mode}`);
    }
    for (const rule of binding.materialSync ?? []) {
      if (rule.targetSlot && !materialSlotIds.has(rule.targetSlot)) errors.push(`materialSync targetSlot does not exist: ${rule.targetSlot}`);
      if (rule.targetParameter && !parameterKeys.has(rule.targetParameter)) errors.push(`materialSync targetParameter does not exist: ${rule.targetParameter}`);
      if (rule.thicknessParameter && !parameterKeys.has(rule.thicknessParameter)) errors.push(`materialSync thicknessParameter does not exist: ${rule.thicknessParameter}`);
      if (!VALID_CONTEXT_MATERIAL_FAMILIES.has(rule.family)) errors.push(`invalid materialSync family: ${rule.family}`);
      validateSource(rule.source, `materialSync.${rule.targetSlot ?? rule.targetParameter ?? "rule"}`);
    }
    for (const rule of binding.componentSync ?? []) {
      if (rule.targetSlot && !componentSlotIds.has(rule.targetSlot)) errors.push(`componentSync targetSlot does not exist: ${rule.targetSlot}`);
      if (!parameterKeys.has(rule.targetParameter)) errors.push(`componentSync targetParameter does not exist: ${rule.targetParameter}`);
      validateSource(rule.source, `componentSync.${rule.targetParameter}`);
      for (const transform of rule.transforms ?? []) {
        if (!VALID_CONTEXT_TRANSFORMS.has(transform)) errors.push(`invalid componentSync transform: ${transform}`);
      }
    }
    for (const rule of binding.commercialSelectionSync ?? []) {
      for (const family of rule.families ?? []) {
        if (!VALID_CONTEXT_MATERIAL_FAMILIES.has(family)) errors.push(`invalid commercialSelectionSync family: ${family}`);
      }
      for (const dynamicSlot of rule.dynamicSlots ?? []) {
        if (!parameterKeys.has(dynamicSlot.countParameter)) errors.push(`dynamic commercial slot countParameter does not exist: ${dynamicSlot.countParameter}`);
        if (!dynamicSlot.slotIdPattern.includes("{index}")) errors.push(`dynamic commercial slot pattern must include {index}: ${dynamicSlot.slotIdPattern}`);
        if (!VALID_CONTEXT_MATERIAL_FAMILIES.has(dynamicSlot.family)) errors.push(`invalid dynamic commercial slot family: ${dynamicSlot.family}`);
        if (dynamicSlot.startIndex !== undefined && (!Number.isInteger(dynamicSlot.startIndex) || dynamicSlot.startIndex < 0)) {
          errors.push(`invalid dynamic commercial slot startIndex: ${dynamicSlot.startIndex}`);
        }
      }
    }
  }
}

export function validateFurnQuoteModulePackage(
  input: FurnQuoteModulePackage,
  options: ModulePackageValidationOptions = {}
): FurnQuoteModulePackage {
  const errors: string[] = [];
  if (!isRecord(input)) throw new ModulePackageValidationError(["package must be an object"]);
  if (input.format !== MODULE_PACKAGE_FORMAT) errors.push(`format must be ${MODULE_PACKAGE_FORMAT}`);
  if (!isSupportedModulePackageVersion(input.packageVersion)) {
    errors.push(`unsupported packageVersion ${input.packageVersion}; current supported version is ${CURRENT_MODULE_PACKAGE_VERSION}`);
  }
  if (!input.module?.modulePackageId) errors.push("modulePackageId is required");
  else assertSafePackageId(input.module.modulePackageId, errors);
  if (!input.module?.moduleType?.trim()) errors.push("moduleType is required");
  if (!input.module?.familyName?.trim()) errors.push("familyName is required");
  if (!input.module?.displayName?.trim()) errors.push("displayName is required");
  if (!input.module?.version?.trim()) errors.push("module version is required");

  scanForArbitraryCodeFields(input, errors);
  validateParameters(input, errors);
  validatePlacement(input, errors);
  validateSlots(input, errors);
  validateGeometry(input, errors);
  validateAssets(input, errors);
  validateBehavior(input, errors);
  validateCompatibility(input, options, errors);

  if (input.integrity?.packageHash) {
    const actual = computeModulePackageHash(input);
    if (input.integrity.packageHash !== actual) errors.push("packageHash does not match package contents");
  }

  if (errors.length > 0) throw new ModulePackageValidationError(errors);
  return input;
}

export function validateModuleInstanceAgainstPackage(args: {
  modulePackage: FurnQuoteModulePackage;
  instance: ModuleInstance;
  catalog: ClientCatalog;
}): string[] {
  const errors: string[] = [];
  const { modulePackage, instance, catalog } = args;
  if (instance.modulePackageId !== modulePackage.module.modulePackageId) errors.push("instance modulePackageId does not match package");
  if (instance.moduleType !== modulePackage.module.moduleType) errors.push("instance moduleType does not match package");
  for (const parameter of modulePackage.parameters.parameters) {
    const value = instance.parameters[parameter.key] ?? parameter.defaultValue;
    if (parameter.required && value === undefined) errors.push(`missing required parameter: ${parameter.key}`);
    if (parameter.type === "number" && value !== undefined) {
      if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`parameter ${parameter.key} must be a number`);
      else {
        if (typeof parameter.min === "number" && value < parameter.min) errors.push(`parameter ${parameter.key} is below min`);
        if (typeof parameter.max === "number" && value > parameter.max) errors.push(`parameter ${parameter.key} is above max`);
      }
    }
    if (parameter.type === "material" && typeof value === "string" && !catalog.materials.some((material) => material.id === value)) {
      errors.push(`parameter ${parameter.key} references missing material ${value}`);
    }
    if (parameter.type === "component" && typeof value === "string" && !catalog.components.some((component) => component.id === value)) {
      errors.push(`parameter ${parameter.key} references missing component ${value}`);
    }
  }
  return errors;
}
