import type {
  FurnQuoteModulePackage,
  ModulePlacementContext,
  ModulePlacementValidationResult
} from "../core/module-package/module-package-types";
import {
  validateModulePlacement,
  type ModulePlacementLayoutContext
} from "../core/module-package/rules/module-rule-engine";

export type KitchenModulePackagePlacementCandidate = {
  placementContext: ModulePlacementContext;
  hasWall: boolean;
  hasFloor: boolean;
  hasCorner: boolean;
  cornerAngleDeg?: number;
  hasTwoPerpendicularWalls?: boolean;
  touchesBothWalls?: boolean;
  snapPosition?: unknown;
  snapRotation?: number;
};

export function validateKitchenModulePackagePlacement(args: {
  modulePackage: FurnQuoteModulePackage;
  candidate: KitchenModulePackagePlacementCandidate;
}): ModulePlacementValidationResult {
  const layoutContext: ModulePlacementLayoutContext = {
    hasWall: args.candidate.hasWall,
    hasFloor: args.candidate.hasFloor,
    corner: {
      exists: args.candidate.hasCorner,
      angleDeg: args.candidate.cornerAngleDeg,
      hasTwoPerpendicularWalls: args.candidate.hasTwoPerpendicularWalls,
      touchesBothWalls: args.candidate.touchesBothWalls,
      snapPosition: args.candidate.snapPosition,
      snapRotation: args.candidate.snapRotation
    }
  };
  return validateModulePlacement({
    modulePackage: args.modulePackage,
    placementContext: args.candidate.placementContext,
    layoutContext,
    candidatePosition: args.candidate.snapPosition,
    candidateRotation: args.candidate.snapRotation
  });
}
