import type { ClientCatalog } from "../core/catalog/catalog-types";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { systemModulePackageTemplates } from "../system/module-packages";

const LOCAL_DEV_CLIENT_ID = "client_arcigy_demo";

const localDevModulePackages = systemModulePackageTemplates;

function shouldUseLocalDevFallback() {
  return (
    import.meta.env.DEV &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
  );
}

function createLocalDevCatalog(): ClientCatalog {
  return {
    clientId: LOCAL_DEV_CLIENT_ID,
    ...createSystemCatalogSeed()
  };
}

function isClientCatalog(value: unknown): value is ClientCatalog {
  return !!value && typeof value === "object" && "clientId" in value && "materials" in value && "priceList" in value;
}

export async function loadClientCatalogForApp(): Promise<ClientCatalog> {
  if (shouldUseLocalDevFallback()) return createLocalDevCatalog();

  let response: Response;
  try {
    response = await fetch("/api/catalog", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
  } catch (error) {
    if (shouldUseLocalDevFallback()) return createLocalDevCatalog();
    throw error;
  }
  if (!response.ok) {
    if (shouldUseLocalDevFallback()) return createLocalDevCatalog();
    throw new Error(`Failed to load client catalog: HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json() as unknown;
  } catch (error) {
    if (shouldUseLocalDevFallback()) return createLocalDevCatalog();
    throw error;
  }
  const catalog = body && typeof body === "object" ? (body as { catalog?: unknown }).catalog : undefined;
  if (!isClientCatalog(catalog)) {
    if (shouldUseLocalDevFallback()) return createLocalDevCatalog();
    throw new Error("Failed to load client catalog: invalid response.");
  }
  return catalog;
}

function isModulePackage(value: unknown): value is FurnQuoteModulePackage {
  return !!value && typeof value === "object" && (value as { format?: unknown }).format === "furnquote-module";
}

export async function loadClientModulePackagesForApp(): Promise<FurnQuoteModulePackage[]> {
  if (shouldUseLocalDevFallback()) return localDevModulePackages;

  let response: Response;
  try {
    response = await fetch("/api/modules", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
  } catch (error) {
    if (shouldUseLocalDevFallback()) return localDevModulePackages;
    throw error;
  }
  if (!response.ok) {
    if (shouldUseLocalDevFallback()) return localDevModulePackages;
    throw new Error(`Failed to load client module packages: HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json() as unknown;
  } catch (error) {
    if (shouldUseLocalDevFallback()) return localDevModulePackages;
    throw error;
  }
  const modules = body && typeof body === "object" ? (body as { modules?: unknown }).modules : undefined;
  if (!Array.isArray(modules) || !modules.every(isModulePackage)) {
    if (shouldUseLocalDevFallback()) return localDevModulePackages;
    throw new Error("Failed to load client module packages: invalid response.");
  }
  return modules;
}
