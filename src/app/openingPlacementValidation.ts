export type HostedWallOpening = {
  id: string;
  params: {
    wall: string;
    wallId?: string | null;
    centerMm: number;
    widthMm: number;
  };
};

export type OpeningPlacementFailure = "invalid" | "outside-wall" | "overlap";

export type OpeningPlacementValidation =
  | { valid: true }
  | { valid: false; reason: OpeningPlacementFailure; conflictingOpeningId?: string };

type OpeningPlacementCandidate = {
  wallId: string;
  lengthMm: number;
  centerMm: number;
  widthMm: number;
  existingOpenings: readonly HostedWallOpening[];
};

const isHostedOnWall = (opening: HostedWallOpening, wallId: string) =>
  opening.params.wallId === wallId || (opening.params.wallId == null && opening.params.wall === wallId);

/**
 * Validates one wall-hosted opening against the wall extent and all existing
 * doors/windows. Touching jambs is allowed; overlapping spans are not.
 */
export function validateOpeningPlacement(candidate: OpeningPlacementCandidate): OpeningPlacementValidation {
  const { centerMm, existingOpenings, lengthMm, wallId, widthMm } = candidate;
  if (!Number.isFinite(lengthMm) || !Number.isFinite(centerMm) || !Number.isFinite(widthMm) || widthMm <= 0 || lengthMm <= 0) {
    return { valid: false, reason: "invalid" };
  }

  // Keep existing wall behavior: an opening may meet, but cannot be wider than,
  // the host wall's end points.
  if (widthMm >= lengthMm || centerMm < widthMm / 2 || centerMm > lengthMm - widthMm / 2) {
    return { valid: false, reason: "outside-wall" };
  }

  const startMm = centerMm - widthMm / 2;
  const endMm = centerMm + widthMm / 2;
  const conflictingOpening = existingOpenings.find((opening) => {
    if (!isHostedOnWall(opening, wallId)) return false;
    const openingCenterMm = opening.params.centerMm;
    const openingWidthMm = opening.params.widthMm;
    if (!Number.isFinite(openingCenterMm) || !Number.isFinite(openingWidthMm) || openingWidthMm <= 0) return false;
    const openingStartMm = openingCenterMm - openingWidthMm / 2;
    const openingEndMm = openingCenterMm + openingWidthMm / 2;
    return startMm < openingEndMm && openingStartMm < endMm;
  });

  return conflictingOpening ? { valid: false, reason: "overlap", conflictingOpeningId: conflictingOpening.id } : { valid: true };
}
