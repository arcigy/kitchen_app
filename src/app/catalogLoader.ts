import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";

const APP_DATA_CACHE_KEY = "arcigy.kitchen.clientAppData.v1";
const APP_DATA_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

type ClientAppData = {
  clientCatalog: ClientCatalog;
  modulePackages: FurnQuoteModulePackage[];
};

type CachedClientAppData = ClientAppData & {
  cachedAt: number;
};

function isClientCatalog(value: unknown): value is ClientCatalog {
  return !!value && typeof value === "object" && "clientId" in value && "materials" in value && "priceList" in value;
}

export async function loadClientCatalogForApp(): Promise<ClientCatalog> {
  const response = await fetch("/api/catalog", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Failed to load client catalog: HTTP ${response.status}`);
  }

  const body = await response.json() as unknown;
  const catalog = body && typeof body === "object" ? (body as { catalog?: unknown }).catalog : undefined;
  if (!isClientCatalog(catalog)) {
    throw new Error("Failed to load client catalog: invalid response.");
  }
  return catalog;
}

function isModulePackage(value: unknown): value is FurnQuoteModulePackage {
  return !!value && typeof value === "object" && (value as { format?: unknown }).format === "furnquote-module";
}

export async function loadClientModulePackagesForApp(): Promise<FurnQuoteModulePackage[]> {
  const response = await fetch("/api/modules", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Failed to load client module packages: HTTP ${response.status}`);
  }

  const body = await response.json() as unknown;
  const modules = body && typeof body === "object" ? (body as { modules?: unknown }).modules : undefined;
  if (!Array.isArray(modules) || !modules.every(isModulePackage)) {
    throw new Error("Failed to load client module packages: invalid response.");
  }
  return modules;
}

function isCachedClientAppData(value: unknown): value is CachedClientAppData {
  if (!value || typeof value !== "object") return false;
  const cached = value as Partial<CachedClientAppData>;
  return (
    typeof cached.cachedAt === "number" &&
    isClientCatalog(cached.clientCatalog) &&
    Array.isArray(cached.modulePackages) &&
    cached.modulePackages.every(isModulePackage)
  );
}

function readClientAppDataCache(): ClientAppData | null {
  try {
    const raw = window.sessionStorage.getItem(APP_DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isCachedClientAppData(parsed)) return null;
    if (Date.now() - parsed.cachedAt > APP_DATA_CACHE_MAX_AGE_MS) return null;
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
      cachedAt: Date.now()
    };
    window.sessionStorage.setItem(APP_DATA_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Cache is best effort only.
  }
}

async function fetchClientAppData(): Promise<ClientAppData> {
  const [clientCatalog, modulePackages] = await Promise.all([
    loadClientCatalogForApp(),
    loadClientModulePackagesForApp()
  ]);
  const data = { clientCatalog, modulePackages };
  writeClientAppDataCache(data);
  return data;
}

export async function loadClientAppDataForApp(): Promise<ClientAppData> {
  const cached = readClientAppDataCache();
  const refreshed = fetchClientAppData();
  if (cached) {
    void refreshed.catch(() => undefined);
    return cached;
  }
  return refreshed;
}
