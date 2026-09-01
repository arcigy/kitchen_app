// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createRenderLifecycleController } from "./renderLifecycleController";

describe("render lifecycle controller", () => {
  it("stops frames on WebGL context loss and resumes after restoration", () => {
    const canvas = document.createElement("canvas");
    const onResume = vi.fn();
    const controller = createRenderLifecycleController({ canvas, onResume });

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(controller.canRender()).toBe(false);

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(controller.canRender()).toBe(true);
    expect(onResume).toHaveBeenCalledOnce();
    controller.dispose();
  });
});
