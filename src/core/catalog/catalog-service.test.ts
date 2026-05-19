import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import type { ClientContext } from "../client/client-context";
import { createFileClientCatalogRepository } from "./catalog-file-repository";
import { createSystemSeedClientCatalogRepository, getSystemSeedCatalog } from "./catalog-repository";
import { createClientCatalogService } from "./catalog-service";
import { validateClientCatalog } from "./catalog-validation";
import { getEnabledModuleDescriptors } from "./module-catalog";
import { getModuleDescriptors } from "../../modules/registry";

describe("ClientCatalog repository and service", () => {
  let projectRoot = "";
  const clientA: ClientContext = { userId: "user_a", clientId: "client_a", role: "owner" };
  const clientB: ClientContext = { userId: "user_b", clientId: "client_b", role: "owner" };

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), "client-catalog-"));
  });

  afterEach(async () => {
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  });

  it("ensureCatalogExists seeds tenant catalog under the client namespace", async () => {
    const repo = createFileClientCatalogRepository(projectRoot);
    const catalog = await repo.ensureCatalogExists(clientA);

    expect(catalog.clientId).toBe("client_a");
    const stored = JSON.parse(await readFile(path.join(projectRoot, "storage", "clients", "client_a", "catalog", "pricing.json"), "utf-8")) as { id: string };
    expect(stored.id).toBe(catalog.priceList.id);
  });

  it("ensureCatalogExists reads an existing stored catalog instead of replacing it with a new seed", async () => {
    const repo = createFileClientCatalogRepository(projectRoot);
    const catalog = await repo.ensureCatalogExists(clientA);
    catalog.priceList.prices["mat.board.body.dtd.grey.18"] = 4321;
    await repo.saveCatalog(clientA, catalog);

    const loaded = await repo.ensureCatalogExists(clientA);

    expect(loaded.priceList.prices["mat.board.body.dtd.grey.18"]).toBe(4321);
  });

  it("keeps client A and client B catalogs isolated", async () => {
    const repo = createFileClientCatalogRepository(projectRoot);
    const catalogA = await repo.ensureCatalogExists(clientA);
    const catalogB = await repo.ensureCatalogExists(clientB);
    catalogA.priceList.prices["mat.board.body.dtd.grey.18"] = 1234;
    catalogA.materials[0] = { ...catalogA.materials[0]!, displayName: "Client A Board" };

    await repo.saveCatalog(clientA, catalogA);

    const nextA = await repo.getCatalog(clientA);
    const nextB = await repo.getCatalog(clientB);
    expect(nextA.priceList.prices["mat.board.body.dtd.grey.18"]).toBe(1234);
    expect(nextB.priceList.prices["mat.board.body.dtd.grey.18"]).toBe(catalogB.priceList.prices["mat.board.body.dtd.grey.18"]);
    expect(nextA.materials[0]!.displayName).toBe("Client A Board");
    expect(nextB.materials[0]!.displayName).not.toBe("Client A Board");
  });

  it("service updates prices and exposes enabled modules", async () => {
    const repo = createSystemSeedClientCatalogRepository();
    const service = createClientCatalogService({ context: clientA, repository: repo });
    await service.updatePrice("mat.board.body.dtd.grey.18", 77);
    await service.setModuleEnabled("drawer_low", false);

    expect(await repo.getPrice(clientA, "mat.board.body.dtd.grey.18")).toBe(77);
    expect(service.getEnabledModules().some((module) => module.moduleType === "drawer_low")).toBe(false);
  });

  it("filters runtime module descriptors by enabled client modules", () => {
    const catalog = getSystemSeedCatalog();
    catalog.modules = catalog.modules.map((module) => module.moduleType === "drawer_low" ? { ...module, enabled: false } : module);
    const descriptors = getEnabledModuleDescriptors(catalog, getModuleDescriptors());

    expect(descriptors.some((descriptor) => descriptor.type === "drawer_low")).toBe(false);
    expect(descriptors.length).toBeGreaterThan(0);
  });

  it("returns enabled modules while keeping disabled modules out of the visible registry", () => {
    const catalog = getSystemSeedCatalog();
    catalog.modules = catalog.modules.map((module) =>
      module.moduleType === "drawer_low" ? { ...module, enabled: true } : { ...module, enabled: false }
    );

    const descriptors = getEnabledModuleDescriptors(catalog, getModuleDescriptors());

    expect(descriptors.map((descriptor) => descriptor.type)).toEqual(["drawer_low"]);
  });
});

describe("ClientCatalog validation", () => {
  it("rejects duplicate material ids", () => {
    const catalog = getSystemSeedCatalog();
    catalog.materials.push({ ...catalog.materials[0]! });
    expect(() => validateClientCatalog(catalog)).toThrow("duplicate material id");
  });

  it("rejects duplicate component ids", () => {
    const catalog = getSystemSeedCatalog();
    catalog.components.push({ ...catalog.components[0]! });
    expect(() => validateClientCatalog(catalog)).toThrow("duplicate component id");
  });

  it("rejects kitchen defaults with missing material", () => {
    const catalog = getSystemSeedCatalog();
    catalog.kitchenDefaults.carcassMaterialId = "missing_material";
    expect(() => validateClientCatalog(catalog)).toThrow("kitchenDefaults references missing catalog id");
  });

  it("rejects kitchen default components with the wrong component type", () => {
    const catalog = getSystemSeedCatalog();
    catalog.kitchenDefaults.defaultHandleComponentId = catalog.components.find((component) => component.componentType === "hinge")?.id;

    expect(() => validateClientCatalog(catalog)).toThrow("expected componentType handle");
  });

  it("rejects module pricingRef with missing price", () => {
    const catalog = getSystemSeedCatalog();
    catalog.modules[0] = { ...catalog.modules[0]!, pricingRef: "missing_price" };
    expect(() => validateClientCatalog(catalog)).toThrow("pricingRef references missing price");
  });

  it("does not save invalid catalogs", async () => {
    const repo = createSystemSeedClientCatalogRepository();
    const catalog = repo.getCatalogForClient("client_a");
    catalog.materials.push({ ...catalog.materials[0]! });
    await expect(repo.saveCatalog({ userId: "u", clientId: "client_a", role: "owner" }, catalog)).rejects.toThrow("duplicate material id");
  });
});
