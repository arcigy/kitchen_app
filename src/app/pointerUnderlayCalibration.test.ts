import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import {
  handleUnderlayCalibrationPointerDown,
  parseUnderlayReferenceDistanceMm,
  type PointerUnderlayCalibrationState
} from "./pointerUnderlayCalibration";

function calibrationState(overrides: Partial<PointerUnderlayCalibrationState> = {}): PointerUnderlayCalibrationState {
  return {
    active: true,
    first: null,
    knownMm: 1000,
    mode: "calibrate",
    ...overrides
  };
}

function calibrationArgs(overrides: Partial<Parameters<typeof handleUnderlayCalibrationPointerDown>[0]> = {}) {
  return {
    getHitPoint: vi.fn(() => new Vector3(1, 0, 0)),
    hasLoadedUnderlay: true,
    promptReferenceDistanceMm: vi.fn((measuredMm: number) => String(measuredMm)),
    setScaleInputValue: vi.fn(),
    setUnderlayStatus: vi.fn(),
    underlayCal: calibrationState(),
    underlayPinned: false,
    underlayScale: { value: 1 },
    underlayVisible: true,
    updateUnderlayTransform: vi.fn(),
    ...overrides
  };
}

describe("pointerUnderlayCalibration", () => {
  it("parses current reference distance input format", () => {
    expect(parseUnderlayReferenceDistanceMm("1200")).toBe(1200);
    expect(parseUnderlayReferenceDistanceMm("1200,5")).toBe(1200.5);
    expect(parseUnderlayReferenceDistanceMm(null)).toBeNull();
    expect(parseUnderlayReferenceDistanceMm("0")).toBeNull();
    expect(parseUnderlayReferenceDistanceMm("bad")).toBeNull();
  });

  it("cancels active calibration when underlay is unavailable before hit testing", () => {
    const args = calibrationArgs({
      getHitPoint: vi.fn(() => new Vector3(1, 0, 0)),
      underlayVisible: false
    });

    expect(handleUnderlayCalibrationPointerDown(args)).toBe(true);

    expect(args.underlayCal.active).toBe(false);
    expect(args.underlayCal.first).toBeNull();
    expect(args.getHitPoint).not.toHaveBeenCalled();
    expect(args.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Underlay not available.");
  });

  it("keeps calibration active when the click misses the underlay", () => {
    const args = calibrationArgs({
      getHitPoint: vi.fn(() => null)
    });

    expect(handleUnderlayCalibrationPointerDown(args)).toBe(true);

    expect(args.underlayCal.active).toBe(true);
    expect(args.underlayCal.first).toBeNull();
    expect(args.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Click on underlay.");
  });

  it("stores the first calibration point and asks for the second point", () => {
    const hit = new Vector3(1, 0, 2);
    const args = calibrationArgs({
      getHitPoint: vi.fn(() => hit)
    });

    expect(handleUnderlayCalibrationPointerDown(args)).toBe(true);

    expect(args.underlayCal.first).toEqual(hit);
    expect(args.underlayCal.first).not.toBe(hit);
    expect(args.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Calibration: click second point...");
  });

  it("applies current calibrate scale flow on the second point", () => {
    const args = calibrationArgs({
      getHitPoint: vi.fn(() => new Vector3(2, 0, 0)),
      underlayCal: calibrationState({ first: new Vector3(0, 0, 0), knownMm: 4000 }),
      underlayScale: { value: 2 }
    });

    expect(handleUnderlayCalibrationPointerDown(args)).toBe(true);

    expect(args.underlayScale.value).toBe(4);
    expect(args.updateUnderlayTransform).toHaveBeenCalledOnce();
    expect(args.setScaleInputValue).toHaveBeenCalledExactlyOnceWith("4");
    expect(args.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Calibration OK: 4000 mm");
    expect(args.underlayCal.active).toBe(false);
    expect(args.underlayCal.first).toBeNull();
  });

  it("uses reference prompt value before applying scale", () => {
    const args = calibrationArgs({
      getHitPoint: vi.fn(() => new Vector3(2, 0, 0)),
      promptReferenceDistanceMm: vi.fn(() => "3000,5"),
      underlayCal: calibrationState({ first: new Vector3(0, 0, 0), knownMm: 1000, mode: "reference" }),
      underlayScale: { value: 1 }
    });

    expect(handleUnderlayCalibrationPointerDown(args)).toBe(true);

    expect(args.promptReferenceDistanceMm).toHaveBeenCalledExactlyOnceWith(2000);
    expect(args.underlayScale.value).toBeCloseTo(1.50025);
    expect(args.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Reference scale OK: 3001 mm");
  });

  it("cancels reference scale when prompt value is invalid", () => {
    const args = calibrationArgs({
      getHitPoint: vi.fn(() => new Vector3(2, 0, 0)),
      promptReferenceDistanceMm: vi.fn(() => "0"),
      underlayCal: calibrationState({ first: new Vector3(0, 0, 0), mode: "reference" })
    });

    expect(handleUnderlayCalibrationPointerDown(args)).toBe(true);

    expect(args.updateUnderlayTransform).not.toHaveBeenCalled();
    expect(args.setScaleInputValue).not.toHaveBeenCalled();
    expect(args.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Reference scale canceled.");
    expect(args.underlayCal.active).toBe(false);
    expect(args.underlayCal.first).toBeNull();
  });

  it("keeps the current zero-distance failure behavior", () => {
    const args = calibrationArgs({
      getHitPoint: vi.fn(() => new Vector3(0, 0, 0)),
      underlayCal: calibrationState({ first: new Vector3(0, 0, 0) })
    });

    expect(handleUnderlayCalibrationPointerDown(args)).toBe(true);

    expect(args.updateUnderlayTransform).not.toHaveBeenCalled();
    expect(args.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Reference scale failed (zero distance).");
    expect(args.underlayCal.active).toBe(false);
    expect(args.underlayCal.first).toBeNull();
  });
});
