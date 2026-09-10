import { describe, expect, it } from "vitest";
import { resolveRendererPixelRatio } from "./scene";

describe("renderer pixel ratio", () => {
  it("caps touch rendering below the desktop cap while preserving normal displays", () => {
    expect(resolveRendererPixelRatio(3, true)).toBe(1.5);
    expect(resolveRendererPixelRatio(3, false)).toBe(2);
    expect(resolveRendererPixelRatio(1.25, true)).toBe(1.25);
  });
});
