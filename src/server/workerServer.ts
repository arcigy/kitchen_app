import http from "node:http";
import { spawn } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { requireClientContextFromCookie } from "../core/client/session-cookie";
import type { UserService } from "../core/auth/user-service";
import type { AuthSessionStore } from "../core/auth/auth-session-store";
import { createStorageService, readScopedStorageFile } from "../core/storage/storageService";
import { createServerProjectRepository } from "./projectRepository";
import {
  createServerAuthSessionStore,
  createServerCatalogRepository,
  createServerModulePackageRepository,
  createServerUserService
} from "./serverRepositories";
import { runBlenderExport } from "./blender/runBlenderExport";
import { createClientCatalogService } from "../core/catalog/catalog-service";
import { CatalogExactLookupCache } from "../core/catalog/catalog-exact-lookup";
import { checkDatabaseReadiness } from "./databaseReadiness";
import { sendResponseBody } from "./http-response-compression";
import { readJsonRequestBody } from "./request-json-body";
import { createHttpRequestMetrics } from "./http-request-metrics";
import { createHttpRequestBudget, type HttpRequestBudget } from "./http-request-budget";
import { createClientJourneyMetrics } from "./clientJourneyMetrics";
import { createWorkerRequestHandler } from "./workerRequestPipeline";
import { handleWorkerApiRequest } from "./workerApiRouter";
import { assertWorkerRuntimeEnvironment } from "./workerRuntimeEnvironment";
import { ClientCatalogBootstrapResponseCache } from "./clientCatalogBootstrapResponseCache";
import { ClientModulePackagesResponseCache } from "./clientModulePackagesResponseCache";

const DEFAULT_PROJECT_ROOT = process.cwd();
type WorkerServerDependencies = {
  userService?: UserService;
  authSessionStore?: AuthSessionStore;
  projectRoot?: string;
  requestBudget?: HttpRequestBudget;
};

const readJsonBody = readJsonRequestBody;

const sendJson = (res: http.ServerResponse, status: number, data: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  sendResponseBody(res, JSON.stringify(data));
};

const sendText = (res: http.ServerResponse, status: number, text: string) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  sendResponseBody(res, text);
};

const getStringField = (value: unknown, field: string): string | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[field] === "string" ? record[field] : undefined;
};

const getRequiredStringField = (value: unknown, field: string): string => {
  const record = getStringField(value, field);
  if (!record) throw new Error(`${field} is required.`);
  return record;
};

const getOptionalFiniteNumber = (value: string | null): number | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getField = (value: unknown, field: string): unknown => {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[field];
};

const contentTypeForFile = (fileName: string) => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".blend")) return "application/octet-stream";
  return "application/octet-stream";
};

assertWorkerRuntimeEnvironment();
const defaultUserService = createServerUserService();
const defaultAuthSessionStore = createServerAuthSessionStore();

async function verifyDatabaseReady(projectRoot: string): Promise<void> {
  const storage = process.env.KITCHEN_PROJECT_STORAGE?.toLowerCase();
  const hasDatabaseUrl = !!(process.env.DATABASE_URL || process.env.KITCHEN_PROJECT_DATABASE_URL || process.env.PROJECT_DATABASE_URL);
  if (storage === "file" || (storage !== "postgres" && !hasDatabaseUrl)) return;
  const repository = createServerProjectRepository({ projectRoot });
  await repository.listProjects({ userId: "__startup_check", clientId: "__startup_check", role: "viewer" });
}

const getValidatedClientContext = (
  cookieHeader: string | string[] | undefined,
  userService?: UserService,
  authSessionStore?: AuthSessionStore
) =>
  requireClientContextFromCookie(cookieHeader, {
    sessionLookup: (session) => (authSessionStore ?? defaultAuthSessionStore).isActive(session),
    userLookup: async (userId) => {
      const user = await (userService ?? defaultUserService).getUserById(userId);
      return user ? { isActive: user.isActive, clientId: user.clientId, role: user.role } : null;
    }
  });

const isUnexpectedClientId = (body: unknown): boolean => {
  return getStringField(body, "clientId") !== undefined;
};

const validateAndGetProjectAndPhase = (body: unknown) => {
  const projectId = getRequiredStringField(body, "projectId");
  const phaseId = getRequiredStringField(body, "phaseId");
  return { projectId, phaseId };
};

