const DEMOS_PREVIEW_IMAGE_ORIGINS = new Set([
  "https://www.demos24plus.com",
  "https://www.demos-trade.cz",
  "https://www.demos-trade.sk"
]);

/**
 * Démos serves catalog HTML and product pictures from separate regional
 * domains. Keep the Bridge limited to their product-image path only.
 */
export function isSupportedDemosPreviewImageUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && DEMOS_PREVIEW_IMAGE_ORIGINS.has(parsed.origin)
      && parsed.pathname.startsWith("/content/images/product/");
  } catch {
    return false;
  }
}
