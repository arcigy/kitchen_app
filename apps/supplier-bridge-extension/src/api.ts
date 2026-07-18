import type {
  SupplierBridgeAttachment,
  SupplierBridgeSessionCreation,
  SupplierCandidateSubmission,
  SupplierId,
  SupplierLookupRequest,
  SupplierProductCandidate,
  SupplierSyncSessionView
} from "../../../src/core/supplier-bridge/supplier-bridge-types";
import type { ProjectMaterialsView } from "../../../src/core/project-materials/project-material-types";
import type { ProjectMetadata } from "../../../src/core/project/project-types";
import type { ClientSupplierPortal } from "../../../src/core/supplier-configuration/supplier-configuration-types";
import { parseSupplierSyncSessionView } from "./sessionViewValidation";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export class SupplierBridgeApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly code: string | null;

  constructor(message: string, status: number, requestId: string | null, code: string | null) {
    super(message);
    this.name = "SupplierBridgeApiError";
    this.status = status;
    this.requestId = requestId;
    this.code = code;
  }
}

function safeRequestId(value: string | null): string | null {
  return value && /^[a-zA-Z0-9-]{1,128}$/.test(value) ? value : null;
}

function safeErrorCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z0-9_]{1,96}$/.test(value) ? value : null;
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    // Supplier Bridge authenticates only with its short-lived bearer/bridge token.
    // Never forward the signed-in Arcigy browser cookie from an extension origin.
    credentials: "omit",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });
  const raw = await response.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) as unknown : {};
  } catch {
    throw new Error(response.ok ? "Supplier Bridge returned invalid JSON." : `Supplier Bridge HTTP ${response.status}.`);
  }
  if (!response.ok) {
    const message = record(body)?.error;
    throw new SupplierBridgeApiError(
      typeof message === "string" ? message : `Supplier Bridge HTTP ${response.status}.`,
      response.status,
      safeRequestId(response.headers.get("x-request-id")),
      safeErrorCode(record(body)?.code)
    );
  }
  return body;
}

function url(baseUrl: string, sessionId: string, action = ""): string {
  const suffix = action ? `/${action}` : "";
  return `${baseUrl}/api/supplier-bridge/sessions/${encodeURIComponent(sessionId)}${suffix}`;
}

function viewFromBody(body: unknown): SupplierSyncSessionView {
  const view = parseSupplierSyncSessionView(record(body)?.view);
  if (!view) throw new Error("Supplier Bridge response view is invalid.");
  return view;
}

export async function attachSupplierBridgeSession(
  baseUrl: string,
  sessionId: string,
  bridgeToken: string
): Promise<SupplierBridgeAttachment> {
  const body = record(await requestJson(url(baseUrl, sessionId, "attach"), {
    method: "POST",
    body: JSON.stringify({ bridgeToken })
  }));
  const view = viewFromBody(body);
  if (!body || typeof body.accessToken !== "string" || typeof body.accessTokenExpiresAt !== "string") {
    throw new Error("Supplier Bridge attachment response is invalid.");
  }
  return { view, accessToken: body.accessToken, accessTokenExpiresAt: body.accessTokenExpiresAt };
}

