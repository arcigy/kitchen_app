import type { ClientCatalog, ClientModuleDefinition } from "./catalog-types";
import { validateClientCatalog } from "./catalog-validation";
import { computeModulePackageHash } from "../module-package/module-package-file";
import { createCatalogModuleDefinitionFromPackage } from "../module-package/module-package-catalog";
import type { FurnQuoteModulePackage } from "../module-package/module-package-types";

export type ClientModuleAssignmentMode = "merge" | "replace" | "disable";

export type ClientModuleAssignmentOptions = {
  moduleIds: readonly string[];
  mode?: ClientModuleAssignmentMode;
  now?: string;
};

export type ClientModuleAssignmentChange = {
  modulePackageId: string;
  moduleType: string;
  action: "added" | "updated" | "enabled" | "disabled" | "unchanged";
};

export type ClientModuleAssignmentResult = {
  catalog: ClientCatalog;
  changes: ClientModuleAssignmentChange[];
  summary: {
    mode: ClientModuleAssignmentMode;
    requestedCount: number;
    selectedCount: number;
    addedCount: number;
    updatedCount: number;
    enabledCount: number;
    disabledCount: number;
    unchangedCount: number;
  };
};

type PackageLookupEntry = {
  key: string;
  modulePackage: FurnQuoteModulePackage;
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function packageKeys(modulePackage: FurnQuoteModulePackage): string[] {
  return [
    modulePackage.module.modulePackageId,
    modulePackage.module.moduleType
  ].map(normalizeKey);
}

function buildPackageLookup(modulePackages: readonly FurnQuoteModulePackage[]): Map<string, PackageLookupEntry[]> {
  const lookup = new Map<string, PackageLookupEntry[]>();
  for (const modulePackage of modulePackages) {
    for (const key of packageKeys(modulePackage)) {
      const entries = lookup.get(key) ?? [];
      entries.push({ key, modulePackage });
      lookup.set(key, entries);
    }
  }
  return lookup;
}

function uniquePackages(modulePackages: readonly FurnQuoteModulePackage[]): FurnQuoteModulePackage[] {
  const seen = new Set<string>();
  const result: FurnQuoteModulePackage[] = [];
  for (const modulePackage of modulePackages) {
    const key = modulePackage.module.modulePackageId;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(modulePackage);
  }
  return result;
}

export function resolveClientModuleAssignmentPackages(
  modulePackages: readonly FurnQuoteModulePackage[],
  moduleIds: readonly string[]
): FurnQuoteModulePackage[] {
  const requested = moduleIds.map((item) => item.trim()).filter(Boolean);
  if (requested.length === 0) throw new Error("At least one module id is required.");
  if (requested.some((item) => normalizeKey(item) === "all")) return uniquePackages(modulePackages);

  const lookup = buildPackageLookup(modulePackages);
  const selected: FurnQuoteModulePackage[] = [];
  const errors: string[] = [];

  for (const request of requested) {
    const matches = lookup.get(normalizeKey(request)) ?? [];
    if (matches.length === 0) {
      errors.push(`Unknown module "${request}". Use modulePackageId or moduleType.`);
      continue;
    }
    const uniqueMatches = uniquePackages(matches.map((entry) => entry.modulePackage));
    if (uniqueMatches.length > 1) {
      errors.push(`Ambiguous module "${request}". Use exact modulePackageId.`);
      continue;
    }
    selected.push(uniqueMatches[0]);
  }

  if (errors.length > 0) {
    const examples = modulePackages
      .slice(0, 8)
      .map((modulePackage) => `${modulePackage.module.modulePackageId} (${modulePackage.module.moduleType})`)
      .join(", ");
    throw new Error(`${errors.join(" ")} Available examples: ${examples}`);
  }

  return uniquePackages(selected);
}

function findExistingModuleIndex(modules: readonly ClientModuleDefinition[], definition: ClientModuleDefinition): number {
  return modules.findIndex((module) => {
    if (definition.modulePackageId) {
      return module.modulePackageId === definition.modulePackageId ||
        (!module.modulePackageId && (module.id === definition.id || module.moduleType === definition.moduleType));
    }
    return module.id === definition.id || module.moduleType === definition.moduleType;
  });
}

function normalizeCatalogModuleIdentity(module: ClientModuleDefinition): ClientModuleDefinition {
  if (!module.modulePackageId || module.id === module.modulePackageId) return { ...module };
  return { ...module, id: module.modulePackageId };
}

function moduleMatchesSelected(module: ClientModuleDefinition, selectedKeys: Set<string>): boolean {
  if (module.modulePackageId) return selectedKeys.has(normalizeKey(module.modulePackageId));
  return [
    module.id,
    module.moduleType
  ].some((key) => key && selectedKeys.has(normalizeKey(key)));
}

function selectedPackageKeys(modulePackages: readonly FurnQuoteModulePackage[]): Set<string> {
  const keys = new Set<string>();
  for (const modulePackage of modulePackages) {
    keys.add(normalizeKey(modulePackage.module.modulePackageId));
  }
  return keys;
}

export function assignClientModules(
  catalog: ClientCatalog,
  modulePackages: readonly FurnQuoteModulePackage[],
  options: ClientModuleAssignmentOptions
): ClientModuleAssignmentResult {
  const mode = options.mode ?? "merge";
  const selectedPackages = resolveClientModuleAssignmentPackages(modulePackages, options.moduleIds);
  const selectedKeys = selectedPackageKeys(selectedPackages);
  const modules = catalog.modules.map(normalizeCatalogModuleIdentity);
  const changes: ClientModuleAssignmentChange[] = [];

  if (mode === "replace") {
    for (const module of modules) {
      if (module.enabled && !moduleMatchesSelected(module, selectedKeys)) {
        module.enabled = false;
        changes.push({
          modulePackageId: module.modulePackageId ?? module.id,
          moduleType: module.moduleType,
          action: "disabled"
        });
      }
    }
  }

  for (const modulePackage of selectedPackages) {
    const packageHash = computeModulePackageHash(modulePackage);
    const definition = createCatalogModuleDefinitionFromPackage(modulePackage, {
      enabled: mode !== "disable",
      packageHash,
      catalog
    });
    const existingIndex = findExistingModuleIndex(modules, definition);

    if (existingIndex < 0) {
      if (mode === "disable") {
        changes.push({
          modulePackageId: definition.modulePackageId ?? definition.id,
          moduleType: definition.moduleType,
          action: "unchanged"
        });
        continue;
      }
      modules.push(definition);
      changes.push({
        modulePackageId: definition.modulePackageId ?? definition.id,
        moduleType: definition.moduleType,
        action: "added"
      });
      continue;
    }

    const existing = modules[existingIndex];
    if (mode === "disable") {
      if (existing.enabled) {
        modules[existingIndex] = { ...existing, enabled: false };
        changes.push({
          modulePackageId: existing.modulePackageId ?? existing.id,
          moduleType: existing.moduleType,
          action: "disabled"
        });
      } else {
        changes.push({
          modulePackageId: existing.modulePackageId ?? existing.id,
          moduleType: existing.moduleType,
          action: "unchanged"
        });
      }
      continue;
    }

    const updated = {
      ...definition,
      enabled: true
    };
    const action = existing.enabled ? "updated" : "enabled";
    modules[existingIndex] = updated;
    changes.push({
      modulePackageId: updated.modulePackageId ?? updated.id,
      moduleType: updated.moduleType,
      action
    });
  }

  const changed = changes.some((change) => change.action !== "unchanged");
  const updatedCatalog = validateClientCatalog({
    ...catalog,
    modules,
    meta: changed
      ? {
          ...catalog.meta,
          source: "client-custom",
          updatedAt: options.now ?? new Date().toISOString()
        }
      : catalog.meta
  });

  return {
    catalog: updatedCatalog,
    changes,
    summary: {
      mode,
      requestedCount: options.moduleIds.length,
      selectedCount: selectedPackages.length,
      addedCount: changes.filter((change) => change.action === "added").length,
      updatedCount: changes.filter((change) => change.action === "updated").length,
      enabledCount: changes.filter((change) => change.action === "enabled").length,
      disabledCount: changes.filter((change) => change.action === "disabled").length,
      unchangedCount: changes.filter((change) => change.action === "unchanged").length
    }
  };
}
