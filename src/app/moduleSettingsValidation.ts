import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { normalizeModuleParamsForSource, validateModule, type ModuleParams } from "../model/cabinetTypes";
import { t, translateParamLabel } from "../i18n";

export function prepareModuleSettings(modulePackage: FurnQuoteModulePackage, candidate: ModuleParams, sourceKey?: string): ModuleParams {
  // Reject invalid user input before normalization can silently clamp it.
  for (const parameter of modulePackage.parameters.parameters) {
    if (parameter.type !== "number" || (sourceKey && parameter.key !== sourceKey)) continue;
    if (parameter.uiVisibility === "internal" || parameter.uiVisibility === "technical") continue;
    const drawer = parameter.key.match(/^drawer(\d+)FrontHeightMm$/);
    const slot = parameter.key.match(/^tallSlot(\d+)/);
    if ((drawer && Number(drawer[1]) > Number(candidate.drawerCount ?? 0)) || (slot && Number(slot[1]) > Number(candidate.tallSlotCount ?? 0))) continue;
    const value = candidate[parameter.key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) ||
      (parameter.min != null && value < parameter.min) || (parameter.max != null && value > parameter.max)) {
      throw new Error(`${translateParamLabel(parameter.key) || parameter.label}: ${t("Enter a value within the allowed range.")} ${parameter.min ?? ""} – ${parameter.max ?? ""}`);
    }
  }
  const normalized = normalizeModuleParamsForSource(structuredClone(candidate), sourceKey);
  const errors = validateModule(normalized);
  if (errors.length) throw new Error(errors.join("\n"));
  return normalized;
}
