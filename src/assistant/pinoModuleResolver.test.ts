import { describe, expect, it } from "vitest";
import type { ClientCatalog, ClientModuleDefinition, VendorProductVariant } from "../core/catalog/catalog-types";
import { attachVendorModuleIntent } from "../core/catalog/vendor-module-intent";
import { buildPinoCatalogAssistantRagChunks, normalizePinoSearchText, resolvePinoModuleDescription } from "./pinoModuleResolver";

function moduleDef(overrides: Partial<ClientModuleDefinition>): ClientModuleDefinition {
  return {
    id: overrides.modulePackageId ?? overrides.moduleType ?? "pino_side_cabinet",
    moduleType: overrides.moduleType ?? "pino_side_cabinet",
    modulePackageId: overrides.modulePackageId ?? "pino_nobilia_side_cabinet_vkh_2026_v1",
    packageVersion: "1.0.0",
    packageHash: "hash",
    name: overrides.name ?? "Module",
    enabled: overrides.enabled ?? true,
    runtimeBuilderKey: overrides.runtimeBuilderKey ?? "pinoSideCabinet.v1",
    category: overrides.category ?? "tall_cabinet",
    ...overrides
  };
}

function variant(overrides: Partial<VendorProductVariant>): VendorProductVariant {
  return attachVendorModuleIntent({
    productTemplateId: "pino_side_cabinet_gbs_fb_page245",
    sourcePdf: "VKH_2026_CZ.pdf",
    sourcePage: 245,
    articleCode: "GBS03FB",
    articleFamily: "GBS",
    widthCm: null,
    widthMm: 600,
    variantCode: "FB",
    variantCodeStatus: "extracted",
    catalogKey: "GBS-FB",
    productTemplateName: "Bocni skrinka pro vestavne spotrebice",
    notes: ["1 zasuvka", "Vyska vyklenku 590 mm", "2 prestavitelne police", "1 prestavitelna police"],
    confidence: 0.99,
    needsReview: false,
    ...overrides
  });
}

function catalog(args: {
  modules: ClientModuleDefinition[];
  productVariants: VendorProductVariant[];
}): Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults"> {
  return {
    clientId: "client_pino_nobilia_vkh_2026",
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
        pages: [245],
        productVariants: args.productVariants.length,
        productTemplates: 0,
        pricingReferences: 0,
        importedAt: "2026-06-17T00:00:00.000Z",
        importStatus: "review_staging",
        productionImportApproved: false,
        notes: []
      }
    }
  };
}

describe("pinoModuleResolver", () => {
  it("resolves a tall microwave side-cabinet description to the matching PINO module", () => {
    const result = resolvePinoModuleDescription(catalog({
      modules: [moduleDef({})],
      productVariants: [
        variant({}),
        variant({
          productTemplateId: "pino_side_cabinet_gb_fb_page245",
          articleCode: "GB03FB",
          articleFamily: "GB",
          catalogKey: "GB-FB",
          notes: ["Vyska vyklenku 590 mm", "2 prestavitelne police", "1 prestavitelna police"]
        })
      ]
    }), "vloz mi tam vysoky modul, dole dvierka, potom jeden suflik, nad tym mikrovlnku a hore policky");

    expect(result.status).toBe("resolved");
    expect(result.candidates[0]?.entry.catalogKey).toBe("GBS-FB");
  });

  it("marks underspecified tall cabinet requests as ambiguous", () => {
    const result = resolvePinoModuleDescription(catalog({
      modules: [moduleDef({})],
      productVariants: [
        variant({}),
        variant({
          productTemplateId: "pino_side_cabinet_gb2a_fb_page245",
          articleCode: "GB2A03FB",
          articleFamily: "GB2A",
          catalogKey: "GB2A-FB",
          notes: ["2 vysuvy", "Vyska vyklenku 590 mm", "2 prestavitelne police"]
        })
      ]
    }), "vloz mi vysoky modul s policami");

    expect(result.status === "ambiguous" || result.status === "needs_review").toBe(true);
    expect(result.candidates.length).toBeGreaterThan(1);
  });

  it("builds tenant-specific RAG chunks from the PINO catalog", () => {
    const chunks = buildPinoCatalogAssistantRagChunks(catalog({
      modules: [moduleDef({})],
      productVariants: [variant({})]
    }));

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.source).toContain("tenant-catalog/");
    expect(chunks.some((chunk) => normalizePinoSearchText(chunk.text).includes("drawer"))).toBe(true);
  });
});
