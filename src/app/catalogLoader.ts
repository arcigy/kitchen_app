import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";

function isClientCatalog(value: unknown): value is ClientCatalog {
  return !!value && typeof value === "object" && "clientId" in value && "materials" in value && "priceList" in value;
}

export async function loadClientCatalogForApp(): Promise<ClientCatalog> {
  const response = await fetch("/api/catalog", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Failed to load client catalog: HTTP ${response.status}`);
  }

  const body = await response.json() as unknown;
  const catalog = body && typeof body === "object" ? (body as { catalog?: unknown }).catalog : undefined;
  if (!isClientCatalog(catalog)) {
    throw new Error("Failed to load client catalog: invalid response.");
  }
  return catalog;
}

function isModulePackage(value: unknown): value is FurnQuoteModulePackage {
  return !!value && typeof value === "object" && (value as { format?: unknown }).format === "furnquote-module";
}

export async function loadClientModulePackagesForApp(): Promise<FurnQuoteModulePackage[]> {
  const response = await fetch("/api/modules", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Failed to load client module packages: HTTP ${response.status}`);
  }

  const body = await response.json() as unknown;
  const modules = body && typeof body === "object" ? (body as { modules?: unknown }).modules : undefined;
  if (!Array.isArray(modules) || !modules.every(isModulePackage)) {
    throw new Error("Failed to load client module packages: invalid response.");
  }
  return modules;
}
