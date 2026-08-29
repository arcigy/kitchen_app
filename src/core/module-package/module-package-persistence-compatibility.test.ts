import { describe, expect, it } from "vitest";
import { validateFurnQuoteModulePackage } from "./module-package-validation";
import {
  normalizePersistedSystemModulePackage,
  normalizedSystemTemplateForStoredIdentity
} from "./module-package-persistence-compatibility";
import { systemModulePackageTemplates } from "../../system/module-packages";

describe("normalizePersistedSystemModulePackage", () => {
  it("upgrades only the stale system wall-corner package before validation", () => {
    const legacy = structuredClone(systemModulePackageTemplates.find((candidate) =>
      candidate.module.modulePackageId === "wall_corner_90"
    )!);
    legacy.module.moduleType = "wall_corner_90";

    const normalized = normalizePersistedSystemModulePackage({ package: legacy, source: "system-template" });
    expect(() => validateFurnQuoteModulePackage(normalized as typeof legacy)).not.toThrow();
    expect((normalized as typeof legacy).module.moduleType).toBe("fwm_catalog_wall_cabinet");
  });

  it("does not alter a customer-owned package with the same legacy shape", () => {
    const legacy = structuredClone(systemModulePackageTemplates.find((candidate) =>
      candidate.module.modulePackageId === "wall_corner_90"
    )!);
    legacy.module.moduleType = "wall_corner_90";

    expect(normalizePersistedSystemModulePackage({ package: legacy, source: "dev-json" })).toBe(legacy);
  });

  it("changes the module revision only for the known stale system row", () => {
    expect(normalizedSystemTemplateForStoredIdentity({
      modulePackageId: "wall_corner_90",
      moduleType: "wall_corner_90",
      source: "system-template"
    })?.module.moduleType).toBe("fwm_catalog_wall_cabinet");
    expect(normalizedSystemTemplateForStoredIdentity({
      modulePackageId: "wall_corner_90",
      moduleType: "wall_corner_90",
      source: "dev-json"
    })).toBeNull();
  });
});
