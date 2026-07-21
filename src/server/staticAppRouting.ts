import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type http from "node:http";
import { pipeline } from "node:stream/promises";

const STATIC_ASSET_PREFIX = "/assets/";
const FILE_EXTENSION_PATTERN = /(?:^|\/)[^/]+\.[^/]+$/;

export function shouldServeSpaIndex(pathname: string): boolean {
  if (pathname.startsWith(STATIC_ASSET_PREFIX)) return false;
  return !FILE_EXTENSION_PATTERN.test(pathname);
}

export function staticCacheControl(filePath: string): string {
  return filePath.toLowerCase().endsWith(".html")
    ? "no-store"
    : "public, max-age=31536000, immutable";
}

export async function streamStaticFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
  contentType: string
): Promise<void> {
  const file = await stat(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", staticCacheControl(filePath));
  res.setHeader("Content-Length", String(file.size));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  await pipeline(createReadStream(filePath), res);
}
