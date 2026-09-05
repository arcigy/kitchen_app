export type SupplierBridgeLogLevel = "info" | "warn" | "error";

export type SupplierBridgeLogEvent = {
  event: string;
  sessionId?: string;
  syncItemId?: string;
  status?: string;
  errorCode?: string;
  durationMs?: number;
  supplierProductCode?: string;
  amount?: number | null;
  previewColorApplied?: boolean;
  productType?: string;
};

export function logSupplierBridge(level: SupplierBridgeLogLevel, event: SupplierBridgeLogEvent): void {
  const debugDiagnostics = process.env.SUPPLIER_BRIDGE_DIAGNOSTIC_LOGS === "true";
  const payload = {
    scope: "supplier_bridge",
    level,
    at: new Date().toISOString(),
    event: event.event,
    ...(event.sessionId ? { sessionId: event.sessionId } : {}),
    ...(event.syncItemId ? { syncItemId: event.syncItemId } : {}),
    ...(event.status ? { status: event.status } : {}),
    ...(event.errorCode ? { errorCode: event.errorCode } : {}),
    ...(event.durationMs != null ? { durationMs: event.durationMs } : {}),
    ...(event.previewColorApplied != null ? { previewColorApplied: event.previewColorApplied } : {}),
    ...(event.productType ? { productType: event.productType } : {}),
    ...(debugDiagnostics && event.supplierProductCode ? { supplierProductCode: event.supplierProductCode } : {}),
    ...(debugDiagnostics && event.amount != null ? { amount: event.amount } : {})
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
