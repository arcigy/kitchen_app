import type http from "node:http";
import { clientSessionHeaderFromRequest } from "./requestAuthentication";
import type { ClientCatalog, ComponentDefinition, MaterialDefinition } from "../core/catalog/catalog-types";
import type { ClientContext } from "../core/client/client-context";
import {
  createDefaultProjectMaterialAssignments,
  createProjectMaterialsView,
  getMaterialAssignmentCategoryDefinition,
  isComponentAllowedForCategory,
  isMaterialAllowedForCategory,
  MATERIAL_ASSIGNMENT_CATEGORIES,
  normalizeAutoProjectMaterialAssignments
} from "../core/project-materials/project-material-business";
import { copyProjectMaterialAssignmentToScope } from "../core/project-materials/project-material-copy";
import type {
  CatalogItemSnapshot,
  MaterialAssignmentCategory,
  ProjectMaterialAssignment,
  ProjectMaterialAssignmentsState,
  ProjectMaterialScopeItem,
  ProjectMaterialsView
} from "../core/project-materials/project-material-types";
import { PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION } from "../core/project-materials/project-material-types";
import { validateProjectMaterialAssignmentsState } from "../core/project-materials/project-material-validation";
import { synchronizeRunnerHeightAssignments } from "../core/project-materials/runner-height-assignments";
import { createProjectService } from "../core/project/project-service";
import {
  ProjectMaterialRevisionConflictError,
  type ProjectRepository
} from "../core/project/project-repository";
import type { ProjectSaveFile } from "../core/project-save/project-save-types";
import { resolveProjectMaterialQuantities } from "./projectMaterialQuantityResolver";
import { resolveProjectMaterialScopes } from "./projectMaterialScopes";
import { createServerProjectRepository } from "./projectRepository";
import { createServerCatalogRepository } from "./serverRepositories";

type ReadJsonBody = (req: http.IncomingMessage) => Promise<unknown>;
type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;
type GetContext = (cookieHeader: string | string[] | undefined) => Promise<ClientContext>;

export type ProjectMaterialsEndpointDeps = {
  projectRoot: string;
  getContext: GetContext;
  readJsonBody: ReadJsonBody;
  sendJson: SendJson;
};

type ProjectMaterialsRoute = {
  projectId: string;
  action: "materials" | "validate" | "warnings";
};

function parseRoute(pathname: string): ProjectMaterialsRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "projects" || !parts[2]) return null;
  let projectId: string;
  try {
    projectId = decodeURIComponent(parts[2]);
  } catch {
    return null;
  }
  if (parts.length === 4 && parts[3] === "materials") return { projectId, action: "materials" };
  if (parts.length === 5 && parts[3] === "materials" && parts[4] === "validate") return { projectId, action: "validate" };
  if (parts.length === 4 && parts[3] === "warnings") return { projectId, action: "warnings" };
  return null;
}

function bodyRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON body.");
  if ("clientId" in value) throw new Error("Unexpected clientId in request body.");
  return value as Record<string, unknown>;
}

function normalizeState(save: ProjectSaveFile, catalog: ClientCatalog, now = new Date().toISOString()): ProjectMaterialAssignmentsState {
  const state = save.appState.materialAssignments;
  const normalized = state.initialized
    ? normalizeAutoProjectMaterialAssignments(state, catalog, now)
    : createDefaultProjectMaterialAssignments(catalog, now);
  return synchronizeRunnerHeightAssignments(normalized, resolveProjectMaterialScopes(save, catalog), now);
}

