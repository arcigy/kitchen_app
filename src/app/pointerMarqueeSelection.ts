import { refreshSelectionHighlights, replaceSelectionIdSet, resolveMergedSelectionIdSet } from "./selectionController";

export type ScreenPoint = { x: number; y: number };

export type ScreenRect = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type ScreenBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type PointerMarqueeState = {
  active: boolean;
  hitSomething: boolean;
  mode: "contain" | "touch";
  pending: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
};

export type PointerMarqueeElement = {
  style: {
    background: string;
    border: string;
    display: string;
    height: string;
    left: string;
    top: string;
    width: string;
  };
};

export function makeMarqueeRect(startX: number, startY: number, endX: number, endY: number): ScreenRect {
  return {
    x0: Math.min(startX, endX),
    y0: Math.min(startY, endY),
    x1: Math.max(startX, endX),
    y1: Math.max(startY, endY)
  };
}

export function beginPointerMarquee(
  marquee: PointerMarqueeState,
  marqueeEl: PointerMarqueeElement,
  args: { pointerId: number; x: number; y: number }
) {
  marquee.pending = true;
  marquee.active = false;
  marquee.pointerId = args.pointerId;
  marquee.hitSomething = false;
  marquee.startX = args.x;
  marquee.startY = args.y;
  marquee.mode = "contain";
  marqueeEl.style.display = "none";
}

export function updatePointerMarqueeDrag(
  marquee: PointerMarqueeState,
  marqueeEl: PointerMarqueeElement,
  args: { pointerId: number; x: number; y: number; thresholdPx?: number }
) {
  if (marquee.active) {
    marquee.mode = args.x >= marquee.startX ? "contain" : "touch";
    applyPointerMarqueeModeStyle(marquee, marqueeEl);
    const rect = makeMarqueeRect(marquee.startX, marquee.startY, args.x, args.y);
    applyPointerMarqueeRectStyle(marqueeEl, rect);
    return true;
  }

  if (!marquee.pending || marquee.pointerId !== args.pointerId) return false;
  const thresholdPx = args.thresholdPx ?? 6;
  const w = Math.abs(args.x - marquee.startX);
  const h = Math.abs(args.y - marquee.startY);
  if (w < thresholdPx && h < thresholdPx) return false;

  marquee.active = true;
  marquee.mode = "contain";
  applyPointerMarqueeModeStyle(marquee, marqueeEl);
  applyPointerMarqueeRectStyle(marqueeEl, makeMarqueeRect(marquee.startX, marquee.startY, marquee.startX, marquee.startY));
  marqueeEl.style.display = "block";
  return true;
}

export function updatePointerMarqueePointerMove(
  marquee: PointerMarqueeState,
  marqueeEl: PointerMarqueeElement,
  args: { pointerId: number; x: number; y: number; thresholdPx?: number }
) {
  if (marquee.active) return updatePointerMarqueeDrag(marquee, marqueeEl, args);
  if (marquee.pending && marquee.pointerId === args.pointerId) return updatePointerMarqueeDrag(marquee, marqueeEl, args);
  return false;
}

export function clearPointerMarquee(marquee: PointerMarqueeState, marqueeEl: PointerMarqueeElement) {
  deactivatePointerMarquee(marquee, marqueeEl, { clearPointerId: true });
}

export function cancelPendingPointerMarqueeHit(marquee: PointerMarqueeState, marqueeEl: PointerMarqueeElement, pointerId: number) {
  if (!marquee.pending || marquee.pointerId !== pointerId) return false;
  marquee.hitSomething = true;
  deactivatePointerMarquee(marquee, marqueeEl, { clearPointerId: false });
  return true;
}

function applyPointerMarqueeModeStyle(marquee: PointerMarqueeState, marqueeEl: PointerMarqueeElement) {
  if (marquee.mode === "contain") {
    marqueeEl.style.border = "1px solid rgba(92, 140, 255, 0.95)";
    marqueeEl.style.background = "rgba(92, 140, 255, 0.10)";
  } else {
    marqueeEl.style.border = "1px solid rgba(61, 220, 151, 0.95)";
    marqueeEl.style.background = "rgba(61, 220, 151, 0.10)";
  }
}

