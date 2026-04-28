import type * as THREE from "three";
import type { MeasureSelectionTarget } from "./measureEditing";
import type { getSelectionMeasureBindings } from "./measureEditing";
import type { AssociativeMeasureContext } from "./measureAssociative";
import type { MeasureState } from "./measureTools";
import type { PlanSnapBinding } from "./planSnap";
import type { AppState } from "../layout/appState";

type DistanceMeasure = Extract<MeasureState["measures"][number], { kind: "distance" }>;

type MeasureValueCommitterContext = {
  S: AppState;
  commitHistory: (state: AppState) => void;
  getAssociativeMeasureContext: () => AssociativeMeasureContext;
  getCurrentMeasureSelectionTarget: () => MeasureSelectionTarget | null;
  getSelectionMeasureBindings: typeof getSelectionMeasureBindings;
  measureState: MeasureState;
  mountProps: () => void;
  refreshAssociativeMeasures: () => void;
  resolvePlanBinding: (binding: PlanSnapBinding, ctx: AssociativeMeasureContext) => THREE.Vector3 | null;
  translateFloorByMeasure: (floorId: string, dxMm: number, dzMm: number) => boolean;
  translateKitchenGroupByMeasure: (groupId: string, dxMm: number, dzMm: number) => boolean;
  translateModuleByMeasure: (instanceId: string, dxMm: number, dzMm: number) => boolean;
  translateWallByMeasure: (wallId: string, dxMm: number, dzMm: number) => boolean;
  updateLayoutPanel: () => void;
  updateMeasureLabelInteractivity: () => void;
};

function isDistanceMeasure(measure: MeasureState["measures"][number]): measure is DistanceMeasure {
  return measure.kind === "distance";
}

export function createMeasureValueCommitter(ctx: MeasureValueCommitterContext) {
  const commitSelectedMeasureValueMm = (measureId: string, raw: string, forcedTarget?: MeasureSelectionTarget | null) => {
    const target = forcedTarget ?? ctx.getCurrentMeasureSelectionTarget();
    const measure = ctx.measureState.measures.find((item) => item.id === measureId && isDistanceMeasure(item)) ?? null;
    if (!target || !measure) return;

    const nextMm = Number(String(raw).trim().replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(nextMm)) return;
    const desiredMm = Math.max(0, Math.round(nextMm));
    const bindings = ctx.getSelectionMeasureBindings(measure, target);
    if (!bindings) return;

    const measureCtx = ctx.getAssociativeMeasureContext();
    const attachedPoint = ctx.resolvePlanBinding(bindings.attachedBinding, measureCtx);
    const otherPoint = ctx.resolvePlanBinding(bindings.otherBinding, measureCtx);
    if (!attachedPoint || !otherPoint) return;

    const delta = attachedPoint.clone().sub(otherPoint);
    if (delta.lengthSq() < 1e-10) return;
    const currentDistanceMm = Math.round(delta.length() * 1000);
    if (currentDistanceMm === desiredMm) return;
    delta.normalize().multiplyScalar((desiredMm - currentDistanceMm) / 1000);
    const dxMm = Math.round(delta.x * 1000);
    const dzMm = Math.round(delta.z * 1000);
    if (dxMm === 0 && dzMm === 0) return;

    let applied = false;
    switch (target.kind) {
      case "wall":
        applied = ctx.translateWallByMeasure(target.wallId, dxMm, dzMm);
        break;
      case "module":
        applied = ctx.translateModuleByMeasure(target.instanceId, dxMm, dzMm);
        break;
      case "floor":
        applied = ctx.translateFloorByMeasure(target.floorId, dxMm, dzMm);
        break;
      case "kitchenGroup":
        applied = ctx.translateKitchenGroupByMeasure(target.groupId, dxMm, dzMm);
        break;
    }

    if (!applied) return;
    ctx.refreshAssociativeMeasures();
    ctx.updateMeasureLabelInteractivity();
    ctx.updateLayoutPanel();
    ctx.commitHistory(ctx.S);
    ctx.mountProps();
  };

  return { commitSelectedMeasureValueMm };
}
