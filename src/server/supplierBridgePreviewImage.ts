import sharp from "sharp";
import { createHash } from "node:crypto";
import { fetchExternalBytes } from "./external-http";

const DEMOS_IMAGE_HOSTS = new Set([
  "www.demos24plus.com",
  "www.demos-trade.cz",
  "www.demos-trade.sk"
]);
const IMAGE_TIMEOUT_MS = 8_000;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const COLOR_CACHE_TTL_MS = 15 * 60 * 1_000;
const COLOR_CACHE_MAX_ENTRIES = 250;
const SAMPLE_SIZE = 96;
const SAMPLE_POINTS = [
  [0.5, 0.5],
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75]
] as const;

type CachedPreviewColor = { hex: string; expiresAt: number };

const previewColorCache = new Map<string, CachedPreviewColor>();

export class SupplierPreviewImageError extends Error {}

function supportedDemosImageUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !DEMOS_IMAGE_HOSTS.has(parsed.hostname) || !parsed.pathname.startsWith("/content/images/product/")) return null;
    return parsed;
  } catch {
    return null;
  }
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function averagePatch(data: Buffer, width: number, height: number, centerX: number, centerY: number): string {
  const radius = Math.max(3, Math.round(Math.min(width, height) * 0.08));
  const x0 = Math.max(0, Math.round(centerX * width) - radius);
  const x1 = Math.min(width - 1, Math.round(centerX * width) + radius);
  const y0 = Math.max(0, Math.round(centerY * height) - radius);
  const y1 = Math.min(height - 1, Math.round(centerY * height) + radius);
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  let fallbackRed = 0;
  let fallbackGreen = 0;
  let fallbackBlue = 0;
  let fallbackCount = 0;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const index = (y * width + x) * 3;
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      fallbackRed += r;
      fallbackGreen += g;
      fallbackBlue += b;
      fallbackCount += 1;

      // Product photos often have a white page background. Prefer pixels
      // that contain board detail, but keep a white board valid as fallback.
      const luminance = (r + g + b) / 3;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (luminance > 244 && chroma < 9) continue;
      red += r;
      green += g;
      blue += b;
      count += 1;
    }
  }

  if (count > 0) return rgbToHex(red / count, green / count, blue / count);
  if (fallbackCount > 0) return rgbToHex(fallbackRed / fallbackCount, fallbackGreen / fallbackCount, fallbackBlue / fallbackCount);
  throw new SupplierPreviewImageError("Supplier preview image contains no readable pixels.");
}

function averageHex(colors: readonly string[]): string {
  const totals = colors.reduce((sum, hex) => ({
    red: sum.red + Number.parseInt(hex.slice(1, 3), 16),
    green: sum.green + Number.parseInt(hex.slice(3, 5), 16),
    blue: sum.blue + Number.parseInt(hex.slice(5, 7), 16)
  }), { red: 0, green: 0, blue: 0 });
  return rgbToHex(totals.red / colors.length, totals.green / colors.length, totals.blue / colors.length);
}

function cachedColor(url: string, now: number): string | null {
  const found = previewColorCache.get(url);
  if (!found) return null;
  if (found.expiresAt > now) return found.hex;
  previewColorCache.delete(url);
  return null;
}

function previewCacheKey(url: URL): string {
  // Keep repeated capture fast without retaining a supplier image URL.
  return createHash("sha256").update(url.toString()).digest("hex");
}

function storeColor(url: string, hex: string, now: number): void {
  for (const [key, entry] of previewColorCache) {
    if (entry.expiresAt <= now || previewColorCache.size >= COLOR_CACHE_MAX_ENTRIES) previewColorCache.delete(key);
    if (previewColorCache.size < COLOR_CACHE_MAX_ENTRIES) break;
  }
  previewColorCache.set(url, { hex, expiresAt: now + COLOR_CACHE_TTL_MS });
}

/**
 * Reads a supplier image into a bounded in-memory buffer, derives a board
 * colour, then clears the image buffers. No picture URL, byte array or file is
 * persisted; only the small colour result may live in the process cache.
 */
export async function resolveDemosPreviewImageColor(imageUrl: string, options: { fetchImpl?: typeof fetch; now?: number } = {}): Promise<string> {
  const parsed = supportedDemosImageUrl(imageUrl);
  if (!parsed) throw new SupplierPreviewImageError("Unsupported Démos preview image URL.");
  const now = options.now ?? Date.now();
  const cacheKey = previewCacheKey(parsed);
  const cached = cachedColor(cacheKey, now);
  if (cached) return cached;

  let source: Uint8Array | null = null;
  let pixels: Buffer | null = null;
  try {
    const external = await fetchExternalBytes(parsed, { headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" } }, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      maxBytes: IMAGE_MAX_BYTES,
      fetchImpl: options.fetchImpl
    });
    source = external.body;
    if (!external.response.ok) throw new SupplierPreviewImageError(`Démos preview image request failed: ${external.response.status}.`);
    if (!(external.response.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")) {
      throw new SupplierPreviewImageError("Démos preview response is not an image.");
    }
    const decoded = await sharp(source, { failOn: "none", limitInputPixels: 16_000_000 })
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "cover", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    pixels = decoded.data;
    if (!decoded.info.width || !decoded.info.height || decoded.info.channels !== 3) {
      throw new SupplierPreviewImageError("Démos preview image could not be decoded as RGB.");
    }
    const hex = averageHex(SAMPLE_POINTS.map(([x, y]) => averagePatch(pixels!, decoded.info.width, decoded.info.height, x, y)));
    storeColor(cacheKey, hex, now);
    return hex;
  } catch (error) {
    if (error instanceof SupplierPreviewImageError) throw error;
    throw new SupplierPreviewImageError("Démos preview image could not be processed.");
  } finally {
    // The supplier image is deliberately transient. It is not written to disk,
    // sent to a repository, or retained after colour extraction.
    source?.fill(0);
    pixels?.fill(0);
  }
}

export function clearDemosPreviewImageColorCacheForTest(): void {
  previewColorCache.clear();
}
