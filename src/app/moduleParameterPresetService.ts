import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import type { ModuleControlsArgs } from "../modules/registry";

/** Catalog write only: saving a preset never mutates a placed module. */
export function createModuleParameterPresetSaver(catalog: ClientCatalog): NonNullable<ModuleControlsArgs["createParameterPreset"]> {
  return async ({ modulePackage, parameters, name, note }) => {
    const response = await fetch(`/api/modules/${encodeURIComponent(modulePackage.module.modulePackageId)}/parameter-presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, note, parameters })
    });
    const payload = await response.json().catch(() => null) as {
      ok?: boolean; error?: string; modulePackage?: FurnQuoteModulePackage;
      catalogModule?: ClientCatalog["modules"][number]; preset?: { presetId?: string };
    } | null;
    if (!response.ok || !payload?.ok || !payload.modulePackage || !payload.preset?.presetId) {
      throw new Error(payload?.error || "Preset save failed.");
    }
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
