export const supplierBridgeBuild = {
  debug: __SUPPLIER_BRIDGE_DEBUG__,
  version: __SUPPLIER_BRIDGE_VERSION__,
  arcigyOrigins: [...__ARCIGY_ORIGINS__],
  supplierSimulatorOrigins: [...__SUPPLIER_SIMULATOR_ORIGINS__]
} as const;

export const supplierPortals = {
  demos: { label: "Démos trade", startUrl: "https://www.demos24plus.com/", origins: ["https://www.demos24plus.com"] },
  schachermayer: { label: "Schachermayer", startUrl: "https://webshop.schachermayer.com/cat/cs-CZ", origins: ["https://webshop.schachermayer.com"] },
  hranipex: { label: "Hranipex", startUrl: "https://www.hranipex.cz/cs/", origins: ["https://www.hranipex.cz"] },
  jaf_holz: { label: "JAF Holz", startUrl: "https://www.jafholz.cz/", origins: ["https://www.jafholz.cz"] }
} as const;

export type ConfiguredSupplierId = keyof typeof supplierPortals;

export function configuredSupplierPortal(supplierId: string) {
  return supplierId in supplierPortals ? supplierPortals[supplierId as ConfiguredSupplierId] : null;
}

export function isAllowedArcigyOrigin(origin: string): boolean {
  return supplierBridgeBuild.arcigyOrigins.includes(origin);
}

export function isSupplierSimulatorOrigin(origin: string): boolean {
  return supplierBridgeBuild.debug && supplierBridgeBuild.supplierSimulatorOrigins.includes(origin);
}

export function backendBaseUrlForArcigyOrigin(origin: string): string {
  if (!isAllowedArcigyOrigin(origin)) throw new Error("Unsupported Arcigy origin.");
  if (__SUPPLIER_BRIDGE_DEBUG__) {
    if (origin === "http://127.0.0.1:5180") return "http://127.0.0.1:5191";
    if (origin === "http://localhost:5180") return "http://localhost:5191";
  }
  return origin;
}

export function supplierSimulatorSearchUrl(query: string): string | null {
  if (!__SUPPLIER_BRIDGE_DEBUG__) return null;
  const origin = supplierBridgeBuild.supplierSimulatorOrigins[0];
  if (!origin) return null;
  const url = new URL("/search", origin);
  url.searchParams.set("query", query);
  url.searchParams.set("scenario", "exact-single-result");
  return url.toString();
}
