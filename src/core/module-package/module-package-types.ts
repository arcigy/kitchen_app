export const MODULE_PACKAGE_FORMAT = "furnquote-module" as const;
export const CURRENT_MODULE_PACKAGE_VERSION = 1;

export type ModulePackageCategory =
  | "base_cabinet"
  | "wall_cabinet"
  | "tall_cabinet"
  | "corner_cabinet"
  | "wardrobe"
  | "shelf"
  | "table"
  | "bed"
  | "wall_unit"
  | "custom";

export type ModulePackageMetadata = {
  modulePackageId: string;
  moduleType: string;
  familyName: string;
  displayName: string;
  description?: string;
  category: ModulePackageCategory;
  version: string;
  isSystemModule?: boolean;
  tags?: string[];
};

/**
 * Stable, package-owned semantics for Kitchen Group modules.  The contract is
 * deliberately separate from placement rules: placement describes where a
 * module may be put, while this describes which shared Kitchen Group values it
 * owns and how its dimensional reference planes are interpreted.
 */
export type KitchenModuleProductKind =
  | "cabinet"
  | "worktop"
  | "panel"
  | "shelf"
  | "appliance"
  | "accessory"
  | "hardware";

export type KitchenModuleRole = "low" | "top" | "tall";

export type KitchenModuleTopology = "rectangular" | "corner-symmetric" | "corner-asymmetric";

export type KitchenModulePlacementMode = "wall" | "corner" | "free-standing";

export type KitchenModuleCapability =
  | "backs"
  | "fronts"
  | "drawers"
  | "shelves"
  | "plinth"
  | "worktop"
  | "handles"
  | "hinges"
  | "runners"
  | "openable";

export type KitchenModuleContract = {
  version: 1;
  productKind: KitchenModuleProductKind;
  role?: KitchenModuleRole;
  topology: KitchenModuleTopology;
  placementMode: KitchenModulePlacementMode;
  capabilities: KitchenModuleCapability[];
  /** A named geometry contract prevents a historical package snapshot from silently changing shape. */
  geometryContractVersion: 1 | 2;
  /** Parameters which are intentionally package-local rather than shared Kitchen Group parameters. */
  localParameterKeys?: string[];
};

export type ModuleCompatibility = {
  minAppVersion?: string;
  maxAppVersion?: string;
  requiredRuntimeBuilderKeys?: string[];
  requiredCatalogFeatures?: string[];
};

export type ModuleParameterAffects = "geometry" | "bom" | "pricing" | "visual" | "placement" | "export" | "all";

export type ModuleParameterDefinition = {
  key: string;
  label: string;
  type: "number" | "string" | "boolean" | "select" | "material" | "component";
  required?: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
  unit?: "mm" | "cm" | "m" | "percent" | "pcs";
  options?: { label: string; value: string }[];
  group?: string;
  uiVisibility?: "user" | "technical" | "internal";
  affects: ModuleParameterAffects;
};

export type ModuleParameterSchema = {
  parameters: ModuleParameterDefinition[];
};

export type ModulePlacementContext =
  | "kitchen_wall"
  | "kitchen_corner"
  | "floor"
  | "wall_mounted"
  | "free_standing"
  | "inside_wardrobe"
  | "above_countertop"
  | "under_sink"
  | "appliance_zone"
  | "custom";

export type ModulePlacementAnchor =
  | "wall"
  | "two_perpendicular_walls"
  | "floor"
  | "ceiling"
  | "corner"
  | "countertop"
  | "adjacent_module";

export type ModulePlacementRules = {
  allowedContexts: ModulePlacementContext[];
  requiredAnchors?: ModulePlacementAnchor[];
  forbiddenContexts?: ModulePlacementContext[];
  requiresCorner?: boolean;
  requiresWall?: boolean;
  requiresFloor?: boolean;
  allowFreePlacement?: boolean;
  corner?: {
    required?: boolean;
    allowedAngles?: number[];
    toleranceDeg?: number;
    mustTouchBothWalls?: boolean;
  };
  wall?: {
    mustAttachToWall?: boolean;
  };
  clearance?: {
    leftMm?: number;
    rightMm?: number;
    frontMm?: number;
    backMm?: number;
    topMm?: number;
  };
  collision?: {
    allowOverlap?: boolean;
    ignoreCategories?: string[];
  };
};

export type ModuleSnappingRules = {
  enabled: boolean;
  snapTargets?: Array<"wall" | "corner" | "floor" | "adjacent_module" | "grid" | "countertop">;
  priority?: Array<"corner" | "wall" | "adjacent_module" | "grid">;
  snapDistanceMm?: number;
  rotationSnapDeg?: number;
  align?: {
    backToWall?: boolean;
    sideToWall?: boolean;
    frontFlushWithAdjacent?: boolean;
    topAlignWithAdjacent?: boolean;
  };
};

