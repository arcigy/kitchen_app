import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type http from "node:http";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { createStorageService } from "../core/storage/storageService";
import { getProjectMetaPath } from "../core/storage/project-ownership";
import { createInMemoryUserRepository, seedAuthUsers } from "../core/auth/user-repository";
import { createUserService, type UserService } from "../core/auth/user-service";
import { CLIENT_SESSION_COOKIE, serializeClientSessionCookie } from "../core/client/session-cookie";
import { attachVendorModuleIntent } from "../core/catalog/vendor-module-intent";
import { createCatalogModuleDefinitionFromPackage } from "../core/module-package/module-package-catalog";
import { startWorkerServer } from "./workerServer";
import cornerShelfLowerFixture from "../core/module-package/fixtures/cornerShelfLower.fqm.source.json";
import { createPinoSideCabinetTenantPackage } from "../system/module-packages/pinoSideCabinet";

vi.mock("./blender/runBlenderExport", () => ({
  runBlenderExport: async (args: {
    storage: { getRenderPath: (fileName: string) => string };
    sceneFileName: string;
    blendFileName: string;
    previewFileName: string;
  }) => {
    const jsonPath = args.storage.getRenderPath(args.sceneFileName);
    const blendPath = args.storage.getRenderPath(args.blendFileName);
    const previewPath = args.storage.getRenderPath(args.previewFileName);
    await mkdir(path.dirname(previewPath), { recursive: true });
    await writeFile(jsonPath, JSON.stringify({ ok: true }), "utf-8");
    await writeFile(blendPath, "mock blend", "utf-8");
    await writeFile(previewPath, "mock preview", "utf-8");
    return {
      jsonPath,
      blendPath,
      previewPath,
      exitCode: 0,
      stdout: "",
      stderr: ""
    };
  }
}));

type WorkerServerController = {
  server: http.Server;
  port: number;
  projectRoot: string;
};

