const PAGE_243_IMAGE = "output/debug/side_cabinets/page_243.png";
const PAGE_244_IMAGE = "output/debug/side_cabinets/page_244.png";
const PAGE_245_IMAGE = "output/debug/side_cabinets/page_245.png";

function priceGroups(values: [number, number, number, number, number, number]) {
  return {
    "0": values[0],
    "1": values[1],
    "2": values[2],
    "3": values[3],
    "4": values[4],
    "5": values[5]
  };
}

function catalogRow(args: {
  articleCode: string;
  catalogKey: string;
  widthCm: number | null;
  widthMm: number;
  widthListedInCatalog: boolean;
  priceIndex: number | null;
  pricingReferenceRaw: string;
  values: [number, number, number, number, number, number];
}) {
  return {
    articleCode: args.articleCode,
    catalogKey: args.catalogKey,
    widthCm: args.widthCm,
    widthMm: args.widthMm,
    widthListedInCatalog: args.widthListedInCatalog,
    priceIndex: args.priceIndex,
    pricingReferenceRaw: args.pricingReferenceRaw,
    priceGroupValues: priceGroups(args.values)
  };
}

function stack(componentId: string, heightMm: number, nameRaw: string) {
  return { componentId, heightMm, count: 1, nameRaw };
}

function interior(componentId: string, count: number, placement: string, nameRaw: string) {
  return { componentId, count, placement, nameRaw };
}

function makeDefinition(args: {
  productGroupId: string;
  definitionId: string;
  productTemplateName: string;
  moduleLabel: string;
  articleFamily: string;
  variantCode: string | null;
  sourcePage: number;
  sourceImagePath: string;
  widths: number[];
  defaultWidth: number;
  frontStackTopDown: Array<{ componentId: string; heightMm: number; count: number; nameRaw: string }>;
  interiorComponents: Array<{ componentId: string; count: number; placement: string; nameRaw: string }>;
  catalogRows: Array<{
    articleCode: string;
    catalogKey: string;
    widthCm: number | null;
    widthMm: number;
    widthListedInCatalog: boolean;
    priceIndex: number | null;
    pricingReferenceRaw: string;
    priceGroupValues: Record<string, number>;
  }>;
  sourceNotes: string[];
}) {
  return {
    productGroupId: args.productGroupId,
    definitionId: args.definitionId,
    productTemplateName: args.productTemplateName,
    moduleLabel: args.moduleLabel,
    articleFamily: args.articleFamily,
    variantCode: args.variantCode,
    catalogKeys: args.catalogRows.map((row) => row.catalogKey),
    sourcePage: args.sourcePage,
    sourceImagePath: args.sourceImagePath,
    dimensionsMm: {
      height: 2195,
      depth: 560,
      availableWidths: args.widths,
      defaultWidth: args.defaultWidth
    },
    frontStackTopDown: args.frontStackTopDown,
    interiorComponents: args.interiorComponents,
    catalogRows: args.catalogRows,
    sourceNotes: args.sourceNotes
  };
}

