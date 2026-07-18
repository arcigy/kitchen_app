import type {
  SupplierBridgeAttachment,
  SupplierCandidateSubmission,
  SupplierProductCandidate,
  SupplierSyncSessionView
} from "../../../src/core/supplier-bridge/supplier-bridge-types";
import { parseSupplierSyncSessionView } from "./sessionViewValidation";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export class SupplierBridgeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null
  ) {
    super(message);
    this.name = "SupplierBridgeApiError";
  }
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
      response.headers.get("X-Request-Id")
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
