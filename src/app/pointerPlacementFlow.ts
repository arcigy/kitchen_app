import * as THREE from "three";

export function consumePlacementPointerEvent(args: {
  preventDefault: () => void;
  stopPropagation: () => void;
}) {
  args.preventDefault();
  args.stopPropagation();
}

export function handlePlacementCommitPointerDown<State, Helpers>(args: {
  button: number;
  commitPlacement: (state: State, helpers: Helpers) => boolean;
  getHitPoint: () => THREE.Vector3 | null;
  helpers: Helpers;
  isActive: boolean;
  preventDefault: () => void;
  rebuildGhost: (state: State, helpers: Helpers, point: THREE.Vector3) => void;
  state: State;
  stopPropagation: () => void;
}) {
  if (!args.isActive) return false;
  if (args.button !== 0) return true;
  const hitPoint = args.getHitPoint();
  if (!hitPoint) return true;

  args.rebuildGhost(args.state, args.helpers, hitPoint);
  args.commitPlacement(args.state, args.helpers);
  consumePlacementPointerEvent({
    preventDefault: args.preventDefault,
    stopPropagation: args.stopPropagation
  });
  return true;
}

export function handlePlacementPreviewPointerMove<State, Helpers>(args: {
  helpers: Helpers;
  hitPoint: THREE.Vector3 | null;
  isActive: boolean;
  rebuildGhost: (state: State, helpers: Helpers, point: THREE.Vector3) => void;
  state: State;
}) {
  if (!args.isActive) return false;
  if (!args.hitPoint) return true;

  args.rebuildGhost(args.state, args.helpers, args.hitPoint);
  return true;
}

export function handleOpeningPlacementClick(args: {
  insertAtWallPoint: (wallId: string) => void;
  missingWallStatus: string;
  pickWallId: () => string | null;
  setStatus: (status: string) => void;
}) {
  const wallId = args.pickWallId();
  if (!wallId) {
    args.setStatus(args.missingWallStatus);
    return true;
  }
  args.insertAtWallPoint(wallId);
  return true;
}

export function handleFloorplanPlacementClick(args: {
  cancelPendingMarquee: () => void;
  insertColumnAtPoint: () => void;
  insertDoorAtWallPoint: (wallId: string) => void;
  insertWindowAtWallPoint: (wallId: string) => void;
  isColumnPlacementActive: boolean;
  isDoorPlacementActive: boolean;
  isWindowPlacementActive: boolean;
  pickWallId: () => string | null;
  preventDefault: () => void;
  setStatus: (status: string) => void;
  stopPropagation: () => void;
}) {
  if (args.isColumnPlacementActive) {
    args.cancelPendingMarquee();
    args.insertColumnAtPoint();
    consumePlacementPointerEvent({
      preventDefault: args.preventDefault,
      stopPropagation: args.stopPropagation
    });
    return true;
  }

  if (args.isWindowPlacementActive) {
    return handleOpeningPlacementClick({
      insertAtWallPoint: args.insertWindowAtWallPoint,
      missingWallStatus: "Window: klikni priamo na stenu.",
      pickWallId: args.pickWallId,
      setStatus: args.setStatus
    });
  }

  if (args.isDoorPlacementActive) {
    return handleOpeningPlacementClick({
      insertAtWallPoint: args.insertDoorAtWallPoint,
      missingWallStatus: "Door: klikni priamo na stenu.",
      pickWallId: args.pickWallId,
      setStatus: args.setStatus
    });
  }

  return false;
}

export function handleOpeningPlacementPreviewPointerMove<PointMm>(args: {
  clearPreview: () => void;
  hitPoint: THREE.Vector3 | null;
  isActive: boolean;
  pickWallId: (pointMm: PointMm) => string | null;
  pointFromHit: (hitPoint: THREE.Vector3) => PointMm;
  updatePreview: (wallId: string | null, pointMm: PointMm) => void;
}) {
  if (!args.isActive) return false;
  if (!args.hitPoint) {
    args.clearPreview();
    return true;
  }

  const pointMm = args.pointFromHit(args.hitPoint);
  args.updatePreview(args.pickWallId(pointMm), pointMm);
  return true;
}

export function resolveSelectOpeningPlacementPreviewRoute(args: {
  isDoorActive: boolean;
  isWindowActive: boolean;
}) {
  if (args.isWindowActive) return "window";
  if (args.isDoorActive) return "door";
  return null;
}

export function handleSelectOpeningPlacementPreviewPointerMove<PointMm>(args: {
  clearDoorPreview: () => void;
  clearWindowPreview: () => void;
  hitPoint: THREE.Vector3 | null;
  isDoorActive: boolean;
  isWindowActive: boolean;
  pickWallId: (pointMm: PointMm) => string | null;
  pointFromHit: (hitPoint: THREE.Vector3) => PointMm;
  updateDoorPreview: (wallId: string | null, pointMm: PointMm) => void;
  updateWindowPreview: (wallId: string | null, pointMm: PointMm) => void;
}) {
  const route = resolveSelectOpeningPlacementPreviewRoute({
    isDoorActive: args.isDoorActive,
    isWindowActive: args.isWindowActive
  });

  if (route === "window") {
    return handleOpeningPlacementPreviewPointerMove({
      clearPreview: args.clearWindowPreview,
      hitPoint: args.hitPoint,
      isActive: true,
      pickWallId: args.pickWallId,
      pointFromHit: args.pointFromHit,
      updatePreview: args.updateWindowPreview
    });
  }

  if (route === "door") {
    return handleOpeningPlacementPreviewPointerMove({
      clearPreview: args.clearDoorPreview,
      hitPoint: args.hitPoint,
      isActive: true,
      pickWallId: args.pickWallId,
      pointFromHit: args.pointFromHit,
      updatePreview: args.updateDoorPreview
    });
  }

  return false;
}

export function resetColumnPlacementPreview(args: {
  clearPlanSnap: () => void;
  hideHoverCursor: () => void;
  updatePreview: (pointMm: null) => void;
}) {
  args.updatePreview(null);
  args.clearPlanSnap();
  args.hideHoverCursor();
}

export function handleColumnPlacementPreviewPointerMove<PointMm>(args: {
  clearPlanSnap: () => void;
  hideHoverCursor: () => void;
  hitPoint: THREE.Vector3 | null;
  isActive: boolean;
  pointFromPlacementPoint: (placementPoint: THREE.Vector3) => PointMm;
  resolvePlacementPoint: (hitPoint: THREE.Vector3) => THREE.Vector3;
  updatePreview: (pointMm: PointMm | null) => void;
}) {
  if (!args.isActive) return false;
  if (!args.hitPoint) {
    resetColumnPlacementPreview({
      clearPlanSnap: args.clearPlanSnap,
      hideHoverCursor: args.hideHoverCursor,
      updatePreview: args.updatePreview
    });
    return true;
  }

  args.updatePreview(args.pointFromPlacementPoint(args.resolvePlacementPoint(args.hitPoint)));
  return true;
}
