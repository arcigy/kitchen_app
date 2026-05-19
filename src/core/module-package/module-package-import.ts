import type { FurnQuoteModulePackagePayload } from "./module-file-types";
import { unpackModulePackage } from "./module-file-codec";
import { computeModulePackageHash, parseModulePackageJson } from "./module-package-file";
import type { FurnQuoteModulePackage } from "./module-package-types";
import { validateFurnQuoteModulePackage, type ModulePackageValidationOptions } from "./module-package-validation";

export type ModulePackageImportInput =
  | { fqm: string; enabled?: boolean }
  | { rawJson: string; enabled?: boolean }
  | { package: FurnQuoteModulePackage; enabled?: boolean };

export type ParsedModulePackageImport = {
  modulePackage: FurnQuoteModulePackage;
  payload: FurnQuoteModulePackagePayload;
  originalModuleFile?: string;
  source: "fqm" | "dev-json";
  packageHash: string;
  enabled: boolean;
};

export function parseModulePackageImport(
  input: ModulePackageImportInput,
  options: ModulePackageValidationOptions = {}
): ParsedModulePackageImport {
  let unpacked: FurnQuoteModulePackagePayload | null = null;
  let modulePackage: FurnQuoteModulePackage;
  if ("fqm" in input) {
    unpacked = unpackModulePackage(input.fqm, options);
    modulePackage = unpacked.modulePackage;
  } else if ("rawJson" in input) {
    modulePackage = parseModulePackageJson(input.rawJson);
  } else {
    modulePackage = input.package;
  }
  const validated = validateFurnQuoteModulePackage(modulePackage, options);
  const packageHash = computeModulePackageHash(validated);
  const persistedPackage = {
    ...validated,
    integrity: {
      ...validated.integrity,
      packageHash
    }
  };
  return {
    modulePackage: persistedPackage,
    payload: unpacked ? { ...unpacked, modulePackage: persistedPackage } : {
      payloadType: "furnquote-module-package",
      payloadVersion: 1,
      exportedAt: new Date().toISOString(),
      modulePackage: persistedPackage,
      bundledAssets: []
    },
    originalModuleFile: "fqm" in input ? input.fqm : undefined,
    source: "fqm" in input ? "fqm" : "dev-json",
    packageHash,
    enabled: input.enabled ?? true
  };
}
