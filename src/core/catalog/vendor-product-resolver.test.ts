import { describe, expect, it } from "vitest";
import type { ClientCatalog, VendorProductVariant } from "./catalog-types";
import { resolveVendorProductVariant } from "./vendor-product-resolver";

function variant(overrides: Partial<VendorProductVariant>): VendorProductVariant {
  return {
    productTemplateId: "tpl_us_internal_drawers",
    sourcePdf: "VKH_2026_CZ.pdf",
    sourcePage: 99,
    articleCode: "US60IS",
    articleFamily: "US",
    widthCm: 60,
    variantCode: "IS",
    variantCodeStatus: "extracted",
    catalogKey: "US-60-IS",
    productTemplateName: "Spodni skrinka s vnitrnimi zasuvkami",
    confidence: 1,
    needsReview: false,
    ...overrides
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
        pages: [99],
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

describe("resolveVendorProductVariant", () => {
  it("resolves an exact family width variant and template match", () => {
    const result = resolveVendorProductVariant(catalog([
      variant({ catalogKey: "UA-60", articleFamily: "UA", variantCode: null, productTemplateName: "Ina skrinka" }),
      variant({})
    ]), {
      articleFamily: "US",
      widthMm: 600,
      variantCode: "IS",
      productTemplateName: "Spodni skrinka s vnitrnimi zasuvkami"
    });

    expect(result.status).toBe("resolved");
    expect(result.catalogKey).toBe("US-60-IS");
    expect(result.candidates).toHaveLength(1);
  });

  it("keeps duplicate matches ambiguous instead of choosing one", () => {
    const result = resolveVendorProductVariant(catalog([
      variant({ sourcePage: 99, bbox: { x: 1, y: 2, width: 3, height: 4 }, notes: ["1 vnitrni zasuvka"] }),
      variant({ sourcePage: 100, bbox: { x: 5, y: 6, width: 7, height: 8 }, notes: ["2 vnitrni zasuvky"] })
    ]), {
      articleFamily: "US",
      widthCm: 60,
      variantCode: "IS",
      productTemplateName: "Spodni skrinka s vnitrnimi zasuvkami"
    });

    expect(result.status).toBe("ambiguous");
    expect(result.catalogKey).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it("collapses semantically identical duplicates across pages", () => {
    const result = resolveVendorProductVariant(catalog([
      variant({
        catalogKey: "USA-60",
        articleFamily: "USA",
        articleCode: "USA60",
        variantCode: null,
        sourcePage: 89,
        productTemplateName: "Modul spodni skrinky; 1 zasuvka; 1 vysuv",
        notes: ["1 zasuvka", "1 vysuv"]
      }),
      variant({
        catalogKey: "USA-60",
        articleFamily: "USA",
        articleCode: "USA60",
        variantCode: null,
        sourcePage: 91,
        productTemplateName: "Spodni skrinka; 1 zasuvka; 1 vysuv",
        notes: ["1 zasuvka", "1 vysuv"]
      })
    ]), {
      articleFamily: "USA",
      widthMm: 600
    });

    expect(result.status).toBe("resolved");
    expect(result.catalogKey).toBe("USA-60");
    expect(result.candidates).toHaveLength(1);
  });

  it("prefers a single high-confidence non-review candidate over review-only duplicates", () => {
    const result = resolveVendorProductVariant(catalog([
      variant({
        catalogKey: "US-60",
        articleFamily: "US",
        articleCode: "US60",
        variantCode: null,
        sourcePage: 90,
        productTemplateName: "Spodni skrinka; 1 zasuvka; 1 otocna dvirka; 1 police",
        notes: ["1 zasuvka", "1 otocna dvirka", "1 police"],
        confidence: 1,
        needsReview: false
      }),
      variant({
        catalogKey: "US-60",
        articleFamily: "US",
        articleCode: "US60",
        variantCode: null,
        sourcePage: 94,
        productTemplateName: "Bocni opera; Spodni zasuvka pod pracovni desku",
        notes: ["Mozna zkracena hloubka"],
        confidence: 0.93,
        needsReview: true,
        reviewReasons: ["variant_code_missing_uncertain"]
      })
    ]), {
      articleFamily: "US",
      widthMm: 600,
      variantCode: null
    });

    expect(result.status).toBe("resolved");
    expect(result.catalogKey).toBe("US-60");
    expect(result.reasons).toContain("preferred_single_high_confidence_candidate_over_review_duplicates");
  });

  it("marks low-confidence or review matches as needs_review", () => {
    const result = resolveVendorProductVariant(catalog([
      variant({ confidence: 0.72, needsReview: true, reviewReasons: ["inherited_template"] })
    ]), {
      articleFamily: "US",
      widthMm: 600,
      variantCode: "IS",
      productTemplateName: "Spodni skrinka s vnitrnimi zasuvkami"
    });

    expect(result.status).toBe("needs_review");
    expect(result.catalogKey).toBe("US-60-IS");
    expect(result.reasons).toContain("candidate_needs_review_or_low_confidence");
  });

  it("reports missing when the client catalog has no vendor index", () => {
    const result = resolveVendorProductVariant({}, {
      articleFamily: "US",
      widthMm: 600
    });

    expect(result.status).toBe("missing");
    expect(result.reasons).toContain("catalog_has_no_vendor_index");
  });
});
