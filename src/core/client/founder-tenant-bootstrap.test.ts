import { describe, expect, it } from "vitest";
import type { ClientCatalog } from "../catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../module-package/module-package-types";
import {
  cloneFounderTenantCatalog,
  cloneFounderTenantPackages,
  summarizeFounderTenantBootstrap
} from "./founder-tenant-bootstrap";

describe("founder tenant bootstrap", () => {
  it("copies every catalog module and package into an isolated tenant catalog", () => {
    const source = {
      clientId: "client_delfi",
      modules: [{ modulePackageId: "base_corner", enabled: true }],
      meta: {
        catalogVersion: 1,
        source: "client-custom",
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
        lastSynchronizedAt: "2026-08-01T12:00:00.000Z"
      }
    } as ClientCatalog;
    const sourcePackages = [{ module: { modulePackageId: "base_corner" } }] as FurnQuoteModulePackage[];
    const target = cloneFounderTenantCatalog({
      source,
      targetClientId: "client_arcigy_founder",
      now: "2026-08-30T12:00:00.000Z"
    });
    const packages = cloneFounderTenantPackages(sourcePackages);
    const summary = summarizeFounderTenantBootstrap({
      sourceClientId: "client_delfi",
      targetClientId: target.clientId,
      catalog: target,
      packages
    });

    expect(target.clientId).toBe("client_arcigy_founder");
    expect(target.modules).toEqual(source.modules);
    expect(target.meta.source).toBe("client-custom");
    expect(target.meta.createdAt).toBe("2026-08-30T12:00:00.000Z");
    expect(target.meta.lastSynchronizedAt).toBeUndefined();
    expect(packages).toEqual(sourcePackages);
    expect(packages[0]).not.toBe(sourcePackages[0]);
    expect(summary.catalogModuleCount).toBe(source.modules.length);
    expect(summary.modulePackageCount).toBe(1);
  });
});
