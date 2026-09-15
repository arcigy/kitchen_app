import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDemosPreviewImageColorCacheForTest, resolveDemosPreviewImageColor, resolveSupplierPreviewImageColor, SupplierPreviewImageError } from "./supplierBridgePreviewImage";

afterEach(() => {
  clearDemosPreviewImageColorCacheForTest();
  vi.restoreAllMocks();
});

describe("Démos supplier preview image colour", () => {
  it.each([
    ["hranipex", "https://hosting.photorobot.com/images/4748478675156992/decor/NORMAL/swatch"],
    ["jaf_holz", "https://d1cvtajkxcatn5.cloudfront.net/pim/05%20dekore/swatch.webp"],
    ["schachermayer", "https://webshop.schachermayer.com/cdn/derivates/1/board.jpg"]
  ])("samples %s and keeps tenant caches separate", async (supplierId, url) => {
    const bytes = await sharp({ create: { width: 30, height: 5, channels: 3, background: "#A07040" } }).png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new Uint8Array(bytes), { headers: { "content-type": "image/png" } }));
    for (const cacheScope of ["tenant-a", "tenant-a", "tenant-b"]) {
      await expect(resolveSupplierPreviewImageColor(supplierId, url, { fetchImpl, cacheScope })).resolves.toBe("#A07040");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it.each(["gray", "transparent", "white"])("handles %s swatches without inventing a dark colour", async (kind) => {
    let source = sharp({ create: { width: 24, height: 24, channels: 4, background: kind === "white" ? "#FFFFFF" : "#808080" } });
    if (kind === "gray") source = source.toColourspace("b-w");
    if (kind === "transparent") source = source.extend({ top: 20, left: 20, bottom: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const bytes = await source.png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(bytes), { headers: { "content-type": "image/png" } }));
    await expect(resolveDemosPreviewImageColor(`https://www.demos24plus.com/content/images/product/default/${kind}.png`, { fetchImpl })).resolves.toBe(kind === "white" ? "#FFFFFF" : "#808080");
  });

  it("rejects empty, corrupt, oversized and HTML responses, never caching a failed sample", async () => {
    const url = "https://www.demos24plus.com/content/images/product/default/test.png";
    const empty = await sharp({ create: { width: 12, height: 12, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array(empty), { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response("bad image", { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response("too big", { headers: { "content-type": "image/png", "content-length": "99999999" } }))
      .mockResolvedValueOnce(new Response("<html>Login</html>", { headers: { "content-type": "text/html" } }));
    for (let i = 0; i < 4; i += 1) await expect(resolveDemosPreviewImageColor(url, { fetchImpl })).rejects.toBeInstanceOf(SupplierPreviewImageError);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
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

  it("accepts the real Démos Slovak product-image CDN but rejects other paths", async () => {
    const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: { r: 179, g: 27, b: 52 } } }).png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(image), {
      status: 200,
      headers: { "Content-Type": "image/png", "Content-Length": String(image.byteLength) }
    }));

    await expect(resolveDemosPreviewImageColor("https://www.demos-trade.sk/content/images/product/original/279469.jpg", { fetchImpl })).resolves.toBe("#B31B34");
    await expect(resolveDemosPreviewImageColor("https://www.demos-trade.sk/other/image.jpg", { fetchImpl })).rejects.toBeInstanceOf(SupplierPreviewImageError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
