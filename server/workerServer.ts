import http from "node:http";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { requireClientContextFromCookie } from "../src/core/client/session-cookie";
import { createUserService } from "../src/core/auth/user-service";
import { createInMemoryUserRepository } from "../src/core/auth/user-repository";
import { createFileClientCatalogRepository } from "../src/core/catalog/catalog-file-repository";
import { createStorageService, readScopedStorageFile } from "../src/core/storage/storageService";
import { handleAuthLogin, handleAuthLogout, handleAuthSession } from "../src/server/authEndpoint";
import { handleModulePackageApi } from "../src/server/modulePackageEndpoint";
import { handleProjectApi } from "../src/server/projectEndpoint";
import { handleDemosMaterialImage, handleDemosMaterialLookup } from "../src/server/demosMaterialLookup";
import { runBlenderExport } from "./blender/runBlenderExport";
import { handlePageVisionValidator } from "./pageVisionValidatorEndpoint";
import { handleRoomDetailVision } from "./roomDetailVisionEndpoint";

const PROJECT_ROOT = process.cwd();
const serverUserService = createUserService(createInMemoryUserRepository());
const DEMOS_PREVIEW_COLOR_CACHE_PATH = path.join(PROJECT_ROOT, "backend/materials/demos_preview_color_cache.json");
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

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

const STATIC_MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const getStaticMimeType = (filePath: string): string => {
  return STATIC_MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
};

const resolveStaticFilePath = (staticRoot: string, pathname: string): string | null => {
  const decoded = decodeURIComponent(pathname);
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return null;
  return path.join(staticRoot, normalized);
};

const serveStaticApp = async (req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> => {
  const staticRoot = process.env.KITCHEN_STATIC_ROOT;
  if (!staticRoot || (req.method !== "GET" && req.method !== "HEAD")) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/storage/")) return false;

  const requestedFile = resolveStaticFilePath(staticRoot, url.pathname);
  if (!requestedFile) return sendText(res, 400, "Invalid static path."), true;

  try {
    await access(requestedFile);
    res.statusCode = 200;
    res.setHeader("Content-Type", getStaticMimeType(requestedFile));
    res.setHeader("Cache-Control", requestedFile.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable");
    if (req.method === "HEAD") return res.end(), true;
    res.end(await readFile(requestedFile));
    return true;
  } catch {
    const indexPath = path.join(staticRoot, "index.html");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    if (req.method === "HEAD") return res.end(), true;
    res.end(await readFile(indexPath));
    return true;
  }
};

const port = Number(process.env.BLENDER_WORKER_PORT || 5191);
const host = process.env.BLENDER_WORKER_HOST || "127.0.0.1";

const getValidatedClientContext = async (cookieHeader: string | string[] | undefined) => {
  return requireClientContextFromCookie(cookieHeader, {
    userLookup: async (userId) => {
      const user = await serverUserService.getUserById(userId);
      return user ? { isActive: user.isActive } : null;
    }
  });
};

const isUnauthorizedError = (error: Error): boolean => error.message === "Missing authenticated client session.";
const isForbiddenError = (error: Error): boolean => {
  return [
    "Current session cannot access the requested client.",
    "Current session cannot access the requested client storage.",
    "Project does not belong to the current client.",
    "Phase does not belong to the requested project.",
    "Project ownership metadata is missing.",
    "Project ownership metadata is invalid.",
    "Unsupported storage bucket.",
    "bucket is required.",
    "fileName contains an unsafe path segment.",
    "fileName is required.",
    "Unexpected clientId in request body.",
    "Imported project belongs to a different client.",
    "Project save belongs to a different client."
  ].some((message) => error.message.includes(message));
};

const getStringField = (value: unknown, field: string): string | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[field] === "string" ? record[field] : undefined;
};

const getField = (value: unknown, field: string): unknown => {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[field];
};

const contentTypeForFile = (fileName: string) => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".blend")) return "application/octet-stream";
  return "application/octet-stream";
};

const serveStorageFile = async (req: http.IncomingMessage, reqUrl: URL, res: http.ServerResponse) => {
  const context = await getValidatedClientContext(req.headers.cookie);
  const file = await readScopedStorageFile(PROJECT_ROOT, context, reqUrl.pathname);
  res.statusCode = 200;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", contentTypeForFile(file.fileName));
  res.end(file.buffer);
};

