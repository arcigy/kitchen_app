import type { ClientContext } from "../client/client-context";

export const DEFAULT_PROJECT_ID = "project_default";
export const DEFAULT_PHASE_ID = "phase_default";

export type ClientProjectPhaseScope = {
  clientId: string;
  projectId: string;
  phaseId: string;
};

export type PhaseStorageBucket = "saves" | "backups" | "exports" | "renders" | "uploads";

const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;

export function sanitizeStorageId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (!SAFE_ID_RE.test(trimmed)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
  return trimmed;
}

export function sanitizeStorageFileName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("fileName is required.");
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new Error("fileName contains an unsafe path segment.");
  }
  return trimmed.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function createClientProjectPhaseScope(
  context: ClientContext,
  input: { projectId?: string | null; phaseId?: string | null } = {}
): ClientProjectPhaseScope {
  return {
    clientId: sanitizeStorageId(context.clientId, "clientId"),
    projectId: sanitizeStorageId(input.projectId || DEFAULT_PROJECT_ID, "projectId"),
    phaseId: sanitizeStorageId(input.phaseId || DEFAULT_PHASE_ID, "phaseId")
  };
}

export function assertClientScope(context: ClientContext, scope: ClientProjectPhaseScope): void {
  if (context.clientId !== scope.clientId) {
    throw new Error("Current session cannot access the requested client storage.");
  }
}
