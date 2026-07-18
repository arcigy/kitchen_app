import type { ProjectMarginCategory, ProjectMarginTarget } from "../core/project-margins/project-margin-types";
import type { ProjectMarginSettingsOperation, ProjectMarginsView } from "../layout/bom/projectMargins";

export class ProjectMarginsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly revision: number | null
  ) {
    super(message);
    this.name = "ProjectMarginsApiError";
  }
}

export type ProjectMarginMutationRequest = {
  revision: number;
  operation: ProjectMarginSettingsOperation;
};

export type UpdateProjectMarginDefaultRequest = {
  revision: number;
  marginPercent: number;
};

export type ApplyProjectMarginGroupRequest = {
  revision: number;
  category: ProjectMarginCategory;
  marginPercent: number;
};

export type UpdateProjectMarginItemRequest = {
  revision: number;
  target: ProjectMarginTarget;
  marginPercent: number;
};

export type ResetProjectMarginGroupRequest = {
  revision: number;
  category: ProjectMarginCategory;
};

export type ResetProjectMarginItemRequest = {
  revision: number;
  target: ProjectMarginTarget;
};

export type SetProjectAdditionalLaborRequest = {
  revision: number;
  additionalLaborCost: number;
};

function responseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new ProjectMarginsApiError(
        response.ok ? "Server vrátil neplatnú odpoveď marží." : text,
        response.status,
        null,
        null
      );
    }
  }
  if (!response.ok) {
    const body = responseRecord(data);
    throw new ProjectMarginsApiError(
      typeof body.error === "string" ? body.error : `HTTP ${response.status}`,
      response.status,
      typeof body.code === "string" ? body.code : null,
      typeof body.revision === "number" && Number.isSafeInteger(body.revision) ? body.revision : null
    );
  }
  return data;
}

function unwrapProjectMarginsView(data: unknown): ProjectMarginsView {
  const body = responseRecord(data);
  const view = responseRecord(body.view ?? data);
  if (
    typeof view.revision !== "number"
    || typeof view.editable !== "boolean"
    || view.currency !== "EUR"
    || !Array.isArray(view.groups)
    || !Array.isArray(view.warnings)
    || !view.summary
  ) {
    throw new ProjectMarginsApiError("Odpoveď projektových marží je neúplná.", 200, "INVALID_MARGIN_RESPONSE", null);
  }
  return view as ProjectMarginsView;
}

export async function loadProjectMargins(projectId: string, signal?: AbortSignal): Promise<ProjectMarginsView> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/margins`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal
  });
  return unwrapProjectMarginsView(await readJson(response));
}

export async function updateProjectMargins(
  projectId: string,
  request: ProjectMarginMutationRequest,
  signal?: AbortSignal
): Promise<ProjectMarginsView> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/margins`, {
    method: "PUT",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal
  });
  return unwrapProjectMarginsView(await readJson(response));
}

export function updateProjectMarginDefault(
  projectId: string,
  request: UpdateProjectMarginDefaultRequest,
  signal?: AbortSignal
): Promise<ProjectMarginsView> {
  return updateProjectMargins(projectId, {
    revision: request.revision,
    operation: { type: "set_default", marginPercent: request.marginPercent }
  }, signal);
}

export function applyProjectMarginGroup(
  projectId: string,
  request: ApplyProjectMarginGroupRequest,
  signal?: AbortSignal
): Promise<ProjectMarginsView> {
  return updateProjectMargins(projectId, {
    revision: request.revision,
    operation: { type: "set_group", category: request.category, marginPercent: request.marginPercent }
  }, signal);
}

export function updateProjectMarginItem(
  projectId: string,
  request: UpdateProjectMarginItemRequest,
  signal?: AbortSignal
): Promise<ProjectMarginsView> {
  return updateProjectMargins(projectId, {
    revision: request.revision,
    operation: { type: "set_item", target: request.target, marginPercent: request.marginPercent }
  }, signal);
}

export function resetProjectMarginGroup(
  projectId: string,
  request: ResetProjectMarginGroupRequest,
  signal?: AbortSignal
): Promise<ProjectMarginsView> {
  return updateProjectMargins(projectId, {
    revision: request.revision,
    operation: { type: "reset_group", category: request.category }
  }, signal);
}

export function resetProjectMarginItem(
  projectId: string,
  request: ResetProjectMarginItemRequest,
  signal?: AbortSignal
): Promise<ProjectMarginsView> {
  return updateProjectMargins(projectId, {
    revision: request.revision,
    operation: { type: "reset_item", target: request.target }
  }, signal);
}

export function setProjectAdditionalLabor(
  projectId: string,
  request: SetProjectAdditionalLaborRequest,
  signal?: AbortSignal
): Promise<ProjectMarginsView> {
  return updateProjectMargins(projectId, {
    revision: request.revision,
    operation: { type: "set_additional_labor", additionalLaborCost: request.additionalLaborCost }
  }, signal);
}
