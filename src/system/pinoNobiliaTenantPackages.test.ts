import { describe, expect, it } from "vitest";
import {
  createPinoNobiliaTenantModulePackages,
  PINO_NOBILIA_TENANT_MODULE_TYPES
} from "./pinoNobiliaTenantPackages";

describe("PINO/Nobilia tenant module packages", () => {
  it("includes all tenant packages required by the current vendor resolver flow", () => {
    const packages = createPinoNobiliaTenantModulePackages();
    const types = new Set(packages.map((modulePackage) => modulePackage.module.moduleType));
    const packageIds = new Set(packages.map((modulePackage) => modulePackage.module.modulePackageId));

    for (const type of PINO_NOBILIA_TENANT_MODULE_TYPES) {
      expect(types.has(type), type).toBe(true);
      expect(packageIds.has(`pino_nobilia_${type}_vkh_2026_v1`), type).toBe(true);
    }
    expect(types.has("pino_side_cabinet")).toBe(true);
    expect(packageIds.has("pino_nobilia_side_cabinet_vkh_2026_v1")).toBe(true);
  });

  it("marks resolver-backed kitchen special and cladding packages as PINO kitchen modules", () => {
    const packages = createPinoNobiliaTenantModulePackages();
    const mixedBase = packages.find((modulePackage) => modulePackage.module.moduleType === "fwm_kitchen_special_module_1");
    const applianceBase = packages.find((modulePackage) => modulePackage.module.moduleType === "fwm_kitchen_special_module_2");
    const openBase = packages.find((modulePackage) => modulePackage.module.moduleType === "fwm_kitchen_special_module_3");
    const dishwasher = packages.find((modulePackage) => modulePackage.module.moduleType === "fwm_built_in_dishwasher");
    const fridge = packages.find((modulePackage) => modulePackage.module.moduleType === "fwm_built_in_fridge");
    const oven = packages.find((modulePackage) => modulePackage.module.moduleType === "fwm_oven_tower_module");
    const microwave = packages.find((modulePackage) => modulePackage.module.moduleType === "fwm_microwave_tower_module");
    const coverPanel = packages.find((modulePackage) => modulePackage.module.moduleType === "fwm_interior_cladding_1");
    const cornerCoverPanel = packages.find((modulePackage) => modulePackage.module.moduleType === "fwm_interior_cladding_2");

    expect(mixedBase?.module.category).toBe("base_cabinet");
    expect(applianceBase?.module.category).toBe("base_cabinet");
    expect(openBase?.module.category).toBe("base_cabinet");
    expect(dishwasher?.module.category).toBe("base_cabinet");
    expect(fridge?.module.category).toBe("tall_cabinet");
    expect(oven?.module.category).toBe("tall_cabinet");
    expect(microwave?.module.category).toBe("tall_cabinet");

    for (const modulePackage of [mixedBase, applianceBase, openBase, dishwasher, fridge, oven, microwave, coverPanel, cornerCoverPanel]) {
      expect(modulePackage?.module.tags).toEqual(expect.arrayContaining(["pino", "nobilia", "vkh-2026", "review-staging", "kitchen"]));
      expect(modulePackage?.module.isSystemModule).toBe(false);
    }

    expect(coverPanel?.module.tags).toEqual(expect.arrayContaining(["accessory", "cover-panel"]));
    expect(cornerCoverPanel?.module.tags).toEqual(expect.arrayContaining(["accessory", "cover-panel", "corner"]));
  });
});
