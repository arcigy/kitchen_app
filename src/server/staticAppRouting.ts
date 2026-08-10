import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type http from "node:http";
import { pipeline } from "node:stream/promises";

const STATIC_ASSET_PREFIX = "/assets/";
const FILE_EXTENSION_PATTERN = /(?:^|\/)[^/]+\.[^/]+$/;
const CONTENT_HASH_PATTERN = /(?:^|[-.])[a-z0-9_-]{8,}\.(?:css|js|mjs|png|jpe?g|webp|avif|svg|woff2?|wasm)$/i;

export function shouldServeSpaIndex(pathname: string): boolean {
  if (pathname.startsWith(STATIC_ASSET_PREFIX)) return false;
  return !FILE_EXTENSION_PATTERN.test(pathname);
}

export function staticCacheControl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.endsWith(".html")) return "no-store";
  return CONTENT_HASH_PATTERN.test(normalized)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, must-revalidate";
}

export async function streamStaticFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
  contentType: string
): Promise<void> {
  const file = await stat(filePath);
  const etag = `W/\"${file.size.toString(16)}-${Math.floor(file.mtimeMs).toString(16)}\"`;
  const lastModified = file.mtime.toUTCString();
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", staticCacheControl(filePath));
  res.setHeader("ETag", etag);
  res.setHeader("Last-Modified", lastModified);
  const ifNoneMatch = req.headers["if-none-match"];
  const ifModifiedSince = req.headers["if-modified-since"];
  const modifiedSince = typeof ifModifiedSince === "string" ? Date.parse(ifModifiedSince) : Number.NaN;
  const unchanged = ifNoneMatch === etag || (
    !ifNoneMatch
    && Number.isFinite(modifiedSince)
    && Math.floor(file.mtimeMs / 1000) <= Math.floor(modifiedSince / 1000)
  );
  if (unchanged) {
    res.statusCode = 304;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Length", String(file.size));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  await pipeline(createReadStream(filePath), res);
}
