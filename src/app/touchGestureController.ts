export type TouchGestureIntent =
  | "tap"
  | "double-tap"
  | "long-press"
  | "object-drag"
  | "orbit"
  | "pan"
  | "pinch"
  | "marquee"
  | "cancel";

export type TouchPoint = { id: number; x: number; y: number };
export type TouchNavigationDelta = {
  centroidX: number;
  centroidY: number;
  deltaX: number;
  deltaY: number;
  distance: number;
  scale: number;
};

export function touchCentroid(points: readonly TouchPoint[]) {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

export function touchDistance(a: TouchPoint, b: TouchPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function resolveTouchNavigationDelta(previous: readonly TouchPoint[], current: readonly TouchPoint[]): TouchNavigationDelta | null {
  if (previous.length < 2 || current.length < 2) return null;
  const previousCentroid = touchCentroid(previous);
  const currentCentroid = touchCentroid(current);
  const previousDistance = Math.max(1, touchDistance(previous[0]!, previous[1]!));
  const currentDistance = Math.max(1, touchDistance(current[0]!, current[1]!));
  return {
    centroidX: currentCentroid.x,
    centroidY: currentCentroid.y,
    deltaX: currentCentroid.x - previousCentroid.x,
    deltaY: currentCentroid.y - previousCentroid.y,
    distance: currentDistance,
    scale: currentDistance / previousDistance
  };
}

export function createTouchGestureController(args: {
  onMultiTouchStart?: (pointerIds: readonly number[]) => void;
  onMultiTouchMove: (delta: TouchNavigationDelta) => void;
  onMultiTouchEnd?: () => void;
}) {
  const points = new Map<number, TouchPoint>();
  let previousPair: TouchPoint[] | null = null;
  let multiTouchActive = false;
  let interrupted = false;
  const suppressedPointers = new Set<number>();

  const pair = () => [...points.values()].slice(0, 2);
  const startMultiTouch = () => {
    if (points.size < 2 || multiTouchActive) return;
    multiTouchActive = true;
    previousPair = pair();
    for (const id of points.keys()) suppressedPointers.add(id);
    args.onMultiTouchStart?.([...points.keys()]);
  };

  const pointerDown = (event: Pick<PointerEvent, "pointerId" | "pointerType" | "clientX" | "clientY">) => {
    if (event.pointerType !== "touch") return false;
    points.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
    if (points.size > 2) {
      const wasActive = multiTouchActive;
      multiTouchActive = false;
      previousPair = null;
      interrupted = true;
      for (const id of points.keys()) suppressedPointers.add(id);
      if (wasActive) args.onMultiTouchEnd?.();
      return true;
    }
    startMultiTouch();
    return multiTouchActive;
  };

  const pointerMove = (event: Pick<PointerEvent, "pointerId" | "pointerType" | "clientX" | "clientY">) => {
    if (event.pointerType !== "touch" || !points.has(event.pointerId)) return false;
    points.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
    if (interrupted) return true;
    if (!multiTouchActive || !previousPair) return false;
    const currentPair = pair();
    const delta = resolveTouchNavigationDelta(previousPair, currentPair);
    previousPair = currentPair;
    if (delta) args.onMultiTouchMove(delta);
    return true;
  };

  const pointerEnd = (event: Pick<PointerEvent, "pointerId" | "pointerType">) => {
    if (event.pointerType !== "touch") return false;
    const consumed = multiTouchActive || interrupted || suppressedPointers.has(event.pointerId);
    points.delete(event.pointerId);
    if (multiTouchActive && points.size < 2) {
      multiTouchActive = false;
      previousPair = null;
      for (const id of points.keys()) suppressedPointers.add(id);
      args.onMultiTouchEnd?.();
    }
    suppressedPointers.delete(event.pointerId);
    if (points.size === 0) interrupted = false;
    return consumed;
  };

  const cancel = () => {
    const wasActive = multiTouchActive;
    points.clear();
    suppressedPointers.clear();
    previousPair = null;
    multiTouchActive = false;
    interrupted = false;
    if (wasActive) args.onMultiTouchEnd?.();
  };

  return { cancel, isMultiTouchActive: () => multiTouchActive, pointerDown, pointerEnd, pointerMove };
}

export function installTouchActivationGestures(target: HTMLElement, options: {
  longPressMs?: number;
  doubleTapMs?: number;
  movementPx?: number;
} = {}) {
  const longPressMs = options.longPressMs ?? 560;
  const doubleTapMs = options.doubleTapMs ?? 320;
  const movementPx = options.movementPx ?? 10;
  const pointers = new Map<number, { x: number; y: number }>();
  let candidate: { id: number; x: number; y: number; startedAt: number } | null = null;
  let longPressTimer: number | null = null;
  let longPressFired = false;
  let lastTap: { x: number; y: number; at: number } | null = null;

  const clearTimer = () => {
    if (longPressTimer != null) window.clearTimeout(longPressTimer);
    longPressTimer = null;
  };
  const clearCandidate = () => {
    clearTimer();
    candidate = null;
  };
  const dispatchMouseGesture = (type: "contextmenu" | "dblclick", x: number, y: number) => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: type === "contextmenu" ? 2 : 0 }));
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size !== 1) {
      clearCandidate();
      return;
    }
    longPressFired = false;
    candidate = { id: event.pointerId, x: event.clientX, y: event.clientY, startedAt: performance.now() };
    clearTimer();
    longPressTimer = window.setTimeout(() => {
      if (!candidate || pointers.size !== 1) return;
      longPressFired = true;
      dispatchMouseGesture("contextmenu", candidate.x, candidate.y);
      clearCandidate();
    }, longPressMs);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || !candidate || candidate.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > movementPx) clearCandidate();
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    pointers.delete(event.pointerId);
    if (longPressFired) {
      longPressFired = false;
      lastTap = null;
      clearCandidate();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!candidate || candidate.id !== event.pointerId) {
      if (pointers.size === 0) clearCandidate();
      return;
    }
    const tap = { x: event.clientX, y: event.clientY, at: performance.now() };
    const isTap = !longPressFired && tap.at - candidate.startedAt < longPressMs &&
      Math.hypot(tap.x - candidate.x, tap.y - candidate.y) <= movementPx;
    clearCandidate();
    if (!isTap) return;
    if (lastTap && tap.at - lastTap.at <= doubleTapMs && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) <= movementPx * 2) {
      dispatchMouseGesture("dblclick", tap.x, tap.y);
      lastTap = null;
    } else {
      lastTap = tap;
    }
  };
  const onCancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    longPressFired = false;
    clearCandidate();
  };

  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerEnd);
  target.addEventListener("pointercancel", onCancel);
  return () => {
    clearCandidate();
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerEnd);
    target.removeEventListener("pointercancel", onCancel);
  };
}
