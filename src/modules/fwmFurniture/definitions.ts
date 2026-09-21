import type { ModulePackageCategory, ModulePlacementContext } from "../../core/module-package/module-package-types";

export type FwmFurnitureGeometryKind =
  | "base"
  | "appliance"
  | "sink"
  | "island"
  | "corner"
  | "wall"
  | "tall"
  | "wardrobe"
  | "dresser"
  | "bed"
  | "table"
  | "vanity"
  | "nightstand"
  | "wall_unit"
  | "display"
  | "bathroom"
  | "cladding"
  | "worktop"
  | "shelf_surface"
  | "trim"
  | "front_component"
  | "accessory"
  | "open_end"
  | "counter"
  | "office"
  | "custom";

export type FwmFurnitureSpec = {
  moduleType: string;
  displayName: string;
  description: string;
  category: ModulePackageCategory;
  geometryKind: FwmFurnitureGeometryKind;
  width: number;
  height: number;
  depth: number;
  drawers?: number;
  doors?: number;
  shelves?: number;
  hasWorktop?: boolean;
  hasPlinth?: boolean;
  wallMounted?: boolean;
  glassFronts?: boolean;
  appliance?: "dishwasher" | "fridge" | "oven" | "microwave";
  reserve?: boolean;
  variantOptions?: readonly string[];
  placementContexts: ModulePlacementContext[];
  kitchenRole?: "low" | "top" | "tall";
  tags: readonly string[];
};

const vendorCatalog = ["kitchen", "catalog", "vendor"] as const;

export const FWM_FURNITURE_SPECS = [
  {
    moduleType: "fwm_catalog_base_corner",
    displayName: "Spodna rohova skrinka",
    description: "Lower catalog corner cabinet covering blind 1D, 90-degree and chamfered variants with fixed corner placement, plinth, hardware and optional internal shelves.",
    category: "corner_cabinet",
    geometryKind: "corner",
    width: 900,
    height: 722,
    depth: 900,
    doors: 1,
    shelves: 0,
    hasWorktop: false,
    hasPlinth: true,
    variantOptions: ["corner_1d", "corner_1d_1p", "corner_90", "corner_90_1p", "corner_chamfered", "corner_chamfered_1p", "raised_corner"],
    placementContexts: ["kitchen_corner", "floor"],
    kitchenRole: "low",
    tags: [...vendorCatalog, "base", "corner"]
  },
  {
    moduleType: "fwm_catalog_base_doors",
    displayName: "Katalogova spodna skrinka s dvierkami",
    description: "Lower catalog door cabinet covering 1D, 2D and left/right ending variants.",
    category: "base_cabinet",
    geometryKind: "base",
    width: 600,
    height: 722,
    depth: 530,
    doors: 1,
    shelves: 1,
    hasWorktop: true,
    hasPlinth: true,
    variantOptions: ["1d", "2d", "ending_left_1d", "ending_right_1d", "ending_left_2d", "ending_right_2d", "raised_1d", "raised_2d"],
    placementContexts: ["kitchen_wall", "floor"],
    kitchenRole: "low",
    tags: [...vendorCatalog, "base", "door"]
  },
  {
    moduleType: "fwm_catalog_base_drawers",
    displayName: "Katalogova spodna zasuvkova skrinka",
    description: "Lower catalog drawer cabinet covering drawer stack and mixed drawer/door variants.",
    category: "base_cabinet",
    geometryKind: "base",
    width: 600,
    height: 722,
    depth: 530,
    drawers: 3,
    doors: 0,
    shelves: 0,
    hasWorktop: true,
    hasPlinth: true,
    variantOptions: ["1k", "2k", "3k", "5z", "1k_1z", "2k_1z", "1k_2z", "1k_3z", "ending_left", "ending_right", "raised"],
    placementContexts: ["kitchen_wall", "floor"],
    kitchenRole: "low",
    tags: [...vendorCatalog, "base", "drawer"]
  },
  {
    moduleType: "base_bottle_pullout",
    displayName: "Spodni flasovy vysuv",
    description: "Narrow lower bottle and oil pull-out cabinet with two internal drawer trays connected to one full-height front.",
    category: "base_cabinet",
    geometryKind: "base",
    width: 200,
    height: 722,
    depth: 530,
    drawers: 2,
    doors: 0,
    shelves: 0,
    hasWorktop: true,
    hasPlinth: true,
    variantOptions: ["two_tier_single_front"],
    placementContexts: ["kitchen_wall", "floor"],
    kitchenRole: "low",
    tags: [...vendorCatalog, "base", "drawer", "bottle_pullout", "narrow"]
  },
  {
    moduleType: "fwm_catalog_base_open_end",
    displayName: "Spodni otevrena / koncova nika",
    description: "Catalog open and ending lower cabinet with straight, round or chamfered side.",
    category: "base_cabinet",
    geometryKind: "open_end",
    width: 300,
    height: 722,
    depth: 530,
    shelves: 2,
    hasWorktop: true,
    hasPlinth: true,
    variantOptions: ["open_niche", "ending_left", "ending_right", "rounded_end", "chamfered_end", "raised_open_niche", "raised_end"],
    placementContexts: ["kitchen_wall", "floor"],
    kitchenRole: "low",
    tags: [...vendorCatalog, "base", "open", "ending"]
  },
  {
    moduleType: "fwm_tall_open_end",
    displayName: "Vysoka otevrena / koncova nika",
    description: "Tall open shelf cabinet with straight, round or chamfered ending side.",
    category: "tall_cabinet",
    geometryKind: "open_end",
    width: 300,
    height: 1480,
    depth: 560,
    shelves: 4,
    hasPlinth: true,
    variantOptions: ["open_niche", "ending_left", "ending_right", "rounded_end", "chamfered_end"],
    placementContexts: ["kitchen_wall", "floor"],
    kitchenRole: "tall",
    tags: [...vendorCatalog, "tall", "open", "ending", "shelf"]
  },
  {
    moduleType: "fwm_catalog_tall_cabinet",
    displayName: "Katalogova vysoka skrina",
    description: "Catalog tall cabinet family covering storage, fridge, oven, microwave and broom cabinet presets.",
    category: "tall_cabinet",
    geometryKind: "tall",
    width: 600,
    height: 2230,
    depth: 560,
    doors: 2,
    drawers: 1,
    shelves: 3,
    hasPlinth: true,
    variantOptions: ["storage", "fridge", "oven", "microwave", "oven_microwave", "oven_microwave_builder", "broom_bd", "raised_storage", "low_1480", "tall_2080", "tall_2230", "tall_2380", "tall_2530", "tall_2680"],
    placementContexts: ["kitchen_wall", "appliance_zone", "floor"],
    kitchenRole: "tall",
    tags: [...vendorCatalog, "tall", "appliance", "storage"]
  },
  {
    moduleType: "fwm_catalog_wall_cabinet",
    displayName: "Katalogova horna skrinka",
    description: "Catalog wall cabinet covering hinged, glass, aluminium, lift-up, corner and open niche variants.",
    category: "wall_cabinet",
    geometryKind: "wall",
    width: 600,
    height: 720,
    depth: 330,
    doors: 1,
    shelves: 2,
    wallMounted: true,
    glassFronts: false,
    variantOptions: ["height_300_1d", "height_450_1d", "height_600_1d", "height_750_1d", "height_900_1d", "2d", "al_glass", "lift_up", "corner_90", "corner_90_1p", "corner_chamfered", "corner_chamfered_1p", "corner_open_chamfered", "open_niche", "rounded_end", "chamfered_end"],
    placementContexts: ["kitchen_wall", "wall_mounted"],
    kitchenRole: "top",
    tags: [...vendorCatalog, "wall", "upper"]
  },
  {
    moduleType: "fwm_catalog_wall_open_end",
    displayName: "Horny koncovy otvoreny modul",
    description: "Catalog wall-mounted open end cabinet for upper reduced-height runs with selectable chamfered or rounded ending side.",
    category: "wall_cabinet",
    geometryKind: "wall",
    width: 300,
    height: 300,
    depth: 330,
    doors: 0,
    shelves: 0,
    wallMounted: true,
    variantOptions: ["chamfered_end", "rounded_end"],
    placementContexts: ["kitchen_wall", "wall_mounted"],
    kitchenRole: "top",
    tags: [...vendorCatalog, "wall", "upper", "open", "ending"]
  }
] as const satisfies readonly FwmFurnitureSpec[];

