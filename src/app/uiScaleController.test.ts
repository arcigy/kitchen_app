// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createUiScaleController } from "./uiScaleController";

describe("UI scale controller", () => {
  it("persists a device-local large setting and only changes presentation state", () => {
    const root = document.createElement("div");
    const storage = window.localStorage;
    storage.removeItem("arcigy.ui-scale.v1");
    const controller = createUiScaleController({ root, storage });
    controller.setScale("large");

    expect(root.dataset.uiScale).toBe("large");
    expect(root.style.getPropertyValue("--arcigy-ui-scale")).toBe("1.2");
    expect(storage.getItem("arcigy.ui-scale.v1")).toBe("large");

    const restored = createUiScaleController({ root: document.createElement("div"), storage });
    expect(restored.getScale()).toBe("large");
    storage.removeItem("arcigy.ui-scale.v1");
  });

  it("renders explicit standard and large controls", () => {
    const controller = createUiScaleController({ root: document.createElement("div"), storage: window.localStorage });
    const control = controller.createControl();
    expect(control.textContent).toContain("Štandardná");
    expect(control.textContent).toContain("Zväčšená");
  });
});
