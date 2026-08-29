import type http from "node:http";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import type { ClientCatalogRepository, ClientCatalogRevision } from "../core/catalog/catalog-repository";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ClientContext } from "../core/client/client-context";
import { handleClientCatalogBootstrapApi } from "./clientCatalogBootstrapEndpoint";
import { ClientCatalogBootstrapResponseCache } from "./clientCatalogBootstrapResponseCache";

function createCatalog(clientId: string, marker: string): ClientCatalog {
  return {
    clientId,
    materials: [],
    hardware: [],
    legacyMaterials: [],
    components: [],
    componentGeometry: [],
    modules: [],
    priceList: {
      id: "prices-test",
      name: "Test prices",
      currency: "EUR",
      isActive: true,
      prices: {}
    },
    kitchenDefaults: {},
    meta: {
      catalogVersion: 1,
      source: "client-custom",
      createdAt: "created",
      updatedAt: marker
    }
  };
}

function createRevision(value: string): ClientCatalogRevision {
  return {
    catalogVersion: 1,
    updatedAt: "2026-07-16T00:00:00.000Z",
    storageRevision: value
  };
}

function createResponse() {
  const headers = new Map<string, string | number | readonly string[]>();
  let body = Buffer.alloc(0);
  const response = {
    statusCode: 0,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    end(value?: string | Uint8Array) {
      body = value === undefined ? Buffer.alloc(0) : Buffer.from(value);
      return this;
    }
  } as unknown as http.ServerResponse;
  return { response, headers, getBody: () => body };
}

function compressedRequest(): http.IncomingMessage {
  return { method: "GET", headers: { "accept-encoding": "gzip" } } as http.IncomingMessage;
}

function createRepository(args: {
  getRevision(): Promise<ClientCatalogRevision | null>;
  ensureCatalogExists(): Promise<ClientCatalog>;
}): ClientCatalogRepository {
  return {
    getRevision: args.getRevision,
    ensureCatalogExists: args.ensureCatalogExists
  } as unknown as ClientCatalogRepository;
}

function readCompressedJson(response: ReturnType<typeof createResponse>): unknown {
  return JSON.parse(gunzipSync(response.getBody()).toString("utf-8")) as unknown;
}

