import { describe, expect, it } from "vitest";
import type { VendorProductTemplate, VendorProductVariant } from "./catalog-types";
import { attachVendorModuleIntent, inferVendorModuleIntent, summarizeVendorTemplateIntent } from "./vendor-module-intent";

function variant(overrides: Partial<VendorProductVariant>): VendorProductVariant {
  return {
    productTemplateId: "tpl_generic",
    sourcePdf: "VKH_2026_CZ.pdf",
    sourcePage: 90,
    articleCode: "UA60",
    articleFamily: "UA",
    widthCm: 60,
    variantCode: null,
    variantCodeStatus: "none_expected",
    catalogKey: "UA-60",
    productTemplateName: "Spodni skrinka; 1 vysuv",
    mainGroup: "spodne skrinky",
    subGroup: "vysuvove spodne skrinky",
    rulesRaw: [],
    notes: [],
    confidence: 1,
    needsReview: false,
    ...overrides
  };
}

function template(overrides: Partial<VendorProductTemplate>): VendorProductTemplate {
  return {
    productTemplateId: "tpl_generic",
    sourcePdf: "VKH_2026_CZ.pdf",
    sourcePages: [90],
    productTemplateName: "Spodni skrinka; 1 vysuv",
    variantCatalogKeys: ["UA-60"],
    articleFamilies: ["UA"],
    confidence: 1,
    needsReview: false,
    ...overrides
  };
}

describe("inferVendorModuleIntent", () => {
  it("classifies classic lower drawer variants as base modules under worktop", () => {
    const intent = inferVendorModuleIntent(variant({}));

    expect(intent.moduleClass).toBe("base");
    expect(intent.kitchenModuleRole).toBe("base");
    expect(intent.placementZone).toBe("low");
    expect(intent.requiresWorktop).toBe(true);
    expect(intent.builderKeyCandidates).toContain("drawerLow.v1");
    expect(intent.featureTags).toContain("drawer_stack");
  });

  it("classifies corner lower variants as corner-only", () => {
    const intent = inferVendorModuleIntent(variant({
      articleFamily: "UE",
      catalogKey: "UE-90",
      subGroup: "rohove spodni skrinky",
      productTemplateName: "Rohova spodni skrinka"
    }));

    expect(intent.moduleClass).toBe("corner_base");
    expect(intent.placementZone).toBe("corner_low");
    expect(intent.requiresCorner).toBe(true);
    expect(intent.builderKeyCandidates).toEqual(["cornerShelfLower.v1"]);
  });

  it("marks hob families as low modules for cooktop positions", () => {
    const intent = inferVendorModuleIntent(variant({
      articleFamily: "UKB2A",
      catalogKey: "UKB2A-60-K1",
      subGroup: "skrinky pod varnou dosku",
      productTemplateName: "Spodni skrinka pod varnou desku; 2 vysuvy"
    }));

    expect(intent.moduleClass).toBe("base");
    expect(intent.featureTags).toContain("hob_zone");
    expect(intent.builderKeyCandidates[0]).toBe("fwm_kitchen_special_module_2.v1");
  });

  it("routes mixed lower door+drawer families to the generic special kitchen builder first", () => {
    const intent = inferVendorModuleIntent(variant({
      articleFamily: "US",
      catalogKey: "US-60",
      subGroup: "klasicke spodni skrinky",
      productTemplateName: "Spodni skrinka; 1 zasuvka; 1 otocna dvirka; 1 police"
    }));

    expect(intent.builderKeyCandidates[0]).toBe("fwm_kitchen_special_module_1.v1");
    expect(intent.builderKeyCandidates).toContain("drawerLow.v1");
    expect(intent.featureTags).toContain("drawer_stack");
    expect(intent.featureTags).toContain("door_shelf");
  });

  it("marks shallow wall-attached variants with reduced-depth and wall attachment rules", () => {
    const intent = inferVendorModuleIntent(variant({
      articleFamily: "VUS",
      catalogKey: "VUS-60",
      subGroup: "klasicke spodni skrinky",
      productTemplateName: "Spodni skrinka; 1 otocna dvirka; 2 police",
      rulesRaw: [
        "Mozne zmenseni hloubky az 260 mm za priplatek.",
        "Spodni skrinka musi byt pripevnena ke stene."
      ],
      notes: ["Jako predtim, avsak Hloubka korpusu 326 mm"]
    }));

    expect(intent.requiresWallAttachment).toBe(true);
    expect(intent.featureTags).toContain("reduced_depth_capable");
    expect(intent.builderKeyCandidates).toContain("swingShelvesLow.v1");
  });

  it("routes open lower shelf and bottle-rack families to the open-shelf special builder", () => {
    const intent = inferVendorModuleIntent(variant({
      articleFamily: "VUR",
      catalogKey: "VUR-15-F",
      subGroup: "police spodni skrinky",
      productTemplateName: "Regal na lahve spodni skrinky; 4 pevne police; 5 polic"
    }));

    expect(intent.moduleClass).toBe("base");
    expect(intent.placementZone).toBe("low");
    expect(intent.builderKeyCandidates).toEqual(["fwm_kitchen_special_module_3.v1"]);
    expect(intent.featureTags).toContain("open_shelf_base");
    expect(intent.featureTags).toContain("bottle_rack");
  });

  it("classifies lower cover panels as accessory cladding modules", () => {
    const intent = inferVendorModuleIntent(variant({
      articleFamily: "UPF",
      catalogKey: "UPF-10",
      productTemplateName: "Kryci lista pro spodni skrinky; Material cela; Montaz mezi stenu a korpus"
    }));

    expect(intent.moduleClass).toBe("accessory");
    expect(intent.kitchenModuleRole).toBe("accessory");
    expect(intent.placementZone).toBe("accessory");
    expect(intent.requiresWorktop).toBe(false);
    expect(intent.builderKeyCandidates).toEqual(["fwm_interior_cladding_1.v1"]);
    expect(intent.featureTags).toContain("cover_panel");
  });

  it("classifies appliance side cabinets as tall appliance housings", () => {
    const intent = inferVendorModuleIntent(variant({
      productTemplateId: "pino_side_cabinet_gb_fb_page245",
      articleFamily: "GB",
      catalogKey: "GB-FB",
      mainGroup: "bocni skrinky",
      productTemplateName: "Bocni skrinka pro vestavne spotrebice"
    }));

    expect(intent.moduleClass).toBe("appliance_tall");
    expect(intent.kitchenModuleRole).toBe("tall");
    expect(intent.placementZone).toBe("tall_appliance");
    expect(intent.requiresApplianceOpening).toBe(true);
    expect(intent.builderKeyCandidates).toEqual(["pinoSideCabinet.v1"]);
  });
});

describe("vendor module intent enrichment", () => {
  it("attaches module intent to variants and summarizes template intent from related variants", () => {
    const variants = [
      attachVendorModuleIntent(variant({ catalogKey: "UA-45", widthCm: 45, widthMm: 450 })),
      attachVendorModuleIntent(variant({ catalogKey: "UA-60", widthCm: 60, widthMm: 600 }))
    ];
    const summarized = summarizeVendorTemplateIntent(template({
      productTemplateId: "tpl_generic",
      variantCatalogKeys: ["UA-45", "UA-60"]
    }), variants);

    expect(variants[0]!.moduleIntent?.builderKeyCandidates).toContain("drawerLow.v1");
    expect(summarized.moduleIntent?.moduleClass).toBe("base");
    expect(summarized.moduleIntent?.builderKeyCandidates).toContain("drawerLow.v1");
    expect(summarized.moduleIntent?.placementZone).toBe("low");
  });
});