const serveStorageFile = async (
  req: http.IncomingMessage,
  reqUrl: URL,
  res: http.ServerResponse,
  userService: UserService,
  authSessionStore: AuthSessionStore,
  projectRoot: string
) => {
  const context = await getValidatedClientContext(req.headers.cookie, userService, authSessionStore);
  const file = await readScopedStorageFile(projectRoot, context, reqUrl.pathname);
  res.statusCode = 200;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", contentTypeForFile(file.fileName));
  res.end(file.buffer);
};

const handleCatalog = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  userService: UserService,
  authSessionStore: AuthSessionStore,
  projectRoot: string
) => {
  const context = await getValidatedClientContext(req.headers.cookie, userService, authSessionStore);
  const repository = createServerCatalogRepository(projectRoot);
  const catalog = await repository.ensureCatalogExists(context);
  return sendJson(res, 200, { ok: true, catalog });
};

const handleCatalogLookup = async (
  req: http.IncomingMessage,
  reqUrl: URL,
  res: http.ServerResponse,
  userService: UserService,
  authSessionStore: AuthSessionStore,
  projectRoot: string
) => {
  const context = await getValidatedClientContext(req.headers.cookie, userService, authSessionStore);
  const kind = reqUrl.searchParams.get("kind");
  const repository = createServerCatalogRepository(projectRoot);
  const service = createClientCatalogService({ context, repository });

  if (kind === "vendor_product") {
    const resolution = await service.resolveVendorProductVariant({
      articleFamily: reqUrl.searchParams.get("articleFamily") ?? undefined,
      widthMm: getOptionalFiniteNumber(reqUrl.searchParams.get("widthMm")),
      widthCm: getOptionalFiniteNumber(reqUrl.searchParams.get("widthCm")),
      variantCode: reqUrl.searchParams.get("variantCode") ?? undefined,
      productTemplateName: reqUrl.searchParams.get("productTemplateName") ?? undefined,
      catalogKey: reqUrl.searchParams.get("catalogKey") ?? undefined,
      minConfidence: getOptionalFiniteNumber(reqUrl.searchParams.get("minConfidence"))
    });
    return sendJson(res, resolution.status === "missing" ? 404 : 200, { ok: resolution.status !== "missing", resolution });
  }

  if (kind === "vendor_module") {
    const resolution = await service.resolveVendorModulePackage({
      moduleType: reqUrl.searchParams.get("moduleType") ?? undefined,
      articleFamily: reqUrl.searchParams.get("articleFamily") ?? undefined,
      widthMm: getOptionalFiniteNumber(reqUrl.searchParams.get("widthMm")),
      widthCm: getOptionalFiniteNumber(reqUrl.searchParams.get("widthCm")),
      variantCode: reqUrl.searchParams.get("variantCode") ?? undefined,
      productTemplateName: reqUrl.searchParams.get("productTemplateName") ?? undefined,
      catalogKey: reqUrl.searchParams.get("catalogKey") ?? undefined,
      minConfidence: getOptionalFiniteNumber(reqUrl.searchParams.get("minConfidence"))
    });
    return sendJson(res, resolution.status === "missing" ? 404 : 200, { ok: resolution.status !== "missing", resolution });
  }

  if (kind === "vendor_module_seed") {
    const resolution = await service.resolveVendorModuleSeed({
      moduleType: reqUrl.searchParams.get("moduleType") ?? undefined,
      articleFamily: reqUrl.searchParams.get("articleFamily") ?? undefined,
      widthMm: getOptionalFiniteNumber(reqUrl.searchParams.get("widthMm")),
      widthCm: getOptionalFiniteNumber(reqUrl.searchParams.get("widthCm")),
      variantCode: reqUrl.searchParams.get("variantCode") ?? undefined,
      productTemplateName: reqUrl.searchParams.get("productTemplateName") ?? undefined,
      catalogKey: reqUrl.searchParams.get("catalogKey") ?? undefined,
      minConfidence: getOptionalFiniteNumber(reqUrl.searchParams.get("minConfidence")),
      applianceCategory: reqUrl.searchParams.get("applianceCategory") ?? undefined,
      applianceWidthMm: getOptionalFiniteNumber(reqUrl.searchParams.get("applianceWidthMm")),
      applianceHeightMm: getOptionalFiniteNumber(reqUrl.searchParams.get("applianceHeightMm")),
      applianceDepthMm: getOptionalFiniteNumber(reqUrl.searchParams.get("applianceDepthMm"))
    });
    return sendJson(res, resolution.status === "missing" ? 404 : 200, { ok: resolution.status !== "missing", resolution });
  }

  if (kind === "vendor_catalog_groups") {
    const groups = await service.listVendorCatalogGroups({
      includeNeedsReview: reqUrl.searchParams.get("includeNeedsReview") === "true",
      placementZone: (reqUrl.searchParams.get("placementZone") as "low" | "corner_low" | "tall" | "tall_appliance" | "accessory" | "unknown" | "any" | null) ?? "any",
      kitchenModuleRole: (reqUrl.searchParams.get("kitchenModuleRole") as "base" | "top" | "tall" | "accessory" | "unknown" | "any" | null) ?? "any",
      moduleClass: (reqUrl.searchParams.get("moduleClass") as "base" | "corner_base" | "tall" | "appliance_tall" | "accessory" | "unknown" | "any" | null) ?? "any"
    });
    return sendJson(res, 200, { ok: true, groups });
  }

  if (kind === "vendor_catalog_templates") {
    const templates = await service.listVendorCatalogTemplates({
      groupId: reqUrl.searchParams.get("groupId") ?? undefined,
      includeNeedsReview: reqUrl.searchParams.get("includeNeedsReview") === "true",
      placementZone: (reqUrl.searchParams.get("placementZone") as "low" | "corner_low" | "tall" | "tall_appliance" | "accessory" | "unknown" | "any" | null) ?? "any",
      kitchenModuleRole: (reqUrl.searchParams.get("kitchenModuleRole") as "base" | "top" | "tall" | "accessory" | "unknown" | "any" | null) ?? "any",
      moduleClass: (reqUrl.searchParams.get("moduleClass") as "base" | "corner_base" | "tall" | "appliance_tall" | "accessory" | "unknown" | "any" | null) ?? "any"
    });
    return sendJson(res, 200, { ok: true, templates });
  }

  return sendJson(res, 400, { ok: false, error: "kind must be material, component, vendor_product, vendor_module, vendor_module_seed, vendor_catalog_groups, or vendor_catalog_templates." });
};

