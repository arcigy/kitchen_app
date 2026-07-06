import type { ClientCatalog, ClientModuleDefinition, VendorModuleIntent, VendorProductVariant } from "./catalog-types";
import { getEnabledClientModules } from "./module-catalog";
import {
  resolveVendorProductVariant,
  type VendorProductResolution,
  type VendorProductResolutionCandidate,
  type VendorProductResolutionRequest,
  type VendorProductResolutionStatus
} from "./vendor-product-resolver";

export type VendorModulePackageResolutionStatus = VendorProductResolutionStatus;

export type VendorModulePackageResolutionRequest = VendorProductResolutionRequest & {
  moduleType?: string;
};

export type VendorModulePackageResolutionCandidate = {
  moduleType: string;
  modulePackageId: string | null;
  moduleName: string;
  category?: string;
  runtimeBuilderKey: string | null;
  catalogKey: string | null;
  productTemplateName: string | null;
  articleFamily: string | null;
  widthCm: number | null;
  variantCode: string | null;
  sourcePage: number | null;
  confidence: number | null;
  needsReview: boolean;
  moduleClass: VendorModuleIntent["moduleClass"];
  kitchenModuleRole: VendorModuleIntent["kitchenModuleRole"];
  placementZone: VendorModuleIntent["placementZone"];
  requiresWorktop: boolean;
  requiresCorner: boolean;
  requiresApplianceOpening: boolean;
  featureTags: string[];
  reasons: string[];
};

export type VendorModulePackageResolution = {
  status: VendorModulePackageResolutionStatus;
  catalogKey: string | null;
  moduleType: string | null;
  modulePackageId: string | null;
  runtimeBuilderKey: string | null;
  placementZone: VendorModuleIntent["placementZone"] | "unknown";
  kitchenModuleRole: VendorModuleIntent["kitchenModuleRole"] | "unknown";
  requiresWorktop: boolean;
  requiresCorner: boolean;
  requiresApplianceOpening: boolean;
  resolvedModule: ClientModuleDefinition | null;
  candidates: VendorModulePackageResolutionCandidate[];
  reasons: string[];
  vendorResolution: VendorProductResolution;
};

