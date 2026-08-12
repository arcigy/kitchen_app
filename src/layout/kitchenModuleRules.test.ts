import { describe, expect, it } from "vitest";
import {
  isKitchenModuleInEditLayer,
  isKitchenModuleSelectableInEditLayer,
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

  it("keeps tall modules selectable from both editable layers", () => {
    expect(isKitchenModuleSelectableInEditLayer({ kitchenModuleRole: "tall" }, "base")).toBe(true);
    expect(isKitchenModuleSelectableInEditLayer({ kitchenModuleRole: "tall" }, "upper")).toBe(true);
    expect(isKitchenModuleSelectableInEditLayer({ kitchenModuleRole: "low" }, "upper")).toBe(false);
    expect(isKitchenModuleSelectableInEditLayer({ kitchenModuleRole: "top" }, "base")).toBe(false);
  });

  it("gives the active layer and tall modules full plan emphasis while keeping the other layer faint", () => {
    const active = resolveKitchenModulePlanEmphasis({ kitchenModuleRole: "upper" }, "upper");
    const inactive = resolveKitchenModulePlanEmphasis({ kitchenModuleRole: "low" }, "upper");
    const tall = resolveKitchenModulePlanEmphasis({ kitchenModuleRole: "tall" }, "upper");

    expect(active).toMatchObject({
      active: true,
      color: 0x111111,
      opacity: 1,
      renderOrder: 60
    });
    expect(inactive).toMatchObject({
      active: false,
      color: 0xb7bdc7,
      opacity: 1,
      renderOrder: 54
    });
    expect(tall).toMatchObject({
      active: true,
      color: 0x111111,
      opacity: 1,
      renderOrder: 60
    });
  });
});
