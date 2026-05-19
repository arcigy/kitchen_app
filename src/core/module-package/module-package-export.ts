import { serializeModulePackageJson } from "./module-package-file";
import type { FurnQuoteModulePackage } from "./module-package-types";
import { validateFurnQuoteModulePackage } from "./module-package-validation";

export function exportModulePackage(modulePackage: FurnQuoteModulePackage): string {
  return serializeModulePackageJson(validateFurnQuoteModulePackage(modulePackage));
}