function applyPointerMarqueeRectStyle(marqueeEl: PointerMarqueeElement, rect: ScreenRect) {
  marqueeEl.style.left = `${rect.x0}px`;
  marqueeEl.style.top = `${rect.y0}px`;
  marqueeEl.style.width = `${Math.max(0, rect.x1 - rect.x0)}px`;
  marqueeEl.style.height = `${Math.max(0, rect.y1 - rect.y0)}px`;
}

function deactivatePointerMarquee(
  marquee: PointerMarqueeState,
  marqueeEl: PointerMarqueeElement,
  opts: { clearPointerId: boolean }
) {
  marquee.active = false;
  marquee.pending = false;
  if (opts.clearPointerId) marquee.pointerId = null;
  marqueeEl.style.display = "none";
}

export function boundsFromPoints(points: ScreenPoint[]): ScreenBounds | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

export function boundsContainedInRect(bounds: ScreenBounds, rect: ScreenRect): boolean {
  return bounds.minX >= rect.x0 && bounds.maxX <= rect.x1 && bounds.minY >= rect.y0 && bounds.maxY <= rect.y1;
}

export function boundsOverlapsRect(bounds: ScreenBounds, rect: ScreenRect): boolean {
  return bounds.maxX >= rect.x0 && bounds.minX <= rect.x1 && bounds.maxY >= rect.y0 && bounds.minY <= rect.y1;
}

function pointInRect(point: ScreenPoint, rect: ScreenRect): boolean {
  return point.x >= rect.x0 && point.x <= rect.x1 && point.y >= rect.y0 && point.y <= rect.y1;
}

function orientation(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentIntersects(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD <= 0 && cdA * cdB <= 0;
}

export function polygonTouchesRect(poly: ScreenPoint[], rect: ScreenRect): boolean {
  if (poly.some((point) => pointInRect(point, rect))) return true;
  const corners = [
    { x: rect.x0, y: rect.y0 },
    { x: rect.x1, y: rect.y0 },
    { x: rect.x1, y: rect.y1 },
    { x: rect.x0, y: rect.y1 }
  ];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (let j = 0; j < corners.length; j++) {
      if (segmentIntersects(a, b, corners[j], corners[(j + 1) % corners.length])) return true;
    }
  }
  return false;
}

export type ResolveMarqueeSelectionArgs = {
  additive: boolean;
  currentInstanceId: string | null;
  currentWallId: string | null;
  hitInstanceIds: string[];
  hitWallIds: string[];
  selectedInstanceIds: Iterable<string>;
  selectedWallIds: Iterable<string>;
};

export type ResolvedMarqueeSelection = {
  primaryInstanceId: string | null;
  primaryWallId: string | null;
  selectedInstanceIds: string[];
  selectedWallIds: string[];
};

export function resolveMarqueeSelection(args: ResolveMarqueeSelectionArgs): ResolvedMarqueeSelection {
  const nextWalls = resolveMergedSelectionIdSet({
    additive: args.additive,
    currentIds: args.selectedWallIds,
    hitIds: args.hitWallIds
  });
  const nextInstances = resolveMergedSelectionIdSet({
    additive: args.additive,
    currentIds: args.selectedInstanceIds,
    hitIds: args.hitInstanceIds
  });

  let primaryWallId = args.currentWallId && nextWalls.has(args.currentWallId) ? args.currentWallId : null;
  let primaryInstanceId = args.currentInstanceId && nextInstances.has(args.currentInstanceId) ? args.currentInstanceId : null;
  if (!primaryWallId && !primaryInstanceId) {
    primaryWallId = args.hitWallIds[0] ?? null;
    primaryInstanceId = primaryWallId ? null : args.hitInstanceIds[0] ?? null;
  }

  return {
    primaryInstanceId,
    primaryWallId,
    selectedInstanceIds: Array.from(nextInstances),
    selectedWallIds: Array.from(nextWalls)
  };
}

