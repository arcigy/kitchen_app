import type { ClientModuleDefinition } from "./catalog-types";
import type { FurnQuoteModulePackage } from "../module-package/module-package-types";
import { computeModulePackageHash, withModulePackageHash } from "../module-package/module-package-file";
import { upgradeClientModuleDoorControls } from "./client-module-package-refresh";

/** Pure preparation only; the caller must approve and atomically persist packages plus catalog hashes. */
export function planClientModuleDoorUpgrade(args: {
  packages: readonly FurnQuoteModulePackage[];
  catalogModules: readonly ClientModuleDefinition[];
  sourcePackages: readonly FurnQuoteModulePackage[];
  modulePackageIds: readonly string[];
  updatedAt: string;
}) {
  if (!args.modulePackageIds.length || args.modulePackageIds.includes("all")) throw new Error("Exact package IDs are required.");
  if (new Set(args.modulePackageIds).size !== args.modulePackageIds.length) throw new Error("Duplicate package IDs are not allowed.");
  const catalogModules = structuredClone([...args.catalogModules]);
  const changes = args.modulePackageIds.map(modulePackageId => {
    const matches = args.packages.filter(item => item.module.modulePackageId === modulePackageId);
    if (matches.length !== 1) throw new Error(`Package must exist exactly once: ${modulePackageId}`);
    const before = matches[0]!;
    const references = catalogModules.filter(item => (item.modulePackageId ?? item.id) === modulePackageId);
    if (references.length !== 1 || references[0]!.moduleType !== before.module.moduleType) throw new Error(`Catalog reference is missing or ambiguous: ${modulePackageId}`);
    const next = upgradeClientModuleDoorControls({ existingPackage: before, sourcePackages: args.sourcePackages });
    if (!next) throw new Error(`No compatible door capability: ${modulePackageId}`);
    const beforeHash = computeModulePackageHash(before);
    const changed = beforeHash !== computeModulePackageHash(next);
    if (changed) next.integrity.updatedAt = args.updatedAt;
    const nextPackage = withModulePackageHash(next);
    const afterHash = nextPackage.integrity.packageHash!;
    const catalogHashChanged = references[0]!.packageHash !== afterHash;
    references[0]!.packageHash = afterHash;
    return { modulePackageId, moduleType: before.module.moduleType, beforeHash, afterHash, changed, catalogHashChanged, nextPackage };
  });
  return { changes, catalogModules };
}
