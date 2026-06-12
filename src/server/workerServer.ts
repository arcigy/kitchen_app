import http from "node:http";
import { spawn } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { requireClientContextFromCookie } from "../core/client/session-cookie";
import type { UserService } from "../core/auth/user-service";
import { createStorageService, readScopedStorageFile } from "../core/storage/storageService";
import { handleAuthLogin, handleAuthLogout, handleAuthSession } from "./authEndpoint";
import { handleModulePackageApi } from "./modulePackageEndpoint";
import { handleProjectApi } from "./projectEndpoint";
import { createServerProjectRepository } from "./projectRepository";
import { createServerCatalogRepository, createServerUserService } from "./serverRepositories";
import { handleDemosMaterialImage, handleDemosMaterialLookup } from "./demosMaterialLookup";
import { runBlenderExport } from "./blender/runBlenderExport";

const PROJECT_ROOT = process.cwd();
const DEFAULT_PROJECT_ROOT = process.cwd();
type WorkerServerDependencies = {
  userService?: UserService;
  projectRoot?: string;
};

const readJsonBody = async (req: http.IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf-8");
  return JSON.parse(raw) as unknown;
};

const sendJson = (res: http.ServerResponse, status: number, data: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
};

const sendText = (res: http.ServerResponse, status: number, text: string) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(text);
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

const defaultUserService = createServerUserService();

async function verifyDatabaseReady(projectRoot: string): Promise<void> {
  const storage = process.env.KITCHEN_PROJECT_STORAGE?.toLowerCase();
  const hasDatabaseUrl = !!(process.env.DATABASE_URL || process.env.KITCHEN_PROJECT_DATABASE_URL || process.env.PROJECT_DATABASE_URL);
  if (storage === "file" || (storage !== "postgres" && !hasDatabaseUrl)) return;
  const repository = createServerProjectRepository({ projectRoot });
  await repository.listProjects({ userId: "__startup_check", clientId: "__startup_check", role: "viewer" });
}

const getValidatedClientContext = (cookieHeader: string | string[] | undefined, userService?: UserService) =>
  requireClientContextFromCookie(cookieHeader, {
    userLookup: async (userId) => {
      const user = await (userService ?? defaultUserService).getUserById(userId);
      return user ? { isActive: user.isActive } : null;
    }
  });

const forbiddenErrorMessagePatterns = [
  "Current session cannot access the requested client.",
  "Current session cannot access the requested client storage.",
  "Project does not belong to the current client.",
  "Phase does not belong to the requested project.",
  "Project ownership metadata is missing.",
  "Project ownership metadata is invalid.",
  "Invalid storage URL.",
  "Unsupported storage bucket.",
  "bucket is required.",
  "fileName contains an unsafe path segment.",
  "fileName is required.",
  "Unexpected clientId in request body.",
  "Imported project belongs to a different client.",
  "Project save belongs to a different client."
];

const getErrorCode = (error: unknown): number => {
  if (error instanceof SyntaxError) return 400;
  if (error instanceof Error) {
    if (error.message === "Missing authenticated client session.") return 401;
    if (error.message === "Imported projectId already exists.") return 409;
    if (error.message.startsWith("Invalid FurnQuote module package:")) return 400;
    if (error.message === "Module import body is required.") return 400;
    if (error.message.endsWith(" is required.")) return 400;
    if (forbiddenErrorMessagePatterns.some((messagePattern) => error.message.includes(messagePattern))) return 403;
    if (error.message.includes("Invalid storage URL")) return 400;
    if (error.message === "Storage file not found.") return 404;
    if ("code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return 404;
  }
  return 500;
};

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
  projectRoot: string
) => {
  const context = await getValidatedClientContext(req.headers.cookie, userService);
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
  projectRoot: string
) => {
  const context = await getValidatedClientContext(req.headers.cookie, userService);
  const repository = createServerCatalogRepository(projectRoot);
  const catalog = await repository.ensureCatalogExists(context);
  return sendJson(res, 200, { ok: true, catalog });
};

