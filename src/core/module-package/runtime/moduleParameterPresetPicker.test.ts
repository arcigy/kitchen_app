// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { extendedFurnitureModulePackages } from "../../../system/module-packages/extendedFurniture";
import { applyModuleParameterPreset, createDefaultModulePackageParameters } from "./module-runtime-adapter";
import {
  createModuleParameterPresetPicker,
  resolveMatchingModuleParameterPresetId
} from "./moduleParameterPresetPicker";

function drawerPackage() {
  const modulePackage = extendedFurnitureModulePackages.find(
    (candidate) => candidate.module.moduleType === "fwm_catalog_base_drawers"
  );
  if (!modulePackage) throw new Error("Drawer package missing.");
  return modulePackage;
}

describe("module parameter preset picker", () => {
  it("eagerly warms every preset image and applies the clicked option", () => {
    const modulePackage = drawerPackage();
    const onSelect = vi.fn();
    const picker = createModuleParameterPresetPicker({ modulePackage, onSelect });
    const trigger = picker.element.querySelector<HTMLButtonElement>("[data-module-parameter-preset-trigger]")!;
    const cards = [...picker.element.querySelectorAll<HTMLButtonElement>("[data-parameter-preset-id]")];

    expect(cards).toHaveLength(8);
    expect(cards[0]?.querySelector("img")?.getAttribute("src")).toBe(
      "/module-icons/furniture/v4/presets/fwm_catalog_base_drawers__drawers_1_full_height.png"
    );
    expect(cards.every((card) => card.querySelector<HTMLImageElement>("img")?.loading === "eager")).toBe(true);
    expect(cards.every((card) => card.querySelector("img")?.getAttribute("fetchpriority") === "high")).toBe(true);
    expect(picker.element.querySelector<HTMLElement>(".module-parameter-preset-options")?.hidden).toBe(true);
    trigger.click();
    expect(picker.element.querySelector<HTMLElement>(".module-parameter-preset-options")?.hidden).toBe(false);
    cards[2]!.click();
    expect(onSelect).toHaveBeenCalledWith("drawers_2_top_shallow");
    expect(trigger.textContent).toContain("2x zasuvka - horna mala");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps warmed image nodes when unchanged parameters refresh the picker", () => {
    const modulePackage = drawerPackage();
    const picker = createModuleParameterPresetPicker({ modulePackage, onSelect: vi.fn() });
    const firstImage = picker.element.querySelector<HTMLImageElement>(
      '[data-parameter-preset-id="drawers_1_full_height"] img'
    );

    picker.refresh("");

    expect(picker.element.querySelector(
      '[data-parameter-preset-id="drawers_1_full_height"] img'
    )).toBe(firstImage);
  });

  it("recognizes the preset already represented by current module parameters", () => {
    const modulePackage = drawerPackage();
    const defaults = createDefaultModulePackageParameters(modulePackage);
    const applied = applyModuleParameterPreset({
      modulePackage,
      parameters: defaults,
      presetId: "drawers_4_three_shallow_one_high"
    });
    expect(resolveMatchingModuleParameterPresetId(modulePackage, applied)).toBe("drawers_4_three_shallow_one_high");
    expect(resolveMatchingModuleParameterPresetId(modulePackage, { ...applied, drawer2FrontHeightMm: 999 })).toBe("");
  });
});
