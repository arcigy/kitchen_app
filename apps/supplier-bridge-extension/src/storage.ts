import type { SupplierSyncSessionView } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import { parseSupplierSyncSessionView } from "./sessionViewValidation";

const PROGRESS_KEY = "arcigySupplierBridgeProgress";
const SECRETS_KEY = "arcigySupplierBridgeSessionSecrets";
const PROJECT_CONTEXT_KEY = "arcigySupplierBridgeProjectContext";

export type SupplierBridgeProjectContext = {
  version: 1;
  projectId: string;
  projectLabel: string;
  updatedAt: string;
};

export type SupplierBridgeProgress = {
  version: 1;
  sessionId: string;
  projectLabel: string;
  arcigyOrigin: string;
  backendBaseUrl: string;
  supplierId: string;
  activeSupplierTabId: number | null;
  supplierTabState: {
    supplierId: string;
    tabId: number;
    currentLookupRequestId: string | null;
    manuallyModified: boolean;
  } | null;
  view: SupplierSyncSessionView;
  lastWarning: string | null;
  trace: SupplierBridgeTrace[];
  updatedAt: string;
};

export type SupplierBridgeTrace = {
  at: string;
  stage: string;
  outcome: "ok" | "warning" | "error";
  code: string | null;
};

export type SupplierBridgeSessionSecrets = {
  version: 1;
  sessionId: string;
  bridgeToken: string | null;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
};

export function parseSupplierBridgeProjectContext(value: unknown): SupplierBridgeProjectContext | null {
  const input = record(value);
  if (!input || input.version !== 1 || typeof input.projectId !== "string" || input.projectId.length === 0 || input.projectId.length > 200 || typeof input.projectLabel !== "string" || input.projectLabel.length > 300 || typeof input.updatedAt !== "string" || !Number.isFinite(Date.parse(input.updatedAt))) return null;
  return { version: 1, projectId: input.projectId, projectLabel: input.projectLabel, updatedAt: input.updatedAt };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseTrace(value: unknown): SupplierBridgeTrace[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 16) return null;
  const traces: SupplierBridgeTrace[] = [];
  for (const entry of value) {
    const input = record(entry);
    if (!input || typeof input.at !== "string" || !Number.isFinite(Date.parse(input.at)) || typeof input.stage !== "string" || input.stage.length === 0 || input.stage.length > 120 || !["ok", "warning", "error"].includes(String(input.outcome)) || (input.code !== null && (typeof input.code !== "string" || input.code.length > 160))) return null;
    traces.push({ at: input.at, stage: input.stage, outcome: input.outcome as SupplierBridgeTrace["outcome"], code: input.code as string | null });
  }
  return traces;
}

export function parseSupplierBridgeProgress(value: unknown): SupplierBridgeProgress | null {
  const input = record(value);
  if (!input || input.version !== 1) return null;
  if (typeof input.sessionId !== "string" || (input.projectLabel !== undefined && typeof input.projectLabel !== "string") || typeof input.arcigyOrigin !== "string" || typeof input.backendBaseUrl !== "string" || typeof input.supplierId !== "string") return null;
  if (input.activeSupplierTabId !== null && (typeof input.activeSupplierTabId !== "number" || !Number.isInteger(input.activeSupplierTabId))) return null;
  const rawTabState = record(input.supplierTabState);
  const supplierTabState = input.supplierTabState == null ? null : rawTabState;
  if (supplierTabState && (
    typeof supplierTabState.supplierId !== "string" ||
    typeof supplierTabState.tabId !== "number" || !Number.isInteger(supplierTabState.tabId) ||
    (supplierTabState.currentLookupRequestId !== null && typeof supplierTabState.currentLookupRequestId !== "string") ||
    typeof supplierTabState.manuallyModified !== "boolean"
  )) return null;
  if (input.lastWarning !== null && typeof input.lastWarning !== "string") return null;
  const trace = parseTrace(input.trace);
  if (!trace) return null;
  if (typeof input.updatedAt !== "string" || !Number.isFinite(Date.parse(input.updatedAt))) return null;
  const view = parseSupplierSyncSessionView(input.view);
  if (!view || view.session.id !== input.sessionId) return null;
  return {
    version: 1,
    sessionId: input.sessionId,
    projectLabel: typeof input.projectLabel === "string" ? input.projectLabel : "",
    arcigyOrigin: input.arcigyOrigin,
    backendBaseUrl: input.backendBaseUrl,
    supplierId: input.supplierId,
    activeSupplierTabId: input.activeSupplierTabId,
    supplierTabState: supplierTabState ? {
      supplierId: supplierTabState.supplierId as string,
      tabId: supplierTabState.tabId as number,
      currentLookupRequestId: supplierTabState.currentLookupRequestId as string | null,
      manuallyModified: supplierTabState.manuallyModified as boolean
    } : null,
    view,
    lastWarning: input.lastWarning,
    trace,
    updatedAt: input.updatedAt
  };
}

