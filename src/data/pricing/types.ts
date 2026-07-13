export type PricingBasis = "sheet_area" | "linear_length" | "piece" | "custom";

export type PricingUnit = "m2" | "lm" | "pcs" | "custom";

export type MaterialType = "board" | "edge";

export type BoardFamily = "body" | "front" | "back" | "drawer_box" | "drawer_bottom" | "shelf" | "worktop";

export type EdgeFamily = "body" | "front" | "drawer_box" | "shelf" | "worktop";

export type MaterialBase =
  | "dtd"
  | "mdf"
  | "hdf"
  | "plywood"
  | "multiplex"
  | "solid_wood"
  | "laminate"
  | "compact"
  | "veneer"
  | "acrylic"
  | "abs";

export type MaterialPreview = {
  colorHex: string;
  roughness: number;
  metalness: number;
};

export type ComponentType =
  | "runner"
  | "handle"
  | "leg"
  | "plinth_clip"
  | "fastener"
  | "hinge"
  | "push_system"
  | "hanging_bracket"
  | "shelf_support"
  | "drawer_insert"
  | "lift_up"
  | "waste_system"
  | "lighting";

export type CatalogSupplierSource = {
  supplier: string;
  supplierProductId: string;
  url?: string;
  imageUrl?: string;
  usageCategory?: string;
  usageSubcategory?: string;
  sourceCategory?: string;
  rawUnit?: string;
};

export type ComponentGeometryArchetype =
  | "runner_pair"
  | "handle_bar"
  | "handle_profile"
  | "handle_knob"
  | "leg_adjustable"
  | "plinth_clip"
  | "fastener"
  | "hinge"
  | "push_system"
  | "hanging_bracket"
  | "shelf_support"
  | "drawer_insert"
  | "lift_up"
  | "waste_system"
  | "lighting_profile";

export type ComponentGeometrySource = "legacy_drawer_low" | "catalog_demo";

export type ComponentGeometryDimensions = {
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  thicknessMm?: number;
  diameterMm?: number;
  projectionMm?: number;
};

export type ComponentGeometryDefinition = {
  id: string;
  displayName: string;
  componentType: ComponentType;
  archetype: ComponentGeometryArchetype;
  sourceGeometry: ComponentGeometrySource;
  dimensionsMm: ComponentGeometryDimensions;
  notes?: string[];
};

export type MaterialDefinition = {
  id: string;
  entityType: "material";
  supplierId?: string;
  materialCode?: string;
  manufacturer?: string;
  materialType: MaterialType;
  name: string;
  displayName: string;
  category: string;
  subcategory?: string;
  baseMaterial: MaterialBase;
  decor: string;
  color: string;
  finish: string;
  pricingBasis: PricingBasis;
  pricingUnit: PricingUnit;
  availableThicknessesMm: number[];
  defaultThicknessMm: number;
  isActive: boolean;
  tags: string[];
  preview: MaterialPreview;
  boardFamily?: BoardFamily;
  recommendedUse?: string;
  grainDirectionRelevant?: boolean;
  edgeFamily?: EdgeFamily;
  recommendedBoardMatch?: string;
  supplierSource?: CatalogSupplierSource;
  lastUpdated?: string;
  metadata?: Record<string, unknown>;
};

export type ComponentDefinition = {
  id: string;
  entityType: "component";
  supplierId?: string;
  componentCode?: string;
  manufacturer?: string;
  componentType: ComponentType;
  geometryId: string;
  name: string;
  displayName: string;
  category?: string;
  subcategory?: string;
  brand: string;
  series: string;
  variant: string;
  color: string;
  pricingBasis: PricingBasis;
  pricingUnit: PricingUnit;
  defaultQuantity: number;
  isActive: boolean;
  tags: string[];
  preview: MaterialPreview;
  nominalLengthMm?: number;
  nominalHeightMm?: number;
  recommendedUse?: string;
  notes?: string[];
  supplierSource?: CatalogSupplierSource;
  lastUpdated?: string;
  metadata?: Record<string, unknown>;
};

export type PricingCatalogRecord = MaterialDefinition | ComponentDefinition;

export type PriceList = {
  id: string;
  name: string;
  currency: "EUR";
  isActive: boolean;
  prices: Record<string, number>;
};

export type PricingCatalogTableRow = {
  id: string;
  entityType: "material" | "component";
  displayName: string;
  category: string;
  pricingBasis: PricingBasis;
  pricingUnit: PricingUnit;
  unitPriceEur: number | null;
  isActive: boolean;
  tags: string[];
};
