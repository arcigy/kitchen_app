import { describe, expect, it } from "vitest";
import type { ClientCatalog, VendorProductVariant } from "../../core/catalog/catalog-types";
import { applyKitchenContextToModuleParams } from "../../layout/kitchenMaterialSync";
import { makeDefaultKitchenContext, resolveContext } from "../../layout/kitchenContext";
import { resolvePinoSideCabinetCatalogVariant } from "./catalogResolver";
import { createPinoSideCabinetPreviewCatalog } from "./previewCatalog";
import {
  createPinoSideCabinetPlacementCandidate,
  getPinoSideCabinetCapability,
  getPinoSideCabinetPreferredPlacementContext,
  validatePinoSideCabinetApplianceHost,
  validatePinoSideCabinetPlacementCandidate
} from "./rules";
import {
  getPinoSideCabinetDefinitions,
  getPinoSideCabinetSystem,
  makeDefaultPinoSideCabinetParams,
  normalizePinoSideCabinetParams
} from "./types";

function createVendorCatalogIndex(): NonNullable<ClientCatalog["vendorCatalog"]> {
  const definitions = getPinoSideCabinetDefinitions();
  const sourcePdf = getPinoSideCabinetSystem().sourcePdf;
  const productVariants: VendorProductVariant[] = definitions.flatMap((definition) =>
    definition.catalogRows.map((row) => ({
      productTemplateId: definition.definitionId,
      sourcePdf,
      sourcePage: definition.sourcePage,
      articleCode: row.articleCode,
      articleFamily: definition.articleFamily,
      widthCm: row.widthCm,
      variantCode: definition.variantCode,
      variantCodeStatus: definition.variantCode ? "extracted" : "none_expected",
      catalogKey: row.catalogKey,
      productTemplateName: definition.productTemplateName,
      widthMm: row.widthMm,
      priceIndex: row.priceIndex,
      pricingReferenceRaw: row.pricingReferenceRaw,
      priceGroupValues: row.priceGroupValues,
      confidence: 1,
      needsReview: false
    }))
  );
  return {
    vendorId: "pino_nobilia",
    displayName: "PINO/Nobilia VKH 2026 CZ",
    source: "vkh_2026_cz_pdf",
    productVariants,
    productTemplates: [],
    pricingReferences: [],
    extractionMeta: {
      sourcePdf,
      pages: [...new Set(definitions.map((definition) => definition.sourcePage))],
      productVariants: productVariants.length,
      productTemplates: 0,
      pricingReferences: 0,
      importedAt: "2026-06-16T00:00:00.000Z",
      importStatus: "review_staging",
      productionImportApproved: false,
      notes: []
    }
  };
}

