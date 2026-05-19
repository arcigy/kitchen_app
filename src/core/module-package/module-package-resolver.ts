import type { ClientCatalog } from "../catalog/catalog-types";
import type { ProjectSaveFile, UsedModulePackageSnapshot } from "../project-save/project-save-types";
import { computeModulePackageHash } from "./module-package-file";
import type { FurnQuoteModulePackage } from "./module-package-types";

export type ModulePackageResolutionWarning =
  | "package-exists-but-version-changed"
  | "package-missing-loaded-from-project-snapshot"
  | "package-hash-changed-loaded-from-project-snapshot";

export type ModulePackageResolutionResult = {
  modulePackage: FurnQuoteModulePackage | null;
  warning?: ModulePackageResolutionWarning;
};

export function resolveModulePackageForProject(args: {
  modulePackageId: string;
  currentPackages: readonly FurnQuoteModulePackage[];
  projectSnapshots?: readonly FurnQuoteModulePackage[];
  catalog?: Pick<ClientCatalog, "modules">;
  expectedVersion?: string;
  expectedHash?: string;
}): ModulePackageResolutionResult {
  const current = args.currentPackages.find((entry) => entry.module.modulePackageId === args.modulePackageId) ?? null;
  const snapshot = args.projectSnapshots?.find((entry) => entry.module.modulePackageId === args.modulePackageId) ?? null;
  if (!current && snapshot) {
    return { modulePackage: snapshot, warning: "package-missing-loaded-from-project-snapshot" };
  }
  if (!current) return { modulePackage: null };
  if (args.expectedVersion && current.module.version !== args.expectedVersion && snapshot) {
    return { modulePackage: snapshot, warning: "package-exists-but-version-changed" };
  }
  if (args.expectedHash && current.integrity.packageHash !== args.expectedHash && snapshot) {
    return { modulePackage: snapshot, warning: "package-hash-changed-loaded-from-project-snapshot" };
  }
  return { modulePackage: current };
}

export function getCatalogModulePackageIds(catalog: Pick<ClientCatalog, "modules">): string[] {
  return catalog.modules
    .map((module) => module.modulePackageId)
    .filter((modulePackageId): modulePackageId is string => typeof modulePackageId === "string" && modulePackageId.trim().length > 0)
    .sort();
}

export type ProjectModulePackageRestoreResult = {
  modulePackage: FurnQuoteModulePackage;
  snapshot: UsedModulePackageSnapshot;
  warning?: ModulePackageResolutionWarning;
};

export function resolveProjectModulePackagesFromSnapshots(args: {
  save: ProjectSaveFile;
  currentPackages: readonly FurnQuoteModulePackage[];
}): ProjectModulePackageRestoreResult[] {
  const snapshots = args.save.catalogSnapshot.usedModulePackageSnapshots ?? [];
  return snapshots.map((snapshot) => {
    const resolution = resolveModulePackageForProject({
      modulePackageId: snapshot.modulePackageId,
      currentPackages: args.currentPackages,
      projectSnapshots: [snapshot.packageSnapshot],
      expectedVersion: snapshot.packageVersion,
      expectedHash: snapshot.packageHash
    });
    const modulePackage = resolution.modulePackage ?? snapshot.packageSnapshot;
    const actualHash = computeModulePackageHash(modulePackage);
    return {
      modulePackage: {
        ...modulePackage,
        integrity: {
          ...modulePackage.integrity,
          packageHash: modulePackage.integrity.packageHash ?? actualHash
        }
      },
      snapshot,
      warning: resolution.warning ?? (resolution.modulePackage ? undefined : "package-missing-loaded-from-project-snapshot")
    };
  });
}