const serveMaterialProofAsset = async (reqUrl: URL, res: http.ServerResponse) => {
  const relativePath = reqUrl.searchParams.get("path") || "";
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized.startsWith("assets/materials/") || normalized.includes("..")) {
    return sendText(res, 400, "Invalid material asset path.");
  }
  const filePath = path.join(PROJECT_ROOT, normalized);
  await access(filePath);
  res.statusCode = 200;
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Type", contentTypeForFile(filePath));
  res.end(await readFile(filePath));
};

const serveMaterialProofReferenceImage = async (reqUrl: URL, res: http.ServerResponse) => {
  const imageUrl = reqUrl.searchParams.get("url") || "";
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return sendText(res, 400, "Invalid reference image URL.");
  }
  if (!["https:", "http:"].includes(parsed.protocol) || !parsed.hostname.endsWith("demos-trade.sk")) {
    return sendText(res, 400, "Unsupported reference image host.");
  }
  const response = await fetch(parsed);
  if (!response.ok) return sendText(res, 502, `Failed to fetch reference image: ${response.status}`);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  res.statusCode = 200;
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Type", contentType);
  res.end(Buffer.from(await response.arrayBuffer()));
};

type DemosPreviewColorCache = Record<string, { hex: string; samples: string[]; updatedAt: string }>;

const isAllowedDemosImageUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.endsWith("demos-trade.sk");
  } catch {
    return false;
  }
};

