// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { installTouchActivationGestures } from "./touchGestureController";

function pointerEvent(type: string, pointerId: number, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "touch" },
    clientX: { value: clientX },
    clientY: { value: clientY }
  });
  return event;
}

describe("touch activation gestures", () => {
  afterEach(() => vi.useRealTimers());

  it("emits a double activation for two nearby one-finger taps", () => {
    const target = document.createElement("div");
    const onDoubleClick = vi.fn();
    target.addEventListener("dblclick", onDoubleClick);
    installTouchActivationGestures(target);

    target.dispatchEvent(pointerEvent("pointerdown", 1, 24, 30));
    target.dispatchEvent(pointerEvent("pointerup", 1, 24, 30));
    target.dispatchEvent(pointerEvent("pointerdown", 2, 26, 31));
    target.dispatchEvent(pointerEvent("pointerup", 2, 26, 31));

    expect(onDoubleClick).toHaveBeenCalledOnce();
  });

  it("opens the context action and suppresses the trailing selection after a long press", () => {
    vi.useFakeTimers();
    const target = document.createElement("div");
    const onContextMenu = vi.fn();
    target.addEventListener("contextmenu", onContextMenu);
    installTouchActivationGestures(target);

    target.dispatchEvent(pointerEvent("pointerdown", 1, 24, 30));
    vi.advanceTimersByTime(560);
    const release = pointerEvent("pointerup", 1, 24, 30);
    target.dispatchEvent(release);

    expect(onContextMenu).toHaveBeenCalledOnce();
    expect(release.defaultPrevented).toBe(true);
  });
});
