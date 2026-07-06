import type { Group } from "three";
import type { ModuleParams, ModuleType } from "../model/cabinetTypes";
import { makeDefaultModuleParams } from "../model/cabinetTypes";
import type { KitchenContext } from "../layout/kitchenContext";
import type { BOMResult } from "../layout/bom/bomTypes";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import type { CornerShelfLowerParams } from "./cornerShelfLower/types";
import { buildCornerShelfLower } from "./cornerShelfLower/geometry";
import { createCornerShelfLowerControls } from "./cornerShelfLower/controls";
import { calculateBOM as calculateCornerShelfLowerBOM } from "./cornerShelfLower/calculation";
import type { DrawerLowParams } from "./drawerLow/types";
import { buildDrawerLow } from "./drawerLow/geometry";
import { createDrawerLowControls } from "./drawerLow/controls";
import { calculateBOM as calculateDrawerLowBOM } from "./drawerLow/calculation";
import type { FlapShelvesLowParams } from "./flapShelvesLow/types";
import { buildFlapShelvesLow } from "./flapShelvesLow/geometry";
import { createFlapShelvesLowControls } from "./flapShelvesLow/controls";
import { calculateBOM as calculateFlapShelvesLowBOM } from "./flapShelvesLow/calculation";
import type { FridgeTallParams } from "./fridgeTall/types";
import { buildFridgeTall } from "./fridgeTall/geometry";
import { createFridgeTallControls } from "./fridgeTall/controls";
import { calculateBOM as calculateFridgeTallBOM } from "./fridgeTall/calculation";
import type { PinoSideCabinetParams } from "./pinoSideCabinet/types";
import { buildPinoSideCabinet } from "./pinoSideCabinet/geometry";
import { createPinoSideCabinetControls } from "./pinoSideCabinet/controls";
import { calculateBOM as calculatePinoSideCabinetBOM } from "./pinoSideCabinet/calculation";
import type { SwingShelvesLowParams } from "./swingShelvesLow/types";
import { buildSwingShelvesLow } from "./swingShelvesLow/geometry";
import { createSwingShelvesLowControls } from "./swingShelvesLow/controls";
import { calculateBOM as calculateSwingShelvesLowBOM } from "./swingShelvesLow/calculation";
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

export const MODULE_DESCRIPTORS: readonly ModuleDescriptor[] = [
  {
    type: "corner_shelf_lower",
    folder: "cornerShelfLower",
    label: "Corner",
    packageName: "module-builder-corner_shelf_lower",
    packageVersion: "1.0.0",
    defaultParams: () => makeDefaultModuleParams("corner_shelf_lower"),
    build: (params, catalog) => buildCornerShelfLower(params as CornerShelfLowerParams, catalog),
    createControls: (container, params, args) => createCornerShelfLowerControls(container, params as CornerShelfLowerParams, args),
    calculateBOM: (params, ctx, catalog) => calculateCornerShelfLowerBOM(params as CornerShelfLowerParams, ctx, catalog),
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
    build: (params, catalog) => buildDrawerLow(params as DrawerLowParams, catalog),
    createControls: (container, params, args) => createDrawerLowControls(container, params as DrawerLowParams, args),
    calculateBOM: (params, ctx, catalog) => calculateDrawerLowBOM(params as DrawerLowParams, ctx, catalog),
    capabilities: {
          "hasWorktop": true,
          "supportsKitchenContextDimensions": true,
          "supportsKitchenContextMaterials": true
    }
  },
  {
    type: "flap_shelves_low",
    folder: "flapShelvesLow",
    label: "Flap Top",
    packageName: "module-builder-flap_shelves_low",
    packageVersion: "1.0.0",
    defaultParams: () => makeDefaultModuleParams("flap_shelves_low"),
    build: (params, catalog) => buildFlapShelvesLow(params as FlapShelvesLowParams, catalog),
    createControls: (container, params, args) => createFlapShelvesLowControls(container, params as FlapShelvesLowParams, args),
    calculateBOM: (params, ctx, catalog) => calculateFlapShelvesLowBOM(params as FlapShelvesLowParams, ctx, catalog),
    capabilities: {
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
    build: (params, catalog) => buildFridgeTall(params as FridgeTallParams, catalog),
    createControls: (container, params, args) => createFridgeTallControls(container, params as FridgeTallParams, args),
    calculateBOM: (params, ctx, catalog) => calculateFridgeTallBOM(params as FridgeTallParams, ctx, catalog),
    capabilities: {
          "supportsKitchenContextDimensions": true,
          "supportsKitchenContextMaterials": true
    }
  },
  {
    type: "pino_side_cabinet",
    folder: "pinoSideCabinet",
    label: "PINO boční skříňka",
    packageName: "module-builder-pino_side_cabinet",
    packageVersion: "1.0.0",
    defaultParams: () => makeDefaultModuleParams("pino_side_cabinet"),
    build: (params, catalog) => buildPinoSideCabinet(params as PinoSideCabinetParams, catalog),
    createControls: (container, params, args) => createPinoSideCabinetControls(container, params as PinoSideCabinetParams, args),
    calculateBOM: (params, ctx, catalog) => calculatePinoSideCabinetBOM(params as PinoSideCabinetParams, ctx, catalog),
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
    build: (params, catalog) => buildSwingShelvesLow(params as SwingShelvesLowParams, catalog),
    createControls: (container, params, args) => createSwingShelvesLowControls(container, params as SwingShelvesLowParams, args),
    calculateBOM: (params, ctx, catalog) => calculateSwingShelvesLowBOM(params as SwingShelvesLowParams, ctx, catalog),
    capabilities: {
          "hasWorktop": true,
          "supportsKitchenContextDimensions": true,
          "supportsKitchenContextMaterials": true
    }
  },
  ...fwmFurnitureDescriptors
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