describe("client catalog bootstrap response cache", () => {
  it("reuses the exact tenant response only while its authoritative revision matches", async () => {
    const context: ClientContext = { clientId: "client_cache", userId: "user_cache", role: "owner" };
    let revision = createRevision("revision-1");
    let catalog = createCatalog(context.clientId, "first");
    const ensureCatalogExists = vi.fn(async () => catalog);
    const repository = createRepository({
      getRevision: async () => revision,
      ensureCatalogExists
    });
    const cache = new ClientCatalogBootstrapResponseCache();
    const sendJson = vi.fn();
    const deps = {
      getContext: vi.fn(async () => context),
      createRepository: () => repository,
      responseCache: cache,
      sendJson
    };

    const first = createResponse();
    await handleClientCatalogBootstrapApi(
      compressedRequest(),
      first.response,
      new URL("http://localhost/api/catalog/bootstrap"),
      deps
    );
    const second = createResponse();
    await handleClientCatalogBootstrapApi(
      compressedRequest(),
      second.response,
      new URL("http://localhost/api/catalog/bootstrap"),
      deps
    );

    expect(ensureCatalogExists).toHaveBeenCalledOnce();
    expect(second.getBody()).toEqual(first.getBody());
    expect(second.headers.get("cache-control")).toBe("no-store");
    expect(second.headers.get("content-encoding")).toBe("gzip");
    expect(readCompressedJson(second)).toMatchObject({
      ok: true,
      view: "catalog-bootstrap-v1",
      catalog: { clientId: context.clientId, meta: { updatedAt: "first" } }
    });
    expect(sendJson).not.toHaveBeenCalled();

    revision = createRevision("revision-2");
    catalog = createCatalog(context.clientId, "second");
    const changed = createResponse();
    await handleClientCatalogBootstrapApi(
      compressedRequest(),
      changed.response,
      new URL("http://localhost/api/catalog/bootstrap"),
      deps
    );

    expect(ensureCatalogExists).toHaveBeenCalledTimes(2);
    expect(readCompressedJson(changed)).toMatchObject({
      catalog: { clientId: context.clientId, meta: { updatedAt: "second" } }
    });
  });

  it("never shares a cached payload between tenants with equal revision values", async () => {
    const cache = new ClientCatalogBootstrapResponseCache();
    const revision = createRevision("shared-looking-revision");
    const loadCounts = new Map<string, number>();
    let context: ClientContext = { clientId: "client_alpha", userId: "user_alpha", role: "owner" };
    const deps = {
      getContext: vi.fn(async () => context),
      createRepository: () => createRepository({
        getRevision: async () => revision,
        ensureCatalogExists: async () => {
          loadCounts.set(context.clientId, (loadCounts.get(context.clientId) ?? 0) + 1);
          return createCatalog(context.clientId, context.clientId);
        }
      }),
      responseCache: cache,
      sendJson: vi.fn()
    };

    const alpha = createResponse();
    await handleClientCatalogBootstrapApi(compressedRequest(), alpha.response, new URL("http://localhost/api/catalog/bootstrap"), deps);
    context = { clientId: "client_beta", userId: "user_beta", role: "owner" };
    const beta = createResponse();
    await handleClientCatalogBootstrapApi(compressedRequest(), beta.response, new URL("http://localhost/api/catalog/bootstrap"), deps);

    expect(readCompressedJson(alpha)).toMatchObject({ catalog: { clientId: "client_alpha" } });
    expect(readCompressedJson(beta)).toMatchObject({ catalog: { clientId: "client_beta" } });
    expect(loadCounts).toEqual(new Map([["client_alpha", 1], ["client_beta", 1]]));
  });

  it("coalesces simultaneous cold requests for one tenant and revision", async () => {
    const context: ClientContext = { clientId: "client_coalesce", userId: "user_coalesce", role: "owner" };
    const revision = createRevision("revision-coalesce");
    let releaseCatalog: ((catalog: ClientCatalog) => void) | undefined;
    const pendingCatalog = new Promise<ClientCatalog>((resolve) => {
      releaseCatalog = resolve;
    });
    const ensureCatalogExists = vi.fn(() => pendingCatalog);
    const deps = {
      getContext: vi.fn(async () => context),
      createRepository: () => createRepository({ getRevision: async () => revision, ensureCatalogExists }),
      responseCache: new ClientCatalogBootstrapResponseCache(),
      sendJson: vi.fn()
    };
    const first = createResponse();
    const second = createResponse();

    const requests = [first, second].map((target) => handleClientCatalogBootstrapApi(
      compressedRequest(),
      target.response,
      new URL("http://localhost/api/catalog/bootstrap"),
      deps
    ));
    await vi.waitFor(() => expect(ensureCatalogExists).toHaveBeenCalledOnce());
    releaseCatalog!(createCatalog(context.clientId, "coalesced"));
    await Promise.all(requests);

    expect(first.getBody()).toEqual(second.getBody());
    expect(readCompressedJson(first)).toMatchObject({ catalog: { clientId: context.clientId } });
  });

  it("preserves the existing uncompressed sendJson contract", async () => {
    const context: ClientContext = { clientId: "client_plain", userId: "user_plain", role: "owner" };
    const catalog = createCatalog(context.clientId, "plain");
    const sendJson = vi.fn();
    const handled = await handleClientCatalogBootstrapApi(
      { method: "GET", headers: {} } as http.IncomingMessage,
      {} as http.ServerResponse,
      new URL("http://localhost/api/catalog/bootstrap"),
      {
        getContext: async () => context,
        createRepository: () => createRepository({
          getRevision: async () => createRevision("revision-plain"),
          ensureCatalogExists: async () => catalog
        }),
        responseCache: new ClientCatalogBootstrapResponseCache(),
        sendJson
      }
    );

    expect(handled).toBe(true);
    expect(sendJson).toHaveBeenCalledWith({}, 200, expect.objectContaining({
      ok: true,
      view: "catalog-bootstrap-v1",
      catalog: expect.objectContaining({ clientId: context.clientId })
    }));
  });
});
