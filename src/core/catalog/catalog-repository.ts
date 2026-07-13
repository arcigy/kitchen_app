import type { ClientContext } from "../client/client-context";
import { createSystemCatalogSeed } from "./catalog-bootstrap";
import type { ClientCatalog, ClientCatalogSeed } from "./catalog-types";
import { validateClientCatalog } from "./catalog-validation";
import { invalidateCatalogExactLookupCaches } from "./catalog-exact-lookup";

export type ClientCatalogRepository = {
  getCatalogForClient(clientId: string): ClientCatalog;
  getCatalog(ctx: ClientContext): Promise<ClientCatalog>;
  saveCatalog(ctx: ClientContext, catalog: ClientCatalog): Promise<void>;
  ensureCatalogExists(ctx: ClientContext): Promise<ClientCatalog>;
  getMaterialById(ctx: ClientContext, materialId: string): Promise<ClientCatalog["materials"][number] | null>;
  getMaterialByCode(ctx: ClientContext, code: string): Promise<ClientCatalog["materials"][number] | null>;
  getComponentById(ctx: ClientContext, componentId: string): Promise<ClientCatalog["components"][number] | null>;
  getComponentByCode(ctx: ClientContext, code: string): Promise<ClientCatalog["components"][number] | null>;
  getModuleByType(ctx: ClientContext, moduleType: string): Promise<ClientCatalog["modules"][number] | null>;
  getPrice(ctx: ClientContext, priceRef: string): Promise<number | null>;
  getKitchenDefaults(ctx: ClientContext): Promise<ClientCatalog["kitchenDefaults"]>;
};

function cloneSeed(): ClientCatalogSeed {
  return createSystemCatalogSeed();
}

function catalogFromSeed(clientId: string): ClientCatalog {
  return validateClientCatalog({
    clientId,
    ...cloneSeed()
  });
}

function cloneCatalog(catalog: ClientCatalog): ClientCatalog {
  return structuredClone(catalog);
}

export function findCatalogMaterialByCode(
  materials: ClientCatalog["materials"],
  code: string
): ClientCatalog["materials"][number] | null {
  const byId = materials.find((material) => material.id === code);
  if (byId) return byId;
  const byCatalogCode = materials.filter((material) => material.materialCode === code);
  if (byCatalogCode.length === 1) return byCatalogCode[0]!;
  if (byCatalogCode.length > 1) return null;
  const bySupplierCode = materials.filter((material) => material.supplierSource?.supplierProductId === code);
  if (bySupplierCode.length === 1) return bySupplierCode[0]!;
  const canonicalSupplierMatches = bySupplierCode
    .filter((material) => material.id.endsWith(`.${code}`))
    .sort((left, right) => left.id.length - right.id.length || left.id.localeCompare(right.id));
  return canonicalSupplierMatches.length > 0 && canonicalSupplierMatches[0]!.id.length < (canonicalSupplierMatches[1]?.id.length ?? Infinity)
    ? canonicalSupplierMatches[0]!
    : null;
}

export function findCatalogComponentByCode(
  components: ClientCatalog["components"],
  code: string
): ClientCatalog["components"][number] | null {
  const byId = components.find((component) => component.id === code);
  if (byId) return byId;
  const byCatalogCode = components.filter((component) => component.componentCode === code);
  if (byCatalogCode.length === 1) return byCatalogCode[0]!;
  if (byCatalogCode.length > 1) return null;
  const bySupplierCode = components.filter((component) => component.supplierSource?.supplierProductId === code);
  if (bySupplierCode.length === 1) return bySupplierCode[0]!;
  const canonicalSupplierMatches = bySupplierCode
    .filter((component) => component.id.endsWith(`.${code}`))
    .sort((left, right) => left.id.length - right.id.length || left.id.localeCompare(right.id));
  return canonicalSupplierMatches.length > 0 && canonicalSupplierMatches[0]!.id.length < (canonicalSupplierMatches[1]?.id.length ?? Infinity)
    ? canonicalSupplierMatches[0]!
    : null;
}

function assertCatalogClient(ctx: ClientContext, catalog: ClientCatalog) {
  if (catalog.clientId !== ctx.clientId) throw new Error("Catalog clientId must match ClientContext.");
}

function createRepositoryFromStore(store: Map<string, ClientCatalog>): ClientCatalogRepository {
  const ensureSync = (clientId: string): ClientCatalog => {
    const existing = store.get(clientId);
    if (existing) return cloneCatalog(existing);
    const catalog = catalogFromSeed(clientId);
    store.set(clientId, cloneCatalog(catalog));
    return catalog;
  };

  return {
    getCatalogForClient(clientId: string): ClientCatalog {
      return ensureSync(clientId);
    },
    async getCatalog(ctx) {
      return ensureSync(ctx.clientId);
    },
    async saveCatalog(ctx, catalog) {
      assertCatalogClient(ctx, catalog);
      store.set(ctx.clientId, cloneCatalog(validateClientCatalog(catalog)));
      invalidateCatalogExactLookupCaches(ctx.clientId);
    },
    async ensureCatalogExists(ctx) {
      return ensureSync(ctx.clientId);
    },
    async getMaterialById(ctx, materialId) {
      return ensureSync(ctx.clientId).materials.find((material) => material.id === materialId) ?? null;
    },
    async getMaterialByCode(ctx, code) {
      return findCatalogMaterialByCode(ensureSync(ctx.clientId).materials, code);
    },
    async getComponentById(ctx, componentId) {
      return ensureSync(ctx.clientId).components.find((component) => component.id === componentId) ?? null;
    },
    async getComponentByCode(ctx, code) {
      return findCatalogComponentByCode(ensureSync(ctx.clientId).components, code);
    },
    async getModuleByType(ctx, moduleType) {
      return ensureSync(ctx.clientId).modules.find((module) => module.moduleType === moduleType) ?? null;
    },
    async getPrice(ctx, priceRef) {
      return ensureSync(ctx.clientId).priceList.prices[priceRef] ?? null;
    },
    async getKitchenDefaults(ctx) {
      return { ...ensureSync(ctx.clientId).kitchenDefaults };
    }
  };
}

export function createSystemSeedClientCatalogRepository(): ClientCatalogRepository {
  return createRepositoryFromStore(new Map());
}

export function getSystemSeedCatalog(): ClientCatalog {
  return catalogFromSeed("system_template");
}
