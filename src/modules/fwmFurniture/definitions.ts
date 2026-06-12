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
  kitchenRole?: "base" | "top" | "tall";
  tags: readonly string[];
};

const kitchen = ["kitchen", "system"] as const;
const room = ["room", "system"] as const;

export const FWM_FURNITURE_SPECS = [
  {
    moduleType: "fwm_base_drawer_cabinet",
    displayName: "Spodna skrinka so zasuvkami",
    description: "Lower kitchen cabinet with configurable drawer stack.",
    category: "base_cabinet",
    geometryKind: "base",
    width: 800,
    height: 820,
    depth: 560,
    drawers: 3,
    hasWorktop: true,
    hasPlinth: true,
    placementContexts: ["kitchen_wall", "floor"],
    kitchenRole: "base",
    tags: [...kitchen, "drawer"]
  },
  {
    moduleType: "fwm_base_shelf_cabinet",
    displayName: "Spodna skrinka s policami",
    description: "Lower kitchen cabinet with doors and adjustable shelves.",
    category: "base_cabinet",
    geometryKind: "base",
    width: 800,
    height: 820,
    depth: 560,
    doors: 2,
    shelves: 2,
    hasWorktop: true,
    hasPlinth: true,
    placementContexts: ["kitchen_wall", "floor"],
    kitchenRole: "base",
    tags: [...kitchen, "shelf"]
  },
  {
    moduleType: "fwm_built_in_dishwasher",
    displayName: "Vstavana umyvacka riadu",
    description: "Built-in dishwasher niche with appliance front and neighboring panels.",
    category: "base_cabinet",
    geometryKind: "appliance",
    width: 600,
    height: 820,
    depth: 560,
    hasWorktop: true,
    hasPlinth: true,
    appliance: "dishwasher",
    placementContexts: ["kitchen_wall", "appliance_zone", "floor"],
    kitchenRole: "base",
    tags: [...kitchen, "appliance"]
  },
  {
    moduleType: "fwm_sink_base_module",
    displayName: "Drezovy modul",
    description: "Sink base module with double doors, sink bowl, faucet and service clearance.",
    category: "base_cabinet",
    geometryKind: "sink",
    width: 900,
    height: 820,
    depth: 560,
    doors: 2,
    shelves: 1,
    hasWorktop: true,
    hasPlinth: true,
    placementContexts: ["kitchen_wall", "under_sink", "floor"],
    kitchenRole: "base",
    tags: [...kitchen, "sink"]
  },
  {
    moduleType: "fwm_kitchen_island",
    displayName: "Kuchynsky ostrov",
    description: "Kitchen island with selectable storage structure.",
    category: "base_cabinet",
    geometryKind: "island",
    width: 1800,
    height: 900,
    depth: 900,
    drawers: 3,
    doors: 2,
    shelves: 2,
    hasWorktop: true,
    hasPlinth: true,
    variantOptions: ["drawers", "doors", "open_shelves", "mixed"],
    placementContexts: ["floor", "free_standing"],
    kitchenRole: "base",
    tags: [...kitchen, "island"]
  },
  {
    moduleType: "fwm_corner_base_module_1",
    displayName: "Rohovy spodny modul 1",
    description: "L-shaped lower corner kitchen cabinet.",
    category: "corner_cabinet",
    geometryKind: "corner",
    width: 1000,
    height: 820,
    depth: 1000,
    doors: 2,
    shelves: 1,
    hasWorktop: true,
    hasPlinth: true,
    variantOptions: ["l_shape", "diagonal_front"],
    placementContexts: ["kitchen_corner", "floor"],
    kitchenRole: "base",
    tags: [...kitchen, "corner"]
  },
  {
    moduleType: "fwm_corner_base_module_2",
    displayName: "Rohovy spodny modul 2",
    description: "Blind lower corner kitchen cabinet with service void.",
    category: "corner_cabinet",
    geometryKind: "corner",
    width: 1100,
    height: 820,
    depth: 650,
    doors: 1,
    shelves: 2,
    hasWorktop: true,
    hasPlinth: true,
    variantOptions: ["blind_left", "blind_right", "pull_out"],
    placementContexts: ["kitchen_corner", "floor"],
    kitchenRole: "base",
    tags: [...kitchen, "corner", "blind"]
  },
  {
    moduleType: "fwm_wall_shelf_module",
    displayName: "Horny policovy modul",
    description: "Wall-mounted upper shelf cabinet.",
    category: "wall_cabinet",
    geometryKind: "wall",
    width: 800,
    height: 720,
    depth: 320,
    shelves: 3,
    wallMounted: true,
    placementContexts: ["kitchen_wall", "wall_mounted"],
    kitchenRole: "top",
    tags: [...kitchen, "upper", "shelf"]
  },
  {
    moduleType: "fwm_built_in_fridge",
    displayName: "Vstavana chladnicka",
    description: "Tall built-in fridge cabinet with appliance zone and ventilation gaps.",
    category: "tall_cabinet",
    geometryKind: "tall",
    width: 600,
    height: 2100,
    depth: 600,
    doors: 2,
    shelves: 1,
    appliance: "fridge",
    hasPlinth: true,
    placementContexts: ["kitchen_wall", "appliance_zone", "floor"],
    kitchenRole: "tall",
    tags: [...kitchen, "fridge", "appliance"]
  },
  {
    moduleType: "fwm_oven_tower_module",
    displayName: "Rurovy modul",
    description: "Tall oven module with appliance bay, drawer and upper shelf.",
    category: "tall_cabinet",
    geometryKind: "tall",
    width: 600,
    height: 2100,
    depth: 600,
    drawers: 1,
    doors: 2,
    shelves: 2,
    appliance: "oven",
    hasPlinth: true,
    placementContexts: ["kitchen_wall", "appliance_zone", "floor"],
    kitchenRole: "tall",
    tags: [...kitchen, "oven", "appliance"]
  },
  {
    moduleType: "fwm_microwave_tower_module",
    displayName: "Mikrovlnny modul",
    description: "Tall microwave module with compact appliance bay and cabinet storage.",
    category: "tall_cabinet",
    geometryKind: "tall",
    width: 600,
    height: 2100,
    depth: 560,
    drawers: 1,
    doors: 2,
    shelves: 3,
    appliance: "microwave",
    hasPlinth: true,
    placementContexts: ["kitchen_wall", "appliance_zone", "floor"],
    kitchenRole: "tall",
    tags: [...kitchen, "microwave", "appliance"]
  },
  ...Array.from({ length: 5 }, (_, index) => ({
    moduleType: `fwm_kitchen_special_module_${index + 1}`,
    displayName: `Rezervny kuchynsky modul ${index + 1}`,
    description: "Reserved kitchen or special module with configurable storage.",
    category: "custom" as const,
    geometryKind: "custom" as const,
    width: 700 + index * 50,
    height: 820,
    depth: 560,
    drawers: index % 2 === 0 ? 2 : 0,
    doors: index % 2 === 0 ? 1 : 2,
    shelves: 2,
    hasWorktop: true,
    hasPlinth: true,
    reserve: true,
    variantOptions: ["storage", "appliance_ready", "open_shelf", "special"],
    placementContexts: ["kitchen_wall", "floor"] as ModulePlacementContext[],
    kitchenRole: "base" as const,
    tags: [...kitchen, "reserve"]
  })),
  {
    moduleType: "fwm_variable_wardrobe",
    displayName: "Vstavana skrina variabilna",
    description: "Variable built-in wardrobe with doors, shelves and clothes rail.",
    category: "wardrobe",
    geometryKind: "wardrobe",
    width: 2400,
    height: 2400,
    depth: 650,
    doors: 4,
    shelves: 5,
    variantOptions: ["sliding", "hinged", "open"],
    placementContexts: ["floor", "inside_wardrobe"],
    tags: [...room, "wardrobe"]
  },
  {
    moduleType: "fwm_dresser",
    displayName: "Komoda",
    description: "Dresser with drawers and optional doors.",
    category: "custom",
    geometryKind: "dresser",
    width: 1200,
    height: 900,
    depth: 450,
    drawers: 4,
    doors: 2,
    shelves: 1,
    placementContexts: ["floor", "free_standing"],
    tags: [...room, "dresser"]
  },
  {
    moduleType: "fwm_double_bed",
    displayName: "Manzelska postel",
    description: "Double bed with selectable style variants.",
    category: "bed",
    geometryKind: "bed",
    width: 1800,
    height: 950,
    depth: 2100,
    variantOptions: ["minimal", "upholstered", "storage", "platform"],
    placementContexts: ["floor", "free_standing"],
    tags: [...room, "bed"]
  },
  {
    moduleType: "fwm_single_bed",
    displayName: "Jednolozkova postel",
    description: "Single bed with selectable style variants.",
    category: "bed",
    geometryKind: "bed",
    width: 900,
    height: 850,
    depth: 2050,
    variantOptions: ["minimal", "upholstered", "storage", "platform"],
    placementContexts: ["floor", "free_standing"],
    tags: [...room, "bed"]
  },
  {
    moduleType: "fwm_vanity_table",
    displayName: "Toaletny stolik",
    description: "Vanity table with drawers, mirror and shelf.",
    category: "table",
    geometryKind: "vanity",
    width: 1100,
    height: 1450,
    depth: 450,
    drawers: 2,
    shelves: 1,
    placementContexts: ["floor", "free_standing"],
    tags: [...room, "vanity"]
  },
  {
    moduleType: "fwm_nightstand",
    displayName: "Nocny stolik",
    description: "Compact nightstand with drawer and shelf.",
    category: "custom",
    geometryKind: "nightstand",
    width: 500,
    height: 550,
    depth: 400,
    drawers: 1,
    shelves: 1,
    placementContexts: ["floor", "free_standing"],
    tags: [...room, "nightstand"]
  },
  {
    moduleType: "fwm_living_wall",
    displayName: "Obyvacia stena",
    description: "Living room wall unit with base cabinets, wall shelves and media zone.",
    category: "wall_unit",
    geometryKind: "wall_unit",
    width: 3000,
    height: 2100,
    depth: 450,
    drawers: 3,
    doors: 4,
    shelves: 6,
    placementContexts: ["floor", "wall_mounted"],
    tags: [...room, "living"]
  },
  {
    moduleType: "fwm_glass_display_cabinet",
    displayName: "Vitrina",
    description: "Display cabinet with glass fronts and shelves.",
    category: "custom",
    geometryKind: "display",
    width: 900,
    height: 1900,
    depth: 400,
    doors: 2,
    shelves: 5,
    glassFronts: true,
    placementContexts: ["floor", "free_standing"],
    tags: [...room, "display"]
  },
  {
    moduleType: "fwm_coffee_table",
    displayName: "Konferencny stolik",
    description: "Coffee table with optional lower shelf.",
    category: "table",
    geometryKind: "table",
    width: 1100,
    height: 420,
    depth: 650,
    shelves: 1,
    placementContexts: ["floor", "free_standing"],
    tags: [...room, "table"]
  },
  {
    moduleType: "fwm_dining_table",
    displayName: "Jedalensky stol",
    description: "Dining table with configurable length and top material.",
    category: "table",
    geometryKind: "table",
    width: 1800,
    height: 760,
    depth: 900,
    placementContexts: ["floor", "free_standing"],
    tags: [...room, "table"]
  },
  {
    moduleType: "fwm_bathroom_set",
    displayName: "Kupelnova zostava",
    description: "Bathroom vanity set with basin, drawers and wall mirror.",
    category: "custom",
    geometryKind: "bathroom",
    width: 1200,
    height: 1900,
    depth: 480,
    drawers: 2,
    doors: 2,
    shelves: 2,
    hasWorktop: true,
    placementContexts: ["floor", "wall_mounted"],
    tags: [...room, "bathroom"]
  },
  ...Array.from({ length: 5 }, (_, index) => ({
    moduleType: `fwm_interior_cladding_${index + 1}`,
    displayName: `Interierovy obklad ${index + 1}`,
    description: "Interior wall cladding panel variant.",
    category: "custom" as const,
    geometryKind: "cladding" as const,
    width: 1200,
    height: 2400,
    depth: 18,
    variantOptions: ["vertical_slats", "flat_panels", "ribbed", "acoustic", "tile_grid"],
    placementContexts: ["wall_mounted", "custom"] as ModulePlacementContext[],
    tags: [...room, "cladding", `variant-${index + 1}`]
  })),
  {
    moduleType: "fwm_reception_counter",
    displayName: "Recepcny pult",
    description: "Reception counter with worktop, front cladding and storage.",
    category: "custom",
    geometryKind: "counter",
    width: 2200,
    height: 1100,
    depth: 750,
    drawers: 2,
    doors: 2,
    shelves: 2,
    hasWorktop: true,
    placementContexts: ["floor", "free_standing"],
    tags: [...room, "reception"]
  },
  {
    moduleType: "fwm_office_set",
    displayName: "Kancelarska zostava",
    description: "Office workstation with desk, cabinet and upper storage.",
    category: "custom",
    geometryKind: "office",
    width: 2600,
    height: 2100,
    depth: 700,
    drawers: 3,
    doors: 2,
    shelves: 4,
    placementContexts: ["floor", "wall_mounted"],
    tags: [...room, "office"]
  },
  ...Array.from({ length: 10 }, (_, index) => ({
    moduleType: `fwm_room_special_module_${index + 1}`,
    displayName: `Rezervny modul miestnosti ${index + 1}`,
    description: "Reserved furniture module for additional rooms.",
    category: "custom" as const,
    geometryKind: "custom" as const,
    width: 800 + index * 80,
    height: index % 3 === 0 ? 1800 : 900,
    depth: index % 2 === 0 ? 450 : 600,
    drawers: index % 2 === 0 ? 2 : 0,
    doors: index % 2 === 0 ? 0 : 2,
    shelves: 2 + (index % 3),
    reserve: true,
    variantOptions: ["storage", "display", "work", "special"],
    placementContexts: ["floor", "free_standing"] as ModulePlacementContext[],
    tags: [...room, "reserve"]
  }))
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
  if (spec.kitchenRole === "base") return "base";
  if (spec.kitchenRole === "top") return "wall";
  if (spec.kitchenRole === "tall") return "tall";
  return spec.geometryKind;
}
