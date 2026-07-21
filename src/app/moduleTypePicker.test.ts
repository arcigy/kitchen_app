import { describe, expect, it, vi } from "vitest";
import { extendedFurnitureModulePackages } from "../system/module-packages/extendedFurniture";
import { createModuleTypePicker } from "./moduleTypePicker";
import { installFakeDocument } from "./testUtils/propertiesPanelHarness";

describe("module type picker", () => {
  it("reuses the catalog renderer fallback for modules without a managed PNG preview", () => {
    installFakeDocument();
    const source = extendedFurnitureModulePackages.find(
      (candidate) => candidate.module.moduleType === "fwm_catalog_base_doors"
    )!;
    const modulePackage = structuredClone(source);
    modulePackage.module.moduleType = "test_module_without_preview";
    modulePackage.module.modulePackageId = "test_module_without_preview_v1";
    modulePackage.module.displayName = "Test module";
    modulePackage.ui.previewImage = undefined;
    const renderFallback = vi.fn(() => '<svg data-catalog-fallback="true"></svg>');

    const picker = createModuleTypePicker({
      currentPackageId: modulePackage.module.modulePackageId,
      options: [{
        value: modulePackage.module.modulePackageId,
        label: modulePackage.module.displayName,
        modulePackage,
        catalogModule: null
      }],
      renderFallback,
      onSelect: vi.fn()
    });

    const triggerIcon = picker.children[1]?.children[0];
    const optionIcon = picker.children[2]?.children[0]?.children[0];
    expect(triggerIcon?.innerHTML).toContain('data-catalog-fallback="true"');
    expect(optionIcon?.innerHTML).toContain('data-catalog-fallback="true"');
    expect(renderFallback).toHaveBeenCalledTimes(2);
  });
});