export function appendSupplierBridgeTrace(progress: SupplierBridgeProgress, trace: Omit<SupplierBridgeTrace, "at">): SupplierBridgeProgress {
  const next = { ...trace, at: new Date().toISOString() };
  return { ...progress, trace: [...progress.trace, next].slice(-16), updatedAt: next.at };
}

export function parseSupplierBridgeSessionSecrets(value: unknown): SupplierBridgeSessionSecrets | null {
  const input = record(value);
  if (!input || input.version !== 1 || typeof input.sessionId !== "string") return null;
  const bridgeToken = input.bridgeToken;
  const accessToken = input.accessToken;
  const accessTokenExpiresAt = input.accessTokenExpiresAt;
  if (bridgeToken !== null && typeof bridgeToken !== "string") return null;
  if (accessToken !== null && typeof accessToken !== "string") return null;
  if (accessTokenExpiresAt !== null && typeof accessTokenExpiresAt !== "string") return null;
  return {
    version: 1,
    sessionId: input.sessionId,
    bridgeToken,
    accessToken,
    accessTokenExpiresAt
  };
}

export async function loadSupplierBridgeProgress(): Promise<SupplierBridgeProgress | null> {
  const stored = await chrome.storage.local.get(PROGRESS_KEY);
  return parseSupplierBridgeProgress(stored[PROGRESS_KEY]);
}

export async function saveSupplierBridgeProgress(progress: SupplierBridgeProgress): Promise<void> {
  const validated = parseSupplierBridgeProgress(progress);
  if (!validated) throw new Error("Supplier Bridge progress is invalid.");
  await chrome.storage.local.set({ [PROGRESS_KEY]: validated });
}

export async function loadSupplierBridgeProjectContext(): Promise<SupplierBridgeProjectContext | null> {
  const stored = await chrome.storage.local.get(PROJECT_CONTEXT_KEY);
  return parseSupplierBridgeProjectContext(stored[PROJECT_CONTEXT_KEY]);
}

export async function saveSupplierBridgeProjectContext(context: SupplierBridgeProjectContext): Promise<void> {
  const validated = parseSupplierBridgeProjectContext(context);
  if (!validated) throw new Error("Supplier Bridge project context is invalid.");
  await chrome.storage.local.set({ [PROJECT_CONTEXT_KEY]: validated });
}

export async function loadSupplierBridgeSecrets(): Promise<SupplierBridgeSessionSecrets | null> {
  const stored = await chrome.storage.session.get(SECRETS_KEY);
  return parseSupplierBridgeSessionSecrets(stored[SECRETS_KEY]);
}

export async function saveSupplierBridgeSecrets(secrets: SupplierBridgeSessionSecrets): Promise<void> {
  const validated = parseSupplierBridgeSessionSecrets(secrets);
  if (!validated) throw new Error("Supplier Bridge session secrets are invalid.");
  await chrome.storage.session.set({ [SECRETS_KEY]: validated });
}

export async function clearSupplierBridgeState(): Promise<void> {
  await Promise.all([
    chrome.storage.local.remove(PROGRESS_KEY),
    chrome.storage.session.remove(SECRETS_KEY)
  ]);
}
