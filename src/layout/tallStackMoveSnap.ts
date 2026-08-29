export type TallVerticalSnapCandidateLike = {
  screenPoint: { y: number };
  distancePx: number;
  priority: number;
};

export function chooseTallVerticalSnapCandidate<T extends TallVerticalSnapCandidateLike>(
  targetYPx: number,
  candidates: T[],
  sticky: T | null,
  options: { snapDistancePx: number; stickyDistancePx: number }
) {
  let best: T | null = null;
  for (const candidate of candidates) {
    const distancePx = Math.abs(candidate.screenPoint.y - targetYPx);
    if (distancePx > options.snapDistancePx) continue;
    const scored = { ...candidate, distancePx } as T;
    if (
      !best ||
      scored.priority < best.priority ||
      (scored.priority === best.priority && scored.distancePx < best.distancePx)
    ) {
      best = scored;
    }
  }
  if (!best && sticky && options.stickyDistancePx > 0) {
    const stickyDistancePx = Math.abs(sticky.screenPoint.y - targetYPx);
    if (stickyDistancePx <= options.stickyDistancePx) {
      best = { ...sticky, distancePx: stickyDistancePx } as T;
    }
  }
  return best;
}
