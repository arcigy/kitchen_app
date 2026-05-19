import type { Material } from "../../types/material";
import type {
  ComponentDefinition,
  ComponentGeometryDefinition,
  ComponentType,
  BoardFamily,
  MaterialDefinition,
  PriceList,
  PricingBasis,
  PricingUnit
} from "../../data/pricing/types";

export type HardwareDefinition = {
  id: string;
  name: string;
  pricePerPiece: number;
  type: "handle" | "rail" | "hinge" | "other";
  symmetricSides: boolean;
  pbrMaterialId?: string;
};

export type ClientModuleDefinition = {
  id: string;
  moduleType: string;
  modulePackageId?: string;
  packageVersion?: string;
  packageHash?: string;
  name: string;
  description?: string;
  enabled: boolean;
  category?: string;
  runtimeBuilderKey?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  defaultDepth?: number;
  pricingRef?: string;
  tags?: string[];
};

export type KitchenDefaults = {
  carcassMaterialId?: string;
  frontMaterialId?: string;
  worktopMaterialId?: string;
  plinthMaterialId?: string;
  backPanelMaterialId?: string;
  drawerBottomMaterialId?: string;
  defaultHandleComponentId?: string;
  defaultHingeComponentId?: string;
  defaultDrawerSystemComponentId?: string;
  defaultWorktopThicknessMm?: number;
  defaultCarcassThicknessMm?: number;
  defaultBackPanelThicknessMm?: number;
  defaultPlinthHeightMm?: number;
};

export type ProjectPricingSettings = {
  clientId: string;
  projectId: string;
  phaseId: string;
  pricingProfileId?: string;
  marginMode?: "project" | "category" | "item" | "manual";
  globalMarginPercent?: number;
  updatedAt: string;
};

export type ClientCatalog = {
  clientId: string;
  materials: MaterialDefinition[];
  hardware: HardwareDefinition[];
  legacyMaterials: Material[];
  components: ComponentDefinition[];
  componentGeometry: ComponentGeometryDefinition[];
  modules: ClientModuleDefinition[];
  priceList: PriceList;
  kitchenDefaults: KitchenDefaults;
  meta: {
    catalogVersion: number;
    source: "system-seed" | "client-custom";
    createdAt: string;
    updatedAt: string;
  };
};

export type ClientCatalogSeed = Omit<ClientCatalog, "clientId">;

export type {
  BoardFamily,
  ComponentDefinition,
  ComponentGeometryDefinition,
  ComponentType,
  MaterialDefinition,
  PriceList,
  PricingBasis,
  PricingUnit
};