const readProjectJson = async (projectRoot: string, relativePath: string) => {
  const raw = await readFile(path.join(projectRoot, relativePath), "utf-8");
  return JSON.parse(raw) as unknown;
};

const CSV_REFERENCE_IMAGE_FIELDS = [
  "texture_image_url",
  "texture_image_thumb_url",
  "demosReferenceImageUrl",
  "referenceImageUrl",
  "imageUrl",
  "image",
  "imgUrl",
  "img",
  "thumbnailUrl",
  "thumbnail",
  "pictureUrl",
  "photoUrl"
];

const CSV_REFERENCE_PAGE_FIELDS = [
  "demosReferencePageUrl",
  "demosUrl",
  "vendorUrl",
  "productUrl",
  "decorUrl",
  "pageUrl",
  "url",
  "link"
];

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
};

const parseCsvRows = (raw: string): Record<string, string>[] => {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  const headers = parseCsvLine(lines[0] || "").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ""]));
  });
};

const listCsvFiles = async (dir: string): Promise<string[]> => {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listCsvFiles(fullPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".csv") ? [fullPath] : [];
  }));
  return files.flat();
};

const firstCsvValue = (row: Record<string, string>, fields: string[]): string => {
  const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
  for (const field of fields) {
    const value = lower[field.toLowerCase()];
    if (value && /^https?:\/\//i.test(value)) return value;
  }
  return "";
};

const firstCsvText = (row: Record<string, string>, fields: string[]): string => {
  const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
  for (const field of fields) {
    const value = lower[field.toLowerCase()];
    if (value && value.trim()) return value.trim();
  }
  return "";
};

const buildDemosReferenceIndex = async (projectRoot: string) => {
  const csvFiles = await listCsvFiles(path.join(projectRoot, "backend", "materials", "imports"));
  const index = new Map<string, { demosReferenceImageUrl?: string; demosReferencePageUrl?: string; demosReferenceSource: string }>();
  for (const csvFile of csvFiles) {
    const rows = parseCsvRows(await readFile(csvFile, "utf-8"));
    for (const row of rows) {
      const vendorDecorId = row.vendorDecorId?.trim();
      if (!vendorDecorId || index.has(vendorDecorId)) continue;
      const demosReferenceImageUrl = firstCsvValue(row, CSV_REFERENCE_IMAGE_FIELDS);
      const demosReferencePageUrl = firstCsvValue(row, CSV_REFERENCE_PAGE_FIELDS);
      if (demosReferenceImageUrl || demosReferencePageUrl) {
        index.set(vendorDecorId, {
          demosReferenceImageUrl: demosReferenceImageUrl || undefined,
          demosReferencePageUrl: demosReferencePageUrl || undefined,
          demosReferenceSource: path.relative(projectRoot, csvFile).replaceAll("\\", "/")
        });
      }
    }
  }
  return index;
};

const normalizeDemosCsvBoard = (projectRoot: string, row: Record<string, string>, csvFile: string) => {
  const vendorDecorId = firstCsvText(row, ["vendorDecorId", "id", "decorId", "productId"]);
  const displayName = firstCsvText(row, ["displayName", "name", "title", "decorName", "productName", "nazov", "názov"]) || vendorDecorId;
  const demosReferenceImageUrl = firstCsvValue(row, CSV_REFERENCE_IMAGE_FIELDS);
  const demosReferencePageUrl = firstCsvValue(row, CSV_REFERENCE_PAGE_FIELDS);
  return {
    catalogType: "demosCsvBoard",
    vendor: firstCsvText(row, ["vendor"]) || "demos",
    vendorDecorId,
    vendorSku: firstCsvText(row, ["vendorSku", "sku", "code", "productCode"]),
    displayName,
    slug: firstCsvText(row, ["slug"]),
    materialType: firstCsvText(row, ["materialType"]),
    decorFamily: firstCsvText(row, ["decorFamily"]),
    colorFamily: firstCsvText(row, ["colorFamily"]),
    surfaceHint: firstCsvText(row, ["surfaceHint"]),
    targetInternalMaterialId: firstCsvText(row, ["targetInternalMaterialId", "materialId"]),
    proceduralTemplate: firstCsvText(row, ["proceduralTemplate"]),
    grainPatternId: firstCsvText(row, ["grainPatternId"]),
    surfaceProfile: firstCsvText(row, ["surfaceProfile"]),
    colorPreviewHex: firstCsvText(row, ["colorPreviewHex", "baseColorHex"]),
    baseColorHex: firstCsvText(row, ["baseColorHex"]),
    grainColorHex: firstCsvText(row, ["grainColorHex"]),
    tintStrength: Number(firstCsvText(row, ["tintStrength"])) || undefined,
    grainContrast: Number(firstCsvText(row, ["grainContrast"])) || undefined,
    roughnessMultiplier: Number(firstCsvText(row, ["roughnessMultiplier"])) || undefined,
    roughnessOverride: firstCsvText(row, ["roughnessOverride"]) ? Number(firstCsvText(row, ["roughnessOverride"])) : null,
    bumpMultiplier: Number(firstCsvText(row, ["bumpMultiplier"])) || undefined,
    grainDepth: Number(firstCsvText(row, ["grainDepth"])) || undefined,
    coatMultiplier: Number(firstCsvText(row, ["coatMultiplier"])) || undefined,
    tileSizeMeters: Number(firstCsvText(row, ["tileSizeMeters"])) || undefined,
    uvScale: Number(firstCsvText(row, ["uvScale"])) || undefined,
    grainDirectionDefault: firstCsvText(row, ["grainDirectionDefault"]),
    mappingStatus: firstCsvText(row, ["mappingStatus"]) || "needs_review",
    mappingLocked: /^true$/i.test(firstCsvText(row, ["mappingLocked"])),
    confidence: Number(firstCsvText(row, ["confidence"])) || 0,
    productionSafe: false,
    usesExternalVendorTexture: false,
    demosReferenceImageUrl,
    demosReferencePageUrl,
    demosReferenceSource: path.relative(projectRoot, csvFile).replaceAll("\\", "/"),
    rawCsv: row
  };
};

const loadDemosCsvBoards = async (projectRoot: string) => {
  const csvFiles = await listCsvFiles(path.join(projectRoot, "backend", "materials", "imports"));
  const boards: ReturnType<typeof normalizeDemosCsvBoard>[] = [];
  const seen = new Set<string>();
  for (const csvFile of csvFiles) {
    const rows = parseCsvRows(await readFile(csvFile, "utf-8"));
    const headers = new Set(Object.keys(rows[0] || {}).map((key) => key.toLowerCase()));
    if (["basecolorsource", "normalsource", "roughnesssource"].some((field) => headers.has(field))) continue;
    for (const row of rows) {
      const board = normalizeDemosCsvBoard(projectRoot, row, csvFile);
      const key = board.vendorDecorId || `${board.displayName}:${boards.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      boards.push(board);
    }
  }
  const withImages = boards.filter((board) => board.demosReferenceImageUrl);
  return withImages.length > 0 ? withImages : boards;
};

const enrichCatalogWithDemosReferences = (catalog: unknown, references: Awaited<ReturnType<typeof buildDemosReferenceIndex>>) => {
  if (!Array.isArray(catalog)) return catalog;
  return catalog.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const record = entry as Record<string, unknown>;
    const vendorDecorId = typeof record.vendorDecorId === "string" ? record.vendorDecorId : "";
    const reference = references.get(vendorDecorId);
    return reference ? { ...record, ...reference } : record;
  });
};

const handleMaterialProofCatalogs = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  userService: UserService,
  authSessionStore: AuthSessionStore,
  projectRoot: string
) => {
  await getValidatedClientContext(req.headers.cookie, userService, authSessionStore);
  const [productionRaw, stagingRaw, references, csvBoards] = await Promise.all([
    readProjectJson(projectRoot, "backend/materials/material_frontend_catalog.json"),
    readProjectJson(projectRoot, "backend/materials/material_frontend_catalog_staging.json"),
    buildDemosReferenceIndex(projectRoot),
    loadDemosCsvBoards(projectRoot)
  ]);
  const production = enrichCatalogWithDemosReferences(productionRaw, references);
  const staging = enrichCatalogWithDemosReferences(stagingRaw, references);
  return sendJson(res, 200, { production, staging, csvBoards });
};

const handleExport = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  userService: UserService,
  authSessionStore: AuthSessionStore,
  projectRoot: string
) => {
  const context = await getValidatedClientContext(req.headers.cookie, userService, authSessionStore);
  const body = await readJsonBody(req);

  if (isUnexpectedClientId(body)) {
    return sendJson(res, 400, { ok: false, error: "Unexpected clientId in request body." });
  }

  const { projectId, phaseId } = validateAndGetProjectAndPhase(body);
  const sceneJson = getField(body, "sceneJson");
  if (!sceneJson || typeof sceneJson !== "object") {
    throw new Error("sceneJson is required.");
  }
  const storage = await createStorageService({ projectRoot, context, projectId, phaseId });
  const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "").replaceAll("-", "").slice(0, 15);
  const sceneFileName = `scene-${stamp}.json`;
  const blendFileName = `scene-${stamp}.blend`;
  const previewFileName = `preview-${stamp}.png`;

  const result = await runBlenderExport({
    sceneJson,
    storage,
    sceneFileName,
    blendFileName,
    previewFileName,
    projectRoot,
    timeoutMs: 60_000
  });

  if (!result.previewPath) throw new Error("Preview render was not produced.");
  await access(result.previewPath);

  const previewUrl = `${storage.getStorageUrl("renders", previewFileName)}?t=${Date.now()}`;
  sendJson(res, 200, {
    ok: true,
    previewUrl,
    jsonPath: result.jsonPath,
    blendPath: result.blendPath,
    previewPath: result.previewPath
  });
};

const assertOpenableBlenderOutputPath = (projectRoot: string, filePath: string): string => {
  const resolved = path.resolve(filePath);
  const storageRoot = path.resolve(projectRoot, "storage");
  const rel = path.relative(storageRoot, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("File path is outside storage.");
  }
  const lower = resolved.toLowerCase();
  if (!lower.endsWith(".blend") && !lower.endsWith(".png")) {
    throw new Error("Only .blend and .png Blender outputs can be opened.");
  }
  return resolved;
};

const openFileInDesktop = (filePath: string) => {
  let child;
  if (process.platform === "win32") {
    child = spawn("powershell.exe", ["-NoProfile", "-Command", "Start-Process -LiteralPath $args[0]", filePath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
  } else if (process.platform === "darwin") {
    child = spawn("open", [filePath], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("xdg-open", [filePath], { detached: true, stdio: "ignore" });
  }
  child.unref();
};

const handleOpenBlenderOutput = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  userService: UserService,
  authSessionStore: AuthSessionStore,
  projectRoot: string
) => {
  await getValidatedClientContext(req.headers.cookie, userService, authSessionStore);
  const body = await readJsonBody(req);
  const filePath = getRequiredStringField(body, "path");
  const resolved = assertOpenableBlenderOutputPath(projectRoot, filePath);
  await access(resolved);
  openFileInDesktop(resolved);
  return sendJson(res, 200, { ok: true, path: resolved });
};

export function startWorkerServer(
  port = Number(process.env.BLENDER_WORKER_PORT || 5191),
  host = process.env.BLENDER_WORKER_HOST || "127.0.0.1",
  dependencies: WorkerServerDependencies = {}
) {
  const userService = dependencies.userService ?? defaultUserService;
  const authSessionStore = dependencies.authSessionStore ?? defaultAuthSessionStore;
  const projectRoot = dependencies.projectRoot ?? process.env.KITCHEN_APP_PROJECT_ROOT ?? DEFAULT_PROJECT_ROOT;
  const catalogLookupCache = new CatalogExactLookupCache();
  const clientCatalogBootstrapResponseCache = new ClientCatalogBootstrapResponseCache();
  const clientModulePackagesResponseCache = new ClientModulePackagesResponseCache();
  const requestMetrics = createHttpRequestMetrics();
  const clientJourneyMetrics = createClientJourneyMetrics();
  const requestBudget = dependencies.requestBudget ?? createHttpRequestBudget();
  const getClientContext = (cookieHeader: string | string[] | undefined) =>
    getValidatedClientContext(cookieHeader, userService, authSessionStore);
  const server = http.createServer(createWorkerRequestHandler({
    host,
    port,
    userService,
    authSessionStore,
    requestMetrics,
    clientJourneyMetrics,
    requestBudget,
    readJsonBody,
    sendJson,
    sendText,
    checkReadiness: checkDatabaseReadiness,
    getClientContext,
    handleApplicationRequest: (req, res, url) => handleWorkerApiRequest(req, res, url, {
      projectRoot,
      getClientContext,
      readJsonBody,
      sendJson,
      clientCatalogBootstrapResponseCache,
      clientModulePackagesResponseCache,
      catalogLookupCache,
      createCatalogRepository: () => createServerCatalogRepository(projectRoot),
      createModulePackageRepository: () => createServerModulePackageRepository(projectRoot),
      handleCatalog: (request, response) => handleCatalog(request, response, userService, authSessionStore, projectRoot),
      handleCatalogLookup: (request, requestUrl, response) =>
        handleCatalogLookup(request, requestUrl, response, userService, authSessionStore, projectRoot),
      handleMaterialProofCatalogs: (request, response) =>
        handleMaterialProofCatalogs(request, response, userService, authSessionStore, projectRoot),
      handleStorageFile: (request, requestUrl, response) =>
        serveStorageFile(request, requestUrl, response, userService, authSessionStore, projectRoot),
      handleExport: (request, response) => handleExport(request, response, userService, authSessionStore, projectRoot),
      handleOpenBlenderOutput: (request, response) =>
        handleOpenBlenderOutput(request, response, userService, authSessionStore, projectRoot),
      handleNotFound: async (_request, response) => sendText(response, 404, "Not found")
    })
  }));

  server.listen(port, host, () => {
    console.log(`[blender-worker] listening on http://${host}:${port}`);
    void verifyDatabaseReady(projectRoot).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[blender-worker] database startup check failed: ${message}`);
      server.close(() => {
        process.exitCode = 1;
      });
    });
  });
  return server;
}
