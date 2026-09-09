// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { extendedFurnitureModulePackages } from "../../../system/module-packages/extendedFurniture";
import { applyModuleParameterPreset, createDefaultModulePackageParameters } from "./module-runtime-adapter";
import {
  createModuleParameterPresetPicker,
  resolveMatchingModuleParameterPresetId
} from "./moduleParameterPresetPicker";

import type { ClientCatalog } from "../../catalog/catalog-types";
import { requestModulePresetPreview } from "./modulePresetPreview";
vi.mock("./modulePresetPreview", () => ({ requestModulePresetPreview: vi.fn(async ({ parameters, presetId }) => `data:image/png;base64,${parameters.width}-${presetId}`) }));
const clientCatalog = { clientId: "preview-test", meta: {} } as ClientCatalog;
afterEach(() => { document.body.replaceChildren(); vi.clearAllMocks(); });

function drawerPackage() {
  const modulePackage = extendedFurnitureModulePackages.find(
    (candidate) => candidate.module.moduleType === "fwm_catalog_base_drawers"
  );
  if (!modulePackage) throw new Error("Drawer package missing.");
  return modulePackage;
}

describe("module parameter preset picker", () => {
  it("renders actual preset previews asynchronously and applies the clicked option", async () => {
    const modulePackage = drawerPackage();
    const onSelect = vi.fn();
    const picker = createModuleParameterPresetPicker({ modulePackage, parameters: { width: 630 }, clientCatalog, onSelect });
    const trigger = picker.element.querySelector<HTMLButtonElement>("[data-module-parameter-preset-trigger]")!;
    const cards = [...picker.element.querySelectorAll<HTMLButtonElement>("[data-parameter-preset-id]")];

    expect(cards).toHaveLength(8);
    document.body.append(picker.element);
    await vi.waitFor(() => expect(cards[0]?.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,630-drawers_1_full_height"));
    expect(requestModulePresetPreview).toHaveBeenCalledWith(expect.objectContaining({ parameters: { width: 630 }, presetId: "drawers_1_full_height" }));
    expect(picker.element.querySelector<HTMLElement>(".module-parameter-preset-options")?.hidden).toBe(true);
    trigger.click();
    expect(picker.element.querySelector<HTMLElement>(".module-parameter-preset-options")?.hidden).toBe(false);
    cards[2]!.click();
    expect(onSelect).toHaveBeenCalledWith("drawers_2_top_shallow");
    expect(trigger.textContent).toContain("2x zasuvka - horna mala");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps finished image nodes when unchanged parameters refresh the picker", async () => {
    const modulePackage = drawerPackage();
    const picker = createModuleParameterPresetPicker({ modulePackage, parameters: { width: 630 }, clientCatalog, onSelect: vi.fn() });
    document.body.append(picker.element);
    await vi.waitFor(() => expect(picker.element.querySelector("img")).not.toBeNull());
    const firstImage = picker.element.querySelector<HTMLImageElement>(
      '[data-parameter-preset-id="drawers_1_full_height"] img'
    );

    picker.refresh("");

    expect(picker.element.querySelector(
      '[data-parameter-preset-id="drawers_1_full_height"] img'
    )).toBe(firstImage);
  });

  it("refreshes images on dimension changes and never substitutes a base image after failure", async () => {
    const parameters = { width: 600 };
    const picker = createModuleParameterPresetPicker({ modulePackage: drawerPackage(), parameters, clientCatalog, onSelect: vi.fn() });
    document.body.append(picker.element);
    await vi.waitFor(() => expect(picker.element.querySelector("img")?.src).toContain("600"));
    parameters.width = 920;
    picker.refresh();
    await vi.waitFor(() => expect(picker.element.querySelector("img")?.src).toContain("920"));
    vi.mocked(requestModulePresetPreview).mockRejectedValueOnce(new Error("GPU unavailable"));
    parameters.width = 800;
    picker.refresh();
    await vi.waitFor(() => expect(picker.element.querySelector('[data-preview-state="error"]')).not.toBeNull());
    expect(picker.element.querySelector('[data-preview-state="error"] img')).toBeNull();
    expect(picker.element.querySelector('[data-preview-state="error"]')?.textContent).toContain("Náhľad nedostupný");
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
