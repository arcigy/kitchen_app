import type http from "node:http";
import { gzip, gzipSync } from "node:zlib";

const MIN_GZIP_BYTES = 1_024;
const gzipResponses = new WeakSet<http.ServerResponse>();
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' data: blob: https:",
  "frame-src 'self' https:"
].join("; ");

export function acceptsGzip(value: string | string[] | undefined): boolean {
  const header = Array.isArray(value) ? value.join(",") : value ?? "";
  const codings = header.split(",").map((entry) => {
    const [coding, ...parameters] = entry.trim().toLowerCase().split(";");
    const quality = parameters
      .map((parameter) => parameter.trim())
      .find((parameter) => parameter.startsWith("q="));
    return { coding, quality: quality ? Number(quality.slice(2)) : 1 };
  });
  const explicitGzip = codings.find((entry) => entry.coding === "gzip");
  if (explicitGzip) return explicitGzip.quality > 0;
  return (codings.find((entry) => entry.coding === "*")?.quality ?? 0) > 0;
}

export function sendPrecompressedGzipJson(res: http.ServerResponse, body: Buffer): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  appendVary(res, "Accept-Encoding");
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Content-Length", String(body.byteLength));
  res.end(body);
}

export function gzipJsonBody(value: unknown): Promise<Buffer | null> {
  const body = JSON.stringify(value);
  return new Promise((resolve) => {
    gzip(body, (error, compressed) => resolve(error ? null : compressed));
  });
}

function appendVary(res: http.ServerResponse, value: string): void {
  const current = res.getHeader("Vary");
  const values = new Set(
    (Array.isArray(current) ? current : String(current ?? "").split(","))
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
  values.add(value);
  res.setHeader("Vary", [...values].join(", "));
}

export function registerResponseCompression(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (acceptsGzip(req.headers["accept-encoding"])) gzipResponses.add(res);
}

export function encodeResponseBody(
  res: http.ServerResponse,
  body: string | Buffer,
  options: { compressible?: boolean } = {}
): Buffer {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf-8");
  const compressible = options.compressible !== false;
  if (!compressible) return raw;

  appendVary(res, "Accept-Encoding");
  if (!gzipResponses.has(res) || raw.byteLength < MIN_GZIP_BYTES) return raw;
  res.setHeader("Content-Encoding", "gzip");
  return gzipSync(raw);
}

export function sendResponseBody(
  res: http.ServerResponse,
  body: string | Buffer,
  options: { compressible?: boolean } = {}
): void {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf-8");
  const compressible = options.compressible !== false;
  if (compressible) appendVary(res, "Accept-Encoding");
  if (!compressible || !gzipResponses.has(res) || raw.byteLength < MIN_GZIP_BYTES) {
    res.setHeader("Content-Length", String(raw.byteLength));
    res.end(raw);
    return;
  }

  gzip(raw, (error, encoded) => {
    if (res.destroyed) return;
    if (error) {
      res.removeHeader("Content-Encoding");
      res.setHeader("Content-Length", String(raw.byteLength));
      res.end(raw);
      return;
    }
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", String(encoded.byteLength));
    res.end(encoded);
  });
}