export const PINO_SIDE_CABINET_SYSTEM = {
  schemaVersion: "pino-side-cabinet-system.v2",
  sourcePdf: "VKH_2026_CZ.pdf",
  sourcePage: 243,
  systemId: "pino_nobilia_side_cabinet_vkh_2026",
  displayName: "PINO/Nobilia boční a přístrojové skříňky",
  commonDimensionsMm: {
    height: 2195,
    depth: 560,
    plinthHeight: 110,
    boardThickness: 18,
    frontThickness: 19,
    backThickness: 8
  },
  productGroups: [
    {
      groupId: "utility_side",
      label: "Úložné / technické",
      description: "Metlové a jednoduché bočné skrinky bez spotrebičového výklenku.",
      placementRules: {
        moduleClass: "tall_side",
        kitchenZone: "tall",
        requiresApplianceNiche: false,
        supportsWorktopTermination: true,
        cornerOnly: false
      },
      compatibilityRules: {
        acceptsApplianceCategories: [],
        recommendedUse: "utility_storage",
        requiresOpenNicheFront: false,
        allowedFrontKinds: ["flap_door", "swing_door"],
        allowedInteriorKinds: ["wire_shelf", "broom_hook", "cable_holder", "fixed_shelf", "adjustable_shelf"]
      }
    },
    {
      groupId: "dish_storage",
      label: "Bočné skrinky na nádobí",
      description: "Klasické vysoké bočné skrinky pre police a dvierka.",
      placementRules: {
        moduleClass: "tall_side",
        kitchenZone: "tall",
        requiresApplianceNiche: false,
        supportsWorktopTermination: true,
        cornerOnly: false
      },
      compatibilityRules: {
        acceptsApplianceCategories: [],
        recommendedUse: "dish_storage",
        requiresOpenNicheFront: false,
        allowedFrontKinds: ["flap_door", "swing_door"],
        allowedInteriorKinds: ["fixed_shelf", "adjustable_shelf"]
      }
    },
    {
      groupId: "dish_storage_drawers",
      label: "Bočné skrinky so zásuvkami/výsuvmi",
      description: "Bočné skrinky kombinujúce dvierka, zásuvky a výsuvy.",
      placementRules: {
        moduleClass: "tall_side",
        kitchenZone: "tall",
        requiresApplianceNiche: false,
        supportsWorktopTermination: true,
        cornerOnly: false
      },
      compatibilityRules: {
        acceptsApplianceCategories: [],
        recommendedUse: "dish_storage_drawers",
        requiresOpenNicheFront: false,
        allowedFrontKinds: ["flap_door", "swing_door", "drawer", "pullout"],
        allowedInteriorKinds: ["fixed_shelf", "adjustable_shelf", "pullout"]
      }
    },
    {
      groupId: "pantry_pullout",
      label: "Spížne skrinky",
      description: "Spížne bočné skrinky s výsuvmi, košmi alebo vnútornými zásuvkami.",
      placementRules: {
        moduleClass: "tall_side",
        kitchenZone: "tall",
        requiresApplianceNiche: false,
        supportsWorktopTermination: true,
        cornerOnly: false
      },
      compatibilityRules: {
        acceptsApplianceCategories: [],
        recommendedUse: "pantry_pullout",
        requiresOpenNicheFront: false,
        allowedFrontKinds: ["flap_door", "swing_door", "drawer"],
        allowedInteriorKinds: ["pullout", "wire_shelf", "fixed_shelf", "adjustable_shelf", "drawer"]
      }
    },
    {
      groupId: "appliance_tall",
      label: "Spotrebičové bočné skrinky",
      description: "Vysoké bočné skrinky s výklenkom pre vstavaný spotrebič.",
      placementRules: {
        moduleClass: "appliance_tall",
        kitchenZone: "tall_appliance",
        requiresApplianceNiche: true,
        supportsWorktopTermination: false,
        cornerOnly: false
      },
      compatibilityRules: {
        acceptsApplianceCategories: ["oven_tall", "microwave_tall", "compact_appliance"],
        recommendedUse: "appliance_housing",
        requiresOpenNicheFront: true,
        allowedFrontKinds: ["flap_door", "swing_door", "open_niche", "drawer", "pullout"],
        allowedInteriorKinds: ["fixed_shelf", "adjustable_shelf", "pullout"]
      }
    }
  ],
  componentLibrary: {
    flap_door: { kind: "flap_door", label: "Sklápěcí dvířka" },
    swing_door: { kind: "swing_door", label: "Otočná dvířka" },
    fixed_shelf: { kind: "fixed_shelf", label: "Pevná police" },
    adjustable_shelf: { kind: "adjustable_shelf", label: "Přestavitelná police" },
    drawer: { kind: "drawer", label: "Zásuvka" },
    pullout: { kind: "pullout", label: "Výsuv" },
    wire_shelf: { kind: "wire_shelf", label: "Drátěná police" },
    broom_hook: { kind: "broom_hook", label: "Háček pro smetáky" },
    cable_holder: { kind: "cable_holder", label: "Univerzální držák" },
    open_niche: { kind: "open_niche", label: "Otevřený výklenek" }
  },
  definitions: [
    makeDefinition({
      productGroupId: "utility_side",
      definitionId: "pino_side_cabinet_s_bk_page243",
      productTemplateName: "Boční skříňka pro smetáky",
      moduleLabel: "Boční skříňka pro smetáky",
      articleFamily: "S",
      variantCode: "BK",
      sourcePage: 243,
      sourceImagePath: PAGE_243_IMAGE,
      widths: [450, 500, 600],
      defaultWidth: 450,
      frontStackTopDown: [
        stack("flap_door", 285, "1 sklápěcí dvířka"),
        stack("swing_door", 1181, "1 otočná dvířka"),
        stack("swing_door", 717, "1 otočná dvířka")
      ],
      interiorComponents: [
        interior("wire_shelf", 1, "middle_lower", "1 drátěná police"),
        interior("broom_hook", 3, "rear_upper", "3 háčky pro smetáky"),
        interior("cable_holder", 1, "rear_mid", "1 univerzální držák pro kabely, hadice a příslušenství")
      ],
      catalogRows: [
        catalogRow({ articleCode: "S45BK", catalogKey: "S-45-BK", widthCm: 45, widthMm: 450, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 BK", values: [930, 1010, 1077, 1157, 1310, 1499] }),
        catalogRow({ articleCode: "S50BK", catalogKey: "S-50-BK", widthCm: 50, widthMm: 500, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 BK", values: [961, 1040, 1126, 1212, 1358, 1554] }),
        catalogRow({ articleCode: "S60BK", catalogKey: "S-60-BK", widthCm: 60, widthMm: 600, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 BK", values: [997, 1083, 1157, 1242, 1401, 1603] })
      ],
      sourceNotes: [
        "Drátěné části u zkrácené hloubky odpadají z 450 mm.",
        "Možné postavení vysavače, domácího žebříku nebo žehlicího prkna.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "utility_side",
      definitionId: "pino_side_cabinet_s_gk_page243",
      productTemplateName: "Boční skříňka",
      moduleLabel: "Boční skříňka",
      articleFamily: "S",
      variantCode: "GK",
      sourcePage: 243,
      sourceImagePath: PAGE_243_IMAGE,
      widths: [450, 500, 600],
      defaultWidth: 450,
      frontStackTopDown: [
        stack("flap_door", 285, "1 sklápěcí dvířka"),
        stack("swing_door", 1181, "1 otočná dvířka"),
        stack("swing_door", 717, "1 otočná dvířka")
      ],
      interiorComponents: [interior("fixed_shelf", 1, "between_upper_and_lower_door", "1 pevná police")],
      catalogRows: [
        catalogRow({ articleCode: "S45GK", catalogKey: "S-45-GK", widthCm: 45, widthMm: 450, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 GK", values: [881, 955, 991, 1065, 1267, 1456] }),
        catalogRow({ articleCode: "S50GK", catalogKey: "S-50-GK", widthCm: 50, widthMm: 500, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 GK", values: [936, 1016, 1028, 1108, 1316, 1505] }),
        catalogRow({ articleCode: "S60GK", catalogKey: "S-60-GK", widthCm: 60, widthMm: 600, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 GK", values: [973, 1053, 1120, 1205, 1358, 1548] })
      ],
      sourceNotes: [
        "Výška korpusu 2195 mm.",
        "Hloubka korpusu 560 mm.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "dish_storage",
      definitionId: "pino_side_cabinet_s_k_page243",
      productTemplateName: "Boční skříňka na nádobí",
      moduleLabel: "Boční skříňka na nádobí",
      articleFamily: "S",
      variantCode: "K",
      sourcePage: 243,
      sourceImagePath: PAGE_243_IMAGE,
      widths: [300, 450, 500, 600],
      defaultWidth: 300,
      frontStackTopDown: [
        stack("flap_door", 285, "1 sklápěcí dvířka"),
        stack("swing_door", 1181, "1 otočná dvířka"),
        stack("swing_door", 717, "1 otočná dvířka")
      ],
      interiorComponents: [
        interior("adjustable_shelf", 4, "distributed", "4 přestavitelné police"),
        interior("fixed_shelf", 1, "middle_lower", "1 pevně namontovaná police")
      ],
      catalogRows: [
        catalogRow({ articleCode: "S30K", catalogKey: "S-30-K", widthCm: 30, widthMm: 300, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [771, 838, 875, 942, 1065, 1212] }),
        catalogRow({ articleCode: "S45K", catalogKey: "S-45-K", widthCm: 45, widthMm: 450, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [881, 955, 991, 1065, 1267, 1456] }),
        catalogRow({ articleCode: "S50K", catalogKey: "S-50-K", widthCm: 50, widthMm: 500, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [936, 1016, 1028, 1108, 1316, 1505] }),
        catalogRow({ articleCode: "S60K", catalogKey: "S-60-K", widthCm: 60, widthMm: 600, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [973, 1053, 1120, 1205, 1358, 1548] })
      ],
      sourceNotes: ["Dělené čelo se může odlišovat od obrázku.", "Review/staging data, nepoužívat na produkční import."]
    }),
    makeDefinition({
      productGroupId: "dish_storage_drawers",
      definitionId: "pino_side_cabinet_ss_k_page243",
      productTemplateName: "Boční skříňka na nádobí",
      moduleLabel: "Boční skříňka na nádobí SS",
      articleFamily: "SS",
      variantCode: "K",
      sourcePage: 243,
      sourceImagePath: PAGE_243_IMAGE,
      widths: [450, 500, 600],
      defaultWidth: 450,
      frontStackTopDown: [
        stack("flap_door", 285, "1 sklápěcí dvířka"),
        stack("swing_door", 1181, "1 otočná dvířka"),
        stack("drawer", 141, "1 zásuvka"),
        stack("swing_door", 573, "1 otočná dvířka")
      ],
      interiorComponents: [interior("adjustable_shelf", 4, "distributed", "4 přestavitelné police")],
      catalogRows: [
        catalogRow({ articleCode: "SS45K", catalogKey: "SS-45-K", widthCm: 45, widthMm: 450, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [930, 1004, 1040, 1114, 1316, 1505] }),
        catalogRow({ articleCode: "SS50K", catalogKey: "SS-50-K", widthCm: 50, widthMm: 500, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [997, 1077, 1089, 1169, 1377, 1567] }),
        catalogRow({ articleCode: "SS60K", catalogKey: "SS-60-K", widthCm: 60, widthMm: 600, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [1034, 1126, 1187, 1273, 1426, 1622] })
      ],
      sourceNotes: ["Dělené čelo se může odlišovat od obrázku.", "Review/staging data, nepoužívat na produkční import."]
    }),
    makeDefinition({
      productGroupId: "dish_storage_drawers",
      definitionId: "pino_side_cabinet_ss2a_k_page243",
      productTemplateName: "Boční skříňka na nádobí",
      moduleLabel: "Boční skříňka na nádobí SS2A",
      articleFamily: "SS2A",
      variantCode: "K",
      sourcePage: 243,
      sourceImagePath: PAGE_243_IMAGE,
      widths: [450, 500, 600],
      defaultWidth: 450,
      frontStackTopDown: [
        stack("flap_door", 285, "1 sklápěcí dvířka"),
        stack("swing_door", 1181, "1 otočná dvířka"),
        stack("drawer", 141, "1 zásuvka"),
        stack("pullout", 285, "1 výsuv"),
        stack("pullout", 285, "1 výsuv")
      ],
      interiorComponents: [interior("adjustable_shelf", 3, "upper_zone", "3 přestavitelné police")],
      catalogRows: [
        catalogRow({ articleCode: "SS2A45K", catalogKey: "SS2A-45-K", widthCm: 45, widthMm: 450, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [1138, 1230, 1242, 1328, 1530, 1726] }),
        catalogRow({ articleCode: "SS2A50K", catalogKey: "SS2A-50-K", widthCm: 50, widthMm: 500, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [1193, 1291, 1297, 1371, 1579, 1768] }),
        catalogRow({ articleCode: "SS2A60K", catalogKey: "SS2A-60-K", widthCm: 60, widthMm: 600, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [1291, 1395, 1432, 1530, 1683, 1879] })
      ],
      sourceNotes: [
        "U skříněk se zkrácenou hloubkou nelze dodat varianty 706/707.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "dish_storage_drawers",
      definitionId: "pino_side_cabinet_s2a_k_page244",
      productTemplateName: "Boční skříňka na nádobí",
      moduleLabel: "Boční skříňka na nádobí S2A",
      articleFamily: "S2A",
      variantCode: "K",
      sourcePage: 244,
      sourceImagePath: PAGE_244_IMAGE,
      widths: [450, 500, 600],
      defaultWidth: 450,
      frontStackTopDown: [
        stack("flap_door", 285, "1 sklápěcí dvířka"),
        stack("swing_door", 1181, "1 otočná dvířka"),
        stack("pullout", 357, "1 výsuv"),
        stack("pullout", 357, "1 výsuv")
      ],
      interiorComponents: [interior("adjustable_shelf", 3, "upper_zone", "3 přestavitelné police")],
      catalogRows: [
        catalogRow({ articleCode: "S2A45K", catalogKey: "S2A-45-K", widthCm: 45, widthMm: 450, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [1108, 1199, 1212, 1297, 1499, 1695] }),
        catalogRow({ articleCode: "S2A50K", catalogKey: "S2A-50-K", widthCm: 50, widthMm: 500, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [1163, 1261, 1267, 1340, 1548, 1738] }),
        catalogRow({ articleCode: "S2A60K", catalogKey: "S2A-60-K", widthCm: 60, widthMm: 600, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [1261, 1365, 1401, 1499, 1652, 1848] })
      ],
      sourceNotes: [
        "U skříněk se zkrácenou hloubkou nelze dodat varianty 706/707.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "pantry_pullout",
      definitionId: "pino_side_cabinet_sa_k_page244",
      productTemplateName: "Spížní boční skříňka",
      moduleLabel: "Spížní boční skříňka",
      articleFamily: "SA",
      variantCode: "K",
      sourcePage: 244,
      sourceImagePath: PAGE_244_IMAGE,
      widths: [300],
      defaultWidth: 300,
      frontStackTopDown: [
        stack("flap_door", 285, "1 sklápěcí dvířka"),
        stack("swing_door", 1898, "1 otočná dvířka")
      ],
      interiorComponents: [
        interior("pullout", 1, "full_height", "1 výsuv v plné výšce"),
        interior("wire_shelf", 5, "full_height", "5 přestavitelnými drátěnými koši")
      ],
      catalogRows: [
        catalogRow({ articleCode: "SA30K", catalogKey: "SA-30-K", widthCm: 30, widthMm: 300, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 K", values: [2056, 2203, 2209, 2258, 2368, 2521] })
      ],
      sourceNotes: [
        "Drátěné části bílé.",
        "Zatížení vč. vlastní hmotnosti 100 kg.",
        "Montáž úchytky jen vodorovná.",
        "Není možné provedení TIP-ON.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "pantry_pullout",
      definitionId: "pino_side_cabinet_sa_kp_page244",
      productTemplateName: "Spížní boční skříňka",
      moduleLabel: "Spížní boční skříňka KP",
      articleFamily: "SA",
      variantCode: "KP",
      sourcePage: 244,
      sourceImagePath: PAGE_244_IMAGE,
      widths: [300],
      defaultWidth: 300,
      frontStackTopDown: [
        stack("flap_door", 285, "1 sklápěcí dvířka"),
        stack("swing_door", 1898, "1 otočná dvířka")
      ],
      interiorComponents: [
        interior("pullout", 1, "full_height", "1 výsuv v plné výšce"),
        interior("wire_shelf", 5, "full_height", "5 Arenaböden")
      ],
      catalogRows: [
        catalogRow({ articleCode: "SA30KP", catalogKey: "SA-30-KP", widthCm: 30, widthMm: 300, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 KP", values: [2178, 2325, 2331, 2380, 2491, 2644] })
      ],
      sourceNotes: [
        "Drátěné části bílé.",
        "Zatížení vč. vlastní hmotnosti 120 kg.",
        "Montáž úchytky jen vodorovná.",
        "Není možné provedení TIP-ON.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "pantry_pullout",
      definitionId: "pino_side_cabinet_sa_sk_page244",
      productTemplateName: "Spížní boční skříňka",
      moduleLabel: "Spížní boční skříňka SK",
      articleFamily: "SA",
      variantCode: "SK",
      sourcePage: 244,
      sourceImagePath: PAGE_244_IMAGE,
      widths: [300, 450, 500, 600],
      defaultWidth: 300,
      frontStackTopDown: [
        stack("flap_door", 285, "1 sklápěcí dvířka"),
        stack("swing_door", 1181, "1 výsuv"),
        stack("drawer", 357, "1 vnitřní zásuvka / spodní výsuv"),
        stack("drawer", 357, "1 vnitřní zásuvka / spodní výsuv")
      ],
      interiorComponents: [
        interior("pullout", 2, "lower_split", "2 výsuvy"),
        interior("drawer", 2, "lower_split", "2 vnitřní zásuvky")
      ],
      catalogRows: [
        catalogRow({ articleCode: "SA30SK", catalogKey: "SA-30-SK", widthCm: 30, widthMm: 300, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 SK", values: [1463, 1481, 1579, 1622, 1658, 1756] }),
        catalogRow({ articleCode: "SA45SK", catalogKey: "SA-45-SK", widthCm: 45, widthMm: 450, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 SK", values: [1609, 1738, 1744, 1793, 1830, 1940] }),
        catalogRow({ articleCode: "SA50SK", catalogKey: "SA-50-SK", widthCm: 50, widthMm: 500, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 SK", values: [1658, 1787, 1793, 1848, 1885, 1995] }),
        catalogRow({ articleCode: "SA60SK", catalogKey: "SA-60-SK", widthCm: 60, widthMm: 600, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 SK", values: [1762, 1897, 1903, 1958, 2001, 2117] })
      ],
      sourceNotes: [
        "Nahoře: 1 výsuv, 1 vnitřní zásuvka.",
        "Dole: 1 výsuv, 1 vnitřní zásuvka.",
        "U skříněk se zkrácenou hloubkou nelze dodat varianty 706/707.",
        "Není možné provedení TIP-ON.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "pantry_pullout",
      definitionId: "pino_side_cabinet_s_isk_page244",
      productTemplateName: "Boční skříňka",
      moduleLabel: "Boční skříňka ISK",
      articleFamily: "S",
      variantCode: "ISK",
      sourcePage: 244,
      sourceImagePath: PAGE_244_IMAGE,
      widths: [450, 500, 600],
      defaultWidth: 450,
      frontStackTopDown: [
        stack("flap_door", 285, "1 sklápěcí dvířka"),
        stack("swing_door", 1181, "1 otočná dvířka"),
        stack("swing_door", 717, "1 otočná dvířka")
      ],
      interiorComponents: [
        interior("adjustable_shelf", 1, "middle_zone", "1 nastavitelná vložená police"),
        interior("drawer", 5, "full_height", "5 vnitřní zásuvky")
      ],
      catalogRows: [
        catalogRow({ articleCode: "S45ISK", catalogKey: "S-45-ISK", widthCm: 45, widthMm: 450, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 ISK", values: [1579, 1695, 1762, 1879, 2068, 2313] }),
        catalogRow({ articleCode: "S50ISK", catalogKey: "S-50-ISK", widthCm: 50, widthMm: 500, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 ISK", values: [1622, 1750, 1817, 1940, 2136, 2387] }),
        catalogRow({ articleCode: "S60ISK", catalogKey: "S-60-ISK", widthCm: 60, widthMm: 600, widthListedInCatalog: true, priceIndex: 3, pricingReferenceRaw: "03 ISK", values: [1664, 1793, 1879, 2007, 2185, 2442] })
      ],
      sourceNotes: [
        "Při plánování na začátku stěny musí jít otočná dvířka otočit o 90° (respektujte vzdálenost úchytky).",
        "Stranu se zarážkou dveří neplánovat na straně připojení pracovní desky.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb_fb_page245",
      productTemplateName: "Boční skříňka pro vestavné spotřebiče",
      moduleLabel: "Boční skříňka pro vestavné spotřebiče GB",
      articleFamily: "GB",
      variantCode: "FB",
      sourcePage: 245,
      sourceImagePath: PAGE_245_IMAGE,
      widths: [600],
      defaultWidth: 600,
      frontStackTopDown: [
        stack("swing_door", 861, "1 otočná dvířka"),
        stack("open_niche", 590, "Výška výklenku 590 mm"),
        stack("swing_door", 717, "1 otočná dvířka")
      ],
      interiorComponents: [
        interior("adjustable_shelf", 2, "upper_zone", "2 přestavitelné police"),
        interior("adjustable_shelf", 1, "lower_zone", "1 přestavitelná police")
      ],
      catalogRows: [
        catalogRow({ articleCode: "GB03FB", catalogKey: "GB-FB", widthCm: null, widthMm: 600, widthListedInCatalog: false, priceIndex: 3, pricingReferenceRaw: "03 FB", values: [948, 1028, 1083, 1163, 1285, 1450] })
      ],
      sourceNotes: [
        "Výška výklenku 590 mm.",
        "Katalogová šířka na této stránce není explicitně vypsaná; preview používá fixní review šířku 600 mm.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gbs_fb_page245",
      productTemplateName: "Boční skříňka pro vestavné spotřebiče",
      moduleLabel: "Boční skříňka pro vestavné spotřebiče GBS",
      articleFamily: "GBS",
      variantCode: "FB",
      sourcePage: 245,
      sourceImagePath: PAGE_245_IMAGE,
      widths: [600],
      defaultWidth: 600,
      frontStackTopDown: [
        stack("swing_door", 861, "1 otočná dvířka"),
        stack("open_niche", 590, "Výška výklenku 590 mm"),
        stack("drawer", 141, "1 zásuvka"),
        stack("swing_door", 573, "1 otočná dvířka")
      ],
      interiorComponents: [
        interior("adjustable_shelf", 2, "upper_zone", "2 přestavitelné police"),
        interior("adjustable_shelf", 1, "lower_zone", "1 přestavitelná police")
      ],
      catalogRows: [
        catalogRow({ articleCode: "GBS03FB", catalogKey: "GBS-FB", widthCm: null, widthMm: 600, widthListedInCatalog: false, priceIndex: 3, pricingReferenceRaw: "03 FB", values: [1126, 1224, 1285, 1377, 1518, 1713] })
      ],
      sourceNotes: [
        "Výška výklenku 590 mm.",
        "Katalogová šířka na této stránce není explicitně vypsaná; preview používá fixní review šířku 600 mm.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gbs2a_fb_page245",
      productTemplateName: "Boční skříňka pro vestavné spotřebiče",
      moduleLabel: "Boční skříňka pro vestavné spotřebiče GBS2A",
      articleFamily: "GBS2A",
      variantCode: "FB",
      sourcePage: 245,
      sourceImagePath: PAGE_245_IMAGE,
      widths: [600],
      defaultWidth: 600,
      frontStackTopDown: [
        stack("swing_door", 861, "1 otočná dvířka"),
        stack("open_niche", 590, "Výška výklenku 590 mm"),
        stack("drawer", 141, "1 zásuvka"),
        stack("pullout", 285, "1 výsuv"),
        stack("pullout", 285, "1 výsuv")
      ],
      interiorComponents: [interior("adjustable_shelf", 2, "upper_zone", "2 přestavitelné police")],
      catalogRows: [
        catalogRow({ articleCode: "GBS2A03FB", catalogKey: "GBS2A-FB", widthCm: null, widthMm: 600, widthListedInCatalog: false, priceIndex: 3, pricingReferenceRaw: "03 FB", values: [1481, 1597, 1872, 2007, 2185, 2533] })
      ],
      sourceNotes: [
        "Výška výklenku 590 mm.",
        "Katalogová šířka na této stránce není explicitně vypsaná; preview používá fixní review šířku 600 mm.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    }),
    makeDefinition({
      productGroupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb2a_fb_page245",
      productTemplateName: "Boční skříňka pro vestavné spotřebiče",
      moduleLabel: "Boční skříňka pro vestavné spotřebiče GB2A",
      articleFamily: "GB2A",
      variantCode: "FB",
      sourcePage: 245,
      sourceImagePath: PAGE_245_IMAGE,
      widths: [600],
      defaultWidth: 600,
      frontStackTopDown: [
        stack("swing_door", 861, "1 otočná dvířka"),
        stack("open_niche", 590, "Výška výklenku 590 mm"),
        stack("pullout", 357, "1 výsuv"),
        stack("pullout", 357, "1 výsuv")
      ],
      interiorComponents: [interior("adjustable_shelf", 2, "upper_zone", "2 přestavitelné police")],
      catalogRows: [
        catalogRow({ articleCode: "GB2A03FB", catalogKey: "GB2A-FB", widthCm: null, widthMm: 600, widthListedInCatalog: false, priceIndex: 3, pricingReferenceRaw: "03 FB", values: [1426, 1542, 1817, 1952, 2129, 2478] })
      ],
      sourceNotes: [
        "Výška výklenku 590 mm.",
        "Katalogová šířka na této stránce není explicitně vypsaná; preview používá fixní review šířku 600 mm.",
        "Dělené čelo se může odlišovat od obrázku.",
        "Review/staging data, nepoužívat na produkční import."
      ]
    })
  ]
} as const;
