import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { browserJourneyNow, reportBrowserJourney, type BrowserJourneyMetric } from "./clientJourneyTelemetry";

const LOCAL_DEV_CLIENT_ID = "client_arcigy_demo";

function shouldUseLocalDevFallback(expectedClientId?: string) {
  return (
    import.meta.env.DEV &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") &&
    (!expectedClientId || expectedClientId === LOCAL_DEV_CLIENT_ID)
  );
}

async function createLocalDevCatalog(): Promise<ClientCatalog> {
  const { createSystemCatalogSeed } = await import("../core/catalog/catalog-bootstrap");
  return { clientId: LOCAL_DEV_CLIENT_ID, ...createSystemCatalogSeed() };
}

async function loadLocalDevModulePackages(): Promise<FurnQuoteModulePackage[]> {
  const { systemModulePackageTemplates } = await import("../system/module-packages");
  return systemModulePackageTemplates;
}

const APP_DATA_CACHE_KEY = "arcigy.kitchen.clientAppData.v1";
const APP_DATA_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const APP_DATA_CACHE_COMPRESSION_THRESHOLD = 512 * 1024;
const APP_DATA_PERSISTENT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const APP_DATA_PERSISTENT_CACHE_DB = "arcigy-kitchen-client-app-data";
const APP_DATA_PERSISTENT_CACHE_STORE = "tenant-app-data";
const APP_DATA_REVISION_TIMEOUT_MS = 5_000;
const APP_DATA_FETCH_TIMEOUT_MS = 45_000;
const CLIENT_APP_DATA_BOOTSTRAP_VERSION = "catalog-bootstrap-v1";

type ClientAppData = {
  clientCatalog: ClientCatalog;
  modulePackages: FurnQuoteModulePackage[];
};

export type ClientAppDataLoadSource = "local" | "network" | "persistent_cache" | "session_cache";

type CachedClientAppData = ClientAppData & {
  clientId: string;
  cachedAt: number;
  revision?: string;
};

type CompressedCachedClientAppData = {
  version: 2;
  clientId: string;
  cachedAt: number;
  encoding: "gzip-base64";
  payload: string;
};

type RevisionedCompressedCachedClientAppData = Omit<CompressedCachedClientAppData, "version"> & {
  version: 3;
  revision: string;
};

type PersistentCachedClientAppData = {
  version: 1;
  clientId: string;
  revision: string;
  cachedAt: number;
  encoding: "json" | "gzip-base64";
  payload: string;
};

type ClientAppDataRevision = {
  clientId: string;
  catalog: null | {
    catalogVersion: number;
    updatedAt: string;
    storageRevision: string;
  };
  modules: {
    count: number;
    updatedAt: string | null;
    storageRevision: string;
  };
};

type LoadedClientAppDataRevision = {
  revision: ClientAppDataRevision;
  key: string;
};

let clientAppDataCacheGeneration = 0;
const clientAppDataLoadSources = new WeakMap<ClientAppData, ClientAppDataLoadSource>();
let currentClientAppDataLoad: {
  windowRef: Window;
  clientId: string | undefined;
  promise: Promise<ClientAppData>;
} | null = null;

function isClientCatalog(value: unknown): value is ClientCatalog {
  return !!value && typeof value === "object" && "clientId" in value && "materials" in value && "priceList" in value;
}

type AppDataEndpointJson = {
  response: Response;
  body: unknown;
};

