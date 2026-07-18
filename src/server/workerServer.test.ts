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
import { createHttpRequestBudget, type HttpRequestBudget } from "./http-request-budget";
import cornerShelfLowerFixture from "../core/module-package/fixtures/cornerShelfLower.fqm.source.json";
import { createPinoSideCabinetTenantPackage } from "../system/module-packages/pinoSideCabinet";
import type { ProjectSaveFile } from "../core/project-save/project-save-types";

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
    headers?: Record<string, string>;
  } = {}
) => {
  const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...options.headers
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

const createServer = async (
  projectRoot: string,
  userService: UserService,
  requestBudget?: HttpRequestBudget
): Promise<WorkerServerController> => {
  const server = startWorkerServer(0, "127.0.0.1", { userService, projectRoot, requestBudget });
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
  const previousMetricsToken = process.env.ARCIGY_METRICS_TOKEN;
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
    },
    ...(["admin", "designer", "viewer"] as const).map((role) => ({
      userId: `user_arcigy_${role}`,
      username: `arcigy-${role}`,
      displayName: `Arcigy ${role}`,
      passwordHash: seedAuthUsers[0].passwordHash,
      clientId: "client_arcigy_demo",
      role,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }))
  ] as const;
  const activeUserService = createUserService(createInMemoryUserRepository(users));

  const start = async () => {
    projectRoot = await createTempProjectRoot();
    controller = await createServer(projectRoot, activeUserService);
  };

  const replaceServer = async (userService: UserService, requestBudget?: HttpRequestBudget) => {
    if (controller) {
      await new Promise<void>((resolve) => controller!.server.close(() => resolve()));
    }
    controller = await createServer(projectRoot, userService, requestBudget);
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
    if (previousMetricsToken === undefined) delete process.env.ARCIGY_METRICS_TOKEN;
    else process.env.ARCIGY_METRICS_TOKEN = previousMetricsToken;
    delete process.env.PROJECT_FILE_SECRET;
  });

  it("rejects unauthenticated request to client-scoped storage endpoint", async () => {
    const clientAFile = await seedRenderFixture(projectRoot, "client_a_demo", "project-a", "phase-a", "a.json", "user_arcigy_owner");
    await access(clientAFile);
    const response = await requestWorker(controller!.port, "/storage/clients/client_a_demo/projects/project-a/phases/phase-a/renders/a.json");
    expect(response.status).toBe(401);
  });

  it("returns 413 for a JSON body above the configured route limit", async () => {
    process.env.HTTP_JSON_BODY_MAX_MB = "0.0001";
    try {
      const response = await requestWorker(controller!.port, "/api/auth/login", {
        method: "POST",
        body: { username: "arcigy", password: "x".repeat(1_000) }
      });
      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ ok: false, error: "Request body exceeds the 1 MB limit.", requestId: expect.any(String) });
      expect(response.headers.get("x-request-id")).toBeTruthy();
    } finally {
      delete process.env.HTTP_JSON_BODY_MAX_MB;
    }
  });

  it("returns retryable 503 for a database session failure and keeps serving requests", async () => {
    const unavailableUserService: UserService = {
      authenticate: async () => null,
      getUserById: async () => {
        throw new Error("Connection terminated due to connection timeout");
      }
    };
    await replaceServer(unavailableUserService);
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });

    const failedSession = await requestWorker(controller!.port, "/api/auth/session", { cookie });
    expect(failedSession.status).toBe(503);
    expect(failedSession.body).toMatchObject({ ok: false, error: "Database temporarily unavailable. Please retry.", requestId: expect.any(String) });
    expect(failedSession.headers.get("retry-after")).toBe("2");

    const liveness = await requestWorker(controller!.port, "/health");
    expect(liveness.status).toBe(200);
    expect(liveness.body).toEqual({ ok: true });
  });

  it("reports file-backed readiness without requiring a database", async () => {
    const readiness = await requestWorker(controller!.port, "/ready");
    expect(readiness.status).toBe(200);
    expect(readiness.body).toMatchObject({ ok: true, storage: "file" });
  });

  it("serves bounded metrics in development and protects them in production", async () => {
    await requestWorker(controller!.port, "/api/projects/private-project-id?secret=hidden");

    const developmentMetrics = await requestWorker(controller!.port, "/metrics");
    expect(developmentMetrics.status).toBe(200);
    expect(developmentMetrics.headers.get("content-type")).toContain("text/plain");
    expect(developmentMetrics.text).toContain("arcigy_http_requests_total");
    expect(developmentMetrics.text).toContain("/api/projects/:projectId");
    expect(developmentMetrics.text).not.toContain("private-project-id");
    expect(developmentMetrics.text).not.toContain("hidden");

    process.env.NODE_ENV = "production";
    delete process.env.ARCIGY_METRICS_TOKEN;
    expect((await requestWorker(controller!.port, "/metrics")).status).toBe(404);

    process.env.ARCIGY_METRICS_TOKEN = "test-metrics-token";
    expect((await requestWorker(controller!.port, "/metrics")).status).toBe(404);
    const authorized = await requestWorker(controller!.port, "/metrics", {
      headers: { Authorization: "Bearer test-metrics-token" }
    });
    expect(authorized.status).toBe(200);
    expect(authorized.text).toContain("arcigy_process_uptime_seconds");
  });

  it("accepts authenticated privacy-safe browser runtime signals end to end", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });

    expect((await requestWorker(controller!.port, "/api/client-metrics", {
      method: "POST",
      body: { signal: "long_task", value: 125 }
    })).status).toBe(401);

    expect((await requestWorker(controller!.port, "/api/client-metrics", {
      cookie,
      method: "POST",
      body: { signal: "long_task", value: 125 }
    })).status).toBe(202);
    expect((await requestWorker(controller!.port, "/api/client-metrics", {
      cookie,
      method: "POST",
      body: { signal: "memory_used", value: 256 * 1024 * 1024 }
    })).status).toBe(202);

    const rejected = await requestWorker(controller!.port, "/api/client-metrics", {
      cookie,
      method: "POST",
      body: { signal: "js_error", value: 1, projectId: "private-project" }
    });
    expect(rejected.status).toBe(400);

    const metrics = await requestWorker(controller!.port, "/metrics");
    expect(metrics.text).toContain('arcigy_browser_long_task_duration_seconds_bucket{le="0.25"} 1');
    expect(metrics.text).toContain('arcigy_browser_memory_used_bytes_bucket{le="268435456"} 1');
    expect(metrics.text).not.toContain("private-project");
  });

  it("returns retry guidance when a tenant exceeds an expensive-route budget", async () => {
    await replaceServer(activeUserService, createHttpRequestBudget({
      policies: [{
        operation: "catalog-test",
        method: "GET",
        pathname: /^\/api\/catalog$/,
        maxRequests: 1,
        windowMs: 60_000,
        maxConcurrent: 2
      }]
    }));
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });

    expect((await requestWorker(controller!.port, "/api/catalog", { cookie })).status).toBe(200);
    const limited = await requestWorker(controller!.port, "/api/catalog", { cookie });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(Number(limited.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    expect(limited.body).toEqual({ ok: false, error: "Request limit reached. Please retry shortly." });
  }, 60_000);

  it("loads client catalog from server session and stores it in the client namespace", async () => {
    const response = await requestWorker(controller!.port, "/api/catalog", {
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("vary")).toContain("Accept-Encoding");
    const body = response.body as { catalog?: { clientId?: string; priceList?: { prices?: Record<string, number> } } };
    expect(body.catalog?.clientId).toBe("client_arcigy_demo");
    const storedPath = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "catalog", "pricing.json");
    const stored = JSON.parse(await readFile(storedPath, "utf-8")) as { prices?: Record<string, number> };
    const priceId = Object.keys(stored.prices ?? {})[0]!;
    expect(stored.prices?.[priceId]).toBe(body.catalog?.priceList?.prices?.[priceId]);
  }, 60_000);

  it("keeps the full catalog API while serving a lighter browser bootstrap view", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    expect((await requestWorker(controller!.port, "/api/catalog/bootstrap")).status).toBe(401);
    const fullResponse = await requestWorker(controller!.port, "/api/catalog", { cookie });
    const bootstrapResponse = await requestWorker(controller!.port, "/api/catalog/bootstrap", { cookie });
    type CatalogBody = {
      view?: string;
      catalog?: {
        clientId: string;
        materials: Array<{ id: string; supplierSource?: { supplierProductId?: string } }>;
        components: Array<{ id: string; supplierSource?: { supplierProductId?: string } }>;
      };
    };
    const full = (fullResponse.body as CatalogBody).catalog!;
    const bootstrap = (bootstrapResponse.body as CatalogBody).catalog!;

    expect(fullResponse.status).toBe(200);
    expect(bootstrapResponse.status).toBe(200);
    expect((bootstrapResponse.body as CatalogBody).view).toBe("catalog-bootstrap-v1");
    expect(full.materials.some((item) => !!item.supplierSource)).toBe(true);
    expect(full.components.some((item) => !!item.supplierSource)).toBe(true);
    expect(bootstrap.clientId).toBe(full.clientId);
    expect(bootstrap.materials.map((item) => item.id)).toEqual(full.materials.map((item) => item.id));
    expect(bootstrap.components.map((item) => item.id)).toEqual(full.components.map((item) => item.id));
    expect(bootstrap.materials.every((item) => item.supplierSource === undefined)).toBe(true);
    expect(bootstrap.components.every((item) => item.supplierSource === undefined)).toBe(true);
    expect(JSON.stringify(bootstrapResponse.body).length).toBeLessThan(JSON.stringify(fullResponse.body).length);
  }, 60_000);

  it("looks up tenant catalog entities by exact ID, aliases, unit price, and inactive state", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const catalogResponse = await requestWorker(controller!.port, "/api/catalog", { cookie });
    const catalog = (catalogResponse.body as {
      catalog?: {
        materials?: Array<{
          id: string;
          materialCode?: string;
          boardFamily?: string;
          isActive: boolean;
          supplierSource?: { supplierProductId?: string };
        }>;
        components?: Array<{
          id: string;
          componentCode?: string;
          componentType: string;
          isActive: boolean;
          supplierSource?: { supplierProductId?: string };
        }>;
        priceList?: { prices: Record<string, number> };
      };
    }).catalog;
    const frontMaterial = catalog?.materials?.find((material) => material.boardFamily === "front");
    const component = catalog?.components?.[0];
    expect(frontMaterial?.id).toBeTruthy();
    expect(component?.id).toBeTruthy();

    const ok = await requestWorker(
      controller!.port,
      `/api/catalog/lookup?kind=material&family=front&id=${encodeURIComponent(frontMaterial!.id)}`,
      { cookie }
    );
    expect(ok.status).toBe(200);
    expect((ok.body as { material?: { id?: string } }).material?.id).toBe(frontMaterial!.id);
    expect((ok.body as { unitPrice?: number }).unitPrice).toBe(catalog?.priceList?.prices[frontMaterial!.id]);

    const materialAlias = await requestWorker(
      controller!.port,
      `/api/materials/by-code/${encodeURIComponent(frontMaterial!.id)}`,
      { cookie }
    );
    expect(materialAlias.status).toBe(200);
    expect((materialAlias.body as { material?: { id?: string }; unitPrice?: number }).material?.id).toBe(frontMaterial!.id);
    expect((materialAlias.body as { unitPrice?: number }).unitPrice).toBe(catalog?.priceList?.prices[frontMaterial!.id]);

    const componentAlias = await requestWorker(
      controller!.port,
      `/api/components/by-code/${encodeURIComponent(component!.id)}`,
      { cookie }
    );
    expect(componentAlias.status).toBe(200);
    expect((componentAlias.body as { component?: { id?: string; isActive?: boolean }; unitPrice?: number }).component).toMatchObject({
      id: component!.id,
      isActive: component!.isActive
    });
    expect((componentAlias.body as { unitPrice?: number }).unitPrice).toBe(catalog?.priceList?.prices[component!.id]);

    const supplierMaterial = catalog?.materials?.find((material) => material.supplierSource?.supplierProductId);
    const supplierComponent = catalog?.components?.find((item) => item.supplierSource?.supplierProductId);
    expect(supplierMaterial?.supplierSource?.supplierProductId).toBeTruthy();
    expect(supplierComponent?.supplierSource?.supplierProductId).toBeTruthy();
    const supplierMaterialAlias = await requestWorker(
      controller!.port,
      `/api/materials/by-code/${encodeURIComponent(supplierMaterial!.supplierSource!.supplierProductId!)}`,
      { cookie }
    );
    const supplierComponentAlias = await requestWorker(
      controller!.port,
      `/api/components/by-code/${encodeURIComponent(supplierComponent!.supplierSource!.supplierProductId!)}`,
      { cookie }
    );
    expect((supplierMaterialAlias.body as { material?: { id?: string } }).material?.id).toBe(supplierMaterial!.id);
    expect((supplierComponentAlias.body as { component?: { id?: string } }).component?.id).toBe(supplierComponent!.id);

    const wrongFamily = await requestWorker(
      controller!.port,
      `/api/catalog/lookup?kind=material&family=body&id=${encodeURIComponent(frontMaterial!.id)}`,
      { cookie }
    );
    expect(wrongFamily.status).toBe(404);

    const inactiveMaterial = catalog?.materials?.find((material) => material.id !== frontMaterial!.id);
    expect(inactiveMaterial?.id).toBeTruthy();
    const materialsPath = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "catalog", "materials.json");
    const storedMaterials = JSON.parse(await readFile(materialsPath, "utf-8")) as Array<Record<string, unknown>>;
    await writeFile(
      materialsPath,
      `${JSON.stringify(storedMaterials.map((material) => material.id === inactiveMaterial!.id ? { ...material, isActive: false } : material), null, 2)}\n`,
      "utf-8"
    );
    const inactiveAlias = await requestWorker(
      controller!.port,
      `/api/materials/by-code/${encodeURIComponent(inactiveMaterial!.id)}`,
      { cookie }
    );
    expect(inactiveAlias.status).toBe(200);
    expect((inactiveAlias.body as { material?: { id?: string; isActive?: boolean } }).material).toMatchObject({
      id: inactiveMaterial!.id,
      isActive: false
    });
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
    const sharedRouter = await readFile(path.join(process.cwd(), "src", "server", "workerApiRouter.ts"), "utf-8");
    for (const source of [rootServer, srcServer]) {
      expect(source).toContain("handleWorkerApiRequest");
      expect(source).toContain("workerApiRouter");
    }
    expect(sharedRouter).toContain("handleModulePackageApi");
    expect(sharedRouter).toContain("modulePackageEndpoint");
  });

  it("creates, saves, loads, and downloads an encrypted tenant project", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const catalogResponse = await requestWorker(controller!.port, "/api/catalog", { cookie });
    const catalog = (catalogResponse.body as {
      catalog: {
        materials: Array<{ id: string; supplierSource?: { supplierProductId?: string } }>;
        components: Array<{ id: string; supplierSource?: { supplierProductId?: string } }>;
      };
    }).catalog;
    const supplierMaterial = catalog.materials.find((item) => !!item.supplierSource);
    const supplierComponent = catalog.components.find((item) => !!item.supplierSource);
    expect(supplierMaterial?.supplierSource?.supplierProductId).toBeTruthy();
    expect(supplierComponent?.supplierSource?.supplierProductId).toBeTruthy();
    const createBody = { name: "Private Kitchen", address: "Main 1", city: "Bratislava", contactName: "Jane Client", email: "jane@example.com" };
    const created = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie,
      headers: { "Idempotency-Key": "worker-create-request-0001" },
      body: createBody
    });
    expect(created.status).toBe(201);
    const project = (created.body as { project: { projectId: string; activePhaseId: string } }).project;
    const createReplay = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie,
      headers: { "Idempotency-Key": "worker-create-request-0001" },
      body: createBody
    });
    expect(createReplay.status).toBe(201);
    expect((createReplay.body as { project: { projectId: string } }).project.projectId).toBe(project.projectId);
    const createConflict = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie,
      headers: { "Idempotency-Key": "worker-create-request-0001" },
      body: { ...createBody, name: "Different Kitchen" }
    });
    expect(createConflict.status).toBe(409);

    const saveBody = {
      expectedSaveRevision: 0,
      appState: {
        layout: { snapshot: { wallCounter: 1, walls: [], instanceCounter: 1, instances: [], pinnedWallIds: [], pinnedInstanceIds: [], underlayPinned: false, selected: { kind: null, wallId: null, wallIds: [], instId: null, instIds: [] } }, windows: [], doors: [] },
        kitchen: { groups: [], context: { handleComponentId: supplierComponent!.id } },
        modules: [{ id: "m1", type: "drawer_low", params: { materialId: supplierMaterial!.id } }],
        scene: { viewMode: "3d" }
      }
    };
    const saved = await requestWorker(controller!.port, `/api/projects/${project.projectId}/save`, {
      method: "POST",
      cookie,
      headers: { "Idempotency-Key": "worker-save-request-0001" },
      body: saveBody
    });
    expect(saved.status).toBe(200);
    const savedFile = (saved.body as { save: ProjectSaveFile }).save;
    expect(savedFile.integrity.saveRevision).toBe(1);
    expect(savedFile.catalogSnapshot.materials.find((item) => (item as { id?: string }).id === supplierMaterial!.id))
      .toMatchObject({ supplierSource: supplierMaterial!.supplierSource });
    expect(savedFile.catalogSnapshot.components.find((item) => (item as { id?: string }).id === supplierComponent!.id))
      .toMatchObject({ supplierSource: supplierComponent!.supplierSource });

    const replay = await requestWorker(controller!.port, `/api/projects/${project.projectId}/save`, {
      method: "POST",
      cookie,
      headers: { "Idempotency-Key": "worker-save-request-0001" },
      body: saveBody
    });
    expect(replay.status).toBe(200);
    expect((replay.body as { save: ProjectSaveFile }).save).toEqual((saved.body as { save: ProjectSaveFile }).save);

    const stale = await requestWorker(controller!.port, `/api/projects/${project.projectId}/save`, {
      method: "POST",
      cookie,
      headers: { "Idempotency-Key": "worker-save-request-0002" },
      body: {
        ...saveBody,
        appState: { ...saveBody.appState, scene: { viewMode: "2d" } }
      }
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ ok: false, error: "Project changed since it was loaded. Reload the project before saving again." });

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

    const imported = await requestWorker(controller!.port, "/api/projects/import", {
      method: "POST",
      cookie,
      headers: { "Idempotency-Key": "worker-import-request-0001" },
      body: { envelope: downloaded.text }
    });
    expect(imported.status).toBe(200);
    const importedProjectId = (imported.body as { save: { projectId: string } }).save.projectId;
    expect(importedProjectId).not.toBe(project.projectId);
    const importReplay = await requestWorker(controller!.port, "/api/projects/import", {
      method: "POST",
      cookie,
      headers: { "Idempotency-Key": "worker-import-request-0001" },
      body: { envelope: downloaded.text }
    });
    expect(importReplay.status).toBe(200);
    expect((importReplay.body as { save: { projectId: string } }).save.projectId).toBe(importedProjectId);
    const importConflict = await requestWorker(controller!.port, "/api/projects/import", {
      method: "POST",
      cookie,
      headers: { "Idempotency-Key": "worker-import-request-0001" },
      body: { envelope: `${downloaded.text} ` }
    });
    expect(importConflict.status).toBe(409);
    const projects = await requestWorker(controller!.port, "/api/projects", { cookie });
    expect((projects.body as { projects: unknown[] }).projects).toHaveLength(2);
  }, 15_000);

  it("deletes a tenant project with its versions and files only for owners or admins", async () => {
    const ownerCookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const adminCookie = makeCookieHeader({ userId: "user_arcigy_admin", clientId: "client_arcigy_demo", role: "admin" });
    const designerCookie = makeCookieHeader({ userId: "user_arcigy_designer", clientId: "client_arcigy_demo", role: "designer" });
    const viewerCookie = makeCookieHeader({ userId: "user_arcigy_viewer", clientId: "client_arcigy_demo", role: "viewer" });
    const otherTenantCookie = makeCookieHeader({ userId: "user_client_b_owner", clientId: "client_b_demo", role: "owner" });
    const created = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie: ownerCookie,
      body: { name: "Delete Kitchen", address: "Main 3", contactName: "Jane" }
    });
    const project = (created.body as { project: { projectId: string; activePhaseId: string } }).project;
    await requestWorker(controller!.port, `/api/projects/${project.projectId}/save`, {
      method: "POST",
      cookie: ownerCookie,
      body: { appState: { layout: { windows: [], doors: [] }, kitchen: {}, modules: [], scene: {} } }
    });
    const projectPath = path.join(projectRoot, "storage", "clients", "client_arcigy_demo", "projects", project.projectId);
    await access(path.join(projectPath, "versions", "version-manifest.json"));

    expect((await requestWorker(controller!.port, `/api/projects/${project.projectId}`, {
      method: "DELETE",
      cookie: viewerCookie
    })).status).toBe(403);
    expect((await requestWorker(controller!.port, `/api/projects/${project.projectId}`, {
      method: "DELETE",
      cookie: designerCookie
    })).status).toBe(403);
    expect([403, 404]).toContain((await requestWorker(controller!.port, `/api/projects/${project.projectId}`, {
      method: "DELETE",
      cookie: otherTenantCookie
    })).status);
    expect((await requestWorker(controller!.port, `/api/projects/${project.projectId}`, { cookie: ownerCookie })).status).toBe(200);

    expect((await requestWorker(controller!.port, `/api/projects/${project.projectId}`, {
      method: "DELETE",
      cookie: adminCookie
    })).status).toBe(200);
    expect([403, 404]).toContain((await requestWorker(controller!.port, `/api/projects/${project.projectId}`, { cookie: ownerCookie })).status);
    await expect(access(projectPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps generic project saves read-only for material assignments and denies viewers", async () => {
    const ownerCookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const viewerCookie = makeCookieHeader({ userId: "user_arcigy_viewer", clientId: "client_arcigy_demo", role: "viewer" });
    const created = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie: ownerCookie,
      body: { name: "Authoritative Materials", address: "Main 2", contactName: "Jane" }
    });
    const projectId = (created.body as { project: { projectId: string } }).project.projectId;
    const catalogResponse = await requestWorker(controller!.port, "/api/catalog", { cookie: ownerCookie });
    const projectCatalog = (catalogResponse.body as {
      catalog: {
        materials: Array<{ id: string; boardFamily?: string }>;
        kitchenDefaults: { frontMaterialId?: string };
      };
    }).catalog;
    const projectFront = projectCatalog.materials.find((material) =>
      material.boardFamily === "front" && material.id !== projectCatalog.kitchenDefaults.frontMaterialId
    )!;
    expect(projectFront?.id).toBeTruthy();
    const forgedAssignments = {
      schemaVersion: 1,
      initialized: true,
      revision: 999,
      assignments: [{
        assignmentId: "forged-corpus",
        category: "corpus",
        kind: "material",
        materialId: "mat.forged",
        customValues: { forged: true },
        source: "user",
        snapshots: { material: { definition: { id: "mat.forged", entityType: "material" } } },
        updatedAt: "2026-07-10T08:00:00.000Z"
      }]
    };

    const viewerSave = await requestWorker(controller!.port, `/api/projects/${projectId}/save`, {
      method: "POST",
      cookie: viewerCookie,
      body: { appState: { layout: { windows: [], doors: [] }, kitchen: {}, modules: [], materialAssignments: forgedAssignments, scene: {} } }
    });
    expect(viewerSave.status).toBe(403);

    const firstSave = await requestWorker(controller!.port, `/api/projects/${projectId}/save`, {
      method: "POST",
      cookie: ownerCookie,
      body: {
        appState: {
          layout: { marker: "first-layout", windows: [], doors: [] },
          kitchen: { context: { frontsMaterialId: projectFront.id } },
          modules: [],
          materialAssignments: forgedAssignments,
          scene: {}
        }
      }
    });
    expect(firstSave.status).toBe(200);
    const first = (firstSave.body as { save: { appState: { layout: { marker: string }; materialAssignments: unknown } } }).save;
    expect(first.appState.layout.marker).toBe("first-layout");
    expect(first.appState.materialAssignments).toMatchObject({ initialized: true, revision: 0 });
    expect(JSON.stringify(first.appState.materialAssignments)).not.toContain("mat.forged");
    expect((first.appState.materialAssignments as { assignments: Array<{ category: string; materialId?: string }> }).assignments)
      .toContainEqual(expect.objectContaining({ category: "front", materialId: projectFront.id }));

    const secondSave = await requestWorker(controller!.port, `/api/projects/${projectId}/save`, {
      method: "POST",
      cookie: ownerCookie,
      body: {
        appState: {
          layout: { marker: "second-layout", windows: [], doors: [] },
          kitchen: {},
          modules: [],
          materialAssignments: { ...forgedAssignments, revision: 1000 },
          scene: {}
        }
      }
    });
    expect(secondSave.status).toBe(200);
    const second = (secondSave.body as { save: { appState: { layout: { marker: string }; materialAssignments: unknown } } }).save;
    expect(second.appState.layout.marker).toBe("second-layout");
    expect(second.appState.materialAssignments).toEqual(first.appState.materialAssignments);

    const viewerRestore = await requestWorker(controller!.port, `/api/projects/${projectId}/versions/1/restore`, {
      method: "POST",
      cookie: viewerCookie
    });
    expect(viewerRestore.status).toBe(403);
    const versionsBeforeRestore = await requestWorker(controller!.port, `/api/projects/${projectId}/versions`, { cookie: ownerCookie });
    const versionCountBefore = (versionsBeforeRestore.body as { versions: unknown[] }).versions.length;
    const restored = await requestWorker(controller!.port, `/api/projects/${projectId}/versions/1/restore`, {
      method: "POST",
      cookie: ownerCookie,
      headers: { "Idempotency-Key": "worker-restore-request-0001" },
      body: {}
    });
    expect(restored.status).toBe(200);
    const restoreReplay = await requestWorker(controller!.port, `/api/projects/${projectId}/versions/1/restore`, {
      method: "POST",
      cookie: ownerCookie,
      headers: { "Idempotency-Key": "worker-restore-request-0001" },
      body: {}
    });
    expect(restoreReplay.status).toBe(200);
    expect((restoreReplay.body as { save: ProjectSaveFile }).save).toEqual((restored.body as { save: ProjectSaveFile }).save);
    const versionsAfterRestore = await requestWorker(controller!.port, `/api/projects/${projectId}/versions`, { cookie: ownerCookie });
    expect((versionsAfterRestore.body as { versions: unknown[] }).versions).toHaveLength(versionCountBefore + 1);
    const afterViewerRestore = await requestWorker(controller!.port, `/api/projects/${projectId}/load`, { cookie: ownerCookie });
    expect(afterViewerRestore.status).toBe(200);
    expect((afterViewerRestore.body as { save: { appState: { layout: { marker: string }; materialAssignments: unknown } } }).save.appState)
      .toMatchObject({ layout: { marker: "second-layout" }, materialAssignments: second.appState.materialAssignments });
  }, 30_000);

  it("keeps project material assignments atomic and preserves the committed value after an invalid ID", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const created = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie,
      body: { name: "Materials Kitchen", address: "Material 1", contactName: "Jane" }
    });
    const projectId = (created.body as { project: { projectId: string } }).project.projectId;
    await requestWorker(controller!.port, `/api/projects/${projectId}/save`, {
      method: "POST",
      cookie,
      body: {
        appState: { layout: { windows: [], doors: [] }, kitchen: {}, modules: [], scene: {} },
        bomSnapshot: { materialQuantities: [{ category: "corpus", quantity: 1, unit: "<img src=x onerror=alert(1)>" }] }
      }
    });

    const initial = await requestWorker(controller!.port, `/api/projects/${projectId}/materials`, { cookie });
    expect(initial.status).toBe(200);
    const initialView = (initial.body as {
      view: {
        assignments: { revision: number; initialized: boolean; assignments: Array<Record<string, unknown>> };
        quantities: Array<{ category: string; quantity: number; unit: string }>;
        priceSource: { priceListId: string; lastSynchronizedAt: string | null };
      };
    }).view;
    expect(initialView.assignments.initialized).toBe(true);
    expect(initialView.priceSource.priceListId).toBeTruthy();
    expect(initialView.priceSource.lastSynchronizedAt).toBeNull();
    expect(initialView.quantities.find((item) => item.category === "corpus")).toMatchObject({ quantity: 0, unit: "m2" });
    expect(JSON.stringify(initial.body)).not.toContain("fullCatalog");
    expect(JSON.stringify(initial.body)).not.toContain("onerror");
    const corpus = initialView.assignments.assignments.find((item) => item.category === "corpus")!;

    const malformed = await requestWorker(controller!.port, `/api/projects/${projectId}/materials/validate`, {
      method: "POST",
      cookie,
      body: { state: {} }
    });
    expect(malformed.status).toBe(400);
    const nullRevision = await requestWorker(controller!.port, `/api/projects/${projectId}/materials`, {
      method: "PUT",
      cookie,
      body: { revision: null, assignment: corpus }
    });
    expect(nullRevision.status).toBe(409);

    const concurrentCommits = await Promise.all([1, 2].map(() => requestWorker(controller!.port, `/api/projects/${projectId}/materials`, {
      method: "PUT",
      cookie,
      body: { revision: initialView.assignments.revision, assignment: corpus }
    })));
    expect(concurrentCommits.map((response) => response.status).sort()).toEqual([200, 409]);
    const committed = concurrentCommits.find((response) => response.status === 200)!;
    const committedView = (committed.body as { view: { assignments: { revision: number; assignments: Array<Record<string, unknown>> } } }).view;
    expect(committedView.assignments.revision).toBe(1);
    const committedCorpus = committedView.assignments.assignments.find((item) => item.category === "corpus")!;
    const committedId = String(committedCorpus.materialId);
    const forgedEdgeId = "mat.forged.edge";
    const forgedEdgeAssignment = {
      ...committedCorpus,
      edgeFrontId: forgedEdgeId,
      snapshots: {
        ...(committedCorpus.snapshots as Record<string, unknown>),
        edgeFront: {
          ...((committedCorpus.snapshots as { material: Record<string, unknown> }).material),
          definition: { id: forgedEdgeId, entityType: "material" }
        }
      }
    };
    const forgedEdge = await requestWorker(controller!.port, `/api/projects/${projectId}/materials`, {
      method: "PUT",
      cookie,
      body: { revision: 1, assignment: forgedEdgeAssignment }
    });
    expect(forgedEdge.status).toBe(422);

    const invalidDefinition = {
      ...((committedCorpus.snapshots as { material: { definition: Record<string, unknown> } }).material.definition),
      id: "mat.does.not.exist"
    };
    const invalidAssignment = {
      ...committedCorpus,
      materialId: "mat.does.not.exist",
      snapshots: {
        material: {
          ...((committedCorpus.snapshots as { material: Record<string, unknown> }).material),
          definition: invalidDefinition
        }
      }
    };
    const invalid = await requestWorker(controller!.port, `/api/projects/${projectId}/materials`, {
      method: "PUT",
      cookie,
      body: { revision: 1, assignment: invalidAssignment }
    });
    expect(invalid.status).toBe(422);

    const reloaded = await requestWorker(controller!.port, `/api/projects/${projectId}/materials`, { cookie });
    const reloadedAssignments = (reloaded.body as { view: { assignments: { revision: number; assignments: Array<Record<string, unknown>> } } }).view.assignments;
    expect(reloadedAssignments.revision).toBe(1);
    expect(reloadedAssignments.assignments.find((item) => item.category === "corpus")?.materialId).toBe(committedId);

    const warnings = await requestWorker(controller!.port, `/api/projects/${projectId}/warnings`, { cookie });
    expect(warnings.status).toBe(200);
    const crossTenant = await requestWorker(controller!.port, `/api/projects/${projectId}/materials`, {
      cookie: makeCookieHeader({ userId: "user_client_b_owner", clientId: "client_b_demo", role: "owner" })
    });
    expect([403, 404]).toContain(crossTenant.status);
  }, 30_000);

  it("runs the supplier bridge assisted session through attachment, idempotent capture and explicit confirmation", async () => {
    const cookie = makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" });
    const created = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie,
      body: { name: "Supplier Bridge Kitchen", address: "Bridge 1", contactName: "Jane" }
    });
    const projectId = (created.body as { project: { projectId: string } }).project.projectId;
    await requestWorker(controller!.port, `/api/projects/${projectId}/save`, {
      method: "POST",
      cookie,
      body: { appState: { layout: { windows: [], doors: [] }, kitchen: {}, modules: [], scene: {} } }
    });

    const started = await requestWorker(controller!.port, `/api/projects/${projectId}/supplier-sync-sessions`, {
      method: "POST",
      cookie,
      body: { supplierId: "mock-supplier" }
    });
    expect(started.status).toBe(201);
    const startedBody = started.body as {
      bridgeToken: string;
      view: { session: { id: string }; currentItem: Record<string, unknown>; counts: { total: number } };
    };
    expect(startedBody.view.counts.total).toBeGreaterThan(0);
    expect(startedBody.bridgeToken).toBeTruthy();

    const attached = await requestWorker(controller!.port, `/api/supplier-bridge/sessions/${startedBody.view.session.id}/attach`, {
      method: "POST",
      body: { bridgeToken: startedBody.bridgeToken }
    });
    expect(attached.status).toBe(200);
    const accessToken = (attached.body as { accessToken: string }).accessToken;
    const replayAttach = await requestWorker(controller!.port, `/api/supplier-bridge/sessions/${startedBody.view.session.id}/attach`, {
      method: "POST",
      body: { bridgeToken: startedBody.bridgeToken }
    });
    expect(replayAttach.status).toBe(401);

    const currentItem = startedBody.view.currentItem;
    const itemId = String(currentItem.id);
    const captured = await requestWorker(controller!.port, `/api/supplier-bridge/sessions/${startedBody.view.session.id}/candidates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        submissionId: "worker-capture-1",
        syncItemId: itemId,
        supplierProductCode: "MOCK-BRIDGE-001",
        normalizedProduct: {
          displayName: "Mock supplier board",
          manufacturer: currentItem.expectedManufacturer,
          decorCode: currentItem.expectedDecorCode,
          surfaceCode: currentItem.expectedSurfaceCode,
          productType: currentItem.expectedProductType,
          thicknessMm: currentItem.expectedThicknessMm,
          widthMm: 2_070,
          lengthMm: 2_800,
          availability: "available"
        },
        sourcePageType: "product",
        sourcePath: "/product/mock-bridge-001",
        observedAt: "2026-07-10T08:00:00.000Z",
        price: {
          supplierAccountId: "mock-account",
          amount: 12.5,
          currency: "EUR",
          priceBasis: "m2",
          vatMode: "excluded",
          minimumQuantity: 1,
          packageQuantity: null,
          rawPriceText: "12,50 € bez DPH",
          rawUnitText: "EUR / m²",
          normalizedAmount: 12.5,
          normalizedPriceBasis: "m2",
          normalizationCalculation: "No unit conversion applied.",
          normalizationConfidence: 0.98,
          observedAt: "2026-07-10T08:00:00.000Z"
        }
      }
    });
    expect(captured.status).toBe(201);
    const capturedBody = captured.body as { candidate: { id: string }; view: { counts: { needsConfirmation: number } }; idempotent: boolean };
    expect(capturedBody.idempotent).toBe(false);
    expect(capturedBody.view.counts.needsConfirmation).toBe(1);
    const replayCapture = await requestWorker(controller!.port, `/api/supplier-bridge/sessions/${startedBody.view.session.id}/candidates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        submissionId: "worker-capture-1",
        syncItemId: itemId,
        supplierProductCode: "MOCK-BRIDGE-001",
        normalizedProduct: {
          displayName: "Mock supplier board",
          manufacturer: currentItem.expectedManufacturer,
          decorCode: currentItem.expectedDecorCode,
          surfaceCode: currentItem.expectedSurfaceCode,
          productType: currentItem.expectedProductType,
          thicknessMm: currentItem.expectedThicknessMm,
          widthMm: 2_070,
          lengthMm: 2_800,
          availability: "available"
        },
        sourcePageType: "product",
        sourcePath: "/product/mock-bridge-001",
        observedAt: "2026-07-10T08:00:00.000Z",
        price: null
      }
    });
    expect(replayCapture.status).toBe(200);
    expect((replayCapture.body as { candidate: { id: string }; idempotent: boolean }).candidate.id).toBe(capturedBody.candidate.id);

    const confirmed = await requestWorker(controller!.port, `/api/supplier-bridge/sessions/${startedBody.view.session.id}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { syncItemId: itemId, candidateId: capturedBody.candidate.id }
    });
    expect(confirmed.status).toBe(200);
    expect((confirmed.body as { view: { counts: { completed: number } } }).view.counts.completed).toBe(1);

    const materials = await requestWorker(controller!.port, `/api/projects/${projectId}/materials`, { cookie });
    const assignments = (materials.body as { view: { assignments: { assignments: Array<Record<string, unknown>> } } }).view.assignments.assignments;
    const updated = assignments.find((assignment) => assignment.assignmentId === currentItem.materialAssignmentId);
    expect(updated?.customValues).toMatchObject({
      supplierBridge: {
        sessionId: startedBody.view.session.id,
        candidateId: capturedBody.candidate.id,
        supplierProductCode: "MOCK-BRIDGE-001"
      }
    });
  }, 30_000);

  it("rejects clientId in project create payload", async () => {
    const response = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }),
      body: { clientId: "client_b_demo", name: "Bad", address: "Main", contactName: "Jane" }
    });
    expect(response.status).toBe(403);
  });

  it("returns a client error for a structurally invalid project JSON body", async () => {
    const response = await requestWorker(controller!.port, "/api/projects", {
      method: "POST",
      cookie: makeCookieHeader({ userId: "user_arcigy_owner", clientId: "client_arcigy_demo", role: "owner" }),
      body: []
    });

    expect(response.status).toBe(400);
    expect((response.body as { error?: string }).error).toBe("Expected JSON body.");
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

  it("keeps project saves, downloads, and version history isolated between clients", async () => {
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
    const saveB = await requestWorker(controller!.port, `/api/projects/${idB}/save`, {
      method: "POST",
      cookie: clientBCookie,
      body: {
        appState: {
          layout: { marker: "client-b-layout", windows: [], doors: [] },
          kitchen: {},
          modules: [],
          scene: {}
        }
      }
    });
    expect(saveB.status).toBe(200);

    const listA = await requestWorker(controller!.port, "/api/projects", { cookie: clientACookie });
    expect(JSON.stringify(listA.body)).toContain("Client A Project");
    expect(JSON.stringify(listA.body)).not.toContain("Client B Project");

    const crossClientRequests = [
      requestWorker(controller!.port, `/api/projects/${idB}/load`, { cookie: clientACookie }),
      requestWorker(controller!.port, `/api/projects/${idB}/download`, { cookie: clientACookie }),
      requestWorker(controller!.port, `/api/projects/${idB}/versions`, { cookie: clientACookie }),
      requestWorker(controller!.port, `/api/projects/${idB}/versions/1/load`, { cookie: clientACookie }),
      requestWorker(controller!.port, `/api/projects/${idB}/save`, {
        method: "POST",
        cookie: clientACookie,
        headers: { "Idempotency-Key": "cross-client-save-denied-0001" },
        body: {
          expectedSaveRevision: 1,
          appState: {
            layout: { marker: "forged-client-a-layout", windows: [], doors: [] },
            kitchen: {},
            modules: [],
            scene: {}
          }
        }
      }),
      requestWorker(controller!.port, `/api/projects/${idB}/versions/1/restore`, {
        method: "POST",
        cookie: clientACookie,
        headers: { "Idempotency-Key": "cross-client-restore-denied-0001" },
        body: {}
      })
    ];
    const crossClientResponses = await Promise.all(crossClientRequests);
    expect(crossClientResponses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);

    const versionsB = await requestWorker(controller!.port, `/api/projects/${idB}/versions`, { cookie: clientBCookie });
    expect((versionsB.body as { versions: unknown[] }).versions).toHaveLength(1);
    const loadB = await requestWorker(controller!.port, `/api/projects/${idB}/load`, { cookie: clientBCookie });
    expect((loadB.body as { save: { appState: { layout: { marker: string } } } }).save.appState.layout.marker)
      .toBe("client-b-layout");
    expect(projectA.status).toBe(201);
  }, 30_000);

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