const readDemosPreviewColorCache = async (): Promise<DemosPreviewColorCache> => {
  try {
    const parsed = JSON.parse(await readFile(DEMOS_PREVIEW_COLOR_CACHE_PATH, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as DemosPreviewColorCache;
  } catch {
    return {};
  }
};

const writeDemosPreviewColorCache = async (cache: DemosPreviewColorCache) => {
  await mkdir(path.dirname(DEMOS_PREVIEW_COLOR_CACHE_PATH), { recursive: true });
  await writeFile(DEMOS_PREVIEW_COLOR_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
};

const handleDemosPreviewColorCache = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  reqUrl: URL
) => {
  await getValidatedClientContext(req.headers.cookie);
  if (req.method === "GET") {
    const imageUrl = reqUrl.searchParams.get("url") ?? "";
    if (!isAllowedDemosImageUrl(imageUrl)) return sendJson(res, 400, { ok: false, error: "Invalid Demos image URL" });
    const cached = (await readDemosPreviewColorCache())[imageUrl] ?? null;
    return sendJson(res, 200, { ok: true, color: cached });
  }

  const body = await readJsonBody(req) as Record<string, unknown>;
  const imageUrl = typeof body.url === "string" ? body.url : "";
  const hex = typeof body.hex === "string" ? body.hex.toLowerCase() : "";
  const samples = Array.isArray(body.samples)
    ? body.samples.filter((value): value is string => typeof value === "string" && HEX_RE.test(value.toLowerCase())).map((value) => value.toLowerCase())
    : [];
  if (!isAllowedDemosImageUrl(imageUrl)) return sendJson(res, 400, { ok: false, error: "Invalid Demos image URL" });
  if (!HEX_RE.test(hex)) return sendJson(res, 400, { ok: false, error: "Invalid HEX color" });
  const cache = await readDemosPreviewColorCache();
  cache[imageUrl] = { hex, samples, updatedAt: new Date().toISOString() };
  await writeDemosPreviewColorCache(cache);
  return sendJson(res, 200, { ok: true, color: cache[imageUrl] });
};

const getRequiredStringField = (value: unknown, field: string): string => {
  const record = getStringField(value, field);
  if (!record) throw new Error(`${field} is required.`);
  return record;
};

const isUnexpectedClientId = (body: unknown): boolean => {
  return getStringField(body, "clientId") !== undefined;
};

const validateAndGetProjectAndPhase = (body: unknown) => {
  const projectId = getRequiredStringField(body, "projectId");
  const phaseId = getRequiredStringField(body, "phaseId");
  return { projectId, phaseId };
};

const handleExport = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const context = await getValidatedClientContext(req.headers.cookie);
  const body = await readJsonBody(req);

  if (isUnexpectedClientId(body)) {
    return sendJson(res, 400, { ok: false, error: "Unexpected clientId in request body." });
  }

  const { projectId, phaseId } = validateAndGetProjectAndPhase(body);
  const sceneJson = getField(body, "sceneJson");
  if (!sceneJson || typeof sceneJson !== "object") {
    throw new Error("sceneJson is required.");
  }
  const storage = await createStorageService({ projectRoot: PROJECT_ROOT, context, projectId, phaseId });
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
    projectRoot: PROJECT_ROOT,
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

const assertOpenableBlenderOutputPath = (filePath: string): string => {
  const resolved = path.resolve(filePath);
  const storageRoot = path.resolve(PROJECT_ROOT, "storage");
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
  const resolved = assertOpenableBlenderOutputPath(filePath);
  let child;
  if (process.platform === "win32") {
    child = spawn("powershell.exe", ["-NoProfile", "-Command", "Start-Process -LiteralPath $args[0]", resolved], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
  } else if (process.platform === "darwin") {
    child = spawn("open", [resolved], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("xdg-open", [resolved], { detached: true, stdio: "ignore" });
  }
  child.unref();
};

const handleOpenBlenderOutput = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  await getValidatedClientContext(req.headers.cookie);
  const body = await readJsonBody(req);
  const filePath = getRequiredStringField(body, "path");
  const resolved = assertOpenableBlenderOutputPath(filePath);
  await access(resolved);
  openFileInDesktop(resolved);
  return sendJson(res, 200, { ok: true, path: resolved });
};

const handleCatalog = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const context = await getValidatedClientContext(req.headers.cookie);
  const repository = createFileClientCatalogRepository(PROJECT_ROOT);
  const catalog = await repository.ensureCatalogExists(context);
  return sendJson(res, 200, { ok: true, catalog });
};

const handleCatalogLookup = async (req: http.IncomingMessage, reqUrl: URL, res: http.ServerResponse) => {
  const context = await getValidatedClientContext(req.headers.cookie);
  const kind = reqUrl.searchParams.get("kind");
  const id = (reqUrl.searchParams.get("id") ?? "").trim();
  if (!id) return sendJson(res, 400, { ok: false, error: "id is required." });

  const repository = createFileClientCatalogRepository(PROJECT_ROOT);
  const catalog = await repository.ensureCatalogExists(context);

  if (kind === "material") {
    const family = reqUrl.searchParams.get("family") ?? "";
    const material =
      catalog.materials.find(
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
    const component =
      catalog.components.find(
        (item) => item.id === id && item.isActive && (!componentType || item.componentType === componentType)
      ) ?? null;
    return sendJson(res, component ? 200 : 404, { ok: !!component, component });
  }

  return sendJson(res, 400, { ok: false, error: "kind must be material or component." });
};

const readProjectJson = async (relativePath: string) => {
  const raw = await readFile(path.join(PROJECT_ROOT, relativePath), "utf-8");
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

const DEMOS_PRODUCTS_CSV = process.env.DEMOS_PRODUCTS_CSV
  || "C:\\Users\\laube\\Documents\\New project 7\\data\\demos-plosne-materialy\\products.csv";

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const slugifyDemos = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80);

const FIRST_20_DEMOS_MAPPING: Record<string, {
  materialType: string;
  decorFamily: string;
  colorFamily: string;
  targetInternalMaterialId: string;
  proceduralTemplate: string;
  grainPatternId: string;
  surfaceProfile: string;
  baseColorHex: string;
  grainColorHex: string;
  tintStrength: number;
  grainContrast: number;
  bumpMultiplier: number;
  grainDepth: number;
  pbrMaterialId: string;
}> = {
  "495386": { materialType: "wood", decorFamily: "beech", colorFamily: "light", targetInternalMaterialId: "wood_fine_grain_neutral_template", proceduralTemplate: "wood_fine_grain_neutral", grainPatternId: "fine_light_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#d8b679", grainColorHex: "#9d7646", tintStrength: 0.18, grainContrast: 0.28, bumpMultiplier: 0.75, grainDepth: 0.18, pbrMaterialId: "wood_light_plain" },
  "495387": { materialType: "wood", decorFamily: "cherry", colorFamily: "warm", targetInternalMaterialId: "wood_fine_grain_neutral_template", proceduralTemplate: "wood_fine_grain_neutral", grainPatternId: "fine_light_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#b65a35", grainColorHex: "#5e2d1c", tintStrength: 0.26, grainContrast: 0.34, bumpMultiplier: 0.85, grainDepth: 0.2, pbrMaterialId: "wood_warm_clean" },
  "495021": { materialType: "wood", decorFamily: "oak", colorFamily: "brown", targetInternalMaterialId: "wood_oak_neutral_template", proceduralTemplate: "wood_oak_neutral", grainPatternId: "oak_medium_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#8a5832", grainColorHex: "#3f2819", tintStrength: 0.22, grainContrast: 0.42, bumpMultiplier: 1.0, grainDepth: 0.28, pbrMaterialId: "wood_amaretto_hudson_oak" },
  "495018": { materialType: "wood", decorFamily: "oak", colorFamily: "gold", targetInternalMaterialId: "wood_oak_neutral_template", proceduralTemplate: "wood_oak_neutral", grainPatternId: "oak_medium_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#c28b45", grainColorHex: "#6e431f", tintStrength: 0.18, grainContrast: 0.38, bumpMultiplier: 0.95, grainDepth: 0.25, pbrMaterialId: "wood_warm_clean" },
  "495388": { materialType: "wood", decorFamily: "walnut", colorFamily: "brown", targetInternalMaterialId: "wood_walnut_neutral_template", proceduralTemplate: "wood_walnut_neutral", grainPatternId: "walnut_soft_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#7b5130", grainColorHex: "#332117", tintStrength: 0.2, grainContrast: 0.38, bumpMultiplier: 0.9, grainDepth: 0.24, pbrMaterialId: "wood_dark_smooth" },
  "495025": { materialType: "wood", decorFamily: "chestnut", colorFamily: "warm", targetInternalMaterialId: "wood_deep_grain_neutral_template", proceduralTemplate: "wood_deep_grain_neutral", grainPatternId: "oak_deep_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#a46133", grainColorHex: "#3b1f13", tintStrength: 0.2, grainContrast: 0.52, bumpMultiplier: 1.15, grainDepth: 0.36, pbrMaterialId: "wood_varnished_satin" },
  "495009": { materialType: "solid", decorFamily: "uni", colorFamily: "green", targetInternalMaterialId: "solid_color_neutral_template", proceduralTemplate: "solid_color_neutral", grainPatternId: "solid_no_grain", surfaceProfile: "generic_matte", baseColorHex: "#586b58", grainColorHex: "#405040", tintStrength: 0.25, grainContrast: 0.08, bumpMultiplier: 0.15, grainDepth: 0.02, pbrMaterialId: "lacquer_base_white" },
  "495016": { materialType: "solid", decorFamily: "uni", colorFamily: "green", targetInternalMaterialId: "solid_color_neutral_template", proceduralTemplate: "solid_color_neutral", grainPatternId: "solid_no_grain", surfaceProfile: "generic_matte", baseColorHex: "#173f36", grainColorHex: "#0b211d", tintStrength: 0.28, grainContrast: 0.08, bumpMultiplier: 0.15, grainDepth: 0.02, pbrMaterialId: "lacquer_base_white" },
  "495003": { materialType: "solid", decorFamily: "uni", colorFamily: "brown", targetInternalMaterialId: "solid_color_neutral_template", proceduralTemplate: "solid_color_neutral", grainPatternId: "solid_no_grain", surfaceProfile: "generic_matte", baseColorHex: "#b36f45", grainColorHex: "#70402a", tintStrength: 0.3, grainContrast: 0.08, bumpMultiplier: 0.15, grainDepth: 0.02, pbrMaterialId: "lacquer_base_white" },
  "495006": { materialType: "solid", decorFamily: "uni", colorFamily: "pink", targetInternalMaterialId: "solid_color_neutral_template", proceduralTemplate: "solid_color_neutral", grainPatternId: "solid_no_grain", surfaceProfile: "generic_matte", baseColorHex: "#c98b85", grainColorHex: "#8e5b57", tintStrength: 0.28, grainContrast: 0.08, bumpMultiplier: 0.15, grainDepth: 0.02, pbrMaterialId: "lacquer_base_white" },
  "495040": { materialType: "generic", decorFamily: "fantasy", colorFamily: "grey", targetInternalMaterialId: "generic_neutral_template", proceduralTemplate: "generic_neutral", grainPatternId: "generic_noise", surfaceProfile: "generic_matte", baseColorHex: "#8d8c86", grainColorHex: "#62615d", tintStrength: 0.16, grainContrast: 0.18, bumpMultiplier: 0.35, grainDepth: 0.08, pbrMaterialId: "wood_light_plain" },
  "495032": { materialType: "wood", decorFamily: "oak", colorFamily: "gold", targetInternalMaterialId: "wood_deep_grain_neutral_template", proceduralTemplate: "wood_deep_grain_neutral", grainPatternId: "oak_deep_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#c6904f", grainColorHex: "#654026", tintStrength: 0.18, grainContrast: 0.5, bumpMultiplier: 1.15, grainDepth: 0.34, pbrMaterialId: "wood_varnished_satin" },
  "495039": { materialType: "generic", decorFamily: "fantasy", colorFamily: "beige", targetInternalMaterialId: "generic_neutral_template", proceduralTemplate: "generic_neutral", grainPatternId: "generic_noise", surfaceProfile: "generic_matte", baseColorHex: "#b7a18b", grainColorHex: "#817266", tintStrength: 0.14, grainContrast: 0.18, bumpMultiplier: 0.35, grainDepth: 0.08, pbrMaterialId: "wood_light_plain" },
  "495019": { materialType: "wood", decorFamily: "oak", colorFamily: "light", targetInternalMaterialId: "wood_oak_neutral_template", proceduralTemplate: "wood_oak_neutral", grainPatternId: "oak_medium_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#d0a168", grainColorHex: "#815735", tintStrength: 0.14, grainContrast: 0.36, bumpMultiplier: 0.95, grainDepth: 0.24, pbrMaterialId: "wood_oak_natural" },
  "495034": { materialType: "wood", decorFamily: "oak", colorFamily: "amber", targetInternalMaterialId: "wood_deep_grain_neutral_template", proceduralTemplate: "wood_deep_grain_neutral", grainPatternId: "oak_deep_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#b67838", grainColorHex: "#5c3217", tintStrength: 0.2, grainContrast: 0.5, bumpMultiplier: 1.15, grainDepth: 0.34, pbrMaterialId: "wood_varnished_satin" },
  "495035": { materialType: "wood", decorFamily: "oak", colorFamily: "grey", targetInternalMaterialId: "wood_deep_grain_neutral_template", proceduralTemplate: "wood_deep_grain_neutral", grainPatternId: "oak_deep_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#8b8176", grainColorHex: "#4f4c49", tintStrength: 0.18, grainContrast: 0.44, bumpMultiplier: 1.05, grainDepth: 0.3, pbrMaterialId: "wood_dark_rough" },
  "495385": { materialType: "wood", decorFamily: "maple", colorFamily: "light", targetInternalMaterialId: "wood_fine_grain_neutral_template", proceduralTemplate: "wood_fine_grain_neutral", grainPatternId: "fine_light_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#e2c58f", grainColorHex: "#a17a45", tintStrength: 0.12, grainContrast: 0.26, bumpMultiplier: 0.75, grainDepth: 0.16, pbrMaterialId: "wood_light_plain" },
  "495013": { materialType: "solid", decorFamily: "uni", colorFamily: "red", targetInternalMaterialId: "solid_color_neutral_template", proceduralTemplate: "solid_color_neutral", grainPatternId: "solid_no_grain", surfaceProfile: "generic_matte", baseColorHex: "#9f3a30", grainColorHex: "#5a1e1a", tintStrength: 0.3, grainContrast: 0.08, bumpMultiplier: 0.15, grainDepth: 0.02, pbrMaterialId: "lacquer_base_white" },
  "495017": { materialType: "solid", decorFamily: "uni", colorFamily: "dark", targetInternalMaterialId: "solid_color_neutral_template", proceduralTemplate: "solid_color_neutral", grainPatternId: "solid_no_grain", surfaceProfile: "generic_matte", baseColorHex: "#4a4d4c", grainColorHex: "#242625", tintStrength: 0.28, grainContrast: 0.08, bumpMultiplier: 0.15, grainDepth: 0.02, pbrMaterialId: "lacquer_base_white" },
  "495024": { materialType: "wood", decorFamily: "chestnut", colorFamily: "dark", targetInternalMaterialId: "wood_deep_grain_neutral_template", proceduralTemplate: "wood_deep_grain_neutral", grainPatternId: "oak_deep_grain", surfaceProfile: "wood_standard_matte", baseColorHex: "#7a6a5a", grainColorHex: "#352c25", tintStrength: 0.2, grainContrast: 0.5, bumpMultiplier: 1.1, grainDepth: 0.34, pbrMaterialId: "wood_dark_rough" }
};

const buildDemosReferenceIndex = async () => {
  const csvFiles = await listCsvFiles(path.join(PROJECT_ROOT, "backend", "materials", "imports"));
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
          demosReferenceSource: path.relative(PROJECT_ROOT, csvFile).replaceAll("\\", "/")
        });
      }
    }
  }
  return index;
};