export function applyResolvedMarqueeSelection(args: {
  mountProps: () => void;
  resolvedSelection: ResolvedMarqueeSelection;
  selectedInstanceIds: Set<string>;
  selectedWallIds: Set<string>;
  setSelectedModule: (id: string | null) => void;
  setSelectedWall: (id: string | null) => void;
  updateSelectionHighlights: () => void;
}) {
  const { resolvedSelection } = args;

  if (resolvedSelection.primaryWallId) args.setSelectedWall(resolvedSelection.primaryWallId);
  else if (resolvedSelection.primaryInstanceId) args.setSelectedModule(resolvedSelection.primaryInstanceId);
  else {
    args.setSelectedWall(null);
    args.setSelectedModule(null);
  }

  replaceSelectionIdSet(args.selectedWallIds, resolvedSelection.selectedWallIds);
  replaceSelectionIdSet(args.selectedInstanceIds, resolvedSelection.selectedInstanceIds);
  refreshSelectionHighlights(args);
  args.mountProps();
}

export function finishActivePointerMarquee(args: {
  additive: boolean;
  applyCustomSelection?: (selectionRect: ScreenRect, additive: boolean) => boolean;
  collectHitIds: (selectionRect: ScreenRect) => { hitInstanceIds: string[]; hitWallIds: string[] };
  currentInstanceId: string | null;
  currentWallId: string | null;
  endPoint: ScreenPoint;
  layoutTool: string;
  marquee: PointerMarqueeState;
  marqueeEl: PointerMarqueeElement;
  mountProps: () => void;
  pointerId: number;
  releasePointerCapture: (pointerId: number) => void;
  selectedInstanceIds: Set<string>;
  selectedWallIds: Set<string>;
  setSelectedModule: (id: string | null) => void;
  setSelectedWall: (id: string | null) => void;
  updateSelectionHighlights: () => void;
}) {
  clearPointerMarquee(args.marquee, args.marqueeEl);

  const selectionRect = makeMarqueeRect(args.marquee.startX, args.marquee.startY, args.endPoint.x, args.endPoint.y);
  const w = selectionRect.x1 - selectionRect.x0;
  const h = selectionRect.y1 - selectionRect.y0;

  if (w >= 6 && h >= 6 && args.layoutTool === "select") {
    if (args.applyCustomSelection?.(selectionRect, args.additive)) {
      args.releasePointerCapture(args.pointerId);
      return;
    }

    const { hitInstanceIds, hitWallIds } = args.collectHitIds(selectionRect);
    const resolvedSelection = resolveMarqueeSelection({
      additive: args.additive,
      currentInstanceId: args.currentInstanceId,
      currentWallId: args.currentWallId,
      hitInstanceIds,
      hitWallIds,
      selectedInstanceIds: args.selectedInstanceIds,
      selectedWallIds: args.selectedWallIds
    });

    applyResolvedMarqueeSelection({
      mountProps: args.mountProps,
      resolvedSelection,
      selectedInstanceIds: args.selectedInstanceIds,
      selectedWallIds: args.selectedWallIds,
      setSelectedModule: args.setSelectedModule,
      setSelectedWall: args.setSelectedWall,
      updateSelectionHighlights: args.updateSelectionHighlights
    });
  }

  args.releasePointerCapture(args.pointerId);
}

export function finishPendingPointerMarquee(args: {
  button: number;
  clientX: number;
  clientY: number;
  layoutTool: string;
  marquee: PointerMarqueeState;
  openQuickActionMenu?: (x: number, y: number) => void;
  pointerId: number;
  releasePointerCapture: (pointerId: number) => void;
  setSelectedModule: (id: string | null) => void;
  setSelectedWall: (id: string | null) => void;
  viewMode: string;
}) {
  if (!args.marquee.pending || args.marquee.pointerId !== args.pointerId || args.marquee.active) return false;

  const wasRightClick = args.button === 2;
  args.marquee.pending = false;
  args.marquee.pointerId = null;
  if (!args.marquee.hitSomething && args.viewMode === "2d" && args.layoutTool === "select") {
    args.setSelectedWall(null);
    args.setSelectedModule(null);
  }
  args.releasePointerCapture(args.pointerId);
  if (wasRightClick) args.openQuickActionMenu?.(args.clientX, args.clientY);
  return true;
}
