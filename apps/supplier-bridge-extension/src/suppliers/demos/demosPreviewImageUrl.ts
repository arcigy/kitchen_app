import { supplierPreviewImageUrl } from "../../../../../src/core/supplier-bridge/supplier-preview-image";

/**
 * Démos serves catalog HTML and product pictures from separate regional
 * domains. Keep the Bridge limited to their product-image path only.
 */
export function isSupportedDemosPreviewImageUrl(value: string): boolean {
  return supplierPreviewImageUrl("demos", value) !== null;
}