const PBR_BASECOLOR_ASSETS: Record<string, string> = {
  lacquer_base_white: "assets/materials/lacquer/lacquer_base_white/maps/basecolor.jpg",
  wood_dark_rough: "assets/materials/wood/wood_dark_rough/maps/basecolor.jpg",
  wood_dark_smooth: "assets/materials/wood/wood_dark_smooth/maps/basecolor.jpg",
  wood_light_plain: "assets/materials/wood/wood_light_plain/maps/basecolor.jpg",
  wood_amaretto_hudson_oak: "assets/materials/wood/wood_amaretto_hudson_oak/maps/basecolor.jpg",
  wood_oak_natural: "assets/materials/wood/wood_oak_natural/maps/basecolor.jpg",
  wood_varnished_satin: "assets/materials/wood/wood_varnished_satin/maps/basecolor.jpg",
  wood_warm_clean: "assets/materials/wood/wood_warm_clean/maps/basecolor.jpg"
};

const normalizeDemosCsvBoard = (row: Record<string, string>, csvFile: string) => {
  const sku = firstCsvText(row, ["vendorSku", "sku", "code", "productCode", "sortiment_code"]);
  const vendorDecorId = firstCsvText(row, ["vendorDecorId", "id", "decorId", "productId"]) || (sku ? `demos_${sku}` : "");
  const displayName = firstCsvText(row, ["displayName", "name", "title", "decorName", "productName", "nazov", "názov"]) || vendorDecorId;
  const demosReferenceImageUrl = firstCsvValue(row, CSV_REFERENCE_IMAGE_FIELDS);
  const demosReferencePageUrl = firstCsvValue(row, CSV_REFERENCE_PAGE_FIELDS);
  const inferred = FIRST_20_DEMOS_MAPPING[sku] ?? FIRST_20_DEMOS_MAPPING[vendorDecorId.replace(/^demos_/, "")];
  return {
    catalogType: "demosCsvBoard",
    vendor: firstCsvText(row, ["vendor"]) || "demos",
    vendorDecorId,
    vendorSku: sku,
    displayName,
    slug: firstCsvText(row, ["slug"]) || slugifyDemos(displayName),
    materialType: firstCsvText(row, ["materialType"]) || inferred?.materialType || "generic",
    decorFamily: firstCsvText(row, ["decorFamily"]) || inferred?.decorFamily || "unknown",
    colorFamily: firstCsvText(row, ["colorFamily"]) || inferred?.colorFamily || "unknown",
    surfaceHint: firstCsvText(row, ["surfaceHint"]) || "matte",
    targetInternalMaterialId: firstCsvText(row, ["targetInternalMaterialId", "materialId"]) || inferred?.targetInternalMaterialId || "generic_neutral_template",
    pbrMaterialId: inferred?.pbrMaterialId || "",
    pbrBaseColorAsset: inferred?.pbrMaterialId ? PBR_BASECOLOR_ASSETS[inferred.pbrMaterialId] : "",
    pbrBaseColorUrl: inferred?.pbrMaterialId && PBR_BASECOLOR_ASSETS[inferred.pbrMaterialId]
      ? `/api/material-proof/asset?path=${encodeURIComponent(PBR_BASECOLOR_ASSETS[inferred.pbrMaterialId])}`
      : "",
    proceduralTemplate: firstCsvText(row, ["proceduralTemplate"]) || inferred?.proceduralTemplate || "generic_neutral",
    grainPatternId: firstCsvText(row, ["grainPatternId"]) || inferred?.grainPatternId || "generic_noise",
    surfaceProfile: firstCsvText(row, ["surfaceProfile"]) || inferred?.surfaceProfile || "generic_matte",
    colorPreviewHex: firstCsvText(row, ["colorPreviewHex", "baseColorHex"]) || inferred?.baseColorHex || "#a8835a",
    baseColorHex: firstCsvText(row, ["baseColorHex"]) || inferred?.baseColorHex || "#a8835a",
    grainColorHex: firstCsvText(row, ["grainColorHex"]) || inferred?.grainColorHex || "#6f4a2f",
    tintStrength: Number(firstCsvText(row, ["tintStrength"])) || inferred?.tintStrength || 0.35,
    grainContrast: Number(firstCsvText(row, ["grainContrast"])) || inferred?.grainContrast || 0.25,
    roughnessMultiplier: Number(firstCsvText(row, ["roughnessMultiplier"])) || 1,
    roughnessOverride: firstCsvText(row, ["roughnessOverride"]) ? Number(firstCsvText(row, ["roughnessOverride"])) : null,
    bumpMultiplier: Number(firstCsvText(row, ["bumpMultiplier"])) || inferred?.bumpMultiplier || 0.8,
    grainDepth: Number(firstCsvText(row, ["grainDepth"])) || inferred?.grainDepth || 0.18,
    coatMultiplier: Number(firstCsvText(row, ["coatMultiplier"])) || 1,
    tileSizeMeters: Number(firstCsvText(row, ["tileSizeMeters"])) || 0.4,
    uvScale: Number(firstCsvText(row, ["uvScale"])) || 2.5,
    grainDirectionDefault: firstCsvText(row, ["grainDirectionDefault"]) || (inferred?.materialType === "wood" ? "vertical" : "none"),
    mappingStatus: firstCsvText(row, ["mappingStatus"]) || "needs_review",
    mappingLocked: /^true$/i.test(firstCsvText(row, ["mappingLocked"])),
    confidence: Number(firstCsvText(row, ["confidence"])) || (inferred ? 0.62 : 0.35),
    colorSourceMethod: "codex_visual_estimate",
    productionSafe: false,
    usesExternalVendorTexture: false,
    demosReferenceImageUrl,
    demosReferencePageUrl,
    demosReferenceSource: path.relative(PROJECT_ROOT, csvFile).replaceAll("\\", "/"),
    rawCsv: row
  };
};