export type ModuleConstraintRules = {
  dimensionRules?: {
    width?: { min: number; max: number; step?: number };
    height?: { min: number; max: number; step?: number };
    depth?: { min: number; max: number; step?: number };
  };
  dependencyRules?: Array<{
    if: { parameter: string; equals: unknown };
    then: {
      set?: Record<string, unknown>;
      require?: string[];
      disable?: string[];
    };
  }>;
  validationRules?: Array<{
    id: string;
    message: string;
    severity: "error" | "warning";
    expression: string;
  }>;
};

export type ModuleGeometryPrimitive = {
  primitiveType: "box" | "cylinder" | "plane" | "mesh";
  id: string;
  params: Record<string, unknown>;
};

export type ModuleGeometryDefinition =
  | {
      mode: "trusted-runtime";
      runtimeBuilderKey: string;
      parameterMapping?: Record<string, string>;
    }
  | {
      mode: "declarative";
      primitives: ModuleGeometryPrimitive[];
    };

export type ModuleMaterialSlot = {
  slotId: string;
  label: string;
  required: boolean;
  defaultFrom:
    | "catalog.kitchenDefaults.carcassMaterialId"
    | "catalog.kitchenDefaults.frontMaterialId"
    | "catalog.kitchenDefaults.worktopMaterialId"
    | "catalog.kitchenDefaults.plinthMaterialId"
    | "catalog.kitchenDefaults.backPanelMaterialId"
    | "catalog.kitchenDefaults.drawerBottomMaterialId"
    | "none";
  allowedMaterialTags?: string[];
  affects: Array<"geometry" | "visual" | "bom" | "pricing">;
};

export type ModuleMaterialSlots = {
  slots: ModuleMaterialSlot[];
};

export type ModuleComponentSlot = {
  slotId: string;
  label: string;
  componentType: "handle" | "hinge" | "runner" | "leg" | "plinth_clip" | "rail" | "led" | "other";
  required: boolean;
  defaultFrom?:
    | "catalog.kitchenDefaults.defaultHandleComponentId"
    | "catalog.kitchenDefaults.defaultHingeComponentId"
    | "catalog.kitchenDefaults.defaultDrawerSystemComponentId"
    | "parameter.legComponentId"
    | "parameter.clipComponentId";
  affects: Array<"geometry" | "bom" | "pricing" | "visual">;
};

export type ModuleComponentSlots = {
  slots: ModuleComponentSlot[];
};

export type ModuleBomRule = {
  id: string;
  itemType: "material" | "component" | "labor" | "custom";
  source: "materialSlot" | "componentSlot" | "parameter" | "fixed";
  sourceKey: string;
  quantityFormula:
    | { type: "fixed"; value: number }
    | { type: "area"; widthParam: string; heightParam: string; multiplier?: number }
    | { type: "length"; param: string; multiplier?: number }
    | { type: "count"; param: string };
};

export type ModuleBomRules = {
  rules: ModuleBomRule[];
};

export type ModulePricingRules = {
  pricingRefs?: string[];
  marginCategory?: string;
  quoteGroup?: string;
};

export type ModuleContextType = "kitchenGroup" | "wardrobeGroup" | "room" | "custom";

export type ModuleContextBindingSource = string;

export type ModuleContextBindingTransform =
  | "identity"
  | "materialDefaultThickness"
  | "resolvedWorktopThickness"
  | "handleGeometryKind"
  | "componentNominalLength";

export type ModuleContextSyncMode = "live" | "defaultOnly";

export type ModuleContextParameterSyncRule = {
  targetParameter: string;
  source: ModuleContextBindingSource;
  transform?: ModuleContextBindingTransform;
  mode?: ModuleContextSyncMode;
};

export type ModuleContextMaterialFamily = "corpus" | "body" | "front" | "back" | "drawer_box" | "drawer_bottom" | "worktop" | "shelf";

export type ModuleContextMaterialAlias = "corpus" | "body" | "front" | "back" | "drawer_bottom" | "worktop" | "shelf";

export type ModuleContextMaterialSyncRule = {
  targetSlot?: string;
  targetParameter?: string;
  source: ModuleContextBindingSource;
  family: ModuleContextMaterialFamily;
  thicknessParameter?: string;
  aliases?: ModuleContextMaterialAlias[];
};

export type ModuleContextComponentSyncRule = {
  targetSlot?: string;
  targetParameter: string;
  source: ModuleContextBindingSource;
  componentType?: ModuleComponentSlot["componentType"];
  transforms?: ModuleContextBindingTransform[];
};

export type ModuleContextCommercialSelectionSyncRule = {
  source: "materialSnapshot";
  families?: ModuleContextMaterialFamily[];
  dynamicSlots?: Array<{
    countParameter: string;
    slotIdPattern: string;
    family: ModuleContextMaterialFamily;
    startIndex?: number;
  }>;
};

export type ModuleContextBinding = {
  contextType: ModuleContextType;
  required?: boolean;
  scope?: "single" | "multiple" | "optional";
  autoAssign?: "activeContext" | "activeKitchenGroup" | "none";
  liveSync?: boolean;
  forbidCrossContextAdjacency?: boolean;
  parameterSync?: ModuleContextParameterSyncRule[];
  materialSync?: ModuleContextMaterialSyncRule[];
  componentSync?: ModuleContextComponentSyncRule[];
  commercialSelectionSync?: ModuleContextCommercialSelectionSyncRule[];
  overridePolicy?: {
    allowUserOverride?: boolean;
    warnWhenDetachedFromContext?: boolean;
  };
};

