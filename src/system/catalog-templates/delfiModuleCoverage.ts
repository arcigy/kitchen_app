export type DelfiCatalogCoverageKind =
  | "module-family"
  | "component-family"
  | "surface-family"
  | "accessory-family";

export type DelfiCatalogCoverage = {
  id: string;
  kind: DelfiCatalogCoverageKind;
  displayName: string;
  pdfPages: string;
  catalogSections: readonly string[];
  catalogNamePatterns: readonly string[];
  targetModuleType: string;
  requiredParameters: readonly string[];
  notes: string;
};

export const DELFI_CATALOG_SOURCE = {
  name: "Katalog prvku Delfi 2023",
  fileName: "Katalog_prvku_Delfi_2023.pdf",
  pageCount: 44,
  extractionMode: "visual-page-audit"
} as const;

export const DELFI_CATALOG_COVERAGE = [
  {
    id: "base_corner",
    kind: "module-family",
    displayName: "Spodne rohove skrinky",
    pdfPages: "1, 8",
    catalogSections: ["Spodni rohove"],
    catalogNamePatterns: ["Spod. roh. 1D", "Spod. roh. 1D 1P", "Spod. roh. 90", "Spod. roh. 90 1P", "Spod. roh. Zkos.", "Spod. roh. Zkos. 1P", "Spod. Zvys. roh.*"],
    targetModuleType: "base_corner",
    requiredParameters: ["width", "depth", "height", "rowHeight", "cornerShape", "frontSide", "doorCount", "side", "hasWorktop", "hasPlinth"],
    notes: "All left/right, 722/768 height and diagonal/blind corner variants should be one parametric corner base family."
  },
  {
    id: "base_doors",
    kind: "module-family",
    displayName: "Spodne skrinky s dvierkami",
    pdfPages: "1, 4, 8, 12",
    catalogSections: ["Spodni s dvirky", "Spodni Zvys. s dvirky"],
    catalogNamePatterns: ["Spod. 1D", "Spod. 2D", "Spod. 1D, zakoncovaci L/P", "Spod. 2D, zakoncovaci L/P", "Spod. Zvys. 1D", "Spod. Zvys. 2D"],
    targetModuleType: "base_doors",
    requiredParameters: ["width", "height", "depth", "rowHeight", "doorCount", "endingSide", "shelfCount", "frontMaterialGroup", "carcassMaterialGroup"],
    notes: "Width and ending L/P are parameters. This replaces many SR/S2ZP catalog references."
  },
  {
    id: "base_drawers",
    kind: "module-family",
    displayName: "Spodne zasuvkove skrinky",
    pdfPages: "2, 3, 9, 10",
    catalogSections: ["Spodni se zasuvkami", "Spodni Zvys. se zasuvkami"],
    catalogNamePatterns: ["Spod. 1K *", "Spod. 2K *", "Spod. 3K", "Spod. 5Z", "Spod. 1K 1Z", "Spod. 2K 1Z", "Spod. 1K 3Z", "Spod. 1K 2Z", "*zakonc. L/P"],
    targetModuleType: "base_drawers",
    requiredParameters: ["width", "height", "depth", "rowHeight", "drawerStack", "frontSplit", "endingSide", "handleMode", "frontMaterialGroup", "carcassMaterialGroup"],
    notes: "Drawer count and front split must drive geometry parametrically. Catalog variants are not separate modules."
  },
  {
    id: "base_sink",
    kind: "module-family",
    displayName: "Spodne drezove skrinky",
    pdfPages: "4, 11, 12",
    catalogSections: ["Spodni drezove", "Spodni Zvys. drezove"],
    catalogNamePatterns: ["Spod. drez 1K", "Spod. drez 2K", "Spod. drez 1D", "Spod. drez 2D", "Spod. drez 1K 1Z", "Spod. drez 2K 1Z", "*zakonc. L/P"],
    targetModuleType: "base_sink",
    requiredParameters: ["width", "height", "depth", "sinkMode", "doorCount", "drawerStack", "endingSide", "hasWorktopCutout"],
    notes: "Sink cabinet must share base carcass logic but has sink/service cutout and restricted internal shelves."
  },
  {
    id: "base_appliance",
    kind: "module-family",
    displayName: "Spodne skrinky pre varenie a vstavane spotrebice",
    pdfPages: "4, 5, 6, 12, 13",
    catalogSections: ["Spodni pro vestavne spotrebice"],
    catalogNamePatterns: ["Spod. pro vareni 1D", "Spod. pro vareni 2D", "Spod. pro vareni 2K", "Spod. pro vareni 1K 2Z", "Spod. pro vareni 1K 3Z", "Spod. pro vareni 2K 1Z", "*zak. L/P"],
    targetModuleType: "base_appliance",
    requiredParameters: ["width", "height", "depth", "applianceKind", "applianceOpeningWidth", "drawerStack", "doorCount", "endingSide", "ventilation"],
    notes: "Use a dedicated base appliance family before assigning exact appliance presets."
  },
  {
    id: "base_open_end",
    kind: "module-family",
    displayName: "Spodne otvorene a koncove niky",
    pdfPages: "6, 13",
    catalogSections: ["Spodni otevrene a koncove"],
    catalogNamePatterns: ["Nika", "Nika zakoncovaci L/P", "Spod. konc. obla", "Spod. konc. Zkos.", "Spod. Zvys. konc.*"],
    targetModuleType: "base_open_end",
    requiredParameters: ["width", "height", "depth", "shape", "endingSide", "shelfCount", "openFront", "radiusOrChamfer"],
    notes: "Open/end modules are their own parametric family because they can be curved, chamfered, or shelf-only."
  },
  {
    id: "tall_cabinet",
    kind: "module-family",
    displayName: "Vysoke skrine",
    pdfPages: "14-22",
    catalogSections: ["Skrine v. 1480 mm", "Skrine v. 2080 mm", "Skrine v. 2230 mm", "Skrine v. 2380 mm", "Skrine v. 2530 mm", "Skrine v. 2680 mm"],
    catalogNamePatterns: ["1/2 Skrin. 1D lednice", "Skrin Sniz. 2D lednice", "Skrin trouba*", "Skrin 2D 1DVyki*", "Skrin BD", "Skrin Zvys. BD"],
    targetModuleType: "tall_cabinet",
    requiredParameters: ["width", "height", "depth", "tallHeightPreset", "applianceSlots", "doorStack", "drawerStack", "shelfCount", "ventilation", "plinthHeight"],
    notes: "One tall family must support fridge, oven, microwave, storage and broom/BD presets through slot layout parameters."
  },
  {
    id: "wall_cabinet",
    kind: "module-family",
    displayName: "Horne skrinky",
    pdfPages: "22-27",
    catalogSections: ["Horni v. 300 mm", "Horni v. 450 mm", "Horni v. 600 mm", "Horni v. 750 mm", "Horni v. 900 mm"],
    catalogNamePatterns: ["Hor. 1D", "Hor. 2D", "Hor. 1DAL", "Hor. 2DAL", "Hor. 1DVyki*", "Hor. roh. 90 1D*", "Nika", "Nika Zvys.", "Hor. konc. obla", "Hor. konc. Zkos."],
    targetModuleType: "wall_cabinet",
    requiredParameters: ["width", "height", "depth", "wallHeightPreset", "doorCount", "frontType", "openingMode", "cornerShape", "endingSide", "shelfCount"],
    notes: "Wall cabinets cover hinged, glass/AL, lift-up, corner and open-niche variants."
  },
  {
    id: "wall_open_end",
    kind: "module-family",
    displayName: "Horne koncove otvorene skrinky",
    pdfPages: "22-27",
    catalogSections: ["Horni v. 300 mm", "Horni koncove"],
    catalogNamePatterns: ["Hor. konc. Zkos. Sniz.", "Hor. konc. obla Sniz."],
    targetModuleType: "wall_open_end",
    requiredParameters: ["width", "height", "depth", "side", "endingShape", "cornerRadiusMm", "chamferMm", "shelfCount", "bodyMaterialGroup", "backMaterialGroup"],
    notes: "One upper open end family covers chamfered and rounded reduced-height ending modules. The shape is a parameter, not a separate runtime module."
  },
  {
    id: "suspended_unit",
    kind: "module-family",
    displayName: "Podvesne prvky",
    pdfPages: "27, 28",
    catalogSections: ["Podvesne prvky"],
    catalogNamePatterns: ["Podves. zasuvka 3Z dekor.", "Podves. zasuvka 4Z dekor.", "Podves. zasuvka 2Z dekor.", "Hor. PZ01", "Hor. PZ02", "PZ03", "PZ04", "PZ1", "PZ2"],
    targetModuleType: "suspended_unit",
    requiredParameters: ["width", "height", "depth", "drawerCount", "openShelfCount", "mountingMode", "decorFront"],
    notes: "Suspended low-height drawer/shelf blocks should not be mixed with standard upper cabinets."
  },
  {
    id: "worktop_surface",
    kind: "surface-family",
    displayName: "Pracovne dosky a pridavne stoly",
    pdfPages: "28, 29",
    catalogSections: ["Pracovni desky tl.38"],
    catalogNamePatterns: ["Prac. deska roh.", "Prac. deska podium", "Stul pridavny*", "Vyrez PD", "Zkoseni, zakul. prac.desky"],
    targetModuleType: "worktop_surface",
    requiredParameters: ["width", "depth", "thickness", "shape", "cornerRadius", "chamfer", "cutoutShape", "materialGroup"],
    notes: "These are surface modules/worktop accessories, not cabinet carcasses."
  },
  {
    id: "worktop_accessory",
    kind: "accessory-family",
    displayName: "Prislusenstvi pracovnych dosiek",
    pdfPages: "30",
    catalogSections: ["Prislusenstvi PD"],
    catalogNamePatterns: ["Vnitrni roh 90*", "Vnejsi roh 90*", "Vnitrni roh 135*", "Tesnici lista PD*", "Koncovka leva/prava*"],
    targetModuleType: "worktop_accessory",
    requiredParameters: ["accessoryKind", "length", "angle", "materialVendor", "materialGroup"],
    notes: "Accessory/catalog price items tied to worktop system."
  },
  {
    id: "cladding_panel",
    kind: "surface-family",
    displayName: "Obkladove panely",
    pdfPages: "30, 31",
    catalogSections: ["Obkladove panely"],
    catalogNamePatterns: ["Pan.dekor.*", "PanPD*", "PANS*", "PANV*"],
    targetModuleType: "cladding_panel",
    requiredParameters: ["width", "height", "thickness", "orientation", "vendorMaterial", "mountingMode"],
    notes: "Flat wall/panel surfaces with material and orientation variants."
  },
  {
    id: "free_shelf",
    kind: "surface-family",
    displayName: "Volne police",
    pdfPages: "32, 33, 39-42",
    catalogSections: ["Volne police", "@cela-komponenty"],
    catalogNamePatterns: ["POLICE_*", "POL*", "1P", "2P", "3P", "*skl.", "*sklen."],
    targetModuleType: "free_shelf",
    requiredParameters: ["width", "depth", "thickness", "shape", "shelfCount", "materialGroup", "glass"],
    notes: "Standalone shelves include laminate/glass and shaped corner variants."
  },
  {
    id: "trim_component",
    kind: "component-family",
    displayName: "Sokle, krycie boky a vymedzovacie listy",
    pdfPages: "7, 14, 18, 22, 27, 33, 42, 44",
    catalogSections: ["Vymezovaci listy", "Sokly", "@cela-komponenty"],
    catalogNamePatterns: ["DOM*", "KB*", "SOKL100", "DORM*", "FIBC", "ZL", "ZP"],
    targetModuleType: "trim_component",
    requiredParameters: ["length", "height", "thickness", "targetFamily", "side", "shape", "materialGroup"],
    notes: "Trim/filler parts must be available as components and as generated parts inside cabinets."
  },
  {
    id: "lighting_accessory",
    kind: "accessory-family",
    displayName: "Osvetlenie",
    pdfPages: "34, 41",
    catalogSections: ["Osvetleni", "@cela-komponenty"],
    catalogNamePatterns: ["SADA1", "SADA2", "SADA3", "SADA4", "SADA5", "SADA6", "Bodove svitidlo", "Lumina 8 W", "Lumina 13"],
    targetModuleType: "lighting_accessory",
    requiredParameters: ["lightType", "width", "depth", "height", "power", "mountingMode", "catalogCode"],
    notes: "Accessory items with optional 3D placeholder geometry."
  },
  {
    id: "front_component",
    kind: "component-family",
    displayName: "Cela a front komponenty",
    pdfPages: "36-40",
    catalogSections: ["@cela-komponenty"],
    catalogNamePatterns: ["Celo 1K", "Celo 1C profilovane", "Celo 1KSk", "Celo spod. 1D", "Celo hor. 1D", "Celo hor. 2D", "Celo hor. 1DVyki*", "Celo hor. 1DSkl*", "Celo skr. 1D", "Spod. roh.", "Spod. Zvys. roh."],
    targetModuleType: "front_component",
    requiredParameters: ["width", "height", "thickness", "frontKind", "materialGroup", "glass", "aluminumFrame", "openingMode", "parentCabinetFamily"],
    notes: "Fronts are reusable components consumed by base/wall/tall modules; they should not become standalone customer modules except for component editing."
  },
  {
    id: "hardware_accessory",
    kind: "accessory-family",
    displayName: "Doplnky a kovanie",
    pdfPages: "34, 35, 43, 44",
    catalogSections: ["Doplnky", "@cela-komponenty"],
    catalogNamePatterns: ["Noha kuzelova", "Sloupek rustik. dver.", "Vysuvny rost", "Vetraci mrizka", "Digestor motif*", "2 drat. kose", "4 drat. kose", "DOS*", "RV", "RVN", "ZKL", "ZKP"],
    targetModuleType: "hardware_accessory",
    requiredParameters: ["accessoryKind", "width", "height", "depth", "mountingMode", "catalogCode"],
    notes: "Includes legs, baskets, ventilation, cooker hood motifs and miscellaneous panel/accessory items."
  }
] as const satisfies readonly DelfiCatalogCoverage[];

export const DELFI_CATALOG_COVERAGE_IDS = DELFI_CATALOG_COVERAGE.map((entry) => entry.id);
