import type { Group } from "three";
import type { ModuleParams, ModuleType } from "../model/cabinetTypes";
import { makeDefaultModuleParams } from "../model/cabinetTypes";
import type { KitchenContext } from "../layout/kitchenContext";
import type { BOMResult } from "../layout/bom/bomTypes";
import type { CornerShelfLowerParams } from "./cornerShelfLower/types";
import { buildCornerShelfLower } from "./cornerShelfLower/geometry";
import { createCornerShelfLowerControls } from "./cornerShelfLower/controls";
import { calculateBOM as calculateCornerShelfLowerBOM } from "./cornerShelfLower/calculation";
import type { DrawerLowParams } from "./drawerLow/types";
import { buildDrawerLow } from "./drawerLow/geometry";
import { createDrawerLowControls } from "./drawerLow/controls";
import { calculateBOM as calculateDrawerLowBOM } from "./drawerLow/calculation";
import type { FridgeTallParams } from "./fridgeTall/types";
import { buildFridgeTall } from "./fridgeTall/geometry";
import { createFridgeTallControls } from "./fridgeTall/controls";
import { calculateBOM as calculateFridgeTallBOM } from "./fridgeTall/calculation";
import type { SwingShelvesLowParams } from "./swingShelvesLow/types";
import { buildSwingShelvesLow } from "./swingShelvesLow/geometry";
import { createSwingShelvesLowControls } from "./swingShelvesLow/controls";
import { calculateBOM as calculateSwingShelvesLowBOM } from "./swingShelvesLow/calculation";

export type ModuleControlsApi = {
  syncFromParams: () => void;
  isAutoFitEnabled: () => boolean;
  highlightParamKeys: (keys: string[]) => void;
  clearHighlights: () => void;
};

export type ModuleControlsArgs = {
  onChange: (previousParams?: Record<string, unknown>, sourceKey?: string) => void | boolean;
  getWorktopThicknessMm: () => number;
  textInputCommitMode?: "immediate" | "explicit";
  commitBoundary?: HTMLElement | null;
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
  calculateBOM: (params: ModuleParams, ctx: KitchenContext) => BOMResult;
  capabilities: ModuleCapabilityFlags;
};

export const MODULE_DESCRIPTORS: readonly ModuleDescriptor[] = [
  {
    type: "corner_shelf_lower",
    folder: "cornerShelfLower",
    label: "Corner",
    packageName: "module-builder-corner_shelf_lower",
    packageVersion: "1.0.0",
    defaultParams: () => makeDefaultModuleParams("corner_shelf_lower"),
    build: (params) => buildCornerShelfLower(params as CornerShelfLowerParams),
    createControls: (container, params, args) => createCornerShelfLowerControls(container, params as CornerShelfLowerParams, args),
    calculateBOM: (params, ctx) => calculateCornerShelfLowerBOM(params as CornerShelfLowerParams, ctx),
    capabilities: {
          "supportsKitchenContextDimensions": true,
          "supportsKitchenContextMaterials": true,
          "hasWorktop": true
    }
  },
  {
    type: "drawer_low",
    folder: "drawerLow",
    label: "Drawer",
    packageName: "module-builder-drawer_low",
    packageVersion: "1.0.0",
    defaultParams: () => makeDefaultModuleParams("drawer_low"),
    build: (params) => buildDrawerLow(params as DrawerLowParams),
    createControls: (container, params, args) => createDrawerLowControls(container, params as DrawerLowParams, args),
    calculateBOM: (params, ctx) => calculateDrawerLowBOM(params as DrawerLowParams, ctx),
    capabilities: {
          "hasWorktop": true,
          "supportsKitchenContextDimensions": true,
          "supportsKitchenContextMaterials": true
    }
  },
  {
    type: "fridge_tall",
    folder: "fridgeTall",
    label: "Fridge",
    packageName: "module-builder-fridge_tall",
    packageVersion: "1.0.0",
    defaultParams: () => makeDefaultModuleParams("fridge_tall"),
    build: (params) => buildFridgeTall(params as FridgeTallParams),
    createControls: (container, params, args) => createFridgeTallControls(container, params as FridgeTallParams, args),
    calculateBOM: (params, ctx) => calculateFridgeTallBOM(params as FridgeTallParams, ctx),
    capabilities: {
          "supportsKitchenContextDimensions": true,
          "supportsKitchenContextMaterials": true
    }
  },
  {
    type: "swing_shelves_low",
    folder: "swingShelvesLow",
    label: "Shelf Doors",
    packageName: "module-builder-swing_shelves_low",
    packageVersion: "1.0.0",
    defaultParams: () => makeDefaultModuleParams("swing_shelves_low"),
    build: (params) => buildSwingShelvesLow(params as SwingShelvesLowParams),
    createControls: (container, params, args) => createSwingShelvesLowControls(container, params as SwingShelvesLowParams, args),
    calculateBOM: (params, ctx) => calculateSwingShelvesLowBOM(params as SwingShelvesLowParams, ctx),
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
