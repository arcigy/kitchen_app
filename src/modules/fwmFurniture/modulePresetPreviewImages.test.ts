import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extendedFurnitureModulePackages } from "../../system/module-packages/extendedFurniture";
import { resolveFwmModulePresetPreviewImage } from "./modulePresetPreviewImages";

describe("FWM module parameter preset previews", () => {
  it("maps every built-in parameter preset to a shipped transparent release asset", () => {
    const packagesWithPresets = extendedFurnitureModulePackages.filter(
      (modulePackage) => (modulePackage.parameterPresets?.presets.length ?? 0) > 0
    );
    expect(packagesWithPresets).not.toHaveLength(0);
    for (const modulePackage of packagesWithPresets) {
      for (const preset of modulePackage.parameterPresets?.presets ?? []) {
        const publicUrl = resolveFwmModulePresetPreviewImage(modulePackage.module.moduleType, preset.presetId);
        expect(publicUrl, `${modulePackage.module.moduleType}:${preset.presetId}`).toBe(
          `/module-icons/furniture/v4/presets/${modulePackage.module.moduleType}__${preset.presetId}.png`
        );
        expect(existsSync(resolve(process.cwd(), "public", publicUrl!.slice(1)))).toBe(true);
      }
    }
  });

  it("does not claim a generated asset for a newly created preset", () => {
    expect(resolveFwmModulePresetPreviewImage("fwm_catalog_base_drawers", "custom-client-preset")).toBeUndefined();
  });
});
