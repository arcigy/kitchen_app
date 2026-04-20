import type { Group } from "three";
import type { ModuleParams, ModuleType } from "../model/cabinetTypes";
import { makeDefaultModuleParams } from "../model/cabinetTypes";
import type { DrawerLowParams } from "./drawerLow/types";
import { buildDrawerLow } from "./drawerLow/geometry";
import { createDrawerLowControls } from "./drawerLow/controls";

export type ModuleControlsApi = {
  syncFromParams: () => void;
  isAutoFitEnabled: () => boolean;
  highlightParamKeys: (keys: string[]) => void;
  clearHighlights: () => void;
};

export type ModuleControlsArgs = {
  onChange: () => void;
  getWorktopThicknessMm: () => number;
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
  build: (params: ModuleParams) => Group;
  createControls: (
    container: HTMLElement,
    params: ModuleParams,
    args: ModuleControlsArgs
  ) => ModuleControlsApi;
  capabilities: ModuleCapabilityFlags;
};

export const MODULE_DESCRIPTORS: readonly ModuleDescriptor[] = [
  {
    type: "drawer_low",
    folder: "drawerLow",
    label: "Drawer",
    packageName: "kitchen-app-module-drawer_low",
    packageVersion: "1.0.0",
    defaultParams: () => makeDefaultModuleParams("drawer_low"),
    build: (params) => buildDrawerLow(params as DrawerLowParams),
    createControls: (container, params, args) => createDrawerLowControls(container, params as DrawerLowParams, args),
    capabilities: {
          "hasWorktop": true,
          "supportsKitchenContextDimensions": true,
          "supportsKitchenContextMaterials": true
    }
  }
] as const;

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
