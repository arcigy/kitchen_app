import { describe, expect, it } from "vitest";
import { supplierPreviewImageUrl, supplierProductUsesPreviewColor } from "./supplier-preview-image";

describe("supplier image trust boundary", () => {
  it.each([
    ["demos", "https://www.demos-trade.sk/content/images/product/original/decor.jpg"],
    ["hranipex", "https://hosting.photorobot.com/images/4748478675156992/decor/NORMAL/image?w=200"],
    ["jaf_holz", "https://d1cvtajkxcatn5.cloudfront.net/cache-buster-123/pim/05%20dekore/image.webp"],
    ["schachermayer", "https://webshop.schachermayer.com/cdn/derivates/5/decor.jpg"]
  ])("accepts only %s's own image sources", (supplier, url) => {
    expect(supplierPreviewImageUrl(supplier, url)).toBe(url);
    expect(supplierPreviewImageUrl("unknown", url)).toBeNull();
    expect(supplierPreviewImageUrl(supplier === "demos" ? "hranipex" : "demos", url)).toBeNull();
  });
  it.each([
    "http://www.demos24plus.com/content/images/product/default/a.jpg",
    "https://user:password@www.demos24plus.com/content/images/product/default/a.jpg",
    "https://www.demos24plus.com:8443/content/images/product/default/a.jpg",
    "https://www.demos24plus.com.evil.test/content/images/product/default/a.jpg",
    "https://www.demos24plus.com/content/images/product/%2F..%2F..%2Fsecret.jpg",
    "https://www.demos24plus.com/content/images/product/default/no-image.jpg",
    "https://www.demos24plus.com/content/images/product/default/a.svg",
    "https://127.0.0.1/content/images/product/default/a.jpg",
    "data:image/png;base64,test"
  ])("rejects an unsafe or misleading image %s", (url) => {
    expect(supplierPreviewImageUrl("demos", url)).toBeNull();
  });
  it("limits shared hosts to the actual supplier account/product path", () => {
    expect(supplierPreviewImageUrl("hranipex", "https://hosting.photorobot.com/images/another-company/image")).toBeNull();
    expect(supplierPreviewImageUrl("jaf_holz", "https://another.cloudfront.net/pim/image.webp")).toBeNull();
    expect(supplierPreviewImageUrl("jaf_holz", "https://d1cvtajkxcatn5.cloudfront.net/pim/product-detail-icon/icon.png")).toBeNull();
  });
  it("samples boards, worktops and edges while preserving component finishes", () => {
    expect(["board", "worktop", "edge_band"].every(supplierProductUsesPreviewColor)).toBe(true);
    expect(["hinge", "hardware", "handle", "drawer_system", "unknown"].some(supplierProductUsesPreviewColor)).toBe(false);
  });
});
