import { describe, expect, it } from "vitest";
import type { ClientCatalog, ClientModuleDefinition, VendorProductVariant } from "./catalog-types";
import { attachVendorModuleIntent } from "./vendor-module-intent";
import { resolveVendorModuleSeed } from "./vendor-module-seed-resolver";

function moduleDef(overrides: Partial<ClientModuleDefinition>): ClientModuleDefinition {
  return {
    id: overrides.modulePackageId ?? overrides.moduleType ?? "drawer_low",
    moduleType: overrides.moduleType ?? "drawer_low",
    modulePackageId: overrides.modulePackageId ?? `${overrides.moduleType ?? "drawer_low"}_pkg`,
    packageVersion: "1.0.0",
    packageHash: "hash",
    name: overrides.name ?? "Module",
    enabled: overrides.enabled ?? true,
    runtimeBuilderKey: overrides.runtimeBuilderKey ?? "drawerLow.v1",
    category: overrides.category ?? "base_cabinet",
    ...overrides
  };
}

function variant(overrides: Partial<VendorProductVariant> = {}): VendorProductVariant {
  return attachVendorModuleIntent({
    productTemplateId: "tpl_variant",
    sourcePdf: "VKH_2026_CZ.pdf",
    sourcePage: 99,
    articleCode: "UA60",
    articleFamily: "UA",
    widthCm: 60,
    widthMm: 600,
    variantCode: null,
    variantCodeStatus: "none_expected",
    catalogKey: "UA-60",
    productTemplateName: "Modul spodni skrinky; 1 vysuv",
    notes: ["1 vysuv"],
    confidence: 1,
    needsReview: false,
    ...overrides
  });
}

function catalog(args: {
  modules: ClientModuleDefinition[];
  productVariants: VendorProductVariant[];
}): Pick<ClientCatalog, "modules" | "vendorCatalog" | "kitchenDefaults"> {
  return {
    modules: args.modules,
    kitchenDefaults: {
      carcassMaterialId: "mat.body",
      frontMaterialId: "mat.front",
      drawerBottomMaterialId: "mat.drawer.bottom",
      defaultHandleComponentId: "cmp.handle",
      defaultHingeComponentId: "cmp.hinge",
      defaultDrawerSystemComponentId: "cmp.runner",
      defaultWorktopThicknessMm: 38,
      defaultPlinthHeightMm: 100
    },
    vendorCatalog: {
      vendorId: "pino_nobilia",
      displayName: "PINO/Nobilia VKH 2026 CZ",
      source: "vkh_2026_cz_pdf",
      productVariants: args.productVariants,
      productTemplates: [],
      pricingReferences: [],
      extractionMeta: {
        sourcePdf: "VKH_2026_CZ.pdf",
        pages: [99],
        productVariants: args.productVariants.length,
        productTemplates: 0,
        pricingReferences: 0,
        importedAt: "2026-06-16T00:00:00.000Z",
        importStatus: "review_staging",
        productionImportApproved: false,
        notes: []
      }
    }
  };
}

