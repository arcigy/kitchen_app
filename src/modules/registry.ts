import type { Group } from "three";
import type { ModuleParams, ModuleType } from "../model/cabinetTypes";
import type { KitchenContext } from "../layout/kitchenContext";
import type { BOMResult } from "../layout/bom/bomTypes";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { FWM_FURNITURE_SPECS, type FwmFurnitureSpec } from "./fwmFurniture/definitions";
import type { FwmFurnitureParams } from "./fwmFurniture/types";
import { makeDefaultFwmFurnitureParams } from "./fwmFurniture/types";
import { buildFwmFurniture } from "./fwmFurniture/geometry";
import { createFwmFurnitureControls } from "./fwmFurniture/controls";
import { calculateFwmFurnitureBOM } from "./fwmFurniture/calculation";

export type ModuleControlsApi = {
  syncFromParams: () => void;
  isAutoFitEnabled: () => boolean;
  highlightParamKeys: (keys: string[]) => void;
  clearHighlights: () => void;
};

export type ModuleControlsArgs = {
  onChange: () => void | boolean;
  getWorktopThicknessMm: () => number;
  clientCatalog: ClientCatalog;
  textInputCommitMode?: "immediate" | "explicit";
  commitBoundary?: HTMLElement | null;
  presetHost?: HTMLElement;
  presetDialogHost?: HTMLElement;
  userParametersOnly?: boolean;
  createParameterPreset?: (args: {
    modulePackage: FurnQuoteModulePackage;
    parameters: Record<string, unknown>;
    name: string;
    note: string;
  }) => Promise<{ modulePackage: FurnQuoteModulePackage; presetId: string } | null>;
};

export type ModuleCapabilityFlags = {
  hasWorktop?: boolean;
  supportsKitchenContextDimensions?: boolean;
  supportsKitchenContextMaterials?: boolean;
  supportsWallMountedVariant?: boolean;
};

export type ModuleDescriptor = {
  type: ModuleType;
  folder: string;
  label: string;
  packageName: string;
  packageVersion: string;
  defaultParams: () => ModuleParams;
  build: (params: ModuleParams, catalog: ClientCatalog) => Group;
  createControls: (
    container: HTMLElement,
    params: ModuleParams,
    args: ModuleControlsArgs
  ) => ModuleControlsApi;
  calculateBOM: (params: ModuleParams, ctx: KitchenContext, catalog: ClientCatalog) => BOMResult;
  capabilities: ModuleCapabilityFlags;
};

const fwmFurnitureDescriptors: ModuleDescriptor[] = (FWM_FURNITURE_SPECS as readonly FwmFurnitureSpec[]).map((spec) => ({
  type: spec.moduleType as ModuleType,
  folder: "fwmFurniture",
  label: spec.displayName,
  packageName: `module-builder-${spec.moduleType}`,
  packageVersion: "1.0.0",
  defaultParams: () => makeDefaultFwmFurnitureParams(spec.moduleType as FwmFurnitureParams["type"]) as ModuleParams,
  build: (params, catalog) => buildFwmFurniture(params as FwmFurnitureParams, catalog),
  createControls: (container, params, args) => createFwmFurnitureControls(container, params as FwmFurnitureParams, args),
  calculateBOM: (params, ctx, catalog) => calculateFwmFurnitureBOM(params as FwmFurnitureParams, ctx, catalog),
  capabilities: {
    hasWorktop: spec.hasWorktop === true,
    supportsKitchenContextDimensions: !!spec.kitchenRole,
    supportsKitchenContextMaterials: !!spec.kitchenRole,
    supportsWallMountedVariant: spec.wallMounted === true
  }
}));

export const MODULE_DESCRIPTORS: readonly ModuleDescriptor[] = fwmFurnitureDescriptors;

const moduleDescriptorMap = new Map<ModuleType, ModuleDescriptor>(
  MODULE_DESCRIPTORS.map((descriptor) => [descriptor.type, descriptor])
);

export function getModuleDescriptors(): readonly ModuleDescriptor[] {
  return MODULE_DESCRIPTORS;
}

export function getFirstModuleType(): ModuleType {
  const first = MODULE_DESCRIPTORS[0];
  if (!first) throw new Error("No imported modules are registered.");
  return first.type;
}

export function getModuleDescriptor(type: ModuleType): ModuleDescriptor | undefined {
  return moduleDescriptorMap.get(type);
}

export function getModuleDescriptorOrThrow(type: ModuleType): ModuleDescriptor {
  const descriptor = getModuleDescriptor(type);
  if (!descriptor) throw new Error(`Unknown imported module type: ${type}`);
  return descriptor;
}
