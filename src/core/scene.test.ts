import { describe, expect, it } from "vitest";
import { SCENE_RENDERER_OPTIONS } from "./scene";

describe("scene renderer options", () => {
  it("keeps the rendered framebuffer available for feedback screenshots", () => {
    expect(SCENE_RENDERER_OPTIONS.preserveDrawingBuffer).toBe(true);
  });
});
