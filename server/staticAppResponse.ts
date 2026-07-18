import { readFile } from "node:fs/promises";
import type http from "node:http";
import {
  acceptsGzip,
  sendPrecompressedGzipBody,
  sendResponseBody
} from "../src/server/http-response-compression";

const COMPRESSIBLE_STATIC_MIME = /^(text\/|application\/(?:json|javascript|xml)|image\/svg\+xml)/i;

export type StaticResponseSource = "precompressed" | "runtime";

export async function sendStaticAppFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
  mimeType: string
): Promise<StaticResponseSource> {
  const compressible = COMPRESSIBLE_STATIC_MIME.test(mimeType);
  if (compressible && acceptsGzip(req.headers["accept-encoding"])) {
    try {
      const precompressed = await readFile(`${filePath}.gz`);
      sendPrecompressedGzipBody(res, precompressed);
      return "precompressed";
    } catch {
      // Older builds and non-generated files retain the existing runtime gzip path.
    }
  }

  sendResponseBody(res, await readFile(filePath), { compressible });
  return "runtime";
}
