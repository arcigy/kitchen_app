/** Shared by the content-script boundary and the server fetch boundary.
 * Only verified public product-image locations are accepted, never whole CDNs.
 */
export function supplierPreviewImageUrl(supplierId: string, value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return null;
    const path = decodeURIComponent(url.pathname);
    if (path.includes("\\") || path.split("/").some((part) => part === ".." || part === ".")) return null;
    if (/placeholder|no[-_]?image|no[-_]?photo|spacer|loading|logo/i.test(path)) return null;
    const raster = /\.(?:jpe?g|png|webp|avif|gif)$/i.test(path);
    const allowed = supplierId === "demos"
      ? ["www.demos24plus.com", "www.demos-trade.cz", "www.demos-trade.sk"].includes(url.hostname) && path.startsWith("/content/images/product/") && raster
      : supplierId === "hranipex"
        ? url.hostname === "hosting.photorobot.com" && path.startsWith("/images/4748478675156992/")
        : supplierId === "jaf_holz"
          ? ["d1cvtajkxcatn5.cloudfront.net", "www.jafholz.cz"].includes(url.hostname) && /^\/(?:cache-buster-\d+\/)?pim\//.test(path) && raster && !/product-detail-icon/.test(path)
          : supplierId === "schachermayer"
            ? url.hostname === "webshop.schachermayer.com" && path.startsWith("/cdn/derivates/") && raster
            : false;
    return allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

export function supplierProductUsesPreviewColor(productType: string | null | undefined): boolean {
  return productType === "board" || productType === "worktop" || productType === "edge_band";
}
