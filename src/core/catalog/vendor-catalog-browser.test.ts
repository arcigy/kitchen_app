import { describe, expect, it } from "vitest";
import { attachVendorModuleIntent } from "./vendor-module-intent";
import {
  listVendorCatalogGroupSummaries,
  listVendorCatalogTemplateSummaries
} from "./vendor-catalog-browser";
import type { ClientCatalog, VendorModuleIntent, VendorProductVariant } from "./catalog-types";

function variant(overrides: Partial<VendorProductVariant>): VendorProductVariant {
  const resolved = attachVendorModuleIntent({
    productTemplateId: overrides.productTemplateId ?? "tpl_ua",
    sourcePdf: overrides.sourcePdf ?? "VKH_2026_CZ.pdf",
    sourcePage: overrides.sourcePage ?? 99,
    articleCode: overrides.articleCode ?? "UA60",
    articleFamily: overrides.articleFamily ?? "UA",
    widthCm: overrides.widthCm ?? 60,
    widthMm: overrides.widthMm ?? 600,
    variantCode: overrides.variantCode ?? null,
    variantCodeStatus: overrides.variantCodeStatus ?? "none_expected",
    catalogKey: overrides.catalogKey ?? "UA-60",
    productTemplateName: overrides.productTemplateName ?? "Modul spodni skrinky; 1 vysuv",
    confidence: overrides.confidence ?? 0.95,
    needsReview: overrides.needsReview ?? false,
    notes: overrides.notes ?? ["1 vysuv"],
    mainGroup: overrides.mainGroup ?? "Spodni skrinky",
    subGroup: overrides.subGroup ?? "Zasuvkove"
  });
  return {
    ...resolved,
    ...overrides,
    moduleIntent: overrides.moduleIntent ?? resolved.moduleIntent
  };
}

function catalog(productVariants: VendorProductVariant[]): Pick<ClientCatalog, "vendorCatalog"> {
  return {
    vendorCatalog: {
      vendorId: "pino_nobilia",
      displayName: "PINO/Nobilia VKH 2026 CZ",
      source: "vkh_2026_cz_pdf",
      productVariants,
      productTemplates: [],
      pricingReferences: [],
      extractionMeta: {
        sourcePdf: "VKH_2026_CZ.pdf",
        pages: [...new Set(productVariants.map((item) => item.sourcePage))],
        productVariants: productVariants.length,
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

describe("vendor catalog browser", () => {
  it("deduplicates widths under one template and groups templates by intent", () => {
    const source = catalog([
      variant({ productTemplateId: "tpl_ua", catalogKey: "UA-45", articleCode: "UA45", widthCm: 45, widthMm: 450 }),
      variant({ productTemplateId: "tpl_ua", catalogKey: "UA-60", articleCode: "UA60", widthCm: 60, widthMm: 600 }),
      variant({
        productTemplateId: "tpl_gb",
        sourcePage: 245,
        articleCode: "GB03FB",
        articleFamily: "GB",
        widthCm: null,
        widthMm: null,
        variantCode: "FB",
        variantCodeStatus: "extracted",
        catalogKey: "GB-FB",
        productTemplateName: "Bocni skrinka pro vestavne spotrebice",
        notes: [],
        mainGroup: "Bocni skrinky",
        subGroup: "Spotrebice",
        moduleIntent: {
          moduleClass: "appliance_tall",
          kitchenModuleRole: "tall",
          placementZone: "tall_appliance",
          requiresWorktop: false,
          requiresCorner: false,
          requiresApplianceOpening: true,
          requiresWallAttachment: true,
          builderKeyCandidates: ["pinoSideCabinet.v1"],
          featureTags: ["side_cabinet", "appliance_tall"],
          notes: ["Test appliance group"]
        } satisfies VendorModuleIntent
      })
    ]);

    const groups = listVendorCatalogGroupSummaries(source);
    const templates = listVendorCatalogTemplateSummaries(source);
    const drawerGroup = groups.find((group) => group.groupId === "drawer_base_cabinets");
    const applianceGroup = groups.find((group) => group.groupId === "tall_appliances");
    const drawerTemplate = templates.find((template) => template.productTemplateId === "tpl_ua");

    expect(drawerGroup).toMatchObject({
      label: "Drawer base cabinets",
      placementZone: "low",
      templateCount: 1
    });
    expect(drawerGroup?.availableWidthsMm).toEqual([450, 600]);
    expect(applianceGroup).toMatchObject({
      label: "Tall appliances",
      requiresApplianceOpening: true,
      placementZone: "tall_appliance"
    });
    expect(drawerTemplate?.availableWidthsMm).toEqual([450, 600]);
    expect(drawerTemplate?.variantCatalogKeys).toEqual(["UA-45", "UA-60"]);
  });

  it("filters out needsReview templates by default and can include them on demand", () => {
    const source = catalog([
      variant({
        productTemplateId: "tpl_review",
        articleFamily: "GB",
        sourcePage: 245,
        catalogKey: "GB-FB",
        productTemplateName: "Bocni skrinka pro vestavne spotrebice",
        widthCm: null,
        widthMm: null,
        needsReview: true,
        reviewReasons: ["manual"],
        variantCode: "FB",
        variantCodeStatus: "extracted",
        notes: []
      })
    ]);

    expect(listVendorCatalogGroupSummaries(source)).toEqual([]);
    expect(listVendorCatalogTemplateSummaries(source)).toEqual([]);
    expect(listVendorCatalogGroupSummaries(source, { includeNeedsReview: true })).toHaveLength(1);
    expect(listVendorCatalogTemplateSummaries(source, { includeNeedsReview: true })[0]?.needsReview).toBe(true);
  });
});