const makeSessionCookie = (input: {
  userId: string;
  clientId: string;
  role: "owner" | "admin" | "designer" | "viewer";
}) => {
  return serializeClientSessionCookie({
    version: 1,
    userId: input.userId,
    clientId: input.clientId,
    role: input.role,
    displayName: input.userId,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
};

const makeCookieHeader = (input: {
  userId: string;
  clientId: string;
  role: "owner" | "admin" | "designer" | "viewer";
}) => makeSessionCookie(input);

const readResponse = async (res: Response) => {
  const bodyText = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }
  return { status: res.status, body, text: bodyText, headers: res.headers };
};

const requestWorker = async (
  port: number,
  urlPath: string,
  options: {
    cookie?: string;
    method?: string;
    body?: unknown;
  } = {}
) => {
  const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return readResponse(res);
};

const seedRenderFixture = async (
  projectRoot: string,
  clientId: string,
  projectId: string,
  phaseId: string,
  fileName: string,
  userId: string
) => {
  const storage = await createStorageService({
    projectRoot,
    context: { userId, clientId, role: "owner" },
    projectId,
    phaseId
  });
  return await storage.writeJson("renders", fileName, { seeded: true });
};

const seedLegacyRenderFixture = async (
  projectRoot: string,
  clientId: string,
  projectId: string,
  phaseId: string,
  fileName: string
) => {
  const filePath = path.join(projectRoot, "storage", "clients", clientId, "projects", projectId, "phases", phaseId, "renders", fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({ legacy: true }), "utf-8");
  return filePath;
};

const fileExists = async (filePath: string) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const createServer = async (projectRoot: string, userService: UserService): Promise<WorkerServerController> => {
  const server = startWorkerServer(0, "127.0.0.1", { userService, projectRoot });
  const [listening] = await once(server, "listening");
  const address = (server.address() ?? listening) as AddressInfo;
  const port = typeof address.port === "number" ? address.port : Number(process.env.BLENDER_WORKER_PORT);
  return { server, port, projectRoot };
};

describe("multi-client worker isolation", () => {
  let controller: WorkerServerController | null = null;
  let projectRoot = "";
  const previousLegacyRead = process.env.ALLOW_LEGACY_PROJECT_READ;
  const previousNodeEnv = process.env.NODE_ENV;
  const users = [
    ...seedAuthUsers,
    {
      userId: "user_client_b_owner",
      username: "clientb",
      displayName: "Client B",
      passwordHash: seedAuthUsers[0].passwordHash,
      clientId: "client_b_demo",
      role: "owner" as const,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      userId: "user_client_a_inactive",
      username: "inactive-client-a",
      displayName: "Inactive",
      passwordHash: seedAuthUsers[0].passwordHash,
      clientId: "client_a_inactive",
      role: "viewer" as const,
      isActive: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ] as const;
  const activeUserService = createUserService(createInMemoryUserRepository(users));

  const start = async () => {
    projectRoot = await createTempProjectRoot();
    controller = await createServer(projectRoot, activeUserService);
  };

  beforeEach(async () => {
    process.env.AUTH_SESSION_SECRET = "test-auth-secret";
    process.env.PROJECT_FILE_SECRET = "test-project-file-secret";
    delete process.env.ALLOW_LEGACY_PROJECT_READ;
    await start();
  });

  afterEach(async () => {
    if (controller) {
      const done = await new Promise<void>((resolve) => {
        controller!.server.close(() => resolve());
      });
      void done;
      controller = null;
    }
    if (projectRoot) {
      await rm(projectRoot, { recursive: true, force: true });
      projectRoot = "";
    }
    if (previousLegacyRead === undefined) delete process.env.ALLOW_LEGACY_PROJECT_READ;
    else process.env.ALLOW_LEGACY_PROJECT_READ = previousLegacyRead;
    process.env.NODE_ENV = previousNodeEnv;
    delete process.env.PROJECT_FILE_SECRET;
  });

  it("rejects unauthenticated request to client-scoped storage endpoint", async () => {
    const clientAFile = await seedRenderFixture(projectRoot, "client_a_demo", "project-a", "phase-a", "a.json", "user_arcigy_owner");
    await access(clientAFile);
    const response = await requestWorker(controller!.port, "/storage/clients/client_a_demo/projects/project-a/phases/phase-a/renders/a.json");
    expect(response.status).toBe(401);
  });

  it("loads client catalog from server session and stores it in the client namespace", async () => {
    const response = await requestWorker(controller!.port, "/api/catalog", {
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" })
    });

    expect(response.status).toBe(200);
    const body = response.body as { catalog?: { clientId?: string; priceList?: { prices?: Record<string, number> } } };
    expect(body.catalog?.clientId).toBe("client_arcigy_demo");
    const storedPath = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "catalog", "pricing.json");
    const stored = JSON.parse(await readFile(storedPath, "utf-8")) as { prices?: Record<string, number> };
    const priceId = Object.keys(stored.prices ?? {})[0]!;
    expect(stored.prices?.[priceId]).toBe(body.catalog?.priceList?.prices?.[priceId]);
  }, 60_000);

  it("looks up catalog materials by exact ID and board family", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const catalogResponse = await requestWorker(controller!.port, "/api/catalog", { cookie });
    const catalog = (catalogResponse.body as { catalog?: { materials?: Array<{ id: string; boardFamily?: string }> } }).catalog;
    const frontMaterial = catalog?.materials?.find((material) => material.boardFamily === "front");
    expect(frontMaterial?.id).toBeTruthy();

    const ok = await requestWorker(
      controller!.port,
      `/api/catalog/lookup?kind=material&family=front&id=${encodeURIComponent(frontMaterial!.id)}`,
      { cookie }
    );
    expect(ok.status).toBe(200);
    expect((ok.body as { material?: { id?: string } }).material?.id).toBe(frontMaterial!.id);

    const wrongFamily = await requestWorker(
      controller!.port,
      `/api/catalog/lookup?kind=material&family=body&id=${encodeURIComponent(frontMaterial!.id)}`,
      { cookie }
    );
    expect(wrongFamily.status).toBe(404);
  }, 30_000);

  it("resolves tenant vendor module lookup inside the current client catalog namespace", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const catalogResponse = await requestWorker(controller!.port, "/api/catalog", { cookie });
    const catalog = (catalogResponse.body as { catalog?: { priceList?: { id: string; name: string; currency: "EUR"; isActive: boolean; prices: Record<string, number> } } }).catalog;
    expect(catalog?.priceList?.prices).toBeTruthy();

    const clientCatalogDir = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "catalog");
    const sidePackage = createPinoSideCabinetTenantPackage();
    const modules = [
      createCatalogModuleDefinitionFromPackage(sidePackage, {
        enabled: true,
        packageHash: "pinohash",
        catalog: { priceList: catalog!.priceList! }
      })
    ];
    const vendorCatalog = {
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
    await writeFile(path.join(clientCatalogDir, "modules.json"), `${JSON.stringify(modules, null, 2)}\n`, "utf-8");
    await writeFile(path.join(clientCatalogDir, "vendorCatalog.json"), `${JSON.stringify(vendorCatalog, null, 2)}\n`, "utf-8");

    const response = await requestWorker(
      controller!.port,
      "/api/catalog/lookup?kind=vendor_module&moduleType=pino_side_cabinet&articleFamily=GB&catalogKey=GB-FB",
      { cookie }
    );

    expect(response.status).toBe(200);
    const resolution = (response.body as { resolution?: { status?: string; moduleType?: string; placementZone?: string; requiresApplianceOpening?: boolean } }).resolution;
    expect(resolution?.status).toBe("resolved");
    expect(resolution?.moduleType).toBe("pino_side_cabinet");
    expect(resolution?.placementZone).toBe("tall_appliance");
    expect(resolution?.requiresApplianceOpening).toBe(true);
  }, 30_000);

  it("resolves tenant vendor module seed lookup inside the current client catalog namespace", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    await requestWorker(controller!.port, "/api/catalog", { cookie });

    const clientCatalogDir = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "catalog");
    const vendorCatalog = {
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
    await writeFile(path.join(clientCatalogDir, "vendorCatalog.json"), `${JSON.stringify(vendorCatalog, null, 2)}\n`, "utf-8");

    const response = await requestWorker(
      controller!.port,
      "/api/catalog/lookup?kind=vendor_module_seed&articleFamily=UA&widthMm=600",
      { cookie }
    );

    expect(response.status).toBe(200);
    const resolution = (response.body as { resolution?: { status?: string; moduleType?: string; params?: { width?: number; drawerCount?: number } } }).resolution;
    expect(resolution?.status).toBe("resolved");
    expect(resolution?.moduleType).toBe("drawer_low");
    expect(resolution?.params?.width).toBe(600);
    expect(resolution?.params?.drawerCount).toBe(1);
  }, 30_000);

  it("returns appliance host incompatibility for oversized PINO appliance side-cabinet lookups", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const catalogResponse = await requestWorker(controller!.port, "/api/catalog", { cookie });
    const catalog = (catalogResponse.body as { catalog?: { priceList?: { id: string; name: string; currency: "EUR"; isActive: boolean; prices: Record<string, number> } } }).catalog;
    const clientCatalogDir = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "catalog");
    const sidePackage = createPinoSideCabinetTenantPackage();
    const modules = [
      createCatalogModuleDefinitionFromPackage(sidePackage, {
        enabled: true,
        packageHash: "pinohash",
        catalog: { priceList: catalog!.priceList! }
      })
    ];
    const vendorCatalog = {
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
    await writeFile(path.join(clientCatalogDir, "modules.json"), `${JSON.stringify(modules, null, 2)}\n`, "utf-8");
    await writeFile(path.join(clientCatalogDir, "vendorCatalog.json"), `${JSON.stringify(vendorCatalog, null, 2)}\n`, "utf-8");

    const response = await requestWorker(
      controller!.port,
      "/api/catalog/lookup?kind=vendor_module_seed&moduleType=pino_side_cabinet&articleFamily=GB&catalogKey=GB-FB&applianceCategory=oven_tall&applianceWidthMm=560&applianceHeightMm=580",
      { cookie }
    );

    expect(response.status).toBe(200);
    const resolution = (response.body as {
      resolution?: {
        status?: string;
        moduleType?: string;
        applianceHostStatus?: string;
        applianceHostValidation?: { valid?: boolean; errors?: string[] };
      };
    }).resolution;
    expect(resolution?.status).toBe("needs_review");
    expect(resolution?.moduleType).toBe("pino_side_cabinet");
    expect(resolution?.applianceHostStatus).toBe("incompatible");
    expect(resolution?.applianceHostValidation?.valid).toBe(false);
    expect(resolution?.applianceHostValidation?.errors?.join(" ")).toContain("exceeds opening width");
  }, 30_000);

  it("lists grouped tenant vendor catalog templates for group -> product -> width browsing", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    await requestWorker(controller!.port, "/api/catalog", { cookie });

    const clientCatalogDir = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "catalog");
    const vendorCatalog = {
      vendorId: "pino_nobilia",
      displayName: "PINO/Nobilia VKH 2026 CZ",
      source: "vkh_2026_cz_pdf",
      productVariants: [
        attachVendorModuleIntent({
          productTemplateId: "tpl_ua",
          sourcePdf: "VKH_2026_CZ.pdf",
          sourcePage: 99,
          articleCode: "UA45",
          articleFamily: "UA",
          widthCm: 45,
          widthMm: 450,
          variantCode: null,
          variantCodeStatus: "none_expected",
          catalogKey: "UA-45",
          productTemplateName: "Modul spodni skrinky; 1 vysuv",
          notes: ["1 vysuv"],
          mainGroup: "Spodni skrinky",
          subGroup: "Zasuvkove",
          confidence: 0.95,
          needsReview: false
        }),
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
          mainGroup: "Spodni skrinky",
          subGroup: "Zasuvkove",
          confidence: 0.95,
          needsReview: false
        }),
        {
          ...attachVendorModuleIntent({
          productTemplateId: "tpl_gb",
          sourcePdf: "VKH_2026_CZ.pdf",
          sourcePage: 245,
          articleCode: "GB03FB",
          articleFamily: "GB",
          widthCm: null,
          widthMm: null,
          variantCode: "FB",
          variantCodeStatus: "extracted",
          catalogKey: "GB-FB",
          productTemplateName: "Bocni skrinka pro vestavne spotrebice",
          notes: [],
          mainGroup: "Bocni skrinky",
          subGroup: "Spotrebice",
          confidence: 0.95,
          needsReview: true
        }),
          moduleIntent: {
            moduleClass: "appliance_tall",
            kitchenModuleRole: "tall",
            placementZone: "tall_appliance",
            requiresWorktop: false,
            requiresCorner: false,
            requiresApplianceOpening: true,
            requiresWallAttachment: true,
            builderKeyCandidates: ["pinoSideCabinet.v1"],
            featureTags: ["side_cabinet", "appliance_tall"],
            notes: ["Test appliance group"]
          }
        }
      ],
      productTemplates: [],
      pricingReferences: [],
      extractionMeta: {
        sourcePdf: "VKH_2026_CZ.pdf",
        pages: [99, 245],
        productVariants: 3,
        productTemplates: 0,
        pricingReferences: 0,
        importedAt: "2026-06-16T00:00:00.000Z",
        importStatus: "review_staging",
        productionImportApproved: false,
        notes: []
      }
    };
    await writeFile(path.join(clientCatalogDir, "vendorCatalog.json"), `${JSON.stringify(vendorCatalog, null, 2)}\n`, "utf-8");

    const groupsResponse = await requestWorker(
      controller!.port,
      "/api/catalog/lookup?kind=vendor_catalog_groups",
      { cookie }
    );
    expect(groupsResponse.status).toBe(200);
    const groups = (groupsResponse.body as { groups?: Array<{ groupId: string; label: string; availableWidthsMm: number[] }> }).groups ?? [];
    expect(groups).toEqual([
      expect.objectContaining({
        groupId: "drawer_base_cabinets",
        label: "Drawer base cabinets",
        availableWidthsMm: [450, 600]
      })
    ]);

    const templatesResponse = await requestWorker(
      controller!.port,
      "/api/catalog/lookup?kind=vendor_catalog_templates&groupId=drawer_base_cabinets",
      { cookie }
    );
    expect(templatesResponse.status).toBe(200);
    const templates = (templatesResponse.body as { templates?: Array<{ productTemplateId: string; availableWidthsMm: number[]; variantCatalogKeys: string[] }> }).templates ?? [];
    expect(templates).toEqual([
      expect.objectContaining({
        productTemplateId: "tpl_ua",
        availableWidthsMm: [450, 600],
        variantCatalogKeys: ["UA-45", "UA-60"]
      })
    ]);

    const reviewGroupsResponse = await requestWorker(
      controller!.port,
      "/api/catalog/lookup?kind=vendor_catalog_groups&includeNeedsReview=true",
      { cookie }
    );
    const reviewGroups = (reviewGroupsResponse.body as { groups?: Array<{ groupId: string }> }).groups ?? [];
    expect(reviewGroups.some((group) => group.groupId === "tall_appliances")).toBe(true);
  }, 30_000);

  it("loads each client's stored catalog without crossing client namespaces", async () => {
    const clientACookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const clientBCookie = makeCookieHeader({ userId: "user_client_b_owner", clientId: "client_b_demo", role: "owner" });

    await requestWorker(controller!.port, "/api/catalog", { cookie: clientACookie });
    await requestWorker(controller!.port, "/api/catalog", { cookie: clientBCookie });

    const clientAPricingPath = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "catalog", "pricing.json");
    const clientAPricing = JSON.parse(await readFile(clientAPricingPath, "utf-8")) as { prices: Record<string, number> };
    const priceId = Object.keys(clientAPricing.prices)[0]!;
    clientAPricing.prices[priceId] = 9876;
    await writeFile(clientAPricingPath, `${JSON.stringify(clientAPricing, null, 2)}\n`, "utf-8");

    const responseA = await requestWorker(controller!.port, "/api/catalog", { cookie: clientACookie });
    const responseB = await requestWorker(controller!.port, "/api/catalog", { cookie: clientBCookie });
    const catalogA = (responseA.body as { catalog?: { priceList?: { prices?: Record<string, number> } } }).catalog;
    const catalogB = (responseB.body as { catalog?: { priceList?: { prices?: Record<string, number> } } }).catalog;

    expect(catalogA?.priceList?.prices?.[priceId]).toBe(9876);
    expect(catalogB?.priceList?.prices?.[priceId]).not.toBe(9876);
  }, 60_000);

  it("registers module package routes in the session-scoped worker API", async () => {
    const clientACookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const clientBCookie = makeCookieHeader({ userId: "user_client_b_owner", clientId: "client_b_demo", role: "owner" });
    const clientACustomPackage = {
      ...cornerShelfLowerFixture,
      module: {
        ...cornerShelfLowerFixture.module,
        modulePackageId: "client_a_corner_custom_v1",
        displayName: "Client A Custom Corner"
      }
    };

    const imported = await requestWorker(controller!.port, "/api/modules/import", {
      method: "POST",
      cookie: clientACookie,
      body: { package: clientACustomPackage }
    });
    expect(imported.status).toBe(201);
    expect(JSON.stringify(imported.body)).toContain("client_a_corner_custom_v1");

    const listA = await requestWorker(controller!.port, "/api/modules", { cookie: clientACookie });
    const listB = await requestWorker(controller!.port, "/api/modules", { cookie: clientBCookie });
    expect(listA.status).toBe(200);
    expect(listB.status).toBe(200);
    expect(JSON.stringify(listA.body)).toContain("client_a_corner_custom_v1");
    expect(JSON.stringify(listB.body)).not.toContain("client_a_corner_custom_v1");

    const detail = await requestWorker(controller!.port, "/api/modules/client_a_corner_custom_v1", { cookie: clientACookie });
    expect(detail.status).toBe(200);
    const storedFilePath = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "catalog", "modules", "client_a_corner_custom_v1", "module.fqm");
    const storedManifestPath = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "catalog", "modules", "client_a_corner_custom_v1", "module.package.json");
    await access(storedFilePath);
    await access(storedManifestPath);

    const badClient = await requestWorker(controller!.port, "/api/modules/import", {
      method: "POST",
      cookie: clientACookie,
      body: { clientId: "client_b_demo", package: cornerShelfLowerFixture }
    });
    expect(badClient.status).toBe(403);
  }, 30_000);

  it("keeps module package routes registered in the dev:local root worker entrypoint", async () => {
    const rootServer = await readFile(path.join(process.cwd(), "server", "workerServer.ts"), "utf-8");
    const srcServer = await readFile(path.join(process.cwd(), "src", "server", "workerServer.ts"), "utf-8");
    for (const source of [rootServer, srcServer]) {
      expect(source).toContain("handleModulePackageApi");
      expect(source).toContain("modulePackageEndpoint");
    }
  });

  it("creates, saves, loads, and downloads an encrypted tenant project", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const created = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie,
      body: { name: "Private Kitchen", address: "Main 1", city: "Bratislava", contactName: "Jane Client", email: "jane@example.com" }
    });
    expect(created.status).toBe(201);
    const project = (created.body as { project: { projectId: string; activePhaseId: string } }).project;

    const saved = await requestWorker(controller!.port, `/api/projects/${project.projectId}/save`, {
      method: "POST",
      cookie,
      body: {
        appState: {
          layout: { snapshot: { wallCounter: 1, walls: [], instanceCounter: 1, instances: [], pinnedWallIds: [], pinnedInstanceIds: [], underlayPinned: false, selected: { kind: null, wallId: null, wallIds: [], instId: null, instIds: [] } }, windows: [], doors: [] },
          kitchen: { groups: [] },
          modules: [{ id: "m1", type: "drawer_low", params: { materialId: "mat.board.body.dtd.grey.18" } }],
          scene: { viewMode: "3d" }
        }
      }
    });
    expect(saved.status).toBe(200);

    const savePath = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "projects", project.projectId, "phases", project.activePhaseId, "saves", "save.json");
    await access(savePath);
    const loaded = await requestWorker(controller!.port, `/api/projects/${project.projectId}/load`, { cookie });
    expect(loaded.status).toBe(200);
    expect(JSON.stringify(loaded.body)).toContain("Private Kitchen");

    const downloaded = await requestWorker(controller!.port, `/api/projects/${project.projectId}/download`, { cookie });
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-disposition")).toContain(".fqp");
    expect(downloaded.headers.get("content-disposition")).not.toContain(".kitchenproj");
    expect(downloaded.text).toContain("FURNQUOTE_ENCRYPTED_PROJECT");
    expect(downloaded.text).not.toContain("Private Kitchen");
    expect(downloaded.text).not.toContain("Jane Client");
  });

  it("rejects clientId in project create payload", async () => {
    const response = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }),
      body: { clientId: "client_b_demo", name: "Bad", address: "Main", contactName: "Jane" }
    });
    expect(response.status).toBe(403);
  });

  it("rejects foreign encrypted project import", async () => {
    const clientBCookie = makeCookieHeader({ userId: "user_client_b_owner", clientId: "client_b_demo", role: "owner" });
    const created = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie: clientBCookie,
      body: { name: "Client B Kitchen", address: "B street", contactName: "Bob" }
    });
    const project = (created.body as { project: { projectId: string } }).project;
    await requestWorker(controller!.port, `/api/projects/${project.projectId}/save`, {
      method: "POST",
      cookie: clientBCookie,
      body: { appState: { layout: { windows: [], doors: [] }, kitchen: {}, modules: [], scene: {} } }
    });
    const downloaded = await requestWorker(controller!.port, `/api/projects/${project.projectId}/download`, { cookie: clientBCookie });
    const response = await requestWorker(controller!.port, "/api/projects/import", {
      method: "POST",
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }),
      body: { envelope: downloaded.text }
    });
    expect(response.status).toBe(403);
  });

  it("lists only current client projects and blocks cross-client load", async () => {
    const clientACookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const clientBCookie = makeCookieHeader({ userId: "user_client_b_owner", clientId: "client_b_demo", role: "owner" });
    const projectA = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie: clientACookie,
      body: { name: "Client A Project", address: "A street", contactName: "Alice" }
    });
    const projectB = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie: clientBCookie,
      body: { name: "Client B Project", address: "B street", contactName: "Bob" }
    });
    const idB = (projectB.body as { project: { projectId: string } }).project.projectId;
    const listA = await requestWorker(controller!.port, "/api/projects", { cookie: clientACookie });
    expect(JSON.stringify(listA.body)).toContain("Client A Project");
    expect(JSON.stringify(listA.body)).not.toContain("Client B Project");
    const crossLoad = await requestWorker(controller!.port, `/api/projects/${idB}/load`, { cookie: clientACookie });
    expect(crossLoad.status).toBe(403);
    expect(projectA.status).toBe(201);
  });

  it("imports an encrypted project as a copy when the project already exists", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const created = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie,
      body: { name: "Conflict Kitchen", address: "Main", contactName: "Jane" }
    });
    const project = (created.body as { project: { projectId: string } }).project;
    await requestWorker(controller!.port, `/api/projects/${project.projectId}/save`, {
      method: "POST",
      cookie,
      body: { appState: { layout: { windows: [], doors: [] }, kitchen: {}, modules: [], scene: {} } }
    });
    const downloaded = await requestWorker(controller!.port, `/api/projects/${project.projectId}/download`, { cookie });
    const response = await requestWorker(controller!.port, "/api/projects/import", {
      method: "POST",
      cookie,
      body: { envelope: downloaded.text }
    });
    expect(response.status).toBe(200);
    const imported = (response.body as { save: { projectId: string; project: { importedFrom?: { projectId: string } } } }).save;
    expect(imported.projectId).not.toBe(project.projectId);
    expect(imported.project.importedFrom?.projectId).toBe(project.projectId);
    const list = await requestWorker(controller!.port, "/api/projects", { cookie });
    expect((list.body as { projects: unknown[] }).projects).toHaveLength(2);
  }, 30_000);

  it("prevents client A from reading storage belonging to client B", async () => {
    await seedRenderFixture(projectRoot, "client_b_demo", "project-b", "phase-b", "b.json", "user_client_b_owner");
    const response = await requestWorker(
      controller!.port,
      "/storage/clients/client_b_demo/projects/project-b/phases/phase-b/renders/b.json",
      { cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }) }
    );
    expect(response.status).toBe(403);
  }, 15_000);

  it("prevents client A from reading client B legacy storage without metadata", async () => {
    await seedLegacyRenderFixture(projectRoot, "client_b_demo", "legacy-project-b", "legacy-phase-b", "b.json");
    const response = await requestWorker(
      controller!.port,
      "/storage/clients/client_b_demo/projects/legacy-project-b/phases/legacy-phase-b/renders/b.json",
      { cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }) }
    );
    expect(response.status).toBe(403);
  });

  it("rejects same-client legacy storage reads without project metadata by default", async () => {
    await seedLegacyRenderFixture(projectRoot, "client_arcigy_demo", "legacy-project-a", "legacy-phase-a", "a.json");
    const response = await requestWorker(
      controller!.port,
      "/storage/clients/client_arcigy_demo/projects/legacy-project-a/phases/legacy-phase-a/renders/a.json",
      { cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }) }
    );
    expect(response.status).toBe(403);
  });

  it("keeps legacy storage reads disabled by default in production", async () => {
    process.env.NODE_ENV = "production";
    await seedLegacyRenderFixture(projectRoot, "client_arcigy_demo", "legacy-project-prod", "legacy-phase-prod", "a.json");
    const response = await requestWorker(
      controller!.port,
      "/storage/clients/client_arcigy_demo/projects/legacy-project-prod/phases/legacy-phase-prod/renders/a.json",
      { cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }) }
    );
    expect(response.status).toBe(403);
  });

  it("allows same-client legacy storage reads only with explicit allow flag", async () => {
    process.env.ALLOW_LEGACY_PROJECT_READ = "true";
    await seedLegacyRenderFixture(projectRoot, "client_arcigy_demo", "legacy-project-a", "legacy-phase-a", "a.json");
    const response = await requestWorker(
      controller!.port,
      "/storage/clients/client_arcigy_demo/projects/legacy-project-a/phases/legacy-phase-a/renders/a.json",
      { cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }) }
    );
    expect(response.status).toBe(200);
  });

  it("rejects cross-client legacy storage reads even with explicit allow flag", async () => {
    process.env.ALLOW_LEGACY_PROJECT_READ = "true";
    await seedLegacyRenderFixture(projectRoot, "client_b_demo", "legacy-project-b", "legacy-phase-b", "b.json");
    const response = await requestWorker(
      controller!.port,
      "/storage/clients/client_b_demo/projects/legacy-project-b/phases/legacy-phase-b/renders/b.json",
      { cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }) }
    );
    expect(response.status).toBe(403);
  });

  it("rejects unexpected clientId in export request body", async () => {
    const response = await requestWorker(controller!.port, "/api/blender/export", {
      method: "POST",
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }),
      body: {
        clientId: "client_b_demo",
        projectId: "project-b",
        phaseId: "phase-b",
        sceneJson: { objects: [] }
      }
    });
    expect(response.status).toBe(400);
    const body = response.body;
    expect(typeof body).toBe("object");
    expect((body as { error?: string }).error).toBe("Unexpected clientId in request body.");
  });

  it("does not use clientId from export query parameters", async () => {
    const response = await requestWorker(controller!.port, "/api/blender/export?clientId=client_b_demo", {
      method: "POST",
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }),
      body: {
        projectId: "query-project",
        phaseId: "query-phase",
        sceneJson: { objects: [] }
      }
    });

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("/storage/clients/client_arcigy_demo/projects/query-project/phases/query-phase/");
    expect(JSON.stringify(response.body)).not.toContain("client_b_demo");
  });

  it("rejects storage path traversal", async () => {
    await seedRenderFixture(projectRoot, "client_arcigy_demo", "project-a", "phase-a", "safe.json", "user_arcigy_owner");
    const response = await requestWorker(
      controller!.port,
      "/storage/clients/client_arcigy_demo/projects/project-a/phases/phase-a/renders/..%2Ftraversal.json",
      { cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }) }
    );
    expect(response.status).toBe(403);
  });

  it("ignores clientId when provided in storage query parameters", async () => {
    await seedRenderFixture(projectRoot, "client_arcigy_demo", "project-a", "phase-a", "safe.json", "user_arcigy_owner");
    const response = await requestWorker(
      controller!.port,
      "/storage/clients/client_arcigy_demo/projects/project-a/phases/phase-a/renders/safe.json?clientId=client_b_demo",
      { cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }) }
    );

    expect(response.status).toBe(200);
  });

  it("rejects inactive or malformed session for storage access", async () => {
    const clientACookie = makeCookieHeader({ userId: "user_client_a_inactive", clientId: "client_a_inactive", role: "viewer" });
    const expiredSession = await requestWorker(
      controller!.port,
      "/storage/clients/client_a_inactive/projects/p1/phases/ph1/renders/a.json",
      { cookie: clientACookie }
    );
    expect(expiredSession.status).toBe(401);

    const malformed = await requestWorker(controller!.port, "/storage/clients/client_arcigy_demo/projects/p1/phases/ph1/renders/a.json", {
      cookie: `${CLIENT_SESSION_COOKIE}=corrupt.payload.sig`
    });
    expect(malformed.status).toBe(401);
  });

  it("rejects export when projectId or phaseId are missing", async () => {
    const noProject = await requestWorker(controller!.port, "/api/blender/export", {
      method: "POST",
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }),
      body: { phaseId: "phase-a", sceneJson: { objects: [] } }
    });
    expect(noProject.status).toBe(400);

    const noPhase = await requestWorker(controller!.port, "/api/blender/export", {
      method: "POST",
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }),
      body: { projectId: "project-a", sceneJson: { objects: [] } }
    });
    expect(noPhase.status).toBe(400);
  });

  it("rejects export when sceneJson is missing", async () => {
    const response = await requestWorker(controller!.port, "/api/blender/export", {
      method: "POST",
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }),
      body: {
        projectId: "project-a",
        phaseId: "phase-a"
      }
    });
    expect(response.status).toBe(400);
  });

  it("does not write through export into another client namespace", async () => {
    const clientBFile = await seedRenderFixture(projectRoot, "client_b_demo", "shared-project", "phase-shared", "baseline.json", "user_client_b_owner");
    await access(clientBFile);

    const response = await requestWorker(controller!.port, "/api/blender/export", {
      method: "POST",
      body: {
        projectId: "shared-project",
        phaseId: "phase-shared",
        sceneJson: { objects: [] }
      },
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" })
    });

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("/storage/clients/client_arcigy_demo/projects/shared-project/phases/phase-shared/");
    const body = response.body;
    const preview = typeof body === "object" && body && "previewUrl" in body ? String(body.previewUrl) : "";
    expect(preview.includes("/storage/clients/client_arcigy_demo/projects/shared-project/phases/phase-shared/")).toBe(true);
    expect(preview.includes("client_b_demo")).toBe(false);
  });

  it("creates project metadata and does not write export output to global folders", async () => {
    const response = await requestWorker(controller!.port, "/api/blender/export", {
      method: "POST",
      body: {
        projectId: "metadata-project",
        phaseId: "metadata-phase",
        sceneJson: { objects: [] }
      },
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" })
    });

    expect(response.status).toBe(200);
    const metaPath = getProjectMetaPath(projectRoot, "client_arcigy_demo", "metadata-project");
    const metadata = JSON.parse(await readFile(metaPath, "utf-8")) as { clientId?: string; projectId?: string; phases?: string[] };
    expect(metadata).toMatchObject({
      clientId: "client_arcigy_demo",
      projectId: "metadata-project",
      phases: ["metadata-phase"]
    });
    expect(await fileExists(path.join(projectRoot, "outputs"))).toBe(false);
    expect(await fileExists(path.join(projectRoot, "public", "debug-pdf"))).toBe(false);
  });
});

async function createTempProjectRoot() {
  return path.join(await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "kitchen-worker-isolation-"))), "");
}
