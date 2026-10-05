import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import type { ModuleControlsArgs } from "../modules/registry";
import { createPresetWriteRequest } from "./presetWriteRequest";

/** Catalog write only: saving a preset never mutates a placed module. */
export function createModuleParameterPresetSaver(catalog: ClientCatalog): NonNullable<ModuleControlsArgs["createParameterPreset"]> {
  const writeRequest = createPresetWriteRequest();
  return async ({ modulePackage, parameters, name, note, laborRate }) => {
    const url = `/api/modules/${encodeURIComponent(modulePackage.module.modulePackageId)}/parameter-presets`;
    const body = { name, note, parameters, laborRate, expectedPackageHash: modulePackage.integrity.packageHash };
    const response = await writeRequest.send(url, "POST", body);
    const payload = await response.json().catch(() => null) as {
      ok?: boolean; error?: string; modulePackage?: FurnQuoteModulePackage;
      catalogModule?: ClientCatalog["modules"][number]; preset?: { presetId?: string };
    } | null;
    if (!response.ok || !payload?.ok || !payload.modulePackage || !payload.preset?.presetId) {
      throw new Error(payload?.error || "Preset save failed.");
    }
    writeRequest.confirm(url, "POST", body);
    Object.assign(modulePackage, payload.modulePackage);
    if (payload.catalogModule) {
      const updated = payload.catalogModule;
      const index = catalog.modules.findIndex((item) => item.modulePackageId === updated.modulePackageId);
      if (index >= 0) catalog.modules[index] = updated;
      else catalog.modules.push(updated);
    }
    return { modulePackage: payload.modulePackage, presetId: payload.preset.presetId };
  };
}

export function createModulePresetLaborApi(catalog: ClientCatalog): NonNullable<ModuleControlsArgs["presetLaborApi"]> {
  const writeRequest = createPresetWriteRequest();
  return {
    async load(modulePackageId) {
      const response = await fetch(`/api/modules/${encodeURIComponent(modulePackageId)}`);
      const payload = await response.json() as { ok?: boolean; module?: FurnQuoteModulePackage; error?: string };
      if (!response.ok || !payload.ok || !payload.module) throw new Error(payload.error || "Preset nie je dostupný.");
      return payload.module;
    },
    async save(modulePackage, presetId, laborRate) {
      const url = `/api/modules/${encodeURIComponent(modulePackage.module.modulePackageId)}/parameter-presets/${encodeURIComponent(presetId)}/labor`;
      const body = { laborRate, expectedPackageHash: modulePackage.integrity.packageHash };
      const response = await writeRequest.send(url, "PATCH", body);
      const payload = await response.json() as { ok?: boolean; modulePackage?: FurnQuoteModulePackage; catalogModule?: ClientCatalog["modules"][number]; error?: string };
      if (!response.ok || !payload.ok || !payload.modulePackage) throw new Error(payload.error || "Sadzbu presetu sa nepodarilo uložiť.");
      writeRequest.confirm(url, "PATCH", body);
      if (payload.catalogModule) {
        const index = catalog.modules.findIndex(item => item.modulePackageId === payload.catalogModule!.modulePackageId);
        if (index >= 0) catalog.modules[index] = payload.catalogModule;
      }
      return payload.modulePackage;
    }
  };
}
