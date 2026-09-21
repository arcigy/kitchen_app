import { describe, expect, it } from "vitest";
import { extendedFurnitureModulePackages } from "../../../system/module-packages/extendedFurniture";
import { resolveModuleControlStrategy } from "./module-package-controls";

describe("module control strategy", () => {
  it("uses package controls for the supported cabinet family", () => {
    const modulePackage = extendedFurnitureModulePackages.find(pack => pack.module.moduleType === "fwm_catalog_base_drawers")!;

    expect(resolveModuleControlStrategy(modulePackage, { type: "fwm_catalog_base_drawers" })).toBe("module_package");
    expect(resolveModuleControlStrategy(modulePackage, {})).toBe("module_package");
  });

  it("falls back to package controls for unknown module types", () => {
    const modulePackage = {
      module: {
        moduleType: "unknown_vendor_module"
      }
    } as Parameters<typeof resolveModuleControlStrategy>[0];

    expect(resolveModuleControlStrategy(modulePackage, { type: "unknown_vendor_module" })).toBe("module_package");
  });

  it("uses package controls for Revit export preview packages even when a smart descriptor exists", () => {
    const modulePackage = {
      module: {
        moduleType: "fwm_catalog_base_corner",
        tags: ["revit-export-preview"]
      }
    } as Parameters<typeof resolveModuleControlStrategy>[0];

    expect(resolveModuleControlStrategy(modulePackage, { type: "fwm_catalog_base_corner" })).toBe("module_package");
  });

  it("uses package controls for composed tall hosts so users can edit slot layouts", () => {
    const modulePackage = extendedFurnitureModulePackages.find(
      (candidate) => candidate.module.moduleType === "fwm_catalog_tall_cabinet"
    );

    expect(modulePackage).toBeDefined();
    expect(resolveModuleControlStrategy(modulePackage!, { type: "fwm_catalog_tall_cabinet" })).toBe("module_package");
    expect(modulePackage!.ui.controls.map((control) => control.parameterKey)).toEqual(
      expect.arrayContaining(["tallSlotCount", "tallSlot1Type", "tallSlot1HeightMm", "tallSlot4Type", "tallSlot8HeightMm"])
    );
    expect(modulePackage!.ui.controls.map((control) => control.parameterKey)).not.toEqual(
      expect.arrayContaining(["side", "angleDeg", "chamferMm", "frontChamferMm", "backChamferMm"])
    );
    expect(modulePackage!.parameterPresets?.presets).toEqual([]);
  });

  it("uses package controls for FWM catalog packages so stale descriptor controls cannot reappear", () => {
    const modulePackage = extendedFurnitureModulePackages.find(
      (candidate) => candidate.module.moduleType === "fwm_catalog_wall_open_end"
    );

    expect(modulePackage).toBeDefined();
    expect(resolveModuleControlStrategy(modulePackage!, { type: "fwm_catalog_wall_open_end" })).toBe("module_package");
    expect(modulePackage!.ui.controls.map((control) => control.parameterKey)).toEqual([
      "width",
      "height",
      "depth",
      "side",
      "endingShape",
      "cornerRadiusMm",
      "chamferMm",
      "shelfCount",
      "bodyMaterialId",
      "boardThickness"
    ]);
  });
});
