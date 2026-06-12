export type OpeningSwingControlAction = "toggleHandedness" | "toggleSwingSide";

export type OpeningSwingParams = {
  swingDirection: "left" | "right";
  swingSide: "inward" | "outward";
};

export function applyOpeningSwingControlAction(params: OpeningSwingParams, action: OpeningSwingControlAction) {
  if (action === "toggleHandedness") {
    params.swingDirection = params.swingDirection === "right" ? "left" : "right";
  } else {
    params.swingSide = params.swingSide === "outward" ? "inward" : "outward";
  }
}

export function applyOpeningSwingControlEdit<T extends { params: OpeningSwingParams }>(args: {
  action: OpeningSwingControlAction;
  commitHistory: () => void;
  instance: T | null | undefined;
  mountProps: () => void;
  selectOpening: () => void;
  updateTransform: (instance: T) => void;
}) {
  if (!args.instance) return false;
  applyOpeningSwingControlAction(args.instance.params, args.action);
  args.updateTransform(args.instance);
  args.selectOpening();
  args.mountProps();
  args.commitHistory();
  return true;
}

export function handleOpeningSelectionControlClick<WindowDimensionParam, DoorDimensionParam>(args: {
  applyDoorSwingControlAction: (action: OpeningSwingControlAction) => boolean;
  applyWindowSwingControlAction: (action: OpeningSwingControlAction) => boolean;
  beginDoorDimensionEdit: (param: DoorDimensionParam) => boolean;
  beginWindowDimensionEdit: (param: WindowDimensionParam) => boolean;
  button: number;
  cancelPendingMarquee: () => void;
  pickDoorDimensionParam: () => DoorDimensionParam | null;
  pickDoorSwingControlAction: () => OpeningSwingControlAction | null;
  pickWindowDimensionParam: () => WindowDimensionParam | null;
  pickWindowSwingControlAction: () => OpeningSwingControlAction | null;
  preventDefault: () => void;
  stopPropagation: () => void;
}) {
  if (args.button !== 0) return false;

  const windowSwingAction = args.pickWindowSwingControlAction();
  if (windowSwingAction && args.applyWindowSwingControlAction(windowSwingAction)) {
    return finishOpeningSelectionControlClick(args);
  }

  const doorSwingAction = args.pickDoorSwingControlAction();
  if (doorSwingAction && args.applyDoorSwingControlAction(doorSwingAction)) {
    return finishOpeningSelectionControlClick(args);
  }

  const windowDimensionParam = args.pickWindowDimensionParam();
  if (windowDimensionParam && args.beginWindowDimensionEdit(windowDimensionParam)) {
    return finishOpeningSelectionControlClick(args);
  }

  const doorDimensionParam = args.pickDoorDimensionParam();
  if (doorDimensionParam && args.beginDoorDimensionEdit(doorDimensionParam)) {
    return finishOpeningSelectionControlClick(args);
  }

  return false;
}

function finishOpeningSelectionControlClick(args: {
  cancelPendingMarquee: () => void;
  preventDefault: () => void;
  stopPropagation: () => void;
}) {
  args.cancelPendingMarquee();
  args.preventDefault();
  args.stopPropagation();
  return true;
}
