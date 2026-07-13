import { supplierBridgeBuild } from "../config";
import { demosDiagnosticAdapter } from "./demosDiagnosticAdapter";
import { mockSupplierAdapter } from "./mockSupplierAdapter";
import type { SupplierAdapter } from "./types";

export function supplierAdapters(): SupplierAdapter[] {
  return supplierBridgeBuild.debug
    ? [mockSupplierAdapter, demosDiagnosticAdapter]
    : [demosDiagnosticAdapter];
}

export function adapterForUrl(url: URL): SupplierAdapter | null {
  return supplierAdapters().find((adapter) => adapter.supportsUrl(url)) ?? null;
}
