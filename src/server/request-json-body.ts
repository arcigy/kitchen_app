import type http from "node:http";
import { getProjectImportBodyLimitBytes } from "../core/project-save/project-file-limits";

const MEBIBYTE = 1024 * 1024;
const DEFAULT_JSON_BODY_MB = 64;
const CLIENT_METRICS_BODY_MAX_BYTES = 8 * 1024;
const FEEDBACK_REPORT_BODY_MAX_BYTES = 32 * MEBIBYTE;

function positiveMbEnv(name: string): number | null {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds the ${Math.ceil(maxBytes / MEBIBYTE)} MB limit.`);
    this.name = "RequestBodyTooLargeError";
  }
}

export function getJsonBodyLimitBytes(req: Pick<http.IncomingMessage, "url">): number {
  const pathname = String(req.url ?? "").split("?", 1)[0];
  if (pathname === "/api/client-metrics") return CLIENT_METRICS_BODY_MAX_BYTES;
  if (pathname === "/api/feedback-reports") return FEEDBACK_REPORT_BODY_MAX_BYTES;
  if (pathname === "/api/projects/import") return getProjectImportBodyLimitBytes();
  return Math.ceil((positiveMbEnv("HTTP_JSON_BODY_MAX_MB") ?? DEFAULT_JSON_BODY_MB) * MEBIBYTE);
}

export async function readJsonRequestBody(req: http.IncomingMessage): Promise<unknown> {
  const maxBytes = getJsonBodyLimitBytes(req);
  const contentLength = Number(Array.isArray(req.headers["content-length"])
    ? req.headers["content-length"][0]
    : req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const value of req) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      req.resume();
      throw new RequestBodyTooLargeError(maxBytes);
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, totalBytes).toString("utf-8")) as unknown;
}
