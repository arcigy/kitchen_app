import type {
  FurnQuoteModulePackage,
  ModulePlacementContext,
  ModulePlacementValidationResult
} from "../module-package-types";

export type ModulePlacementLayoutContext = {
  hasWall?: boolean;
  hasFloor?: boolean;
  corner?: {
    exists: boolean;
    angleDeg?: number;
    hasTwoPerpendicularWalls?: boolean;
    touchesBothWalls?: boolean;
    snapPosition?: unknown;
    snapRotation?: number;
  };
  wall?: {
    lengthMm?: number;
  };
};

export function validateModulePlacement(args: {
  modulePackage: FurnQuoteModulePackage;
  placementContext: ModulePlacementContext;
  layoutContext: ModulePlacementLayoutContext;
  candidatePosition?: unknown;
  candidateRotation?: number;
}): ModulePlacementValidationResult {
  const { modulePackage, placementContext, layoutContext } = args;
  const rules = modulePackage.placement;
  const errors: ModulePlacementValidationResult["errors"] = [];
  const warnings: ModulePlacementValidationResult["warnings"] = [];

  if (!rules.allowedContexts.includes(placementContext)) {
    errors.push({ code: "placement.context_not_allowed", message: `${modulePackage.module.displayName} cannot be placed in ${placementContext}.` });
  }
  if (rules.forbiddenContexts?.includes(placementContext)) {
    errors.push({ code: "placement.context_forbidden", message: `${modulePackage.module.displayName} forbids ${placementContext}.` });
  }
  if (rules.requiresWall && !layoutContext.hasWall) {
    errors.push({ code: "placement.wall_required", message: `${modulePackage.module.displayName} requires a wall anchor.` });
  }
  if (rules.requiresFloor && !layoutContext.hasFloor) {
    errors.push({ code: "placement.floor_required", message: `${modulePackage.module.displayName} requires a floor anchor.` });
  }
  if (rules.wall?.minWallLengthMm !== undefined && (layoutContext.wall?.lengthMm ?? 0) < rules.wall.minWallLengthMm) {
    errors.push({ code: "placement.wall_too_short", message: `Wall must be at least ${rules.wall.minWallLengthMm} mm.` });
  }

  const needsCorner = rules.requiresCorner || rules.corner?.required || rules.requiredAnchors?.includes("corner");
  if (needsCorner && !layoutContext.corner?.exists) {
    errors.push({ code: "placement.corner_required", message: `${modulePackage.module.displayName} requires a corner.` });
  }
  if (rules.requiredAnchors?.includes("two_perpendicular_walls") && !layoutContext.corner?.hasTwoPerpendicularWalls) {
    errors.push({ code: "placement.two_perpendicular_walls_required", message: `${modulePackage.module.displayName} requires two perpendicular walls.` });
  }
  if (rules.corner?.mustTouchBothWalls && !layoutContext.corner?.touchesBothWalls) {
    errors.push({ code: "placement.must_touch_both_walls", message: `${modulePackage.module.displayName} must touch both corner walls.` });
  }
  if (rules.corner?.allowedAngles?.length && layoutContext.corner?.angleDeg !== undefined) {
    const tolerance = rules.corner.toleranceDeg ?? 0;
    const matches = rules.corner.allowedAngles.some((angle) => Math.abs(angle - layoutContext.corner!.angleDeg!) <= tolerance);
    if (!matches) {
      errors.push({ code: "placement.corner_angle_invalid", message: `Corner angle must match ${rules.corner.allowedAngles.join(", ")} degrees.` });
    }
  }
  if (rules.allowFreePlacement === false && placementContext === "free_standing") {
    errors.push({ code: "placement.free_placement_disabled", message: `${modulePackage.module.displayName} cannot be free-standing.` });
  }

  const suggestedSnap = modulePackage.snapping.enabled && layoutContext.corner?.snapPosition
    ? {
        position: layoutContext.corner.snapPosition,
        rotation: layoutContext.corner.snapRotation ?? args.candidateRotation ?? 0
      }
    : undefined;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestedSnap
  };
}