export type FwmFurnitureModuleType = (typeof FWM_FURNITURE_SPECS)[number]["moduleType"];

export const FWM_FURNITURE_MODULE_TYPES = FWM_FURNITURE_SPECS.map((spec) => spec.moduleType) as FwmFurnitureModuleType[];

export const FWM_FURNITURE_SPEC_BY_TYPE = new Map<string, FwmFurnitureSpec>(
  FWM_FURNITURE_SPECS.map((spec) => [spec.moduleType, spec])
);

export function getFwmFurnitureSpec(type: string): FwmFurnitureSpec {
  const spec = FWM_FURNITURE_SPEC_BY_TYPE.get(type);
  if (!spec) throw new Error(`Unknown FWM furniture module type: ${type}`);
  return spec;
}

export function getFwmRuntimeBuilderKey(type: string): string {
  return `${type}.v1`;
}

export function getFwmAssemblyContext(spec: FwmFurnitureSpec): "kitchen" | "generic" | "wardrobe" | "bathroom" | "laundry" {
  if (spec.tags.includes("kitchen")) return "kitchen";
  if (spec.geometryKind === "wardrobe") return "wardrobe";
  if (spec.geometryKind === "bathroom") return "bathroom";
  return "generic";
}

export function getFwmRoomCategory(spec: FwmFurnitureSpec): string {
  if (spec.tags.includes("kitchen")) return "kitchen";
  if (spec.tags.includes("living")) return "living";
  if (spec.tags.includes("office")) return "office";
  if (spec.tags.includes("bathroom")) return "bathroom";
  if (spec.tags.includes("wardrobe")) return "wardrobe";
  if (spec.tags.includes("reception")) return "reception";
  if (spec.tags.includes("cladding")) return "interior_cladding";
  return "room";
}

export function getFwmSystemFamily(spec: FwmFurnitureSpec): string {
  if (spec.kitchenRole === "low") return "base";
  if (spec.kitchenRole === "top") return "wall";
  if (spec.kitchenRole === "tall") return "tall";
  return spec.geometryKind;
}
