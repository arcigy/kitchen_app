import { demosExactIdAdapter } from "./demos/demosExactIdAdapter";
import { hranipexExactIdAdapter } from "./hranipex/hranipexExactIdAdapter";
import { jafHolzExactIdAdapter } from "./jaf-holz/jafHolzExactIdAdapter";
import { schachermayerExactIdAdapter } from "./schachermayer/schachermayerExactIdAdapter";
import type { ExactIdSupplierAdapter } from "./exactAdapterTypes";

const verifiedAdapters: readonly ExactIdSupplierAdapter[] = [demosExactIdAdapter, hranipexExactIdAdapter, jafHolzExactIdAdapter, schachermayerExactIdAdapter];

export function exactAdapterForSupplier(supplierId: string): ExactIdSupplierAdapter | null {
  return verifiedAdapters.find((adapter) => adapter.supplierId === supplierId) ?? null;
}

export function exactAdapterForUrl(url: URL): ExactIdSupplierAdapter | null {
  return verifiedAdapters.find((adapter) => adapter.supportsUrl(url)) ?? null;
}

export const supplierImplementationStatus = {
  demos: "verified_read_only",
  hranipex: "verified_read_only",
  jaf_holz: "verified_read_only",
  schachermayer: "verified_read_only"
} as const;
