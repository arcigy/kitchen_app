import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientContext } from "../client/client-context";
import { createCatalogModuleDefinitionFromPackage } from "../module-package/module-package-catalog";
import { computeModulePackageHash } from "../module-package/module-package-file";
import { createFileModulePackageRepository } from "../module-package/module-package-repository";
import { resolveClientCatalogPath } from "../storage/storage-path-resolver";
import { sanitizeStorageFileName } from "../storage/storage-types";
import { systemModulePackageTemplates } from "../../system/catalog-templates";
import { isDemosCatalogGenerated } from "../../system/catalog-templates/demosCatalog";
import type { ClientCatalog } from "./catalog-types";
import {
  createSystemSeedClientCatalogRepository,
  type ClientCatalogRepository
} from "./catalog-repository";
import { validateClientCatalog } from "./catalog-validation";

export function getCatalogFileNames() {
  return {
    materials: "materials.json",
    hardware: "hardware.json",
    components: "components.json",
    componentGeometry: "componentGeometry.json",
    modules: "modules.json",
    pricing: "pricing.json",
    kitchenDefaults: "kitchenDefaults.json",
    vendorCatalog: "vendorCatalog.json",
    meta: "catalog.meta.json"
  } as const;
}

function assertCatalogClient(ctx: ClientContext, catalog: ClientCatalog) {
  if (catalog.clientId !== ctx.clientId) throw new Error("Catalog clientId must match ClientContext.");
}