async function loadNormalizedProjectState(
  ctx: ClientContext,
  projectId: string,
  repository: ProjectRepository,
  catalog: ClientCatalog
): Promise<{ save: ProjectSaveFile; state: ProjectMaterialAssignmentsState }> {
  const service = createProjectService(repository);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const save = await service.loadProject(ctx, projectId);
    const stored = save.appState.materialAssignments;
    const normalized = normalizeState(save, catalog);
    if (JSON.stringify(stored) === JSON.stringify(normalized)) return { save, state: normalized };

    const next: ProjectMaterialAssignmentsState = {
      ...normalized,
      revision: stored.revision + 1,
      updatedAt: new Date().toISOString()
    };
    validateProjectMaterialAssignmentsState(next, "normalized project material assignments");
    try {
      const persisted = await repository.updateProjectMaterialAssignments(
        ctx,
        save.projectId,
        save.activePhaseId,
        stored.revision,
        next
      );
      return { save: persisted, state: persisted.appState.materialAssignments };
    } catch (error) {
      if (!(error instanceof ProjectMaterialRevisionConflictError) || attempt === 2) throw error;
    }
  }
  throw new Error("Project material normalization did not converge.");
}

function projectMaterialsView(
  save: ProjectSaveFile,
  state: ProjectMaterialAssignmentsState,
  catalog: ClientCatalog
): ProjectMaterialsView {
  const resolution = resolveProjectMaterialQuantities(save, catalog);
  const view = createProjectMaterialsView(state, resolution.quantities, catalog);
  return {
    ...view,
    scopes: resolveProjectMaterialScopes(save, catalog),
    warnings: [...new Map([...view.warnings, ...resolution.warnings].map((warning) => [warning.id, warning])).values()]
  };
}

function snapshot<T extends MaterialDefinition | ComponentDefinition>(
  definition: T,
  catalog: ClientCatalog,
  capturedAt: string
): CatalogItemSnapshot<T> {
  const price = catalog.priceList.prices[definition.id];
  return {
    definition: structuredClone(definition),
    unitPrice: typeof price === "number" && Number.isFinite(price) && price >= 0 ? price : null,
    currency: catalog.priceList.currency,
    priceListId: catalog.priceList.id,
    capturedAt
  };
}

function authoritativeEdge(
  requestedId: string | undefined,
  category: "edge_front" | "edge_other",
  catalog: ClientCatalog,
  now: string
): { id: string; snapshot: CatalogItemSnapshot<MaterialDefinition> } | undefined {
  const id = requestedId?.trim();
  if (!id) return undefined;
  const material = catalog.materials.find((item) => item.id === id);
  if (!material) throw new ProjectMaterialUpdateError(`Edge material ${id} does not exist.`, 422);
  if (!material.isActive) throw new ProjectMaterialUpdateError(`Edge material ${id} is inactive.`, 422);
  if (!isMaterialAllowedForCategory(material, category)) {
    throw new ProjectMaterialUpdateError(`Material ${id} is not a valid edge material.`, 422);
  }
  return { id: material.id, snapshot: snapshot(material, catalog, now) };
}

class ProjectMaterialUpdateError extends Error {
  constructor(message: string, readonly status: 400 | 409 | 422, readonly code = "PROJECT_MATERIAL_UPDATE_FAILED") {
    super(message);
  }
}

