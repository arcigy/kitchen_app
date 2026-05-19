import type { ClientContext } from "../client/client-context";
import { createSystemCatalogSeed } from "./catalog-bootstrap";
import type { ClientCatalog, ClientCatalogSeed } from "./catalog-types";
import { validateClientCatalog } from "./catalog-validation";

export type ClientCatalogRepository = {
  getCatalogForClient(clientId: string): ClientCatalog;
  getCatalog(ctx: ClientContext): Promise<ClientCatalog>;
  saveCatalog(ctx: ClientContext, catalog: ClientCatalog): Promise<void>;
  ensureCatalogExists(ctx: ClientContext): Promise<ClientCatalog>;
  getMaterialById(ctx: ClientContext, materialId: string): Promise<ClientCatalog["materials"][number] | null>;
  getComponentById(ctx: ClientContext, componentId: string): Promise<ClientCatalog["components"][number] | null>;
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
    },
    async ensureCatalogExists(ctx) {
      return ensureSync(ctx.clientId);
    },
    async getMaterialById(ctx, materialId) {
      return ensureSync(ctx.clientId).materials.find((material) => material.id === materialId) ?? null;
    },
    async getComponentById(ctx, componentId) {
      return ensureSync(ctx.clientId).components.find((component) => component.id === componentId) ?? null;
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
