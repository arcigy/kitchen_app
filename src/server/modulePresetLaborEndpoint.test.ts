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

describe("preset labor HTTP boundary", () => {
  it("enforces tenant, viewer, value and revision checks while preserving a valid zero", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "labor-http-"));
    try {
      let context: ClientContext = { clientId: "labor-api", userId: "owner", role: "owner" };
      const repository = createFileModulePackageRepository(root);
      const catalog = createSystemSeedClientCatalogRepository();
      const source = structuredClone(systemModulePackageTemplates.find(p => p.module.moduleType === "fwm_catalog_base_drawers")!);
      source.integrity.packageHash = undefined;
      source.parameterPresets = { freeParameterKeys: [], presets: [{ presetId: "test", label: "Test", note: "Fixture", parameterValues: {}, laborRate: { amount: 200, currency: "CZK" } }] };
      const pkg = await repository.savePackage(context, source);
      const url = new URL(`http://localhost/api/modules/${pkg.module.modulePackageId}/parameter-presets/test/labor`);
      const request = { method: "PATCH", headers: {} } as http.IncomingMessage;
      const response = {} as http.ServerResponse;
      async function send(body: unknown) {
        let result: { status: number; data: unknown } | undefined;
        await handleModulePackageApi(request, response, url, {
          getContext: async () => context, createCatalogRepository: () => catalog,
          createModulePackageRepository: () => repository, responseCache: new ClientModulePackagesResponseCache(),
          readJsonBody: async () => body, sendJson: (_res, status, data) => { result = { status, data }; }
        });
        return result!;
      }
      const body = { expectedPackageHash: pkg.integrity.packageHash, laborRate: { amount: 0, currency: "CZK" } };
      expect((await send({ ...body, laborRate: { amount: -1, currency: "CZK" } })).status).toBe(422);
      expect((await send({ ...body, clientId: "another" })).status).toBe(403);
      context = { ...context, role: "viewer" }; expect((await send(body)).status).toBe(403);
      context = { ...context, role: "owner", clientId: "another" }; expect((await send(body)).status).toBe(422);
      context = { ...context, clientId: "labor-api" };
      expect((await send(body)).status).toBe(200);
      expect((await send(body)).status).toBe(409);
      expect((await repository.getPackage(context, pkg.module.modulePackageId))?.parameterPresets?.presets[0]?.laborRate).toEqual({ amount: 0, currency: "CZK" });
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 20_000);
});
