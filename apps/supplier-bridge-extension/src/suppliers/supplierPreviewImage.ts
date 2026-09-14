import { supplierPreviewImageUrl } from "../../../../src/core/supplier-bridge/supplier-preview-image";

function srcsetUrls(value: string | null): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim().split(/\s+/)[0] ?? "").filter(Boolean);
}

/** Call with the exact product's gallery/row, never the entire search page.
 * A loaded placeholder must not hide data-src, picture sources or lazy srcset.
 */
export function extractSupplierPreviewImage(root: ParentNode, supplierId: string, baseUrl: string, selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    for (const element of root.querySelectorAll(selector)) {
      const image = element as HTMLImageElement;
      const sources = [
        image.currentSrc,
        element.getAttribute("data-src"),
        ...srcsetUrls(element.getAttribute("data-srcset")),
        ...srcsetUrls(element.getAttribute("srcset")),
        element.getAttribute("src"),
        ...[...element.closest("picture")?.querySelectorAll("source") ?? []].flatMap((source) => [
          ...srcsetUrls(source.getAttribute("data-srcset")), ...srcsetUrls(source.getAttribute("srcset"))
        ]),
        element.getAttribute("data-zoom-image"),
        element.getAttribute("content")
      ];
      for (const source of sources) {
        if (!source?.trim()) continue;
        try {
          const safe = supplierPreviewImageUrl(supplierId, new URL(source, baseUrl).toString());
          if (safe) return safe;
        } catch { /* Invalid candidates never prevent trying the next actual image source. */ }
      }
    }
  }
  return null;
}
