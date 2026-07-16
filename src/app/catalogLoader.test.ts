import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import { systemModulePackageTemplates } from "../system/module-packages";
import {
  clearClientAppDataCaches,
  getClientAppDataLoadSource,
  loadClientAppDataForApp,
  loadClientCatalogForApp,
  prefetchClientAppDataForApp
} from "./catalogLoader";

function createStorage(maxValueLength = Number.POSITIVE_INFINITY) {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > maxValueLength) throw new DOMException("Quota exceeded", "QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    }
  };
}

function createFakeIndexedDb() {
  const records = new Map<string, unknown>();
  let storeCreated = false;
  const database = {
    objectStoreNames: { contains: () => storeCreated },
    createObjectStore: () => {
      storeCreated = true;
      return {};
    },
    transaction: () => {
      const transaction: Record<string, unknown> = {};
      const store = {
        get: (key: string) => {
          const request: Record<string, unknown> = {};
          queueMicrotask(() => {
            request.result = structuredClone(records.get(key));
            (request.onsuccess as (() => void) | undefined)?.();
          });
          return request;
        },
        clear: () => {
          records.clear();
          return {};
        },
        put: (value: { clientId: string }) => {
          records.set(value.clientId, structuredClone(value));
          return {};
        }
      };
      transaction.objectStore = () => store;
      setTimeout(() => (transaction.oncomplete as (() => void) | undefined)?.(), 0);
      return transaction;
    },
    close: () => undefined
  };
  const factory = {
    open: () => {
      const request: Record<string, unknown> = { result: database };
      queueMicrotask(() => {
        if (!storeCreated) (request.onupgradeneeded as (() => void) | undefined)?.();
        (request.onsuccess as (() => void) | undefined)?.();
      });
      return request;
    }
  };
  return { factory: factory as unknown as IDBFactory, records };
}

function createResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}

function createRevision(clientId: string, storageRevision = "revision-1") {
  return {
    clientId,
    catalog: {
      catalogVersion: 1,
      updatedAt: "2026-07-15T00:00:00.000Z",
      storageRevision: `catalog-${storageRevision}`
    },
    modules: {
      count: 1,
      updatedAt: "2026-07-15T00:00:00.000Z",
      storageRevision: `modules-${storageRevision}`
    }
  };
}