async function fetchAppDataEndpointJson(endpoint: string, resource: string): Promise<AppDataEndpointJson> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timed out loading ${resource} after 45 seconds. Please try opening the project again.`));
      controller.abort();
    }, APP_DATA_FETCH_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([
      fetch(endpoint, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: controller.signal
      }),
      timeout
    ]);
    if (!response.ok) return { response, body: undefined };
    const body = await Promise.race([response.json() as Promise<unknown>, timeout]);
    return { response, body };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function loadClientCatalogForApp(expectedClientId?: string): Promise<ClientCatalog> {
  if (shouldUseLocalDevFallback(expectedClientId)) return createLocalDevCatalog();

  let response: Response;
  let body: unknown;
  try {
    ({ response, body } = await fetchAppDataEndpointJson("/api/catalog/bootstrap", "client catalog"));
  } catch (error) {
    if (shouldUseLocalDevFallback(expectedClientId)) return createLocalDevCatalog();
    throw error;
  }
  if (!response.ok) {
    if (shouldUseLocalDevFallback(expectedClientId)) return createLocalDevCatalog();
    throw new Error(`Failed to load client catalog: HTTP ${response.status}`);
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
  if (shouldUseLocalDevFallback(expectedClientId)) return loadLocalDevModulePackages();

  let response: Response;
  let body: unknown;
  try {
    ({ response, body } = await fetchAppDataEndpointJson("/api/modules", "client module packages"));
  } catch (error) {
    if (shouldUseLocalDevFallback(expectedClientId)) return loadLocalDevModulePackages();
    throw error;
  }
  if (!response.ok) {
    if (shouldUseLocalDevFallback(expectedClientId)) return loadLocalDevModulePackages();
    throw new Error(`Failed to load client module packages: HTTP ${response.status}`);
  }

  const modules = body && typeof body === "object" ? (body as { modules?: unknown }).modules : undefined;
  if (!Array.isArray(modules) || !modules.every(isModulePackage)) {
    if (shouldUseLocalDevFallback(expectedClientId)) return loadLocalDevModulePackages();
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

function isCompressedCachedClientAppData(value: unknown): value is CompressedCachedClientAppData {
  if (!value || typeof value !== "object") return false;
  const cached = value as Partial<CompressedCachedClientAppData>;
  return (
    cached.version === 2 &&
    typeof cached.clientId === "string" &&
    typeof cached.cachedAt === "number" &&
    cached.encoding === "gzip-base64" &&
    typeof cached.payload === "string"
  );
}

function isRevisionedCompressedCachedClientAppData(value: unknown): value is RevisionedCompressedCachedClientAppData {
  if (!value || typeof value !== "object") return false;
  const cached = value as Partial<RevisionedCompressedCachedClientAppData>;
  return (
    cached.version === 3 &&
    typeof cached.clientId === "string" &&
    typeof cached.cachedAt === "number" &&
    cached.encoding === "gzip-base64" &&
    typeof cached.payload === "string" &&
    typeof cached.revision === "string"
  );
}

function isPersistentCachedClientAppData(value: unknown): value is PersistentCachedClientAppData {
  if (!value || typeof value !== "object") return false;
  const cached = value as Partial<PersistentCachedClientAppData>;
  return (
    cached.version === 1 &&
    typeof cached.clientId === "string" &&
    typeof cached.revision === "string" &&
    typeof cached.cachedAt === "number" &&
    (cached.encoding === "json" || cached.encoding === "gzip-base64") &&
    typeof cached.payload === "string"
  );
}

function isClientAppDataRevision(value: unknown): value is ClientAppDataRevision {
  if (!value || typeof value !== "object") return false;
  const revision = value as Partial<ClientAppDataRevision>;
  const catalog = revision.catalog;
  const modules = revision.modules;
  const validCatalog = catalog === null || (
    !!catalog &&
    typeof catalog.catalogVersion === "number" &&
    Number.isFinite(catalog.catalogVersion) &&
    typeof catalog.updatedAt === "string" &&
    typeof catalog.storageRevision === "string"
  );
  return (
    typeof revision.clientId === "string" &&
    validCatalog &&
    !!modules &&
    typeof modules.count === "number" &&
    Number.isSafeInteger(modules.count) &&
    modules.count >= 0 &&
    (modules.updatedAt === null || typeof modules.updatedAt === "string") &&
    typeof modules.storageRevision === "string"
  );
}

function appDataRevisionKey(revision: ClientAppDataRevision): string {
  return JSON.stringify([
    CLIENT_APP_DATA_BOOTSTRAP_VERSION,
    revision.clientId,
    revision.catalog?.catalogVersion ?? null,
    revision.catalog?.updatedAt ?? null,
    revision.catalog?.storageRevision ?? null,
    revision.modules.count,
    revision.modules.updatedAt,
    revision.modules.storageRevision
  ]);
}

async function loadClientAppDataRevision(expectedClientId: string): Promise<LoadedClientAppDataRevision> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APP_DATA_REVISION_TIMEOUT_MS);
  try {
    const response = await fetch("/api/app-data/revision", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Failed to load client app data revision: HTTP ${response.status}`);
    const body = await response.json() as unknown;
    const revision = body && typeof body === "object" ? (body as { revision?: unknown }).revision : undefined;
    if (!isClientAppDataRevision(revision) || revision.clientId !== expectedClientId) {
      throw new Error("Failed to load client app data revision: invalid response.");
    }
    return { revision, key: appDataRevisionKey(revision) };
  } finally {
    clearTimeout(timeout);
  }
}

