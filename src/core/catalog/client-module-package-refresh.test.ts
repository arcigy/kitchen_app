import { describe, expect, it } from "vitest";
import { refreshClientModulePackageFromSystemTemplate } from "./client-module-package-refresh";
import { systemModulePackageTemplates } from "../../system/module-packages";

describe("refreshClientModulePackageFromSystemTemplate", () => {
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