describe("catalogLoader PINO tenant loading", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    const sessionStorage = createStorage();
    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1" },
      sessionStorage
    });
  });

  it("loads the server catalog for a non-demo localhost tenant instead of forcing local fallback", async () => {
    const serverCatalog = {
      clientId: "client_pino_nobilia_vkh_2026",
      ...createSystemCatalogSeed()
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => createResponse({ catalog: serverCatalog }));
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await loadClientCatalogForApp("client_pino_nobilia_vkh_2026");

    expect(catalog.clientId).toBe("client_pino_nobilia_vkh_2026");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/catalog/bootstrap");
  });

  it("ignores cached demo app data when the active tenant client id is PINO", async () => {
    const pinoCatalog = {
      clientId: "client_pino_nobilia_vkh_2026",
      ...createSystemCatalogSeed()
    };
    const demoCatalog = {
      clientId: "client_arcigy_demo",
      ...createSystemCatalogSeed()
    };
    window.sessionStorage.setItem(
      "arcigy.kitchen.clientAppData.v1",
      JSON.stringify({
        clientId: "client_arcigy_demo",
        clientCatalog: demoCatalog,
        modulePackages: systemModulePackageTemplates,
        cachedAt: Date.now()
      })
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/catalog/bootstrap")) return createResponse({ catalog: pinoCatalog });
      if (url.endsWith("/api/modules")) return createResponse({ modules: systemModulePackageTemplates.slice(0, 1) });
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await loadClientAppDataForApp("client_pino_nobilia_vkh_2026");

    expect(data.clientCatalog.clientId).toBe("client_pino_nobilia_vkh_2026");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("uses a fresh same-tenant cache without starting another full catalog download", async () => {
    const catalog = {
      clientId: "client_pino_nobilia_vkh_2026",
      ...createSystemCatalogSeed()
    };
    window.sessionStorage.setItem(
      "arcigy.kitchen.clientAppData.v1",
      JSON.stringify({
        clientId: catalog.clientId,
        clientCatalog: catalog,
        modulePackages: systemModulePackageTemplates.slice(0, 1),
        cachedAt: Date.now()
      })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const data = await loadClientAppDataForApp(catalog.clientId);

    expect(data.clientCatalog.clientId).toBe(catalog.clientId);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/app-data/revision");
  });

  it("reuses the project-manager prefetch when the workspace opens", async () => {
    const catalog = {
      clientId: "client_delfi",
      ...createSystemCatalogSeed()
    };
    let releaseCatalog: ((response: Response) => void) | undefined;
    const pendingCatalog = new Promise<Response>((resolve) => {
      releaseCatalog = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/catalog/bootstrap")) return pendingCatalog;
      return Promise.resolve(createResponse({ modules: systemModulePackageTemplates.slice(0, 1) }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const prefetched = prefetchClientAppDataForApp(catalog.clientId);
    const opened = loadClientAppDataForApp(catalog.clientId);

    expect(opened).toBe(prefetched);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    releaseCatalog!(createResponse({ catalog }));
    await expect(opened).resolves.toMatchObject({ clientCatalog: { clientId: catalog.clientId } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("compresses app data that exceeds the sessionStorage quota and restores it without another fetch", async () => {
    const sessionStorage = createStorage(5 * 1024 * 1024);
    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1" },
      sessionStorage
    });
    const largePayload = "DELFI-CATALOG-ROW|".repeat(400_000);
    const catalog = {
      clientId: "client_delfi",
      ...createSystemCatalogSeed(),
      largePayload
    };
    const revision = createRevision(catalog.clientId);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/app-data/revision")) return createResponse({ revision });
      if (url.endsWith("/api/catalog/bootstrap")) return createResponse({ catalog });
      if (url.endsWith("/api/modules")) return createResponse({ modules: systemModulePackageTemplates.slice(0, 1) });
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const stringify = vi.spyOn(JSON, "stringify");

    const coldStartedAt = Date.now();
    const first = await loadClientAppDataForApp(catalog.clientId);
    expect(Date.now() - coldStartedAt).toBeLessThan(1_000);
    expect((first.clientCatalog as typeof catalog).largePayload).toBe(largePayload);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.waitFor(() => {
      const value = window.sessionStorage.getItem("arcigy.kitchen.clientAppData.v1");
      expect(value ? (JSON.parse(value) as { clientId?: string }).clientId : null).toBe(catalog.clientId);
    }, { timeout: 10_000 });
    const stored = window.sessionStorage.getItem("arcigy.kitchen.clientAppData.v1");
    expect(stored).not.toBeNull();
    expect(stored!.length).toBeLessThan(5 * 1024 * 1024);
    expect(JSON.parse(stored!) as unknown).toMatchObject({
      version: 3,
      clientId: catalog.clientId,
      encoding: "gzip-base64",
      revision: expect.any(String)
    });
    const largeAppDataSerializations = stringify.mock.calls.filter(([value]) => {
      if (!value || typeof value !== "object") return false;
      const clientCatalog = (value as { clientCatalog?: unknown }).clientCatalog;
      return !!clientCatalog && typeof clientCatalog === "object" && "largePayload" in clientCatalog;
    });
    expect(largeAppDataSerializations).toHaveLength(1);

    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1" },
      sessionStorage
    });
    fetchMock.mockClear();
    const restored = await loadClientAppDataForApp(catalog.clientId);
    expect((restored.clientCatalog as typeof catalog).largePayload).toBe(largePayload);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/app-data/revision");
  }, 20_000);

  it("rejects a same-tenant cache when the authoritative revision changed", async () => {
    const clientId = "client_delfi";
    const staleCatalog = { clientId, ...createSystemCatalogSeed(), marker: "stale" };
    const currentCatalog = { clientId, ...createSystemCatalogSeed(), marker: "current" };
    window.sessionStorage.setItem(
      "arcigy.kitchen.clientAppData.v1",
      JSON.stringify({
        clientId,
        clientCatalog: staleCatalog,
        modulePackages: systemModulePackageTemplates.slice(0, 1),
        cachedAt: Date.now(),
        revision: "stale-revision"
      })
    );
    const revision = createRevision(clientId, "current");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/app-data/revision")) return createResponse({ revision });
      if (url.endsWith("/api/catalog/bootstrap")) return createResponse({ catalog: currentCatalog });
      if (url.endsWith("/api/modules")) return createResponse({ modules: systemModulePackageTemplates.slice(0, 1) });
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await loadClientAppDataForApp(clientId);

    expect((loaded.clientCatalog as typeof currentCatalog).marker).toBe("current");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/app-data/revision",
      "/api/catalog/bootstrap",
      "/api/modules",
      "/api/app-data/revision"
    ]);
  });

  it("does not block cold workspace data on the cache-only final revision check", async () => {
    const clientId = "client_delfi_nonblocking_revision";
    const catalog = { clientId, materials: [], priceList: {}, marker: "ready" };
    const revision = createRevision(clientId, "nonblocking");
    let revisionCalls = 0;
    let releaseFinalRevision: ((response: Response) => void) | undefined;
    const pendingFinalRevision = new Promise<Response>((resolve) => {
      releaseFinalRevision = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/app-data/revision")) {
        revisionCalls += 1;
        return revisionCalls === 1
          ? Promise.resolve(createResponse({ revision }))
          : pendingFinalRevision;
      }
      if (url.endsWith("/api/catalog/bootstrap")) return Promise.resolve(createResponse({ catalog }));
      if (url.endsWith("/api/modules")) return Promise.resolve(createResponse({ modules: [] }));
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadClientAppDataForApp(clientId)).resolves.toMatchObject({
      clientCatalog: { clientId, marker: "ready" }
    });
    expect(revisionCalls).toBe(2);
    expect(window.sessionStorage.getItem("arcigy.kitchen.clientAppData.v1")).toBeNull();

    releaseFinalRevision!(createResponse({ revision }));
    await vi.waitFor(() => {
      expect(window.sessionStorage.getItem("arcigy.kitchen.clientAppData.v1")).not.toBeNull();
    });
  });

  it("restores a revision-matched tenant from persistent IndexedDB without catalog downloads", async () => {
    const clientId = "client_delfi_persistent";
    const catalog = { clientId, materials: [], priceList: {}, marker: "persistent" };
    const revision = createRevision(clientId, "persistent");
    const persistent = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", persistent.factory);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/app-data/revision")) return createResponse({ revision });
      if (url.endsWith("/api/catalog/bootstrap")) return createResponse({ catalog });
      if (url.endsWith("/api/modules")) return createResponse({ modules: [] });
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const cold = await loadClientAppDataForApp(clientId);
    expect((cold.clientCatalog as unknown as { marker?: string }).marker).toBe("persistent");
    expect(getClientAppDataLoadSource(cold)).toBe("network");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.waitFor(() => expect(persistent.records.has(clientId)).toBe(true));

    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1" },
      sessionStorage: createStorage()
    });
    fetchMock.mockClear();
    const warm = await loadClientAppDataForApp(clientId);

    expect((warm.clientCatalog as unknown as { marker?: string }).marker).toBe("persistent");
    expect(getClientAppDataLoadSource(warm)).toBe("persistent_cache");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/app-data/revision");

    await clearClientAppDataCaches();
    expect(persistent.records.has(clientId)).toBe(false);
  });

  it("does not let an older tenant compression overwrite the newest tenant cache", async () => {
    const sessionStorage = createStorage(5 * 1024 * 1024);
    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1" },
      sessionStorage
    });
    const largeCatalog = {
      clientId: "client_large_old",
      materials: [],
      priceList: {},
      largePayload: "OLD-TENANT-CATALOG|".repeat(450_000)
    };
    const newestCatalog = { clientId: "client_newest", materials: [], priceList: {} };
    let requestedClientId = largeCatalog.clientId;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/catalog/bootstrap")) {
        return createResponse({ catalog: requestedClientId === largeCatalog.clientId ? largeCatalog : newestCatalog });
      }
      return createResponse({ modules: [] });
    }));

    await loadClientAppDataForApp(largeCatalog.clientId);
    requestedClientId = newestCatalog.clientId;
    await loadClientAppDataForApp(newestCatalog.clientId);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const stored = window.sessionStorage.getItem("arcigy.kitchen.clientAppData.v1");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!) as unknown).toMatchObject({ clientId: newestCatalog.clientId });
  }, 15_000);
});
