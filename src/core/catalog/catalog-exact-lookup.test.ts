import { describe, expect, it } from "vitest";
import type { ClientContext } from "../client/client-context";
import { createSystemCatalogSeed } from "./catalog-bootstrap";
import {
  createSystemSeedClientCatalogRepository,
  findCatalogComponentByCode,
  findCatalogMaterialByCode,
  type ClientCatalogRepository
} from "./catalog-repository";
import {
  CatalogExactLookupCache,
  createCatalogExactLookupService,
  invalidateCatalogExactLookupCaches
} from "./catalog-exact-lookup";

const clientA: ClientContext = { userId: "user-a", clientId: "client-a", role: "owner" };
const clientB: ClientContext = { userId: "user-b", clientId: "client-b", role: "owner" };

function createRepository() {
  const catalog = { clientId: "client-test", ...createSystemCatalogSeed() };
  const material = {
    ...catalog.materials[0]!,
    materialCode: "MAT-001",
    supplierSource: { supplier: "system" as const, supplierProductId: "SUP-MAT-001" },
    isActive: false
  };
  const component = {
    ...catalog.components[0]!,
    componentCode: "CMP-001",
    supplierSource: { supplier: "system" as const, supplierProductId: "SUP-CMP-001" },
    isActive: false
  };
  const calls = { materials: 0, components: 0, prices: 0 };
  const repository = {
    async getMaterialByCode(ctx: ClientContext, code: string) {
      calls.materials += 1;
      return [material.id, material.materialCode, material.supplierSource.supplierProductId].includes(code)
        ? { ...material, displayName: `${material.displayName}:${ctx.clientId}` }
        : null;
    },
    async getComponentByCode(ctx: ClientContext, code: string) {
      calls.components += 1;
      return [component.id, component.componentCode, component.supplierSource.supplierProductId].includes(code)
        ? { ...component, displayName: `${component.displayName}:${ctx.clientId}` }
        : null;
    },
    async getPrice(_ctx: ClientContext, id: string) {
      calls.prices += 1;
      return id === material.id ? 23.4 : id === component.id ? 4.5 : null;
    }
  } as ClientCatalogRepository;
  return { repository, material, component, calls };
}

