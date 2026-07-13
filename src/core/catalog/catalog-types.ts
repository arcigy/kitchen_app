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

export type VendorProductVariant = {
  recordType?: "product_variant";
  itemType?: "product_variant";
  productTemplateId: string;
  templateId?: string;
  sourcePdf: string;
  sourcePage: number;
  bbox?: { x: number; y: number; width: number; height: number };
  mainGroup?: string | null;
  subGroup?: string | null;
  edition?: string | null;
  articleCode: string;
  articleFamily: string;
  widthCm: number | null;
  variantCode: string | null;
  variantCodeStatus?: "extracted" | "none_expected" | "missing_uncertain";
  catalogKey: string;
  compositeKey?: string;
  productTemplateName: string;
  templateInheritedFromParent?: boolean;
  nameRaw?: string;
  nameNormalized?: string;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  availableWidthsMm?: number[];
  priceIndex?: number | null;
  pricingReferenceRaw?: string | null;
  priceGroupValues?: Record<string, number>;
  rulesRaw?: string[];
  constraints?: unknown[];
  notes?: string[];
  imagePath?: string | null;
  imageRole?: "product_image" | "inherited_from_parent" | "empty_placeholder" | "unmatched";
  imageCropQuality?: string;
  moduleIntent?: VendorModuleIntent;
  confidence: number;
  needsReview: boolean;
  reviewReasons?: string[];
};

export type VendorProductTemplate = {
  itemType?: "product_template";
  productTemplateId: string;
  sourcePdf: string;
  sourcePages: number[];
  bbox?: { x: number; y: number; width: number; height: number };
  mainGroup?: string | null;
  subGroup?: string | null;
  edition?: string | null;
  productTemplateName: string;
  nameNormalized?: string;
  variantCatalogKeys: string[];
  articleFamilies: string[];
  availableWidthsMm?: number[];
  moduleIntent?: VendorModuleIntent;
  confidence: number;
  needsReview: boolean;
  reviewReasons?: string[];
};

export type VendorPricingReference = {
  itemType?: "pricing_reference";
  sourcePdf: string;
  sourcePage: number;
  bbox?: { x: number; y: number; width: number; height: number };
  mainGroup?: string | null;
  subGroup?: string | null;
  edition?: string | null;
  catalogKey: string;
  articleCode: string;
  priceIndex?: number | null;
  priceGroupValues?: Record<string, number>;
  pricingReferenceRaw?: string | null;
  confidence: number;
  needsReview: boolean;
};

export type VendorModuleIntent = {
  moduleClass: "base" | "corner_base" | "tall" | "appliance_tall" | "accessory" | "unknown";
  kitchenModuleRole: "base" | "top" | "tall" | "accessory" | "unknown";
  placementZone: "low" | "corner_low" | "tall" | "tall_appliance" | "accessory" | "unknown";
  requiresWorktop: boolean;
  requiresCorner: boolean;
  requiresApplianceOpening: boolean;
  requiresWallAttachment: boolean;
  builderKeyCandidates: string[];
  featureTags: string[];
  notes: string[];
};

export type VendorExtractionMeta = {
  sourcePdf: string;
  pages: number[];
  productVariants: number;
  productTemplates: number;
  pricingReferences: number;
  importedAt: string;
  importStatus: "review_staging";
  productionImportApproved: false;
  notes: string[];
};

export type VendorCatalogIndex = {
  vendorId: string;
  displayName: string;
  source: "vkh_2026_cz_pdf";
  productVariants: VendorProductVariant[];
  productTemplates: VendorProductTemplate[];
  pricingReferences: VendorPricingReference[];
  extractionMeta: VendorExtractionMeta;
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
  vendorCatalog?: VendorCatalogIndex;
  meta: {
    catalogVersion: number;
    source: "system-seed" | "client-custom";
    createdAt: string;
    updatedAt: string;
    lastSynchronizedAt?: string;
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
