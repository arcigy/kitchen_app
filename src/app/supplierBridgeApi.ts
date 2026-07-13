import type { SupplierBridgeSessionCreation, SupplierLookupRequest, SupplierSyncSessionView } from "../core/supplier-bridge/supplier-bridge-types";
import { parseSupplierSyncSessionView } from "../core/supplier-bridge/supplier-session-view-validation";
import type { ClientSupplierPortal } from "../core/supplier-configuration/supplier-configuration-types";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function requestJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers }
  });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) as unknown : {}; } catch { throw new Error("Supplier Bridge vrátil neplatnú odpoveď."); }
  const parsed = record(body);
  if (!response.ok || !parsed) throw new Error(typeof parsed?.error === "string" ? parsed.error : `Supplier Bridge HTTP ${response.status}.`);
  return parsed;
}

function viewFromBody(body: Record<string, unknown>): SupplierSyncSessionView {
  const view = parseSupplierSyncSessionView(body.view);
  if (!view) throw new Error("Supplier Bridge session má neplatný formát.");
  return view;
}

export async function loadConfiguredSuppliers(signal?: AbortSignal): Promise<ClientSupplierPortal[]> {
  const body = await requestJson("/api/suppliers", { method: "GET", signal });
  if (!Array.isArray(body.suppliers)) throw new Error("Zoznam dodávateľov má neplatný formát.");
  return body.suppliers.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const supplier = value as Record<string, unknown>;
    if (typeof supplier.supplierId !== "string" || typeof supplier.displayName !== "string" || typeof supplier.startUrl !== "string" || typeof supplier.adapterKey !== "string" || typeof supplier.sortOrder !== "number") return [];
    return [{ supplierId: supplier.supplierId, displayName: supplier.displayName, startUrl: supplier.startUrl, adapterKey: supplier.adapterKey, sortOrder: supplier.sortOrder }];
  });
}

export async function createSupplierSyncSession(
  projectId: string,
  supplierId: string,
  lookups: readonly Omit<SupplierLookupRequest, "projectId">[] = [],
  signal?: AbortSignal
): Promise<SupplierBridgeSessionCreation> {
  const body = await requestJson(`/api/projects/${encodeURIComponent(projectId)}/supplier-sync-sessions`, {
    method: "POST",
    body: JSON.stringify({ supplierId, projectId, lookups: lookups.map((lookup) => ({ ...lookup, projectId })) }),
    signal
  });
  const view = viewFromBody(body);
  if (typeof body.bridgeToken !== "string" || body.bridgeToken.length < 20) throw new Error("Supplier Bridge one-time token chýba.");
  return { view, bridgeToken: body.bridgeToken };
}

export async function loadSupplierSyncSession(projectId: string, sessionId: string, signal?: AbortSignal): Promise<SupplierSyncSessionView> {
  return viewFromBody(await requestJson(`/api/projects/${encodeURIComponent(projectId)}/supplier-sync-sessions/${encodeURIComponent(sessionId)}`, { method: "GET", signal }));
}

export async function cancelSupplierSyncSession(projectId: string, sessionId: string, signal?: AbortSignal): Promise<SupplierSyncSessionView> {
  return viewFromBody(await requestJson(`/api/projects/${encodeURIComponent(projectId)}/supplier-sync-sessions/${encodeURIComponent(sessionId)}/cancel`, { method: "POST", signal }));
}