describe("resolveVendorModuleSeed", () => {
  it("rejects retired drawer seeds for pullout lower cabinets", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [moduleDef({ moduleType: "drawer_low", runtimeBuilderKey: "drawerLow.v1" })],
      productVariants: [variant()]
    }), {
      articleFamily: "UA",
      widthMm: 600
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("rejects retired door-and-shelf seeds", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [moduleDef({ moduleType: "swing_shelves_low", runtimeBuilderKey: "swingShelvesLow.v1" })],
      productVariants: [variant({
        articleFamily: "U",
        articleCode: "U60",
        catalogKey: "U-60",
        productTemplateName: "Spodni skrinka; 1 otocna dvirka; 2 prestavitelne police",
        notes: ["1 otocna dvirka", "2 prestavitelne police"]
      })]
    }), {
      articleFamily: "U",
      widthMm: 600
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("rejects retired corner seeds", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [moduleDef({ moduleType: "corner_shelf_lower", runtimeBuilderKey: "cornerShelfLower.v1" })],
      productVariants: [variant({
        productTemplateId: "tpl_ue",
        sourcePage: 104,
        articleFamily: "UE",
        articleCode: "UE90",
        widthCm: 90,
        widthMm: 900,
        catalogKey: "UE-90",
        productTemplateName: "Rohova spodni skrinka; 2 otocna dvirka; 1 police",
        notes: ["2 otocna dvirka", "1 police"]
      })]
    }), {
      articleFamily: "UE",
      widthMm: 900
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("rejects retired PINO appliance tall seeds", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [
        moduleDef({
          moduleType: "pino_side_cabinet",
          modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1",
          runtimeBuilderKey: "pinoSideCabinet.v1",
          category: "tall_cabinet"
        })
      ],
      productVariants: [variant({
        productTemplateId: "pino_side_cabinet_gb_fb_page245",
        sourcePage: 245,
        articleFamily: "GB",
        articleCode: "GB03FB",
        widthCm: null,
        widthMm: 600,
        catalogKey: "GB-FB",
        variantCode: "FB",
        variantCodeStatus: "extracted",
        productTemplateName: "Bocni skrinka pro vestavne spotrebice",
        notes: ["1 sklapece dvirka", "Vyska vyklenku 590 mm", "1 otocna dvirka"]
      })]
    }), {
      articleFamily: "GB",
      catalogKey: "GB-FB",
      moduleType: "pino_side_cabinet"
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("does not revive retired PINO cabinets for fitting appliances", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [
        moduleDef({
          moduleType: "pino_side_cabinet",
          modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1",
          runtimeBuilderKey: "pinoSideCabinet.v1",
          category: "tall_cabinet"
        })
      ],
      productVariants: [variant({
        productTemplateId: "pino_side_cabinet_gb_fb_page245",
        sourcePage: 245,
        articleFamily: "GB",
        articleCode: "GB03FB",
        widthCm: null,
        widthMm: 600,
        catalogKey: "GB-FB",
        variantCode: "FB",
        variantCodeStatus: "extracted",
        productTemplateName: "Bocni skrinka pro vestavne spotrebice",
        notes: ["1 sklapece dvirka", "Vyska vyklenku 590 mm", "1 otocna dvirka"]
      })]
    }), {
      articleFamily: "GB",
      catalogKey: "GB-FB",
      moduleType: "pino_side_cabinet",
      applianceCategory: "oven_tall",
      applianceWidthMm: 540,
      applianceHeightMm: 540,
      applianceDepthMm: 450
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("does not revive retired PINO cabinets for oversized appliances", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [
        moduleDef({
          moduleType: "pino_side_cabinet",
          modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1",
          runtimeBuilderKey: "pinoSideCabinet.v1",
          category: "tall_cabinet"
        })
      ],
      productVariants: [variant({
        productTemplateId: "pino_side_cabinet_gb_fb_page245",
        sourcePage: 245,
        articleFamily: "GB",
        articleCode: "GB03FB",
        widthCm: null,
        widthMm: 600,
        catalogKey: "GB-FB",
        variantCode: "FB",
        variantCodeStatus: "extracted",
        productTemplateName: "Bocni skrinka pro vestavne spotrebice",
        notes: ["1 sklapece dvirka", "Vyska vyklenku 590 mm", "1 otocna dvirka"]
      })]
    }), {
      articleFamily: "GB",
      catalogKey: "GB-FB",
      moduleType: "pino_side_cabinet",
      applianceCategory: "oven_tall",
      applianceWidthMm: 560,
      applianceHeightMm: 580
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("does not infer mixed door-and-drawer seeds from vendor descriptions", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [
        moduleDef({
          moduleType: "fwm_kitchen_special_module_1",
          modulePackageId: "fwm_kitchen_special_module_1_family_v1",
          runtimeBuilderKey: "fwm_kitchen_special_module_1.v1",
          category: "custom"
        })
      ],
      productVariants: [variant({
        articleFamily: "US",
        articleCode: "US60",
        catalogKey: "US-60",
        productTemplateName: "Spodni skrinka; 1 zasuvka; 1 otocna dvirka; 1 police",
        notes: ["1 zasuvka", "1 otocna dvirka", "1 police"]
      })]
    }), {
      articleFamily: "US",
      widthMm: 600
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("does not revive retired appliance-ready seeds", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [
        moduleDef({
          moduleType: "fwm_kitchen_special_module_2",
          modulePackageId: "fwm_kitchen_special_module_2_family_v1",
          runtimeBuilderKey: "fwm_kitchen_special_module_2.v1",
          category: "custom"
        })
      ],
      productVariants: [variant({
        articleFamily: "UKB2A",
        articleCode: "UKB2A40",
        catalogKey: "UKB2A-40",
        widthCm: 40,
        widthMm: 400,
        productTemplateName: "Spodni skrinka pro varnou desku; 1 pevna celni kryci lista; 1 deska k ochrane pred dotykem; 2 vysuvy; Volny prostor az ke spodnej hrane pracovnej dosky: 128 mm",
        notes: ["1 pevna celni kryci lista", "1 deska k ochrane pred dotykem", "2 vysuvy", "Volny prostor az ke spodnej hrane pracovnej dosky: 128 mm"]
      })]
    }), {
      articleFamily: "UKB2A",
      widthMm: 400
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("does not revive retired shelf seeds", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [
        moduleDef({
          moduleType: "fwm_kitchen_special_module_3",
          modulePackageId: "fwm_kitchen_special_module_3_family_v1",
          runtimeBuilderKey: "fwm_kitchen_special_module_3.v1",
          category: "custom"
        })
      ],
      productVariants: [variant({
        articleFamily: "UR",
        articleCode: "UR45",
        widthCm: 45,
        widthMm: 450,
        catalogKey: "UR-45",
        productTemplateName: "Police spodni skrinky; 2 prestavitelne police",
        notes: ["2 prestavitelne police"]
      })]
    }), {
      articleFamily: "UR",
      widthMm: 450
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("does not infer retired seeds from product template counts", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [moduleDef({ moduleType: "drawer_low", runtimeBuilderKey: "drawerLow.v1" })],
      productVariants: [variant({
        articleFamily: "VU5S",
        articleCode: "VU5S60",
        widthCm: 60,
        widthMm: 600,
        catalogKey: "VU5S-60",
        productTemplateName: "Spodni skrinka; 5 zasuvek",
        notes: ["Jako predtim, avsak Hloubka korpusu 326 mm"]
      })]
    }), {
      articleFamily: "VU5S",
      widthMm: 600
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("does not revive retired cladding seeds", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [
        moduleDef({
          moduleType: "fwm_interior_cladding_1",
          modulePackageId: "fwm_interior_cladding_1_family_v1",
          runtimeBuilderKey: "fwm_interior_cladding_1.v1",
          category: "custom"
        })
      ],
      productVariants: [variant({
        articleFamily: "UPF",
        articleCode: "UPF10",
        widthCm: 10,
        widthMm: 100,
        catalogKey: "UPF-10",
        productTemplateName: "Kryci lista pro spodni skrinky; Material cela; Montaz mezi stenu a korpus"
      })]
    }), {
      articleFamily: "UPF",
      widthMm: 100
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("rejects retired drawer seeds for US2A families", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [moduleDef({ moduleType: "drawer_low", runtimeBuilderKey: "drawerLow.v1" })],
      productVariants: [variant({
        articleFamily: "US2A",
        articleCode: "US2A60",
        widthCm: 60,
        widthMm: 600,
        catalogKey: "US2A-60",
        productTemplateName: "Spodni skrinka; 1 zasuvka; 2 vysuvy",
        notes: ["1 zasuvka", "2 vysuvy"]
      })]
    }), {
      articleFamily: "US2A",
      widthMm: 600
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("rejects retired shallow drawer seeds", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [moduleDef({ moduleType: "drawer_low", runtimeBuilderKey: "drawerLow.v1" })],
      productVariants: [variant({
        articleFamily: "VU5S",
        articleCode: "VU5S60",
        widthCm: 60,
        widthMm: 600,
        catalogKey: "VU5S-60",
        productTemplateName: "Spodni skrinka; 5 zasuvek",
        notes: ["Jako predtim, avsak Hloubka korpusu 326 mm"],
        confidence: 0.76,
        needsReview: true,
        reviewReasons: ["template_inherited_from_jako_predtim", "low_confidence"]
      })]
    }), {
      articleFamily: "VU5S",
      widthMm: 600
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

  it("requires review for retired mixed seeds", () => {
    const result = resolveVendorModuleSeed(catalog({
      modules: [
        moduleDef({
          moduleType: "fwm_kitchen_special_module_1",
          modulePackageId: "fwm_kitchen_special_module_1_family_v1",
          runtimeBuilderKey: "fwm_kitchen_special_module_1.v1",
          category: "custom"
        })
      ],
      productVariants: [variant({
        articleFamily: "VUS",
        articleCode: "VUS60",
        widthCm: 60,
        widthMm: 600,
        catalogKey: "VUS-60",
        productTemplateName: "Spodni skrinka; 1 zasuvka; 1 otocna dvirka; 1 prestavitelna police",
        notes: ["Jako predtim, avsak Hloubka korpusu 326 mm"],
        confidence: 0.76,
        needsReview: true,
        reviewReasons: ["template_inherited_from_jako_predtim", "low_confidence"]
      })]
    }), {
      articleFamily: "VUS",
      widthMm: 600
    });

    expect(result.status).not.toBe("resolved");
    expect(result.params).toBeNull();
    expect(result.moduleType).toBeNull();
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });

});
