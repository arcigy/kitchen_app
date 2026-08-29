import { describe, expect, it } from "vitest";
import { applyTypedMillimeterKey, updatePointerTypedHud, type PointerTypedHudElement } from "./pointerTypedHudHelpers";

function makeHud(): PointerTypedHudElement {
  return {
    textContent: null,
    style: {
      display: "",
      left: "",
      top: ""
    }
  };
}

describe("pointer typed HUD helpers", () => {
  it("shows the typed millimeter value at the pointer using current formatting", () => {
    const hud = makeHud();

    expect(updatePointerTypedHud(hud, "1250", { x: 12.5, y: 34 })).toBe(true);

    expect(hud.textContent).toBe("1250 mm");
    expect(hud.style.left).toBe("12.5px");
    expect(hud.style.top).toBe("34px");
    expect(hud.style.display).toBe("block");
  });

  it("keeps the raw typed value text while trimming only for visibility", () => {
    const hud = makeHud();

    expect(updatePointerTypedHud(hud, " 1250 ", { x: 12, y: 34 })).toBe(true);

    expect(hud.textContent).toBe(" 1250  mm");
  });

  it("hides the HUD when the typed value is blank", () => {
    const hud = makeHud();
    hud.textContent = "old";
    hud.style.left = "1px";
    hud.style.top = "2px";

    expect(updatePointerTypedHud(hud, "  ", { x: 12, y: 34 })).toBe(false);

    expect(hud.textContent).toBe("old");
    expect(hud.style.left).toBe("1px");
    expect(hud.style.top).toBe("2px");
    expect(hud.style.display).toBe("none");
  });

  it("appends digit keys up to the current millimeter input limit", () => {
    expect(applyTypedMillimeterKey("123", "4")).toEqual({ handled: true, typedMm: "1234", changed: true });
    expect(applyTypedMillimeterKey("12345678", "9")).toEqual({ handled: true, typedMm: "12345678", changed: false });
  });

  it("removes one typed millimeter character on Backspace", () => {
    expect(applyTypedMillimeterKey("123", "Backspace")).toEqual({ handled: true, typedMm: "12", changed: true });
    expect(applyTypedMillimeterKey("", "Backspace")).toEqual({ handled: true, typedMm: "", changed: false });
  });

  it("ignores non millimeter input keys", () => {
    expect(applyTypedMillimeterKey("123", "Enter")).toEqual({ handled: false, typedMm: "123", changed: false });
    expect(applyTypedMillimeterKey("123", "a")).toEqual({ handled: false, typedMm: "123", changed: false });
  });
});
