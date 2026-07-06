import { describe, expect, it } from "vitest";
import { createPinoSideCabinetTenantPackage } from "../../../system/module-packages/pinoSideCabinet";
import { extendedFurnitureModulePackages } from "../../../system/module-packages/extendedFurniture";
import { resolveModuleControlStrategy } from "./module-package-controls";

describe("module control strategy", () => {
  it("prefers registered smart controls for known tenant module packages", () => {
    const modulePackage = createPinoSideCabinetTenantPackage();

    expect(resolveModuleControlStrategy(modulePackage, { type: "pino_side_cabinet" })).toBe("module_descriptor");
    expect(resolveModuleControlStrategy(modulePackage, {})).toBe("module_descriptor");
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
        moduleType: "corner_shelf_lower",
        tags: ["revit-export-preview"]
      }
    } as Parameters<typeof resolveModuleControlStrategy>[0];

    expect(resolveModuleControlStrategy(modulePackage, { type: "corner_shelf_lower" })).toBe("module_package");
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
});