describe("PINO side cabinet rules", () => {
  it("normalizes side cabinets as tall kitchen modules without worktop binding", () => {
    const params = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb_fb_page245",
      width: 600
    });
    const capability = getPinoSideCabinetCapability(params);

    expect(params.assemblyContext).toBe("kitchen");
    expect(params.kitchenModuleRole).toBe("tall");
    expect(params.requiresWorktop).toBe(false);
    expect(params.placementZone).toBe("tall_appliance");
    expect(params.applianceCategory).toBe("oven_tall");
    expect(params.applianceWidthMm).toBe(540);
    expect(params.applianceHeightMm).toBe(540);
    expect(params.applianceDepthMm).toBe(450);
    expect(capability.allowedPlacementContexts).toContain("appliance_zone");
  });

  it("rejects appliance-side placement when appliance niche is missing", () => {
    const params = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gbs_fb_page245",
      width: 600
    });
    const result = validatePinoSideCabinetPlacementCandidate(params, {
      placementContext: "kitchen_wall",
      hasApplianceNiche: false,
      applianceCategory: "oven_tall",
      isCornerPosition: false
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("requires an appliance niche");
    expect(result.warnings.join(" ")).toContain("appliance zone");
  });

  it("derives preferred placement context from the selected product group", () => {
    const tallUtility = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "utility_side",
      definitionId: "pino_side_cabinet_s_bk_page243",
      width: 450
    });
    const tallAppliance = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb_fb_page245",
      width: 600
    });

    expect(getPinoSideCabinetPreferredPlacementContext(tallUtility)).toBe("kitchen_wall");
    expect(getPinoSideCabinetPreferredPlacementContext(tallAppliance)).toBe("appliance_zone");
  });

  it("builds one consistent placement candidate for resolver and runtime validation", () => {
    const tallUtility = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "utility_side",
      definitionId: "pino_side_cabinet_s_bk_page243",
      width: 450
    });
    const tallAppliance = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb_fb_page245",
      width: 600
    });

    expect(createPinoSideCabinetPlacementCandidate(tallUtility)).toMatchObject({
      placementContext: "kitchen_wall",
      hasApplianceNiche: false,
      applianceCategory: null,
      isCornerPosition: false
    });
    expect(createPinoSideCabinetPlacementCandidate(tallAppliance)).toMatchObject({
      placementContext: "appliance_zone",
      hasApplianceNiche: true,
      applianceCategory: "oven_tall",
      isCornerPosition: false
    });
  });

  it("resolves the concrete catalog variant from normalized params", () => {
    const previewCatalog = createPinoSideCabinetPreviewCatalog();
    const catalog = { vendorCatalog: createVendorCatalogIndex() };
    const params = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "dish_storage_drawers",
      definitionId: "pino_side_cabinet_ss2a_k_page243",
      width: 500
    });

    applyKitchenContextToModuleParams(params, resolveContext(makeDefaultKitchenContext(previewCatalog)), previewCatalog);
    const resolution = resolvePinoSideCabinetCatalogVariant(catalog, params, {
      placementContext: "kitchen_wall",
      hasApplianceNiche: false,
      isCornerPosition: false
    });

    expect(params.kitchenModuleRole).toBe("tall");
    expect(params.depth).toBe(resolveContext(makeDefaultKitchenContext(previewCatalog)).moduleDepthMm);
    expect(resolution.status).toBe("resolved");
    expect(resolution.catalogKey).toBe("SS2A-50-K");
    expect(resolution.placement.valid).toBe(true);
  });

  it("accepts appliance insertion only for groups with a real appliance opening", () => {
    const appliance = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb_fb_page245",
      width: 600
    });
    const utility = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "utility_side",
      definitionId: "pino_side_cabinet_s_bk_page243",
      width: 600
    });

    const applianceResult = validatePinoSideCabinetApplianceHost(appliance, {
      applianceCategory: "oven_tall",
      widthMm: 540,
      heightMm: 540,
      depthMm: 480
    });
    const utilityResult = validatePinoSideCabinetApplianceHost(utility, {
      applianceCategory: "oven_tall",
      widthMm: 560,
      heightMm: 560,
      depthMm: 560
    });

    expect(applianceResult.valid).toBe(true);
    expect(applianceResult.opening?.heightMm ?? 0).toBeGreaterThanOrEqual(550);
    expect(utilityResult.valid).toBe(false);
    expect(utilityResult.errors.join(" ")).toContain("does not accept built-in appliances");
  });

  it("rejects oversized appliances even in appliance-side groups", () => {
    const appliance = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb_fb_page245",
      width: 600
    });
    const result = validatePinoSideCabinetApplianceHost(appliance, {
      applianceCategory: "oven_tall",
      widthMm: 580,
      heightMm: 700,
      depthMm: 700
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("exceeds opening");
    expect(result.warnings.join(" ")).toContain("depth");
  });

  it("keeps PDF notes and module labels in the side-cabinet preview vendor index", () => {
    const previewCatalog = createPinoSideCabinetPreviewCatalog();
    const variant = previewCatalog.vendorCatalog?.productVariants.find((item) => item.catalogKey === "S-45-BK");

    expect(variant?.nameRaw).toBe("Boční skříňka pro smetáky");
    expect(variant?.notes).toContain("Preview vendor index generated from PINO side-cabinet definitions.");
    expect((variant?.notes ?? []).length).toBeGreaterThanOrEqual(4);
    expect(variant?.rulesRaw).toContain("Review/staging data, nepoužívat na produkční import.");
  });
});
