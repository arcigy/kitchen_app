import type { ClientCatalog } from "../core/catalog/catalog-types";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { systemModulePackageTemplates } from "../system/module-packages";

const LOCAL_DEV_CLIENT_ID = "client_arcigy_demo";

const localDevModulePackages = systemModulePackageTemplates;

function shouldUseLocalDevFallback(expectedClientId?: string) {
  return (
    import.meta.env.DEV &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") &&
    (!expectedClientId || expectedClientId === LOCAL_DEV_CLIENT_ID)
  );
}

function createLocalDevCatalog(): ClientCatalog {
  return {
    clientId: LOCAL_DEV_CLIENT_ID,
    ...createSystemCatalogSeed()
  };
}

const APP_DATA_CACHE_KEY = "arcigy.kitchen.clientAppData.v1";
const APP_DATA_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

type ClientAppData = {
  clientCatalog: ClientCatalog;
  modulePackages: FurnQuoteModulePackage[];
};

type CachedClientAppData = ClientAppData & {
  clientId: string;
  cachedAt: number;
};

function isClientCatalog(value: unknown): value is ClientCatalog {
  return !!value && typeof value === "object" && "clientId" in value && "materials" in value && "priceList" in value;
}

export async function loadClientCatalogForApp(expectedClientId?: string): Promise<ClientCatalog> {
  if (shouldUseLocalDevFallback(expectedClientId)) return createLocalDevCatalog();

  let response: Response;
  try {
    response = await fetch("/api/catalog", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
  } catch (error) {
    if (shouldUseLocalDevFallback(expectedClientId)) return createLocalDevCatalog();
    throw error;
  }
  if (!response.ok) {
    if (shouldUseLocalDevFallback(expectedClientId)) return createLocalDevCatalog();
    throw new Error(`Failed to load client catalog: HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json() as unknown;
  } catch (error) {
    if (shouldUseLocalDevFallback(expectedClientId)) return createLocalDevCatalog();
    throw error;
  }
  const catalog = body && typeof body === "object" ? (body as { catalog?: unknown }).catalog : undefined;
  if (!isClientCatalog(catalog)) {
    if (shouldUseLocalDevFallback(expectedClientId)) return createLocalDevCatalog();
    throw new Error("Failed to load client catalog: invalid response.");
  }
  return catalog;
}

function isModulePackage(value: unknown): value is FurnQuoteModulePackage {
  return !!value && typeof value === "object" && (value as { format?: unknown }).format === "furnquote-module";
}

export async function loadClientModulePackagesForApp(expectedClientId?: string): Promise<FurnQuoteModulePackage[]> {
  if (shouldUseLocalDevFallback(expectedClientId)) return localDevModulePackages;

  let response: Response;
  try {
    response = await fetch("/api/modules", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
  } catch (error) {
    if (shouldUseLocalDevFallback(expectedClientId)) return localDevModulePackages;
    throw error;
  }
  if (!response.ok) {
    if (shouldUseLocalDevFallback(expectedClientId)) return localDevModulePackages;
    throw new Error(`Failed to load client module packages: HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json() as unknown;
  } catch (error) {
    if (shouldUseLocalDevFallback(expectedClientId)) return localDevModulePackages;
    throw error;
  }
  const modules = body && typeof body === "object" ? (body as { modules?: unknown }).modules : undefined;
  if (!Array.isArray(modules) || !modules.every(isModulePackage)) {
    if (shouldUseLocalDevFallback(expectedClientId)) return localDevModulePackages;
    throw new Error("Failed to load client module packages: invalid response.");
  }
  return modules;
}

function isCachedClientAppData(value: unknown): value is CachedClientAppData {
  if (!value || typeof value !== "object") return false;
  const cached = value as Partial<CachedClientAppData>;
  return (
    typeof cached.clientId === "string" &&
    typeof cached.cachedAt === "number" &&
    isClientCatalog(cached.clientCatalog) &&
    Array.isArray(cached.modulePackages) &&
    cached.modulePackages.every(isModulePackage)
  );
}

function readClientAppDataCache(expectedClientId?: string): ClientAppData | null {
  try {
    const raw = window.sessionStorage.getItem(APP_DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isCachedClientAppData(parsed)) return null;
    if (Date.now() - parsed.cachedAt > APP_DATA_CACHE_MAX_AGE_MS) return null;
    if (expectedClientId && parsed.clientId !== expectedClientId) return null;
    return {
      clientCatalog: parsed.clientCatalog,
      modulePackages: parsed.modulePackages
    };
  } catch {
    return null;
  }
}

function writeClientAppDataCache(data: ClientAppData): void {
  try {
    const cached: CachedClientAppData = {
      ...data,
      clientId: data.clientCatalog.clientId,
      cachedAt: Date.now()
    };
    window.sessionStorage.setItem(APP_DATA_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Cache is best effort only.
  }
}

async function fetchClientAppData(expectedClientId?: string): Promise<ClientAppData> {
  const [clientCatalog, modulePackages] = await Promise.all([
    loadClientCatalogForApp(expectedClientId),
    loadClientModulePackagesForApp(expectedClientId)
  ]);
  const data = { clientCatalog, modulePackages };
  writeClientAppDataCache(data);
  return data;
}

export async function loadClientAppDataForApp(expectedClientId?: string): Promise<ClientAppData> {
  const cached = readClientAppDataCache(expectedClientId);
  const refreshed = fetchClientAppData(expectedClientId);
  if (cached) {
    void refreshed.catch(() => undefined);
    return cached;
  }
  return refreshed;
}