function isFreshExpectedTenant(cached: { clientId: string; cachedAt: number }, expectedClientId?: string): boolean {
  if (Date.now() - cached.cachedAt > APP_DATA_CACHE_MAX_AGE_MS) return false;
  return !expectedClientId || cached.clientId === expectedClientId;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function compressCachePayload(value: string): Promise<string | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  return bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function decompressCachePayload(value: string): Promise<string | null> {
  if (typeof DecompressionStream === "undefined") return null;
  const bytes = base64ToBytes(value);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function parseClientAppData(value: unknown, expectedClientId?: string): ClientAppData | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ClientAppData>;
  if (!isClientCatalog(candidate.clientCatalog)) return null;
  if (!Array.isArray(candidate.modulePackages) || !candidate.modulePackages.every(isModulePackage)) return null;
  if (expectedClientId && candidate.clientCatalog.clientId !== expectedClientId) return null;
  return { clientCatalog: candidate.clientCatalog, modulePackages: candidate.modulePackages };
}

async function readClientAppDataCache(expectedClientId?: string, expectedRevision?: string): Promise<ClientAppData | null> {
  try {
    const raw = window.sessionStorage.getItem(APP_DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (isCachedClientAppData(parsed)) {
      if (!isFreshExpectedTenant(parsed, expectedClientId)) return null;
      if (expectedRevision && parsed.revision !== expectedRevision) return null;
      return { clientCatalog: parsed.clientCatalog, modulePackages: parsed.modulePackages };
    }
    if (isRevisionedCompressedCachedClientAppData(parsed)) {
      if (!isFreshExpectedTenant(parsed, expectedClientId) || parsed.revision !== expectedRevision) return null;
      const decompressed = await decompressCachePayload(parsed.payload);
      if (!decompressed) return null;
      return parseClientAppData(JSON.parse(decompressed) as unknown, parsed.clientId);
    }
    if (expectedRevision) return null;
    if (!isCompressedCachedClientAppData(parsed) || !isFreshExpectedTenant(parsed, expectedClientId)) return null;
    const decompressed = await decompressCachePayload(parsed.payload);
    if (!decompressed) return null;
    return parseClientAppData(JSON.parse(decompressed) as unknown, parsed.clientId);
  } catch {
    return null;
  }
}

function openPersistentClientAppDataCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (database: IDBDatabase | null) => {
      if (settled) {
        database?.close();
        return;
      }
      settled = true;
      resolve(database);
    };
    try {
      const request = indexedDB.open(APP_DATA_PERSISTENT_CACHE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(APP_DATA_PERSISTENT_CACHE_STORE)) {
          request.result.createObjectStore(APP_DATA_PERSISTENT_CACHE_STORE, { keyPath: "clientId" });
        }
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

async function readPersistentClientAppDataCache(expectedClientId: string, expectedRevision: string): Promise<ClientAppData | null> {
  const database = await openPersistentClientAppDataCache();
  if (!database) return null;
  try {
    const cached = await new Promise<unknown>((resolve) => {
      try {
        const request = database
          .transaction(APP_DATA_PERSISTENT_CACHE_STORE, "readonly")
          .objectStore(APP_DATA_PERSISTENT_CACHE_STORE)
          .get(expectedClientId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (!isPersistentCachedClientAppData(cached)) return null;
    if (cached.clientId !== expectedClientId || cached.revision !== expectedRevision) return null;
    if (Date.now() - cached.cachedAt > APP_DATA_PERSISTENT_CACHE_MAX_AGE_MS) return null;
    const serialized = cached.encoding === "gzip-base64"
      ? await decompressCachePayload(cached.payload)
      : cached.payload;
    if (!serialized) return null;
    return parseClientAppData(JSON.parse(serialized) as unknown, expectedClientId);
  } catch {
    return null;
  } finally {
    database.close();
  }
}

async function writePersistentClientAppDataCache(cached: PersistentCachedClientAppData): Promise<void> {
  const database = await openPersistentClientAppDataCache();
  if (!database) return;
  try {
    await new Promise<void>((resolve) => {
      try {
        const transaction = database.transaction(APP_DATA_PERSISTENT_CACHE_STORE, "readwrite");
        const store = transaction.objectStore(APP_DATA_PERSISTENT_CACHE_STORE);
        store.clear();
        store.put(cached);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    database.close();
  }
}

async function clearPersistentClientAppDataStore(): Promise<void> {
  const database = await openPersistentClientAppDataCache();
  if (!database) return;
  try {
    await new Promise<void>((resolve) => {
      try {
        const transaction = database.transaction(APP_DATA_PERSISTENT_CACHE_STORE, "readwrite");
        transaction.objectStore(APP_DATA_PERSISTENT_CACHE_STORE).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    database.close();
  }
}

async function writeClientAppDataCache(data: ClientAppData, generation: number, revision?: string): Promise<void> {
  try {
    const serializedData = JSON.stringify(data);
    const cached: CachedClientAppData = {
      ...data,
      clientId: data.clientCatalog.clientId,
      cachedAt: Date.now(),
      ...(revision ? { revision } : {})
    };
    if (serializedData.length <= APP_DATA_CACHE_COMPRESSION_THRESHOLD) {
      if (generation !== clientAppDataCacheGeneration) return;
      window.sessionStorage.setItem(APP_DATA_CACHE_KEY, JSON.stringify(cached));
      if (revision) {
        await writePersistentClientAppDataCache({
          version: 1,
          clientId: cached.clientId,
          revision,
          cachedAt: cached.cachedAt,
          encoding: "json",
          payload: serializedData
        });
      }
      return;
    }
    const payload = await compressCachePayload(serializedData);
    if (!payload) {
      if (generation !== clientAppDataCacheGeneration) return;
      window.sessionStorage.setItem(APP_DATA_CACHE_KEY, JSON.stringify(cached));
      return;
    }
    const compressed: CompressedCachedClientAppData | RevisionedCompressedCachedClientAppData = revision
      ? {
          version: 3,
          clientId: data.clientCatalog.clientId,
          cachedAt: cached.cachedAt,
          encoding: "gzip-base64",
          payload,
          revision
        }
      : {
          version: 2,
          clientId: data.clientCatalog.clientId,
          cachedAt: cached.cachedAt,
          encoding: "gzip-base64",
          payload
        };
    if (generation !== clientAppDataCacheGeneration) return;
    window.sessionStorage.setItem(APP_DATA_CACHE_KEY, JSON.stringify(compressed));
    if (revision) {
      await writePersistentClientAppDataCache({
        version: 1,
        clientId: cached.clientId,
        revision,
        cachedAt: cached.cachedAt,
        encoding: "gzip-base64",
        payload
      });
    }
  } catch {
    // Cache is best effort only.
  }
}

function scheduleClientAppDataCacheWrite(data: ClientAppData, generation: number, revision?: string): void {
  const write = () => {
    if (generation !== clientAppDataCacheGeneration) return;
    void writeClientAppDataCache(data, generation, revision);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(write, { timeout: 1_000 });
    return;
  }
  setTimeout(write, 0);
}

function scheduleClientAppDataCacheWriteAfterRevisionValidation(
  data: ClientAppData,
  generation: number,
  expectedClientId: string | undefined,
  initialRevision: LoadedClientAppDataRevision | null
): void {
  if (!expectedClientId || !initialRevision) {
    scheduleClientAppDataCacheWrite(data, generation);
    return;
  }

  void loadClientAppDataRevision(expectedClientId)
    .then((finalRevision) => {
      scheduleClientAppDataCacheWrite(
        data,
        generation,
        finalRevision.key === initialRevision.key ? initialRevision.key : undefined
      );
    })
    .catch(() => {
      scheduleClientAppDataCacheWrite(data, generation);
    });
}

async function fetchClientAppData(expectedClientId: string | undefined): Promise<ClientAppData> {
  const [clientCatalog, modulePackages] = await Promise.all([
    loadClientCatalogForApp(expectedClientId),
    loadClientModulePackagesForApp(expectedClientId)
  ]);
  return { clientCatalog, modulePackages };
}

export function loadClientAppDataForApp(expectedClientId?: string): Promise<ClientAppData> {
  if (
    currentClientAppDataLoad?.windowRef === window &&
    currentClientAppDataLoad.clientId === expectedClientId
  ) {
    return currentClientAppDataLoad.promise;
  }

  const startedAt = browserJourneyNow();
  const localFallback = shouldUseLocalDevFallback(expectedClientId);
  const report = (variant: BrowserJourneyMetric["variant"], outcome: BrowserJourneyMetric["outcome"]) => {
    reportBrowserJourney({
      journey: "app_data_load",
      variant,
      outcome,
      durationMs: browserJourneyNow() - startedAt
    });
  };
  const generation = ++clientAppDataCacheGeneration;
  const promise = (async () => {
    try {
      const initialRevision = expectedClientId && !localFallback
        ? await loadClientAppDataRevision(expectedClientId).catch(() => null)
        : null;
      const cached = await readClientAppDataCache(expectedClientId, initialRevision?.key);
      if (cached) {
        clientAppDataLoadSources.set(cached, "session_cache");
        report("session_cache", "success");
        return cached;
      }
      if (expectedClientId && initialRevision) {
        const persistent = await readPersistentClientAppDataCache(expectedClientId, initialRevision.key);
        if (persistent) {
          clientAppDataLoadSources.set(persistent, "persistent_cache");
          scheduleClientAppDataCacheWrite(persistent, generation, initialRevision.key);
          report("persistent_cache", "success");
          return persistent;
        }
      }
      const data = await fetchClientAppData(expectedClientId);
      scheduleClientAppDataCacheWriteAfterRevisionValidation(
        data,
        generation,
        expectedClientId,
        initialRevision
      );
      const source = localFallback ? "local" : "network";
      clientAppDataLoadSources.set(data, source);
      report(source, "success");
      return data;
    } catch (error) {
      report(localFallback ? "local" : "network", "failure");
      throw error;
    }
  })();
  const entry = { windowRef: window, clientId: expectedClientId, promise };
  currentClientAppDataLoad = entry;
  void promise.catch(() => {
    if (currentClientAppDataLoad === entry) currentClientAppDataLoad = null;
  });
  return promise;
}

export function getClientAppDataLoadSource(data: ClientAppData): ClientAppDataLoadSource | undefined {
  return clientAppDataLoadSources.get(data);
}

export function prefetchClientAppDataForApp(expectedClientId?: string): Promise<ClientAppData> {
  return loadClientAppDataForApp(expectedClientId);
}

export async function clearClientAppDataCaches(): Promise<void> {
  clientAppDataCacheGeneration += 1;
  currentClientAppDataLoad = null;
  try {
    window.sessionStorage.removeItem(APP_DATA_CACHE_KEY);
  } catch {
    // Cache cleanup is best effort only.
  }
  await clearPersistentClientAppDataStore();
}
