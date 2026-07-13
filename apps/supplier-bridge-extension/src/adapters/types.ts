import type { SupplierCapability, SupplierSourcePageType } from "../../../../src/core/supplier-bridge/supplier-bridge-types";
import type { SupplierPageCapture } from "../messages";

export type SupplierAdapter = {
  supplierId: string;
  productionReady: boolean;
  capabilities: ReadonlySet<SupplierCapability>;
  supportsUrl(url: URL): boolean;
  detectPage(document: Document, url: URL): SupplierSourcePageType;
  extractCurrentPage(document: Document, url: URL): Promise<SupplierPageCapture>;
  buildSearchUrl?(query: string): string | null;
};

export function adapterSupports(adapter: SupplierAdapter, capability: SupplierCapability): boolean {
  return adapter.capabilities.has(capability);
}
