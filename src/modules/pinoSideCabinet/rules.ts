import type { ModulePlacementContext } from "../../core/module-package/module-package-types";
import {
  getPinoSideCabinetApplianceOpening,
  getPinoSideCabinetProductGroup,
  normalizePinoSideCabinetParams,
  type PinoSideCabinetParams
} from "./types";

export type PinoSideCabinetCapability = {
  assemblyContext: "kitchen";
  kitchenModuleRole: "tall";
  requiresWorktop: false;
  placementZone: "tall" | "tall_appliance";
  moduleClass: "tall_side" | "appliance_tall";
  allowedPlacementContexts: ModulePlacementContext[];
  requiresApplianceNiche: boolean;
  supportsWorktopTermination: boolean;
  cornerOnly: boolean;
  acceptsApplianceCategories: string[];
  recommendedUse: string;
};

export function getPinoSideCabinetPreferredPlacementContext(params: PinoSideCabinetParams): ModulePlacementContext {
  const capability = getPinoSideCabinetCapability(params);
  return capability.requiresApplianceNiche ? "appliance_zone" : "kitchen_wall";
}

export type PinoSideCabinetPlacementCandidate = {
  placementContext: ModulePlacementContext;
  applianceCategory?: string | null;
  hasApplianceNiche?: boolean;
  isCornerPosition?: boolean;
};

export function createPinoSideCabinetPlacementCandidate(
  params: PinoSideCabinetParams,
  placementContext?: ModulePlacementContext
): PinoSideCabinetPlacementCandidate {
  const capability = getPinoSideCabinetCapability(params);
  const resolvedPlacementContext = placementContext ?? getPinoSideCabinetPreferredPlacementContext(params);
  const wantsApplianceZone = resolvedPlacementContext === "appliance_zone" || capability.requiresApplianceNiche;
  return {
    placementContext: resolvedPlacementContext,
    hasApplianceNiche: wantsApplianceZone,
    applianceCategory: wantsApplianceZone ? capability.acceptsApplianceCategories[0] ?? null : null,
    isCornerPosition: false
  };
}

export type PinoSideCabinetPlacementValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  capability: PinoSideCabinetCapability;
};

export type PinoSideCabinetApplianceHostCandidate = {
  applianceCategory: string | null;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
};

export type PinoSideCabinetApplianceHostValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  opening: ReturnType<typeof getPinoSideCabinetApplianceOpening>;
  capability: PinoSideCabinetCapability;
};

function normalizeApplianceCategory(value: string | null | undefined) {
  const trimmed = (value ?? "").trim().toLowerCase();
  return trimmed || null;
}

export function getPinoSideCabinetCapability(params: PinoSideCabinetParams): PinoSideCabinetCapability {
  const normalized = normalizePinoSideCabinetParams(params);
  const productGroup = getPinoSideCabinetProductGroup(normalized.groupId);
  return {
    assemblyContext: "kitchen",
    kitchenModuleRole: "tall",
    requiresWorktop: false,
    placementZone: productGroup.placementRules.kitchenZone,
    moduleClass: productGroup.placementRules.moduleClass,
    allowedPlacementContexts: productGroup.placementRules.requiresApplianceNiche
      ? ["kitchen_wall", "appliance_zone", "floor"]
      : ["kitchen_wall", "floor"],
    requiresApplianceNiche: productGroup.placementRules.requiresApplianceNiche,
    supportsWorktopTermination: productGroup.placementRules.supportsWorktopTermination,
    cornerOnly: productGroup.placementRules.cornerOnly,
    acceptsApplianceCategories: productGroup.compatibilityRules.acceptsApplianceCategories,
    recommendedUse: productGroup.compatibilityRules.recommendedUse
  };
}

export function validatePinoSideCabinetPlacementCandidate(
  params: PinoSideCabinetParams,
  candidate: PinoSideCabinetPlacementCandidate
): PinoSideCabinetPlacementValidation {
  const capability = getPinoSideCabinetCapability(params);
  const errors: string[] = [];
  const warnings: string[] = [];
  const applianceCategory = normalizeApplianceCategory(candidate.applianceCategory);
  const acceptsAppliance = capability.acceptsApplianceCategories.map((item) => item.toLowerCase());

  if (!capability.allowedPlacementContexts.includes(candidate.placementContext)) {
    errors.push(`Placement context ${candidate.placementContext} is not allowed for this side cabinet group.`);
  }

  if (capability.cornerOnly && candidate.isCornerPosition !== true) {
    errors.push("This side cabinet group can be placed only into a kitchen corner.");
  }

  if (capability.requiresApplianceNiche) {
    if (candidate.hasApplianceNiche === false) {
      errors.push("This side cabinet group requires an appliance niche.");
    }
    if (candidate.placementContext !== "appliance_zone") {
      warnings.push("Appliance side cabinets should be placed into an appliance zone.");
    }
    if (applianceCategory && acceptsAppliance.length > 0 && !acceptsAppliance.includes(applianceCategory)) {
      errors.push(`Appliance category ${candidate.applianceCategory} is not compatible with this side cabinet group.`);
    }
  } else if (candidate.placementContext === "appliance_zone") {
    warnings.push("Non-appliance side cabinets should normally stay outside an appliance zone.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    capability
  };
}

export function validatePinoSideCabinetApplianceHost(
  params: PinoSideCabinetParams,
  candidate: PinoSideCabinetApplianceHostCandidate
): PinoSideCabinetApplianceHostValidation {
  const capability = getPinoSideCabinetCapability(params);
  const opening = getPinoSideCabinetApplianceOpening(params);
  const errors: string[] = [];
  const warnings: string[] = [];
  const applianceCategory = normalizeApplianceCategory(candidate.applianceCategory);
  const acceptedCategories = capability.acceptsApplianceCategories.map((item) => item.toLowerCase());

  if (!capability.requiresApplianceNiche) {
    errors.push("This side cabinet group does not accept built-in appliances.");
  }

  if (!opening) {
    errors.push("This side cabinet does not expose a usable appliance opening.");
  }

  if (applianceCategory && acceptedCategories.length > 0 && !acceptedCategories.includes(applianceCategory)) {
    errors.push(`Appliance category ${candidate.applianceCategory} is not compatible with this side cabinet group.`);
  }

  if (opening) {
    if (typeof candidate.widthMm === "number" && candidate.widthMm > opening.widthMm) {
      errors.push(`Appliance width ${candidate.widthMm} mm exceeds opening width ${opening.widthMm} mm.`);
    }
    if (typeof candidate.heightMm === "number" && candidate.heightMm > opening.heightMm) {
      errors.push(`Appliance height ${candidate.heightMm} mm exceeds opening height ${opening.heightMm} mm.`);
    }
    if (typeof candidate.depthMm === "number" && candidate.depthMm > opening.depthMm) {
      warnings.push(`Appliance depth ${candidate.depthMm} mm exceeds preview opening depth ${opening.depthMm} mm.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    opening,
    capability
  };
}
