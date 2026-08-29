import { describe, expect, it } from "vitest";
import type { ClientCatalog, ClientModuleDefinition, VendorProductVariant } from "../core/catalog/catalog-types";
import { attachVendorModuleIntent } from "../core/catalog/vendor-module-intent";
import { buildPinoVendorKitchenCatalog, hasPinoVendorKitchenCatalog } from "./pinoVendorKitchenCatalog";

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
    productTemplateId: "tpl_ua",
    sourcePdf: "VKH_2026_CZ.pdf",
    sourcePage: 99,
    articleCode: "UA45",
    articleFamily: "UA",
    widthCm: 45,
    widthMm: 450,
    variantCode: null,
    variantCodeStatus: "none_expected",
    catalogKey: "UA-45",
    productTemplateName: "Spodni skrinka; 1 vysuv",
    notes: ["1 vysuv"],
    confidence: 0.97,
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

describe("pinoVendorKitchenCatalog", () => {
  it("recognizes the PINO vendor tenant catalog", () => {
    expect(hasPinoVendorKitchenCatalog({
      clientId: "client_pino_nobilia_vkh_2026",
      vendorCatalog: null as never
    })).toBe(true);
  });

  it("builds one catalog entry per vendor template and folds widths into the same product", () => {
    const result = buildPinoVendorKitchenCatalog(catalog({
      modules: [moduleDef({
        moduleType: "drawer_low",
        modulePackageId: "pino_nobilia_drawer_low_vkh_2026_v1",
        runtimeBuilderKey: "drawerLow.v1"
      })],
      productVariants: [
        variant({
          productTemplateId: "tpl_ua",
          articleCode: "UA45",
          catalogKey: "UA-45",
          widthCm: 45,
          widthMm: 450
        }),
        variant({
          productTemplateId: "tpl_ua",
          articleCode: "UA60",
          catalogKey: "UA-60",
          widthCm: 60,
          widthMm: 600,
          confidence: 0.99
        })
      ]
    }));

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      role: "low",
      groupId: "drawer_base_cabinets",
      moduleType: "drawer_low",
      modulePackageId: "pino_nobilia_drawer_low_vkh_2026_v1",
      catalogKey: "UA-60",
      widthLabel: "45 cm / 60 cm"
    });
    expect(result.entries[0]?.availableWidthsMm).toEqual([450, 600]);
    expect(result.groups.low.get("drawer_base_cabinets")).toHaveLength(1);
  });

  it("keeps accessory cover panels in the accessory role with their own group", () => {
    const result = buildPinoVendorKitchenCatalog(catalog({
      modules: [moduleDef({
        moduleType: "fwm_interior_cladding_1",
        modulePackageId: "pino_nobilia_fwm_interior_cladding_1_vkh_2026_v1",
        runtimeBuilderKey: "fwm_interior_cladding_1.v1",
        category: "custom"
      })],
      productVariants: [variant({
        productTemplateId: "tpl_upf",
        sourcePage: 107,
        articleFamily: "UPF",
        articleCode: "UPF10",
        catalogKey: "UPF-10",
        widthCm: 10,
        widthMm: 100,
        productTemplateName: "Kryci lista pro spodni skrinky; Material cela; Montaz mezi stenu a korpus",
        notes: ["Material cela", "Montaz mezi stenu a korpus"]
      })]
    }));

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.role).toBe("accessory");
    expect(result.entries[0]?.groupId).toBe("cover_panels");
    expect(result.groups.accessory.get("cover_panels")?.[0]?.moduleType).toBe("fwm_interior_cladding_1");
  });

  it("uses exact PINO side-cabinet groups and module labels instead of generic heuristic labels", () => {
    const result = buildPinoVendorKitchenCatalog(catalog({
      modules: [moduleDef({
        moduleType: "pino_side_cabinet",
        modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1",
        runtimeBuilderKey: "pinoSideCabinet.v1",
        category: "tall_cabinet"
      })],
      productVariants: [
        variant({
          productTemplateId: "pino_side_cabinet_ss2a_k_page243",
          sourcePage: 243,
          articleFamily: "SS2A",
          articleCode: "SS2A45K",
          catalogKey: "SS2A-45-K",
          widthCm: 45,
          widthMm: 450,
          variantCode: "K",
          variantCodeStatus: "extracted",
          productTemplateName: "Bočni skřínka na nádobí",
          notes: ["1 zásuvka", "2 výsuvy"]
        }),
        variant({
          productTemplateId: "pino_side_cabinet_ss2a_k_page243",
          sourcePage: 243,
          articleFamily: "SS2A",
          articleCode: "SS2A60K",
          catalogKey: "SS2A-60-K",
          widthCm: 60,
          widthMm: 600,
          variantCode: "K",
          variantCodeStatus: "extracted",
          productTemplateName: "Bočni skřínka na nádobí",
          notes: ["1 zásuvka", "2 výsuvy"],
          confidence: 0.99
        })
      ]
    }));

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      role: "tall",
      groupId: "dish_storage_drawers",
      groupLabel: "Bočné skrinky so zásuvkami/výsuvmi",
      productTemplateName: "Boční skříňka na nádobí SS2A",
      moduleType: "pino_side_cabinet",
      modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1",
      catalogKey: "SS2A-60-K",
      widthLabel: "45 cm / 60 cm",
      templateNeedsReview: false
    });
    expect(result.groups.tall.get("dish_storage_drawers")).toHaveLength(1);
  });

  it("can include review templates so the picker exposes staged tall and accessory PINO modules", () => {
    const result = buildPinoVendorKitchenCatalog(catalog({
      modules: [
        moduleDef({
          moduleType: "pino_side_cabinet",
          modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1",
          runtimeBuilderKey: "pinoSideCabinet.v1",
          category: "tall_cabinet"
        }),
        moduleDef({
          moduleType: "fwm_interior_cladding_2",
          modulePackageId: "pino_nobilia_fwm_interior_cladding_2_vkh_2026_v1",
          runtimeBuilderKey: "fwm_interior_cladding_2.v1",
          category: "custom"
        })
      ],
      productVariants: [
        variant({
          productTemplateId: "pino_side_cabinet_s_bk_page243",
          sourcePage: 243,
          articleFamily: "S",
          articleCode: "S45BK",
          catalogKey: "S-45-BK",
          widthCm: 45,
          widthMm: 450,
          variantCode: "BK",
          variantCodeStatus: "extracted",
          productTemplateName: "BoÄŤnĂ­ skĹ™Ă­Ĺka pro smetĂˇky",
          notes: ["1 drĂˇtÄ›nĂˇ police"],
          needsReview: true
        }),
        variant({
          productTemplateId: "tpl_corner_cover",
          sourcePage: 101,
          articleFamily: "UPEF",
          articleCode: "UPEF90",
          catalogKey: "UPEF-90",
          widthCm: 90,
          widthMm: 900,
          productTemplateName: "RohovĂˇ krycĂ­ liĹˇta pro spodnĂ­ skĹ™Ă­Ĺky",
          notes: ["MateriĂˇl ÄŤela", "ĹeĹˇenĂ­ 90Â°"],
          needsReview: true
        })
      ]
    }), "", { includeNeedsReview: true });

    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((entry) => entry.role)).toEqual(expect.arrayContaining(["tall", "accessory"]));
    expect(result.entries.every((entry) => entry.templateNeedsReview)).toBe(true);
  });
});
