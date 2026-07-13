import { describe, expect, it } from "vitest";
import {
  isKitchenModuleInEditLayer,
  resolveKitchenModulePlanEmphasis
} from "./kitchenModuleRules";

describe("kitchen module edit layers", () => {
  it("maps low and top aliases to the matching editable layer", () => {
    expect(isKitchenModuleInEditLayer({ kitchenModuleRole: "low" }, "base")).toBe(true);
    expect(isKitchenModuleInEditLayer({ kitchenModuleRole: "base" }, "base")).toBe(true);
    expect(isKitchenModuleInEditLayer({ kitchenModuleRole: "top" }, "upper")).toBe(true);
    expect(isKitchenModuleInEditLayer({ kitchenModuleRole: "wall" }, "upper")).toBe(true);
    expect(isKitchenModuleInEditLayer({ kitchenModuleRole: "tall" }, "base")).toBe(false);
    expect(isKitchenModuleInEditLayer({ kitchenModuleRole: "tall" }, "upper")).toBe(false);
  });

  it("gives the active layer full plan emphasis and keeps the other layer faint", () => {
    const active = resolveKitchenModulePlanEmphasis({ kitchenModuleRole: "upper" }, "upper");
    const inactive = resolveKitchenModulePlanEmphasis({ kitchenModuleRole: "low" }, "upper");

    expect(active).toMatchObject({ active: true, opacity: 1, renderOrder: 60 });
    expect(inactive).toMatchObject({ active: false, opacity: 0.14, renderOrder: 54 });
  });
});
