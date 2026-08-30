import type { ClientCatalog } from "../catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../module-package/module-package-types";

export type FounderTenantBootstrapSummary = {
  sourceClientId: string;
  targetClientId: string;
  modulePackageCount: number;
  enabledModuleCount: number;
  catalogModuleCount: number;
};

/**
 * Produces an isolated copy of a tenant catalog.  It intentionally keeps the
 * module catalog and its commercial dependencies together, but never includes
 * projects, users, sessions, or supplier-bridge connection state (those live
 * outside ClientCatalog).
 */
export function cloneFounderTenantCatalog(args: {
  source: ClientCatalog;
  targetClientId: string;
  now: string;
}): ClientCatalog {
  const catalog = structuredClone(args.source);
  return {
    ...catalog,
    clientId: args.targetClientId,
    meta: {
      ...catalog.meta,
      source: "client-custom",
      createdAt: args.now,
      updatedAt: args.now,
      lastSynchronizedAt: undefined
    }
  };
}

export function cloneFounderTenantPackages(source: FurnQuoteModulePackage[]): FurnQuoteModulePackage[] {
  return source.map((modulePackage) => structuredClone(modulePackage));
}

export function summarizeFounderTenantBootstrap(args: {
  sourceClientId: string;
  targetClientId: string;
  catalog: ClientCatalog;
  packages: FurnQuoteModulePackage[];
}): FounderTenantBootstrapSummary {
  return {
    sourceClientId: args.sourceClientId,
    targetClientId: args.targetClientId,
    modulePackageCount: args.packages.length,
    enabledModuleCount: args.catalog.modules.filter((module) => module.enabled).length,
    catalogModuleCount: args.catalog.modules.length
  };
}
