import { describe, expect, it } from "vitest";
import { getSystemSeedCatalog } from "./catalog-repository";
import { assignClientModules } from "./client-module-assignment";
import { systemModulePackageTemplates } from "../../system/module-packages";

const now = "2026-06-23T12:00:00.000Z";

describe("assignClientModules", () => {
  it("enables selected modules in merge mode without disabling unlisted modules", () => {
    const catalog = getSystemSeedCatalog();
    catalog.modules = catalog.modules.map((module) =>
      module.modulePackageId === "drawer_low_family_v1" || module.modulePackageId === "swing_shelves_low_family_v1"
        ? { ...module, enabled: false }
        : module
    );

    const result = assignClientModules(catalog, systemModulePackageTemplates, {
      moduleIds: ["drawer_low_family_v1"],
      mode: "merge",
      now
    });

    expect(result.catalog.modules.find((module) => module.modulePackageId === "drawer_low_family_v1")?.enabled).toBe(true);
    expect(result.catalog.modules.find((module) => module.modulePackageId === "swing_shelves_low_family_v1")?.enabled).toBe(false);
    expect(result.summary.enabledCount).toBe(1);
    expect(result.summary.disabledCount).toBe(0);
    expect(result.catalog.meta.source).toBe("client-custom");
    expect(result.catalog.meta.updatedAt).toBe(now);
  });

  it("replaces the enabled module set when mode is replace", () => {
    const catalog = getSystemSeedCatalog();

    const result = assignClientModules(catalog, systemModulePackageTemplates, {
      moduleIds: ["drawer_low"],
      mode: "replace",
      now
    });

    const enabled = result.catalog.modules.filter((module) => module.enabled);
    expect(enabled.map((module) => module.modulePackageId)).toEqual(["drawer_low_family_v1"]);
    expect(result.summary.disabledCount).toBeGreaterThan(0);
  });

  it("treats same-moduleType package variants as separate modules during replace", () => {
    const catalog = getSystemSeedCatalog();
    const sourcePackage = systemModulePackageTemplates.find((modulePackage) => modulePackage.module.modulePackageId === "drawer_low_family_v1");
    expect(sourcePackage).toBeTruthy();
    const siblingPackage = structuredClone(sourcePackage!);
    siblingPackage.module.modulePackageId = "drawer_low_second_variant";
    siblingPackage.module.displayName = "Drawer Low Second Variant";
    const packages = [...systemModulePackageTemplates, siblingPackage];
    const withSibling = assignClientModules(catalog, packages, {
      moduleIds: ["drawer_low_second_variant"],
      mode: "merge",
      now
    }).catalog;

    const result = assignClientModules(withSibling, packages, {
      moduleIds: ["drawer_low_family_v1"],
      mode: "replace",
      now
    });

    expect(result.catalog.modules.find((module) => module.modulePackageId === "drawer_low_family_v1")?.enabled).toBe(true);
    expect(result.catalog.modules.find((module) => module.modulePackageId === "drawer_low_second_variant")?.enabled).toBe(false);
  });

  it("disables selected modules by module type", () => {
    const catalog = getSystemSeedCatalog();

    const result = assignClientModules(catalog, systemModulePackageTemplates, {
      moduleIds: ["drawer_low"],
      mode: "disable",
      now
    });

    expect(result.catalog.modules.find((module) => module.modulePackageId === "drawer_low_family_v1")?.enabled).toBe(false);
    expect(result.summary.disabledCount).toBe(1);
  });

  it("reports unknown module ids with usable examples", () => {
    const catalog = getSystemSeedCatalog();

    expect(() =>
      assignClientModules(catalog, systemModulePackageTemplates, {
        moduleIds: ["missing_module"],
        mode: "merge",
        now
      })
    ).toThrow(/Unknown module "missing_module".*drawer_low_family_v1/);
  });
});
