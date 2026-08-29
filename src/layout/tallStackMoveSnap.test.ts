import { describe, expect, it } from "vitest";
import { chooseTallVerticalSnapCandidate } from "./tallStackMoveSnap";

const candidate = (y: number, priority = 0) => ({
  yMm: y,
  screenPoint: { y },
  distancePx: 0,
  priority
});

describe("tall stack move snap", () => {
  it("uses a tight preview threshold so submodule move follows the cursor smoothly", () => {
    expect(chooseTallVerticalSnapCandidate(120, [candidate(100)], null, { snapDistancePx: 5, stickyDistancePx: 0 })).toBeNull();
    expect(chooseTallVerticalSnapCandidate(120, [candidate(100)], null, { snapDistancePx: 28, stickyDistancePx: 30 })?.yMm).toBe(100);
  });

  it("disables sticky snapping for live preview when requested", () => {
    expect(chooseTallVerticalSnapCandidate(124, [], candidate(100), { snapDistancePx: 5, stickyDistancePx: 0 })).toBeNull();
    expect(chooseTallVerticalSnapCandidate(124, [], candidate(100), { snapDistancePx: 5, stickyDistancePx: 30 })?.yMm).toBe(100);
  });
});