const loadDemosCsvBoards = async () => {
  const csvFiles = await fileExists(DEMOS_PRODUCTS_CSV)
    ? [DEMOS_PRODUCTS_CSV]
    : await listCsvFiles(path.join(PROJECT_ROOT, "backend", "materials", "imports"));
  const boards: ReturnType<typeof normalizeDemosCsvBoard>[] = [];
  const seen = new Set<string>();
  for (const csvFile of csvFiles) {
    const rows = parseCsvRows(await readFile(csvFile, "utf-8")).slice(0, 20);
    const headers = new Set(Object.keys(rows[0] || {}).map((key) => key.toLowerCase()));
    if (["basecolorsource", "normalsource", "roughnesssource"].some((field) => headers.has(field))) continue;
    for (const row of rows) {
      const board = normalizeDemosCsvBoard(row, csvFile);
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

const handleMaterialProofCatalogs = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  await getValidatedClientContext(req.headers.cookie);
  const [productionRaw, stagingRaw, references, csvBoards] = await Promise.all([
    readProjectJson("backend/materials/material_frontend_catalog.json"),
    readProjectJson("backend/materials/material_frontend_catalog_staging.json"),
    buildDemosReferenceIndex(),
    loadDemosCsvBoards()
  ]);
  const production = enrichCatalogWithDemosReferences(productionRaw, references);
  const staging = enrichCatalogWithDemosReferences(stagingRaw, references);
  return sendJson(res, 200, { production, staging, csvBoards });
};

const getErrorCode = (error: unknown): number => {
  if (error instanceof SyntaxError) return 400;
  if (error instanceof Error) {
    if (isUnauthorizedError(error)) return 401;
    if (error.message === "Imported projectId already exists.") return 409;
    if (error.message.startsWith("Invalid FurnQuote module package:")) return 400;
    if (error.message === "Module import body is required.") return 400;
    if (error.message.endsWith(" is required.")) return 400;
    if (isForbiddenError(error)) return 403;
    if (error.message.includes("Invalid storage URL")) return 400;
    if (error.message.includes("Expected JSON body")) return 400;
    if (error.message === "Storage file not found.") return 404;
    if ("code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return 404;
  }
  return 500;
};

export function startWorkerServer() {
  const port = Number(process.env.BLENDER_WORKER_PORT || 5191);
  const host = process.env.BLENDER_WORKER_HOST || "127.0.0.1";

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

      if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { ok: true });

      if (req.method === "POST" && url.pathname === "/api/auth/login") return await handleAuthLogin(req, res, readJsonBody, sendJson);

      if (req.method === "GET" && url.pathname === "/api/auth/session") return handleAuthSession(req, res, sendJson);

      if (req.method === "POST" && url.pathname === "/api/auth/logout") return handleAuthLogout(req, res, sendJson);

      if (req.method === "GET" && url.pathname === "/api/catalog") return await handleCatalog(req, res);

      if (req.method === "GET" && url.pathname === "/api/catalog/lookup") return await handleCatalogLookup(req, url, res);

      if (req.method === "GET" && url.pathname === "/api/material-proof/catalogs") return await handleMaterialProofCatalogs(req, res);

      if (req.method === "GET" && url.pathname === "/api/demos/material-lookup") return await handleDemosMaterialLookup(url, res, sendJson);

      if (req.method === "GET" && url.pathname === "/api/demos/material-image") return await handleDemosMaterialImage(url, res);

      if (req.method === "GET" && url.pathname === "/api/material-proof/asset") return await serveMaterialProofAsset(url, res);

      if (req.method === "GET" && url.pathname === "/api/material-proof/reference-image") return await serveMaterialProofReferenceImage(url, res);

      if (
        (req.method === "GET" || req.method === "POST") &&
        url.pathname === "/api/material-proof/color-cache"
      ) return await handleDemosPreviewColorCache(req, res, url);

      if (
        await handleModulePackageApi(req, res, url, {
          projectRoot: PROJECT_ROOT,
          getContext: getValidatedClientContext,
          readJsonBody,
          sendJson
        })
      ) return;

      if (
        await handleProjectApi(req, res, url, {
          projectRoot: PROJECT_ROOT,
          getContext: getValidatedClientContext,
          readJsonBody,
          sendJson
        })
      ) return;

      if (req.method === "GET" && url.pathname.startsWith("/storage/")) return await serveStorageFile(req, url, res);

      if (req.method === "POST" && url.pathname === "/api/blender/export") return await handleExport(req, res);

      if (req.method === "POST" && url.pathname === "/api/blender/open-output") return await handleOpenBlenderOutput(req, res);

      if (req.method === "POST" && url.pathname === "/api/room-detail-vision") {
        await getValidatedClientContext(req.headers.cookie);
        return await handleRoomDetailVision(req, res, readJsonBody, sendJson);
      }

      if (req.method === "POST" && url.pathname === "/api/page-vision-validator") {
        await getValidatedClientContext(req.headers.cookie);
        return await handlePageVisionValidator(req, res, readJsonBody, sendJson);
      }

      if (await serveStaticApp(req, res, url)) return;

      return sendText(res, 404, "Not found");
    } catch (err: unknown) {
      const status = getErrorCode(err);
      const message = err instanceof Error ? err.message : String(err);
      return sendJson(res, status, { ok: false, error: message });
    }
  });

  server.listen(port, host, () => {
    console.log(`[blender-worker] listening on http://${host}:${port}`);
  });
}