const handleCatalogLookup = async (
  req: http.IncomingMessage,
  reqUrl: URL,
  res: http.ServerResponse,
  userService: UserService,
  projectRoot: string
) => {
  const context = await getValidatedClientContext(req.headers.cookie, userService);
  const kind = reqUrl.searchParams.get("kind");
  const id = (reqUrl.searchParams.get("id") ?? "").trim();
  if (!id) return sendJson(res, 400, { ok: false, error: "id is required." });
  const repository = createServerCatalogRepository(projectRoot);
  const catalog = await repository.ensureCatalogExists(context);

  if (kind === "material") {
    const family = reqUrl.searchParams.get("family") ?? "";
    const material = catalog.materials.find(
      (item) =>
        item.id === id &&
        item.materialType === "board" &&
        item.isActive &&
        (!family || item.boardFamily === family)
    ) ?? null;
    return sendJson(res, material ? 200 : 404, { ok: !!material, material });
  }

  if (kind === "component") {
    const componentType = reqUrl.searchParams.get("componentType") ?? "";
    const component = catalog.components.find(
      (item) => item.id === id && item.isActive && (!componentType || item.componentType === componentType)
    ) ?? null;
    return sendJson(res, component ? 200 : 404, { ok: !!component, component });
  }

  return sendJson(res, 400, { ok: false, error: "kind must be material or component." });
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
  projectRoot: string
) => {
  await getValidatedClientContext(req.headers.cookie, userService);
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
  projectRoot: string
) => {
  const context = await getValidatedClientContext(req.headers.cookie, userService);
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
  projectRoot: string
) => {
  await getValidatedClientContext(req.headers.cookie, userService);
  const body = await readJsonBody(req);
  const filePath = getRequiredStringField(body, "path");
  const resolved = assertOpenableBlenderOutputPath(projectRoot, filePath);
  await access(resolved);
  openFileInDesktop(resolved);
  return sendJson(res, 200, { ok: true, path: resolved });
};

const createRequestUrl = (req: http.IncomingMessage, host: string, port: number) => {
  const protocolHost = req.headers.host || `${host}:${port}`;
  return new URL(req.url || "/", `http://${protocolHost}`);
};

export function startWorkerServer(
  port = Number(process.env.BLENDER_WORKER_PORT || 5191),
  host = process.env.BLENDER_WORKER_HOST || "127.0.0.1",
  dependencies: WorkerServerDependencies = {}
) {
  const userService = dependencies.userService ?? defaultUserService;
  const projectRoot = dependencies.projectRoot ?? process.env.KITCHEN_APP_PROJECT_ROOT ?? DEFAULT_PROJECT_ROOT;
  const server = http.createServer(async (req, res) => {
    try {
      const url = createRequestUrl(req, host, port);

      if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { ok: true });

      if (req.method === "POST" && url.pathname === "/api/auth/login") return await handleAuthLogin(req, res, readJsonBody, sendJson, { userService });

      if (req.method === "GET" && url.pathname === "/api/auth/session") return handleAuthSession(req, res, sendJson, { userService });

      if (req.method === "POST" && url.pathname === "/api/auth/logout") return handleAuthLogout(req, res, sendJson);

      if (req.method === "GET" && url.pathname === "/api/catalog") return await handleCatalog(req, res, userService, projectRoot);

      if (req.method === "GET" && url.pathname === "/api/catalog/lookup")
        return await handleCatalogLookup(req, url, res, userService, projectRoot);

      if (req.method === "GET" && url.pathname === "/api/material-proof/catalogs")
        return await handleMaterialProofCatalogs(req, res, userService, projectRoot);

      if (req.method === "GET" && url.pathname === "/api/demos/material-lookup")
        return await handleDemosMaterialLookup(url, res, sendJson);

      if (req.method === "GET" && url.pathname === "/api/demos/material-image")
        return await handleDemosMaterialImage(url, res);

      if (
        await handleModulePackageApi(req, res, url, {
          projectRoot,
          getContext: (cookieHeader) => getValidatedClientContext(cookieHeader, userService),
          readJsonBody,
          sendJson
        })
      ) return;

      if (
        await handleProjectApi(req, res, url, {
          projectRoot,
          getContext: (cookieHeader) => getValidatedClientContext(cookieHeader, userService),
          readJsonBody,
          sendJson
        })
      ) return;

      if (req.method === "GET" && url.pathname.startsWith("/storage/")) return await serveStorageFile(req, url, res, userService, projectRoot);

      if (req.method === "POST" && url.pathname === "/api/blender/export")
        return await handleExport(req, res, userService, projectRoot);

      if (req.method === "POST" && url.pathname === "/api/blender/open-output")
        return await handleOpenBlenderOutput(req, res, userService, projectRoot);

      return sendText(res, 404, "Not found");
    } catch (err: unknown) {
      const status = getErrorCode(err);
      const message = err instanceof Error ? err.message : String(err);
      return sendJson(res, status, { ok: false, error: message });
    }
  });

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
