import type { PointerOpeningDragState } from "./pointerOpeningDragBegin";

export type OpeningPointerDragFinishState = Pick<PointerOpeningDragState, "active" | "pointerId" | "wall">;

export type ModulePointerDragFinishState = {
  active: boolean;
  id: string | null;
};

type FinishPointerDragStateParams = {
  doorDragState: OpeningPointerDragFinishState;
  moduleDragState: ModulePointerDragFinishState;
  pointerId: number;
  releasePointerCapture: (pointerId: number) => void;
  windowDragState: OpeningPointerDragFinishState;
};

export function finishOpeningPointerDragState(state: OpeningPointerDragFinishState): boolean {
  if (!state.active) return false;
  state.active = false;
  state.wall = null;
  return true;
}

export function finishModulePointerDragState(state: ModulePointerDragFinishState): boolean {
  if (!state.active) return false;
  state.active = false;
  state.id = null;
  return true;
}

export function finishPointerDragState(params: FinishPointerDragStateParams): boolean {
  if (finishOpeningPointerDragState(params.windowDragState)) {
    params.releasePointerCapture(params.pointerId);
    return true;
  }

  if (finishOpeningPointerDragState(params.doorDragState)) {
    params.releasePointerCapture(params.pointerId);
    return true;
  }

  if (!finishModulePointerDragState(params.moduleDragState)) return false;
  params.releasePointerCapture(params.pointerId);
  return true;
}
