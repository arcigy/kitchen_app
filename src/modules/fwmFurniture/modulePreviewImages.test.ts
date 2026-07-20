import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getFwmModulePreviewImage } from "./modulePreviewImages";

const previewedModuleTypes = [
  "base_bottle_pullout",
  "fwm_catalog_base_corner",
  "fwm_catalog_base_doors",
  "fwm_catalog_base_drawers",
  "fwm_catalog_base_open_end",
  "fwm_catalog_tall_cabinet",
  "fwm_tall_open_end",
  "fwm_catalog_wall_cabinet",
  "fwm_catalog_wall_open_end"
] as const;

describe("FWM module preview images", () => {
  it("maps every approved catalog family to a shipped PNG asset", () => {
    for (const moduleType of previewedModuleTypes) {
      const publicUrl = getFwmModulePreviewImage(moduleType);
      expect(publicUrl).toBe(`/module-icons/furniture/${moduleType}.png`);
      expect(existsSync(resolve(process.cwd(), "public", publicUrl!.slice(1)))).toBe(true);
    }
  });

  it("does not claim an image for module families without an exported preview", () => {
    expect(getFwmModulePreviewImage("fwm_catalog_wall_corner_90")).toBeUndefined();
  });
});
