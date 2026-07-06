import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import type { ClientContext } from "../client/client-context";
import { createFileClientCatalogRepository } from "./catalog-file-repository";
import { createSystemSeedClientCatalogRepository, getSystemSeedCatalog } from "./catalog-repository";
import { createClientCatalogService } from "./catalog-service";
import { attachVendorModuleIntent } from "./vendor-module-intent";
import { validateClientCatalog } from "./catalog-validation";
import { getEnabledModuleDescriptors } from "./module-catalog";
import { getModuleDescriptors } from "../../modules/registry";
import { createPinoSideCabinetTenantPackage } from "../../system/module-packages/pinoSideCabinet";
import { createCatalogModuleDefinitionFromPackage } from "../module-package/module-package-catalog";

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
  }, 30_000);

  it("ensureCatalogExists reads an existing stored catalog instead of replacing it with a new seed", async () => {
    const repo = createFileClientCatalogRepository(projectRoot);
    const catalog = await repo.ensureCatalogExists(clientA);
    const materialId = catalog.materials[0]!.id;
    catalog.priceList.prices[materialId] = 4321;
    await repo.saveCatalog(clientA, catalog);

    const loaded = await repo.ensureCatalogExists(clientA);

    expect(loaded.priceList.prices[materialId]).toBe(4321);
  }, 30_000);

  it("persists vendorCatalog in the file repository roundtrip", async () => {
    const repo = createFileClientCatalogRepository(projectRoot);
    const catalog = await repo.ensureCatalogExists(clientA);
    catalog.vendorCatalog = {
      vendorId: "pino_nobilia",
      displayName: "PINO/Nobilia VKH 2026 CZ",
      source: "vkh_2026_cz_pdf",
      productVariants: [
        attachVendorModuleIntent({
          productTemplateId: "pino_side_cabinet_gb_fb_page245",
          sourcePdf: "VKH_2026_CZ.pdf",
          sourcePage: 245,
          articleCode: "GB03FB",
          articleFamily: "GB",
          widthCm: null,
          variantCode: "FB",
          variantCodeStatus: "extracted",
          catalogKey: "GB-FB",
          productTemplateName: "Bocni skrinka pro vestavne spotrebice",
          confidence: 0.95,
          needsReview: false
        })
      ],
      productTemplates: [],
      pricingReferences: [],
      extractionMeta: {
        sourcePdf: "VKH_2026_CZ.pdf",
        pages: [245],
        productVariants: 1,
        productTemplates: 0,
        pricingReferences: 0,
        importedAt: "2026-06-16T00:00:00.000Z",
        importStatus: "review_staging",
        productionImportApproved: false,
        notes: []
      }
    };
    await repo.saveCatalog(clientA, catalog);

    const loaded = await repo.getCatalog(clientA);

    expect(loaded.vendorCatalog?.productVariants[0]?.catalogKey).toBe("GB-FB");
    expect(loaded.vendorCatalog?.productVariants[0]?.moduleIntent?.placementZone).toBe("tall_appliance");
  }, 30_000);

  it("keeps client A and client B catalogs isolated", async () => {
    const repo = createFileClientCatalogRepository(projectRoot);
    const catalogA = await repo.ensureCatalogExists(clientA);
    const catalogB = await repo.ensureCatalogExists(clientB);
    const materialId = catalogA.materials[0]!.id;
    catalogA.priceList.prices[materialId] = 1234;
    catalogA.materials[0] = { ...catalogA.materials[0]!, displayName: "Client A Board" };

    await repo.saveCatalog(clientA, catalogA);

    const nextA = await repo.getCatalog(clientA);
    const nextB = await repo.getCatalog(clientB);
    expect(nextA.priceList.prices[materialId]).toBe(1234);
    expect(nextB.priceList.prices[materialId]).toBe(catalogB.priceList.prices[materialId]);
    expect(nextA.materials[0]!.displayName).toBe("Client A Board");
    expect(nextB.materials[0]!.displayName).not.toBe("Client A Board");
  }, 30_000);

  it("service updates prices and exposes enabled modules", async () => {
    const repo = createSystemSeedClientCatalogRepository();
    const service = createClientCatalogService({ context: clientA, repository: repo });
    const materialId = repo.getCatalogForClient(clientA.clientId).materials[0]!.id;
    await service.updatePrice(materialId, 77);
    await service.setModuleEnabled("drawer_low", false);

    expect(await repo.getPrice(clientA, materialId)).toBe(77);
    expect(service.getEnabledModules().some((module) => module.moduleType === "drawer_low")).toBe(false);
  }, 30_000);

  it("service resolves vendor module packages against the stored tenant catalog", async () => {
    const repo = createSystemSeedClientCatalogRepository();
    const service = createClientCatalogService({ context: clientA, repository: repo });
    const catalog = await service.loadCatalog();
    const sidePackage = createPinoSideCabinetTenantPackage();
    catalog.modules = [
      createCatalogModuleDefinitionFromPackage(sidePackage, {
        enabled: true,
        packageHash: "pinohash",
        catalog
      })
    ];
    catalog.vendorCatalog = {
      vendorId: "pino_nobilia",
      displayName: "PINO/Nobilia VKH 2026 CZ",
      source: "vkh_2026_cz_pdf",
      productVariants: [
        attachVendorModuleIntent({
          productTemplateId: "pino_side_cabinet_gb_fb_page245",
          sourcePdf: "VKH_2026_CZ.pdf",
          sourcePage: 245,
          articleCode: "GB03FB",
          articleFamily: "GB",
          widthCm: null,
          variantCode: "FB",
          variantCodeStatus: "extracted",
          catalogKey: "GB-FB",
          productTemplateName: "Bocni skrinka pro vestavne spotrebice",
          confidence: 0.95,
          needsReview: false
        })
      ],
      productTemplates: [],
      pricingReferences: [],
      extractionMeta: {
        sourcePdf: "VKH_2026_CZ.pdf",
        pages: [245],
        productVariants: 1,
        productTemplates: 0,
        pricingReferences: 0,
        importedAt: "2026-06-16T00:00:00.000Z",
        importStatus: "review_staging",
        productionImportApproved: false,
        notes: []
      }
    };
    await repo.saveCatalog(clientA, catalog);

    const resolution = await service.resolveVendorModulePackage({
      articleFamily: "GB",
      catalogKey: "GB-FB",
      moduleType: "pino_side_cabinet"
    });

    expect(resolution.status).toBe("resolved");
    expect(resolution.moduleType).toBe("pino_side_cabinet");
    expect(resolution.placementZone).toBe("tall_appliance");
    expect(resolution.requiresApplianceOpening).toBe(true);
  }, 30_000);

  it("service resolves vendor module parameter seeds against the stored tenant catalog", async () => {
    const repo = createSystemSeedClientCatalogRepository();
    const service = createClientCatalogService({ context: clientA, repository: repo });
    const catalog = await service.loadCatalog();
    catalog.vendorCatalog = {
      vendorId: "pino_nobilia",
      displayName: "PINO/Nobilia VKH 2026 CZ",
      source: "vkh_2026_cz_pdf",
      productVariants: [
        attachVendorModuleIntent({
          productTemplateId: "tpl_ua",
          sourcePdf: "VKH_2026_CZ.pdf",
          sourcePage: 99,
          articleCode: "UA60",
          articleFamily: "UA",
          widthCm: 60,
          widthMm: 600,
          variantCode: null,
          variantCodeStatus: "none_expected",
          catalogKey: "UA-60",
          productTemplateName: "Modul spodni skrinky; 1 vysuv",
          notes: ["1 vysuv"],
          confidence: 0.95,
          needsReview: false
        })
      ],
      productTemplates: [],
      pricingReferences: [],
      extractionMeta: {
        sourcePdf: "VKH_2026_CZ.pdf",
        pages: [99],
        productVariants: 1,
        productTemplates: 0,
        pricingReferences: 0,
        importedAt: "2026-06-16T00:00:00.000Z",
        importStatus: "review_staging",
        productionImportApproved: false,
        notes: []
      }
    };
    await repo.saveCatalog(clientA, catalog);

    const resolution = await service.resolveVendorModuleSeed({
      articleFamily: "UA",
      widthMm: 600
    });

    expect(resolution.status).toBe("resolved");
    expect(resolution.moduleType).toBe("drawer_low");
    expect((resolution.params as { drawerCount?: number; width?: number } | null)?.drawerCount).toBe(1);
    expect((resolution.params as { drawerCount?: number; width?: number } | null)?.width).toBe(600);
  }, 30_000);

  it("service exposes appliance host compatibility for PINO appliance side-cabinet seeds", async () => {
    const repo = createSystemSeedClientCatalogRepository();
    const service = createClientCatalogService({ context: clientA, repository: repo });
    const catalog = await service.loadCatalog();
    const sidePackage = createPinoSideCabinetTenantPackage();
    catalog.modules = [
      createCatalogModuleDefinitionFromPackage(sidePackage, {
        enabled: true,
        packageHash: "pinohash",
        catalog
      })
    ];
    catalog.vendorCatalog = {
      vendorId: "pino_nobilia",
      displayName: "PINO/Nobilia VKH 2026 CZ",
      source: "vkh_2026_cz_pdf",
      productVariants: [
        attachVendorModuleIntent({
          productTemplateId: "pino_side_cabinet_gb_fb_page245",
          sourcePdf: "VKH_2026_CZ.pdf",
          sourcePage: 245,
          articleCode: "GB03FB",
          articleFamily: "GB",
          widthCm: null,
          widthMm: 600,
          variantCode: "FB",
          variantCodeStatus: "extracted",
          catalogKey: "GB-FB",
          productTemplateName: "Bocni skrinka pro vestavne spotrebice",
          notes: ["1 sklapece dvirka", "Vyska vyklenku 590 mm", "1 otocna dvirka"],
          confidence: 0.95,
          needsReview: false
        })
      ],
      productTemplates: [],
      pricingReferences: [],
      extractionMeta: {
        sourcePdf: "VKH_2026_CZ.pdf",
        pages: [245],
        productVariants: 1,
        productTemplates: 0,
        pricingReferences: 0,
        importedAt: "2026-06-16T00:00:00.000Z",
        importStatus: "review_staging",
        productionImportApproved: false,
        notes: []
      }
    };
    await repo.saveCatalog(clientA, catalog);

    const resolution = await service.resolveVendorModuleSeed({
      articleFamily: "GB",
      catalogKey: "GB-FB",
      moduleType: "pino_side_cabinet",
      applianceCategory: "oven_tall",
      applianceWidthMm: 560,
      applianceHeightMm: 580
    });

    expect(resolution.status).toBe("needs_review");
    expect(resolution.moduleType).toBe("pino_side_cabinet");
    expect(resolution.applianceHostStatus).toBe("incompatible");
    expect(resolution.applianceHostValidation?.errors.join(" ")).toContain("exceeds opening width");
  }, 30_000);

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
