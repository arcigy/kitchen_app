import type { FurnQuoteModulePackage } from "../../core/module-package/module-package-types";

export type ModuleImportDialogState = {
  open: boolean;
  selectedPackage?: FurnQuoteModulePackage;
  error?: string;
};

export function createModuleImportDialogState(): ModuleImportDialogState {
  return { open: false };
}