export function createFileClientCatalogRepository(projectRoot: string): ClientCatalogRepository {
  const memory = createSystemSeedClientCatalogRepository();
  const names = getCatalogFileNames();
  const modulePackageRepository = createFileModulePackageRepository(projectRoot);

  const filePath = (ctx: ClientContext, fileName: string) =>
    path.join(resolveClientCatalogPath(projectRoot, ctx), sanitizeStorageFileName(fileName));

  async function readJson<T>(ctx: ClientContext, fileName: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(filePath(ctx, fileName), "utf-8")) as T;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "ENOENT") return null;
      throw error;
    }
  }

  async function writeJson(ctx: ClientContext, fileName: string, value: unknown): Promise<void> {
    const target = filePath(ctx, fileName);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  }

  async function readCatalog(ctx: ClientContext): Promise<ClientCatalog | null> {
    const [materials, hardware, components, componentGeometry, modules, priceList, kitchenDefaults, vendorCatalog, meta] = await Promise.all([
      readJson<ClientCatalog["materials"]>(ctx, names.materials),
      readJson<ClientCatalog["hardware"]>(ctx, names.hardware),
      readJson<ClientCatalog["components"]>(ctx, names.components),
      readJson<ClientCatalog["componentGeometry"]>(ctx, names.componentGeometry),
      readJson<ClientCatalog["modules"]>(ctx, names.modules),
      readJson<ClientCatalog["priceList"]>(ctx, names.pricing),
      readJson<ClientCatalog["kitchenDefaults"]>(ctx, names.kitchenDefaults),
      readJson<ClientCatalog["vendorCatalog"]>(ctx, names.vendorCatalog),
      readJson<ClientCatalog["meta"]>(ctx, names.meta)
    ]);
    if (!materials || !hardware || !components || !componentGeometry || !modules || !priceList || !kitchenDefaults) return null;
    const seed = memory.getCatalogForClient(ctx.clientId);
    return validateClientCatalog({
      clientId: ctx.clientId,
      materials,
      hardware,
      legacyMaterials: seed.legacyMaterials,
      components,
      componentGeometry,
      modules,
      priceList,
      kitchenDefaults,
      vendorCatalog: vendorCatalog ?? undefined,
      meta: meta ?? seed.meta
    });
  }

  async function writeCatalog(ctx: ClientContext, catalog: ClientCatalog): Promise<void> {
    const validated = validateClientCatalog(catalog);
    assertCatalogClient(ctx, validated);
    await Promise.all([
      writeJson(ctx, names.materials, validated.materials),
      writeJson(ctx, names.hardware, validated.hardware),
      writeJson(ctx, names.components, validated.components),
      writeJson(ctx, names.componentGeometry, validated.componentGeometry),
      writeJson(ctx, names.modules, validated.modules),
      writeJson(ctx, names.pricing, validated.priceList),
      writeJson(ctx, names.kitchenDefaults, validated.kitchenDefaults),
      writeJson(ctx, names.vendorCatalog, validated.vendorCatalog ?? null),
      writeJson(ctx, names.meta, validated.meta)
    ]);
  }

  async function ensureSystemModulePackages(ctx: ClientContext, catalog: ClientCatalog): Promise<ClientCatalog> {
    const existingPackages = await modulePackageRepository.listPackages(ctx);
    const existingPackageIds = new Set(existingPackages.map((modulePackage) => modulePackage.module.modulePackageId));
    const nextModules = [...catalog.modules];
    let changed = false;

    for (const template of systemModulePackageTemplates) {
      const persisted = existingPackageIds.has(template.module.modulePackageId)
        ? await modulePackageRepository.getPackage(ctx, template.module.modulePackageId)
        : await modulePackageRepository.savePackage(ctx, structuredClone(template), { source: "system-template" });
      if (!persisted) continue;

      const packageHash = computeModulePackageHash(persisted);
      const existingIndex = nextModules.findIndex((module) =>
        module.modulePackageId === persisted.module.modulePackageId ||
        (!module.modulePackageId && module.moduleType === persisted.module.moduleType)
      );
      const hasClientOverrideForType = nextModules.some((module) =>
        module.moduleType === persisted.module.moduleType &&
        module.modulePackageId &&
        module.modulePackageId !== persisted.module.modulePackageId
      );
      const templateTags = new Set((persisted.module.tags ?? []).map((tag) => tag.toLowerCase()));
      if (existingIndex < 0 && hasClientOverrideForType && !templateTags.has("revit-export-preview")) continue;

      const previous = existingIndex >= 0 ? nextModules[existingIndex] : null;
      const nextDefinition = {
        ...createCatalogModuleDefinitionFromPackage(persisted, {
          catalog,
          enabled: previous?.enabled ?? true,
          packageHash
        }),
        ...(previous?.id && !previous.modulePackageId ? { id: previous.id } : {})
      };
      if (previous && JSON.stringify(previous) === JSON.stringify(nextDefinition)) continue;
      if (existingIndex >= 0) nextModules[existingIndex] = nextDefinition;
      else nextModules.push(nextDefinition);
      changed = true;
    }

    if (!changed) return catalog;
    return {
      ...catalog,
      modules: nextModules,
      meta: {
        ...catalog.meta,
        updatedAt: new Date().toISOString()
      }
    };
  }

  function ensureCurrentSystemCatalogData(catalog: ClientCatalog): ClientCatalog {
    if (!isDemosCatalogGenerated()) return catalog;
    const hasDemosMaterials = catalog.materials.some((material) => material.id.startsWith("mat.demos."));
    const hasDemosComponents = catalog.components.some((component) => component.id.startsWith("cmp.demos."));
    if (hasDemosMaterials && hasDemosComponents) return catalog;
    if (catalog.meta.source !== "system-seed") return catalog;

    const seed = memory.getCatalogForClient(catalog.clientId);
    return validateClientCatalog({
      ...catalog,
      materials: seed.materials,
      components: seed.components,
      componentGeometry: seed.componentGeometry,
      priceList: seed.priceList,
      kitchenDefaults: seed.kitchenDefaults,
      meta: {
        ...catalog.meta,
        catalogVersion: Math.max(catalog.meta.catalogVersion ?? 1, 2),
        updatedAt: new Date().toISOString()
      }
    });
  }

  const ensureCatalogExists = async (ctx: ClientContext): Promise<ClientCatalog> => {
    const existing = await readCatalog(ctx);
    if (existing) {
      const withCurrentSystemData = ensureCurrentSystemCatalogData(existing);
      const repaired = await ensureSystemModulePackages(ctx, withCurrentSystemData);
      if (repaired !== existing) await writeCatalog(ctx, repaired);
      return repaired;
    }
    const baseSeed = memory.getCatalogForClient(ctx.clientId);
    const seededPackages = await Promise.all(systemModulePackageTemplates.map((modulePackage) =>
      modulePackageRepository.savePackage(ctx, structuredClone(modulePackage), { source: "system-template" })
    ));
    const seeded: ClientCatalog = {
      ...baseSeed,
      modules: seededPackages.map((modulePackage) =>
        createCatalogModuleDefinitionFromPackage(modulePackage, {
          catalog: baseSeed,
          enabled: true,
          packageHash: computeModulePackageHash(modulePackage)
        })
      )
    };
    await writeCatalog(ctx, seeded);
    return seeded;
  };

  return {
    getCatalogForClient(clientId: string): ClientCatalog {
      return memory.getCatalogForClient(clientId);
    },
    async getCatalog(ctx) {
      return (await readCatalog(ctx)) ?? memory.getCatalogForClient(ctx.clientId);
    },
    async saveCatalog(ctx, catalog) {
      await writeCatalog(ctx, catalog);
    },
    ensureCatalogExists,
    async getMaterialById(ctx, materialId) {
      return (await ensureCatalogExists(ctx)).materials.find((material) => material.id === materialId) ?? null;
    },
    async getComponentById(ctx, componentId) {
      return (await ensureCatalogExists(ctx)).components.find((component) => component.id === componentId) ?? null;
    },
    async getModuleByType(ctx, moduleType) {
      return (await ensureCatalogExists(ctx)).modules.find((module) => module.moduleType === moduleType) ?? null;
    },
    async getPrice(ctx, priceRef) {
      return (await ensureCatalogExists(ctx)).priceList.prices[priceRef] ?? null;
    },
    async getKitchenDefaults(ctx) {
      return { ...(await ensureCatalogExists(ctx)).kitchenDefaults };
    }
  };
}
