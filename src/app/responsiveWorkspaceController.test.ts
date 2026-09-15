import { describe, expect, it } from "vitest";
import { resolveInputProfile, resolveStandalonePresentation, resolveWorkspaceProfile } from "./responsiveWorkspaceController";

describe("responsive workspace profile", () => {
  it.each([
    [360, false, true, "phone"],
    [600, true, false, "phone"],
    [768, true, false, "tablet"],
    [1024, false, true, "tablet"],
    [1440, false, true, "desktop"]
  ] as const)("maps %ipx to %s", (width, coarsePointer, hover, expected) => {
    expect(resolveWorkspaceProfile({ width, coarsePointer, hover })).toBe(expected);
  });

  it("recognises hybrid input without demoting a desktop-sized workspace", () => {
    expect(resolveInputProfile({ coarsePointer: true, finePointer: true, hover: true })).toBe("hybrid");
    expect(resolveWorkspaceProfile({ width: 1440, coarsePointer: true, hover: true })).toBe("desktop");
  });

  it("recognises a stylus after it becomes the active editor pointer", () => {
    expect(resolveInputProfile({ coarsePointer: true, finePointer: true, hover: true, lastPointerType: "pen" })).toBe("pen");
    expect(resolveInputProfile({ coarsePointer: true, finePointer: true, hover: true, lastPointerType: "mouse" })).toBe("hybrid");
  });

  it("recognises installed iOS and Android presentation modes", () => {
    expect(resolveStandalonePresentation({ displayModeStandalone: true })).toBe(true);
    expect(resolveStandalonePresentation({ displayModeStandalone: false, iosStandalone: true })).toBe(true);
    expect(resolveStandalonePresentation({ displayModeStandalone: false })).toBe(false);
  });
});