export type ModuleBehaviorDefinition = {
  contextBindings?: ModuleContextBinding[];
};

export type ModuleInternalEditSubmoduleTool =
  | "drawer"
  | "shelf"
  | "door"
  | "oven"
  | "microwave"
  | "sink"
  | "dishwasher"
  | "fridge"
  | "fridge_freezer"
  | "cooktop";

export type ModuleInternalEditBoardOperation =
  | "delete_board"
  | "move_board"
  | "resize_board"
  | "trim_board"
  | "extend_board";

export type ModuleInternalEditToolStatus = "available" | "planned";

export type ModuleInternalEditSubmoduleRule = {
  tool: ModuleInternalEditSubmoduleTool;
  label: string;
  status: ModuleInternalEditToolStatus;
  insertionMode: "vertical_slot" | "cabinet_opening" | "worktop_cutout" | "surface_mount";
  allowedWhen?: string[];
  note: string;
};

export type ModuleInternalEditBoardRule = {
  operation: ModuleInternalEditBoardOperation;
  status: ModuleInternalEditToolStatus;
  allowedMaterialGroups?: string[];
  note: string;
};

export type ModuleInternalEditingDefinition = {
  enabled: boolean;
  hostKind: "none" | "composed_tall" | "base_cabinet" | "worktop_surface" | "fixed_parametric";
  defaultEditor?: "slot_stack" | "surface_insert" | "board_level";
  submoduleTools: ModuleInternalEditSubmoduleRule[];
  boardOperations: ModuleInternalEditBoardRule[];
  note: string;
};

export type ModuleUiDefinition = {
  icon?: string;
  previewImage?: string;
  groups: Array<{
    id: string;
    label: string;
    order: number;
  }>;
  controls: Array<{
    parameterKey: string;
    controlType: "number" | "text" | "select" | "checkbox" | "materialPicker" | "componentPicker";
    groupId?: string;
    order?: number;
    visibleWhen?: unknown;
  }>;
};

export type ModuleExportMetadata = {
  exportTags?: string[];
  manufacturingCode?: string;
  notes?: string[];
};

export type ModuleManufacturingMetadata = {
  cncStrategy?: string;
  edgeBandingStrategy?: string;
  notes?: string[];
};

export type ModulePackageAsset = {
  assetId: string;
  fileName: string;
  mimeType?: "image/png" | "image/jpeg" | "image/webp" | "application/json";
  sizeBytes?: number;
  sha256?: string;
};

export type ModulePackageAssetManifest = {
  files: ModulePackageAsset[];
};

export type ModuleParameterPresetRatioParameter = {
  parameterKey: string;
  countParameter: string;
  ratios: number[];
  order?: "bottom-up" | "top-down";
  indexedParameterPrefix?: string;
  indexedParameterSuffix?: string;
};

export type ModuleParameterPreset = {
  presetId: string;
  label: string;
  description?: string;
  note: string;
  tags?: string[];
  sourceLabels?: string[];
  parameterValues: Record<string, unknown>;
  ratioParameters?: ModuleParameterPresetRatioParameter[];
};

export type ModuleParameterPresetSet = {
  freeParameterKeys: string[];
  presets: ModuleParameterPreset[];
};

export type FurnQuoteModulePackage = {
  format: typeof MODULE_PACKAGE_FORMAT;
  packageVersion: number;
  module: ModulePackageMetadata;
  /** Required for newly authored Kitchen packages; absent only on legacy packages awaiting repair. */
  kitchenContract?: KitchenModuleContract;
  parameters: ModuleParameterSchema;
  placement: ModulePlacementRules;
  constraints: ModuleConstraintRules;
  snapping: ModuleSnappingRules;
  geometry: ModuleGeometryDefinition;
  materials: ModuleMaterialSlots;
  components: ModuleComponentSlots;
  behavior?: ModuleBehaviorDefinition;
  internalEditing?: ModuleInternalEditingDefinition;
  bom?: ModuleBomRules;
  pricing?: ModulePricingRules;
  ui: ModuleUiDefinition;
  parameterPresets?: ModuleParameterPresetSet;
  exports?: ModuleExportMetadata;
  manufacturing?: ModuleManufacturingMetadata;
  assets: ModulePackageAssetManifest;
  compatibility: ModuleCompatibility;
  integrity: {
    createdAt: string;
    updatedAt: string;
    packageHash?: string;
    author?: string;
  };
};

export type ModuleInstance = {
  instanceId: string;
  modulePackageId: string;
  moduleType: string;
  packageVersion: string;
  packageHash?: string;
  parameters: Record<string, unknown>;
  placement: {
    context: ModulePlacementContext;
    position: unknown;
    rotation: number;
    anchorRefs?: string[];
  };
  materialAssignments: Record<string, string>;
  componentAssignments: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type ModulePlacementValidationResult = {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  suggestedSnap?: {
    position: unknown;
    rotation: number;
  };
};
