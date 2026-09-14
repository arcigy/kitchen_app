import sharp from "sharp";
import { createHash } from "node:crypto";
import { fetchExternalBytes } from "./external-http";
import { supplierPreviewImageUrl } from "../core/supplier-bridge/supplier-preview-image";

const IMAGE_TIMEOUT_MS = 8_000;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const COLOR_CACHE_TTL_MS = 15 * 60 * 1_000;
const COLOR_CACHE_MAX_ENTRIES = 250;
const SAMPLE_SIZE = 96;
type CachedPreviewColor = { hex: string; expiresAt: number };

const previewColorCache = new Map<string, CachedPreviewColor>();

export class SupplierPreviewImageError extends Error {}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Average the central surface, preserving white decors and ignoring transparency.
 * Resize inside (not cover) keeps narrow edge strips and wide swatches intact.
 */
function averageSurface(data: Buffer, width: number, height: number): string {
  const totals = [0, 0, 0];
  const foreground = [0, 0, 0];
  let weight = 0;
  let foregroundWeight = 0;
  const insetX = Math.floor(width * 0.1);
  const insetY = Math.floor(height * 0.1);
  for (let y = insetY; y < height - insetY; y += 1) {
    for (let x = insetX; x < width - insetX; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = (data[index + 3] ?? 0) / 255;
      if (alpha < 0.1) continue;
      const rgb = [data[index]!, data[index + 1]!, data[index + 2]!];
      const background = Math.min(...rgb) > 244 && Math.max(...rgb) - Math.min(...rgb) < 9;
      weight += alpha;
      for (let channel = 0; channel < 3; channel += 1) totals[channel]! += rgb[channel]! * alpha;
      if (!background) {
        foregroundWeight += alpha;
        for (let channel = 0; channel < 3; channel += 1) foreground[channel]! += rgb[channel]! * alpha;
      }
    }
  }
  if (!weight) throw new SupplierPreviewImageError("Supplier preview image contains no visible pixels.");
  // Do not let a handful of shadows/dust turn a white swatch into a dark colour.
  const useForeground = foregroundWeight / weight > 0.2;
  const channels = useForeground ? foreground : totals;
  const divisor = useForeground ? foregroundWeight : weight;
  return rgbToHex(channels[0]! / divisor, channels[1]! / divisor, channels[2]! / divisor);
}

function cachedColor(url: string, now: number): string | null {
  const found = previewColorCache.get(url);
  if (!found) return null;
  if (found.expiresAt > now) return found.hex;
  previewColorCache.delete(url);
  return null;
}

function previewCacheKey(url: URL, supplierId: string, scope: string): string {
  // Keep repeated capture fast without retaining a supplier image URL.
  return createHash("sha256").update(JSON.stringify([scope, supplierId, url.toString()])).digest("hex");
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
export async function resolveSupplierPreviewImageColor(supplierId: string, imageUrl: string, options: { fetchImpl?: typeof fetch; now?: number; cacheScope?: string } = {}): Promise<string> {
  const safeUrl = supplierPreviewImageUrl(supplierId, imageUrl);
  if (!safeUrl) throw new SupplierPreviewImageError("Unsupported supplier preview image URL.");
  const parsed = new URL(safeUrl);
  const now = options.now ?? Date.now();
  const cacheKey = previewCacheKey(parsed, supplierId, options.cacheScope ?? "");
  const cached = cachedColor(cacheKey, now);
  if (cached) return cached;

  let source: Uint8Array | null = null;
  let pixels: Buffer | null = null;
  try {
    const external = await fetchExternalBytes(parsed, { headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" } }, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      maxBytes: IMAGE_MAX_BYTES,
      fetchImpl: options.fetchImpl
    });
    source = external.body;
    if (!external.response.ok) throw new SupplierPreviewImageError(`Supplier preview image request failed: ${external.response.status}.`);
    if (!(external.response.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")) {
      throw new SupplierPreviewImageError("Supplier preview response is not an image.");
    }
    const decoded = await sharp(source, { failOn: "error", limitInputPixels: 16_000_000 })
      .rotate()
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    pixels = decoded.data;
    if (!decoded.info.width || !decoded.info.height || decoded.info.channels !== 4) {
      throw new SupplierPreviewImageError("Supplier preview image could not be decoded as RGB.");
    }
    const hex = averageSurface(pixels, decoded.info.width, decoded.info.height);
    storeColor(cacheKey, hex, now);
    return hex;
  } catch (error) {
    if (error instanceof SupplierPreviewImageError) throw error;
    throw new SupplierPreviewImageError("Supplier preview image could not be processed.");
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

/** Compatibility entry point for existing Démos callers. */
export function resolveDemosPreviewImageColor(imageUrl: string, options: { fetchImpl?: typeof fetch; now?: number } = {}): Promise<string> {
  return resolveSupplierPreviewImageColor("demos", imageUrl, options);
}
