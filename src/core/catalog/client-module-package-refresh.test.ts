import { describe, expect, it } from "vitest";
import { refreshClientModulePackageFromSystemTemplate } from "./client-module-package-refresh";
import { systemModulePackageTemplates } from "../../system/module-packages";

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
