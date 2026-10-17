import type { ProjectMetadata } from "../../core/project/project-types";
import type { ProjectActions } from "./projectActions";

/**
 * Client side of offer tracking (docs/CRM_CLIENT_METRICS.md): reports generated offer documents and
 * lets the user mark an offer as sent to the end customer. Reporting never blocks or breaks an export.
 */
export type OfferExportKind = "pdf" | "sheet";

export type OfferTracking = {
  currentProject(): ProjectMetadata | null;
  recordExport(kind: OfferExportKind): Promise<boolean>;
  setSent(sent: boolean): Promise<ProjectMetadata>;
};

type OfferTrackingDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const EXPORT_EVENT_TYPES: Record<OfferExportKind, string> = {
  pdf: "offer.pdf_generated",
  sheet: "offer.sheet_generated"
};
const RETRY_DELAYS_MS = [1_000, 4_000];

function idempotencyKey(kind: OfferExportKind): string {
  return `offer-${kind}:${globalThis.crypto.randomUUID()}`;
}

/** Reports one generated offer document; retries network and server failures with the same key. */
export async function recordOfferExport(
  projectId: string | null | undefined,
  kind: OfferExportKind,
  deps: OfferTrackingDeps = {}
): Promise<boolean> {
  if (!projectId) return false;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const key = idempotencyKey(kind);
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetchImpl(`/api/projects/${encodeURIComponent(projectId)}/offer-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({ type: EXPORT_EVENT_TYPES[kind] })
      });
      if (response.ok) return true;
      if (response.status < 500) return false;
    } catch {
      // Network failure: retry below.
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    await sleep(delay);
  }
  console.warn(`[offer-tracking] ${EXPORT_EVENT_TYPES[kind]} was not recorded for project ${projectId}`);
  return false;
}

export async function setOfferSent(projectId: string, sent: boolean, deps: OfferTrackingDeps = {}): Promise<ProjectMetadata> {
  const response = await (deps.fetchImpl ?? fetch)(`/api/projects/${encodeURIComponent(projectId)}/offer-status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ sent })
  });
  const data = await response.json().catch(() => ({})) as { project?: ProjectMetadata; error?: string };
  if (!response.ok || !data.project) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data.project;
}

export function createOfferTracking(
  projectActions: Pick<ProjectActions, "getState" | "updateCurrentMetadata">,
  deps: OfferTrackingDeps = {}
): OfferTracking {
  return {
    currentProject: () => projectActions.getState().currentProject,
    recordExport: (kind) => recordOfferExport(projectActions.getState().currentProject?.projectId, kind, deps),
    async setSent(sent) {
      const project = projectActions.getState().currentProject;
      if (!project) throw new Error("Open a project before marking its offer as sent.");
      const updated = await setOfferSent(project.projectId, sent, deps);
      projectActions.updateCurrentMetadata(updated);
      return updated;
    }
  };
}
