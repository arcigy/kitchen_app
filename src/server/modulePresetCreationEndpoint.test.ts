import type http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handleModulePackageApi } from "./modulePackageEndpoint";
import { ClientModulePackagesResponseCache } from "./clientModulePackagesResponseCache";
import { createFileModulePackageRepository } from "../core/module-package/module-package-repository";
import { createSystemSeedClientCatalogRepository } from "../core/catalog/catalog-repository";
import { systemModulePackageTemplates } from "../system/module-packages";
import type { ClientContext } from "../core/client/client-context";

describe("preset creation HTTP boundary", () => {
  it("validates the payload, isolates users and tenants, and returns the same preset on a retry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "preset-create-http-"));
    try {
      let context: ClientContext = { clientId: "creation-http", userId: "owner", role: "owner" };
      const repository = createFileModulePackageRepository(root);
      const catalog = createSystemSeedClientCatalogRepository();
      const source = structuredClone(systemModulePackageTemplates.find(p => p.module.moduleType === "fwm_catalog_base_drawers")!);
      const pkg = await repository.savePackage(context, source);
      const url = new URL(`http://localhost/api/modules/${pkg.module.modulePackageId}/parameter-presets`);
      const request = { method: "POST", headers: {} } as http.IncomingMessage;
      const response = {} as http.ServerResponse;
      const send = async (body: unknown) => {
        let status = 0; let result: unknown;
        await handleModulePackageApi(request, response, url, {
          getContext: async () => context, createCatalogRepository: () => catalog,
          createModulePackageRepository: () => repository, responseCache: new ClientModulePackagesResponseCache(),
          readJsonBody: async () => body, sendJson: (_res, code, data) => { status = code; result = data; }
        });
        return { status, result };
      };
      const body = { name: "Fixture", note: "Configuration", parameters: { drawerCount: 2, hasDoors: false },
        expectedPackageHash: pkg.integrity.packageHash, operationId: "http_creation_operation" };
      for (const invalid of [null, [], { ...body, parameters: [] }, { ...body, parameters: null }, { ...body, name: " " },
        { ...body, note: " " }, { ...body, operationId: 123 }, { ...body, operationId: "bad" },
        { ...body, laborRate: { amount: -1, currency: "EUR" } }, { ...body, parameters: { drawerCount: "2" } },
        { ...body, parameters: { hasDoors: "false" } }]) {
        expect((await send(invalid)).status).toBe(422);
        expect(await repository.getPackage(context, body.parameters ? pkg.module.modulePackageId : "missing")).toEqual(pkg);
      }
      for (const clientId of ["other", null, 1, false]) expect((await send({ ...body, clientId })).status).toBe(403);
      context = { ...context, role: "viewer" }; expect((await send(body)).status).toBe(403);
      context = { ...context, role: "owner", clientId: "other" }; expect((await send(body)).status).toBe(422);
      context = { ...context, clientId: "creation-http" };
      const first = await send(body); expect(first.status).toBe(201);
      const retry = await send(body); expect(retry.status).toBe(201); expect(retry.result).toEqual(first.result);
      expect((await send({ ...body, note: "Changed" })).status).toBe(409);
      expect((await send({ ...body, operationId: "another_http_operation" })).status).toBe(409);
      context = { ...context, userId: "other-user" }; expect((await send(body)).status).toBe(409);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 20_000);
});
