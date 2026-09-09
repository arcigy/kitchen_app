import { describe, expect, it } from "vitest";
import { refreshClientModulePackageFromSystemTemplate } from "./client-module-package-refresh";
import { systemModulePackageTemplates } from "../../system/module-packages";
import { planClientModuleDoorUpgrade } from "./client-module-door-upgrade";
import { computeModulePackageHash } from "../module-package/module-package-file";

describe("refreshClientModulePackageFromSystemTemplate", () => {
  it("keeps client presets and explicit false values, with existing ids winning over new system versions", () => {
    const source = structuredClone(systemModulePackageTemplates.find(item => item.module.moduleType === "fwm_catalog_base_doors")!);
    source.parameterPresets = { freeParameterKeys: ["width", "height", "depth"], presets: [
      { presetId: "shared", label: "System updated", note: "", parameterValues: { hasDoors: true } },
      { presetId: "new-system", label: "New", note: "", parameterValues: { doorCount: 2 } },
    ] };
    const existing = structuredClone(source);
    existing.parameterPresets!.presets = [
      { presetId: "shared", label: "Saved configuration", note: "Keep me", parameterValues: { hasDoors: false, doorCount: 1 } },
      { presetId: "client-only", label: "Client", note: "", parameterValues: { shelfCount: 3 } },
    ];
    const before = structuredClone(existing);
    const refreshed = refreshClientModulePackageFromSystemTemplate({ existingPackage: existing, sourcePackages: [source] })!;
    expect(refreshed.parameterPresets?.presets.map(preset => preset.presetId)).toEqual(["shared", "client-only", "new-system"]);
    expect(refreshed.parameterPresets?.presets[0]).toEqual(existing.parameterPresets!.presets[0]);
    expect(refreshed.parameterPresets?.freeParameterKeys).toEqual(existing.parameterPresets!.freeParameterKeys);
    refreshed.parameterPresets!.presets[0].parameterValues.hasDoors = true;
    expect(existing).toEqual(before);
  });
  it("refreshes a client package from the current system template while preserving its package id and variant", () => {
    const source = systemModulePackageTemplates.find((modulePackage) =>
      modulePackage.module.modulePackageId === "fwm_catalog_base_corner_family_v1"
    );
    expect(source).toBeTruthy();
    const existing = structuredClone(source!);
    existing.module.modulePackageId = "client_delfi_base_corner_90_v1";
    existing.module.displayName = "Spodny rohovy 90 (FWM)";
    existing.module.tags = [...(existing.module.tags ?? []), "base_corner_90"];
    for (const parameter of existing.parameters.parameters) {
      if (parameter.key === "variant") parameter.defaultValue = "corner_90";
      if (parameter.key === "cornerShape") parameter.defaultValue = "l_shape";
      if (parameter.key === "backChamferMm") parameter.defaultValue = 200;
    }

    const refreshed = refreshClientModulePackageFromSystemTemplate({
      existingPackage: existing,
      sourcePackages: systemModulePackageTemplates
    });

    expect(refreshed?.module.modulePackageId).toBe("client_delfi_base_corner_90_v1");
    expect(refreshed?.module.displayName).toBe("Spodny rohovy 90 (FWM)");
    expect(refreshed?.parameters.parameters.find((parameter) => parameter.key === "variant")?.defaultValue).toBe("corner_90");
    expect(refreshed?.parameters.parameters.find((parameter) => parameter.key === "cornerShape")?.defaultValue).toBe("l_shape");
    expect(refreshed?.parameters.parameters.find((parameter) => parameter.key === "backChamferMm")?.defaultValue).toBe(0);
  });
});

