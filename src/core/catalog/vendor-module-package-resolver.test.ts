import { describe, expect, it } from "vitest";
import type { ClientCatalog, ClientModuleDefinition, VendorProductVariant } from "./catalog-types";
import { attachVendorModuleIntent } from "./vendor-module-intent";
import { resolveVendorModulePackage } from "./vendor-module-package-resolver";

function moduleDef(overrides: Partial<ClientModuleDefinition>): ClientModuleDefinition {
  return {
    id: overrides.moduleType ?? "drawer_low",
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

function variant(overrides: Partial<VendorProductVariant>): VendorProductVariant {
  return attachVendorModuleIntent({
    productTemplateId: "tpl_ua",
    sourcePdf: "VKH_2026_CZ.pdf",
    sourcePage: 99,
    articleCode: "UA60",
    articleFamily: "UA",
    widthCm: 60,
    variantCode: null,
    variantCodeStatus: "none_expected",
    catalogKey: "UA-60",
    productTemplateName: "Spodni skrinka se zasuvkami",
    confidence: 1,
    needsReview: false,
    ...overrides
  });
}

function catalog(args: {
  modules: ClientModuleDefinition[];
  productVariants: VendorProductVariant[];
}): Pick<ClientCatalog, "modules" | "vendorCatalog"> {
  return {
    modules: args.modules,
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

describe("resolveVendorModulePackage", () => {
  it("resolves a lower drawer variant to the drawer_low tenant module", () => {
    const result = resolveVendorModulePackage(catalog({
      modules: [
        moduleDef({
          moduleType: "drawer_low",
          modulePackageId: "drawer_low_family_v1",
          name: "Drawer",
          runtimeBuilderKey: "drawerLow.v1"
        }),
        moduleDef({
          moduleType: "swing_shelves_low",
          modulePackageId: "swing_shelves_low_family_v1",
          name: "Shelf Doors",
          runtimeBuilderKey: "swingShelvesLow.v1"
        })
      ],
      productVariants: [variant({ articleFamily: "UA", catalogKey: "UA-60", articleCode: "UA60" })]
    }), {
      articleFamily: "UA",
      widthMm: 600
    });

    expect(result.status).toBe("resolved");
    expect(result.catalogKey).toBe("UA-60");
    expect(result.moduleType).toBe("drawer_low");
    expect(result.runtimeBuilderKey).toBe("drawerLow.v1");
    expect(result.placementZone).toBe("low");
    expect(result.requiresWorktop).toBe(true);
  });

  it("resolves corner lower variants to the corner module", () => {
    const result = resolveVendorModulePackage(catalog({
      modules: [
        moduleDef({
          moduleType: "corner_shelf_lower",
          modulePackageId: "corner_shelf_lower_family_v1",
          name: "Corner Shelf",
          runtimeBuilderKey: "cornerShelfLower.v1"
        })
      ],
      productVariants: [variant({
        productTemplateId: "tpl_ue",
        articleFamily: "UE",
        articleCode: "UE90",
        widthCm: 90,
        catalogKey: "UE-90",
        productTemplateName: "Rohova spodni skrinka"
      })]
    }), {
      articleFamily: "UE",
      widthMm: 900
    });

    expect(result.status).toBe("resolved");
    expect(result.moduleType).toBe("corner_shelf_lower");
    expect(result.placementZone).toBe("corner_low");
    expect(result.requiresCorner).toBe(true);
  });

  it("resolves side-cabinet appliance variants to the PINO tall side-cabinet package", () => {
    const result = resolveVendorModulePackage(catalog({
      modules: [
        moduleDef({
          moduleType: "pino_side_cabinet",
          modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1",
          name: "PINO bocna skrinka",
          category: "tall_cabinet",
          runtimeBuilderKey: "pinoSideCabinet.v1"
        })
      ],
      productVariants: [variant({
        productTemplateId: "pino_side_cabinet_gb_fb_page245",
        sourcePage: 245,
        articleFamily: "GB2A",
        articleCode: "GB2A03FB",
        widthCm: null,
        widthMm: 600,
        catalogKey: "GB2A-FB",
        variantCode: "FB",
        variantCodeStatus: "extracted",
        productTemplateName: "Bocni skrinka pro vestavne spotrebice GB2A"
      })]
    }), {
      articleFamily: "GB2A",
      catalogKey: "GB2A-FB"
    });

    expect(result.status).toBe("resolved");
    expect(result.moduleType).toBe("pino_side_cabinet");
    expect(result.placementZone).toBe("tall_appliance");
    expect(result.requiresApplianceOpening).toBe(true);
  });

  it("routes mixed lower door+drawer variants to the generic kitchen special module", () => {
    const result = resolveVendorModulePackage(catalog({
      modules: [
        moduleDef({
          moduleType: "fwm_kitchen_special_module_1",
          modulePackageId: "fwm_kitchen_special_module_1_family_v1",
          name: "Kitchen Special 1",
          category: "custom",
          runtimeBuilderKey: "fwm_kitchen_special_module_1.v1"
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

    expect(result.status).toBe("resolved");
    expect(result.moduleType).toBe("fwm_kitchen_special_module_1");
    expect(result.runtimeBuilderKey).toBe("fwm_kitchen_special_module_1.v1");
    expect(result.placementZone).toBe("low");
  });

  it("routes open lower shelf families to the generic open-shelf kitchen special module", () => {
    const result = resolveVendorModulePackage(catalog({
      modules: [
        moduleDef({
          moduleType: "fwm_kitchen_special_module_3",
          modulePackageId: "fwm_kitchen_special_module_3_family_v1",
          name: "Kitchen Special 3",
          category: "custom",
          runtimeBuilderKey: "fwm_kitchen_special_module_3.v1"
        })
      ],
      productVariants: [variant({
        articleFamily: "UR",
        articleCode: "UR45",
        widthCm: 45,
        catalogKey: "UR-45",
        productTemplateName: "Police spodni skrinky; 2 prestavitelne police"
      })]
    }), {
      articleFamily: "UR",
      widthMm: 450
    });

    expect(result.status).toBe("resolved");
    expect(result.moduleType).toBe("fwm_kitchen_special_module_3");
    expect(result.runtimeBuilderKey).toBe("fwm_kitchen_special_module_3.v1");
    expect(result.placementZone).toBe("low");
  });

  it("routes lower cover panels to interior cladding modules", () => {
    const result = resolveVendorModulePackage(catalog({
      modules: [
        moduleDef({
          moduleType: "fwm_interior_cladding_1",
          modulePackageId: "fwm_interior_cladding_1_family_v1",
          name: "Cladding 1",
          category: "custom",
          runtimeBuilderKey: "fwm_interior_cladding_1.v1"
        })
      ],
      productVariants: [variant({
        articleFamily: "UPT",
        articleCode: "UPT10",
        widthCm: 10,
        catalogKey: "UPT-10",
        productTemplateName: "Kryci lista pro stranu spodni skrinky; Material korpusu; pro napojeni steny"
      })]
    }), {
      articleFamily: "UPT",
      widthMm: 100
    });

    expect(result.status).toBe("resolved");
    expect(result.moduleType).toBe("fwm_interior_cladding_1");
    expect(result.runtimeBuilderKey).toBe("fwm_interior_cladding_1.v1");
    expect(result.placementZone).toBe("accessory");
  });

  it("keeps review variants in needs_review even when a module package exists", () => {
    const result = resolveVendorModulePackage(catalog({
      modules: [moduleDef({ moduleType: "drawer_low", runtimeBuilderKey: "drawerLow.v1" })],
      productVariants: [variant({
        confidence: 0.72,
        needsReview: true,
        reviewReasons: ["inherited_template"]
      })]
    }), {
      articleFamily: "UA",
      widthMm: 600
    });

    expect(result.status).toBe("needs_review");
    expect(result.moduleType).toBe("drawer_low");
    expect(result.resolvedModule?.moduleType).toBe("drawer_low");
    expect(result.candidates[0]?.moduleType).toBe("drawer_low");
    expect(result.vendorResolution.status).toBe("needs_review");
  });

  it("returns ambiguous when duplicate vendor matches exist", () => {
    const result = resolveVendorModulePackage(catalog({
      modules: [moduleDef({ moduleType: "drawer_low", runtimeBuilderKey: "drawerLow.v1" })],
      productVariants: [
        variant({ sourcePage: 99, bbox: { x: 1, y: 2, width: 3, height: 4 }, productTemplateName: "Spodni skrinka; 1 vysuv", notes: ["1 vysuv"] }),
        variant({ sourcePage: 100, bbox: { x: 5, y: 6, width: 7, height: 8 }, productTemplateName: "Spodni skrinka; 2 vysuvy", notes: ["2 vysuvy"] })
      ]
    }), {
      articleFamily: "UA",
      widthMm: 600
    });

    expect(result.status).toBe("ambiguous");
    expect(result.moduleType).toBe("drawer_low");
    expect(result.reasons).toContain("multiple_vendor_variant_matches");
  });

  it("returns missing when the preferred runtime builder is not available in the tenant catalog", () => {
    const result = resolveVendorModulePackage(catalog({
      modules: [moduleDef({ moduleType: "swing_shelves_low", runtimeBuilderKey: "swingShelvesLow.v1" })],
      productVariants: [variant({ articleFamily: "UA", catalogKey: "UA-60" })]
    }), {
      articleFamily: "UA",
      widthMm: 600
    });

    expect(result.status).toBe("missing");
    expect(result.runtimeBuilderKey).toBe("drawerLow.v1");
    expect(result.reasons).toContain("no_enabled_catalog_module_for_runtime_builder");
  });
});