function authoritativeAssignment(
  requested: ProjectMaterialAssignment,
  catalog: ClientCatalog,
  now: string
): ProjectMaterialAssignment {
  const definition = getMaterialAssignmentCategoryDefinition(requested.category);
  if (requested.kind !== definition.kind) throw new ProjectMaterialUpdateError("Assignment type does not match its category.", 422);

  if (definition.kind === "material") {
    const requestedId = requested.materialId?.trim() ?? "";
    if (!requestedId) throw new ProjectMaterialUpdateError("Material ID is required.", 422);
    const material = catalog.materials.find((item) => item.id === requestedId);
    if (!material) throw new ProjectMaterialUpdateError(`Material ${requestedId} does not exist.`, 422);
    if (!material.isActive) throw new ProjectMaterialUpdateError(`Material ${requestedId} is inactive.`, 422);
    if (!isMaterialAllowedForCategory(material, requested.category)) {
      throw new ProjectMaterialUpdateError(`Material ${requestedId} is not valid for ${definition.label}.`, 422);
    }
    const edgeFront = authoritativeEdge(requested.edgeFrontId, "edge_front", catalog, now);
    const edgeOther = authoritativeEdge(requested.edgeOtherId, "edge_other", catalog, now);
    const thicknessMm = requested.thicknessMm ?? material.defaultThicknessMm;
    return {
      assignmentId: requested.assignmentId,
      category: requested.category,
      ...(requested.variantKey ? { variantKey: requested.variantKey } : {}),
      kind: "material",
      materialId: material.id,
      ...(edgeFront ? { edgeFrontId: edgeFront.id } : {}),
      ...(edgeOther ? { edgeOtherId: edgeOther.id } : {}),
      thicknessMm,
      customValues: structuredClone(requested.customValues),
      source: "user",
      snapshots: {
        material: snapshot(material, catalog, now),
        ...(edgeFront ? { edgeFront: edgeFront.snapshot } : {}),
        ...(edgeOther ? { edgeOther: edgeOther.snapshot } : {})
      },
      updatedAt: now
    };
  }

  const requestedId = requested.componentId?.trim() ?? "";
  if (!requestedId) throw new ProjectMaterialUpdateError("Component ID is required.", 422);
  const component = catalog.components.find((item) => item.id === requestedId);
  if (!component) throw new ProjectMaterialUpdateError(`Component ${requestedId} does not exist.`, 422);
  if (!component.isActive) throw new ProjectMaterialUpdateError(`Component ${requestedId} is inactive.`, 422);
  if (!isComponentAllowedForCategory(component, requested.category)) {
    throw new ProjectMaterialUpdateError(`Component ${requestedId} is not valid for ${definition.label}.`, 422);
  }
  return {
    assignmentId: requested.assignmentId,
    category: requested.category,
    ...(requested.variantKey ? { variantKey: requested.variantKey } : {}),
    kind: "component",
    componentId: component.id,
    customValues: structuredClone(requested.customValues),
    source: "user",
    snapshots: { component: snapshot(component, catalog, now) },
    updatedAt: now
  };
}

function updatedState(
  current: ProjectMaterialAssignmentsState,
  requested: ProjectMaterialAssignment,
  expectedRevision: unknown,
  catalog: ClientCatalog,
  now: string
): ProjectMaterialAssignmentsState {
  if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new ProjectMaterialUpdateError("A valid material assignment revision is required.", 409);
  }
  if (current.revision !== expectedRevision) {
    throw new ProjectMaterialUpdateError("Material assignments changed in another session. Reload and try again.", 409);
  }
  const nextAssignment = authoritativeAssignment(requested, catalog, now);
  const assignments = current.assignments.filter((item) => item.assignmentId !== nextAssignment.assignmentId);
  assignments.push(nextAssignment);
  const state: ProjectMaterialAssignmentsState = {
    schemaVersion: PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION,
    initialized: true,
    revision: current.revision + 1,
    assignments,
    updatedAt: now
  };
  validateProjectMaterialAssignmentsState(state);
  return state;
}

const MATERIAL_CATEGORIES = new Set<MaterialAssignmentCategory>(
  MATERIAL_ASSIGNMENT_CATEGORIES.map((definition) => definition.category)
);

type ProjectMaterialCopyTarget = Pick<ProjectMaterialScopeItem, "id" | "category" | "variantKey"> & { scopeId: string };

function copyTarget(value: unknown): ProjectMaterialCopyTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectMaterialUpdateError("Material copy target is required.", 400, "INVALID_MATERIAL_COPY_REQUEST");
  }
  const target = value as Record<string, unknown>;
  const scopeId = typeof target.scopeId === "string" ? target.scopeId.trim() : "";
  const id = typeof target.itemId === "string" ? target.itemId.trim() : "";
  const category = target.category;
  const variantKey = typeof target.variantKey === "string" ? target.variantKey.trim() : undefined;
  if (!scopeId || !id || typeof category !== "string" || !MATERIAL_CATEGORIES.has(category as MaterialAssignmentCategory)) {
    throw new ProjectMaterialUpdateError("Material copy target is invalid.", 400, "INVALID_MATERIAL_COPY_REQUEST");
  }
  return { scopeId, id, category: category as MaterialAssignmentCategory, ...(variantKey ? { variantKey } : {}) };
}