describe("targeted door capability upgrade", () => {
  const fixture = () => {
    const source = systemModulePackageTemplates.find(item => item.module.moduleType === "fwm_catalog_base_doors")!;
    const existing = structuredClone(source);
    existing.module.modulePackageId = "synthetic_client_package";
    existing.module.displayName = "Custom cabinet";
    existing.parameters.parameters = existing.parameters.parameters.filter(item => item.key !== "hasDoors");
    existing.ui.controls = existing.ui.controls.filter(item => item.parameterKey !== "hasDoors");
    existing.parameters.parameters.find(item => item.key === "width")!.defaultValue = 735;
    existing.pricing = { ...existing.pricing, marginCategory: "custom_margin" };
    existing.parameterPresets = { freeParameterKeys: ["width"], presets: [{ presetId: "custom", label: "Custom", note: "", parameterValues: { hasDoors: false } }] };
    const catalogModules = [{ id: "legacy_catalog_identity", modulePackageId: existing.module.modulePackageId, moduleType: existing.module.moduleType, name: "Custom", enabled: false, defaultWidth: 735, pricingRef: "custom_price", packageHash: computeModulePackageHash(existing) }];
    return { source, existing, catalogModules };
  };
  it("preserves all original settings, disabled catalog identity and presets while updating exact hashes", () => {
    const { source, existing, catalogModules } = fixture();
    const original = structuredClone(existing);
    const result = planClientModuleDoorUpgrade({ packages: [existing], catalogModules, sourcePackages: [source], modulePackageIds: [existing.module.modulePackageId], updatedAt: "2026-09-10T00:00:00Z" });
    const next = result.changes[0]!.nextPackage;
    expect(next.parameters.parameters.filter(item => item.key !== "hasDoors")).toEqual(original.parameters.parameters);
    expect(next.parameters.parameters.find(item => item.key === "hasDoors")?.defaultValue).toBe(true);
    expect(next.ui.controls.filter(item => item.parameterKey !== "hasDoors")).toEqual(original.ui.controls);
    for (const key of ["module", "geometry", "placement", "constraints", "snapping", "materials", "components", "pricing", "bom", "behavior", "assets", "compatibility"] as const) expect(next[key]).toEqual(original[key]);
    expect(next.parameterPresets!.presets[0]).toEqual(original.parameterPresets!.presets[0]);
    expect(next.parameterPresets!.freeParameterKeys).toEqual(["width"]);
    expect(result.catalogModules).toEqual([{ ...catalogModules[0], packageHash: computeModulePackageHash(next) }]);
    expect(existing).toEqual(original);
    const repeated = planClientModuleDoorUpgrade({ packages: [next], catalogModules: result.catalogModules, sourcePackages: [source], modulePackageIds: [next.module.modulePackageId], updatedAt: "2026-09-11T00:00:00Z" });
    expect(repeated.changes[0]).toMatchObject({ changed: false, catalogHashChanged: false });
    expect(repeated.changes[0]!.nextPackage).toEqual(next);
  });
  it("retains an existing false default", () => {
    const { source, existing, catalogModules } = fixture();
    const doors = structuredClone(source.parameters.parameters.find(item => item.key === "hasDoors")!);
    doors.defaultValue = false;
    existing.parameters.parameters.push(doors);
    const result = planClientModuleDoorUpgrade({ packages: [existing], catalogModules, sourcePackages: [source], modulePackageIds: [existing.module.modulePackageId], updatedAt: "2026-09-10T00:00:00Z" });
    expect(result.changes[0]!.nextPackage.parameters.parameters.find(item => item.key === "hasDoors")!.defaultValue).toBe(false);
  });
  it.each(["unknown", "all", "custom-builder", "missing-reference"])("refuses an unsafe target: %s", variant => {
    const { source, existing, catalogModules } = fixture();
    if (variant === "custom-builder") existing.geometry = { mode: "trusted-runtime", runtimeBuilderKey: "custom_unreviewed" };
    expect(() => planClientModuleDoorUpgrade({ packages: [existing], catalogModules: variant === "missing-reference" ? [] : catalogModules, sourcePackages: [source], modulePackageIds: [variant === "unknown" || variant === "all" ? variant : existing.module.modulePackageId], updatedAt: "2026-09-10T00:00:00Z" })).toThrow();
  });
});
