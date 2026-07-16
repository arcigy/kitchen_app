import type http from "node:http";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import type { ClientCatalogRepository } from "../core/catalog/catalog-repository";
import type { ClientContext } from "../core/client/client-context";
import type { ModulePackageRepository, ModulePackageRepositoryRevision } from "../core/module-package/module-package-repository";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { ClientModulePackagesResponseCache } from "./clientModulePackagesResponseCache";
import { handleModulePackageApi } from "./modulePackageEndpoint";

function revision(storageRevision: string): ModulePackageRepositoryRevision {
  return {
    count: 1,
    updatedAt: "2026-07-16T00:00:00.000Z",
    storageRevision
  };
}

function modulePackage(clientId: string): FurnQuoteModulePackage {
  return {
    format: "furnquote-module",
    module: {
      modulePackageId: `${clientId}-module`,
      moduleType: `${clientId}-type`
    }
  } as unknown as FurnQuoteModulePackage;
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
  return {
    response,
    headers,
    json: () => JSON.parse(gunzipSync(body).toString("utf-8")) as unknown,
    body: () => body
  };
}

function request(): http.IncomingMessage {
  return { method: "GET", headers: { "accept-encoding": "gzip" } } as http.IncomingMessage;
}

describe("module package list compressed response cache", () => {
  it("reuses only the exact authenticated tenant revision", async () => {
    let context: ClientContext = { clientId: "client_modules_a", userId: "user_a", role: "owner" };
    const revisions = new Map<string, ModulePackageRepositoryRevision>([
      ["client_modules_a", revision("revision-1")],
      ["client_modules_b", revision("revision-2")]
    ]);
    const listPackages = vi.fn(async (ctx: ClientContext) => [modulePackage(ctx.clientId)]);
    const repository = {
      getRevision: async (ctx: ClientContext) => revisions.get(ctx.clientId)!,
      listPackages
    } as unknown as ModulePackageRepository;
    const sendJson = vi.fn();
    const deps = {
      getContext: vi.fn(async () => context),
      createCatalogRepository: () => ({} as ClientCatalogRepository),
      createModulePackageRepository: () => repository,
      responseCache: new ClientModulePackagesResponseCache(),
      readJsonBody: vi.fn(),
      sendJson
    };

    const first = createResponse();
    await handleModulePackageApi(request(), first.response, new URL("http://localhost/api/modules"), deps);
    const repeated = createResponse();
    await handleModulePackageApi(request(), repeated.response, new URL("http://localhost/api/modules"), deps);

    expect(listPackages).toHaveBeenCalledOnce();
    expect(repeated.body()).toEqual(first.body());
    expect(repeated.headers.get("cache-control")).toBe("no-store");
    expect(repeated.json()).toMatchObject({ modules: [{ module: { modulePackageId: "client_modules_a-module" } }] });

    revisions.set(context.clientId, revision("revision-2"));
    const changed = createResponse();
    await handleModulePackageApi(request(), changed.response, new URL("http://localhost/api/modules"), deps);
    expect(listPackages).toHaveBeenCalledTimes(2);

    context = { clientId: "client_modules_b", userId: "user_b", role: "owner" };
    const otherTenant = createResponse();
    await handleModulePackageApi(request(), otherTenant.response, new URL("http://localhost/api/modules"), deps);
    expect(listPackages).toHaveBeenCalledTimes(3);
    expect(otherTenant.json()).toMatchObject({ modules: [{ module: { modulePackageId: "client_modules_b-module" } }] });
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("coalesces simultaneous cold list requests for one tenant revision", async () => {
    const context: ClientContext = { clientId: "client_modules_coalesce", userId: "user", role: "owner" };
    const currentRevision = revision("coalesce");
    let release: ((packages: FurnQuoteModulePackage[]) => void) | undefined;
    const pending = new Promise<FurnQuoteModulePackage[]>((resolve) => {
      release = resolve;
    });
    const listPackages = vi.fn(() => pending);
    const repository = {
      getRevision: async () => currentRevision,
      listPackages
    } as unknown as ModulePackageRepository;
    const deps = {
      getContext: async () => context,
      createCatalogRepository: () => ({} as ClientCatalogRepository),
      createModulePackageRepository: () => repository,
      responseCache: new ClientModulePackagesResponseCache(),
      readJsonBody: vi.fn(),
      sendJson: vi.fn()
    };
    const first = createResponse();
    const second = createResponse();
    const requests = [first, second].map((target) => handleModulePackageApi(
      request(),
      target.response,
      new URL("http://localhost/api/modules"),
      deps
    ));

    await vi.waitFor(() => expect(listPackages).toHaveBeenCalledOnce());
    release!([modulePackage(context.clientId)]);
    await Promise.all(requests);

    expect(first.body()).toEqual(second.body());
  });
});
