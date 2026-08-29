import type { ClientCatalog, VendorProductVariant } from "./catalog-types";
import type { ModuleParams, ModuleType } from "../../model/cabinetTypes";
import { makeDefaultModuleParams, normalizeModuleParams, validateModule } from "../../model/cabinetTypes";
import {
  resolveVendorModulePackage,
  type VendorModulePackageResolution,
  type VendorModulePackageResolutionCandidate,
  type VendorModulePackageResolutionRequest,
  type VendorModulePackageResolutionStatus
} from "./vendor-module-package-resolver";
import {
  getPinoSideCabinetDefinitions,
  getPinoSideCabinetDefinition,
  getPinoSideCabinetProductGroup,
  type PinoSideCabinetParams
} from "../../modules/pinoSideCabinet/types";
import {
  validatePinoSideCabinetApplianceHost,
  type PinoSideCabinetApplianceHostValidation
} from "../../modules/pinoSideCabinet/rules";

export type VendorModuleSeedResolutionStatus = VendorModulePackageResolutionStatus;

export type VendorModuleSeedResolutionRequest = VendorModulePackageResolutionRequest & {
  applianceCategory?: string;
  applianceWidthMm?: number;
  applianceHeightMm?: number;
  applianceDepthMm?: number;
};

export type VendorModuleSeedApplianceHostStatus = "not_applicable" | "compatible" | "incompatible";

export type VendorModuleSeedResolution = {
  status: VendorModuleSeedResolutionStatus;
  catalogKey: string | null;
  moduleType: string | null;
  modulePackageId: string | null;
  runtimeBuilderKey: string | null;
  placementZone: VendorModulePackageResolution["placementZone"];
  kitchenModuleRole: VendorModulePackageResolution["kitchenModuleRole"];
  requiresWorktop: boolean;
  requiresCorner: boolean;
  requiresApplianceOpening: boolean;
  params: ModuleParams | null;
  validationErrors: string[];
  vendorVariant: VendorProductVariant | null;
  candidates: VendorModulePackageResolutionCandidate[];
  reasons: string[];
  applianceHostStatus: VendorModuleSeedApplianceHostStatus;
  applianceHostValidation: PinoSideCabinetApplianceHostValidation | null;
  modulePackageResolution: VendorModulePackageResolution;
};

