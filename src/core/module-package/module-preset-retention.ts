import type { FurnQuoteModulePackage } from "./module-package-types";
import { validateFurnQuoteModulePackage } from "./module-package-validation";
import { ModulePackageRevisionConflictError } from "./module-package-write-lock";

/** Import and template refresh cannot remove a company's saved configurations. */
export function preserveModuleParameterPresets(current: FurnQuoteModulePackage, incoming: FurnQuoteModulePackage): FurnQuoteModulePackage {
  if (current.module.modulePackageId !== incoming.module.modulePackageId || current.module.moduleType !== incoming.module.moduleType) {
    throw new ModulePackageRevisionConflictError();
  }
  const next = structuredClone(incoming);
  if (current.parameterPresets) {
    const ids = new Set(current.parameterPresets.presets.map(preset => preset.presetId));
    next.parameterPresets = structuredClone({
      freeParameterKeys: [...new Set([...current.parameterPresets.freeParameterKeys, ...(incoming.parameterPresets?.freeParameterKeys ?? [])])],
      presets: [...current.parameterPresets.presets, ...(incoming.parameterPresets?.presets ?? []).filter(preset => !ids.has(preset.presetId))]
    });
  }
  next.integrity = { ...next.integrity, packageHash: undefined };
  // A schema change incompatible with a saved configuration is refused before any write.
  return validateFurnQuoteModulePackage(next);
}

export function assertModulePresetsRetained(current: FurnQuoteModulePackage, next: FurnQuoteModulePackage): void {
  const ids = new Set(next.parameterPresets?.presets.map(preset => preset.presetId));
  if (current.parameterPresets?.presets.some(preset => !ids.has(preset.presetId))) {
    throw new ModulePackageRevisionConflictError();
  }
}
