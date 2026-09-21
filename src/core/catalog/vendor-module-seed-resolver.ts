import type { ClientCatalog, VendorProductVariant } from "./catalog-types";
import type { ModuleParams } from "../../model/cabinetTypes";
import {
  resolveVendorModulePackage,
  type VendorModulePackageResolution,
  type VendorModulePackageResolutionCandidate,
  type VendorModulePackageResolutionRequest,
  type VendorModulePackageResolutionStatus
} from "./vendor-module-package-resolver";
import type { PinoSideCabinetApplianceHostValidation } from "../../modules/pinoSideCabinet/rules";

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
  // Vendor descriptions cannot recreate retired module implementations. New
  // product mappings require an explicit package and parameter preset.
  return {
    ...base,
    status: "needs_review",
    vendorVariant,
    reasons: [...base.reasons, `seed_builder_not_implemented_for_module_type:${modulePackageResolution.moduleType}`]
  };
}
