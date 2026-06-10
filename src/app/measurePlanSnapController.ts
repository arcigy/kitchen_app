import * as THREE from "three";
import { applyMeasureAxisAssist, type MeasureState } from "./measureTools";
import type { AssociativeMeasureKind } from "./measureAssociative";
import type { PlanSnapResult } from "./planSnap";
import {
  axisLockXZ,
  formatMm,
  planarDistanceMm,
  worldToScreen
} from "./sharedUtils";
import { resolveNormalGuideSegment } from "./measureGeometryHelpers";

type MeasurePlanSnapContext = {
  measureState: MeasureState;
  measureReadoutEl: HTMLElement;
  hudHoverLine: THREE.Mesh;
  getCamera: () => THREE.Camera;
  snapPoint2D: (
    hitPoint: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
    thresholdPx: number,
    opts: {
      perpendicularFrom: THREE.Vector3 | null;
      kindPriority: Array<Exclude<PlanSnapResult["kind"], "none">>;
      sticky: PlanSnapResult | null;
      cycleIndex: number;
    }
  ) => PlanSnapResult;
  updateHoverCursor: (point: THREE.Vector2, kind: MeasureState["hoverSnap"]) => void;
  hudLineThicknessM: (rect: DOMRect) => number;
  updateHudLine: (line: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, thicknessM: number) => void;
  updatePreview: (
    a: THREE.Vector3,
    b: THREE.Vector3,
    rect: DOMRect,
    labelMm?: number,
    opts?: { kind?: AssociativeMeasureKind }
  ) => void;
  clearPreview: () => void;
  setFirstPointMarker: (point: THREE.Vector3 | null) => void;
};

export function createMeasurePlanSnapController(ctx: MeasurePlanSnapContext) {
  let measurePlanSnap: PlanSnapResult | null = null;
  let measureSnapCycleIndex = 0;
  let measureSnapCyclePoint: THREE.Vector3 | null = null;
  let measureSnapCycleNormalMode = false;

  const resetMeasureSnapCycle = () => {
    measureSnapCycleIndex = 0;
    measureSnapCyclePoint = null;
    measureSnapCycleNormalMode = false;
  };

  const resolveMeasurePlanSnap = (hitPoint: THREE.Vector3, rect: DOMRect, normalMode: boolean) => {
    if (
      !measureSnapCyclePoint ||
      measureSnapCyclePoint.distanceToSquared(hitPoint) > 1e-8 ||
      measureSnapCycleNormalMode !== normalMode
    ) {
      measureSnapCycleIndex = 0;
      measureSnapCyclePoint = hitPoint.clone();
      measureSnapCycleNormalMode = normalMode;
    }
    const snapped = ctx.snapPoint2D(hitPoint, rect, ctx.getCamera(), 24, {
      perpendicularFrom: normalMode ? null : ctx.measureState.firstPoint,
      kindPriority: ["corner", "endpoint", "perpendicular", "midpoint", "edge", "axis"],
      sticky: measurePlanSnap,
      cycleIndex: measureSnapCycleIndex
    });
    measurePlanSnap = snapped.kind !== "none" ? snapped : null;
    return snapped;
  };

  const updateMeasureHoverFromPlanPoint = (hitPoint: THREE.Vector3, rect: DOMRect, normalMode: boolean) => {
    const snapped = resolveMeasurePlanSnap(hitPoint, rect, normalMode);
    let kind = snapped.kind;
    let point = snapped.kind !== "none" ? snapped.point : hitPoint;
    if (!ctx.measureState.axisLock && (snapped.kind === "none" || snapped.kind === "axis")) {
      const axisAssist = applyMeasureAxisAssist(ctx.measureState.firstPoint, point, ctx.getCamera(), rect, 12);
      if (axisAssist) {
        point = axisAssist.point;
        kind = "axis";
      }
    }
    ctx.measureState.hoverPoint = point.clone();
    ctx.measureState.hoverSnap = kind;
    ctx.updateHoverCursor(worldToScreen(point, ctx.getCamera(), rect), kind);

    const thick = ctx.hudLineThicknessM(rect);
    if (
      snapped.a &&
      snapped.b &&
      (snapped.kind === "edge" ||
        snapped.kind === "axis" ||
        snapped.kind === "midpoint" ||
        snapped.kind === "perpendicular")
    ) {
      ctx.updateHudLine(ctx.hudHoverLine, snapped.a, snapped.b, thick * 1.75);
    } else if (kind === "axis" && ctx.measureState.firstPoint) {
      ctx.updateHudLine(ctx.hudHoverLine, ctx.measureState.firstPoint, point, thick * 1.75);
    } else {
      ctx.hudHoverLine.visible = false;
    }

    if (ctx.measureState.firstPoint) {
      const a = ctx.measureState.firstPoint.clone();
      let b = point.clone();
      if (ctx.measureState.axisLock) b = axisLockXZ(a, b);
      if (normalMode) {
        const normalGuide = resolveNormalGuideSegment(a, b);
        if (normalGuide) {
          ctx.updatePreview(
            normalGuide.a,
            normalGuide.b,
            rect,
            planarDistanceMm(a, b),
            { kind: "normalGuide" }
          );
        } else {
          ctx.clearPreview();
        }
        ctx.measureReadoutEl.textContent = `Normal: ${Math.round(planarDistanceMm(a, b))} mm`;
      } else {
        ctx.updatePreview(a, b, rect);
        ctx.measureReadoutEl.textContent = `Measure: ${Math.round(planarDistanceMm(a, b))} mm`;
      }
    } else {
      ctx.clearPreview();
      const cycleCount = snapped.cycleCount ?? 0;
      const cycleHint = cycleCount > 1 ? ` (${Math.min(measureSnapCycleIndex + 1, cycleCount)}/${cycleCount}, Tab)` : "";
      ctx.measureReadoutEl.textContent = normalMode
        ? `Normal hover (${kind}): ${formatMm(point)}${cycleHint}`
        : `Measure hover (${kind}): ${formatMm(point)}${cycleHint}`;
    }
    ctx.setFirstPointMarker(ctx.measureState.firstPoint);
  };

  const cycleMeasureSnap = (direction: 1 | -1, rect: DOMRect) => {
    if (!measureSnapCyclePoint) return false;
    measureSnapCycleIndex += direction;
    updateMeasureHoverFromPlanPoint(measureSnapCyclePoint.clone(), rect, measureSnapCycleNormalMode);
    return true;
  };

  return {
    resetMeasureSnapCycle,
    resolveMeasurePlanSnap,
    updateMeasureHoverFromPlanPoint,
    cycleMeasureSnap,
    get hasMeasureSnapCyclePoint() {
      return !!measureSnapCyclePoint;
    },
    get measurePlanSnap() {
      return measurePlanSnap;
    },
    set measurePlanSnap(next: PlanSnapResult | null) {
      measurePlanSnap = next;
    }
  };
}
