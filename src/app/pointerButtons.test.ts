import { describe, expect, it } from "vitest";
import { isPrimaryPointerButton } from "./pointerButtons";

describe("pointer button helpers", () => {
  it("accepts only left click as a point commit button", () => {
    expect(isPrimaryPointerButton(0)).toBe(true);
    expect(isPrimaryPointerButton(1)).toBe(false);
    expect(isPrimaryPointerButton(2)).toBe(false);
    expect(isPrimaryPointerButton(3)).toBe(false);
    expect(isPrimaryPointerButton(4)).toBe(false);
  });
});