function validateCopyCompatibility(
  source: ProjectMaterialAssignment,
  category: MaterialAssignmentCategory
): void {
  const definition = source.kind === "material"
    ? source.snapshots.material?.definition
    : source.snapshots.component?.definition;
  const compatible = definition?.entityType === "material"
    ? isMaterialAllowedForCategory(definition, category)
    : definition?.entityType === "component"
      ? isComponentAllowedForCategory(definition, category)
      : false;
  if (!compatible) {
    throw new ProjectMaterialUpdateError(
      "Source material is not compatible with the selected project item.",
      422,
      "INCOMPATIBLE_MATERIAL_COPY"
    );
  }
}

function copiedAssignmentIsUnchanged(
  existing: ProjectMaterialAssignment | undefined,
  copied: ProjectMaterialAssignment
): boolean {
  if (!existing) return false;
  return JSON.stringify(existing) === JSON.stringify({ ...copied, updatedAt: existing.updatedAt });
}

function copiedState(
  current: ProjectMaterialAssignmentsState,
  save: ProjectSaveFile,
  catalog: ClientCatalog,
  operation: Record<string, unknown>,
  expectedRevision: unknown,
  now: string
): { state: ProjectMaterialAssignmentsState; changed: boolean } {
  if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new ProjectMaterialUpdateError("A valid material assignment revision is required.", 409, "PROJECT_MATERIAL_REVISION_CONFLICT");
  }
  if (current.revision !== expectedRevision) {
    throw new ProjectMaterialUpdateError("Material assignments changed in another session. Reload and try again.", 409, "PROJECT_MATERIAL_REVISION_CONFLICT");
  }
  const sourceAssignmentId = typeof operation.sourceAssignmentId === "string" ? operation.sourceAssignmentId.trim() : "";
  if (!sourceAssignmentId) {
    throw new ProjectMaterialUpdateError("Source assignment is required.", 400, "INVALID_MATERIAL_COPY_REQUEST");
  }
  const source = current.assignments.find((assignment) => assignment.assignmentId === sourceAssignmentId);
  if (!source) {
    throw new ProjectMaterialUpdateError("Source assignment was not found in this project.", 422, "SOURCE_ASSIGNMENT_NOT_FOUND");
  }
  const target = copyTarget(operation.target);
  const scope = resolveProjectMaterialScopes(save, catalog).find((candidate) => candidate.id === target.scopeId);
  const scopeItem = scope?.items.find((item) => item.id === target.id && item.category === target.category);
  if (!scope || !scopeItem) {
    throw new ProjectMaterialUpdateError("The selected project item no longer exists.", 422, "STALE_MATERIAL_TARGET");
  }
  validateCopyCompatibility(source, target.category);
  const copied = copyProjectMaterialAssignmentToScope(source, target.scopeId, scopeItem, now);
  const existing = current.assignments.find((assignment) => assignment.assignmentId === copied.assignmentId);
  if (copiedAssignmentIsUnchanged(existing, copied)) return { state: current, changed: false };
  const state: ProjectMaterialAssignmentsState = {
    schemaVersion: PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION,
    initialized: true,
    revision: current.revision + 1,
    assignments: [...current.assignments.filter((assignment) => assignment.assignmentId !== copied.assignmentId), copied],
    updatedAt: now
  };
  validateProjectMaterialAssignmentsState(state);
  return { state, changed: true };
}

