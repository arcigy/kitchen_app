export const SUPPLIER_BRIDGE_SESSION_REATTACH_REQUIRED = "SESSION_REATTACH_REQUIRED";
export const SUPPLIER_BRIDGE_SESSION_REATTACH_MESSAGE = "Prepojenie bolo po aktualizácii rozšírenia resetované. V Arcigy znovu kliknite na dodávateľa.";

export class SupplierBridgeSessionRecoveryError extends Error {
  readonly code = SUPPLIER_BRIDGE_SESSION_REATTACH_REQUIRED;

  constructor() {
    super(SUPPLIER_BRIDGE_SESSION_REATTACH_MESSAGE);
    this.name = "SupplierBridgeSessionRecoveryError";
  }
}