type VariantFacts = {
  widthMm: number | null;
  widthCm: number | null;
  drawerCount: number;
  pulloutCount: number;
  swingDoorCount: number;
  flapCount: number;
  shelfCount: number;
  adjustableShelfCount: number;
  fixedShelfCount: number;
  supportsMixedDoorAndDrawerFronts: boolean;
  isCorner: boolean;
  isHobZone: boolean;
  reducedDepthCapable: boolean;
  shallowDepthMm: number | null;
  plannedWidthMm: number | null;
  plannedDepthMm: number | null;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function candidateMatchesVariant(variant: VendorProductVariant, candidate: VendorModulePackageResolutionCandidate): boolean {
  return (
    variant.catalogKey === candidate.catalogKey &&
    variant.articleFamily === candidate.articleFamily &&
    (variant.widthCm ?? null) === candidate.widthCm &&
    (variant.variantCode ?? null) === candidate.variantCode &&
    variant.productTemplateName === candidate.productTemplateName &&
    variant.sourcePage === candidate.sourcePage
  );
}

function findResolvedVariants(
  catalog: Pick<ClientCatalog, "vendorCatalog">,
  resolution: VendorModulePackageResolution
): VendorProductVariant[] {
  const variants = catalog.vendorCatalog?.productVariants ?? [];
  return variants.filter((variant) => resolution.candidates.some((candidate) => candidateMatchesVariant(variant, candidate)));
}

function sumRegexCount(texts: string[], pattern: RegExp): number {
  let total = 0;
  for (const text of texts) {
    for (const match of text.matchAll(pattern)) {
      total += Number(match[1] ?? 0);
    }
  }
  return total;
}

function firstPair(texts: string[], pattern: RegExp): [number, number] | null {
  for (const text of texts) {
    const match = pattern.exec(text);
    if (!match) continue;
    const first = Number(match[1] ?? 0);
    const second = Number(match[2] ?? 0);
    if (Number.isFinite(first) && Number.isFinite(second) && first > 0 && second > 0) return [first, second];
  }
  return null;
}

function inferDrawerCountFromArticleFamily(articleFamily: string): number {
  const family = articleFamily.trim().toUpperCase();
  const digitMatch = family.match(/(\d+)(?:A|S)/);
  if (digitMatch) return Number(digitMatch[1] ?? 0);
  if (family.endsWith("US")) return 1;
  return 0;
}

function collectFacts(variant: VendorProductVariant): VariantFacts {
  const normalizedNotes = [...new Set((variant.notes ?? []).map(normalizeText).filter(Boolean))];
  const noteDrawerCount = sumRegexCount(normalizedNotes, /(\d+)\s+[^|;,.]*zasuv/g);
  const notePulloutCount = sumRegexCount(normalizedNotes, /(\d+)\s+[^|;,.]*vysuv/g);
  const noteSwingDoorCount = sumRegexCount(normalizedNotes, /(\d+)\s+[^|;,.]*(?:otocna|otocne|dvirka|dvirek)/g);
  const noteFlapCount = sumRegexCount(normalizedNotes, /(\d+)\s+[^|;,.]*(?:sklapeci|sklapecich|vyklop)/g);
  const noteAdjustableShelfCount = sumRegexCount(normalizedNotes, /(\d+)\s+[^|;,.]*prestaviteln[^|;,.]*polic/g);
  const noteFixedShelfCount = sumRegexCount(normalizedNotes, /(\d+)\s+[^|;,.]*(?:pevna|pevne)[^|;,.]*polic/g);
  const noteGenericShelfCount = sumRegexCount(normalizedNotes, /(\d+)\s+[^|;,.]*polic/g);
  const noteHasStructuralCounts =
    noteDrawerCount > 0 ||
    notePulloutCount > 0 ||
    noteSwingDoorCount > 0 ||
    noteFlapCount > 0 ||
    noteAdjustableShelfCount > 0 ||
    noteFixedShelfCount > 0 ||
    noteGenericShelfCount > 0;
  const countTextsRaw = noteHasStructuralCounts
    ? normalizedNotes
    : [
        ...normalizedNotes,
        ...[variant.productTemplateName, variant.nameRaw]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map(normalizeText)
      ];
  const countTexts = [...new Set(countTextsRaw.filter(Boolean))];
  const contextTexts = [
    variant.productTemplateName,
    variant.nameRaw,
    ...(variant.notes ?? []),
    ...(variant.rulesRaw ?? [])
  ].map(normalizeText);
  const drawerCount = sumRegexCount(countTexts, /(\d+)\s+[^|;,.]*zasuv/g);
  const pulloutCount = sumRegexCount(countTexts, /(\d+)\s+[^|;,.]*vysuv/g);
  const swingDoorCount = sumRegexCount(countTexts, /(\d+)\s+[^|;,.]*(?:otocna|otocne|dvirka|dvirek)/g);
  const flapCount = sumRegexCount(countTexts, /(\d+)\s+[^|;,.]*(?:sklapeci|sklapecich|vyklop)/g);
  const adjustableShelfCount = sumRegexCount(countTexts, /(\d+)\s+[^|;,.]*prestaviteln[^|;,.]*polic/g);
  const fixedShelfCount = sumRegexCount(countTexts, /(\d+)\s+[^|;,.]*(?:pevna|pevne)[^|;,.]*polic/g);
  const genericShelfCount = sumRegexCount(countTexts, /(\d+)\s+[^|;,.]*polic/g);
  const plannedPair = firstPair(contextTexts, /(\d{3,4})\s*x\s*(\d{3,4})\s*mm/);
  const normalizedText = contextTexts.join(" | ");
  const articleFamily = (variant.articleFamily ?? "").trim().toUpperCase();
  const shallowDepthMatch = normalizedText.match(/hloubka korpusu\s*(\d+)\s*mm/);
  const shallowDepthMm = shallowDepthMatch ? Number(shallowDepthMatch[1]) : null;
  const inferredDrawerCount = inferDrawerCountFromArticleFamily(articleFamily);
  const drawerCountWithFallback = drawerCount > 0 || pulloutCount > 0 ? drawerCount : inferredDrawerCount;
  const swingDoorCountWithFallback = swingDoorCount > 0 ? swingDoorCount : (articleFamily === "US" ? 1 : 0);
  const shelfCountWithFallback = Math.max(adjustableShelfCount + fixedShelfCount, genericShelfCount, articleFamily === "US" ? 1 : 0);
  const reducedDepthByFamily = /^V(U|UR|US|U5S)/.test(articleFamily);

  return {
    widthMm: typeof variant.widthMm === "number" && Number.isFinite(variant.widthMm)
      ? Math.round(variant.widthMm)
      : typeof variant.widthCm === "number" && Number.isFinite(variant.widthCm)
        ? Math.round(variant.widthCm * 10)
        : null,
    widthCm: typeof variant.widthCm === "number" && Number.isFinite(variant.widthCm) ? Math.round(variant.widthCm) : null,
    drawerCount: drawerCountWithFallback,
    pulloutCount,
    swingDoorCount: swingDoorCountWithFallback,
    flapCount,
    shelfCount: shelfCountWithFallback,
    adjustableShelfCount,
    fixedShelfCount,
    supportsMixedDoorAndDrawerFronts: swingDoorCountWithFallback > 0 && (drawerCountWithFallback > 0 || pulloutCount > 0),
    isCorner: normalizedText.includes("rohova") || normalizedText.includes("rohove") || normalizedText.includes("corner"),
    isHobZone: normalizedText.includes("varn") || normalizedText.includes("indukc") || normalizedText.includes("ventilator"),
    reducedDepthCapable: normalizedText.includes("zkracenou hloubkou") || normalizedText.includes("zmenseni hloubky") || normalizedText.includes("hloubka korpusu 326") || reducedDepthByFamily,
    shallowDepthMm: Number.isFinite(shallowDepthMm) && shallowDepthMm && shallowDepthMm > 0 ? shallowDepthMm : null,
    plannedWidthMm: plannedPair?.[0] ?? null,
    plannedDepthMm: plannedPair?.[1] ?? null
  };
}

function applyCommonVariantMetadata<T extends ModuleParams>(
  params: T,
  args: {
    variant: VendorProductVariant;
    resolution: VendorModulePackageResolution;
    facts: VariantFacts;
  }
): T {
  const record = params as Record<string, unknown>;
  record.modulePackageId = args.resolution.modulePackageId;
  record.catalogKey = args.variant.catalogKey;
  record.articleCode = args.variant.articleCode;
  record.articleFamily = args.variant.articleFamily;
  record.variantCode = args.variant.variantCode;
  record.productTemplateName = args.variant.productTemplateName;
  record.vendorProductTemplateId = args.variant.productTemplateId;
  record.vendorSourcePdf = args.variant.sourcePdf;
  record.vendorSourcePage = args.variant.sourcePage;
  record.vendorNotes = [...(args.variant.notes ?? [])];
  record.vendorRulesRaw = [...(args.variant.rulesRaw ?? [])];
  record.vendorPriceGroupValues = { ...(args.variant.priceGroupValues ?? {}) };
  record.vendorFeatureTags = [...(args.variant.moduleIntent?.featureTags ?? [])];
  record.vendorPlacementZone = args.resolution.placementZone;
  record.vendorKitchenModuleRole = args.resolution.kitchenModuleRole;
  record.vendorRequiresCorner = args.resolution.requiresCorner;
  record.vendorRequiresApplianceOpening = args.resolution.requiresApplianceOpening;
  record.vendorRequiresWorktop = args.resolution.requiresWorktop;
  record.vendorRequiresWallAttachment = args.variant.moduleIntent?.requiresWallAttachment ?? false;
  record.vendorReducedDepthCapable = args.facts.reducedDepthCapable;
  record.vendorShallowDepthMm = args.facts.shallowDepthMm;
  return params;
}

function hasRequestedApplianceHostCheck(request: VendorModuleSeedResolutionRequest) {
  return (
    (typeof request.applianceCategory === "string" && request.applianceCategory.trim().length > 0) ||
    typeof request.applianceWidthMm === "number" ||
    typeof request.applianceHeightMm === "number" ||
    typeof request.applianceDepthMm === "number"
  );
}

function validateResolvedApplianceHost(
  params: ModuleParams,
  request: VendorModuleSeedResolutionRequest
): {
  applianceHostStatus: VendorModuleSeedApplianceHostStatus;
  applianceHostValidation: PinoSideCabinetApplianceHostValidation | null;
  reasons: string[];
} {
  if (!hasRequestedApplianceHostCheck(request)) {
    return {
      applianceHostStatus: "not_applicable",
      applianceHostValidation: null,
      reasons: []
    };
  }

  if (params.type !== "pino_side_cabinet") {
    return {
      applianceHostStatus: "not_applicable",
      applianceHostValidation: null,
      reasons: ["requested_appliance_host_check_not_supported_for_module_type"]
    };
  }

  const validation = validatePinoSideCabinetApplianceHost(params as PinoSideCabinetParams, {
    applianceCategory: request.applianceCategory?.trim() || null,
    widthMm: request.applianceWidthMm,
    heightMm: request.applianceHeightMm,
    depthMm: request.applianceDepthMm
  });
  return {
    applianceHostStatus: validation.valid ? "compatible" : "incompatible",
    applianceHostValidation: validation,
    reasons: validation.valid ? [] : ["requested_appliance_not_compatible_with_host"]
  };
}

function createDrawerLowSeed(
  catalog: Pick<ClientCatalog, "kitchenDefaults">,
  variant: VendorProductVariant,
  resolution: VendorModulePackageResolution
): { params: ModuleParams | null; reasons: string[] } {
  const facts = collectFacts(variant);
  const frontCount = facts.drawerCount + facts.pulloutCount;
  if (frontCount <= 0) {
    return { params: null, reasons: ["drawer_low_seed_has_no_drawer_or_pullout_fronts"] };
  }
  if (facts.supportsMixedDoorAndDrawerFronts) {
    return { params: null, reasons: ["mixed_swing_doors_and_drawers_need_custom_builder"] };
  }

  const params = makeDefaultModuleParams("drawer_low") as Record<string, unknown>;
  params.width = facts.widthMm ?? params.width;
  if (facts.shallowDepthMm) params.depth = facts.shallowDepthMm;
  params.drawerCount = clamp(frontCount, 1, 8);
  params.frontStackPreset = facts.drawerCount > 0 && facts.pulloutCount > 0 ? "top_split" : "equal";
  if (facts.drawerCount > 0 && facts.pulloutCount > 0) params.topFrontHeightMm = 140;
  if (catalog.kitchenDefaults.defaultPlinthHeightMm) params.plinthHeight = catalog.kitchenDefaults.defaultPlinthHeightMm;
  if (catalog.kitchenDefaults.defaultWorktopThicknessMm) params.worktopThicknessMm = catalog.kitchenDefaults.defaultWorktopThicknessMm;
  if (catalog.kitchenDefaults.defaultHandleComponentId) params.handleComponentId = catalog.kitchenDefaults.defaultHandleComponentId;
  if (catalog.kitchenDefaults.defaultDrawerSystemComponentId) params.runnerComponentId = catalog.kitchenDefaults.defaultDrawerSystemComponentId;
  if (catalog.kitchenDefaults.carcassMaterialId) {
    params.bodyMaterialId = catalog.kitchenDefaults.carcassMaterialId;
    params.carcassMaterialId = catalog.kitchenDefaults.carcassMaterialId;
  }
  if (catalog.kitchenDefaults.frontMaterialId) params.frontMaterialId = catalog.kitchenDefaults.frontMaterialId;
  if (catalog.kitchenDefaults.drawerBottomMaterialId) params.drawerBottomMaterialId = catalog.kitchenDefaults.drawerBottomMaterialId;
  return {
    params: applyCommonVariantMetadata(normalizeModuleParams(params as ModuleParams), { variant, resolution, facts }),
    reasons: []
  };
}

function createSwingShelvesSeed(
  catalog: Pick<ClientCatalog, "kitchenDefaults">,
  variant: VendorProductVariant,
  resolution: VendorModulePackageResolution
): { params: ModuleParams | null; reasons: string[] } {
  const facts = collectFacts(variant);
  if (facts.drawerCount > 0 || facts.pulloutCount > 0) {
    return { params: null, reasons: ["swing_shelves_seed_has_drawer_fronts"] };
  }
  const params = makeDefaultModuleParams("swing_shelves_low") as Record<string, unknown>;
  params.width = facts.widthMm ?? params.width;
  if (facts.shallowDepthMm) params.depth = facts.shallowDepthMm;
  params.shelfCount = clamp(Math.max(1, facts.shelfCount || 1), 1, 12);
  params.doorDouble = facts.swingDoorCount >= 2 || (typeof params.width === "number" && Number(params.width) >= 800);
  if (catalog.kitchenDefaults.defaultPlinthHeightMm) params.plinthHeight = catalog.kitchenDefaults.defaultPlinthHeightMm;
  if (catalog.kitchenDefaults.defaultWorktopThicknessMm) params.worktopThicknessMm = catalog.kitchenDefaults.defaultWorktopThicknessMm;
  if (catalog.kitchenDefaults.defaultHandleComponentId) params.handleComponentId = catalog.kitchenDefaults.defaultHandleComponentId;
  if (catalog.kitchenDefaults.defaultHingeComponentId) params.hingeComponentId = catalog.kitchenDefaults.defaultHingeComponentId;
  if (catalog.kitchenDefaults.carcassMaterialId) {
    params.bodyMaterialId = catalog.kitchenDefaults.carcassMaterialId;
    params.carcassMaterialId = catalog.kitchenDefaults.carcassMaterialId;
  }
  if (catalog.kitchenDefaults.frontMaterialId) params.frontMaterialId = catalog.kitchenDefaults.frontMaterialId;
  return {
    params: applyCommonVariantMetadata(normalizeModuleParams(params as ModuleParams), { variant, resolution, facts }),
    reasons: []
  };
}

function createCornerSeed(
  catalog: Pick<ClientCatalog, "kitchenDefaults">,
  variant: VendorProductVariant,
  resolution: VendorModulePackageResolution
): { params: ModuleParams | null; reasons: string[] } {
  const facts = collectFacts(variant);
  const params = makeDefaultModuleParams("corner_shelf_lower") as Record<string, unknown>;
  const fallbackLength = facts.widthMm ?? 900;
  params.lengthX = facts.plannedWidthMm ?? fallbackLength;
  params.lengthZ = facts.plannedDepthMm ?? fallbackLength;
  params.shelfCount = clamp(Math.max(1, facts.shelfCount || 1), 1, 12);
  params.doorDouble = facts.swingDoorCount >= 2 || true;
  if (catalog.kitchenDefaults.defaultPlinthHeightMm) params.plinthHeight = catalog.kitchenDefaults.defaultPlinthHeightMm;
  if (catalog.kitchenDefaults.defaultWorktopThicknessMm) params.worktopThicknessMm = catalog.kitchenDefaults.defaultWorktopThicknessMm;
  if (catalog.kitchenDefaults.defaultHandleComponentId) params.handleComponentId = catalog.kitchenDefaults.defaultHandleComponentId;
  if (catalog.kitchenDefaults.defaultHingeComponentId) params.hingeComponentId = catalog.kitchenDefaults.defaultHingeComponentId;
  if (catalog.kitchenDefaults.carcassMaterialId) {
    params.bodyMaterialId = catalog.kitchenDefaults.carcassMaterialId;
    params.carcassMaterialId = catalog.kitchenDefaults.carcassMaterialId;
  }
  if (catalog.kitchenDefaults.frontMaterialId) params.frontMaterialId = catalog.kitchenDefaults.frontMaterialId;
  return {
    params: applyCommonVariantMetadata(normalizeModuleParams(params as ModuleParams), { variant, resolution, facts }),
    reasons: []
  };
}

function createSideCabinetSeed(
  variant: VendorProductVariant,
  resolution: VendorModulePackageResolution
): { params: ModuleParams | null; reasons: string[] } {
  const definition =
    getPinoSideCabinetDefinitions().find((candidate) => candidate.catalogRows.some((row) => row.catalogKey === variant.catalogKey)) ??
    getPinoSideCabinetDefinitions().find((candidate) =>
      candidate.articleFamily === variant.articleFamily && (candidate.variantCode ?? null) === (variant.variantCode ?? null)
    ) ??
    null;
  if (!definition) {
    return { params: null, reasons: ["side_cabinet_definition_not_found_for_vendor_variant"] };
  }

  const row =
    definition.catalogRows.find((candidate) => candidate.catalogKey === variant.catalogKey) ??
    definition.catalogRows[0] ??
    null;
  if (!row) {
    return { params: null, reasons: ["side_cabinet_catalog_row_not_found_for_vendor_variant"] };
  }

  const params = makeDefaultModuleParams("pino_side_cabinet") as PinoSideCabinetParams;
  params.groupId = definition.productGroupId;
  params.definitionId = definition.definitionId;
  params.width = row.widthMm;
  params.catalogKey = row.catalogKey;
  params.articleCode = row.articleCode;

  const facts = collectFacts(variant);
  return {
    params: applyCommonVariantMetadata(normalizeModuleParams(params) as ModuleParams, { variant, resolution, facts }),
    reasons: [
      `side_cabinet_group:${getPinoSideCabinetProductGroup(definition.productGroupId).groupId}`,
      `side_cabinet_definition:${getPinoSideCabinetDefinition(definition.definitionId).definitionId}`
    ]
  };
}

function createFwmBaseSpecialSeed(
  catalog: Pick<ClientCatalog, "kitchenDefaults">,
  variant: VendorProductVariant,
  resolution: VendorModulePackageResolution,
  moduleType: "fwm_kitchen_special_module_1" | "fwm_kitchen_special_module_2" | "fwm_kitchen_special_module_3"
): { params: ModuleParams | null; reasons: string[] } {
  const facts = collectFacts(variant);
  const params = makeDefaultModuleParams(moduleType) as Record<string, unknown>;
  params.width = facts.widthMm ?? params.width;
  params.widthMm = facts.widthMm ?? params.widthMm;
  params.height = 820;
  params.heightMm = 820;
  params.heightCarcass = 782;
  params.depth = facts.shallowDepthMm ?? (facts.reducedDepthCapable ? 500 : 560);
  params.depthMm = params.depth;
  params.drawerCount = clamp(moduleType === "fwm_kitchen_special_module_3" ? 0 : facts.drawerCount + facts.pulloutCount, 0, 12);
  params.doorCount = clamp(moduleType === "fwm_kitchen_special_module_3" ? 0 : facts.swingDoorCount, 0, 12);
  params.shelfCount = clamp(Math.max(moduleType === "fwm_kitchen_special_module_3" ? 1 : 0, facts.shelfCount), 0, 16);
  params.variant =
    moduleType === "fwm_kitchen_special_module_3"
      ? "open_shelf"
      : facts.isHobZone
        ? "appliance_ready"
        : "storage";
  params.requiresWorktop = true;
  params.kitchenModuleRole = "base";
  if (catalog.kitchenDefaults.defaultPlinthHeightMm) params.plinthHeight = catalog.kitchenDefaults.defaultPlinthHeightMm;
  if (catalog.kitchenDefaults.defaultWorktopThicknessMm) params.worktopThicknessMm = catalog.kitchenDefaults.defaultWorktopThicknessMm;
  if (catalog.kitchenDefaults.defaultHandleComponentId) params.handleComponentId = catalog.kitchenDefaults.defaultHandleComponentId;
  if (catalog.kitchenDefaults.defaultHingeComponentId) params.hingeComponentId = catalog.kitchenDefaults.defaultHingeComponentId;
  if (catalog.kitchenDefaults.defaultDrawerSystemComponentId) params.runnerComponentId = catalog.kitchenDefaults.defaultDrawerSystemComponentId;
  if (catalog.kitchenDefaults.carcassMaterialId) params.bodyMaterialId = catalog.kitchenDefaults.carcassMaterialId;
  if (catalog.kitchenDefaults.frontMaterialId) params.frontMaterialId = catalog.kitchenDefaults.frontMaterialId;
  if (catalog.kitchenDefaults.backPanelMaterialId) params.backMaterialId = catalog.kitchenDefaults.backPanelMaterialId;
  if (catalog.kitchenDefaults.plinthMaterialId) params.plinthMaterialId = catalog.kitchenDefaults.plinthMaterialId;
  if (catalog.kitchenDefaults.drawerBottomMaterialId) params.drawerBottomMaterialId = catalog.kitchenDefaults.drawerBottomMaterialId;

  const normalized = applyCommonVariantMetadata(normalizeModuleParams(params as ModuleParams), { variant, resolution, facts });
  const record = normalized as Record<string, unknown>;
  if (facts.isHobZone) {
    const serviceVoidMatch = normalizeText([...(variant.notes ?? []), ...(variant.rulesRaw ?? [])].join(" | ")).match(
      /volny prostor[^0-9]*(\d+)\s*mm/
    );
    record.vendorPlacementHint = "hob_zone";
    record.vendorFrontServiceVoidMm = serviceVoidMatch ? Number(serviceVoidMatch[1]) : null;
  }
  return {
    params: normalized,
    reasons: [
      moduleType === "fwm_kitchen_special_module_3"
        ? "fwm_open_shelf_base_seed"
        : facts.isHobZone
          ? "fwm_appliance_ready_base_seed"
          : "fwm_mixed_base_seed"
    ]
  };
}

function createFwmCladdingSeed(
  catalog: Pick<ClientCatalog, "kitchenDefaults">,
  variant: VendorProductVariant,
  resolution: VendorModulePackageResolution,
  moduleType: "fwm_interior_cladding_1" | "fwm_interior_cladding_2"
): { params: ModuleParams | null; reasons: string[] } {
  const facts = collectFacts(variant);
  const params = makeDefaultModuleParams(moduleType) as Record<string, unknown>;
  const isCorner = moduleType === "fwm_interior_cladding_2" || (variant.moduleIntent?.featureTags ?? []).includes("corner_cover_panel");
  const nominalWidth = facts.widthMm ?? 100;
  const panelWidth = isCorner && facts.plannedWidthMm ? Math.max(40, facts.plannedWidthMm - 560) : nominalWidth;
  params.width = panelWidth;
  params.widthMm = panelWidth;
  params.height = 820;
  params.heightMm = 820;
  params.boardThickness = 8;
  params.depth = 40;
  params.depthMm = 40;
  params.backThickness = 0;
  params.worktopThicknessMm = 0;
  params.requiresWorktop = false;
  params.wallMounted = true;
  params.kitchenModuleRole = null;
  params.variant = "flat_panels";
  if (catalog.kitchenDefaults.frontMaterialId && hasFrontFinishPriority(variant)) params.frontMaterialId = catalog.kitchenDefaults.frontMaterialId;
  if (catalog.kitchenDefaults.carcassMaterialId && !hasFrontFinishPriority(variant)) params.frontMaterialId = catalog.kitchenDefaults.carcassMaterialId;
  if (catalog.kitchenDefaults.carcassMaterialId) params.bodyMaterialId = catalog.kitchenDefaults.carcassMaterialId;
  const normalized = applyCommonVariantMetadata(normalizeModuleParams(params as ModuleParams), { variant, resolution, facts });
  const record = normalized as Record<string, unknown>;
  record.vendorPlacementHint = isCorner ? "corner_cover_panel" : "side_cover_panel";
  record.vendorPlannedWidthMm = facts.plannedWidthMm;
  record.vendorPlannedDepthMm = facts.plannedDepthMm;
  return {
    params: normalized,
    reasons: [isCorner ? "fwm_corner_cover_panel_seed" : "fwm_cover_panel_seed"]
  };
}

function hasFrontFinishPriority(variant: VendorProductVariant): boolean {
  return normalizeText([variant.productTemplateName, ...(variant.notes ?? [])].join(" | ")).includes("material cela");
}

function buildSeedForResolvedModule(
  catalog: Pick<ClientCatalog, "kitchenDefaults">,
  variant: VendorProductVariant,
  resolution: VendorModulePackageResolution
): { params: ModuleParams | null; reasons: string[] } {
  const moduleType = resolution.moduleType as ModuleType | null;
  if (!moduleType) return { params: null, reasons: ["resolved_module_type_missing"] };

  switch (moduleType) {
    case "drawer_low":
      return createDrawerLowSeed(catalog, variant, resolution);
    case "swing_shelves_low":
      return createSwingShelvesSeed(catalog, variant, resolution);
    case "corner_shelf_lower":
      return createCornerSeed(catalog, variant, resolution);
    case "pino_side_cabinet":
      return createSideCabinetSeed(variant, resolution);
    case "fwm_kitchen_special_module_1":
    case "fwm_kitchen_special_module_2":
    case "fwm_kitchen_special_module_3":
      return createFwmBaseSpecialSeed(catalog, variant, resolution, moduleType);
    case "fwm_interior_cladding_1":
    case "fwm_interior_cladding_2":
      return createFwmCladdingSeed(catalog, variant, resolution, moduleType);
    default:
      return { params: null, reasons: [`seed_builder_not_implemented_for_module_type:${moduleType}`] };
  }
}

export function resolveVendorModuleSeed(
  catalog: Pick<ClientCatalog, "modules" | "vendorCatalog" | "kitchenDefaults">,
  request: VendorModuleSeedResolutionRequest
): VendorModuleSeedResolution {
  const modulePackageResolution = resolveVendorModulePackage(catalog, request);
  const base = {
    status: modulePackageResolution.status,
    catalogKey: modulePackageResolution.catalogKey,
    moduleType: modulePackageResolution.moduleType,
    modulePackageId: modulePackageResolution.modulePackageId,
    runtimeBuilderKey: modulePackageResolution.runtimeBuilderKey,
    placementZone: modulePackageResolution.placementZone,
    kitchenModuleRole: modulePackageResolution.kitchenModuleRole,
    requiresWorktop: modulePackageResolution.requiresWorktop,
    requiresCorner: modulePackageResolution.requiresCorner,
    requiresApplianceOpening: modulePackageResolution.requiresApplianceOpening,
    params: null,
    validationErrors: [] as string[],
    vendorVariant: null,
    candidates: modulePackageResolution.candidates,
    reasons: [...modulePackageResolution.reasons],
    applianceHostStatus: "not_applicable",
    applianceHostValidation: null,
    modulePackageResolution
  } satisfies VendorModuleSeedResolution;

  const canAttemptSeed =
    modulePackageResolution.status === "resolved" ||
    (modulePackageResolution.status === "needs_review" && typeof modulePackageResolution.moduleType === "string" && modulePackageResolution.moduleType.length > 0);

  if (!canAttemptSeed) return base;

  const variants = findResolvedVariants(catalog, modulePackageResolution);
  if (variants.length !== 1) {
    return {
      ...base,
      status: variants.length > 1 ? "ambiguous" : "missing",
      reasons: [...base.reasons, variants.length > 1 ? "seed_variant_resolution_ambiguous" : "seed_variant_not_found"]
    };
  }

  const vendorVariant = variants[0]!;
  const seeded = buildSeedForResolvedModule(catalog, vendorVariant, modulePackageResolution);
  if (!seeded.params) {
    return {
      ...base,
      status: "needs_review",
      vendorVariant,
      reasons: [...base.reasons, ...seeded.reasons]
    };
  }

  const validationErrors = validateModule(seeded.params);
  const applianceHost = validateResolvedApplianceHost(seeded.params, request);
  if (validationErrors.length > 0) {
    return {
      ...base,
      status: "needs_review",
      vendorVariant,
      validationErrors,
      reasons: [...base.reasons, ...seeded.reasons, ...applianceHost.reasons, "generated_module_params_failed_validation"],
      applianceHostStatus: applianceHost.applianceHostStatus,
      applianceHostValidation: applianceHost.applianceHostValidation
    };
  }

  return {
    ...base,
    status:
      modulePackageResolution.status === "resolved" && applianceHost.applianceHostStatus !== "incompatible"
        ? "resolved"
        : "needs_review",
    params: seeded.params,
    vendorVariant,
    reasons: [...base.reasons, ...seeded.reasons, ...applianceHost.reasons],
    applianceHostStatus: applianceHost.applianceHostStatus,
    applianceHostValidation: applianceHost.applianceHostValidation
  };
}
