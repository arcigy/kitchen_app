export type SupplierBridgeBuildEnvironment = Readonly<Record<string, string | undefined>>;

export const DEFAULT_SUPPLIER_BRIDGE_PRODUCTION_ORIGIN = "https://kitchenapp.178.104.175.242.sslip.io";
export const DEFAULT_SUPPLIER_BRIDGE_DEVELOP_ORIGIN = "https://arcigy-kitchen-develop.178.104.175.242.sslip.io";

function exactHttpsOrigin(value: string, setting: string): string {
  const input = value.trim().replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`${setting} must contain an exact HTTPS origin.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.origin !== input) {
    throw new Error(`${setting} must contain an exact HTTPS origin without a path, query, or credentials.`);
  }
  return url.origin;
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function supplierBridgeReleaseOrigins(env: SupplierBridgeBuildEnvironment = process.env): string[] {
  const explicitOrigins = env.SUPPLIER_BRIDGE_ARCIGY_ORIGINS?.trim();
  if (explicitOrigins) {
    const origins = explicitOrigins.split(",").map((value) => value.trim()).filter(Boolean);
    if (origins.length === 0) throw new Error("SUPPLIER_BRIDGE_ARCIGY_ORIGINS must contain at least one origin.");
    return distinct(origins.map((origin) => exactHttpsOrigin(origin, "SUPPLIER_BRIDGE_ARCIGY_ORIGINS")));
  }
  return distinct([
    exactHttpsOrigin(env.SUPPLIER_BRIDGE_ARCIGY_PRODUCTION_ORIGIN ?? DEFAULT_SUPPLIER_BRIDGE_PRODUCTION_ORIGIN, "SUPPLIER_BRIDGE_ARCIGY_PRODUCTION_ORIGIN"),
    exactHttpsOrigin(env.SUPPLIER_BRIDGE_ARCIGY_DEVELOP_ORIGIN ?? DEFAULT_SUPPLIER_BRIDGE_DEVELOP_ORIGIN, "SUPPLIER_BRIDGE_ARCIGY_DEVELOP_ORIGIN")
  ]);
}