describe("catalog exact lookup", () => {
  it("returns inactive entities with their unit price and caches per tenant", async () => {
    const { repository, material, component, calls } = createRepository();
    const cache = new CatalogExactLookupCache();
    const service = createCatalogExactLookupService({ repository, cache });

    const first = await service.lookupMaterial(clientA, material.materialCode);
    const repeated = await service.lookupMaterial(clientA, ` ${material.materialCode} `);
    const otherTenant = await service.lookupMaterial(clientB, material.materialCode);
    const componentResult = await service.lookupComponent(clientA, component.supplierSource.supplierProductId);

    expect(first.material).toMatchObject({ id: material.id, isActive: false });
    expect(first.unitPrice).toBe(23.4);
    expect(repeated).toEqual(first);
    expect(otherTenant.material?.displayName).toContain(clientB.clientId);
    expect(componentResult).toMatchObject({ component: { id: component.id, isActive: false }, unitPrice: 4.5 });
    expect(calls).toEqual({ materials: 2, components: 1, prices: 3 });
  });

  it("uses a shorter negative TTL and enforces least-recently-used capacity", async () => {
    let now = 1_000;
    const { repository, material, component, calls } = createRepository();
    const cache = new CatalogExactLookupCache({ maxEntries: 2, ttlMs: 1_000, missingTtlMs: 10, now: () => now });
    const service = createCatalogExactLookupService({ repository, cache });

    await service.lookupMaterial(clientA, "missing");
    await service.lookupMaterial(clientA, "missing");
    expect(calls.materials).toBe(1);
    now += 11;
    await service.lookupMaterial(clientA, "missing");
    expect(calls.materials).toBe(2);

    await service.lookupMaterial(clientA, material.id);
    await service.lookupComponent(clientA, component.id);
    expect(cache.size).toBe(2);
    await service.lookupMaterial(clientA, "missing");
    expect(calls.materials).toBe(4);
  });

  it("resolves internal, catalog, and supplier codes in the in-memory repository with ID priority", async () => {
    const repository = createSystemSeedClientCatalogRepository();
    const catalog = await repository.ensureCatalogExists(clientA);
    const firstMaterial = catalog.materials[0]!;
    const secondMaterial = catalog.materials[1]!;
    const firstComponent = catalog.components[0]!;
    catalog.materials[0] = {
      ...firstMaterial,
      materialCode: secondMaterial.id,
      supplierSource: { supplier: "system", supplierProductId: "supplier-material-code" }
    };
    catalog.components[0] = {
      ...firstComponent,
      componentCode: "component-code",
      supplierSource: { supplier: "system", supplierProductId: "supplier-component-code" }
    };
    await repository.saveCatalog(clientA, catalog);

    await expect(repository.getMaterialByCode(clientA, secondMaterial.id)).resolves.toMatchObject({ id: secondMaterial.id });
    await expect(repository.getMaterialByCode(clientA, "supplier-material-code")).resolves.toMatchObject({ id: firstMaterial.id });
    await expect(repository.getComponentByCode(clientA, "component-code")).resolves.toMatchObject({ id: firstComponent.id });
    await expect(repository.getComponentByCode(clientA, "supplier-component-code")).resolves.toMatchObject({ id: firstComponent.id });
  }, 15_000);

  it("rejects ambiguous exact aliases and treats wildcard characters literally", () => {
    const seed = createSystemCatalogSeed();
    const materialBase = seed.materials[0]!;
    const componentBase = seed.components[0]!;
    const supplierMaterial = (id: string, supplierProductId: string) => ({
      ...materialBase,
      id,
      supplierSource: { supplier: "test", supplierProductId }
    });
    const supplierComponent = (id: string, supplierProductId: string) => ({
      ...componentBase,
      id,
      supplierSource: { supplier: "test", supplierProductId }
    });

    expect(findCatalogMaterialByCode([
      supplierMaterial("mat.vendor.one", "ALIAS"),
      supplierMaterial("mat.vendor.much-longer", "ALIAS")
    ], "ALIAS")).toBeNull();
    expect(findCatalogMaterialByCode([
      supplierMaterial("mat.A_1", "A_1"),
      supplierMaterial("mat.vendor.A_1", "A_1"),
      supplierMaterial("mat.AX1", "A_1")
    ], "A_1")).toMatchObject({ id: "mat.A_1" });
    expect(findCatalogMaterialByCode([
      supplierMaterial("mat.x.A%1", "A%1"),
      supplierMaterial("mat.y.A%1", "A%1")
    ], "A%1")).toBeNull();

    expect(findCatalogComponentByCode([
      supplierComponent("cmp.vendor.one", "ALIAS"),
      supplierComponent("cmp.vendor.much-longer", "ALIAS")
    ], "ALIAS")).toBeNull();
    expect(findCatalogComponentByCode([
      supplierComponent("cmp.A_1", "A_1"),
      supplierComponent("cmp.vendor.A_1", "A_1"),
      supplierComponent("cmp.AX1", "A_1")
    ], "A_1")).toMatchObject({ id: "cmp.A_1" });
  });

  it("invalidates tenant lookup results after a catalog price update", async () => {
    const repository = createSystemSeedClientCatalogRepository();
    const catalog = await repository.ensureCatalogExists(clientA);
    const material = catalog.materials[0]!;
    const cache = new CatalogExactLookupCache({ ttlMs: 60_000 });
    const service = createCatalogExactLookupService({ repository, cache });
    const before = await service.lookupMaterial(clientA, material.id);
    const nextPrice = (before.unitPrice ?? 0) + 10;
    catalog.priceList.prices[material.id] = nextPrice;

    await repository.saveCatalog(clientA, catalog);

    await expect(service.lookupMaterial(clientA, material.id)).resolves.toMatchObject({ unitPrice: nextPrice });
  }, 15_000);

  it("retries an in-flight lookup invalidated between the entity and price reads", async () => {
    const seed = createSystemCatalogSeed();
    const baseMaterial = seed.materials[0]!;
    let version = 1;
    let materialReads = 0;
    let priceReads = 0;
    const repository = {
      async getMaterialByCode(_ctx: ClientContext, code: string) {
        materialReads += 1;
        return code === baseMaterial.id
          ? { ...baseMaterial, displayName: `Version ${version}` }
          : null;
      },
      async getPrice() {
        priceReads += 1;
        if (priceReads === 1) {
          version = 2;
          invalidateCatalogExactLookupCaches(clientA.clientId);
        }
        return version * 10;
      }
    } as unknown as ClientCatalogRepository;
    const service = createCatalogExactLookupService({
      repository,
      cache: new CatalogExactLookupCache({ ttlMs: 60_000 })
    });

    await expect(service.lookupMaterial(clientA, baseMaterial.id)).resolves.toMatchObject({
      material: { displayName: "Version 2" },
      unitPrice: 20
    });
    expect(materialReads).toBe(2);
    expect(priceReads).toBe(2);
  });

  it("releases registered lookup state when a worker lifecycle disposes its cache", () => {
    const cache = new CatalogExactLookupCache({ ttlMs: 60_000 });
    cache.set(clientA.clientId, "material", "material-code", {
      kind: "material",
      value: { material: null, unitPrice: null }
    });
    expect(cache.size).toBe(1);

    cache.dispose();

    expect(cache.size).toBe(0);
    expect(cache.get(clientA.clientId, "material", "material-code")).toBeUndefined();
    cache.set(clientA.clientId, "material", "material-code", {
      kind: "material",
      value: { material: null, unitPrice: null }
    });
    expect(cache.size).toBe(0);
  });
});
