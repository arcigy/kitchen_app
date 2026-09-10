import { describe, expect, it, vi } from "vitest";
import { createRendererInteractionQualityController } from "./rendererInteractionQuality";

describe("renderer interaction quality", () => {
  it("uses lower preview quality only while navigating and restores it after idle", () => {
    vi.useFakeTimers();
    const setPixelRatio = vi.fn();
    const controller = createRendererInteractionQualityController({
      fullPixelRatio: 1.5,
      reducedPixelRatio: 0.85,
      setPixelRatio,
      restoreDelayMs: 120
    });

    controller.beginInteraction();
    expect(setPixelRatio).toHaveBeenLastCalledWith(0.85);
    expect(controller.isReduced()).toBe(true);

    controller.endInteraction();
    vi.advanceTimersByTime(119);
    expect(setPixelRatio).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(controller.isReduced()).toBe(false);
    vi.useRealTimers();
  });

  it("keeps the lower quality during a continuous gesture", () => {
    vi.useFakeTimers();
    const setPixelRatio = vi.fn();
    const controller = createRendererInteractionQualityController({
      fullPixelRatio: 2,
      reducedPixelRatio: 1,
      setPixelRatio,
      restoreDelayMs: 100
    });

    controller.beginInteraction();
    controller.endInteraction();
    vi.advanceTimersByTime(70);
    controller.beginInteraction();
    vi.advanceTimersByTime(100);
    expect(setPixelRatio.mock.calls).toEqual([ [1] ]);

    controller.endInteraction();
    vi.advanceTimersByTime(100);
    expect(setPixelRatio.mock.calls).toEqual([ [1], [2] ]);
    vi.useRealTimers();
  });
});
