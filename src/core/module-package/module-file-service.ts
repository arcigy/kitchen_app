import type { FurnQuoteModulePackagePayload } from "./module-file-types";
import { buildModulePackageFromSourceTemplate, packModulePackage, unpackModulePackage } from "./module-file-codec";
import type { FurnQuoteModulePackage } from "./module-package-types";
import type { ModuleFileValidationOptions } from "./module-file-validation";

export function packageSourceTemplateAsFqm(sourceJson: FurnQuoteModulePackage): string {
  return packModulePackage(buildModulePackageFromSourceTemplate(sourceJson));
}

export function parseFqmPackageFile(fileText: string, options: ModuleFileValidationOptions = {}): FurnQuoteModulePackagePayload {
  return unpackModulePackage(fileText, options);
}
