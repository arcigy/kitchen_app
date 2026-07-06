import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import { systemModulePackageTemplates } from "../system/module-packages";
import { loadClientAppDataForApp, loadClientCatalogForApp } from "./catalogLoader";

function createStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
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

function createResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}

describe("catalogLoader PINO tenant loading", () => {
  beforeEach(() => {
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
    const fetchMock = vi.fn(async () => createResponse({ catalog: serverCatalog }));
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await loadClientCatalogForApp("client_pino_nobilia_vkh_2026");

    expect(catalog.clientId).toBe("client_pino_nobilia_vkh_2026");
    expect(fetchMock).toHaveBeenCalledOnce();
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
      if (url.endsWith("/api/catalog")) return createResponse({ catalog: pinoCatalog });
      if (url.endsWith("/api/modules")) return createResponse({ modules: systemModulePackageTemplates.slice(0, 1) });
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await loadClientAppDataForApp("client_pino_nobilia_vkh_2026");

    expect(data.clientCatalog.clientId).toBe("client_pino_nobilia_vkh_2026");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15_000);
});
