import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDemosPreviewImageColorCacheForTest, resolveDemosPreviewImageColor, SupplierPreviewImageError } from "./supplierBridgePreviewImage";

afterEach(() => {
  clearDemosPreviewImageColorCacheForTest();
  vi.restoreAllMocks();
});

describe("Démos supplier preview image colour", () => {
  it("derives the board colour from a bounded transient product image and caches only the HEX result", async () => {
    const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: { r: 179, g: 27, b: 52 } } }).png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(image), {
      status: 200,
      headers: { "Content-Type": "image/png", "Content-Length": String(image.byteLength) }
    }));
    const url = "https://www.demos24plus.com/content/images/product/default/365157.jpg";

    await expect(resolveDemosPreviewImageColor(url, { fetchImpl, now: 100 })).resolves.toBe("#B31B34");
    await expect(resolveDemosPreviewImageColor(url, { fetchImpl, now: 101 })).resolves.toBe("#B31B34");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects non-Démos URLs before making an external request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(resolveDemosPreviewImageColor("https://example.test/image.jpg", { fetchImpl })).rejects.toBeInstanceOf(SupplierPreviewImageError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