function candidateMatchesVariant(
  variant: VendorProductVariant,
  candidate: VendorProductResolutionCandidate
): boolean {
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
  resolution: VendorProductResolution
): VendorProductVariant[] {
  const variants = catalog.vendorCatalog?.productVariants ?? [];
  return variants.filter((variant) =>
    resolution.candidates.some((candidate) => candidateMatchesVariant(variant, candidate))
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function preferredRuntimeBuilderKey(intent: VendorModuleIntent | undefined): string | null {
  if (!intent) return null;
  if (intent.builderKeyCandidates.length === 0) return null;
  if (intent.builderKeyCandidates.includes("pinoSideCabinet.v1")) return "pinoSideCabinet.v1";
  if (
    intent.featureTags.includes("cover_panel") &&
    intent.builderKeyCandidates.includes("fwm_interior_cladding_1.v1")
  ) return "fwm_interior_cladding_1.v1";
  if (
    intent.featureTags.includes("corner_cover_panel") &&
    intent.builderKeyCandidates.includes("fwm_interior_cladding_2.v1")
  ) return "fwm_interior_cladding_2.v1";
  if (
    intent.featureTags.includes("open_shelf_base") &&
    intent.builderKeyCandidates.includes("fwm_kitchen_special_module_3.v1")
  ) return "fwm_kitchen_special_module_3.v1";
  if (intent.requiresCorner && intent.builderKeyCandidates.includes("cornerShelfLower.v1")) return "cornerShelfLower.v1";
  if (
    intent.featureTags.includes("hob_zone") &&
    intent.builderKeyCandidates.includes("fwm_kitchen_special_module_2.v1")
  ) return "fwm_kitchen_special_module_2.v1";
  if (
    intent.featureTags.includes("drawer_stack") &&
    intent.featureTags.includes("door_shelf") &&
    intent.builderKeyCandidates.includes("fwm_kitchen_special_module_1.v1")
  ) return "fwm_kitchen_special_module_1.v1";
  if (
    (intent.featureTags.includes("drawer_stack") ||
      intent.featureTags.includes("internal_drawers") ||
      intent.featureTags.includes("hob_zone") ||
      intent.featureTags.includes("waste_sorting")) &&
    intent.builderKeyCandidates.includes("drawerLow.v1")
  ) return "drawerLow.v1";
  if (intent.featureTags.includes("flap_front") && intent.builderKeyCandidates.includes("flapShelvesLow.v1")) return "flapShelvesLow.v1";
  if (intent.featureTags.includes("door_shelf") && intent.builderKeyCandidates.includes("swingShelvesLow.v1")) return "swingShelvesLow.v1";
  return intent.builderKeyCandidates[0] ?? null;
}

function buildCandidate(args: {
  module: ClientModuleDefinition;
  variant: VendorProductVariant | null;
  intent: VendorModuleIntent | undefined;
  reasons: string[];
}): VendorModulePackageResolutionCandidate {
  return {
    moduleType: args.module.moduleType,
    modulePackageId: args.module.modulePackageId ?? null,
    moduleName: args.module.name,
    category: args.module.category,
    runtimeBuilderKey: args.module.runtimeBuilderKey ?? null,
    catalogKey: args.variant?.catalogKey ?? null,
    productTemplateName: args.variant?.productTemplateName ?? null,
    articleFamily: args.variant?.articleFamily ?? null,
    widthCm: args.variant?.widthCm ?? null,
    variantCode: args.variant?.variantCode ?? null,
    sourcePage: args.variant?.sourcePage ?? null,
    confidence: args.variant?.confidence ?? null,
    needsReview: args.variant?.needsReview === true,
    moduleClass: args.intent?.moduleClass ?? "unknown",
    kitchenModuleRole: args.intent?.kitchenModuleRole ?? "unknown",
    placementZone: args.intent?.placementZone ?? "unknown",
    requiresWorktop: args.intent?.requiresWorktop ?? false,
    requiresCorner: args.intent?.requiresCorner ?? false,
    requiresApplianceOpening: args.intent?.requiresApplianceOpening ?? false,
    featureTags: args.intent?.featureTags ?? [],
    reasons: args.reasons
  };
}

export function resolveVendorModulePackage(
  catalog: Pick<ClientCatalog, "modules" | "vendorCatalog">,
  request: VendorModulePackageResolutionRequest
): VendorModulePackageResolution {
  const vendorResolution = resolveVendorProductVariant(catalog, request);
  const variants = findResolvedVariants(catalog, vendorResolution);
  const reasons = [...vendorResolution.reasons];

  if (vendorResolution.status === "missing") {
    return {
      status: "missing",
      catalogKey: null,
      moduleType: null,
      modulePackageId: null,
      runtimeBuilderKey: null,
      placementZone: "unknown",
      kitchenModuleRole: "unknown",
      requiresWorktop: false,
      requiresCorner: false,
      requiresApplianceOpening: false,
      resolvedModule: null,
      candidates: [],
      reasons,
      vendorResolution
    };
  }

  const enabledModules = getEnabledClientModules(catalog);
  const modulePool = request.moduleType
    ? enabledModules.filter((module) => module.moduleType === request.moduleType)
    : enabledModules;
  const intents = variants.map((variant) => variant.moduleIntent);
  const preferredBuilders = unique(intents.map((intent) => preferredRuntimeBuilderKey(intent)).filter((value): value is string => typeof value === "string" && value.length > 0));

  if (preferredBuilders.length === 0) {
    return {
      status: vendorResolution.status === "needs_review" ? "needs_review" : "missing",
      catalogKey: vendorResolution.catalogKey,
      moduleType: null,
      modulePackageId: null,
      runtimeBuilderKey: null,
      placementZone: intents[0]?.placementZone ?? "unknown",
      kitchenModuleRole: intents[0]?.kitchenModuleRole ?? "unknown",
      requiresWorktop: intents.some((intent) => intent?.requiresWorktop === true),
      requiresCorner: intents.some((intent) => intent?.requiresCorner === true),
      requiresApplianceOpening: intents.some((intent) => intent?.requiresApplianceOpening === true),
      resolvedModule: null,
      candidates: [],
      reasons: [...reasons, "vendor_variant_has_no_module_builder_hint"],
      vendorResolution
    };
  }

  if (preferredBuilders.length > 1) {
    return {
      status: vendorResolution.status === "needs_review" ? "needs_review" : "ambiguous",
      catalogKey: vendorResolution.catalogKey,
      moduleType: null,
      modulePackageId: null,
      runtimeBuilderKey: null,
      placementZone: "unknown",
      kitchenModuleRole: "unknown",
      requiresWorktop: intents.some((intent) => intent?.requiresWorktop === true),
      requiresCorner: intents.some((intent) => intent?.requiresCorner === true),
      requiresApplianceOpening: intents.some((intent) => intent?.requiresApplianceOpening === true),
      resolvedModule: null,
      candidates: [],
      reasons: [...reasons, "vendor_variants_map_to_multiple_module_builders"],
      vendorResolution
    };
  }

  const preferredBuilder = preferredBuilders[0]!;
  const matchingModules = modulePool.filter((module) => module.runtimeBuilderKey === preferredBuilder);
  const candidates = matchingModules.map((module) =>
    buildCandidate({
      module,
      variant: variants[0] ?? null,
      intent: intents[0],
      reasons: ["matched_runtime_builder", preferredBuilder]
    })
  );

  if (matchingModules.length === 0) {
    return {
      status: vendorResolution.status === "needs_review" ? "needs_review" : "missing",
      catalogKey: vendorResolution.catalogKey,
      moduleType: null,
      modulePackageId: null,
      runtimeBuilderKey: preferredBuilder,
      placementZone: intents[0]?.placementZone ?? "unknown",
      kitchenModuleRole: intents[0]?.kitchenModuleRole ?? "unknown",
      requiresWorktop: intents.some((intent) => intent?.requiresWorktop === true),
      requiresCorner: intents.some((intent) => intent?.requiresCorner === true),
      requiresApplianceOpening: intents.some((intent) => intent?.requiresApplianceOpening === true),
      resolvedModule: null,
      candidates,
      reasons: [...reasons, "no_enabled_catalog_module_for_runtime_builder"],
      vendorResolution
    };
  }

  if (matchingModules.length > 1) {
    return {
      status: vendorResolution.status === "needs_review" ? "needs_review" : "ambiguous",
      catalogKey: vendorResolution.catalogKey,
      moduleType: null,
      modulePackageId: null,
      runtimeBuilderKey: preferredBuilder,
      placementZone: intents[0]?.placementZone ?? "unknown",
      kitchenModuleRole: intents[0]?.kitchenModuleRole ?? "unknown",
      requiresWorktop: intents.some((intent) => intent?.requiresWorktop === true),
      requiresCorner: intents.some((intent) => intent?.requiresCorner === true),
      requiresApplianceOpening: intents.some((intent) => intent?.requiresApplianceOpening === true),
      resolvedModule: null,
      candidates,
      reasons: [...reasons, "multiple_catalog_modules_for_runtime_builder"],
      vendorResolution
    };
  }

  const resolvedModule = matchingModules[0]!;
  const intent = intents[0];
  const matchedCandidates = [
    buildCandidate({
      module: resolvedModule,
      variant: variants[0] ?? null,
      intent,
      reasons: ["matched_runtime_builder", preferredBuilder]
    })
  ];

  if (vendorResolution.status !== "resolved") {
    return {
      status: vendorResolution.status,
      catalogKey: vendorResolution.catalogKey,
      moduleType: resolvedModule.moduleType,
      modulePackageId: resolvedModule.modulePackageId ?? null,
      runtimeBuilderKey: preferredBuilder,
      placementZone: intent?.placementZone ?? "unknown",
      kitchenModuleRole: intent?.kitchenModuleRole ?? "unknown",
      requiresWorktop: intent?.requiresWorktop ?? false,
      requiresCorner: intent?.requiresCorner ?? false,
      requiresApplianceOpening: intent?.requiresApplianceOpening ?? false,
      resolvedModule,
      candidates: matchedCandidates,
      reasons,
      vendorResolution
    };
  }

  return {
    status: "resolved",
    catalogKey: vendorResolution.catalogKey,
    moduleType: resolvedModule.moduleType,
    modulePackageId: resolvedModule.modulePackageId ?? null,
    runtimeBuilderKey: preferredBuilder,
    placementZone: intent?.placementZone ?? "unknown",
    kitchenModuleRole: intent?.kitchenModuleRole ?? "unknown",
    requiresWorktop: intent?.requiresWorktop ?? false,
    requiresCorner: intent?.requiresCorner ?? false,
    requiresApplianceOpening: intent?.requiresApplianceOpening ?? false,
    resolvedModule,
    candidates: matchedCandidates,
    reasons,
    vendorResolution
  };
}
