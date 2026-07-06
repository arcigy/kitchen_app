import type { ModulePlacementContext } from "../core/module-package/module-package-types";

type VendorPlacementParams = Record<string, unknown> & {
  kitchenModuleRole?: string;
  vendorPlacementZone?: string;
  vendorRequiresCorner?: boolean;
  vendorRequiresApplianceOpening?: boolean;
  vendorRequiresWallAttachment?: boolean;
  vendorFeatureTags?: string[];
};

export type VendorPlacementValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

function lowerText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean) : [];
}

function isTallAppliancePlacement(params: VendorPlacementParams) {
  const placementZone = lowerText(params.vendorPlacementZone);
  const kitchenModuleRole = lowerText(params.kitchenModuleRole);
  return placementZone === "tall_appliance" || (params.vendorRequiresApplianceOpening === true && kitchenModuleRole === "tall");
}

function requiresCornerPlacement(params: VendorPlacementParams) {
  return params.vendorRequiresCorner === true || lowerText(params.vendorPlacementZone) === "corner_low";
}

function requiresWallAttachment(params: VendorPlacementParams) {
  const featureTags = new Set(asStringList(params.vendorFeatureTags));
  return (
    params.vendorRequiresWallAttachment === true ||
    featureTags.has("cover_panel") ||
    featureTags.has("corner_cover_panel") ||
    lowerText(params.kitchenModuleRole) === "upper" ||
    lowerText(params.kitchenModuleRole) === "top" ||
    lowerText(params.kitchenModuleRole) === "wall"
  );
}

export function hasVendorPlacementRules(params: Record<string, unknown> | null | undefined) {
  if (!params) return false;
  const record = params as VendorPlacementParams;
  return (
    lowerText(record.vendorPlacementZone).length > 0 ||
    record.vendorRequiresCorner === true ||
    record.vendorRequiresApplianceOpening === true ||
    record.vendorRequiresWallAttachment === true ||
    asStringList(record.vendorFeatureTags).length > 0
  );
}

export function getVendorPreferredPlacementContext(
  params: Record<string, unknown> | null | undefined,
  fallback: ModulePlacementContext | null = "kitchen_wall"
): ModulePlacementContext | null {
  if (!params) return fallback;
  const record = params as VendorPlacementParams;
  if (requiresCornerPlacement(record)) return "kitchen_corner";
  if (isTallAppliancePlacement(record)) return "appliance_zone";
  if (requiresWallAttachment(record)) return "kitchen_wall";
  return fallback;
}

export function validateVendorPlacementCandidate(
  params: Record<string, unknown> | null | undefined,
  placementContext: ModulePlacementContext
): VendorPlacementValidationResult {
  if (!params) return { valid: true, errors: [], warnings: [] };
  const record = params as VendorPlacementParams;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (requiresCornerPlacement(record) && placementContext !== "kitchen_corner") {
    errors.push("Vendor module requires a corner placement.");
  }

  if (isTallAppliancePlacement(record) && placementContext !== "appliance_zone") {
    errors.push("Vendor module requires an appliance zone placement.");
  }

  if (
    requiresWallAttachment(record) &&
    !["kitchen_wall", "kitchen_corner", "appliance_zone", "wall_mounted", "above_countertop"].includes(placementContext)
  ) {
    errors.push("Vendor module must stay attached to a wall-aligned placement.");
  }

  const placementZone = lowerText(record.vendorPlacementZone);
  const kitchenModuleRole = lowerText(record.kitchenModuleRole);
  if ((placementZone === "tall" || placementZone === "tall_appliance") && kitchenModuleRole !== "tall") {
    warnings.push("Vendor placement zone is tall but kitchenModuleRole is not tall.");
  }
  if (placementZone === "low" && kitchenModuleRole === "tall") {
    warnings.push("Vendor placement zone is low but kitchenModuleRole is tall.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
