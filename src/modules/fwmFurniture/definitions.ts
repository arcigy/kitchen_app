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

const kitchen = ["kitchen", "system"] as const;
const vendorCatalog = ["kitchen", "catalog", "vendor"] as const;
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
    kitchenRole: "low",
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
    kitchenRole: "low",
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
    kitchenRole: "low",
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
    kitchenRole: "low",
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
    kitchenRole: "low",
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
    kitchenRole: "low",
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
    kitchenRole: "low",
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
    kitchenRole: "low" as const,
    tags: [...kitchen, "reserve"]
  })),
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
    moduleType: "fwm_catalog_base_sink",
    displayName: "Katalogova spodna drezova skrinka",
    description: "Catalog sink base cabinet covering door and drawer front variants.",
    category: "base_cabinet",
    geometryKind: "sink",
    width: 800,
    height: 722,
    depth: 530,
    doors: 2,
    shelves: 0,
    hasWorktop: true,
    hasPlinth: true,
    variantOptions: ["sink_1k", "sink_2k", "sink_1d", "sink_2d", "sink_1k_1z", "sink_2k_1z", "ending_left", "ending_right", "raised"],
    placementContexts: ["kitchen_wall", "under_sink", "floor"],
    kitchenRole: "low",
    tags: [...vendorCatalog, "base", "sink"]
  },
  {
    moduleType: "fwm_catalog_base_appliance",
    displayName: "Katalogova spodna skrinka pre spotrebic",
    description: "Catalog base cabinet for cooking and built-in appliance layouts.",
    category: "base_cabinet",
    geometryKind: "appliance",
    width: 600,
    height: 722,
    depth: 530,
    drawers: 1,
    doors: 1,
    shelves: 0,
    hasWorktop: true,
    hasPlinth: true,
    variantOptions: ["cooking_1d", "cooking_2d", "cooking_2k", "cooking_1k_2z", "cooking_1k_3z", "cooking_2k_1z", "ending_left", "ending_right", "raised"],
    placementContexts: ["kitchen_wall", "appliance_zone", "floor"],
    kitchenRole: "low",
    tags: [...vendorCatalog, "base", "appliance"]
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
  },
  {
    moduleType: "fwm_catalog_suspended_unit",
    displayName: "Katalogovy podvesny prvok",
    description: "Catalog suspended drawer and shallow shelf blocks.",
    category: "wall_cabinet",
    geometryKind: "wall",
    width: 600,
    height: 320,
    depth: 140,
    drawers: 2,
    shelves: 1,
    wallMounted: true,
    variantOptions: ["drawer_2z", "drawer_3z", "drawer_4z", "open_pz01", "open_pz02", "open_pz03", "open_pz04"],
    placementContexts: ["kitchen_wall", "wall_mounted"],
    kitchenRole: "top",
    tags: [...vendorCatalog, "suspended", "drawer"]
  },
  {
    moduleType: "fwm_catalog_worktop_surface",
    displayName: "Katalogova pracovna doska",
    description: "Catalog worktop and add-on table surface shapes.",
    category: "table",
    geometryKind: "worktop",
    width: 1000,
    height: 38,
    depth: 600,
    hasWorktop: true,
    variantOptions: ["straight", "corner", "podium", "round", "octagonal", "chamfered_left", "chamfered_right", "half_round", "special_shape", "cutout_rectangle", "cutout_round"],
    placementContexts: ["kitchen_wall", "floor", "custom"],
    tags: [...vendorCatalog, "worktop", "surface"]
  },
  {
    moduleType: "fwm_catalog_worktop_accessory",
    displayName: "Katalogove prislusenstvo pracovnej dosky",
    description: "Catalog worktop edge strips, corner connectors and end caps.",
    category: "custom",
    geometryKind: "accessory",
    width: 4100,
    height: 25,
    depth: 25,
    variantOptions: ["inside_corner_90", "outside_corner_90", "inside_corner_135", "sealing_strip", "left_end_cap", "right_end_cap"],
    placementContexts: ["custom"],
    tags: [...vendorCatalog, "worktop", "accessory"]
  },
  {
    moduleType: "fwm_catalog_cladding_panel",
    displayName: "Katalogovy obkladovy panel",
    description: "Catalog decorative wall and cladding panels.",
    category: "custom",
    geometryKind: "cladding",
    width: 4100,
    height: 640,
    depth: 10,
    variantOptions: ["waterproof", "kronospan", "egger", "template", "lamino", "vertical"],
    placementContexts: ["wall_mounted", "custom"],
    tags: [...vendorCatalog, "cladding", "panel"]
  },
  {
    moduleType: "fwm_catalog_free_shelf",
    displayName: "Katalogova volna polica",
    description: "Catalog laminate and glass free shelf shapes.",
    category: "shelf",
    geometryKind: "shelf_surface",
    width: 600,
    height: 18,
    depth: 300,
    shelves: 1,
    glassFronts: false,
    variantOptions: ["straight", "glass", "corner_lower", "corner_upper", "notched", "chamfered", "rounded", "two_shelves", "three_shelves"],
    placementContexts: ["wall_mounted", "custom"],
    tags: [...vendorCatalog, "shelf", "surface"]
  },
  {
    moduleType: "fwm_catalog_trim_component",
    displayName: "Katalogovy sokel a vyplnova lista",
    description: "Catalog sokles, filler strips, cover sides and trim panels.",
    category: "custom",
    geometryKind: "trim",
    width: 600,
    height: 100,
    depth: 18,
    variantOptions: ["plinth", "base_filler", "wall_filler", "tall_filler", "cover_side", "left_panel", "right_panel", "angled_filler"],
    placementContexts: ["kitchen_wall", "wall_mounted", "custom"],
    tags: [...vendorCatalog, "trim", "plinth", "filler"]
  },
  {
    moduleType: "fwm_catalog_lighting_accessory",
    displayName: "Katalogove osvetlenie",
    description: "Catalog lighting sets, point lights and LED strip placeholders.",
    category: "custom",
    geometryKind: "accessory",
    width: 600,
    height: 18,
    depth: 40,
    variantOptions: ["sada1", "sada2", "sada3", "sada4", "sada5", "sada6", "point_light", "lumina_8w", "lumina_13w", "light_panel"],
    placementContexts: ["wall_mounted", "custom"],
    tags: [...vendorCatalog, "lighting", "accessory"]
  },
  {
    moduleType: "fwm_catalog_front_component",
    displayName: "Katalogove celo / front",
    description: "Catalog reusable front component family for lower, upper, tall, corner, glass and aluminium fronts.",
    category: "custom",
    geometryKind: "front_component",
    width: 450,
    height: 722,
    depth: 20,
    glassFronts: false,
    variantOptions: ["base_1d", "base_2d", "drawer_front", "corner_front", "wall_1d", "wall_2d", "wall_lift", "glass", "aluminium_frame", "tall_front", "profiled"],
    placementContexts: ["custom"],
    tags: [...vendorCatalog, "front", "component"]
  },
  {
    moduleType: "fwm_catalog_hardware_accessory",
    displayName: "Katalogovy doplnok / kovanie",
    description: "Catalog loose accessories including legs, baskets, ventilation grilles, hood motifs and rustic posts.",
    category: "custom",
    geometryKind: "accessory",
    width: 380,
    height: 100,
    depth: 300,
    variantOptions: ["conical_leg", "wire_basket_2", "wire_basket_4", "vent_grille", "hood_motif_flat", "hood_motif_chamfered", "rustic_post", "generic_accessory"],
    placementContexts: ["custom"],
    tags: [...vendorCatalog, "hardware", "accessory"]
  },
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
  if (spec.kitchenRole === "low") return "base";
  if (spec.kitchenRole === "top") return "wall";
  if (spec.kitchenRole === "tall") return "tall";
  return spec.geometryKind;
}