function authorized(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export type ExtensionAuthSession = {
  userId: string;
  clientId: string;
  role: "owner" | "editor" | "viewer";
  displayName: string;
  issuedAt: string;
  expiresAt: string;
};

function authSession(value: unknown): ExtensionAuthSession | null {
  const input = record(value);
  if (!input || typeof input.userId !== "string" || typeof input.clientId !== "string" ||
    !["owner", "editor", "viewer"].includes(String(input.role)) || typeof input.displayName !== "string" ||
    typeof input.issuedAt !== "string" || typeof input.expiresAt !== "string") return null;
  return input as ExtensionAuthSession;
}

export async function loginExtension(baseUrl: string, username: string, password: string): Promise<{ accessToken: string; session: ExtensionAuthSession }> {
  const body = record(await requestJson(`${baseUrl}/api/auth/extension-login`, {
    method: "POST",
    body: JSON.stringify({ username, password })
  }));
  const session = authSession(body?.session);
  if (!body || typeof body.accessToken !== "string" || !session) throw new Error("Arcigy login response is invalid.");
  return { accessToken: body.accessToken, session };
}

export async function loadExtensionSession(baseUrl: string, accessToken: string): Promise<ExtensionAuthSession> {
  const body = record(await requestJson(`${baseUrl}/api/auth/extension-session`, { method: "GET", headers: authorized(accessToken) }));
  const session = authSession(body?.session);
  if (!session) throw new Error("Arcigy session is invalid.");
  return session;
}

export async function logoutExtension(baseUrl: string, accessToken: string): Promise<void> {
  await requestJson(`${baseUrl}/api/auth/extension-logout`, { method: "POST", headers: authorized(accessToken) });
}

export async function loadExtensionProjects(baseUrl: string, accessToken: string): Promise<ProjectMetadata[]> {
  const body = record(await requestJson(`${baseUrl}/api/projects`, { method: "GET", headers: authorized(accessToken) }));
  if (!Array.isArray(body?.projects)) throw new Error("Project list response is invalid.");
  return body.projects as ProjectMetadata[];
}

export async function loadExtensionProjectMaterials(baseUrl: string, accessToken: string, projectId: string): Promise<ProjectMaterialsView> {
  const body = record(await requestJson(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/materials`, { method: "GET", headers: authorized(accessToken) }));
  const view = record(body?.view);
  if (!view || !record(view.assignments) || !Array.isArray(record(view.assignments)?.assignments) || !Array.isArray(view.scopes)) {
    throw new Error("Project materials response is invalid.");
  }
  return view as ProjectMaterialsView;
}

export async function loadExtensionSuppliers(baseUrl: string, accessToken: string): Promise<ClientSupplierPortal[]> {
  const body = record(await requestJson(`${baseUrl}/api/suppliers`, { method: "GET", headers: authorized(accessToken) }));
  if (!Array.isArray(body?.suppliers)) throw new Error("Supplier list response is invalid.");
  return body.suppliers as ClientSupplierPortal[];
}

export async function createExtensionTargetSession(
  baseUrl: string,
  accessToken: string,
  projectId: string,
  supplierId: SupplierId,
  lookup: Omit<SupplierLookupRequest, "projectId" | "supplierId">
): Promise<SupplierBridgeSessionCreation> {
  const body = record(await requestJson(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/supplier-sync-sessions`, {
    method: "POST",
    headers: authorized(accessToken),
    body: JSON.stringify({ supplierId, projectId, lookups: [{ ...lookup, projectId, supplierId }] })
  }));
  const view = viewFromBody(body);
  if (!body || typeof body.bridgeToken !== "string") throw new Error("Supplier Bridge session response is invalid.");
  return { view, bridgeToken: body.bridgeToken };
}

export async function loadSupplierBridgeSession(baseUrl: string, sessionId: string, accessToken: string): Promise<SupplierSyncSessionView> {
  return viewFromBody(await requestJson(url(baseUrl, sessionId), { method: "GET", headers: authorized(accessToken) }));
}

export async function submitSupplierCandidate(
  baseUrl: string,
  sessionId: string,
  accessToken: string,
  submission: SupplierCandidateSubmission
): Promise<{ view: SupplierSyncSessionView; candidate: SupplierProductCandidate; idempotent: boolean }> {
  const body = record(await requestJson(url(baseUrl, sessionId, "candidates"), {
    method: "POST",
    headers: authorized(accessToken),
    body: JSON.stringify(submission)
  }));
  const view = viewFromBody(body);
  const candidateId = record(body?.candidate)?.id;
  const candidate = typeof candidateId === "string" ? view.candidates.find((entry) => entry.id === candidateId) : null;
  if (!candidate || typeof body?.idempotent !== "boolean") throw new Error("Supplier candidate response is invalid.");
  return { view, candidate, idempotent: body.idempotent };
}

export async function confirmSupplierCandidate(
  baseUrl: string,
  sessionId: string,
  accessToken: string,
  syncItemId: string,
  candidateId: string
): Promise<SupplierSyncSessionView> {
  return viewFromBody(await requestJson(url(baseUrl, sessionId, "confirm"), {
    method: "POST",
    headers: authorized(accessToken),
    body: JSON.stringify({ syncItemId, candidateId })
  }));
}

export async function skipSupplierSyncItem(
  baseUrl: string,
  sessionId: string,
  accessToken: string,
  syncItemId: string,
  errorCode: string | null
): Promise<SupplierSyncSessionView> {
  return viewFromBody(await requestJson(url(baseUrl, sessionId, "skip"), {
    method: "POST",
    headers: authorized(accessToken),
    body: JSON.stringify({ syncItemId, errorCode })
  }));
}

export async function cancelSupplierBridgeSession(baseUrl: string, sessionId: string, accessToken: string): Promise<SupplierSyncSessionView> {
  return viewFromBody(await requestJson(url(baseUrl, sessionId, "cancel"), {
    method: "POST",
    headers: authorized(accessToken)
  }));
}
