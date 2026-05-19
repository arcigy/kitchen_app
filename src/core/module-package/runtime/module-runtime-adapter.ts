import type { Group } from "three";
import type { ClientCatalog } from "../../catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../module-package-types";
import { getModuleDescriptors } from "../../../modules/registry";
import type { TrustedModuleRuntimeBuilder } from "./module-runtime-contract";

const BUILDER_KEYS: Record<string, string> = {
  "cornerShelfLower.v1": "corner_shelf_lower",
  "drawerLow.v1": "drawer_low",
  "flapShelvesLow.v1": "flap_shelves_low",
  "fridgeTall.v1": "fridge_tall",
  "swingShelvesLow.v1": "swing_shelves_low"
};

export function getTrustedRuntimeBuilderKeys(): string[] {
  return Object.keys(BUILDER_KEYS).sort();
}

export function hasTrustedRuntimeBuilder(runtimeBuilderKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILDER_KEYS, runtimeBuilderKey);
}

export function resolveTrustedRuntimeBuilder(runtimeBuilderKey: string): TrustedModuleRuntimeBuilder | null {
  const moduleType = BUILDER_KEYS[runtimeBuilderKey];
  if (!moduleType) return null;
  const descriptor = getModuleDescriptors().find((entry) => entry.type === moduleType);
  if (!descriptor) return null;
  return {
    key: runtimeBuilderKey,
    moduleType,
    label: descriptor.label,
    build: (params: Record<string, unknown>, catalog: ClientCatalog): Group =>
      descriptor.build({ ...descriptor.defaultParams(), ...params } as Parameters<typeof descriptor.build>[0], catalog)
  };
}

export function buildModulePackageGeometry(args: {
  runtimeBuilderKey: string;
  parameters: Record<string, unknown>;
  catalog: ClientCatalog;
}): Group {
  const builder = resolveTrustedRuntimeBuilder(args.runtimeBuilderKey);
  if (!builder) throw new Error(`Unknown trusted runtime builder: ${args.runtimeBuilderKey}`);
  const group = builder.build(args.parameters, args.catalog);
  group.userData.modulePackageBuildParameters = { ...args.parameters };
  group.userData.runtimeBuilderKey = args.runtimeBuilderKey;
  return group;
}

export function createDefaultModulePackageParameters(modulePackage: FurnQuoteModulePackage): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const parameter of modulePackage.parameters.parameters) {
    if ("defaultValue" in parameter) parameters[parameter.key] = parameter.defaultValue;
  }
  parameters.modulePackageId = modulePackage.module.modulePackageId;
  parameters.moduleType = modulePackage.module.moduleType;
  parameters.packageVersion = modulePackage.module.version;
  if (modulePackage.integrity.packageHash) parameters.packageHash = modulePackage.integrity.packageHash;
  return parameters;
}

export function buildModulePackageGeometryFromPackage(args: {
  modulePackage: FurnQuoteModulePackage;
  parameters?: Record<string, unknown>;
  catalog: ClientCatalog;
}): Group {
  if (args.modulePackage.geometry.mode !== "trusted-runtime") {
    throw new Error("Only trusted-runtime module package geometry is supported by the runtime adapter.");
  }
  const defaults = createDefaultModulePackageParameters(args.modulePackage);
  const mapped: Record<string, unknown> = { ...defaults, ...(args.parameters ?? {}) };
  for (const [fromKey, toKey] of Object.entries(args.modulePackage.geometry.parameterMapping ?? {})) {
    if (fromKey in mapped) mapped[toKey] = mapped[fromKey];
  }
  return buildModulePackageGeometry({
    runtimeBuilderKey: args.modulePackage.geometry.runtimeBuilderKey,
    parameters: mapped,
    catalog: args.catalog
  });
}

export function resolveModulePackageMaterialAssignments(args: {
  modulePackage: FurnQuoteModulePackage;
  catalog: ClientCatalog;
  explicitAssignments?: Record<string, string>;
}): Record<string, string> {
  const defaults = args.catalog.kitchenDefaults;
  const resolved: Record<string, string> = {};
  for (const slot of args.modulePackage.materials.slots) {
    const explicit = args.explicitAssignments?.[slot.slotId];
    const value = explicit ??
      (slot.defaultFrom === "catalog.kitchenDefaults.carcassMaterialId" ? defaults.carcassMaterialId :
        slot.defaultFrom === "catalog.kitchenDefaults.frontMaterialId" ? defaults.frontMaterialId :
        slot.defaultFrom === "catalog.kitchenDefaults.worktopMaterialId" ? defaults.worktopMaterialId :
        slot.defaultFrom === "catalog.kitchenDefaults.plinthMaterialId" ? defaults.plinthMaterialId :
        slot.defaultFrom === "catalog.kitchenDefaults.backPanelMaterialId" ? defaults.backPanelMaterialId :
        undefined);
    if (value && args.catalog.materials.some((material) => material.id === value)) resolved[slot.slotId] = value;
  }
  return resolved;
}

export function resolveModulePackageComponentAssignments(args: {
  modulePackage: FurnQuoteModulePackage;
  catalog: ClientCatalog;
  explicitAssignments?: Record<string, string>;
}): Record<string, string> {
  const defaults = args.catalog.kitchenDefaults;
  const resolved: Record<string, string> = {};
  for (const slot of args.modulePackage.components.slots) {
    const explicit = args.explicitAssignments?.[slot.slotId];
    const value = explicit ??
      (slot.defaultFrom === "catalog.kitchenDefaults.defaultHandleComponentId" ? defaults.defaultHandleComponentId :
        slot.defaultFrom === "catalog.kitchenDefaults.defaultHingeComponentId" ? defaults.defaultHingeComponentId :
        slot.defaultFrom === "catalog.kitchenDefaults.defaultDrawerSystemComponentId" ? defaults.defaultDrawerSystemComponentId :
        undefined);
    if (value && args.catalog.components.some((component) => component.id === value)) resolved[slot.slotId] = value;
  }
  return resolved;
}
