import type { ComponentDefinition, MaterialDefinition } from "../core/catalog/catalog-types";
import {
  getMaterialAssignmentCategoryDefinition,
  type MaterialAssignmentCategoryDefinition
} from "../core/project-materials/project-material-business";
import type {
  MaterialAssignmentCategory,
  ProjectMaterialAssignment,
  ProjectMaterialsView
} from "../core/project-materials/project-material-types";

export type ProjectMaterialCatalogLookup =
  | { kind: "material"; definition: MaterialDefinition; unitPrice: number | null }
  | { kind: "component"; definition: ComponentDefinition; unitPrice: number | null };

export type UpdateProjectMaterialAssignmentRequest = {
  revision: number;
  assignment: ProjectMaterialAssignment;
};

export type CopyProjectMaterialAssignmentRequest = {
  revision: number;
  sourceAssignmentId: string;
  target: {
    scopeId: string;
    itemId: string;
    category: MaterialAssignmentCategory;
  };
};

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      if (!response.ok) throw new Error(text);
      throw new Error("Server vrátil neplatnú JSON odpoveď.");
    }
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data
      ? String((data as { error?: unknown }).error)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function unwrapProjectMaterialsView(data: unknown): ProjectMaterialsView {
  if (!data || typeof data !== "object") throw new Error("Odpoveď materiálov je neplatná.");
  const record = data as Record<string, unknown>;
  const candidate = record.view ?? record.materials ?? data;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !("assignments" in candidate) ||
    !("quantities" in candidate) ||
    !("warnings" in candidate) ||
    !("priceSource" in candidate)
  ) {
    throw new Error("Odpoveď materiálov je neúplná.");
  }
  return candidate as ProjectMaterialsView;
}

export async function loadProjectMaterials(projectId: string, signal?: AbortSignal): Promise<ProjectMaterialsView> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/materials`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal
  });
  return unwrapProjectMaterialsView(await readJson(response));
}

export async function updateProjectMaterialAssignment(
  projectId: string,
  request: UpdateProjectMaterialAssignmentRequest,
  signal?: AbortSignal
): Promise<ProjectMaterialsView> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/materials`, {
    method: "PUT",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal
  });
  return unwrapProjectMaterialsView(await readJson(response));
}

export async function copyProjectMaterialAssignment(
  projectId: string,
  request: CopyProjectMaterialAssignmentRequest,
  signal?: AbortSignal
): Promise<ProjectMaterialsView> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/materials`, {
    method: "PUT",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      revision: request.revision,
      operation: {
        type: "copy_assignment",
        sourceAssignmentId: request.sourceAssignmentId,
        target: request.target
      }
    }),
    signal
  });
  return unwrapProjectMaterialsView(await readJson(response));
}

function lookupParams(definition: MaterialAssignmentCategoryDefinition, id: string): URLSearchParams {
  const params = new URLSearchParams({ kind: definition.kind, id });
  if (definition.kind === "material" && definition.materialType === "board" && definition.boardFamilies?.length === 1) {
    params.set("family", definition.boardFamilies[0]!);
  }
  if (definition.kind === "component" && definition.componentTypes?.length === 1) {
    params.set("componentType", definition.componentTypes[0]!);
  }
  return params;
}

export async function lookupProjectMaterialCatalogItem(
  category: MaterialAssignmentCategory,
  id: string,
  signal?: AbortSignal
): Promise<ProjectMaterialCatalogLookup | null> {
  const normalized = id.trim();
  if (!normalized) return null;
  const definition = getMaterialAssignmentCategoryDefinition(category);
  const response = await fetch(`/api/catalog/lookup?${lookupParams(definition, normalized).toString()}`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal
  });
  if (response.status === 404) return null;
  const data = await readJson(response);
  const body = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const unitPrice = typeof body.unitPrice === "number" && Number.isFinite(body.unitPrice) && body.unitPrice >= 0
    ? body.unitPrice
    : null;

  if (definition.kind === "material") {
    const material = body.material as MaterialDefinition | null | undefined;
    return material ? { kind: "material", definition: material, unitPrice } : null;
  }
  const component = body.component as ComponentDefinition | null | undefined;
  return component ? { kind: "component", definition: component, unitPrice } : null;
}
