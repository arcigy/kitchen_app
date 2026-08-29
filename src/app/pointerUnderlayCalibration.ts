import * as THREE from "three";

export type PointerUnderlayCalibrationState = {
  active: boolean;
  first: THREE.Vector3 | null;
  knownMm: number;
  mode: "calibrate" | "reference";
};

export function parseUnderlayReferenceDistanceMm(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function handleUnderlayCalibrationPointerDown(args: {
  getHitPoint: () => THREE.Vector3 | null;
  hasLoadedUnderlay: boolean;
  promptReferenceDistanceMm: (measuredMm: number) => string | null;
  setScaleInputValue: (value: string) => void;
  setUnderlayStatus: (status: string) => void;
  underlayCal: PointerUnderlayCalibrationState;
  underlayPinned: boolean;
  underlayScale: { value: number };
  underlayVisible: boolean;
  updateUnderlayTransform: () => void;
}) {
  if (!args.underlayVisible || !args.hasLoadedUnderlay || args.underlayPinned) {
    args.underlayCal.active = false;
    args.underlayCal.first = null;
    args.setUnderlayStatus("Underlay not available.");
    return true;
  }

  const hitPoint = args.getHitPoint();
  if (!hitPoint) {
    args.setUnderlayStatus("Click on underlay.");
    return true;
  }

  if (!args.underlayCal.first) {
    args.underlayCal.first = hitPoint.clone();
    args.setUnderlayStatus(args.underlayCal.mode === "reference" ? "Reference scale: click second point..." : "Calibration: click second point...");
    return true;
  }

  const distM = Math.hypot(hitPoint.x - args.underlayCal.first.x, hitPoint.z - args.underlayCal.first.z);
  if (distM <= 1e-6) {
    args.setUnderlayStatus("Reference scale failed (zero distance).");
    args.underlayCal.active = false;
    args.underlayCal.first = null;
    return true;
  }

  let desiredMm = Math.max(1, args.underlayCal.knownMm);
  if (args.underlayCal.mode === "reference") {
    const measuredMm = Math.round(distM * 1000);
    const promptedMm = parseUnderlayReferenceDistanceMm(args.promptReferenceDistanceMm(measuredMm));
    if (promptedMm === null) {
      args.setUnderlayStatus("Reference scale canceled.");
      args.underlayCal.active = false;
      args.underlayCal.first = null;
      return true;
    }
    desiredMm = promptedMm;
  }

  const factor = desiredMm / 1000 / distM;
  args.underlayScale.value *= factor;
  args.updateUnderlayTransform();
  args.setScaleInputValue(String(args.underlayScale.value));
  args.setUnderlayStatus(args.underlayCal.mode === "reference" ? `Reference scale OK: ${Math.round(desiredMm)} mm` : `Calibration OK: ${Math.round(desiredMm)} mm`);
  args.underlayCal.active = false;
  args.underlayCal.first = null;
  return true;
}