export async function handleProjectMaterialsApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: ProjectMaterialsEndpointDeps
): Promise<boolean> {
  const route = parseRoute(url.pathname);
  if (!route) return false;
  const ctx = await deps.getContext(clientSessionHeaderFromRequest(req));
  if (req.method === "PUT" && ctx.role === "viewer") {
    deps.sendJson(res, 403, { ok: false, error: "Viewer role cannot change project materials." });
    return true;
  }
  const projectRepository = createServerProjectRepository({ projectRoot: deps.projectRoot });
  const catalog = await createServerCatalogRepository(deps.projectRoot).ensureCatalogExists(ctx);
  const { save, state: current } = await loadNormalizedProjectState(ctx, route.projectId, projectRepository, catalog);

  if (req.method === "GET" && route.action === "materials") {
    deps.sendJson(res, 200, { ok: true, view: projectMaterialsView(save, current, catalog) });
    return true;
  }

  if (req.method === "GET" && route.action === "warnings") {
    deps.sendJson(res, 200, { ok: true, warnings: projectMaterialsView(save, current, catalog).warnings });
    return true;
  }

  if (req.method === "POST" && route.action === "validate") {
    const body = bodyRecord(await deps.readJsonBody(req));
    const candidate = body.assignments ?? body.state ?? current;
    try {
      validateProjectMaterialAssignmentsState(candidate, "request material assignments");
    } catch (error) {
      deps.sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : "Invalid material assignments." });
      return true;
    }
    deps.sendJson(res, 200, { ok: true, warnings: projectMaterialsView(save, candidate, catalog).warnings });
    return true;
  }

  if (req.method === "PUT" && route.action === "materials") {
    const body = bodyRecord(await deps.readJsonBody(req));
    const assignment = body.assignment;
    const operation = body.operation;
    const revision = body.revision;
    const copyOperation = operation && typeof operation === "object" && !Array.isArray(operation)
      && (operation as Record<string, unknown>).type === "copy_assignment"
      ? operation as Record<string, unknown>
      : null;
    if (!copyOperation && (!assignment || typeof assignment !== "object" || Array.isArray(assignment))) {
      deps.sendJson(res, 400, { ok: false, code: "INVALID_MATERIAL_REQUEST", error: "assignment or copy_assignment operation is required." });
      return true;
    }
    if (!copyOperation) {
      const structuralCandidate: ProjectMaterialAssignmentsState = {
        schemaVersion: PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION,
        initialized: true,
        revision: current.revision,
        assignments: [assignment as ProjectMaterialAssignment]
      };
      try {
        validateProjectMaterialAssignmentsState(structuralCandidate, "request assignment");
      } catch (error) {
        deps.sendJson(res, 400, { ok: false, code: "INVALID_MATERIAL_REQUEST", error: error instanceof Error ? error.message : "Invalid material assignment." });
        return true;
      }
    }
    try {
      const result = copyOperation
        ? copiedState(current, save, catalog, copyOperation, revision, new Date().toISOString())
        : { state: updatedState(current, assignment as ProjectMaterialAssignment, revision, catalog, new Date().toISOString()), changed: true };
      if (!result.changed) {
        deps.sendJson(res, 200, { ok: true, view: projectMaterialsView(save, current, catalog) });
        return true;
      }
      const saved = await projectRepository.updateProjectMaterialAssignments(
        ctx,
        save.projectId,
        save.activePhaseId,
        current.revision,
        result.state
      );
      deps.sendJson(res, 200, {
        ok: true,
        view: projectMaterialsView(saved, saved.appState.materialAssignments, catalog)
      });
    } catch (error) {
      if (error instanceof ProjectMaterialRevisionConflictError) {
        deps.sendJson(res, 409, { ok: false, error: error.message });
        return true;
      }
      if (error instanceof ProjectMaterialUpdateError) {
        deps.sendJson(res, error.status, { ok: false, code: error.code, revision: current.revision, error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  return false;
}
