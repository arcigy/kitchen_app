export type OpeningPointerDragFinishState = {
  active: boolean;
  pointerId?: number | null;
  wall: string | null;
};

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

export function finishPointerDragState(params: FinishPointerDragStateParams): boolean {
  if (params.windowDragState.active) {
    params.windowDragState.active = false;
    params.windowDragState.wall = null;
    params.releasePointerCapture(params.pointerId);
    return true;
  }

  if (params.doorDragState.active) {
    params.doorDragState.active = false;
    params.doorDragState.wall = null;
    params.releasePointerCapture(params.pointerId);
    return true;
  }

  if (!params.moduleDragState.active) return false;
  params.moduleDragState.active = false;
  params.moduleDragState.id = null;
  params.releasePointerCapture(params.pointerId);
  return true;
}
