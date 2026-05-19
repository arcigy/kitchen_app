import http from "node:http";
import { access } from "node:fs/promises";
import process from "node:process";
import { requireClientContextFromCookie } from "../src/core/client/session-cookie";
import { createUserService } from "../src/core/auth/user-service";
import { createInMemoryUserRepository } from "../src/core/auth/user-repository";
import { createFileClientCatalogRepository } from "../src/core/catalog/catalog-file-repository";
import { createStorageService, readScopedStorageFile } from "../src/core/storage/storageService";
import { handleAuthLogin, handleAuthLogout, handleAuthSession } from "../src/server/authEndpoint";
import { handleModulePackageApi } from "../src/server/modulePackageEndpoint";
import { handleProjectApi } from "../src/server/projectEndpoint";
import { runBlenderExport } from "./blender/runBlenderExport";
import { handlePageVisionValidator } from "./pageVisionValidatorEndpoint";
import { handleRoomDetailVision } from "./roomDetailVisionEndpoint";

const PROJECT_ROOT = process.cwd();
const serverUserService = createUserService(createInMemoryUserRepository());

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
    blendPath: result.blendPath
  });
};

const handleCatalog = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const context = await getValidatedClientContext(req.headers.cookie);
  const repository = createFileClientCatalogRepository(PROJECT_ROOT);
  const catalog = await repository.ensureCatalogExists(context);
  return sendJson(res, 200, { ok: true, catalog });
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

      if (req.method === "POST" && url.pathname === "/api/room-detail-vision") {
        await getValidatedClientContext(req.headers.cookie);
        return await handleRoomDetailVision(req, res, readJsonBody, sendJson);
      }

      if (req.method === "POST" && url.pathname === "/api/page-vision-validator") {
        await getValidatedClientContext(req.headers.cookie);
        return await handlePageVisionValidator(req, res, readJsonBody, sendJson);
      }

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
