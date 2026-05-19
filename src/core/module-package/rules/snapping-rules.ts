import type { FurnQuoteModulePackage } from "../module-package-types";

export function getModuleSnapPriority(modulePackage: FurnQuoteModulePackage): string[] {
  if (!modulePackage.snapping.enabled) return [];
  return modulePackage.snapping.priority ?? modulePackage.snapping.snapTargets ?? [];
}
